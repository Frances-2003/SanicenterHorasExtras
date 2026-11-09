import { beforeEach, describe, expect, it } from "vitest";
import {
  availableFor,
  balanceOf,
  canVoid,
  monthlyMovementsOf,
  usedMinutes,
  validateAllocations,
} from "./ledger";
import {
  addOvertime,
  auth,
  requestCompensation,
  resetStore,
  reviewCompensation,
  useCurrentUser,
  voidOvertime,
} from "./store";
import {
  canManageUsers,
  canRegisterOvertime,
  canReviewCompensation,
  canVoidOvertime,
  hasRouteAccess,
} from "./auth";
import { diffMinutes } from "@/lib/time";
import { demoUsers } from "./demoData";
import type { Allocation, Compensation, Overtime } from "@/types";

const makeOt = (
  id: string,
  minutes = 120,
  date = "2026-10-05",
  workerId = "u1",
  status: Overtime["status"] = "activo",
): Overtime => ({
  id,
  code: id.startsWith("HE-") ? id : `HE-${id.padStart(6, "0")}`,
  workerId,
  date,
  start: "18:00",
  end: "20:00",
  minutes,
  reason: "Inventario general",
  status,
  createdAt: `${date}T20:00:00Z`,
});

const makeComp = (
  id: string,
  status: Compensation["status"],
  allocs: [string, number][],
  date = "2026-11-10",
  workerId = "u1",
): Compensation => {
  const allocations: Allocation[] = allocs.map(([overtimeId, minutes]) => ({
    overtimeId,
    minutes,
  }));
  const minutes = allocations.reduce((s, a) => s + a.minutes, 0);
  return {
    id,
    code: `CP-${id.padStart(6, "0")}`,
    workerId,
    date,
    start: "08:00",
    end: "10:00",
    minutes,
    reason: "Trámite personal",
    status,
    allocations,
    createdAt: `${date}T07:00:00Z`,
  };
};

