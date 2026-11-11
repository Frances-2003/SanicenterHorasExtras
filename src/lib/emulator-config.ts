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
// A local login authorization never enables real financial operations.
export const financialWritesEnabled =
  isEmulatorMode ||
  (isRealFirebaseEnabled &&
    import.meta.env?.DEV !== true &&
    import.meta.env?.["VITE_REAL_FINANCIAL_WRITES_ENABLED"] === "true");
export const realFirebaseConfigurationError =
  !isEmulatorMode && isRealFirebaseEnabled
    ? import.meta.env?.["VITE_FIREBASE_PROJECT_ID"] !== "sanicenterdb"
      ? "Proyecto Firebase real distinto del autorizado."
      : ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_APP_ID"].some(
            (key) => !import.meta.env?.[key]?.trim(),
          )
        ? "Faltan campos de configuración pública de Firebase."
        : null
    : null;
export class EnvironmentAccessError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "EnvironmentAccessError";
  }
}

export async function requireLocalServices() {
  if (!isEmulatorMode) {
    if (!isRealFirebaseEnabled)
      throw new EnvironmentAccessError(
        "config/firebase-disabled",
        "La conexión con Firebase real todavía no está habilitada.",
      );
    if (realFirebaseConfigurationError)
      throw new EnvironmentAccessError("config/firebase-invalid", realFirebaseConfigurationError);
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
    throw new EnvironmentAccessError(
      "connection/emulators-unavailable",
      "Entorno local detenido: se necesitan Authentication, Firestore y el servicio local. No se conectará a Firebase real.",
    );
  }
}
