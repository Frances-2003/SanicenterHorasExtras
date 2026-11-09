import { useSyncExternalStore } from "react";
import type { Allocation, Compensation, Overtime, User } from "@/types";
import { canVoid, validateAllocations } from "./ledger";
import { code, diffMinutes } from "@/lib/time";

import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { firebaseAuth, db } from "@/lib/firebase";

import { signOut } from "firebase/auth";
/**
 * In-memory demo repository for Sani Center Horas Extras.
 * Every data access and mutation passes through these functions,
 * making future replacement with Firebase Authentication and Cloud Firestore
 * a clean swap without modifying page views or components.
 *
 * NOTA PARA INTEGRACIÓN CON FIREBASE:
 * 1. `auth.signIn` y `auth.signOut` se sustituirán por llamadas al SDK de Firebase:
 *    `signInWithEmailAndPassword(auth, email, password)` y `signOut(auth)`.
 * 2. Las colecciones `overtime` y `comps` residirán en Firestore (`/overtime`, `/compensations`).
 * 3. `addOvertime`, `requestCompensation`, `reviewCompensation` y `voidOvertime` se ejecutarán
 *    usando transacciones Firestore (`runTransaction`) para validación atómica segura en backend.
 */
interface State {
  users: User[];
  overtime: Overtime[];
  comps: Compensation[];
  currentUserId: string | null;
  authLoading: boolean;
}

const initialState: State = {
  users: [],
  overtime: [],
  comps: [],
  currentUserId: null,
  authLoading: true,
};

let state: State = { ...initialState };
const listeners = new Set<() => void>();

// firebaseauthentication
let stopAuthObserver: (() => void) | null = null;

const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};


/**
 * Sincroniza el perfil autenticado de Firebase con el estado
 * que utilizan AppShell y las páginas del sistema.
 */
export function setAuthenticatedUser(user: User | null) {
  // Detener la consulta anterior y limpiar sus registros.
  stopOvertimeListening();

  set({
    users: user ? [user] : [],
    currentUserId: user?.id ?? null,
    authLoading: false,
  });

  // Iniciar la consulta solo para trabajadores activos.
  if (user?.active && user.role === "trabajador") {
    startOvertimeObserver(user.id);
  }
}

export function startAuthObserver() {
  if (typeof window === "undefined") return;
  if (stopAuthObserver) return;

  stopAuthObserver = onAuthStateChanged(
    firebaseAuth,
    async (firebaseUser) => {
      if (!firebaseUser) {
        setAuthenticatedUser(null);
        return;
      }

      try {
        const snapshot = await getDoc(
          doc(db, "users", firebaseUser.uid)
        );

        if (!snapshot.exists()) {
          setAuthenticatedUser(null);
          return;
        }

        const data = snapshot.data();

        if (
          data["active"] !== true ||
          !["trabajador", "jefe", "admin"].includes(data["role"])
        ) {
          setAuthenticatedUser(null);
          return;
        }

        setAuthenticatedUser({
          id: firebaseUser.uid,
          username: data["username"],
          name: data["name"],
          role: data["role"],
          area: data["area"],
          active: true,
        } as User);
      } catch (error) {
        console.error("Error al recuperar el perfil:", error);
        setAuthenticatedUser(null);
      }
    }
  );
}

export const useStore = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );

export const useCurrentUser = () => {
  const s = useStore();
  return s.users.find((u) => u.id === s.currentUserId) ?? null;
};

const nextNum = (list: { code: string }[]) =>
  Math.max(0, ...list.map((x) => Number(x.code.split("-")[1] ?? 0))) + 1;

export const nextOvertimeCode = () => code("HE", nextNum(state.overtime));
export const nextCompCode = () => code("CP", nextNum(state.comps));

export const auth = {
  signIn(userId: string): { ok: boolean; error?: string } {
    const user = state.users.find((u) => u.id === userId);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    if (!user.active) return { ok: false, error: "El usuario está inactivo." };
    set({ currentUserId: userId });
    return { ok: true };
  },
  async signOut() {
    await signOut(firebaseAuth);
    setAuthenticatedUser(null);
  },
};

type Result = { ok: true } | { ok: false; error: string };


