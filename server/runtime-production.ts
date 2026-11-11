import { cert, getApps, initializeApp } from "firebase-admin/app";

export class PolicyError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
// An operator must opt in on the local Netlify process; never a browser-supplied flag.
export function isAuthorizedLocalRuntime(env: NodeJS.ProcessEnv = process.env) {
  return (
    env["NETLIFY_DEV"] === "true" &&
    env["CONTEXT"] === "dev" &&
    env["WORKFLOW_LOCAL_REAL_ENABLED"] === "true" &&
    env["APP_ORIGIN"] === "http://localhost:8888"
  );
}
// Production has no imports, credentials or probes that depend on emulators.
export function runtimePolicy(env: NodeJS.ProcessEnv = process.env) {
  const localReal = isAuthorizedLocalRuntime(env);
  if (
    env["WORKFLOW_EMULATOR_MODE"] === "1" ||
    env["FIRESTORE_EMULATOR_HOST"] ||
    env["FIREBASE_AUTH_EMULATOR_HOST"]
  )
    throw new PolicyError("Los emuladores no están permitidos en el servicio de producción.");
  if (env["WORKFLOW_PRODUCTION_ENABLED"] !== "true")
    throw new PolicyError("Servicio real deshabilitado hasta completar la activación autorizada.");
  if (env["GOOGLE_CLOUD_PROJECT"] !== "sanicenterdb")
    throw new PolicyError("Configuración de entorno inconsistente.");
  if (env["CONTEXT"] && env["CONTEXT"] !== "production" && !localReal)
    throw new PolicyError("Los deploy previews no pueden acceder al proyecto real.");
  const origin = env["APP_ORIGIN"] || "";
  try {
    const url = new URL(origin);
    if ((!localReal && url.protocol !== "https:") || url.origin !== origin) throw new Error();
  } catch {
    throw new PolicyError("Configura APP_ORIGIN con el origen HTTPS exacto.");
  }
  const writeMode = env["WORKFLOW_WRITE_MODE"] || "disabled";
  if (!["disabled", "pilot", "enabled"].includes(writeMode))
    throw new PolicyError("Modo de escritura inválido.");
  if (localReal && writeMode !== "pilot" && writeMode !== "disabled")
    throw new PolicyError("La ejecución local real requiere alcance limitado por UID.");
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
    throw new PolicyError("Las escrituras están deshabilitadas.");
  if (
    policy.writeMode === "pilot" &&
    (!policy.actors.includes(actorId) ||
      (workerId !== undefined && !policy.workers.includes(workerId)))
  )
    throw new PolicyError("Operación fuera del alcance del piloto.", 403);
}
export async function initializeRuntime() {
  const policy = runtimePolicy();
  if (!getApps().length) {
    try {
      const secret = JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] || "{}");
      if (secret.project_id !== "sanicenterdb" || !secret.client_email || !secret.private_key)
        throw new Error();
      initializeApp({ projectId: "sanicenterdb", credential: cert(secret) });
    } catch {
      throw new PolicyError("Credencial exclusiva del servidor ausente o inválida.");
    }
  }
  if (getApps()[0]!.options.projectId !== "sanicenterdb")
    throw new PolicyError("La instancia Firebase no corresponde al entorno autorizado.");
  return policy;
}
