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
  if (!["disabled", "enabled"].includes(writeMode))
    throw new PolicyError(
      "Modo de escritura inválido: usa disabled o enabled. El modo pilot ya no se admite.",
    );
  return {
    local: false,
    writeMode: writeMode as "disabled" | "enabled",
    origin,
  };
}
/** Deployment switch only. Identity, active profile, role and area are checked by the endpoint/transaction. */
export function requireWorkflowAccess(env: NodeJS.ProcessEnv = process.env) {
  const policy = runtimePolicy(env);
  if (policy.writeMode === "disabled")
    throw new PolicyError("Las escrituras están deshabilitadas.");
}
export const WORKFLOW_SERVICE_ACCOUNT = "sanicenter-workflow@sanicenterdb.iam.gserviceaccount.com";
export function isWorkflowServiceAccount(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  return (
    account["type"] === "service_account" &&
    account["project_id"] === "sanicenterdb" &&
    account["client_email"] === WORKFLOW_SERVICE_ACCOUNT &&
    typeof account["private_key_id"] === "string" &&
    account["private_key_id"].trim().length > 0 &&
    typeof account["private_key"] === "string" &&
    account["private_key"].trim().length > 0
  );
}
export async function initializeRuntime() {
  const policy = runtimePolicy();
  if (!getApps().length) {
    try {
      const secret = JSON.parse(process.env["FIREBASE_SERVICE_ACCOUNT_JSON"] || "{}");
      if (!isWorkflowServiceAccount(secret)) throw new Error();
      initializeApp({ projectId: "sanicenterdb", credential: cert(secret) });
    } catch {
      throw new PolicyError("Credencial exclusiva del servidor ausente o inválida.");
    }
  }
  if (getApps()[0]!.options.projectId !== "sanicenterdb")
    throw new PolicyError("La instancia Firebase no corresponde al entorno autorizado.");
  return policy;
}
