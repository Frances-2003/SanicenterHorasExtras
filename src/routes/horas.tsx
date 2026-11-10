import { createFileRoute } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Pager, StatusBadge, paginate } from "@/components/app/ui";
import { addOvertimeFirestore, useCurrentUser, useStore } from "@/services/store";
import { availableFor } from "@/services/ledger";
import { diffMinutes, fmtDate, fmtMin } from "@/lib/time";
import { WorkflowActions } from "@/components/app/WorkflowActions";

export const Route = createFileRoute("/horas")({
  head: () => ({
    meta: [
      { title: "Horas extras — SaniCenter Horas Extras" },
      {
        name: "description",
        content: "Registra y consulta tus horas extras acumuladas en Sani Center.",
      },
      { property: "og:title", content: "Horas extras — Sani Center Horas Extras" },
      {
        property: "og:description",
        content: "Registro de horas extras con cálculo automático y minutos enteros.",
      },
    ],
  }),
  component: Horas,
});

const REASONS = [
  "Inventario general",
  "Cierre de reportes",
  "Validación de stock",
  "Recepción de mercadería",
  "Atención extraordinaria",
];

function Horas() {
  const user = useCurrentUser();
  const { overtime, comps, users } = useStore();
  const isWorker = user?.role === "trabajador";
  const [form, setForm] = useState({ date: "", start: "18:00", end: "20:00", reason: "" });
  const [f, setF] = useState({ date: "", month: "", code: "", worker: "" });
  const [page, setPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const minutes = diffMinutes(form.start, form.end);
  const crossesMidnight = form.start && form.end && form.end <= form.start;

  const rows = useMemo(
    () =>
      overtime
        .filter((o) => (isWorker ? o.workerId === user?.id : !f.worker || o.workerId === f.worker))
        .filter(
          (o) =>
            (!f.date || o.date === f.date) &&
            (!f.month || o.date.startsWith(f.month)) &&
            (!f.code || o.code.toLowerCase().includes(f.code.toLowerCase())),
        )
        .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code)),
    [overtime, f, isWorker, user],
  );

  if (!user) return <AppShell title="">{null}</AppShell>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!form.date) {
      toast.error("Selecciona la fecha de realización de las horas extras.");
      return;
    }
    if (minutes <= 0) {
      toast.error("La hora inicial y final no pueden ser iguales; la duración debe ser mayor a 0.");
      return;
    }
    if (!form.reason.trim()) {
      toast.error("El motivo de las horas extras es obligatorio.");
      return;
    }

    setIsSubmitting(true);
    try {
      const r = await addOvertimeFirestore({ workerId: user.id, ...form });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`Solicitud enviada para aprobación: ${fmtMin(minutes)}`);
      setForm({ ...form, date: "", reason: "" });
    } finally {
      setIsSubmitting(false);
    }
  };

  const nameOf = (id: string) => users.find((u) => u.id === id)?.name ?? "—";

  return (
    <AppShell
      title={isWorker ? "Mis horas extras" : "Horas extras del equipo"}
      subtitle={
        isWorker
          ? "Las solicitudes quedan pendientes hasta que el jefe las apruebe."
          : "Consulta las solicitudes de horas extras del equipo."
      }
    >
      {isWorker && (
        <form onSubmit={submit} className="card mb-6 grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-6">
          <div>
            <label className="field-label">Código</label>
            <input className="field bg-muted font-mono" value="Se asigna al guardar" readOnly />
          </div>
          <div>
            <label className="field-label">Trabajador</label>
            <input className="field bg-muted" value={user.name} readOnly />
          </div>
          <div>
            <label className="field-label">Fecha de realización</label>
            <input
              type="date"
              required
              className="field"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Hora de inicio</label>
            <input
              type="time"
              required
              className="field"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Hora de fin</label>
            <input
              type="time"
              required
              className="field"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Duración calculada</label>
            <div className="field border-primary/30 bg-secondary font-semibold text-primary">
              {fmtMin(minutes)}
              {crossesMidnight && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(+1 día)</span>
              )}
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <label className="field-label">Motivo obligatorio *</label>
            <input
              list="reasons"
              required
              className="field"
              placeholder="Ej. Inventario general, validación de stock..."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <datalist id="reasons">
              {REASONS.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={isSubmitting || minutes <= 0}
              className="btn-primary w-full disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {isSubmitting ? "Enviando..." : "Solicitar aprobación"}
            </button>
          </div>
        </form>
      )}

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-end gap-3 border-b border-border p-4">
          {!isWorker && (
            <div>
              <label className="field-label">Trabajador</label>
              <select
                className="field"
                value={f.worker}
                onChange={(e) => {
                  setF({ ...f, worker: e.target.value });
                  setPage(1);
                }}
              >
                <option value="">Todos los trabajadores</option>
                {users
                  .filter((u) => u.role === "trabajador")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div>
            <label className="field-label">Fecha</label>
            <input
              type="date"
              className="field"
              value={f.date}
              onChange={(e) => {
                setF({ ...f, date: e.target.value });
                setPage(1);
              }}
            />
          </div>
          <div>
            <label className="field-label">Mes</label>
            <input
              type="month"
              className="field"
              value={f.month}
              onChange={(e) => {
                setF({ ...f, month: e.target.value });
                setPage(1);
              }}
            />
          </div>
          <div className="relative">
            <label className="field-label">Código</label>
            <Search className="absolute bottom-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
            <input
              className="field pl-8 font-mono"
              placeholder="HE-000001"
              value={f.code}
              onChange={(e) => {
                setF({ ...f, code: e.target.value });
                setPage(1);
              }}
            />
          </div>
          {(f.date || f.month || f.code || f.worker) && (
            <button
              className="btn-ghost"
              onClick={() => {
                setF({ date: "", month: "", code: "", worker: "" });
                setPage(1);
              }}
            >
              Limpiar filtros
            </button>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="p-4">
            <Empty text="No hay registros de horas extras que coincidan con los filtros." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="th">Código</th>
                  {!isWorker && <th className="th">Trabajador</th>}
                  <th className="th">Fecha</th>
                  <th className="th">Horario</th>
                  <th className="th">Duración</th>
                  <th className="th">Saldo restante</th>
                  <th className="th">Motivo</th>
                  <th className="th">Estado</th>
                  {!isWorker && <th className="th">Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {paginate(rows, page, 10).map((o) => (
                  <tr
                    key={o.id}
                    className={o.status === "anulada" ? "text-muted-foreground opacity-60" : ""}
                  >
                    <td className="td font-mono text-xs">{o.code}</td>
                    {!isWorker && <td className="td font-medium">{nameOf(o.workerId)}</td>}
                    <td className="td">{fmtDate(o.date)}</td>
                    <td className="td whitespace-nowrap">
                      {o.start} – {o.end}
                    </td>
                    <td className="td font-medium">{fmtMin(o.minutes)}</td>
                    <td className="td font-semibold text-primary">
                      {fmtMin(availableFor(o, comps))}
                    </td>
                    <td className="td">
                      {o.reason}
                      {o.voidReason && (
                        <div className="mt-0.5 text-xs text-destructive">
                          Motivo anulación: {o.voidReason}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <StatusBadge status={o.status} />
                      {o.reviewNote && (
                        <div className="text-xs text-muted-foreground">{o.reviewNote}</div>
                      )}
                    </td>
                    {!isWorker && (
                      <td className="td">
                        <WorkflowActions record={o} manager overtime />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={rows.length} size={10} onChange={setPage} />
      </div>
    </AppShell>
  );
}
