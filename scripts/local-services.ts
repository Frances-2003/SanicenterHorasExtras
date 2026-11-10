import { spawn } from "node:child_process";
import { initializeApp } from "firebase-admin/app";
import { localCredential, requireEmulators } from "../server/emulator-safety";
import { demoAccounts, demoPassword, seedLocalFixtures } from "../server/local-fixtures";

await requireEmulators();
initializeApp({ projectId: "demo-sanicenter", credential: localCredential() });
await seedLocalFixtures();
const childEnv = { ...process.env, VITE_WORKFLOW_API_URL: "" };
const api = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  stdio: "inherit",
  env: childEnv,
  windowsHide: true,
});
const web = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    "dev",
    "--mode",
    "emulator",
    "--host",
    "127.0.0.1",
    "--port",
    "8080",
    "--strictPort",
  ],
  { stdio: "inherit", env: childEnv, windowsHide: true },
);
console.log(
  `\nEntorno aislado: http://127.0.0.1:8080 | proyecto demo-sanicenter\nCuentas: ${demoAccounts.map((u) => u.username).join(", ")} | clave ficticia: ${demoPassword}\n`,
);
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  api.kill();
  web.kill();
  setTimeout(() => process.exit(code), 500);
}
api.on("exit", (code) => stop(code || 0));
web.on("exit", (code) => stop(code || 0));
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
