import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/services/store";
import { ROLE_LABELS } from "@/services/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administración — Sani Center Horas Extras" },
      {
        name: "description",
        content: "Administración de usuarios y roles del equipo en Sani Center.",
      },
      { property: "og:title", content: "Administración — Sani Center Horas Extras" },
      { property: "og:description", content: "Gestión de usuarios y permisos del sistema." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { users } = useStore();
  return (
    <AppShell
      title="Administración"
      subtitle="Gestión de usuarios del equipo. En la siguiente etapa se conectará a Firebase Authentication y Cloud Firestore."
      roles={["admin"]}
    >
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="th">Nombre</th>
              <th className="th">Área</th>
              <th className="th">Rol</th>
              <th className="th">Estado</th>
              <th className="th text-right">Activo</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className="td font-medium">{u.name}</td>
                <td className="td">{u.area}</td>
                <td className="td">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {ROLE_LABELS[u.role]}
                  </span>
                </td>
                <td className="td text-xs">
                  {u.active ? (
                    <span className="font-semibold text-primary">Activo</span>
                  ) : (
                    <span className="font-semibold text-destructive">Inactivo</span>
                  )}
                </td>
                <td className="td text-right">
                  <Switch
                    checked={u.active}
                    disabled
                    aria-label={`Activar o desactivar ${u.name}`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
