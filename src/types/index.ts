export type Role = "trabajador" | "jefe" | "admin";
export interface User {
  id: string;
  username?: string;
  name: string;
  role: Role;
  area: string;
  active: boolean;
}
export type OvertimeStatus = "activo" | "anulado";
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
  createdAt: string;
}
export type CompStatus = "pendiente" | "aprobada" | "rechazada";
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
