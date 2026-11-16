import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { securityEmulatorCredential } from "../server/emulator-safety";
import { requireWorkflowAccess } from "../server/runtime-production";
import { execute } from "../server/workflow-store";
import { balanceOf } from "../src/services/ledger";
import type { Compensation, Overtime } from "../src/types";

let environment: RulesTestEnvironment;
const app = initializeApp({
  projectId: "demo-sanicenter",
  credential: securityEmulatorCredential(),
});
const db = getFirestore(app);
// Policy is tested as production; all storage remains physically restricted to the emulator.
const production = {
  WORKFLOW_PRODUCTION_ENABLED: "true",
  GOOGLE_CLOUD_PROJECT: "sanicenterdb",
  APP_ORIGIN: "https://sanicenter.example",
  CONTEXT: "production",
  WORKFLOW_WRITE_MODE: "enabled",
  WORKFLOW_ALLOWED_ACTOR_UIDS: "obsolete-only",
  WORKFLOW_ALLOWED_WORKER_UIDS: "obsolete-only",
};
const options = {
  authorizeWorker: () => requireWorkflowAccess(production),
  enforceRateLimit: true,
};
beforeAll(async () => {
  if (
    process.env["GCLOUD_PROJECT"] !== "demo-sanicenter" ||
    process.env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095"
  )
    throw new Error("Solo Firestore Emulator de seguridad.");
  environment = await initializeTestEnvironment({
    projectId: "demo-sanicenter",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await environment.clearFirestore();
  await db.doc("counters/overtime").create({ lastNumber: 200 });
  await db.doc("counters/compensations").create({ lastNumber: 300 });
  for (const [id, role, area] of [
    ["worker", "trabajador", "Inventario"],
    ["boss", "jefe", "Inventario"],
    ["admin", "admin", "Administración"],
  ])
    await db
      .doc(`users/${id}`)
      .create({ name: id, username: id!.toUpperCase(), active: true, role, area });
});
afterAll(async () => {
  await environment?.cleanup();
  await deleteApp(app);
});
const overtime = (date: string) => ({
  action: "addOvertime",
  date,
  start: "18:00",
  end: "20:00",
  reason: "Trabajo",
});
const review = (id: string) => ({ action: "reviewOvertime", id, approve: true, note: "Revisado" });
async function savedOvertime(id: string) {
  return { ...(await db.doc(`overtime/${id}`).get()).data(), id } as Overtime;
}
async function savedComp(id: string) {
  return { ...(await db.doc(`compensations/${id}`).get()).data(), id } as Compensation;
}

it("recognizes users added after startup without changing any environment variables", async () => {
  requireWorkflowAccess(production);
  const existing = await execute("worker", randomUUID(), overtime("2026-11-01"), options);
  await execute("boss", randomUUID(), review(existing.id), options);
  const future = `future:${randomUUID()}`;
  await db.doc(`users/${future}`).create({
    username: "FUTURE",
    name: "Future worker",
    role: "trabajador",
    area: "Inventario",
    active: true,
  });
  const created = await execute(future, randomUUID(), overtime("2026-11-02"), options);
  await expect(execute(future, randomUUID(), review(created.id), options)).rejects.toThrow(
    "permiso",
  );
  await execute("boss", randomUUID(), review(created.id), options);
  const source = await savedOvertime(created.id);
  expect(balanceOf(future, [source], []).available).toBe(120);
  const request = await execute(
    future,
    randomUUID(),
    {
      action: "requestCompensation",
      date: "2099-11-03",
      start: "08:00",
      end: "09:00",
      reason: "Descanso",
      allocations: [{ overtimeId: source.id, minutes: 60 }],
    },
    options,
  );
  expect((await savedComp(request.id)).status).toBe("pendiente");
  await execute(
    "boss",
    randomUUID(),
    { action: "reviewCompensation", id: request.id, approve: true, note: "Aprobada" },
    options,
  );
  expect(balanceOf(future, [source], [await savedComp(request.id)]).available).toBe(60);
});

it("recognizes a future jefe for personal self-review while preserving area boundaries and admin permissions", async () => {
  const futureBoss = `future-boss-${randomUUID()}`;
  await db.doc(`users/${futureBoss}`).create({
    username: "FUTUREBOSS",
    name: "Future jefe",
    role: "jefe",
    area: "Ventas",
    active: true,
  });
  const created = await execute(futureBoss, randomUUID(), overtime("2026-11-04"), options);
  expect((await savedOvertime(created.id)).status).toBe("pendiente");
  await expect(execute("boss", randomUUID(), review(created.id), options)).rejects.toThrow(
    "acceso",
  );
  const auditId = randomUUID();
  await execute(futureBoss, auditId, review(created.id), options);
  expect((await db.doc(`audit/${auditId}`).get()).data()).toMatchObject({
    actorId: futureBoss,
    workerId: futureBoss,
    selfReview: true,
  });
  const comp = await execute(
    futureBoss,
    randomUUID(),
    {
      action: "requestCompensation",
      date: "2099-11-05",
      start: "08:00",
      end: "09:00",
      reason: "Descanso propio",
      allocations: [{ overtimeId: created.id, minutes: 60 }],
    },
    options,
  );
  await execute(
    futureBoss,
    randomUUID(),
    { action: "reviewCompensation", id: comp.id, approve: true, note: "Propia" },
    options,
  );
  expect((await savedComp(comp.id)).reviewedBy).toBe(futureBoss);
  const crossArea = await execute(futureBoss, randomUUID(), overtime("2026-11-06"), options);
  await execute("admin", randomUUID(), review(crossArea.id), options);
  expect((await savedOvertime(crossArea.id)).reviewedBy).toBe("admin");
  await expect(execute("admin", randomUUID(), overtime("2026-11-07"), options)).rejects.toThrow(
    "Trabajador",
  );
});

it("rechecks inactive and absent profiles for every operation without modifying counters", async () => {
  const inactive = `inactive-${randomUUID()}`;
  await db
    .doc(`users/${inactive}`)
    .create({ name: "Inactive", role: "trabajador", area: "Inventario", active: false });
  const beforeHE = await db.doc("counters/overtime").get();
  for (const id of [inactive, `missing-${randomUUID()}`])
    await expect(execute(id, randomUUID(), overtime("2026-11-08"), options)).rejects.toThrow(
      "Perfil",
    );
  expect((await db.doc("counters/overtime").get()).updateTime?.toMillis()).toBe(
    beforeHE.updateTime!.toMillis(),
  );
  const change = `changed-${randomUUID()}`;
  await db
    .doc(`users/${change}`)
    .create({ name: "Changed", role: "jefe", area: "Inventario", active: true });
  const record = await execute(change, randomUUID(), overtime("2026-11-09"), options);
  await db.doc(`users/${change}`).update({ active: false });
  await expect(execute(change, randomUUID(), review(record.id), options)).rejects.toThrow("Perfil");
  expect((await savedOvertime(record.id)).status).toBe("pendiente");
});
