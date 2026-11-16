import { getApps, initializeApp } from "firebase-admin/app";
import { localCredential, requireEmulators } from "./emulator-safety";
import {
  PolicyError,
  runtimePolicy as realPolicy,
  requireWorkflowAccess as realAccess,
  initializeRuntime as realInitialize,
} from "./runtime-production";
export { PolicyError } from "./runtime-production";

// Development adapter only. Netlify builds resolve this module to runtime-production.ts.
export function runtimePolicy(env: NodeJS.ProcessEnv = process.env) {
  if (env["WORKFLOW_EMULATOR_MODE"] !== "1") return realPolicy(env);
  return {
    local: true,
    writeMode: "enabled" as const,
    origin: "http://127.0.0.1:8080",
  };
}
export function requireWorkflowAccess(env: NodeJS.ProcessEnv = process.env) {
  if (env["WORKFLOW_EMULATOR_MODE"] !== "1") return realAccess(env);
}
export async function initializeRuntime() {
  if (process.env["WORKFLOW_EMULATOR_MODE"] !== "1") return realInitialize();
  await requireEmulators();
  if (!getApps().length)
    initializeApp({ projectId: "demo-sanicenter", credential: localCredential() });
  if (getApps()[0]!.options.projectId !== "demo-sanicenter")
    throw new PolicyError("La instancia Firebase no corresponde al entorno autorizado.");
  return runtimePolicy();
}
