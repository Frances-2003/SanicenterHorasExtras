import { describe, expect, it } from "vitest";
import { commandSchema, interval, overlaps, transition, type Command } from "./workflow";
import { diffMinutes } from "../lib/time";
import type { Compensation, Overtime, User } from "../types";
const worker: User = { id: "w1", role: "trabajador", name: "Ana", area: "A", active: true };
const boss: User = { ...worker, id: "boss", role: "jefe" };
const now = "2026-11-09T18:00:00Z";
const overtime: Overtime = {
  id: "ot1",
  code: "HE-000080",
  workerId: worker.id,
  date: "2026-10-01",
  start: "18:00",
  end: "20:00",
  minutes: 120,
  reason: "Stock",
  status: "aprobada",
  createdAt: now,
};
const rest: Compensation = {
  id: "cp1",
  code: "CP-000011",
  workerId: worker.id,
  date: "2026-11-01",
  start: "08:00",
  end: "10:00",
  minutes: 120,
  reason: "Descanso",
  status: "pendiente",
  allocations: [{ overtimeId: overtime.id, minutes: 120 }],
  createdAt: now,
};
const run = (c: Command, actor = boss, ots = [overtime], comps = [rest], clock = now) =>
  transition(c, actor, worker, ots, comps, "new", 81, clock);
describe("Schedules and validation", () => {
  it("handles overnight shifts, adjacent boundaries and equal times as 24h", () => {
    expect(diffMinutes("23:00", "02:00")).toBe(180);
    expect(diffMinutes("08:00", "08:00")).toBe(1440);
    expect(diffMinutes("25:00", "02:00")).toBe(0);
    expect(
      overlaps(
        { date: "2026-10-01", start: "23:00", end: "02:00" },
        { date: "2026-10-02", start: "01:00", end: "03:00" },
      ),
    ).toBe(true);
    expect(
      overlaps(
        { date: "2026-10-01", start: "23:00", end: "02:00" },
        { date: "2026-10-02", start: "02:00", end: "03:00" },
      ),
    ).toBe(false);
  });
  it.each(["2026-02-30", "2026-13-01", "2026-2-01"])("rejects invalid date %s", (date) => {
    expect(
      commandSchema.safeParse({
        action: "addOvertime",
        date,
        start: "08:00",
        end: "09:00",
        reason: "Stock",
      }).success,
    ).toBe(false);
  });
  it("rejects forged fields and empty audit notes", () => {
    expect(
      commandSchema.safeParse({ action: "reviewOvertime", id: "ot1", approve: true, note: " " })
        .success,
    ).toBe(false);
    expect(
      commandSchema.safeParse({
        action: "addOvertime",
        date: "2026-11-01",
        start: "08:00",
        end: "09:00",
        reason: "Stock",
        workerId: "victim",
      }).success,
    ).toBe(false);
  });
  it("creates pending overtime with its existing counter successor", () => {
    const o = run(
      { action: "addOvertime", date: "2026-11-01", start: "23:00", end: "02:00", reason: "Stock" },
      worker,
      [],
      [],
    );
    expect(o.status).toBe("pendiente");
    expect(o.code).toBe("HE-000081");
    expect(o.minutes).toBe(180);
  });
  it("blocks overlap with legacy active and pending records", () => {
    for (const status of ["activo", "pendiente", "aprobada"] as const)
      expect(() =>
        run(
          {
            action: "addOvertime",
            date: overtime.date,
            start: "19:00",
            end: "21:00",
            reason: "Stock",
          },
          worker,
          [{ ...overtime, status }],
          [],
        ),
      ).toThrow("superpone");
  });
});
describe("Roles, approval, cancellation and actual rest", () => {
  it.each([worker, { ...boss, area: "B" }, { ...boss, active: false }])(
    "denies unauthorized manager $id $area $active",
    (actor) => {
      expect(() =>
        run(
          { action: "reviewCompensation", id: rest.id, approve: true, note: "Verificado" },
          actor,
        ),
      ).toThrow();
    },
  );
  it("allows admin to review across areas and records reviewer", () => {
    const result = run(
      { action: "reviewOvertime", id: overtime.id, approve: true, note: "Verificado" },
      { ...boss, role: "admin", area: "B" },
      [{ ...overtime, status: "pendiente" }],
    ) as Overtime;
    expect(result.reviewedBy).toBe(boss.id);
    expect(result.status).toBe("aprobada");
  });
  it("does not review twice or void committed minutes", () => {
    expect(() =>
      run({ action: "reviewOvertime", id: overtime.id, approve: true, note: "Verificado" }),
    ).toThrow("revisadas");
    expect(() => run({ action: "voidOvertime", id: overtime.id, note: "Error" })).toThrow(
      "comprometido",
    );
    expect(
      run({ action: "voidOvertime", id: overtime.id, note: "Error" }, boss, [overtime], []).status,
    ).toBe("anulada");
  });
  it("approves with reservation excluded from its own balance validation", () => {
    expect(
      run({ action: "reviewCompensation", id: rest.id, approve: true, note: "Verificado" }).status,
    ).toBe("aprobada");
    expect(
      run({ action: "reviewCompensation", id: rest.id, approve: false, note: "Sin cobertura" })
        .status,
    ).toBe("rechazada");
  });
  it("retains cancellation request motive when cancellation is rejected", () => {
    const futureRest = { ...rest, date: "2026-11-10" };
    const pending = run(
      { action: "requestCancellation", id: rest.id, note: "Cambio" },
      worker,
      [overtime],
      [{ ...futureRest, status: "aprobada" }],
    ) as Compensation;
    expect(pending.status).toBe("cancelacion_pendiente");
    const rejected = run(
      { action: "reviewCancellation", id: rest.id, approve: false, note: "Se mantiene" },
      boss,
      [overtime],
      [pending],
    ) as Compensation;
    expect(rejected.status).toBe("aprobada");
    expect(rejected.cancellationNote).toBe("Cambio");
    expect(rejected.cancellationReviewNote).toBe("Se mantiene");
    expect(
      run(
        { action: "reviewCancellation", id: rest.id, approve: true, note: "Se devuelve" },
        boss,
        [overtime],
        [pending],
      ).status,
    ).toBe("anulada");
  });
  it("requires an ended approved rest and a manager to manually confirm", () => {
    const approved = { ...rest, status: "aprobada" as const };
    expect(
      run(
        { action: "confirmRest", id: rest.id, note: "Asistencia verificada" },
        boss,
        [overtime],
        [approved],
      ).status,
    ).toBe("efectuada");
    const beforeEnd = new Date((interval(rest).end + 299) * 60000).toISOString();
    expect(() =>
      run(
        { action: "confirmRest", id: rest.id, note: "Verificado" },
        boss,
        [overtime],
        [approved],
        beforeEnd,
      ),
    ).toThrow("terminado");
    expect(() =>
      run(
        { action: "confirmRest", id: rest.id, note: "Verificado" },
        worker,
        [overtime],
        [approved],
      ),
    ).toThrow("permiso");
  });
  it("rejects overlapping requests and same-day source funding", () => {
    const command: Command = {
      action: "requestCompensation",
      date: rest.date,
      start: rest.start,
      end: rest.end,
      reason: "Descanso",
      allocations: rest.allocations,
    };
    expect(() => run(command, worker)).toThrow("superpone");
    expect(() => run({ ...command, date: overtime.date }, worker, [overtime], [])).toThrow(
      "distinta",
    );
  });
});