export async function addOvertimeFirestore(i: {
  workerId: string;
  date: string;
  start: string;
  end: string;
  reason: string;
}): Promise<Result> {
  const currentUser = firebaseAuth.currentUser;

  if (!currentUser || currentUser.uid !== i.workerId) {
    return {
      ok: false,
      error: "No tienes autorización para registrar estas horas extras.",
    };
  }

  if (!isValidIsoDate(i.date)) {
    return { ok: false, error: "Indica una fecha válida." };
  }

  const minutes = diffMinutes(i.start, i.end);

  if (minutes <= 0) {
    return { ok: false, error: "El horario debe ser mayor a cero minutos." };
  }

  const reason = i.reason.trim();

  if (!reason) {
    return { ok: false, error: "El motivo es obligatorio." };
  }

  let existingRecords: Overtime[];

  try {
    const recordsQuery = query(
      collection(db, "overtime"),
      where("workerId", "==", i.workerId)
    );

    const snapshot = await getDocs(recordsQuery);

    existingRecords = snapshot.docs.map((item) => ({
      ...item.data(),
      id: item.id,
    })) as Overtime[];
  } catch (error) {
    console.error("Error al consultar horarios existentes:", error);

    return {
      ok: false,
      error: "No se pudieron verificar las horas extras existentes.",
    };
  }

  const overlap = hasOvertimeOverlap(
    i.workerId,
    i.date,
    i.start,
    i.end,
    existingRecords
  );

  if (overlap) {
    return {
      ok: false,
      error:
        "Ya tienes horas extras registradas que coinciden con este horario. Verifica la fecha y las horas.",
    };
  }

  try {
    const counterRef = doc(db, "counters", "overtime");
    const overtimeId = `${currentUser.uid}_${i.date}_${i.start.replace(":", "")}_${i.end.replace(":", "")}`;
    const overtimeRef = doc(db, "overtime", overtimeId);

    await runTransaction(db, async (transaction) => {
      const counterSnapshot = await transaction.get(counterRef);
      const overtimeSnapshot = await transaction.get(overtimeRef);

      if (overtimeSnapshot.exists()) {
        throw new Error(
          "Ya existe un registro de horas extras con la misma fecha y horario."
        );
      }

      if (!counterSnapshot.exists()) {
        throw new Error("No existe el contador de horas extras.");
      }

      const lastNumber = counterSnapshot.data()["lastNumber"];

      if (!Number.isSafeInteger(lastNumber) || lastNumber < 0) {
        throw new Error("El contador de horas extras no es válido.");
      }

      const nextNumber = lastNumber + 1;
      const nextCode = code("HE", nextNumber);

      transaction.update(counterRef, {
        lastNumber: nextNumber,
      });

      transaction.set(overtimeRef, {
        code: nextCode,
        workerId: currentUser.uid,
        date: i.date,
        start: i.start,
        end: i.end,
        minutes,
        reason,
        status: "activo",
        createdAt: serverTimestamp(),
      });
    });

    return { ok: true };
  } catch (error) {
    console.error("Error al registrar horas extras:", error);

    return {
      ok: false,
      error: "No se pudieron guardar las horas extras en Firestore.",
    };
  }
}


function hasOvertimeOverlap(
  workerId: string,
  date: string,
  start: string,
  end: string,
  records: Overtime[]
): boolean {
  const newStart = Number(start.slice(0, 2)) * 60 +
    Number(start.slice(3, 5));

  let newEnd = Number(end.slice(0, 2)) * 60 +
    Number(end.slice(3, 5));

  if (newEnd <= newStart) {
    newEnd += 1440;
  }

  return records.some((record) => {
    if (
      record.workerId !== workerId ||
      record.date !== date ||
      record.status !== "activo"
    ) {
      return false;
    }

    const existingStart =
      Number(record.start.slice(0, 2)) * 60 +
      Number(record.start.slice(3, 5));

    let existingEnd =
      Number(record.end.slice(0, 2)) * 60 +
      Number(record.end.slice(3, 5));

    if (existingEnd <= existingStart) {
      existingEnd += 1440;
    }

    return newStart < existingEnd && newEnd > existingStart;
  });
}

function isValidIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 100 || year > 9999) return false;

  const date = new Date(0);
  date.setFullYear(year, month - 1, day);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}


