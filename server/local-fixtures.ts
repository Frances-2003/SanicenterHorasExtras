import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { requireEmulators } from "./emulator-safety";

export const demoPassword = "SaniDemo2026!";
export const demoAccounts = [
  {
    id: "local-ana",
    username: "ANA",
    name: "Ana Demo",
    role: "trabajador",
    area: "Almacen",
    active: true,
  },
  {
    id: "local-luis",
    username: "LUIS",
    name: "Luis Demo",
    role: "trabajador",
    area: "Almacen",
    active: true,
  },
  {
    id: "local-maria",
    username: "MARIA",
    name: "Maria Demo",
    role: "trabajador",
    area: "Ventas",
    active: true,
  },
  {
    id: "local-jefe",
    username: "JEFE",
    name: "Jefe Almacen Demo",
    role: "jefe",
    area: "Almacen",
    active: true,
  },
  {
    id: "local-jefeventas",
    username: "JEFEVENTAS",
    name: "Jefe Ventas Demo",
    role: "jefe",
    area: "Ventas",
    active: true,
  },
  {
    id: "local-admin",
    username: "ADMIN",
    name: "Administrador Demo",
    role: "admin",
    area: "Gerencia",
    active: true,
  },
  {
    id: "local-jefemulti",
    username: "JEFEMULTI",
    name: "Jefe de dos areas Demo",
    role: "jefe",
    area: "Almacen",
    authorizedAreas: ["Ventas"],
    active: true,
  },
  {
    id: "local-inactivo",
    username: "INACTIVO",
    name: "Inactivo Demo",
    role: "trabajador",
    area: "Almacen",
    active: false,
  },
] as const;

/** Additive, idempotent seed, exclusively for the fixed local demo project. */
export async function seedLocalFixtures() {
  await requireEmulators();
  const auth = getAuth();
  const db = getFirestore();
  for (const account of demoAccounts) {
    try {
      await auth.getUser(account.id);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
      await auth.createUser({
        uid: account.id,
        email: `${account.username.toLowerCase()}@auth.sanicenter.invalid`,
        password: demoPassword,
        displayName: account.name,
      });
    }
    const ref = db.doc(`users/${account.id}`);
    if (!(await ref.get()).exists) {
      const { id, ...data } = account;
      await ref.create(data);
    }
  }
  if ((await db.doc("localMetadata/fixtures-v1").get()).exists) return;
  const now = new Date().toISOString();
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const overtime = [
    {
      id: "demo-ot-ana",
      code: "HE-001001",
      workerId: "local-ana",
      area: "Almacen",
      date: "2026-10-01",
      start: "14:00",
      end: "22:00",
      minutes: 480,
      reason: "Inventario demo aprobado",
      status: "aprobada",
    },
    {
      id: "demo-ot-pending",
      code: "HE-001002",
      workerId: "local-ana",
      area: "Almacen",
      date: "2026-10-02",
      start: "22:00",
      end: "00:00",
      minutes: 120,
      reason: "Turno demo pendiente",
      status: "pendiente",
    },
    {
      id: "demo-ot-luis",
      code: "HE-001003",
      workerId: "local-luis",
      area: "Almacen",
      date: "2026-10-03",
      start: "18:00",
      end: "21:00",
      minutes: 180,
      reason: "Stock demo aprobado",
      status: "aprobada",
    },
    {
      id: "demo-ot-maria",
      code: "HE-001004",
      workerId: "local-maria",
      area: "Ventas",
      date: "2026-10-04",
      start: "18:00",
      end: "20:00",
      minutes: 120,
      reason: "Ventas demo pendiente",
      status: "pendiente",
    },
  ];
  const comps = [
    {
      id: "demo-cp-pending",
      code: "CP-000101",
      workerId: "local-ana",
      area: "Almacen",
      date: future,
      start: "08:00",
      end: "09:00",
      minutes: 60,
      reason: "Solicitud demo pendiente",
      status: "pendiente",
      allocations: [{ overtimeId: "demo-ot-ana", minutes: 60 }],
    },
    {
      id: "demo-cp-approved",
      code: "CP-000102",
      workerId: "local-ana",
      area: "Almacen",
      date: "2026-10-10",
      start: "08:00",
      end: "09:00",
      minutes: 60,
      reason: "Descanso demo para confirmar",
      status: "aprobada",
      allocations: [{ overtimeId: "demo-ot-ana", minutes: 60 }],
    },
    {
      id: "demo-cp-luis",
      code: "CP-000103",
      workerId: "local-luis",
      area: "Almacen",
      date: future,
      start: "08:00",
      end: "09:00",
      minutes: 60,
      reason: "Descanso de compañero demo",
      status: "aprobada",
      allocations: [{ overtimeId: "demo-ot-luis", minutes: 60 }],
    },
    {
      id: "demo-cp-annul",
      code: "CP-000104",
      workerId: "local-ana",
      area: "Almacen",
      date: future,
      start: "10:00",
      end: "11:00",
      minutes: 60,
      reason: "Descanso futuro para probar anulación",
      status: "aprobada",
      allocations: [{ overtimeId: "demo-ot-ana", minutes: 60 }],
    },
  ];
  const batch = db.batch();
  for (const { id, ...data } of overtime)
    batch.create(db.doc(`overtime/${id}`), { ...data, createdAt: now });
  for (const { id, ...data } of comps) {
    batch.create(db.doc(`compensations/${id}`), { ...data, createdAt: now });
    if (data.status === "aprobada") {
      const { reason, allocations, ...publicData } = data;
      batch.create(db.doc(`calendar/${id}`), {
        active: true,
        ...publicData,
        workerName: demoAccounts.find((u) => u.id === data.workerId)?.name,
      });
    }
  }
  // Only this emulator seed creates demo counters. Production counters are never touched.
  for (const [name, lastNumber] of [
    ["overtime", 1004],
    ["compensations", 104],
  ] as const) {
    const ref = db.doc(`counters/${name}`);
    if (!(await ref.get()).exists) batch.create(ref, { lastNumber });
  }
  batch.create(db.doc("localMetadata/fixtures-v1"), { createdAt: now });
  await batch.commit();
}
