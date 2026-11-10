import { cert, getApps, initializeApp } from "firebase-admin/app";
import { localCredential, requireEmulators } from "./emulator-safety";

export class PolicyError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export function runtimePolicy(env: NodeJS.ProcessEnv = process.env) {
  if (env["WORKFLOW_EMULATOR_MODE"] === "1")
    return {
      local: true,
      writeMode: "enabled" as const,
      actors: [] as string[],
      workers: [] as string[],
      origin: "http://127.0.0.1:8080",
    };
  if (env["WORKFLOW_PRODUCTION_ENABLED"] !== "true")
    throw new PolicyError("Servicio real deshabilitado hasta completar la activación autorizada.");
  if (
    env["GOOGLE_CLOUD_PROJECT"] !== "sanicenterdb" ||
    env["FIRESTORE_EMULATOR_HOST"] ||
    env["FIREBASE_AUTH_EMULATOR_HOST"]
  )
    throw new PolicyError("Configuración de entorno inconsistente.");
  if (env["CONTEXT"] && env["CONTEXT"] !== "production")
    throw new PolicyError("Los deploy previews no pueden acceder al proyecto real.");
  const origin = env["APP_ORIGIN"] || "";
  try {
    const url = new URL(origin);
    if (url.protocol !== "https:" || url.origin !== origin) throw new Error();
  } catch {
    throw new PolicyError("Configura APP_ORIGIN con el origen HTTPS exacto.");
  }
  const writeMode = env["WORKFLOW_WRITE_MODE"] || "disabled";
  if (!["disabled", "pilot", "enabled"].includes(writeMode))
    throw new PolicyError("Modo de escritura inválido.");
  const list = (key: string) =>
    (env[key] || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return {
    local: false,
    writeMode: writeMode as "disabled" | "pilot" | "enabled",
    origin,
    actors: list("WORKFLOW_ALLOWED_ACTOR_UIDS"),
    workers: list("WORKFLOW_ALLOWED_WORKER_UIDS"),
  };
}
export function requirePilotAccess(
  actorId: string,
  workerId?: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const policy = runtimePolicy(env);
  if (policy.writeMode === "disabled")
    throw new PolicyError("Las escrituras están deshabilitadas.", 503);
  if (
    policy.writeMode === "pilot" &&
    (!policy.actors.includes(actorId) ||
      (workerId !== undefined && !policy.workers.includes(workerId)))
  )
    throw new PolicyError("Operación fuera del alcance del piloto.", 403);
}
export async function initializeRuntime() {
  const policy = runtimePolicy();
  if (policy.local) await requireEmulators();
  if (!getApps().length) {
    if (policy.local)
      initializeApp({ projectId: "demo-sanicenter", credential: localCredential() });
    else {
      try {
        const secret = JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] || "{}");
        if (secret.project_id !== "sanicenterdb" || !secret.client_email || !secret.private_key)
          throw new Error();
        initializeApp({ projectId: "sanicenterdb", credential: cert(secret) });
      } catch {
        throw new PolicyError("Credencial exclusiva del servidor ausente o inválida.");
      }
    }
  }
  if (getApps()[0]!.options.projectId !== (policy.local ? "demo-sanicenter" : "sanicenterdb"))
    throw new PolicyError("La instancia Firebase no corresponde al entorno autorizado.");
  return policy;
}
