import { createFileRoute } from "@tanstack/react-router";
import { CalendarCheck, CheckCircle2, History, Hourglass, TrendingUp, Wallet } from "lucide-react";
import { useState } from "react";
import { overlaps } from "@/services/workflow";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Stat, StatusBadge } from "@/components/app/ui";
import { useCurrentUser, useStore } from "@/services/store";
import { balanceOf, monthlyMovementsOf } from "@/services/ledger";
import { fmtDate, fmtMin, fmtMonth } from "@/lib/time";

export const Route = createFileRoute("/resumen")({
  head: () => ({
    meta: [
      { title: "Resumen mensual — Sani Center Horas Extras" },
      {
        name: "description",
        content:
          "Resumen mensual y saldos históricos de horas extras, compensaciones y calendario de descansos.",
      },
      { property: "og:title", content: "Resumen mensual — Sani Center Horas Extras" },
      {
        property: "og:description",
        content: "Saldos del equipo y calendario de compensaciones en Sani Center.",
      },
    ],
  }),
  component: Resumen,
});

const DOW = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

function Resumen() {
  const user = useCurrentUser();
  const { users, overtime, comps, calendar } = useStore();
  const [month, setMonth] = useState("2026-11");
  const [worker, setWorker] = useState("");
  const [day, setDay] = useState<string | null>(null);

  const isWorker = user?.role === "trabajador";
  const workers = users.filter(
    (u) => u.role === "trabajador" && (isWorker ? u.id === user?.id : !worker || u.id === worker),
  );

  // Separate monthly movements from historical balance
  const rows = workers.map((w) => ({
    w,
    m: monthlyMovementsOf(w.id, overtime, comps, month),
    all: balanceOf(w.id, overtime, comps),
  }));

  const totMonth = rows.reduce(
    (s, r) => ({
      acc: s.acc + r.m.accumulated,
      ap: s.ap + r.m.approved,
      res: s.res + r.m.reserved,
    }),
    { acc: 0, ap: 0, res: 0 },
  );

  const totHistorical = rows.reduce(
    (s, r) => ({
      acc: s.acc + r.all.accumulated,
      ap: s.ap + r.all.approved,
      res: s.res + r.all.reserved,
      av: s.av + r.all.available,
    }),
    { acc: 0, ap: 0, res: 0, av: 0 },
  );

  const onDay = (c: { date: string; start: string; end: string }, date: string) =>
    overlaps(c, { date, start: "00:00", end: "00:00" });
  const monthComps = calendar.filter(
    (c) =>
      (c.date.startsWith(month) || onDay(c, `${month}-01`)) && (!worker || c.workerId === worker),
  );

  const [y = 2026, m = 1] = month.split("-").map(Number);
  const first = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells = [
    ...Array(first).fill(null),
    ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`),
  ];
  const dayComps = day ? monthComps.filter((c) => onDay(c, day)) : [];
  const dotColor = {
    pendiente: "bg-warning",
    aprobada: "bg-primary",
    rechazada: "bg-destructive",
    cancelacion_pendiente: "bg-warning",
    efectuada: "bg-primary",
  } as const;

  return (
    <AppShell
      title="Resumen"
      subtitle={
        isWorker
          ? `Tus saldos históricos y movimientos de ${fmtMonth(month)}.`
          : `Saldos y movimientos del equipo correspondientes a ${fmtMonth(month)}.`
      }
    >
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <label className="field-label">Mes a consultar</label>
          <input
            type="month"
            className="field"
            value={month}
            onChange={(e) => {
              if (e.target.value) {
                setMonth(e.target.value);
                setDay(null);
              }
            }}
          />
        </div>
        {!isWorker && (
          <div>
            <label className="field-label">Filtrar por trabajador</label>
            <select className="field" value={worker} onChange={(e) => setWorker(e.target.value)}>
              <option value="">Todo el equipo</option>
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
      </div>

      {/* Indicadores separados: Movimientos del mes vs Saldos históricos */}
      <div className="mb-6 space-y-4">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Movimientos del mes ({fmtMonth(month)})
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat
              label="Horas extras realizadas en el mes"
              value={fmtMin(totMonth.acc)}
              icon={CalendarCheck}
            />
            <Stat
              label="Compensadas aprobadas en el mes"
              value={fmtMin(totMonth.ap)}
              icon={CheckCircle2}
            />
            <Stat
              label="Compensaciones pendientes en el mes"
              value={fmtMin(totMonth.res)}
              icon={Hourglass}
            />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <History className="h-3.5 w-3.5 text-primary" />
            Balance acumulado histórico (conserva saldos de meses anteriores)
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              label="Total horas extras acumuladas"
              value={fmtMin(totHistorical.acc)}
              icon={CalendarCheck}
            />
            <Stat
              label="Total compensadas aprobadas"
              value={fmtMin(totHistorical.ap)}
              icon={CheckCircle2}
            />
            <Stat
              label="Total reservadas (pendientes)"
              value={fmtMin(totHistorical.res)}
              icon={Hourglass}
            />
            <Stat
              label="Saldo disponible actual"
              value={fmtMin(totHistorical.av)}
              icon={Wallet}
              tone="primary"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card overflow-x-auto lg:col-span-3">
          <div className="border-b border-border px-4 py-3">
            <h2 className="font-semibold">Detalle de horas y saldos por trabajador</h2>
            <p className="text-xs text-muted-foreground">
              Movimientos correspondientes a {fmtMonth(month)} y saldo acumulado total disponible a
              la fecha.
            </p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="th">Trabajador</th>
                <th className="th">HE del mes</th>
                <th className="th">Comp. mes</th>
                <th className="th">Pend. mes</th>
                <th className="th">Total histórico</th>
                <th className="th">Saldo disponible</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ w, m: mov, all: hist }) => (
                <tr key={w.id}>
                  <td className="td font-medium">
                    {w.name}
                    <div className="text-xs text-muted-foreground">{w.area}</div>
                  </td>
                  <td className="td">{fmtMin(mov.accumulated)}</td>
                  <td className="td">{fmtMin(mov.approved)}</td>
                  <td className="td">{fmtMin(mov.reserved)}</td>
                  <td className="td font-medium text-muted-foreground">
                    {fmtMin(hist.accumulated)}
                  </td>
                  <td className="td font-bold text-primary">{fmtMin(hist.available)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
            * El saldo disponible actual incluye todas las horas acumuladas históricas menos
            compensaciones aprobadas y reservadas.
          </p>
        </div>

        <div className="card p-4 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Calendario de compensaciones</h2>
            <span className="text-xs font-medium text-muted-foreground">{fmtMonth(month)}</span>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {DOW.map((d) => (
              <div key={d} className="py-1 font-medium text-muted-foreground">
                {d}
              </div>
            ))}
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const list = monthComps.filter((c) => onDay(c, d));
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDay(d)}
                  className={`flex aspect-square flex-col items-center justify-center rounded-lg transition ${
                    day === d
                      ? "bg-primary text-primary-foreground font-bold shadow-sm"
                      : list.length
                        ? "bg-secondary font-semibold text-secondary-foreground hover:bg-secondary/70"
                        : "hover:bg-muted"
                  }`}
                >
                  {+d.slice(8)}
                  {list.length > 0 && (
                    <span className="mt-0.5 flex gap-0.5">
                      {list.slice(0, 3).map((c) => (
                        <span
                          key={c.id}
                          className={`h-1.5 w-1.5 rounded-full ${dotColor[c.status]}`}
                        />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="mt-4 border-t border-border pt-3">
            {!day ? (
              <p className="text-xs text-muted-foreground">
                Selecciona una fecha del calendario para ver el detalle.
              </p>
            ) : dayComps.length === 0 ? (
              <Empty text={`Sin descansos compensatorios programados para el ${fmtDate(day)}.`} />
            ) : (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-foreground">
                  Compensaciones para el {fmtDate(day)} ({dayComps.length}):
                </div>
                {dayComps.map((c) => (
                  <div
                    key={c.id}
                    className="rounded-lg border border-border bg-card p-3 text-sm shadow-2xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{c.workerName}</span>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="font-mono">{c.code}</span>
                      <span>•</span>
                      <span>
                        {c.start} – {c.end}
                      </span>
                      <span>•</span>
                      <span className="font-semibold text-foreground">{fmtMin(c.minutes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
