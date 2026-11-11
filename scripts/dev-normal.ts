import { spawn } from "node:child_process";
import { loadEnv } from "vite";

// Explicit local login mode. Never starts or enables the financial backend.
const publicEnv = loadEnv("development", process.cwd(), "VITE_");
if (publicEnv["VITE_FIREBASE_PROJECT_ID"] !== "sanicenterdb")
  throw new Error("El modo normal requiere VITE_FIREBASE_PROJECT_ID=sanicenterdb.");
for (const key of ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_APP_ID"]) {
  if (!publicEnv[key]?.trim()) throw new Error(`Falta configuración pública: ${key}.`);
}
const env: NodeJS.ProcessEnv = {
  ...process.env,
  VITE_REAL_FIREBASE_ENABLED: "true",
  VITE_REAL_FINANCIAL_WRITES_ENABLED: "false",
  WORKFLOW_PRODUCTION_ENABLED: "false",
  WORKFLOW_WRITE_MODE: "disabled",
};
for (const key of [
  "WORKFLOW_EMULATOR_MODE",
  "FIRESTORE_EMULATOR_HOST",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
  "GOOGLE_APPLICATION_CREDENTIALS",
])
  delete env[key];
console.log(
  "Modo normal: Authentication sanicenterdb | escrituras financieras bloqueadas | http://localhost:8081",
);
if (!process.argv.includes("--check")) {
  const child = spawn(
    process.execPath,
    [
      "node_modules/vite/bin/vite.js",
      "dev",
      "--mode",
      "development",
      "--host",
      "127.0.0.1",
      "--port",
      "8081",
      "--strictPort",
    ],
    { env, stdio: "inherit", windowsHide: true },
  );
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
  process.on("SIGINT", () => child.kill());
  process.on("SIGTERM", () => child.kill());
}
