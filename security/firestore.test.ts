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
import { balanceOf } from "../src/services/ledger";
import type { Compensation, Overtime } from "../src/types";
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

describe("Jefe personal workflow with unchanged client-write rules", () => {
  it("creates pending own requests, reviews them separately, audits self-review and preserves area restrictions", async () => {
    const db = getFirestore(app);
    const beforeHE = (await db.doc("counters/overtime").get()).get("lastNumber");
    const beforeCP = (await db.doc("counters/compensations").get()).get("lastNumber");
    const created = await execute("boss", randomUUID(), {
      action: "addOvertime",
      date: "2026-10-25",
      start: "23:00",
      end: "02:00",
      reason: "Trabajo personal",
    });
    let ot = {
      ...(await db.doc(`overtime/${created.id}`).get()).data(),
      id: created.id,
    } as Overtime;
    expect(ot.status).toBe("pendiente");
    expect(ot.workerId).toBe("boss");
    expect(balanceOf("boss", [ot], []).available).toBe(0);
    const review = {
      action: "reviewOvertime",
      id: created.id,
      approve: true,
      note: "Revisión propia",
    };
    await expect(execute("otherBoss", randomUUID(), review)).rejects.toThrow("acceso");
    await expect(execute("w1", randomUUID(), review)).rejects.toThrow("acceso");
    const reviewId = randomUUID();
    await execute("boss", reviewId, review);
    await execute("boss", reviewId, review);
    ot = { ...(await db.doc(`overtime/${created.id}`).get()).data(), id: created.id } as Overtime;
    expect(balanceOf("boss", [ot], []).available).toBe(180);
    expect((await db.doc(`audit/${reviewId}`).get()).data()).toMatchObject({
      actorId: "boss",
      workerId: "boss",
      actorRole: "jefe",
      selfReview: true,
      afterStatus: "aprobada",
    });
    const comp = await execute("boss", randomUUID(), {
      action: "requestCompensation",
      date: "2099-11-01",
      start: "08:00",
      end: "09:00",
      reason: "Descanso propio",
      allocations: [{ overtimeId: created.id, minutes: 60 }],
    });
    let cp = {
      ...(await db.doc(`compensations/${comp.id}`).get()).data(),
      id: comp.id,
    } as Compensation;
    expect(cp.status).toBe("pendiente");
    expect(balanceOf("boss", [ot], [cp])).toMatchObject({ available: 120, reserved: 60 });
    const approvalId = randomUUID();
    await execute("boss", approvalId, {
      action: "reviewCompensation",
      id: comp.id,
      approve: true,
      note: "Aprobación propia",
    });
    cp = {
      ...(await db.doc(`compensations/${comp.id}`).get()).data(),
      id: comp.id,
    } as Compensation;
    expect(cp.status).toBe("aprobada");
    expect(cp.reviewedBy).toBe("boss");
    expect(balanceOf("boss", [ot], [cp])).toMatchObject({
      available: 120,
      approved: 60,
      reserved: 0,
    });
    expect((await db.doc(`audit/${approvalId}`).get()).data()).toMatchObject({
      actorId: "boss",
      workerId: "boss",
      selfReview: true,
    });
    expect((await db.doc(`calendar/${comp.id}`).get()).get("active")).toBe(true);
    const client = env.authenticatedContext("boss").firestore();
    await assertSucceeds(
      getDocs(query(collection(client, "overtime"), where("workerId", "==", "boss"))),
    );
    await assertFails(setDoc(doc(client, `overtime/${created.id}`), { status: "aprobada" }));
    await assertFails(setDoc(doc(client, `compensations/${comp.id}`), { status: "aprobada" }));
    await assertFails(getDoc(doc(client, "overtime/area-b")));
    expect((await db.doc("counters/overtime").get()).get("lastNumber")).toBe(beforeHE + 1);
    expect((await db.doc("counters/compensations").get()).get("lastNumber")).toBe(beforeCP + 1);
  });
  it("rejects fractional new requests before changing counters or creating financial records", async () => {
    const db = getFirestore(app);
    const he = await db.doc("counters/overtime").get(),
      cp = await db.doc("counters/compensations").get();
    for (const uid of ["w1", "boss"]) {
      for (const end of ["18:15", "18:30", "18:45", "19:30"])
        await expect(
          execute(uid, randomUUID(), {
            action: "addOvertime",
            date: "2026-10-27",
            start: "18:00",
            end,
            reason: "Fracción",
          }),
        ).rejects.toThrow("horas completas");
      await expect(
        execute(uid, randomUUID(), {
          action: "requestCompensation",
          date: "2099-12-01",
          start: "08:00",
          end: "09:00",
          reason: "Fracciones por origen",
          allocations: [
            { overtimeId: "one", minutes: 30 },
            { overtimeId: "two", minutes: 30 },
          ],
        }),
      ).rejects.toThrow("horas completas");
    }
    expect((await db.doc("counters/overtime").get()).updateTime?.toMillis()).toBe(
      he.updateTime!.toMillis(),
    );
    expect((await db.doc("counters/compensations").get()).updateTime?.toMillis()).toBe(
      cp.updateTime!.toMillis(),
    );
  });
});
