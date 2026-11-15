import { describe, expect, it } from "vitest";
import type { Compensation, Overtime, User } from "../types";
import {
  canRegisterOvertime,
  canRequestCompensation,
  canReviewRequestsFor,
  hasRouteAccess,
} from "./auth";
import { balanceOf, validateAllocations } from "./ledger";
import { commandSchema, transition, type Command } from "./workflow";
import { dashboardOf } from "./dashboard";

const jefe: User = {
  id: "jefe",
  username: "JPAREDES",
  name: "Jamil Paredes",
  role: "jefe",
  area: "Inventario",
  active: true,
};
const worker: User = { ...jefe, id: "worker", username: "JBERNALES", role: "trabajador" };
const now = "2026-11-15T12:00:00Z";
const overtime = (id: string, minutes = 180): Overtime => ({
  id,
  code: `HE-${id}`,
  workerId: jefe.id,
  date: "2026-11-01",
  start: "18:00",
  end: "21:00",
  minutes,
  status: "aprobada",
  reason: "Inventario",
  createdAt: now,
});
const rest = (allocations: Compensation["allocations"], end = "09:00"): Command => ({
  action: "requestCompensation",
  date: "2099-11-20",
  start: "08:00",
  end,
  reason: "Descanso",
  allocations,
});
const run = (
  command: Command,
  ots: Overtime[] = [],
  comps: Compensation[] = [],
  actor = jefe,
  owner = jefe,
) => transition(command, actor, owner, ots, comps, "new", 9, now);

describe("Jefe personal requests and explicit self-review", () => {
  it("keeps a jefe's overtime pending until a separate self-approval, then reserves and approves their rest", () => {
    const pending = run({
      action: "addOvertime",
      date: "2026-11-01",
      start: "23:00",
      end: "02:00",
      reason: "Inventario",
    }) as Overtime;
    expect(pending.status).toBe("pendiente");
    expect(pending.minutes).toBe(180);
    expect(balanceOf(jefe.id, [pending], []).available).toBe(0);
    const approved = run(
      { action: "reviewOvertime", id: pending.id, approve: true, note: "Revisión propia" },
      [pending],
    ) as Overtime;
    expect(approved.reviewedBy).toBe(jefe.id);
    expect(balanceOf(jefe.id, [approved], []).available).toBe(180);
    const requested = run(rest([{ overtimeId: approved.id, minutes: 60 }]), [
      approved,
    ]) as Compensation;
    expect(requested.status).toBe("pendiente");
    expect(balanceOf(jefe.id, [approved], [requested])).toMatchObject({
      available: 120,
      reserved: 60,
      approved: 0,
    });
    const accepted = run(
      { action: "reviewCompensation", id: requested.id, approve: true, note: "Revisión propia" },
      [approved],
      [requested],
    ) as Compensation;
    expect(accepted.status).toBe("aprobada");
    expect(accepted.reviewedBy).toBe(jefe.id);
    expect(balanceOf(jefe.id, [approved], [accepted])).toMatchObject({
      available: 120,
      reserved: 0,
      approved: 60,
    });
    const rejected = run(
      { action: "reviewCompensation", id: requested.id, approve: false, note: "Rechazo propio" },
      [approved],
      [requested],
    ) as Compensation;
    expect(balanceOf(jefe.id, [approved], [rejected]).available).toBe(180);
    const annulled = run(
      {
        action: "reviewCancellation",
        id: accepted.id,
        direct: true,
        approve: true,
        note: "Cambio",
      },
      [approved],
      [accepted],
    ) as Compensation;
    expect(balanceOf(jefe.id, [approved], [annulled]).available).toBe(180);
    expect(() =>
      run({ action: "reviewOvertime", id: approved.id, approve: true, note: "Otra vez" }, [
        approved,
      ]),
    ).toThrow("revisadas");
  });
  it("can reject own overtime without accumulating any balance", () => {
    const pending = { ...overtime("p"), status: "pendiente" as const };
    const rejected = run(
      { action: "reviewOvertime", id: pending.id, approve: false, note: "No corresponde" },
      [pending],
    ) as Overtime;
    expect(rejected.status).toBe("rechazada");
    expect(balanceOf(jefe.id, [rejected], []).available).toBe(0);
  });
  it("preserves worker creation and jefe area scope while denying worker/admin self-approval", () => {
    expect(canRegisterOvertime(worker)).toBe(true);
    expect(canRegisterOvertime(jefe)).toBe(true);
    expect(canRequestCompensation(jefe)).toBe(true);
    expect(hasRouteAccess("jefe", "/compensaciones")).toBe(true);
    expect(canReviewRequestsFor(jefe, worker)).toBe(true);
    expect(canReviewRequestsFor(jefe, jefe)).toBe(true);
    expect(canReviewRequestsFor(jefe, { ...worker, area: "Ventas" })).toBe(false);
    expect(canReviewRequestsFor(worker, worker)).toBe(false);
    expect(canReviewRequestsFor({ ...jefe, active: false }, jefe)).toBe(false);
    const admin = { ...jefe, role: "admin" as const };
    expect(canRegisterOvertime(admin)).toBe(false);
    expect(canReviewRequestsFor(admin, admin)).toBe(false);
    expect(canReviewRequestsFor({ ...admin, id: "admin" }, jefe)).toBe(true);
    for (const action of ["reviewOvertime", "reviewCompensation"] as const) {
      expect(() =>
        run({ action, id: "own", approve: true, note: "Propia" }, [], [], worker, worker),
      ).toThrow();
    }
    expect(() =>
      run(
        {
          action: "addOvertime",
          date: "2026-11-02",
          start: "18:00",
          end: "19:00",
          reason: "Trabajo",
        },
        [],
        [],
        admin,
        admin,
      ),
    ).toThrow();
  });
  it("includes the jefe's own approved hours in dashboard without granting other areas", () => {
    const data = dashboardOf(
      jefe,
      [jefe, worker, { ...worker, id: "other", area: "Ventas" }],
      [overtime("own")],
      [],
      { from: "", to: "", area: "" },
    );
    expect(data.rows.map((r) => r.id)).toContain(jefe.id);
    expect(data.rows.map((r) => r.id)).not.toContain("other");
    expect(data.totals.available).toBe(180);
    expect(data.totals.approved).toBe(180);
  });
});

