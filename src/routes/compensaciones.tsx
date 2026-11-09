import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CheckCircle2, Hourglass, Send, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Pager, Stat, StatusBadge, paginate } from "@/components/app/ui";
import { nextCompCode, requestCompensation, useCurrentUser, useStore } from "@/services/store";
import { availableFor, balanceOf, usedMinutes } from "@/services/ledger";
import { diffMinutes, fmtDate, fmtMin } from "@/lib/time";

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
  const { overtime, comps } = useStore();
  const [form, setForm] = useState({ date: "", start: "08:00", end: "10:00", reason: "" });
  const [alloc, setAlloc] = useState<Record<string, { h: number; m: number }>>({});
  const [page, setPage] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const total = diffMinutes(form.start, form.end);
  const crossesMidnight = form.start && form.end && form.end < form.start;

  const sources = useMemo(
    () =>
      overtime
        .filter((o) => o.workerId === user?.id && o.status === "activo")
        .map((o) => ({
          o,
          avail: availableFor(o, comps),
          used: usedMinutes(o.id, comps),
        }))
        .filter((x) => x.avail > 0)
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
    return a ? a.h * 60 + a.m : 0;
  };
  const selectedSum = Object.keys(alloc).reduce((s, id) => s + minsOf(id), 0);
  const diff = total - selectedSum;
  const codeOf = (id: string) => overtime.find((o) => o.id === id)?.code ?? id;

  const toggle = (id: string, avail: number) =>
    setAlloc((p) => {
      const n = { ...p };
      if (n[id]) {
        delete n[id];
      } else {
        const needed = Math.max(0, total - selectedSum);
        const take = Math.min(avail, needed > 0 ? needed : Math.min(avail, 60));
        n[id] = { h: Math.floor(take / 60), m: take % 60 };
      }
      return n;
    });

  const setPart = (id: string, part: "h" | "m", v: number, avail: number) =>
    setAlloc((p) => {
      const cur = { h: 0, m: 0, ...p[id] };
      cur[part] = Math.max(0, Math.floor(v || 0));
      if (cur.h * 60 + cur.m > avail) {
        cur.h = Math.floor(avail / 60);
        cur.m = avail % 60;
      }
      return { ...p, [id]: cur };
    });

  const submit = () => {
    if (isSubmitting) return;

    if (!form.date) {
      toast.error("Indica la fecha en que deseas compensar el descanso.");
      return;
    }
    if (total <= 0) {
      toast.error("El horario de descanso debe representar una duración mayor a 0.");
      return;
    }
    if (diff !== 0) {
      toast.error(
        `La suma seleccionada (${fmtMin(selectedSum)}) debe coincidir exactamente con la solicitada (${fmtMin(total)}).`,
      );
      return;
    }

    const allocations = Object.keys(alloc)
      .map((id) => ({ overtimeId: id, minutes: minsOf(id) }))
      .filter((a) => a.minutes > 0);

    if (!allocations.length) {
      toast.error("Debes seleccionar al menos un registro de origen.");
      return;
    }

    setIsSubmitting(true);
    try {
      const r = requestCompensation({
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
      roles={["trabajador"]}
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
            <input
              type="time"
              className="field"
              value={form.start}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
          </div>
          <div>
            <label className="field-label">Fin del descanso</label>
            <input
              type="time"
              className="field"
              value={form.end}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
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
          Selecciona los registros y define los minutos que deseas descontar de cada uno.
        </p>

        {sources.length === 0 ? (
          <Empty text="No tienes horas extras con saldo disponible para compensar." />
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
                  <th className="th">Minutos a utilizar</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(({ o, avail, used }) => {
                  const on = !!alloc[o.id];
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
                              min={0}
                              className="field w-16 px-2 py-1 text-center"
                              value={alloc[o.id]?.h ?? 0}
                              onChange={(e) => setPart(o.id, "h", +e.target.value, avail)}
                              aria-label="Horas"
                            />
                            <span className="text-xs">h</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              step={5}
                              className="field w-16 px-2 py-1 text-center"
                              value={alloc[o.id]?.m ?? 0}
                              onChange={(e) => setPart(o.id, "m", +e.target.value, avail)}
                              aria-label="Minutos"
                            />
                            <span className="text-xs">m</span>
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
            disabled={!form.date || total <= 0 || diff !== 0 || selectedSum === 0 || isSubmitting}
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
