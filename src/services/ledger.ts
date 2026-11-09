import type { Allocation, Balance, Compensation, MonthlyMovement, Overtime } from "@/types";

/**
 * Pure balance & ledger rules — independent of storage so Firestore / Firebase
 * can reuse them verbatim in backend Cloud Functions and transactions.
 *
 * NOTA PARA INTEGRACIÓN CON FIREBASE:
 * En la siguiente etapa, las operaciones críticas (solicitud de compensación,
 * aprobación/rechazo y anulación de horas extras) deben validarse en el backend
 * ejecutando estas mismas reglas dentro de una transacción de Firestore (`runTransaction`)
 * para asegurar atomicidad y evitar condiciones de carrera o inconsistencias de saldo.
 */

/** Minutes committed to a specific overtime record across given compensation statuses. */
export function usedMinutes(
  overtimeId: string,
  comps: Compensation[],
  statuses: Compensation["status"][] = ["pendiente", "aprobada"],
): number {
  return comps
    .filter((c) => statuses.includes(c.status))
    .reduce(
      (sum, c) =>
        sum +
        c.allocations.filter((a) => a.overtimeId === overtimeId).reduce((x, a) => x + a.minutes, 0),
      0,
    );
}

/** Remaining minutes available in a specific overtime record. */
export function availableFor(o: Overtime, comps: Compensation[]): number {
  if (o.status === "anulado") return 0;
  return Math.max(0, o.minutes - usedMinutes(o.id, comps));
}

/**
 * Historical balance of a worker across all time.
 *
 * Saldo histórico: todas las horas extras válidas (activas) menos compensaciones aprobadas.
 * Horas reservadas: minutos comprometidos en compensaciones pendientes.
 * Saldo disponible: saldo histórico menos horas reservadas.
 *
 * El saldo histórico CONSERVA horas acumuladas de meses anteriores.
 */
export function balanceOf(workerId: string, ots: Overtime[], comps: Compensation[]): Balance {
  const accumulated = ots
    .filter((o) => o.workerId === workerId && o.status === "activo")
    .reduce((s, o) => s + o.minutes, 0);

  const mine = comps.filter((c) => c.workerId === workerId);
  const approved = mine.filter((c) => c.status === "aprobada").reduce((s, c) => s + c.minutes, 0);

  const reserved = mine.filter((c) => c.status === "pendiente").reduce((s, c) => s + c.minutes, 0);

  const available = Math.max(0, accumulated - approved - reserved);

  return { accumulated, approved, reserved, available };
}

/**
 * Movimientos mensuales: horas extras realizadas y compensaciones
 * correspondientes exclusivamente al mes seleccionado (YYYY-MM).
 */
export function monthlyMovementsOf(
  workerId: string,
  ots: Overtime[],
  comps: Compensation[],
  month: string,
): MonthlyMovement {
  const inMonth = (d: string) => d.startsWith(month);

  const accumulated = ots
    .filter((o) => o.workerId === workerId && o.status === "activo" && inMonth(o.date))
    .reduce((s, o) => s + o.minutes, 0);

  const mine = comps.filter((c) => c.workerId === workerId && inMonth(c.date));
  const approved = mine.filter((c) => c.status === "aprobada").reduce((s, c) => s + c.minutes, 0);

  const reserved = mine.filter((c) => c.status === "pendiente").reduce((s, c) => s + c.minutes, 0);

  return { accumulated, approved, reserved };
}

/**
 * Validates manual overtime allocations for a compensation request.
 * - Duration must be valid (> 0 min).
 * - Sum of allocated minutes must match total requested minutes.
 * - Allocations for the same overtimeId are grouped together before validating availability.
 * - Cannot exceed available balance of any origin record.
 * - Cannot use minutes from void records or records belonging to another worker.
 * - Allocations must be positive whole minutes.
 */
export function validateAllocations(
  workerId: string,
  total: number,
  allocs: Allocation[],
  ots: Overtime[],
  comps: Compensation[],
): string | null {
  if (total <= 0) return "Indica un horario de descanso válido con duración mayor a 0 minutos.";
  const validAllocs = allocs.filter((a) => a.minutes > 0);
  if (!validAllocs.length) return "Selecciona al menos un registro de horas extras de origen.";

  // Group duplicate allocations by overtimeId
  const grouped = new Map<string, number>();
  for (const a of validAllocs) {
    if (!Number.isInteger(a.minutes) || a.minutes <= 0) {
      return "Los minutos asignados deben ser números enteros mayores a 0.";
    }
    grouped.set(a.overtimeId, (grouped.get(a.overtimeId) ?? 0) + a.minutes);
  }

  for (const [overtimeId, allocatedMins] of grouped.entries()) {
    const o = ots.find((x) => x.id === overtimeId);
    if (!o) return "Registro de origen no encontrado.";
    if (o.workerId !== workerId) return `El registro ${o.code} no pertenece al trabajador.`;
    if (o.status !== "activo") return `El registro ${o.code} no está activo (fue anulado).`;

    const available = availableFor(o, comps);
    if (allocatedMins > available) {
      return `${o.code}: los minutos seleccionados (${allocatedMins} min) superan el saldo disponible del registro (${available} min).`;
    }
  }

  const sum = Array.from(grouped.values()).reduce((s, a) => s + a, 0);
  if (sum !== total) {
    return `La suma seleccionada (${sum} min) debe coincidir exactamente con la duración solicitada (${total} min).`;
  }

  return null;
}

/**
 * Overtime record can be voided only if active and has 0 minutes in pending or approved compensations.
 */
export function canVoid(o: Overtime, comps: Compensation[]): boolean {
  return o.status === "activo" && usedMinutes(o.id, comps) === 0;
}