describe("Whole hours for new schedules and each allocation", () => {
  it.each(["08:15", "08:30", "08:45", "09:30", "10:30"])(
    "rejects a fractional duration ending at %s in both schema and transition",
    (end) => {
      const create: Command = {
        action: "addOvertime",
        date: "2026-11-01",
        start: "08:00",
        end,
        reason: "Inventario",
      };
      expect(commandSchema.safeParse(create).success).toBe(false);
      expect(() => run(create)).toThrow("horas completas");
      const request = rest([{ overtimeId: "a", minutes: 60 }], end);
      expect(commandSchema.safeParse(request).success).toBe(false);
      expect(() => run(request, [overtime("a")])).toThrow("horas completas");
    },
  );
  it("rejects per-source fractions even when their total is one whole hour", () => {
    const request = rest([
      { overtimeId: "a", minutes: 30 },
      { overtimeId: "b", minutes: 30 },
    ]);
    expect(commandSchema.safeParse(request).success).toBe(false);
    expect(() => run(request, [overtime("a"), overtime("b")])).toThrow("horas completas");
  });
  it("supports one hour out of three and three hours from two two-hour sources", () => {
    const one = run(rest([{ overtimeId: "a", minutes: 60 }]), [overtime("a")]) as Compensation;
    expect(balanceOf(jefe.id, [overtime("a")], [one]).available).toBe(120);
    const ots = [overtime("a", 120), overtime("b", 120)];
    const three = run(
      rest(
        [
          { overtimeId: "a", minutes: 120 },
          { overtimeId: "b", minutes: 60 },
        ],
        "11:00",
      ),
      ots,
    ) as Compensation;
    expect(balanceOf(jefe.id, ots, [three]).available).toBe(60);
    expect(
      validateAllocations(jefe.id, 120, [{ overtimeId: "a", minutes: 120 }], ots, [], true),
    ).toBeNull();
  });
  it("preserves fractional history and legacy pending approvals without rounding balances", () => {
    const legacy = overtime("legacy", 150),
      snapshot = structuredClone(legacy);
    const requested = run(rest([{ overtimeId: legacy.id, minutes: 120 }], "10:00"), [
      legacy,
    ]) as Compensation;
    expect(balanceOf(jefe.id, [legacy], [requested]).available).toBe(30);
    expect(legacy).toEqual(snapshot);
    const oldPending: Compensation = {
      id: "old",
      code: "CP-old",
      workerId: jefe.id,
      date: "2099-11-25",
      start: "08:00",
      end: "08:30",
      minutes: 30,
      status: "pendiente",
      createdAt: now,
      reason: "Histórico",
      allocations: [{ overtimeId: legacy.id, minutes: 30 }],
    };
    const reviewed = run(
      {
        action: "reviewCompensation",
        id: oldPending.id,
        approve: true,
        note: "Revisión histórica",
      },
      [legacy],
      [oldPending],
    ) as Compensation;
    expect(reviewed.minutes).toBe(30);
    expect(reviewed.allocations).toEqual(oldPending.allocations);
    expect(balanceOf(jefe.id, [legacy], [reviewed]).available).toBe(120);
    expect(commandSchema.safeParse(rest(oldPending.allocations, "08:30")).success).toBe(false);
  });
});
