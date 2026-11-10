import { describe, expect, it } from "vitest";
import { dashboardOf } from "./dashboard";
import { hasRouteAccess } from "./auth";
import type { Compensation, Overtime, User } from "../types";
const ana: User = { id: "ana", name: "Ana", role: "trabajador", area: "A", active: true };
const maria: User = { ...ana, id: "maria", name: "Maria", area: "B" };
const boss: User = { ...ana, id: "boss", role: "jefe" };
const admin: User = { ...boss, id: "admin", role: "admin" };
const ot = (
  id: string,
  workerId: string,
  minutes: number,
  status: Overtime["status"] = "aprobada",
  date = "2026-10-01",
): Overtime => ({
  id,
  workerId,
  minutes,
  status,
  date,
  code: id,
  start: "18:00",
  end: "20:00",
  reason: "Stock",
  createdAt: date,
});
const ots = [
  ot("a", "ana", 240),
  ot("b", "maria", 120),
  ot("pending", "ana", 60, "pendiente"),
  ot("void", "ana", 600, "anulada"),
  ot("new", "ana", 60, "aprobada", "2026-11-01"),
];
const comp = (id: string, status: Compensation["status"], minutes = 60): Compensation => ({
  id,
  code: id,
  workerId: "ana",
  status,
  minutes,
  date: "2026-11-02",
  start: "08:00",
  end: "09:00",
  reason: "Descanso",
  allocations: [{ overtimeId: "a", minutes }],
  createdAt: "2026-11-01",
});
const filters = { from: "2026-11", to: "2026-11", area: "" };
describe("Dashboard permissions and real ledger indicators", () => {
  it("rejects workers, inactive managers and direct dashboard routes", () => {
    for (const actor of [ana, null, { ...boss, active: false }])
      expect(dashboardOf(actor, [ana, maria], ots, [], filters).rows).toEqual([]);
    expect(hasRouteAccess("trabajador", "/dashboard")).toBe(false);
    expect(hasRouteAccess("jefe", "/dashboard")).toBe(true);
  });
  it("scopes single and multiple authorized areas and denies forged area filters", () => {
    expect(dashboardOf(boss, [ana, maria], ots, [], filters).areas).toEqual(["A"]);
    expect(dashboardOf(boss, [ana, maria], ots, [], { ...filters, area: "B" }).rows).toEqual([]);
    expect(
      dashboardOf({ ...boss, authorizedAreas: ["B"] }, [ana, maria], ots, [], filters).rows,
    ).toHaveLength(2);
    expect(dashboardOf(admin, [ana, maria], ots, [], filters).rows).toHaveLength(2);
  });
  it("filters movements by period while preserving historical available balance and reserves", () => {
    const data = dashboardOf(
      boss,
      [ana, maria],
      ots,
      [comp("actual", "efectuada"), comp("future", "aprobada"), comp("reserved", "pendiente")],
      filters,
    );
    expect(data.totals).toEqual({ approved: 60, compensated: 60, available: 120 });
    expect(data.pending).toBe(1);
    expect(data.rows[0]?.available).toBe(120);
    expect(data.monthly).toEqual([{ month: "2026-11", minutes: 60, hours: 1 }]);
  });
  it("keeps pending annulments committed and reflects the exact refund once annulled", () => {
    const pending = dashboardOf(boss, [ana], ots, [comp("cp", "cancelacion_pendiente")], filters);
    const annulled = dashboardOf(boss, [ana], ots, [comp("cp", "anulada")], filters);
    expect(annulled.totals.available - pending.totals.available).toBe(60);
    expect(annulled.totals.compensated).toBe(0);
    expect(annulled.distribution.find((s) => s.status === "anulada")?.count).toBe(1);
  });
  it("excludes voided and legacy overtime, counts all pending types and ranks workers", () => {
    const data = dashboardOf(
      admin,
      [ana, maria],
      [...ots, ot("legacy", "ana", 500, "activo")],
      [comp("cp", "cancelacion_pendiente"), comp("p", "pendiente")],
      { from: "", to: "", area: "" },
    );
    expect(data.totals.approved).toBe(420);
    expect(data.pending).toBe(3);
    expect(data.ranking.map((r) => r.id)).toEqual(["ana", "maria"]);
    expect(data.distribution.find((s) => s.status === "activo")?.count).toBe(1);
  });
  it("shows empty periods without inventing chart values or losing current balances", () => {
    const data = dashboardOf(boss, [ana], ots, [], { from: "2099-01", to: "2099-12", area: "" });
    expect(data.monthly).toEqual([]);
    expect(data.distribution).toEqual([]);
    expect(data.ranking).toEqual([]);
    expect(data.totals.available).toBe(300);
  });
});
