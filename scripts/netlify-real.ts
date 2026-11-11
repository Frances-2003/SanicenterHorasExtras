import { spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

// No IAM calls, key generation, Firebase writes or deployment commands in this launcher.
const args = process.argv.slice(2);
const real = args.includes("--start-real");
if (args.includes("--check")) {
  console.log(
    "sanicenterdb | Netlify Dev http://localhost:8888 | inicio real requiere credencial externa y --authorize-real-writes | alcance JBERNALES/JPAREDES",
  );
  process.exit(0);
}
if (!real && !args.includes("--locked"))
  throw new Error(
    "Usa --check, --locked o --start-real --authorize-real-writes --credential-file RUTA_EXTERNA.",
  );
if (real && !args.includes("--authorize-real-writes"))
  throw new Error("Se requiere autorización explícita de escrituras reales.");
for (const key of ["FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])
  if (process.env[key]) throw new Error("No mezclar emuladores con el backend real.");
const clean: NodeJS.ProcessEnv = { ...process.env };
for (const key of [
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "WORKFLOW_EMULATOR_MODE",
  "WORKFLOW_LOCAL_REAL_ENABLED",
  "NETLIFY_DEV",
])
  delete clean[key];
Object.assign(clean, {
  CONTEXT: "production",
  WORKFLOW_PRODUCTION_ENABLED: "false",
  WORKFLOW_WRITE_MODE: "disabled",
  VITE_REAL_FIREBASE_ENABLED: "true",
  VITE_REAL_FINANCIAL_WRITES_ENABLED: String(real),
  VITE_WORKFLOW_API_URL: "",
});
let credential: string | undefined;
if (real) {
  const index = args.indexOf("--credential-file");
  const file = index >= 0 ? args[index + 1] : undefined;
  if (!file || !isAbsolute(file))
    throw new Error("La credencial debe ser un archivo privado externo con ruta absoluta.");
  const within = relative(process.cwd(), resolve(file));
  if (!within.startsWith("..") && !isAbsolute(within))
    throw new Error("No guardar credenciales en el repositorio.");
  credential = readFileSync(file, "utf8");
  try {
    const parsed = JSON.parse(credential);
    if (
      parsed.type !== "service_account" ||
      parsed.project_id !== "sanicenterdb" ||
      parsed.client_email !== "sanicenter-workflow@sanicenterdb.iam.gserviceaccount.com" ||
      !parsed.private_key
    )
      throw new Error();
  } catch {
    throw new Error("Credencial dedicada de sanicenterdb ausente o inválida.");
  }
}
// Build never receives the server credential. The production build is served, not npm run dev.
const built = spawnSync(process.execPath, ["scripts/build-netlify.mjs"], {
  env: clean,
  stdio: "inherit",
  windowsHide: true,
});
if (built.status !== 0 || built.error) process.exit(built.status || 1);
const env: NodeJS.ProcessEnv = {
  ...clean,
  CONTEXT: "dev",
  GOOGLE_CLOUD_PROJECT: "sanicenterdb",
  APP_ORIGIN: "http://localhost:8888",
  WORKFLOW_LOCAL_REAL_ENABLED: "true",
  WORKFLOW_PRODUCTION_ENABLED: String(real),
  WORKFLOW_WRITE_MODE: real ? "pilot" : "disabled",
  WORKFLOW_ALLOWED_ACTOR_UIDS: "C38Dt66KTGfhbuWeQxJ3KBhpUrI2,FN4okTXow4hI44MH8gBNBXymLW72",
  WORKFLOW_ALLOWED_WORKER_UIDS: "C38Dt66KTGfhbuWeQxJ3KBhpUrI2",
  BROWSER: "none",
  NODE_OPTIONS: "--experimental-require-module",
};
const localFunctions = resolve(".netlify", "local-real", String(Date.now()), "functions");
mkdirSync(localFunctions, { recursive: true });
cpSync(".netlify/functions-prepared/workflow.mjs", resolve(localFunctions, "workflow.mjs"));
cpSync(".netlify/functions-internal/server", resolve(localFunctions, "server"), {
  recursive: true,
});
if (credential) env["FIREBASE_SERVICE_ACCOUNT_JSON"] = credential;
const npmCli = process.env["npm_execpath"];
if (!npmCli) throw new Error("Iniciar mediante npm.cmd run netlify:real.");
console.log(
  real
    ? "Operaciones REALES autorizadas: JBERNALES y JPAREDES. http://localhost:8888"
    : "Backend bloqueado, sin credenciales: http://localhost:8888",
);
const child = spawn(
  process.execPath,
  [
    resolve(dirname(npmCli), "npx-cli.js"),
    "--yes",
    "--offline",
    "netlify-cli@27.17.0",
    "dev",
    "--offline",
    "--context",
    "dev",
    "--framework",
    "#static",
    "--dir",
    "dist",
    "--functions",
    localFunctions,
    "--port",
    "8888",
    "--geo",
    "mock",
    "--no-open",
  ],
  { env, stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
