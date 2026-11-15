import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CheckCircle2, Hourglass, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Pager, Stat, StatusBadge, paginate } from "@/components/app/ui";
import { nextCompCode, requestCompensation, useCurrentUser, useStore } from "@/services/store";
import { availableFor, balanceOf, usedMinutes, validateAllocations } from "@/services/ledger";
import { diffMinutes, fmtDate, fmtMin, HOUR_OPTIONS, isWholeHours } from "@/lib/time";
import { WorkflowActions } from "@/components/app/WorkflowActions";
import { overlaps } from "@/services/workflow";

export const Route = createFileRoute("/compensaciones")({
  head: () => ({
    meta: [
      { title: "Mis compensaciones — Sani Center Horas Extras" },
      {
        name: "description",
        content: "Solicita descansos compensatorios usando tus horas extras en Sani Center.",
      },
      { property: "og:title", content: "Mis compensaciones — Sani Center Horas Extras" },
      {
        property: "og:description",
        content: "Solicitudes de descanso con selección manual de registros de origen.",
      },
    ],
  }),
  component: Compensaciones,
});

function Compensaciones() {
  const user = useCurrentUser();
  const { overtime, comps, calendar } = useStore();
  const [form, setForm] = useState({ date: "", start: "08:00", end: "10:00", reason: "" });
  const [alloc, setAlloc] = useState<Record<string, number>>({});
  const [page, setPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const total = diffMinutes(form.start, form.end);
  const crossesMidnight = form.start && form.end && form.end <= form.start;

  const sources = useMemo(
    () =>
      overtime
        .filter((o) => o.workerId === user?.id && o.status === "aprobada")
        .map((o) => ({
          o,
          avail: availableFor(o, comps),
          used: usedMinutes(o.id, comps),
        }))
        .filter((x) => x.avail >= 60)
        .sort((a, b) => a.o.date.localeCompare(b.o.date)),
    [overtime, comps, user],
  );

  const mine = useMemo(
    () =>
      comps
        .filter((c) => c.workerId === user?.id)
        .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code)),
    [comps, user],
  );

  if (!user) return <AppShell title="">{null}</AppShell>;

  const bal = balanceOf(user.id, overtime, comps);
  const minsOf = (id: string) => {
    const a = alloc[id];
    return (a ?? 0) * 60;
  };
  const selectedSum = Object.keys(alloc).reduce((s, id) => s + minsOf(id), 0);
  const wholeSelection = Object.values(alloc).every(
    (hours) => Number.isSafeInteger(hours) && hours >= 1,
  );
  const diff = total - selectedSum;
  const codeOf = (id: string) => overtime.find((o) => o.id === id)?.code ?? id;

  const toggle = (id: string, avail: number) =>
    setAlloc((p) => {
      const n = { ...p };
      if (Object.hasOwn(n, id)) {
        delete n[id];
      } else {
        const needed = Math.max(0, total - selectedSum);
        const take = Math.min(Math.floor(avail / 60), Math.max(1, Math.floor(needed / 60)));
        n[id] = take;
      }
      return n;
    });

  const setHours = (id: string, hours: number, avail: number) =>
    setAlloc((p) => ({ ...p, [id]: Math.max(0, Math.min(hours || 0, Math.floor(avail / 60))) }));

  const submit = async () => {
    if (isSubmitting) return;

    if (!form.date) {
      toast.error("Indica la fecha en que deseas compensar el descanso.");
      return;
    }
    if (!isWholeHours(total) || !wholeSelection) {
      toast.error(
        "El descanso y cada asignación deben ser horas completas, con un mínimo de 1 hora.",
      );
      return;
    }
    if (diff !== 0) {
      toast.error(
        `La suma seleccionada (${fmtMin(selectedSum)}) debe coincidir exactamente con la solicitada (${fmtMin(total)}).`,
      );
      return;
    }

    const allocations = Object.keys(alloc).map((id) => ({ overtimeId: id, minutes: minsOf(id) }));

    if (!allocations.length) {
      toast.error("Debes seleccionar al menos un registro de origen.");
      return;
    }
    const allocationError = validateAllocations(user.id, total, allocations, overtime, comps, true);
    if (allocationError) {
      toast.error(allocationError);
      return;
    }

    setIsSubmitting(true);
    try {
      const r = await requestCompensation({
        workerId: user.id,
        ...form,
        allocations,
      });

      if (!r.ok) {
        toast.error(r.error);
        return;
      }

      toast.success(
        "Solicitud enviada correctamente. Las horas seleccionadas han quedado reservadas.",
      );
      setForm({ date: "", start: "08:00", end: "10:00", reason: "" });
      setAlloc({});
      setPage(1);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell
      title="Mis compensaciones"
      subtitle="Solicita descansos compensatorios seleccionando manualmente las horas extras acumuladas de origen."
      roles={["trabajador", "jefe"]}
    >
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat
          label="Horas acumuladas históricas"
          value={fmtMin(bal.accumulated)}
          icon={CalendarCheck}
        />
        <Stat label="Compensadas aprobadas" value={fmtMin(bal.approved)} icon={CheckCircle2} />
        <Stat label="Reservadas (pendientes)" value={fmtMin(bal.reserved)} icon={Hourglass} />
        <Stat
          label="Saldo disponible actual"
          value={fmtMin(bal.available)}
          icon={Wallet}
          tone="primary"
        />
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-4 font-semibold">Nueva solicitud de compensación</h2>
        {calendar
          .filter((c) => c.workerId !== user.id && overlaps(c, form))
          .map((c) => (
            <p key={c.id} className="mb-2 rounded-lg bg-secondary p-3 text-sm">
              {c.workerName} tiene un descanso aprobado el {fmtDate(c.date)}, de {c.start} a {c.end}
              .
            </p>
          ))}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <label className="field-label">Código de compensación</label>
            <input className="field bg-muted font-mono" readOnly value={nextCompCode()} />
          </div>
          <div>
            <label className="field-label">Fecha a compensar</label>
            <input
              type="date"
              className="field"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Inicio del descanso</label>
            <select
              aria-label="Inicio del descanso"
              className="field"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Fin del descanso</label>
            <select
              aria-label="Fin del descanso"
              className="field"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Total a utilizar</label>
            <div className="field border-primary/30 bg-secondary font-semibold text-primary">
              {fmtMin(total)}
              {crossesMidnight && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">(+1 día)</span>
              )}
            </div>
          </div>
          <div className="sm:col-span-2 lg:col-span-5">
            <label className="field-label">Motivo u observación</label>
            <input
              className="field"
              placeholder="Ej. Cita médica, trámite personal, descanso programado..."
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
        </div>

        <h3 className="mb-2 mt-6 text-sm font-semibold">
          Selección manual de horas extras de origen
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Selecciona los registros y las horas completas que deseas utilizar de cada uno. Los
          minutos históricos restantes se conservan.
        </p>

        {sources.length === 0 ? (
          <Empty text="No tienes registros con al menos una hora completa disponible para compensar." />
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="th w-8" />
                  <th className="th">Código</th>
                  <th className="th">Fecha realización</th>
                  <th className="th">Motivo original</th>
                  <th className="th">Horas registradas</th>
                  <th className="th">Utilizadas / reservadas</th>
                  <th className="th">Saldo restante</th>
                  <th className="th">Horas a utilizar</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(({ o, avail, used }) => {
                  const on = Object.hasOwn(alloc, o.id);
                  return (
                    <tr key={o.id} className={on ? "bg-secondary/60 font-medium" : ""}>
                      <td className="td">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary"
                          checked={on}
                          onChange={() => toggle(o.id, avail)}
                          aria-label={`Seleccionar ${o.code}`}
                        />
                      </td>
                      <td className="td font-mono text-xs">{o.code}</td>
                      <td className="td">{fmtDate(o.date)}</td>
                      <td className="td">{o.reason}</td>
                      <td className="td">{fmtMin(o.minutes)}</td>
                      <td className="td text-muted-foreground">{fmtMin(used)}</td>
                      <td className="td font-semibold text-primary">{fmtMin(avail)}</td>
                      <td className="td">
                        {on ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={Math.floor(avail / 60)}
                              step={1}
                              className="field w-16 px-2 py-1 text-center"
                              value={alloc[o.id] ?? 0}
                              onChange={(e) => setHours(o.id, +e.target.value, avail)}
                              aria-label={`Horas a utilizar de ${o.code}`}
                            />
                            <span className="text-xs">h</span>
                            <span className="ml-1 text-xs text-muted-foreground">
                              ({fmtMin(minsOf(o.id))})
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <div className="text-sm">
            Total seleccionado: <b>{fmtMin(selectedSum)}</b> de <b>{fmtMin(total)}</b>
            {diff !== 0 && selectedSum > 0 && (
              <span
                className={`ml-2 text-xs font-semibold ${diff > 0 ? "text-warning" : "text-destructive"}`}
              >
                {diff > 0 ? `(Faltan ${fmtMin(diff)})` : `(Excede por ${fmtMin(-diff)})`}
              </span>
            )}
            {diff === 0 && selectedSum > 0 && (
              <span className="ml-2 text-xs font-semibold text-primary">✓ Coincidencia exacta</span>
            )}
          </div>
          <button
            type="button"
            className="btn-primary disabled:opacity-50"
            onClick={submit}
            disabled={
              !form.date ||
              !isWholeHours(total) ||
              !wholeSelection ||
              diff !== 0 ||
              selectedSum === 0 ||
              isSubmitting
            }
          >
            <Send className="h-4 w-4" />
            {isSubmitting ? "Enviando..." : "Enviar solicitud"}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <h2 className="border-b border-border px-4 py-3 font-semibold">
          Historial de solicitudes de compensación
        </h2>
        {mine.length === 0 ? (
          <div className="p-4">
            <Empty text="Aún no has registrado solicitudes de compensación." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted">
                <tr>
                  <th className="th">Código</th>
                  <th className="th">Fecha descanso</th>
                  <th className="th">Horario</th>
                  <th className="th">Duración</th>
                  <th className="th">Horas extras de origen</th>
                  <th className="th">Motivo</th>
                  <th className="th">Estado</th>
                  <th className="th">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {paginate(mine, page, 10).map((c) => (
                  <tr key={c.id}>
                    <td className="td font-mono text-xs">{c.code}</td>
                    <td className="td">{fmtDate(c.date)}</td>
                    <td className="td whitespace-nowrap">
                      {c.start} – {c.end}
                    </td>
                    <td className="td font-medium">{fmtMin(c.minutes)}</td>
                    <td className="td text-xs">
                      {c.allocations.map((a) => (
                        <div key={a.overtimeId}>
                          <span className="font-mono font-medium">{codeOf(a.overtimeId)}</span> ·{" "}
                          {fmtMin(a.minutes)}
                        </div>
                      ))}
                    </td>
                    <td className="td">
                      {c.reason || "—"}
                      {c.reviewNote && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          Obs. revisión: {c.reviewNote}
                        </div>
                      )}
                    </td>
                    <td className="td">
                      <StatusBadge status={c.status} />
                      {c.cancellationNote && (
                        <p className="text-xs">Solicitud de anulación: {c.cancellationNote}</p>
                      )}
                      {c.cancellationReviewNote && (
                        <p className="text-xs">Revisión: {c.cancellationReviewNote}</p>
                      )}
                    </td>
                    <td className="td">
                      <WorkflowActions record={c} manager={user.role === "jefe"} owner />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} total={mine.length} size={10} onChange={setPage} />
      </div>
    </AppShell>
  );
}
