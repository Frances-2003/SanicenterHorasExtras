export function loginErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === "auth/api-key-not-valid.-please-pass-a-valid-api-key.") return code;
  return typeof code === "string" && /^(?:[a-z-]{1,30}\/)?[a-z-]{1,50}$/.test(code)
    ? code
    : "unknown";
}
export function loginErrorMessage(error: unknown): string {
  const code = loginErrorCode(error);
  if (code.startsWith("config/"))
    return "No se pudo iniciar sesión por un problema de configuración de Firebase. Revisa el modo de inicio y la configuración pública del proyecto.";
  if (
    code.startsWith("connection/") ||
    ["auth/network-request-failed", "unavailable", "deadline-exceeded"].includes(code)
  )
    return "No se pudo conectar con el servicio de inicio de sesión. Comprueba la conexión o que los emuladores estén disponibles.";
  if (
    [
      "auth/invalid-credential",
      "auth/invalid-login-credentials",
      "auth/wrong-password",
      "auth/user-not-found",
      "auth/invalid-email",
    ].includes(code)
  )
    return "No se pudo iniciar sesión: el usuario o la contraseña no son válidos.";
  if (
    [
      "auth/invalid-api-key",
      "auth/api-key-not-valid.-please-pass-a-valid-api-key.",
      "auth/app-not-authorized",
      "auth/unauthorized-domain",
      "auth/operation-not-allowed",
      "auth/configuration-not-found",
    ].includes(code)
  )
    return "La configuración de Firebase Authentication no permite iniciar sesión. Revisa el proyecto, la aplicación y el proveedor de acceso.";
  if (code === "auth/user-disabled")
    return "Esta cuenta está deshabilitada. Consulta con el administrador.";
  if (code === "auth/too-many-requests")
    return "Se realizaron demasiados intentos. Espera unos minutos antes de volver a ingresar.";
  if (["permission-denied", "unauthenticated"].includes(code))
    return "No se pudo consultar tu perfil en Firestore. Revisa los permisos de lectura; esto no confirma un error de contraseña.";
  return "No se pudo completar el inicio de sesión. Revisa el código de diagnóstico en la consola; no cambies tu contraseña por este mensaje.";
}
