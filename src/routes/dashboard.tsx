import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, CheckCircle2, Clock, Hourglass, Wallet } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppShell, Empty } from "@/components/app/AppShell";
import { Pager, paginate, Stat } from "@/components/app/ui";
import { useCurrentUser, useStore } from "@/services/store";
import { dashboardOf } from "@/services/dashboard";
import { fmtMin, fmtMonth } from "@/lib/time";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Sani Center Horas Extras" }] }),
  component: Dashboard,
});
function Dashboard() {
  const actor = useCurrentUser();
  const { users, overtime, comps, dataError } = useStore();
  const year = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Lima" }).format(
    new Date(),
  );
  const [filters, setFilters] = useState({ from: `${year}-01`, to: `${year}-12`, area: "" });
  const [page, setPage] = useState(1);
  const data = useMemo(
    () => dashboardOf(actor, users, overtime, comps, filters),
    [actor, users, overtime, comps, filters],
  );
  const invalidPeriod = !!filters.from && !!filters.to && filters.from > filters.to;
  const hoursLabel = (value: unknown) => fmtMin(Math.round(Number(value) * 60));
  return (
    <AppShell
      title="Dashboard"
      subtitle="Indicadores del personal y movimientos de horas extras."
      roles={["jefe", "admin"]}
    >
      {data.allowed && (
        <>
          <div className="card mb-5 flex flex-wrap items-end gap-4 p-4">
            <div>
              <label htmlFor="dashboard-from" className="field-label">
                Desde
              </label>
              <input
                id="dashboard-from"
                type="month"
                className="field"
                value={filters.from}
                onChange={(e) => {
                  setFilters({ ...filters, from: e.target.value });
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label htmlFor="dashboard-to" className="field-label">
                Hasta
              </label>
              <input
                id="dashboard-to"
                type="month"
                className="field"
                value={filters.to}
                onChange={(e) => {
                  setFilters({ ...filters, to: e.target.value });
                  setPage(1);
                }}
              />
            </div>
            <div>
              <label htmlFor="dashboard-area" className="field-label">
                Área
              </label>
              <select
                id="dashboard-area"
                className="field"
                value={filters.area}
                onChange={(e) => {
                  setFilters({ ...filters, area: e.target.value });
                  setPage(1);
                }}
              >
                <option value="">Todas las áreas autorizadas</option>
                {data.areas.map((area) => (
                  <option key={area}>{area}</option>
                ))}
              </select>
            </div>
            <button
              className="btn-ghost"
              onClick={() => {
                setFilters({ from: "", to: "", area: "" });
                setPage(1);
              }}
            >
              Todo el historial
            </button>
            <span className="ml-auto text-sm text-muted-foreground">
              {data.rows.length} trabajadores registrados
            </span>
          </div>
          {invalidPeriod ? (
            <p role="alert" className="card p-4 text-destructive">
              El inicio del período debe ser anterior o igual al final.
            </p>
          ) : dataError ? (
            <Empty text="No se pueden calcular indicadores completos mientras haya un error de carga." />
          ) : (
            <>
              <p className="mb-4 text-xs text-muted-foreground">
                El período filtra horas aprobadas, descansos efectuados y solicitudes. El saldo
                disponible es el actual de todo el historial, descontando reservas y descansos
                aprobados. Las compensadas requieren confirmación manual.
              </p>
              <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat
                  label="Horas extras aprobadas"
                  value={fmtMin(data.totals.approved)}
                  icon={Clock}
                />
                <Stat
                  label="Horas compensadas (efectuadas)"
                  value={fmtMin(data.totals.compensated)}
                  icon={CheckCircle2}
                />
                <Stat
                  label="Saldo disponible histórico"
                  value={fmtMin(data.totals.available)}
                  icon={Wallet}
                  tone="primary"
                />
                <Stat
                  label="Solicitudes pendientes"
                  value={String(data.pending)}
                  icon={Hourglass}
                />
              </div>
              <div className="mb-6 grid gap-5 lg:grid-cols-2">
                <section className="card min-w-0 p-5">
                  <h2 className="mb-4 flex items-center gap-2 font-semibold">
                    <BarChart3 className="h-4 w-4 text-primary" />
                    Trabajadores con más horas aprobadas
                  </h2>
                  {data.ranking.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart
                        data={data.ranking}
                        layout="vertical"
                        margin={{ left: 20, right: 16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11 }} />
                        <Tooltip formatter={hoursLabel} />
                        <Bar
                          dataKey="hours"
                          name="Horas aprobadas"
                          fill="#16a34a"
                          radius={[0, 5, 5, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty text="Sin horas aprobadas en este período." />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Hasta 10 trabajadores · Horas
                  </p>
                </section>
                <section className="card min-w-0 p-5">
                  <h2 className="mb-4 font-semibold">Distribución de solicitudes por estado</h2>
                  {data.distribution.length ? (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={data.distribution}
                          dataKey="count"
                          nameKey="label"
                          cx="50%"
                          cy="45%"
                          innerRadius={55}
                          outerRadius={90}
                        >
                          {data.distribution.map((s) => (
                            <Cell key={s.status} fill={s.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty text="Sin solicitudes en este período." />
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Cantidad de registros de horas extras y compensaciones. Incluye solicitudes de
                    anulación pendientes.
                  </p>
                </section>
                <section className="card min-w-0 p-5 lg:col-span-2">
                  <h2 className="mb-4 font-semibold">
                    Evolución mensual de horas extras aprobadas
                  </h2>
                  {data.monthly.length ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart
                        data={data.monthly}
                        margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                        <YAxis />
                        <Tooltip
                          formatter={hoursLabel}
                          labelFormatter={(month) => fmtMonth(String(month))}
                        />
                        <Line
                          type="monotone"
                          dataKey="hours"
                          name="Horas aprobadas"
                          stroke="#16a34a"
                          strokeWidth={3}
                          dot={{ r: 4 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <Empty text="Sin registros de horas extras en este período." />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Por mes de realización · Horas · Se consideran únicamente registros actualmente
                    aprobados.
                  </p>
                </section>
              </div>
              <section className="card overflow-hidden">
                <h2 className="border-b border-border px-4 py-3 font-semibold">
                  Detalle de trabajadores
                </h2>
                {data.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted">
                        <tr>
                          {[
                            "Nombre",
                            "Área",
                            "Horas aprobadas",
                            "Horas compensadas",
                            "Saldo disponible actual",
                          ].map((text) => (
                            <th className="th" key={text}>
                              {text}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {paginate(data.rows, page, 10).map((r) => (
                          <tr key={r.id}>
                            <td className="td font-medium">
                              {r.name}
                              {!r.active && (
                                <span className="ml-2 text-xs text-muted-foreground">Inactivo</span>
                              )}
                            </td>
                            <td className="td">{r.area}</td>
                            <td className="td">{fmtMin(r.approved)}</td>
                            <td className="td">{fmtMin(r.compensated)}</td>
                            <td className="td font-semibold text-primary">{fmtMin(r.available)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty text="No hay trabajadores en el área seleccionada." />
                )}
                <Pager page={page} total={data.rows.length} size={10} onChange={setPage} />
              </section>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
