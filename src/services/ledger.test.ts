import { describe, expect, it } from "vitest";
import {
  availableFor,
  balanceOf,
  canVoid,
  monthlyMovementsOf,
  usedMinutes,
  validateAllocations,
} from "./ledger";
import type { Compensation, Overtime } from "../types";
const ot: Overtime = {
  id: "ot1",
  code: "HE-000001",
  workerId: "w1",
  date: "2026-10-05",
  start: "18:00",
  end: "20:00",
  minutes: 120,
  reason: "Inventario",
  status: "aprobada",
  createdAt: "2026-10-05T23:00:00Z",
};
const comp = (status: Compensation["status"], minutes = 60): Compensation => ({
  id: "cp1",
  code: "CP-000001",
  workerId: "w1",
  date: "2026-11-05",
  start: "08:00",
  end: "09:00",
  minutes,
  reason: "Descanso",
  status,
  allocations: [{ overtimeId: ot.id, minutes }],
  createdAt: "2026-11-01T12:00:00Z",
});
describe("Ledger: approved sources and historical balances", () => {
  it.each(["pendiente", "activo", "rechazada", "anulada", "anulado"] as const)(
    "does not fund requests from %s overtime",
    (status) => {
      expect(availableFor({ ...ot, status }, [])).toBe(0);
      expect(balanceOf("w1", [{ ...ot, status }], []).accumulated).toBe(0);
      expect(
        validateAllocations(
          "w1",
          60,
          [{ overtimeId: ot.id, minutes: 60 }],
          [{ ...ot, status }],
          [],
        ),
      ).toBeTruthy();
    },
  );
  it.each(["pendiente", "aprobada", "cancelacion_pendiente", "efectuada"] as const)(
    "retains committed minutes for %s",
    (status) => {
      expect(usedMinutes(ot.id, [comp(status)])).toBe(60);
      expect(availableFor(ot, [comp(status)])).toBe(60);
      expect(canVoid(ot, [comp(status)])).toBe(false);
      expect(balanceOf("w1", [ot], [comp(status)]).available).toBe(60);
    },
  );
  it.each(["rechazada", "anulada"] as const)(
    "releases rejected or cancelled allocations (%s)",
    (status) => {
      expect(availableFor(ot, [comp(status)])).toBe(120);
      expect(canVoid(ot, [comp(status)])).toBe(true);
    },
  );
  it("keeps older month sources and distinguishes reserves from approvals", () => {
    expect(balanceOf("w1", [ot], [comp("pendiente")])).toEqual({
      accumulated: 120,
      approved: 0,
      reserved: 60,
      available: 60,
    });
    expect(monthlyMovementsOf("w1", [ot], [comp("aprobada")], "2026-11")).toEqual({
      accumulated: 0,
      approved: 60,
      reserved: 0,
    });
    expect(monthlyMovementsOf("w1", [ot], [], "2026-10").accumulated).toBe(120);
  });
  it("supports partial use from several sources", () => {
    expect(
      validateAllocations(
        "w1",
        180,
        [
          { overtimeId: ot.id, minutes: 120 },
          { overtimeId: "ot2", minutes: 60 },
        ],
        [ot, { ...ot, id: "ot2" }],
        [],
      ),
    ).toBeNull();
  });
  it("groups duplicates before checking available minutes", () => {
    expect(
      validateAllocations(
        "w1",
        180,
        [
          { overtimeId: ot.id, minutes: 90 },
          { overtimeId: ot.id, minutes: 90 },
        ],
        [ot],
        [],
      ),
    ).toContain("saldo disponible");
  });
  it.each([0, -1, 0.5, NaN, Infinity])("rejects malformed allocation minutes %s", (minutes) => {
    expect(validateAllocations("w1", 60, [{ overtimeId: ot.id, minutes }], [ot], [])).toBeTruthy();
  });
  it("rejects foreign sources, unknown sources, empty and mismatched sums", () => {
    for (const allocations of [
      [],
      [{ overtimeId: "missing", minutes: 60 }],
      [{ overtimeId: ot.id, minutes: 30 }],
    ])
      expect(validateAllocations("w1", 60, allocations, [ot], [])).toBeTruthy();
    expect(validateAllocations("w2", 60, [{ overtimeId: ot.id, minutes: 60 }], [ot], [])).toContain(
      "no pertenece",
    );
  });
  it("prevents consuming already reserved funds", () => {
    expect(
      validateAllocations(
        "w1",
        120,
        [{ overtimeId: ot.id, minutes: 120 }],
        [ot],
        [comp("pendiente")],
      ),
    ).toContain("saldo disponible");
  });
  it("clamps inconsistent historical available balance at zero", () => {
    expect(balanceOf("w1", [ot], [comp("aprobada", 180)]).available).toBe(0);
  });
});
