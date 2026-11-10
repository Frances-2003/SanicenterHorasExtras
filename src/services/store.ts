import { useSyncExternalStore } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
  type Query,
  type DocumentData,
} from "firebase/firestore";
import { db, firebaseAuth } from "@/lib/firebase";
import { isEmulatorMode, isRealFirebaseEnabled, requireLocalServices } from "@/lib/emulator-config";
import type { Allocation, CalendarEntry, Compensation, Overtime, User } from "@/types";
import type { Command } from "./workflow";
import { authorizedAreasOf } from "./auth";

interface State {
  users: User[];
  overtime: Overtime[];
  comps: Compensation[];
  calendar: CalendarEntry[];
  currentUserId: string | null;
  authLoading: boolean;
  dataError: string | null;
}
const initialState: State = {
  users: [],
  overtime: [],
  comps: [],
  calendar: [],
  currentUserId: null,
  authLoading: true,
  dataError: null,
};
let state: State = initialState;
const listeners = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const useStore = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => initialState,
  );
export const useCurrentUser = () => {
  const s = useStore();
  return s.users.find((u) => u.id === s.currentUserId) ?? null;
};
let stopAuth: (() => void) | undefined;
let stopProfile: (() => void) | undefined;
let observers: (() => void)[] = [];
let generation = 0;

