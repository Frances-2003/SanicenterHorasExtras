import { afterAll, beforeAll, expect, it } from "vitest";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { prepareCompensationCounter } from "../server/compensation-counter";
import { securityEmulatorCredential } from "../server/emulator-safety";
let environment: RulesTestEnvironment;
const app = initializeApp({
  projectId: "demo-sanicenter",
  credential: securityEmulatorCredential(),
});
beforeAll(async () => {
  if (
    process.env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095" ||
    process.env["GCLOUD_PROJECT"] !== "demo-sanicenter"
  )
    throw new Error("Solo emulador aislado.");
  environment = await initializeTestEnvironment({ projectId: "demo-sanicenter" });
  await environment.clearFirestore();
});
afterAll(async () => {
  await environment?.cleanup();
  await deleteApp(app);
});
it("plans without writes, creates the missing counter once from historical codes and never touches overtime", async () => {
  const db = getFirestore(app);
  await db.doc("counters/overtime").set({ lastNumber: 987, legacy: true });
  await db.doc("compensations/old").set({ code: "CP-000042", legacy: "preserve" });
  expect(await prepareCompensationCounter(db)).toEqual({
    action: "create-if-absent",
    lastNumber: 42,
    applied: false,
  });
  expect((await db.doc("counters/compensations").get()).exists).toBe(false);
  const outcomes = await Promise.all([
    prepareCompensationCounter(db, true),
    prepareCompensationCounter(db, true),
  ]);
  expect(outcomes.filter((r) => r.applied)).toHaveLength(1);
  expect((await db.doc("counters/compensations").get()).get("lastNumber")).toBe(42);
  expect(await prepareCompensationCounter(db, true)).toEqual({
    action: "none",
    lastNumber: 42,
    applied: false,
  });
  expect((await db.doc("counters/overtime").get()).data()).toEqual({
    lastNumber: 987,
    legacy: true,
  });
  expect((await db.doc("compensations/old").get()).data()).toEqual({
    code: "CP-000042",
    legacy: "preserve",
  });
  await db.doc("counters/compensations").set({ lastNumber: -1 });
  await expect(prepareCompensationCounter(db, true)).rejects.toThrow("no se reemplaza");
  expect((await db.doc("counters/compensations").get()).get("lastNumber")).toBe(-1);
});
