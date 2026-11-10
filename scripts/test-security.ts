import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
const env: NodeJS.ProcessEnv = {
  ...process.env,
  DEBUG: "",
  GCLOUD_PROJECT: "demo-sanicenter",
  GOOGLE_CLOUD_PROJECT: "demo-sanicenter",
};
delete env["GOOGLE_APPLICATION_CREDENTIALS"];
delete env["FIREBASE_SERVICE_ACCOUNT_JSON"];
const javaHome = env["JAVA_HOME"] || "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8.9-hotspot";
if (existsSync(path.join(javaHome, "bin"))) {
  env["JAVA_HOME"] = javaHome;
  env["PATH"] = `${path.join(javaHome, "bin")}${path.delimiter}${env["PATH"] || env["Path"] || ""}`;
}
const child = spawn(
  process.execPath,
  [
    "node_modules/firebase-tools/lib/bin/firebase.js",
    "emulators:exec",
    "--config",
    "firebase.security.json",
    "--project",
    "demo-sanicenter",
    "--only",
    "firestore",
    "node node_modules/vitest/vitest.mjs run --config vitest.security.config.ts",
  ],
  { env, stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
process.on("SIGINT", () => child.kill());
