import { createFileRoute } from "@tanstack/react-router";
import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Pager, StatusBadge, paginate } from "@/components/app/ui";
import { ReasonDialog } from "@/components/app/ReasonDialog";
import { reviewCompensation, useStore } from "@/services/store";
import { fmtDate, fmtMin } from "@/lib/time";
import type { CompStatus } from "@/types";

export const Route = createFileRoute("/solicitudes")({
  head: () => ({
    meta: [
      { title: "Solicitudes pendientes — Sani Center Horas Extras" },
      {
        name: "description",
        content: "Aprueba o rechaza las solicitudes de compensación del equipo en Sani Center.",
      },
      { property: "og:title", content: "Solicitudes pendientes — Sani Center Horas Extras" },
      {
        property: "og:description",
        content: "Panel de revisión y aprobación de compensaciones para jefatura.",
      },
    ],
  }),
  component: Solicitudes,
});

function Solicitudes() {
  const { comps, users, overtime } = useStore();
  const [tab, setTab] = useState<CompStatus | "todas">("pendiente");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<{ id: string; approve: boolean } | null>(null);

  const rows = useMemo(
    () =>
      comps
        .filter((c) => tab === "todas" || c.status === tab)
        .sort(
          (a, b) =>
            (tab === "pendiente" ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)) ||
            b.code.localeCompare(a.code),
        ),
    [comps, tab],
  );

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "—";
  const ot = (id: string) => overtime.find((o) => o.id === id);
  const target = comps.find((c) => c.id === action?.id);
  const count = (s: CompStatus) => comps.filter((c) => c.status === s).length;

  return (
    <AppShell
      title="Solicitudes de compensación"
      subtitle="Revisa, aprueba o rechaza los descansos compensatorios solicitados por el equipo."
      roles={["jefe", "admin"]}
    >
      <div className="mb-4 flex flex-wrap gap-1">
        {(["pendiente", "aprobada", "rechazada", "todas"] as const).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setPage(1);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm capitalize transition ${
              tab === t
                ? "bg-secondary font-semibold text-secondary-foreground"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t === "todas"
              ? "Todas"
              : t === "pendiente"
                ? "Pendientes"
                : t === "aprobada"
                  ? "Aprobadas"
                  : "Rechazadas"}
            {t !== "todas" && (
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.2 text-xs ${tab === t ? "bg-primary text-primary-foreground" : "bg-muted"}`}
              >
                {count(t)}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-4">
            <Empty text="No hay solicitudes en este estado para mostrar." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Trabajador</th>
                  <th className="th">Fecha y horario</th>
                  <th className="th">Horas descanso</th>
                  <th className="th">Motivo</th>
                  <th className="th">Horas extras de origen respaldadas</th>
                  <th className="th">Estado</th>
                  <th className="th text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {paginate(rows, page, 10).map((c) => (
                  <tr key={c.id}>
                    <td className="td font-mono text-xs">{c.code}</td>
                    <td className="td font-medium">{nameOf(c.workerId)}</td>
                    <td className="td whitespace-nowrap">
                      {fmtDate(c.date)}
                      <div className="text-xs text-muted-foreground">
                        {c.start} – {c.end}
                      </div>
                    </td>
                    <td className="td font-medium">{fmtMin(c.minutes)}</td>
                    <td className="td">
                      {c.reason || "—"}
                      {c.reviewNote && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Obs.: {c.reviewNote}
                        </div>
                      )}
                    </td>
                    <td className="td text-xs">
                      {c.allocations.map((a) => {
                        const o = ot(a.overtimeId);
                        return (
                          <div key={a.overtimeId}>
                            <span className="font-mono font-medium">{o?.code}</span> ·{" "}
                            {fmtMin(a.minutes)}{" "}
                            <span className="text-muted-foreground">
                              ({o ? fmtDate(o.date) : "—"})
                            </span>
                          </div>
                        );
                      })}
                    </td>
                    <td className="td">
                      <StatusBadge status={c.status} />
                    </td>
                    <td className="td text-right">
                      {c.status === "pendiente" ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            className="btn-primary px-2.5 py-1 text-xs"
                            onClick={() => setAction({ id: c.id, approve: true })}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Aprobar
                          </button>
                          <button
                            type="button"
                            className="btn-ghost px-2.5 py-1 text-xs text-destructive hover:bg-destructive-soft"
                            onClick={() => setAction({ id: c.id, approve: false })}
                          >
                            <X className="h-3.5 w-3.5" />
                            Rechazar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          {c.status === "aprobada" ? "Aprobada" : "Rechazada"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={rows.length} size={10} onChange={setPage} />
      </div>

      <ReasonDialog
        open={!!action}
        danger={action ? !action.approve : false}
        requireReason={action ? !action.approve : false}
        title={
          action?.approve
            ? `Aprobar solicitud ${target?.code}`
            : `Rechazar solicitud ${target?.code}`
        }
        description={
          action?.approve
            ? `Se confirmará la compensación de ${fmtMin(target?.minutes ?? 0)} para ${nameOf(target?.workerId ?? "")}. Las horas reservadas pasarán a compensadas definitivamente.`
            : "Al rechazar la solicitud, las horas reservadas volverán a estar disponibles de inmediato en el saldo del trabajador."
        }
        confirmLabel={action?.approve ? "Confirmar aprobación" : "Confirmar rechazo"}
        onClose={() => setAction(null)}
        onConfirm={(note) => {
          const r = reviewCompensation(action!.id, action!.approve, note);
          if (r.ok) {
            toast.success(
              action!.approve
                ? "Solicitud aprobada correctamente."
                : "Solicitud rechazada correctamente.",
            );
          } else {
            toast.error(r.error);
          }
          setAction(null);
        }}
      />
    </AppShell>
  );
}
