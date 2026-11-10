import type { Compensation, Overtime, User } from "../types";
import { balanceOf } from "./ledger";
import { canManageArea, canViewTeamRecords } from "./auth";

export interface DashboardFilters {
  from: string;
  to: string;
  area: string;
}
export const DASHBOARD_STATES = [
  { status: "pendiente", label: "Pendientes", color: "#d99a18" },
  { status: "aprobada", label: "Aprobadas", color: "#16a34a" },
  { status: "cancelacion_pendiente", label: "Anulación pendiente", color: "#84b44b" },
  { status: "rechazada", label: "Rechazadas", color: "#ca635d" },
  { status: "anulada", label: "Anuladas", color: "#94a3b8" },
  { status: "efectuada", label: "Efectuadas", color: "#0f766e" },
  { status: "activo", label: "Legado sin revisión", color: "#64748b" },
] as const;

/** No database reads here. Available balance always uses full history, never a truncated month. */
export function dashboardOf(
  actor: User | null,
  users: User[],
  overtime: Overtime[],
  comps: Compensation[],
  filters: DashboardFilters,
) {
  const allowed = canViewTeamRecords(actor);
  const personnel =
    allowed && actor
      ? users.filter((u) => u.role === "trabajador" && canManageArea(actor, u.area))
      : [];
  const areas = [...new Set(personnel.map((u) => u.area))].sort();
  const workers = personnel.filter((u) => !filters.area || u.area === filters.area);
  const ids = new Set(workers.map((u) => u.id));
  const allOts = overtime.filter((o) => ids.has(o.workerId));
  const allComps = comps.filter((c) => ids.has(c.workerId));
  const inPeriod = (date: string) =>
    (!filters.from || date.slice(0, 7) >= filters.from) &&
    (!filters.to || date.slice(0, 7) <= filters.to);
  const periodOts = allOts.filter((o) => inPeriod(o.date));
  const periodComps = allComps.filter((c) => inPeriod(c.date));
  const rows = workers
    .map((worker) => {
      const balance = balanceOf(worker.id, allOts, allComps);
      return {
        id: worker.id,
        name: worker.name,
        area: worker.area,
        active: worker.active,
        approved: periodOts
          .filter((o) => o.workerId === worker.id && o.status === "aprobada")
          .reduce((sum, o) => sum + o.minutes, 0),
        compensated: periodComps
          .filter((c) => c.workerId === worker.id && c.status === "efectuada")
          .reduce((sum, c) => sum + c.minutes, 0),
        available: balance.available,
      };
    })
    .sort((a, b) => b.approved - a.approved || a.name.localeCompare(b.name));
  const pending =
    periodOts.filter((o) => o.status === "pendiente").length +
    periodComps.filter((c) => ["pendiente", "cancelacion_pendiente"].includes(c.status)).length;
  const records = [...periodOts, ...periodComps];
  const distribution = DASHBOARD_STATES.map((s) => ({
    ...s,
    count: records.filter((r) => (r.status === "anulado" ? "anulada" : r.status) === s.status)
      .length,
  })).filter((s) => s.count > 0);
  const monthlyMap = new Map<string, number>();
  // Keep observed months even when all their overtime is pending/voided: their approved total is zero.
  for (const o of periodOts) {
    const month = o.date.slice(0, 7);
    monthlyMap.set(month, (monthlyMap.get(month) || 0) + (o.status === "aprobada" ? o.minutes : 0));
  }
  const monthly = [...monthlyMap]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, minutes]) => ({ month, minutes, hours: minutes / 60 }));
  return {
    allowed,
    areas,
    rows,
    pending,
    distribution,
    monthly,
    ranking: rows
      .filter((r) => r.approved > 0)
      .slice(0, 10)
      .map((r) => ({ ...r, hours: r.approved / 60 })),
    totals: {
      approved: rows.reduce((s, r) => s + r.approved, 0),
      compensated: rows.reduce((s, r) => s + r.compensated, 0),
      available: rows.reduce((s, r) => s + r.available, 0),
    },
  };
}
