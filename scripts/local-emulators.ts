import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const env = {
  ...process.env,
  WORKFLOW_EMULATOR_MODE: "1",
  GOOGLE_CLOUD_PROJECT: "demo-sanicenter",
  GCLOUD_PROJECT: "demo-sanicenter",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  DEBUG: "",
};
// Do not pass production credentials to emulator child processes.
delete env["GOOGLE_APPLICATION_CREDENTIALS" as keyof typeof env];
delete (env as NodeJS.ProcessEnv)["FIREBASE_SERVICE_ACCOUNT_JSON"];
const javaHome =
  process.env["JAVA_HOME"] || "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.8.9-hotspot";
if (existsSync(path.join(javaHome, "bin", process.platform === "win32" ? "java.exe" : "java"))) {
  Object.assign(env, {
    JAVA_HOME: javaHome,
    PATH: `${path.join(javaHome, "bin")}${path.delimiter}${process.env["PATH"] || process.env["Path"] || ""}`,
  });
}
const child = spawn(
  process.execPath,
  [
    "node_modules/firebase-tools/lib/bin/firebase.js",
    "emulators:exec",
    "--project",
    "demo-sanicenter",
    "--only",
    "auth,firestore",
    "node --import tsx scripts/local-services.ts",
  ],
  { env, stdio: "inherit", windowsHide: true },
);
child.on("exit", (code) => process.exit(code || 0));
process.on("SIGINT", () => child.kill());
process.on("SIGTERM", () => child.kill());
