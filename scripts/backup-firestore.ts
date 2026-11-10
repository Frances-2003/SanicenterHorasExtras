import { createRequire } from "node:module";
import { resolve, relative, isAbsolute } from "node:path";
import { writeFileSync, readFileSync, statSync } from "node:fs";
import {
  FirestoreReadClient,
  consistentLogicalBackup,
  encryptBackup,
  decryptBackup,
  restoreOnlyToEmulator,
} from "../server/logical-backup";

// Never run this automatically during build/deploy. Production export requires explicit read acknowledgement.
const args = process.argv.slice(2);
const passphrase = process.env["BACKUP_PASSPHRASE"] || "";
try {
  if (
    args[0] === "export" &&
    args.includes("--ack-read-only-sanicenterdb") &&
    args.includes("--writers-paused")
  ) {
    const outputArg = args[args.indexOf("--out") + 1];
    if (!args.includes("--out") || !outputArg || passphrase.length < 20)
      throw new Error("Faltan destino externo y frase segura del respaldo.");
    const output = resolve(outputArg),
      within = relative(process.cwd(), output);
    if (
      !isAbsolute(outputArg) ||
      (!within.startsWith("..") && !isAbsolute(within)) ||
      !output.endsWith(".scbackup")
    )
      throw new Error("Guardar el respaldo .scbackup fuera del repositorio y de sitios públicos.");
    const require = createRequire(import.meta.url);
    require("../node_modules/firebase-tools/lib/logger.js").logger.silent = true;
    const auth = require("../node_modules/firebase-tools/lib/auth.js");
    const account = auth.getGlobalDefaultAccount();
    if (!account) throw new Error("Se necesita una sesión de lectura autorizada de Firebase CLI.");
    const client = new FirestoreReadClient(
      "sanicenterdb",
      "https://firestore.googleapis.com",
      async () =>
        (
          await auth.getAccessToken(account.tokens.refresh_token, [
            "https://www.googleapis.com/auth/cloud-platform",
          ])
        ).access_token,
    );
    const backup = await consistentLogicalBackup(client);
    writeFileSync(output, encryptBackup(backup, passphrase), { flag: "wx", mode: 0o600 });
    console.log(
      JSON.stringify({
        encrypted: true,
        documents: backup.records.filter((d) => d.exists).length,
        verifiedTwoPasses: true,
      }),
    );
  } else if (args[0] === "restore-emulator" && args[1]) {
    if (statSync(args[1]).size > 64 * 1024 * 1024) throw new Error("Respaldo demasiado grande.");
    const backup = decryptBackup(readFileSync(args[1], "utf8"), passphrase);
    console.log(JSON.stringify(await restoreOnlyToEmulator(backup)));
  } else
    throw new Error(
      "Uso: export --ack-read-only-sanicenterdb --writers-paused --out RUTA_ABSOLUTA.scbackup | restore-emulator ARCHIVO.scbackup. Nunca restaura en producción.",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Respaldo cancelado.");
  process.exitCode = 1;
}
