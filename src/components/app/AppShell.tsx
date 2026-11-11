import { Link, useNavigate } from "@tanstack/react-router";
import {
  CalendarClock,
  ClipboardCheck,
  Clock,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { auth, useCurrentUser, useStore } from "@/services/store";
import {
  financialWritesEnabled,
  isEmulatorMode,
  isRealFirebaseEnabled,
} from "@/lib/emulator-config";
import type { Role } from "@/types";

const NAV: {
  to: "/horas" | "/compensaciones" | "/solicitudes" | "/resumen" | "/admin" | "/dashboard";
  label: string;
  icon: typeof Clock;
  roles: Role[];
}[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["jefe", "admin"] },
  { to: "/horas", label: "Mis horas extras", icon: Clock, roles: ["trabajador"] },
  {
    to: "/compensaciones",
    label: "Mis compensaciones",
    icon: CalendarClock,
    roles: ["trabajador"],
  },
  { to: "/horas", label: "Horas extras", icon: Clock, roles: ["jefe", "admin"] },
  {
    to: "/solicitudes",
    label: "Solicitudes pendientes",
    icon: ClipboardCheck,
    roles: ["jefe", "admin"],
  },
  {
    to: "/resumen",
    label: "Resumen",
    icon: LayoutDashboard,
    roles: ["trabajador", "jefe", "admin"],
  },
  { to: "/admin", label: "Administración", icon: ShieldCheck, roles: ["admin"] },
];
export const ROLE_LABEL: Record<Role, string> = {
  trabajador: "Trabajador",
  jefe: "Jefe",
  admin: "Administrador",
};

export function AppShell({
  title,
  subtitle,
  roles,
  children,
}: {
  title: string;
  subtitle?: string;
  roles?: Role[];
  children: ReactNode;
}) {
  const user = useCurrentUser();
  const authLoading = useStore().authLoading;
  const dataError = useStore().dataError;
  const navigate = useNavigate();

  const allowed = user && (!roles || roles.includes(user.role));

  useEffect(() => {
    if (!authLoading && !user) {
      void navigate({ to: "/" });
    }
  }, [authLoading, user, navigate]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted-foreground">Verificando sesión...</p>
      </div>
    );
  }

  if (!user) return null;
  const items = NAV.filter((n) => n.roles.includes(user.role));
  return (
    <div className="min-h-screen bg-background">
      {isEmulatorMode && (
        <div className="bg-secondary px-4 py-1 text-center text-xs text-primary">
          Entorno local de pruebas · Datos ficticios
        </div>
      )}
      {!isEmulatorMode && isRealFirebaseEnabled && !financialWritesEnabled && (
        <div className="bg-secondary px-4 py-1 text-center text-xs text-primary">
          Firebase real · Operaciones financieras bloqueadas hasta su activación
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <div className="flex items-center gap-2 font-bold">
            <img
              src="/logo.png"
              alt="Logotipo de Sanicenter"
              className="h-14 w-14 shrink-0 rounded-xl object-cover"
            />
            <span className="hidden sm:inline">
              <span className="text-primary">Horas Extras</span>
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground">{ROLE_LABEL[user.role]}</div>
            </div>
            <button
              className="btn-ghost px-2.5"
              onClick={() => auth.signOut()}
              aria-label="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {items.map((n) => (
            <Link
              key={n.label}
              to={n.to}
              className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-secondary hover:text-secondary-foreground"
              activeProps={{ className: "bg-secondary font-semibold text-secondary-foreground" }}
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        {dataError && (
          <p
            role="alert"
            className="mb-4 rounded-lg bg-destructive-soft p-3 text-sm text-destructive"
          >
            {dataError}
          </p>
        )}
        {allowed ? children : <Empty text="No tienes acceso a esta sección con tu rol actual." />}
      </main>
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted px-4 py-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
