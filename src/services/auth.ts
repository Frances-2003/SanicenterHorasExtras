import type { Role, User } from "../types";

/** Primary area remains authorized; optional additional areas support existing profiles. */
export function authorizedAreasOf(user: User): string[] {
  const additional = Array.isArray(user.authorizedAreas) ? user.authorizedAreas : [];
  return [
    ...new Set(
      [user.area, ...additional].filter(
        (area): area is string => typeof area === "string" && area.length > 0,
      ),
    ),
  ];
}
export function canManageArea(user: User, area: string): boolean {
  return (
    user.active &&
    (user.role === "admin" || (user.role === "jefe" && authorizedAreasOf(user).includes(area)))
  );
}

/**
 * Permisos y reglas de autorización centralizadas del sistema Sani Center Horas Extras.
 *
 * NOTA PARA INTEGRACIÓN CON FIREBASE:
 * Esta capa prepara la integración futura con Firebase Authentication y Cloud Firestore.
 * Los UIDs de Firebase Auth se mapearán a los documentos de usuario en Firestore (/users/{uid}).
 * Las funciones siguientes determinan los accesos en el cliente, y deberán replicarse
 * en las Reglas de Seguridad de Firestore (firestore.rules) para protección a nivel backend.
 */

export const ROLE_LABELS: Record<Role, string> = {
  trabajador: "Trabajador",
  jefe: "Jefe",
  admin: "Administrador",
};

export function canRegisterOvertime(user: User | null): boolean {
  return !!user && user.active && user.role === "trabajador";
}

export function canRequestCompensation(user: User | null): boolean {
  return !!user && user.active && user.role === "trabajador";
}

export function canReviewCompensation(user: User | null): boolean {
  return !!user && user.active && (user.role === "jefe" || user.role === "admin");
}

export function canVoidOvertime(user: User | null): boolean {
  return !!user && user.active && (user.role === "jefe" || user.role === "admin");
}

export function canManageUsers(user: User | null): boolean {
  return !!user && user.active && user.role === "admin";
}

export function canViewTeamRecords(user: User | null): boolean {
  return !!user && user.active && (user.role === "jefe" || user.role === "admin");
}

export function hasRouteAccess(role: Role, route: string): boolean {
  switch (route) {
    case "/horas":
      return true; // Todos acceden, la vista se adapta según el rol
    case "/compensaciones":
      return role === "trabajador";
    case "/solicitudes":
    case "/dashboard":
      return role === "jefe" || role === "admin";
    case "/resumen":
      return true; // Todos acceden, trabajador ve sus datos y jefe/admin el equipo
    case "/admin":
      return role === "admin";
    default:
      return false;
  }
}
