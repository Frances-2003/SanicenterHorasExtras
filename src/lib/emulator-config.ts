// Deliberately fixed: local testing must never inherit the real project's .env.local values.
export const LOCAL_FIREBASE = {
  projectId: "demo-sanicenter",
  authHost: "127.0.0.1:9099",
  firestoreHost: "127.0.0.1:8085",
  apiHost: "127.0.0.1",
  apiPort: 8788,
  webPort: 8080,
} as const;
export const isEmulatorMode = import.meta.env?.MODE === "emulator";
export const isRealFirebaseEnabled = import.meta.env?.["VITE_REAL_FIREBASE_ENABLED"] === "true";

export async function requireLocalServices() {
  if (!isEmulatorMode) {
    if (!isRealFirebaseEnabled)
      throw new Error("La conexión con Firebase real todavía no está habilitada.");
    return;
  }
  try {
    const response = await fetch("/api/local-health", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const health = await response.json();
    if (!response.ok || health.projectId !== LOCAL_FIREBASE.projectId || health.emulators !== true)
      throw new Error();
  } catch {
    throw new Error(
      "Entorno local detenido: se necesitan Authentication, Firestore y el servicio local. No se conectará a Firebase real.",
    );
  }
}