function stopData() {
  generation++;
  observers.forEach((stop) => stop());
  observers = [];
  set({ overtime: [], comps: [], calendar: [], dataError: null });
}
function observe<T>(source: Query<DocumentData>, accept: (items: T[]) => void) {
  const session = generation;
  observers.push(
    onSnapshot(
      source,
      (snapshot) => {
        if (session !== generation) return;
        const items = snapshot.docs.map((d) => {
          const data = d.data();
          // Existing serverTimestamp records coexist with new ISO timestamps.
          for (const key of Object.keys(data)) {
            if (data[key]?.toDate instanceof Function) data[key] = data[key].toDate().toISOString();
          }
          return { ...data, id: d.id } as T;
        });
        accept(items);
      },
      () => {
        if (session === generation) {
          accept([]);
          set({
            dataError:
              "No se pudieron cargar todos los datos. Revisa los permisos y vuelve a iniciar sesión.",
          });
        }
      },
    ),
  );
}
export function setAuthenticatedUser(user: User | null) {
  stopData();
  set({ users: user ? [user] : [], currentUserId: user?.id ?? null, authLoading: false });
  if (!user?.active) return;
  function observeScoped<T extends { id: string }>(name: string, accept: (items: T[]) => void) {
    if (user!.role !== "jefe") {
      observe<T>(
        user!.role === "trabajador"
          ? query(collection(db, name), where("workerId", "==", user!.id))
          : query(collection(db, name)),
        accept,
      );
      return;
    }
    // One authorized-area query per listener avoids widening reads or query operand limits.
    const groups = new Map<string, T[]>();
    for (const area of authorizedAreasOf(user!)) {
      observe<T>(query(collection(db, name), where("area", "==", area)), (items) => {
        groups.set(area, items);
        accept([...new Map([...groups.values()].flat().map((item) => [item.id, item])).values()]);
      });
    }
  }
  observeScoped<Overtime>("overtime", (overtime) => set({ overtime }));
  observeScoped<Compensation>("compensations", (comps) => set({ comps }));
  observe<CalendarEntry>(
    query(collection(db, "calendar"), where("active", "==", true)),
    (calendar) => set({ calendar }),
  );
  if (user.role !== "trabajador") {
    observeScoped<User>("users", (users) =>
      set({ users: [...users.filter((u) => u.id !== user.id), user] }),
    );
  }
}
export function startAuthObserver() {
  if (!isEmulatorMode && !isRealFirebaseEnabled) {
    setAuthenticatedUser(null);
    return;
  }
  if (typeof window === "undefined" || stopAuth) return;
  stopAuth = onAuthStateChanged(firebaseAuth, (fbUser) => {
    stopProfile?.();
    stopProfile = undefined;
    setAuthenticatedUser(null);
    if (!fbUser) return;
    set({ authLoading: true });
    stopProfile = onSnapshot(
      doc(db, "users", fbUser.uid),
      (snap) => {
        if (firebaseAuth.currentUser?.uid !== fbUser.uid) return;
        const data = snap.data();
        if (
          !data ||
          data["active"] !== true ||
          !["trabajador", "jefe", "admin"].includes(data["role"])
        ) {
          setAuthenticatedUser(null);
          return;
        }
        setAuthenticatedUser({ ...data, id: fbUser.uid } as User);
      },
      () => setAuthenticatedUser(null),
    );
  });
}
export const auth = {
  async signOut() {
    await signOut(firebaseAuth);
    setAuthenticatedUser(null);
  },
};
export type Result = { ok: true; id?: string } | { ok: false; error: string };
// Keep the same id after an uncertain network result. The server's atomic audit record makes retries idempotent.
const pendingRequests = new Map<string, string>();
async function mutate(command: Command): Promise<Result> {
  const user = firebaseAuth.currentUser;
  if (!user) return { ok: false, error: "Inicia sesión para continuar." };
  const key = `${user.uid}:${JSON.stringify(command)}`;
  const requestId = pendingRequests.get(key) || crypto.randomUUID();
  pendingRequests.set(key, requestId);
  try {
    await requireLocalServices();
    const base = isEmulatorMode
      ? ""
      : (import.meta.env["VITE_WORKFLOW_API_URL"] || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/workflow`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${await user.getIdToken()}`,
        "Content-Type": "application/json",
        "X-Request-Id": requestId,
      },
      body: JSON.stringify(command),
    });
    const result = (await response.json()) as Result;
    if (result.ok || response.status === 400) pendingRequests.delete(key);
    return result;
  } catch {
    return {
      ok: false,
      error:
        "No se pudo confirmar la operación con el servicio seguro. Reintenta la misma solicitud. Si el servicio aún no está configurado, solicita su activación.",
    };
  }
}
export const nextOvertimeCode = () => "Se asigna al guardar";
export const nextCompCode = () => "Se asigna al guardar";
export const addOvertimeFirestore = (i: {
  workerId: string;
  date: string;
  start: string;
  end: string;
  reason: string;
}) => {
  const { workerId, ...data } = i;
  if (workerId !== firebaseAuth.currentUser?.uid)
    return Promise.resolve<Result>({ ok: false, error: "Trabajador inválido." });
  return mutate({ action: "addOvertime", ...data });
};
export const addOvertime = addOvertimeFirestore;
export const requestCompensation = (i: {
  workerId: string;
  date: string;
  start: string;
  end: string;
  reason: string;
  allocations: Allocation[];
}) => {
  const { workerId, ...data } = i;
  if (workerId !== firebaseAuth.currentUser?.uid)
    return Promise.resolve<Result>({ ok: false, error: "Trabajador inválido." });
  return mutate({ action: "requestCompensation", ...data });
};
export const reviewOvertime = (id: string, approve: boolean, note: string) =>
  mutate({ action: "reviewOvertime", id, approve, note });
export const voidOvertime = (id: string, note: string) =>
  mutate({ action: "voidOvertime", id, note });
export const reviewCompensation = (id: string, approve: boolean, note = "") =>
  mutate({ action: "reviewCompensation", id, approve, note });
export const requestCancellation = (id: string, note: string) =>
  mutate({ action: "requestCancellation", id, note });
export const reviewCancellation = (id: string, approve: boolean, note: string, direct = false) =>
  mutate({ action: "reviewCancellation", id, approve, note, direct });
export const confirmRest = (id: string, note: string) =>
  mutate({ action: "confirmRest", id, note });
// User lifecycle needs coordinated Authentication administration; never pretend a local toggle persisted.
export const toggleUserActive = async (_id: string): Promise<Result> => ({
  ok: false,
  error: "Administra la activación en Firebase; esta pantalla no modifica perfiles ni roles.",
});
export function resetStore() {
  stopData();
  setAuthenticatedUser(null);
}
