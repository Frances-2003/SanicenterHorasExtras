import { z } from "zod";
import type { Compensation, Overtime, User } from "../types";
import { code, diffMinutes } from "../lib/time";
import { canVoid, validateAllocations } from "./ledger";
import { canManageArea } from "./auth";

const id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[\w-]+$/);
const note = z.string().trim().min(1).max(2000);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = Date.parse(`${d}T00:00:00Z`);
    return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d && d >= "0100-01-01";
  }, "Fecha inválida");
const schedule = { date, start: time, end: time, reason: note };
export const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("addOvertime"), ...schedule }).strict(),
  z
    .object({
      action: z.literal("requestCompensation"),
      ...schedule,
      allocations: z
        .array(
          z.object({ overtimeId: id, minutes: z.number().int().positive().max(1440) }).strict(),
        )
        .min(1)
        .max(50),
    })
    .strict(),
  z.object({ action: z.literal("reviewOvertime"), id, approve: z.boolean(), note }).strict(),
  z.object({ action: z.literal("voidOvertime"), id, note }).strict(),
  z.object({ action: z.literal("reviewCompensation"), id, approve: z.boolean(), note }).strict(),
  z.object({ action: z.literal("requestCancellation"), id, note }).strict(),
  z
    .object({
      action: z.literal("reviewCancellation"),
      id,
      approve: z.boolean(),
      note,
      direct: z.boolean().optional(),
    })
    .strict(),
  z.object({ action: z.literal("confirmRest"), id, note }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;

export class WorkflowError extends Error {}
function requireThat(value: unknown, message: string): asserts value {
  if (!value) throw new WorkflowError(message);
}
export const reservingStatuses = ["pendiente", "aprobada", "cancelacion_pendiente", "efectuada"];
export function interval(record: { date: string; start: string; end: string }) {
  const [h = 0, m = 0] = record.start.split(":").map(Number);
  const start = Date.parse(`${record.date}T00:00:00Z`) / 60000 + h * 60 + m;
  return { start, end: start + diffMinutes(record.start, record.end) };
}
export function overlaps(
  a: { date: string; start: string; end: string },
  b: { date: string; start: string; end: string },
) {
  const x = interval(a),
    y = interval(b);
  return x.start < y.end && y.start < x.end;
}

export function canAnnulBeforeStart(
  comp: Pick<Compensation, "date" | "start" | "end"> & { status: string },
  now = Date.now(),
): boolean {
  return (
    ["aprobada", "cancelacion_pendiente"].includes(comp.status) &&
    now < (interval(comp).start + 300) * 60000
  );
}

/** Pure transition; caller must hold the worker lock and write record + audit atomically. */
export function transition(
  command: Command,
  actor: User,
  worker: User,
  ots: Overtime[],
  comps: Compensation[],
  recordId: string,
  nextNumber: number,
  now: string,
): Overtime | Compensation {
  requireThat(
    actor.active && worker.active && worker.role === "trabajador",
    "Usuario inactivo o trabajador inválido.",
  );
  const c = command;
  const own = actor.id === worker.id && actor.role === "trabajador";
  const manager = actor.id !== worker.id && canManageArea(actor, worker.area);
  if (c.action === "addOvertime" || c.action === "requestCompensation") {
    requireThat(own, "Solo puedes registrar solicitudes propias.");
    const minutes = diffMinutes(c.start, c.end);
    requireThat(minutes > 0 && minutes <= 1440, "Duración inválida.");
    if (c.action === "addOvertime") {
      requireThat(
        !ots.some((o) => ["activo", "pendiente", "aprobada"].includes(o.status) && overlaps(c, o)),
        "El horario se superpone con otras horas extras del trabajador.",
      );
      return {
        ...c,
        id: recordId,
        code: code("HE", nextNumber),
        workerId: worker.id,
        minutes,
        status: "pendiente",
        createdAt: now,
      };
    }
    requireThat(
      !comps.some((x) => reservingStatuses.includes(x.status) && overlaps(c, x)),
      "El descanso se superpone con otra compensación.",
    );
    const err = validateAllocations(worker.id, minutes, c.allocations, ots, comps);
    requireThat(!err, err || "Asignación inválida.");
    requireThat(
      !ots.some((o) => c.allocations.some((a) => a.overtimeId === o.id) && o.date === c.date),
      "El descanso debe tener una fecha distinta de sus horas extras de origen.",
    );
    const grouped = new Map<string, number>();
    c.allocations.forEach((a) =>
      grouped.set(a.overtimeId, (grouped.get(a.overtimeId) || 0) + a.minutes),
    );
    return {
      id: recordId,
      code: code("CP", nextNumber),
      workerId: worker.id,
      date: c.date,
      start: c.start,
      end: c.end,
      reason: c.reason,
      minutes,
      allocations: [...grouped].map(([overtimeId, minutes]) => ({ overtimeId, minutes })),
      status: "pendiente",
      createdAt: now,
    };
  }
  if (c.action === "reviewOvertime" || c.action === "voidOvertime") {
    requireThat(manager, "No tienes permiso para revisar este trabajador.");
    const o = ots.find((x) => x.id === c.id);
    requireThat(o, "Registro no encontrado.");
    if (c.action === "voidOvertime") {
      requireThat(canVoid(o, comps), "No se puede anular: estado inválido o saldo comprometido.");
      return { ...o, status: "anulada", voidReason: c.note, voidedAt: now, voidedBy: actor.id };
    }
    requireThat(o.status === "pendiente", "Las horas extras ya fueron revisadas.");
    return {
      ...o,
      status: c.approve ? "aprobada" : "rechazada",
      reviewedAt: now,
      reviewedBy: actor.id,
      reviewNote: c.note,
    };
  }
  const comp = comps.find((x) => x.id === c.id);
  requireThat(comp, "Solicitud no encontrada.");
  if (c.action === "requestCancellation") {
    requireThat(
      own && comp.status === "aprobada",
      "Solo puedes solicitar la cancelación de un descanso propio aprobado.",
    );
    requireThat(
      canAnnulBeforeStart(comp, Date.parse(now)),
      "Solo se puede solicitar o autorizar la anulación antes del inicio del descanso (hora de Perú).",
    );
    return {
      ...comp,
      status: "cancelacion_pendiente",
      cancellationRequestedAt: now,
      cancellationNote: c.note,
    };
  }
  requireThat(manager, "No tienes permiso para revisar este trabajador.");
  if (c.action === "reviewCompensation") {
    requireThat(comp.status === "pendiente", "La solicitud ya fue revisada.");
    if (c.approve) {
      const err = validateAllocations(
        worker.id,
        comp.minutes,
        comp.allocations,
        ots,
        comps.filter((x) => x.id !== comp.id),
      );
      requireThat(!err, err || "Saldo inválido.");
    }
    return {
      ...comp,
      status: c.approve ? "aprobada" : "rechazada",
      reviewedAt: now,
      reviewedBy: actor.id,
      reviewNote: c.note,
    };
  }
  if (c.action === "reviewCancellation") {
    if (c.direct)
      requireThat(
        c.approve && comp.status === "aprobada",
        "Solo se puede anular directamente una compensación aprobada.",
      );
    else requireThat(comp.status === "cancelacion_pendiente", "No hay una anulación pendiente.");
    if (c.approve)
      requireThat(
        canAnnulBeforeStart(comp, Date.parse(now)),
        "Solo se puede solicitar o autorizar la anulación antes del inicio del descanso (hora de Perú).",
      );
    return {
      ...comp,
      status: c.approve ? "anulada" : "aprobada",
      cancellationReviewedAt: now,
      cancellationReviewedBy: actor.id,
      cancellationReviewNote: c.note,
      ...(c.approve ? { voidedAt: now, voidedBy: actor.id, voidReason: c.note } : {}),
    };
  }
  requireThat(
    comp.status === "aprobada",
    "Solo puedes confirmar descansos aprobados sin cancelación pendiente.",
  );
  // Schedules use Peru local time (UTC-5), including an overnight end.
  requireThat(
    Date.parse(now) / 60000 >= interval(comp).end + 300,
    "El descanso todavía no ha terminado.",
  );
  return {
    ...comp,
    status: "efectuada",
    confirmedAt: now,
    confirmedBy: actor.id,
    confirmationNote: c.note,
  };
}