export function addOvertime(i: {
  workerId: string;
  date: string;
  start: string;
  end: string;
  reason: string;
}): Result {
  if (!i.workerId) return { ok: false, error: "Trabajador no especificado." };
  const worker = state.users.find((u) => u.id === i.workerId);
  if (!worker || worker.role !== "trabajador") {
    return { ok: false, error: "Solo los trabajadores pueden registrar horas extras." };
  }
  if (!worker.active) return { ok: false, error: "El trabajador se encuentra inactivo." };
  if (!i.date || !isValidIsoDate(i.date)) return { ok: false, error: "Indica una fecha válida." };
  if (!i.start || !i.end) return { ok: false, error: "Completa el horario de inicio y fin." };

  const minutes = diffMinutes(i.start, i.end);
  if (minutes <= 0) {
    return {
      ok: false,
      error:
        "La hora de inicio y fin no pueden ser iguales; la duración debe ser mayor a 0 minutos.",
    };
  }

  const reasonTrimmed = i.reason?.trim();
  if (!reasonTrimmed) return { ok: false, error: "El motivo es obligatorio." };

  // Prevent duplicate exact record (same worker, date, start, end)
  const isDuplicate = state.overtime.some(
    (o) =>
      o.workerId === i.workerId &&
      o.date === i.date &&
      o.start === i.start &&
      o.end === i.end &&
      o.status === "activo",
  );
  if (isDuplicate) {
    return {
      ok: false,
      error: "Ya existe un registro idéntico de horas extras para este horario.",
    };
  }

  const n = nextNum(state.overtime);
  const newRecord: Overtime = {
    id: `ot${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    code: code("HE", n),
    workerId: i.workerId,
    date: i.date,
    start: i.start,
    end: i.end,
    minutes,
    reason: reasonTrimmed,
    status: "activo",
    createdAt: new Date().toISOString(),
  };

  set({ overtime: [...state.overtime, newRecord] });
  return { ok: true };
}

export function voidOvertime(id: string, reason: string): Result {
  const o = state.overtime.find((x) => x.id === id);
  if (!o) return { ok: false, error: "Registro no encontrado." };
  if (o.status === "anulado")
    return { ok: false, error: "El registro ya fue anulado previamente." };
  const reasonTrimmed = reason?.trim();
  if (!reasonTrimmed) return { ok: false, error: "Indica el motivo obligatorio de anulación." };
  if (!canVoid(o, state.comps)) {
    return {
      ok: false,
      error:
        "No se puede anular: el registro está comprometido en una compensación pendiente o aprobada.",
    };
  }

  set({
    overtime: state.overtime.map((x) =>
      x.id === id ? { ...x, status: "anulado", voidReason: reasonTrimmed } : x,
    ),
  });
  return { ok: true };
}

export function requestCompensation(i: {
  workerId: string;
  date: string;
  start: string;
  end: string;
  reason: string;
  allocations: Allocation[];
}): Result {
  if (!i.workerId) return { ok: false, error: "Trabajador no especificado." };
  const worker = state.users.find((u) => u.id === i.workerId);
  if (!worker || worker.role !== "trabajador") {
    return { ok: false, error: "Solo los trabajadores pueden solicitar compensaciones." };
  }
  if (!worker.active) return { ok: false, error: "El trabajador se encuentra inactivo." };
  if (!i.date || !isValidIsoDate(i.date))
    return { ok: false, error: "Indica una fecha válida para la compensación." };
  if (!i.start || !i.end)
    return { ok: false, error: "Completa el horario de inicio y fin del descanso." };

  const minutes = diffMinutes(i.start, i.end);
  if (minutes <= 0) {
    return {
      ok: false,
      error: "El horario de descanso debe representar una duración mayor a 0 minutos.",
    };
  }

  const allocs = (i.allocations || []).filter((a) => a.minutes > 0);
  if (!allocs.length) {
    return {
      ok: false,
      error: "Debes seleccionar horas extras de origen para respaldar la compensación.",
    };
  }

  const sources = state.overtime.filter((o) => allocs.some((a) => a.overtimeId === o.id));
  if (sources.some((o) => o.date === i.date)) {
    return {
      ok: false,
      error: "La fecha de compensación debe ser distinta a la fecha de las horas extras usadas.",
    };
  }

  const err = validateAllocations(i.workerId, minutes, allocs, state.overtime, state.comps);
  if (err) return { ok: false, error: err };

  const n = nextNum(state.comps);
  const newComp: Compensation = {
    id: `cp${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    code: code("CP", n),
    workerId: i.workerId,
    date: i.date,
    start: i.start,
    end: i.end,
    minutes,
    reason: i.reason?.trim() || "",
    allocations: allocs,
    status: "pendiente",
    createdAt: new Date().toISOString(),
  };

  set({ comps: [...state.comps, newComp] });
  return { ok: true };
}

export function reviewCompensation(id: string, approve: boolean, note = ""): Result {
  const c = state.comps.find((x) => x.id === id);
  if (!c) return { ok: false, error: "Solicitud no encontrada." };
  if (c.status !== "pendiente")
    return { ok: false, error: "La solicitud ya fue revisada y resuelta previamente." };
  const trimmedNote = note.trim();
  if (!approve && !trimmedNote) {
    return { ok: false, error: "Indica una observación obligatoria para el rechazo." };
  }

  set({
    comps: state.comps.map((x) =>
      x.id === id
        ? {
          ...x,
          status: approve ? "aprobada" : "rechazada",
          reviewNote: trimmedNote || undefined,
          reviewedAt: new Date().toISOString(),
        }
        : x,
    ),
  });
  return { ok: true };
}

export function toggleUserActive(id: string) {
  set({
    users: state.users.map((u) => (u.id === id ? { ...u, active: !u.active } : u)),
  });
}

/** Reset in-memory state back to demo data (useful for tests) */
export function resetStore() {
  set({
    users: [],
    overtime: [],
    comps: [],
    currentUserId: null,
    authLoading: false,
  });
}


let stopOvertimeObserver: (() => void) | null = null;

export function startOvertimeObserver(workerId: string) {
  // Detener cualquier observador anterior.
  stopOvertimeObserver?.();
  stopOvertimeObserver = null;

  // Limpiar registros del usuario anterior.
  set({ overtime: [] });

  const overtimeQuery = query(
    collection(db, "overtime"),
    where("workerId", "==", workerId)
  );

  stopOvertimeObserver = onSnapshot(
    overtimeQuery,
    (snapshot) => {
      const records: Overtime[] = snapshot.docs.map((item) => ({
        ...item.data(),
        id: item.id,
      })) as Overtime[];

      set({ overtime: records });
    },
    (error) => {
      console.error("Error al consultar horas extras:", error);
      set({ overtime: [] });
    }
  );
}

export function stopOvertimeListening() {
  stopOvertimeObserver?.();
  stopOvertimeObserver = null;
  set({ overtime: [] });
}

