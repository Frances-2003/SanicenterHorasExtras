export type Role = "trabajador" | "jefe" | "admin";
export interface User {
  id: string;
  username?: string;
  name: string;
  role: Role;
  area: string;
  authorizedAreas?: string[];
  active: boolean;
}
export type OvertimeStatus =
  "activo" | "anulado" | "pendiente" | "aprobada" | "rechazada" | "anulada";
export interface Overtime {
  id: string;
  code: string;
  workerId: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  reason: string;
  status: OvertimeStatus;
  voidReason?: string | undefined;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  voidedAt?: string;
  voidedBy?: string;
  createdAt: string;
}
export type CompStatus =
  "pendiente" | "aprobada" | "rechazada" | "cancelacion_pendiente" | "anulada" | "efectuada";
export interface Allocation {
  overtimeId: string;
  minutes: number;
}
export interface Compensation {
  id: string;
  code: string;
  workerId: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  reason: string;
  status: CompStatus;
  allocations: Allocation[];
  reviewNote?: string | undefined;
  createdAt: string;
  reviewedAt?: string | undefined;
  reviewedBy?: string;
  confirmedAt?: string;
  confirmedBy?: string;
  cancellationRequestedAt?: string;
  cancellationReviewedAt?: string;
  cancellationReviewedBy?: string;
  cancellationNote?: string;
  cancellationReviewNote?: string;
  confirmationNote?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}
export interface CalendarEntry {
  id: string;
  workerId: string;
  workerName: string;
  area: string;
  code: string;
  date: string;
  start: string;
  end: string;
  minutes: number;
  status: "aprobada" | "cancelacion_pendiente" | "efectuada";
}
export interface Balance {
  accumulated: number;
  approved: number;
  reserved: number;
  available: number;
}
export interface MonthlyMovement {
  accumulated: number;
  approved: number;
  reserved: number;
}
