import { LOCAL_FIREBASE } from "../src/lib/emulator-config";
import { cert } from "firebase-admin/app";
import { generateKeyPairSync } from "node:crypto";

export function assertEmulatorEnvironment(env: NodeJS.ProcessEnv = process.env) {
  if (
    env["WORKFLOW_EMULATOR_MODE"] !== "1" ||
    env["GOOGLE_CLOUD_PROJECT"] !== LOCAL_FIREBASE.projectId ||
    env["GCLOUD_PROJECT"] !== LOCAL_FIREBASE.projectId ||
    env["FIRESTORE_EMULATOR_HOST"] !== LOCAL_FIREBASE.firestoreHost ||
    env["FIREBASE_AUTH_EMULATOR_HOST"] !== LOCAL_FIREBASE.authHost
  ) {
    throw new Error("Modo local bloqueado: proyecto o emuladores distintos de demo-sanicenter.");
  }
  if (env["GOOGLE_APPLICATION_CREDENTIALS"])
    throw new Error("Modo local: no se admiten credenciales de producción.");
}
export async function requireEmulators() {
  assertEmulatorEnvironment();
  const [auth, firestore] = await Promise.all([
    fetch(
      `http://${LOCAL_FIREBASE.authHost}/emulator/v1/projects/${LOCAL_FIREBASE.projectId}/config`,
      { signal: AbortSignal.timeout(2000) },
    ),
    fetch(
      `http://${LOCAL_FIREBASE.firestoreHost}/v1/projects/${LOCAL_FIREBASE.projectId}/databases/(default)/documents/__health/probe`,
      { headers: { Authorization: "Bearer owner" }, signal: AbortSignal.timeout(2000) },
    ),
  ]);
  if (!auth.ok || ![200, 404].includes(firestore.status))
    throw new Error(
      `Emuladores no disponibles (Auth ${auth.status}, Firestore ${firestore.status}); operación local bloqueada.`,
    );
}
// Synthetic, ephemeral server-only identity: never reads ambient production credentials.
// Admin Firestore requires a cert/ADC credential object even when using its emulator.
export function localCredential() {
  assertEmulatorEnvironment();
  return syntheticCredential();
}
export function securityEmulatorCredential() {
  if (
    process.env["GCLOUD_PROJECT"] !== "demo-sanicenter" ||
    process.env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095" ||
    process.env["GOOGLE_APPLICATION_CREDENTIALS"]
  )
    throw new Error("Credencial disponible únicamente para el emulador aislado.");
  return syntheticCredential();
}
function syntheticCredential() {
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  const credential = cert({
    projectId: LOCAL_FIREBASE.projectId,
    clientEmail: "emulator@demo-sanicenter.iam.gserviceaccount.com",
    privateKey,
  });
  // Fail closed if an SDK ever asks this fake identity to call Google's OAuth service.
  credential.getAccessToken = async () => {
    throw new Error("El entorno local no puede solicitar credenciales a Google.");
  };
  return credential;
}
