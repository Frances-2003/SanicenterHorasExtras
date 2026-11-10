import { describe, expect, it } from "vitest";
import { canAnnulBeforeStart, transition, commandSchema, type Command } from "./workflow";
import { availableFor } from "./ledger";
import type { Compensation, Overtime, User } from "../types";
const worker: User = { id: "w", name: "Ana", role: "trabajador", active: true, area: "A" };
const boss: User = { ...worker, id: "boss", role: "jefe" };
const ot: Overtime = {
  id: "ot",
  code: "HE-000001",
  workerId: worker.id,
  date: "2026-11-01",
  start: "18:00",
  end: "20:00",
  minutes: 120,
  reason: "Stock",
  status: "aprobada",
  createdAt: "2026-11-01",
};
const comp: Compensation = {
  id: "cp",
  code: "CP-000001",
  workerId: worker.id,
  date: "2026-11-10",
  start: "23:00",
  end: "02:00",
  minutes: 60,
  reason: "Descanso",
  status: "aprobada",
  allocations: [{ overtimeId: ot.id, minutes: 60 }],
  createdAt: "2026-11-01",
};
const start = "2026-11-11T04:00:00Z"; // 23:00 in Peru, not UTC midnight.
const before = "2026-11-11T03:59:59.999Z";
const run = (command: Command, actor = boss, record = comp, now = before) =>
  transition(command, actor, worker, [ot], [record], "unused", 0, now) as Compensation;
describe("One annulment workflow with a strict Peru start boundary", () => {
  it("requires a reason even for direct annulment", () => {
    expect(
      commandSchema.safeParse({
        action: "reviewCancellation",
        id: comp.id,
        approve: true,
        direct: true,
        note: " ",
      }).success,
    ).toBe(false);
  });
  it("requests, denies, re-requests and authorizes without releasing twice", () => {
    const requested = run({ action: "requestCancellation", id: comp.id, note: "Cambio" }, worker);
    expect(availableFor(ot, [requested])).toBe(60);
    const denied = run(
      { action: "reviewCancellation", id: comp.id, approve: false, note: "Se mantiene" },
      boss,
      requested,
    );
    expect(denied.status).toBe("aprobada");
    expect(availableFor(ot, [denied])).toBe(60);
    const again = run(
      { action: "requestCancellation", id: comp.id, note: "Nuevo motivo" },
      worker,
      denied,
    );
    const annulled = run(
      { action: "reviewCancellation", id: comp.id, approve: true, note: "Autorizada" },
      boss,
      again,
    );
    expect(annulled.status).toBe("anulada");
    expect(annulled.voidedBy).toBe(boss.id);
    expect(annulled.voidReason).toBe("Autorizada");
    expect(availableFor(ot, [annulled])).toBe(120);
    expect(annulled.allocations).toEqual(comp.allocations);
    expect(() =>
      run(
        { action: "reviewCancellation", id: comp.id, approve: true, note: "Repetir" },
        boss,
        annulled,
      ),
    ).toThrow("pendiente");
  });
  it("supports direct manager annulment using the same transition and preserves approved audit fields", () => {
    const result = run(
      {
        action: "reviewCancellation",
        id: comp.id,
        approve: true,
        direct: true,
        note: "Cambio de turno",
      },
      boss,
      { ...comp, reviewedBy: "original", reviewNote: "Aprobada" },
    );
    expect(result.status).toBe("anulada");
    expect(result.reviewedBy).toBe("original");
    expect(result.cancellationReviewedBy).toBe(boss.id);
  });
  it.each([start, "2026-11-11T05:00:00Z", "2026-11-11T07:00:00Z"])(
    "blocks requests and authorization at/after start %s",
    (clock) => {
      expect(canAnnulBeforeStart(comp, Date.parse(clock))).toBe(false);
      expect(() =>
        run({ action: "requestCancellation", id: comp.id, note: "Cambio" }, worker, comp, clock),
      ).toThrow("antes del inicio");
      expect(() =>
        run(
          { action: "reviewCancellation", id: comp.id, approve: true, note: "Cambio" },
          boss,
          { ...comp, status: "cancelacion_pendiente" },
          clock,
        ),
      ).toThrow("antes del inicio");
      expect(() =>
        run(
          {
            action: "reviewCancellation",
            id: comp.id,
            approve: true,
            direct: true,
            note: "Cambio",
          },
          boss,
          comp,
          clock,
        ),
      ).toThrow("antes del inicio");
    },
  );
  it.each(["efectuada", "anulada", "rechazada", "pendiente"] as const)(
    "cannot annul %s",
    (status) => {
      expect(() =>
        run(
          {
            action: "reviewCancellation",
            id: comp.id,
            approve: true,
            direct: true,
            note: "Cambio",
          },
          boss,
          { ...comp, status },
        ),
      ).toThrow();
    },
  );
  it("cannot annul as owner, inactive manager or foreign-area manager", () => {
    for (const actor of [worker, { ...boss, active: false }, { ...boss, area: "B" }])
      expect(() =>
        run(
          {
            action: "reviewCancellation",
            id: comp.id,
            approve: true,
            direct: true,
            note: "Cambio",
          },
          actor,
        ),
      ).toThrow();
    expect(
      run(
        { action: "reviewCancellation", id: comp.id, approve: true, direct: true, note: "Cambio" },
        { ...boss, area: "B", authorizedAreas: ["A"] },
      ).status,
    ).toBe("anulada");
  });
  it("allows denial after an unresolved request expires; never releases its approved balance", () => {
    const denied = run(
      { action: "reviewCancellation", id: comp.id, approve: false, note: "Fuera de plazo" },
      boss,
      { ...comp, status: "cancelacion_pendiente" },
      start,
    );
    expect(denied.status).toBe("aprobada");
    expect(availableFor(ot, [denied])).toBe(60);
  });
});