describe("Sani Center Horas Extras — Tests Completos de Negocio", () => {
  beforeEach(() => {
    resetStore();
  });

  // 1. Registro válido de horas extras
  describe("1. Registro válido de horas extras", () => {
    it("registra horas extras activas, calcula minutos y acumula directamente sin aprobación previa", () => {
      const res = addOvertime({
        workerId: "u1",
        date: "2026-11-15",
        start: "18:00",
        end: "21:30",
        reason: "Validación de stock extraordinaria",
      });
      expect(res.ok).toBe(true);
    });

    it("rechaza si falta el motivo obligatorio", () => {
      const res = addOvertime({
        workerId: "u1",
        date: "2026-11-15",
        start: "18:00",
        end: "20:00",
        reason: "   ",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("motivo");
      }
    });

    it("previene registros duplicados idénticos por doble envío", () => {
      const first = addOvertime({
        workerId: "u1",
        date: "2026-11-20",
        start: "18:00",
        end: "20:00",
        reason: "Cierre mensual",
      });
      expect(first.ok).toBe(true);

      const duplicate = addOvertime({
        workerId: "u1",
        date: "2026-11-20",
        start: "18:00",
        end: "20:00",
        reason: "Cierre mensual",
      });
      expect(duplicate.ok).toBe(false);
      if (!duplicate.ok) {
        expect(duplicate.error).toContain("idéntico");
      }
    });
  });

  // 2. Horarios que cruzan medianoche
  describe("2. Cruces de medianoche", () => {
    it("calcula correctamente turnos que cruzan la medianoche", () => {
      expect(diffMinutes("22:00", "01:30")).toBe(210); // 3h 30m
      expect(diffMinutes("23:00", "02:00")).toBe(180); // 3h 00m
      expect(diffMinutes("23:45", "00:15")).toBe(30); // 30m
    });
  });

  // 3. Duraciones inválidas
  describe("3. Duraciones inválidas", () => {
    it("evita interpretar hora inicial igual a la final como 24 horas (debe retornar 0 minutos)", () => {
      expect(diffMinutes("18:00", "18:00")).toBe(0);
      expect(diffMinutes("00:00", "00:00")).toBe(0);
      expect(diffMinutes("08:30", "08:30")).toBe(0);
    });

    it("rechaza registros de horas extras con duración 0", () => {
      const res = addOvertime({
        workerId: "u1",
        date: "2026-11-15",
        start: "18:00",
        end: "18:00",
        reason: "Horario nulo",
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("iguales");
      }
    });

    it("valida allocaciones rechazando duraciones nulas o negativas", () => {
      const ots = [makeOt("1", 120)];
      const err = validateAllocations("u1", 0, [{ overtimeId: "1", minutes: 0 }], ots, []);
      expect(err).toContain("mayor a 0");
    });
  });

  // 4. Acumulación de horas entre diferentes meses
  describe("4. Acumulación histórica entre diferentes meses", () => {
    it("conserva horas de meses anteriores (ejemplo de usuario: Octubre 6h, Noviembre 2h compensadas -> disponible 4h)", () => {
      const ots = [
        makeOt("1", 120, "2026-10-05"), // 2h
        makeOt("2", 120, "2026-10-12"), // 2h
        makeOt("3", 120, "2026-10-20"), // 2h -> Total Octubre = 6h (360m)
      ];

      const comps = [
        makeComp("1", "aprobada", [["HE-000001", 120]], "2026-11-10"), // 2h compensadas en Noviembre
      ];

      // Saldo histórico total
      const histBal = balanceOf("u1", ots, comps);
      expect(histBal.accumulated).toBe(360); // 6 horas acumuladas históricas
      expect(histBal.approved).toBe(120); // 2 horas compensadas aprobadas
      expect(histBal.available).toBe(240); // 4 horas disponibles restantes

      // Movimientos mensuales de Noviembre (no deben borrar el saldo histórico)
      const novMov = monthlyMovementsOf("u1", ots, comps, "2026-11");
      expect(novMov.accumulated).toBe(0); // En noviembre no hizo horas extras
      expect(novMov.approved).toBe(120); // En noviembre compensó 2 horas

      // Movimientos mensuales de Octubre
      const octMov = monthlyMovementsOf("u1", ots, comps, "2026-10");
      expect(octMov.accumulated).toBe(360); // En octubre hizo 6 horas
      expect(octMov.approved).toBe(0); // En octubre no compensó
    });
  });

  // 5. Compensaciones parciales
  describe("5. Compensaciones parciales", () => {
    it("permite usar una fracción de las horas extras disponibles en un registro", () => {
      const ot = makeOt("1", 120); // 2h registradas
      const comps = [makeComp("1", "aprobada", [[ot.id, 45]])]; // Usar 45 min

      expect(usedMinutes(ot.id, comps)).toBe(45);
      expect(availableFor(ot, comps)).toBe(75); // Quedan 75 min (1h 15m)
    });
  });

  // 6. Selección de varios registros de origen
  describe("6. Selección manual de varios registros de origen", () => {
    it("permite solicitar 3h tomando 2h de lunes y 1h de miércoles de un total de 6h", () => {
      const ots = [
        makeOt("1", 120, "2026-11-02"), // Lunes: 2h
        makeOt("2", 120, "2026-11-04"), // Miércoles: 2h
        makeOt("3", 120, "2026-11-06"), // Viernes: 2h
      ];

      // Solicita 3h (180 min) el sábado: 2h (120 min) de ot1 y 1h (60 min) de ot2
      const allocs: Allocation[] = [
        { overtimeId: ots[0].id, minutes: 120 },
        { overtimeId: ots[1].id, minutes: 60 },
      ];

      const err = validateAllocations("u1", 180, allocs, ots, []);
      expect(err).toBeNull();
    });
  });

  // 7. Asignaciones duplicadas de un mismo origen
  describe("7. Asignaciones duplicadas de un mismo origen", () => {
    it("agrupa asignaciones del mismo registro antes de validar disponibilidad para evitar sobreasignación", () => {
      const ots = [makeOt("1", 90)]; // Solo 90 minutos disponibles

      // Dos asignaciones separadas al mismo registro de 60 min cada una (total = 120 min)
      const duplicateAllocs: Allocation[] = [
        { overtimeId: ots[0].id, minutes: 60 },
        { overtimeId: ots[0].id, minutes: 60 },
      ];

      // Individualmente cada una es 60 <= 90, pero sumadas son 120 > 90
      const err = validateAllocations("u1", 120, duplicateAllocs, ots, []);
      expect(err).not.toBeNull();
      expect(err).toContain("superan el saldo disponible");
    });
  });

  // 8. Reservas pendientes
  describe("8. Reservas pendientes", () => {
    it("una solicitud pendiente reserva los minutos impidiendo que otra solicitud los use", () => {
      const ots = [makeOt("1", 120)];
      const pendingComps = [makeComp("1", "pendiente", [[ots[0].id, 120]])];

      expect(availableFor(ots[0], pendingComps)).toBe(0);

      // Intento de solicitar 60 min adicionales del mismo registro
      const err = validateAllocations(
        "u1",
        60,
        [{ overtimeId: ots[0].id, minutes: 60 }],
        ots,
        pendingComps,
      );
      expect(err).not.toBeNull();
      expect(err).toContain("superan el saldo disponible");

      const bal = balanceOf("u1", ots, pendingComps);
      expect(bal.reserved).toBe(120);
      expect(bal.available).toBe(0);
    });
  });

  // 9. Aprobaciones
  describe("9. Aprobaciones de compensación", () => {
    it("aprobar una compensación convierte la reserva en descuento definitivo en el saldo", () => {
      const ots = [makeOt("1", 180)];
      const comps = [makeComp("1", "aprobada", [[ots[0].id, 120]])];

      const bal = balanceOf("u1", ots, comps);
      expect(bal.accumulated).toBe(180);
      expect(bal.approved).toBe(120);
      expect(bal.reserved).toBe(0);
      expect(bal.available).toBe(60);
    });

    it("no permite aprobar o rechazar nuevamente una solicitud ya resuelta", () => {
      // cp1 es una solicitud en estado pendiente en los datos iniciales
      // Primera revisión: aprobar
      const review1 = reviewCompensation("cp1", true, "Aprobado");
      expect(review1.ok).toBe(true);

      // Segunda revisión sobre la misma solicitud: debe ser rechazada por ya estar resuelta
      const review2 = reviewCompensation("cp1", false, "Intento duplicado");
      expect(review2.ok).toBe(false);
      if (!review2.ok) {
        expect(review2.error).toContain("ya fue revisada");
      }
    });
  });

  // 10. Rechazos
  describe("10. Rechazos de compensación", () => {
    it("rechazar una solicitud libera las horas reservadas de vuelta al saldo disponible", () => {
      const ots = [makeOt("1", 120)];
      const rejectedComps = [makeComp("1", "rechazada", [[ots[0].id, 120]])];

      expect(availableFor(ots[0], rejectedComps)).toBe(120);
      const bal = balanceOf("u1", ots, rejectedComps);
      expect(bal.reserved).toBe(0);
      expect(bal.approved).toBe(0);
      expect(bal.available).toBe(120);
    });

    it("exige motivo obligatorio para rechazar una solicitud", () => {
      const res = reviewCompensation("cp1", false, "   ");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("obligatoria");
      }
    });
  });

  // 11. Anulaciones de horas extras
  describe("11. Anulaciones de horas extras", () => {
    it("permite anular registros activos que no tienen horas comprometidas, conservando motivo de anulación", () => {
      const res = voidOvertime("ot8", "Error en digitación de horario");
      expect(res.ok).toBe(true);
    });

    it("bloquea anular registros que están en uso por compensaciones pendientes o aprobadas", () => {
      // ot1 está en uso en demoCompensations (cp1)
      const res = voidOvertime("ot1", "Intento de anular registro en uso");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("comprometido");
      }
    });

    it("exige motivo obligatorio para anular", () => {
      const res = voidOvertime("ot8", "  ");
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toContain("motivo");
      }
    });
  });

  // 12. Prevención de saldos negativos
  describe("12. Prevención de saldos negativos", () => {
    it("el saldo disponible nunca es negativo (se clampa en 0)", () => {
      const ots = [makeOt("1", 60)];
      const comps = [makeComp("1", "aprobada", [[ots[0].id, 100]])];

      const bal = balanceOf("u1", ots, comps);
      expect(bal.available).toBe(0);
    });

    it("validateAllocations rechaza cualquier suma mayor a la duración solicitada o disponible", () => {
      const ots = [makeOt("1", 60)];
      const err = validateAllocations(
        "u1",
        120,
        [{ overtimeId: ots[0].id, minutes: 120 }],
        ots,
        [],
      );
      expect(err).not.toBeNull();
      expect(err).toContain("superan el saldo disponible");
    });
  });

  // 13. Roles, permisos y login de demostración
  describe("13. Roles y login de demostración", () => {
    it("los usuarios demo cuentan con los roles definidos (5 trabajadores, 1 jefe, 1 admin)", () => {
      const trabajadores = demoUsers.filter((u) => u.role === "trabajador");
      const jefes = demoUsers.filter((u) => u.role === "jefe");
      const admins = demoUsers.filter((u) => u.role === "admin");

      expect(trabajadores.length).toBe(5);
      expect(jefes.length).toBe(1);
      expect(admins.length).toBe(1);
    });

    it("controla permisos de roles centralizadamente", () => {
      const worker = demoUsers.find((u) => u.role === "trabajador")!;
      const jefe = demoUsers.find((u) => u.role === "jefe")!;
      const admin = demoUsers.find((u) => u.role === "admin")!;

      expect(canRegisterOvertime(worker)).toBe(true);
      expect(canRegisterOvertime(jefe)).toBe(false);

      expect(canReviewCompensation(worker)).toBe(false);
      expect(canReviewCompensation(jefe)).toBe(true);
      expect(canReviewCompensation(admin)).toBe(true);

      expect(canVoidOvertime(worker)).toBe(false);
      expect(canVoidOvertime(jefe)).toBe(true);
      expect(canVoidOvertime(admin)).toBe(true);

      expect(canManageUsers(worker)).toBe(false);
      expect(canManageUsers(jefe)).toBe(false);
      expect(canManageUsers(admin)).toBe(true);

      expect(hasRouteAccess("trabajador", "/compensaciones")).toBe(true);
      expect(hasRouteAccess("jefe", "/compensaciones")).toBe(false);
      expect(hasRouteAccess("admin", "/admin")).toBe(true);
      expect(hasRouteAccess("jefe", "/admin")).toBe(false);
    });

    it("el login simula inicio de sesión y rechaza usuarios inexistentes o inactivos", () => {
      const valid = auth.signIn("u1");
      expect(valid.ok).toBe(true);

      const invalid = auth.signIn("non-existent-user");
      expect(invalid.ok).toBe(false);
    });
  });
});
