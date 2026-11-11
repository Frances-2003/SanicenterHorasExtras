import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, collection, getDocs, query, where } from "firebase/firestore";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { execute } from "../server/workflow-store";
import { randomUUID } from "node:crypto";
import { securityEmulatorCredential } from "../server/emulator-safety";
let env: RulesTestEnvironment;
const projectId = "demo-sanicenter";
const app = initializeApp({ projectId, credential: securityEmulatorCredential() });
beforeAll(async () => {
  if (!process.env["FIRESTORE_EMULATOR_HOST"] || process.env["GCLOUD_PROJECT"] !== projectId)
    throw new Error("Estas pruebas solo funcionan en el emulador demo-sanicenter.");
  env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await env.clearFirestore();
  const db = getFirestore(app);
  for (const [id, role, area, active] of [
    ["w1", "trabajador", "A", true],
    ["w2", "trabajador", "A", true],
    ["boss", "jefe", "A", true],
    ["otherBoss", "jefe", "B", true],
    ["admin", "admin", "B", true],
    ["inactive", "trabajador", "A", false],
  ] as const) {
    await db.doc(`users/${id}`).set({ role, area, active, name: id });
  }
  await db.doc("counters/overtime").set({ lastNumber: 80 });
  await db
    .doc("users/multiBoss")
    .set({ role: "jefe", area: "A", authorizedAreas: ["B"], active: true, name: "Jefe multiárea" });
  await db.doc("overtime/area-b").set({ workerId: "wb", area: "B", status: "pendiente" });
  await db.doc("overtime/area-c").set({ workerId: "wc", area: "C", status: "pendiente" });
  await db.doc("counters/compensations").set({ lastNumber: 10 });
  await db.doc("overtime/private").set({ workerId: "w2", area: "A", reason: "Privado" });
  await db.doc("calendar/shared").set({
    active: true,
    workerId: "w2",
    workerName: "w2",
    date: "2026-10-01",
    start: "08:00",
    end: "09:00",
    minutes: 60,
    status: "aprobada",
  });
});
afterAll(async () => {
  await env?.cleanup();
  await deleteApp(app);
});
describe("Firestore rules", () => {
  it("restricts calendar reads to a manager's authorized areas including list queries", async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      for (const area of ["A", "B", "C"])
        await setDoc(doc(context.firestore(), `calendar/scoped-${area}`), { active: true, area });
    });
    const bossDb = env.authenticatedContext("boss").firestore();
    await assertSucceeds(getDoc(doc(bossDb, "calendar/scoped-A")));
    await assertFails(getDoc(doc(bossDb, "calendar/scoped-B")));
    await assertFails(getDocs(query(collection(bossDb, "calendar"), where("active", "==", true))));
    await assertSucceeds(
      getDocs(
        query(
          collection(bossDb, "calendar"),
          where("active", "==", true),
          where("area", "==", "A"),
        ),
      ),
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("multiBoss").firestore(), "calendar/scoped-B")),
    );
    await assertFails(
      getDoc(doc(env.authenticatedContext("multiBoss").firestore(), "calendar/scoped-C")),
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("admin").firestore(), "calendar/scoped-C")),
    );
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("w1").firestore(), "calendar/scoped-B")),
    );
  });
  it("protects dashboard reads and supports explicitly authorized additional areas", async () => {
    const workerDb = env.authenticatedContext("w1").firestore();
    await assertFails(getDocs(collection(workerDb, "users")));
    await assertFails(getDocs(collection(workerDb, "overtime")));
    const multiDb = env.authenticatedContext("multiBoss").firestore();
    await assertSucceeds(getDocs(query(collection(multiDb, "overtime"), where("area", "==", "B"))));
    await assertFails(getDoc(doc(multiDb, "overtime/area-c")));
    await assertSucceeds(
      getDocs(collection(env.authenticatedContext("admin").firestore(), "overtime")),
    );
  });
  it("denies anonymous, inactive and private colleague reads", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "calendar/shared")));
    await assertFails(
      getDoc(doc(env.authenticatedContext("inactive").firestore(), "calendar/shared")),
    );
    await assertFails(getDoc(doc(env.authenticatedContext("w1").firestore(), "overtime/private")));
    await assertSucceeds(
      getDoc(doc(env.authenticatedContext("w1").firestore(), "calendar/shared")),
    );
  });
  it("denies every direct financial write, role escalation and counter reset even by admin", async () => {
    for (const uid of ["w1", "boss", "admin"])
      for (const path of [
        "users/w1",
        "overtime/fake",
        "compensations/fake",
        "calendar/fake",
        "audit/fake",
        "workflowLocks/w1",
        "workflowLimits/w1",
        "counters/overtime",
      ]) {
        await assertFails(
          setDoc(doc(env.authenticatedContext(uid).firestore(), path), {
            role: "admin",
            lastNumber: 0,
          }),
        );
      }
  });
  it("scopes management queries to area", async () => {
    const db = env.authenticatedContext("boss").firestore();
    await assertFails(getDocs(collection(db, "overtime")));
    await assertSucceeds(getDocs(query(collection(db, "overtime"), where("area", "==", "A"))));
    await assertFails(
      getDoc(doc(env.authenticatedContext("otherBoss").firestore(), "overtime/private")),
    );
  });
});
describe("Trusted transaction security and concurrency", () => {
  it("direct annulment is atomic, idempotent, returns exactly once and removes only the calendar projection", async () => {
    const db = getFirestore(app);
    await db.doc("users/w3").set({ role: "trabajador", area: "B", active: true, name: "Tercero" });
    const ot = {
      code: "HE-TEST",
      workerId: "w3",
      area: "B",
      date: "2026-01-01",
      start: "18:00",
      end: "20:00",
      minutes: 120,
      reason: "Stock",
      status: "aprobada",
      createdAt: "2026-01-01",
    };
    await db.doc("overtime/annul-source").set(ot);
    const comp = {
      code: "CP-TEST",
      workerId: "w3",
      area: "B",
      date: "2099-01-01",
      start: "23:00",
      end: "00:00",
      minutes: 60,
      reason: "Descanso",
      status: "aprobada",
      allocations: [{ overtimeId: "annul-source", minutes: 60 }],
      createdAt: "2026-01-01",
    };
    await db.doc("compensations/annul-direct").set(comp);
    await db.doc("calendar/annul-direct").set({ workerId: "w3", date: comp.date });
    const command = {
      action: "reviewCancellation",
      id: "annul-direct",
      direct: true,
      approve: true,
      note: "Cambio de programación",
    };
    await expect(execute("w3", randomUUID(), command)).rejects.toThrow("permiso");
    await expect(execute("boss", randomUUID(), command)).rejects.toThrow("acceso");
    await db.doc("calendar/annul-direct").update({ privateReason: "No publicar" });
    await expect(execute("multiBoss", randomUUID(), command)).rejects.toThrow("Proyección");
    expect((await db.doc("compensations/annul-direct").get()).get("status")).toBe("aprobada");
    const incompatible = (await db.doc("calendar/annul-direct").get()).data()!;
    expect(incompatible["privateReason"]).toBe("No publicar");
    // Remove only our synthetic test field to exercise the compatible path below.
    await db.doc("calendar/annul-direct").set({ workerId: "w3", date: comp.date });
    const id = randomUUID();
    await execute("multiBoss", id, command);
    await execute("multiBoss", id, command);
    await expect(execute("multiBoss", randomUUID(), command)).rejects.toThrow("aprobada");
    const result = (await db.doc("compensations/annul-direct").get()).data()!;
    expect(result["status"]).toBe("anulada");
    expect(result["allocations"]).toEqual(comp.allocations);
    expect(result["voidReason"]).toBe(command.note);
    expect(result["voidedBy"]).toBe("multiBoss");
    expect((await db.doc("calendar/annul-direct").get()).get("active")).toBe(false);
    await assertFails(
      getDoc(doc(env.authenticatedContext("w1").firestore(), "calendar/annul-direct")),
    );
    const visible = await assertSucceeds(
      getDocs(
        query(
          collection(env.authenticatedContext("w1").firestore(), "calendar"),
          where("active", "==", true),
        ),
      ),
    );
    expect(visible.docs.map((d) => d.id)).not.toContain("annul-direct");
    expect((await db.collection("audit").where("recordId", "==", "annul-direct").get()).size).toBe(
      1,
    );
    await db.doc("compensations/annul-race").set(comp);
    const race = { ...command, id: "annul-race" };
    const results = await Promise.allSettled([
      execute("multiBoss", randomUUID(), race),
      execute("admin", randomUUID(), race),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await db.collection("audit").where("recordId", "==", "annul-race").get()).size).toBe(1);
    await db.doc("compensations/annul-past").set({ ...comp, date: "2020-01-01" });
    await expect(execute("admin", randomUUID(), { ...command, id: "annul-past" })).rejects.toThrow(
      "antes del inicio",
    );
    expect((await db.doc("compensations/annul-past").get()).get("status")).toBe("aprobada");
  });
  it("serializes overlapping overnight inserts, preserves the counter and makes retries idempotent", async () => {
    const a = {
      action: "addOvertime",
      date: "2026-10-03",
      start: "23:00",
      end: "02:00",
      reason: "Inventario",
    };
    const id = randomUUID();
    const first = await execute("w1", id, a);
    expect(await execute("w1", id, a)).toEqual(first);
    await expect(execute("w1", id, { ...a, reason: "Otro" })).rejects.toThrow("ya utilizado");
    await expect(
      execute("w1", randomUUID(), { ...a, date: "2026-10-04", start: "01:00", end: "03:00" }),
    ).rejects.toThrow("superpone");
    expect((await getFirestore(app).doc("counters/overtime").get()).get("lastNumber")).toBe(81);
    const outcomes = await Promise.allSettled(
      [1, 2].map(() => execute("w1", randomUUID(), { ...a, date: "2026-10-05" })),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message,
    ).toContain("superpone");
    expect((await getFirestore(app).doc("counters/overtime").get()).get("lastNumber")).toBe(82);
  });
  it("prevents concurrent overspending, audits decisions, restores once and confirms manually", async () => {
    const db = getFirestore(app);
    const ot = await execute("w2", randomUUID(), {
      action: "addOvertime",
      date: "2026-10-06",
      start: "18:00",
      end: "20:00",
      reason: "Inventario",
    });
    await expect(
      execute("w2", randomUUID(), {
        action: "reviewOvertime",
        id: ot.id,
        approve: true,
        note: "Propia",
      }),
    ).rejects.toThrow("permiso");
    await expect(
      execute("otherBoss", randomUUID(), {
        action: "reviewOvertime",
        id: ot.id,
        approve: true,
        note: "Otra área",
      }),
    ).rejects.toThrow("acceso");
    await execute("boss", randomUUID(), {
      action: "reviewOvertime",
      id: ot.id,
      approve: true,
      note: "Verificado",
    });
    const request = {
      action: "requestCompensation",
      date: "2099-10-08",
      start: "08:00",
      end: "10:00",
      reason: "Descanso",
      allocations: [{ overtimeId: ot.id, minutes: 120 }],
    };
    const outcomes = await Promise.allSettled(
      [request, { ...request, date: "2099-10-09" }].map((c) => execute("w2", randomUUID(), c)),
    );
    expect(outcomes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (outcomes.find((r) => r.status === "rejected") as PromiseRejectedResult).reason.message,
    ).toContain("saldo disponible");
    const comp = outcomes.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{
      ok: boolean;
      id: string;
    }>;
    await expect(
      execute("boss", randomUUID(), { action: "voidOvertime", id: ot.id, note: "Comprometido" }),
    ).rejects.toThrow("comprometido");
    await execute("boss", randomUUID(), {
      action: "reviewCompensation",
      id: comp.value.id,
      approve: true,
      note: "Autorizado",
    });
    const publicData = (await db.doc(`calendar/${comp.value.id}`).get()).data();
    expect(publicData).not.toHaveProperty("reason");
    expect(publicData).not.toHaveProperty("allocations");
    await execute("w2", randomUUID(), {
      action: "requestCancellation",
      id: comp.value.id,
      note: "Cambio",
    });
    await expect(execute("w2", randomUUID(), { ...request, date: "2026-10-10" })).rejects.toThrow(
      "saldo",
    );
    await execute("boss", randomUUID(), {
      action: "reviewCancellation",
      id: comp.value.id,
      approve: true,
      note: "Se devuelve",
    });
    expect((await db.doc(`calendar/${comp.value.id}`).get()).get("active")).toBe(false);
    await expect(
      execute("boss", randomUUID(), {
        action: "reviewCancellation",
        id: comp.value.id,
        approve: true,
        note: "Otra vez",
      }),
    ).rejects.toThrow("pendiente");
    const next = await execute("w2", randomUUID(), { ...request, date: "2026-10-10" });
    await execute("boss", randomUUID(), {
      action: "reviewCompensation",
      id: next.id,
      approve: true,
      note: "Autorizado",
    });
    await execute("boss", randomUUID(), {
      action: "confirmRest",
      id: next.id,
      note: "Asistencia verificada",
    });
    await expect(
      execute("w2", randomUUID(), {
        action: "requestCancellation",
        id: next.id,
        note: "No corresponde",
      }),
    ).rejects.toThrow("aprobado");
    expect((await db.doc(`compensations/${next.id}`).get()).get("status")).toBe("efectuada");
    expect((await db.collection("audit").where("recordId", "==", next.id).get()).size).toBe(3);
  });
});
