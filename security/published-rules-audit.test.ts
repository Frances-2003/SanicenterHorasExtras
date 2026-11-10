import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, it } from "vitest";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";

// Optional local audit evidence, not production credentials or an integration with the real project.
const reportPath = "AUDITORIA_SANICENTERDB_2026-11-10.local.json";
let environment: RulesTestEnvironment | undefined;
afterEach(async () => {
  await environment?.cleanup();
  environment = undefined;
});
async function setup(rules: string) {
  if (
    process.env["GCLOUD_PROJECT"] !== "demo-sanicenter" ||
    process.env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095"
  )
    throw new Error("La comparación solo puede ejecutarse en el emulador separado de seguridad.");
  if (rules.includes("[LITERAL OMITIDO]"))
    throw new Error("La copia saneada omite literales: no se puede usar como prueba semántica.");
  environment = await initializeTestEnvironment({
    projectId: "demo-sanicenter",
    firestore: { rules },
  });
  await environment.clearFirestore();
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "users/worker"), { active: true, role: "trabajador", area: "Inventario" });
    await setDoc(doc(db, "users/boss"), { active: true, role: "jefe", area: "Ventas" });
    await setDoc(doc(db, "overtime/example"), { workerId: "worker", area: "Inventario" });
    await setDoc(doc(db, "compensations/example"), { workerId: "worker", area: "Inventario" });
    await setDoc(doc(db, "calendar/example"), { workerId: "worker", active: true });
  });
  return environment;
}
describe.skipIf(!existsSync(reportPath))("Published rules audit (local emulator only)", () => {
  it("confirms published rules allow worker reads but block compensation, calendar and dashboard roster; managers lack area scoping", async () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const env = await setup(report.rules.files[0].sanitizedSource);
    const worker = env.authenticatedContext("worker").firestore();
    const boss = env.authenticatedContext("boss").firestore();
    await assertSucceeds(getDoc(doc(worker, "users/worker")));
    await assertSucceeds(getDoc(doc(worker, "overtime/example")));
    await assertFails(getDoc(doc(worker, "compensations/example")));
    await assertFails(getDoc(doc(worker, "calendar/example")));
    await assertFails(getDocs(query(collection(boss, "users"), where("area", "==", "Ventas"))));
    await assertSucceeds(getDoc(doc(boss, "overtime/example")));
    await assertFails(setDoc(doc(worker, "overtime/new"), { workerId: "worker" }));
  });
  it("confirms local proposed rules open only intended reads and deny cross-area overtime and direct writes", async () => {
    const env = await setup(readFileSync("firestore.rules", "utf8"));
    const worker = env.authenticatedContext("worker").firestore();
    const boss = env.authenticatedContext("boss").firestore();
    await assertSucceeds(getDoc(doc(worker, "compensations/example")));
    await assertSucceeds(getDoc(doc(worker, "calendar/example")));
    await assertSucceeds(getDocs(query(collection(boss, "users"), where("area", "==", "Ventas"))));
    await assertFails(getDoc(doc(boss, "overtime/example")));
    await assertFails(setDoc(doc(worker, "overtime/new"), { workerId: "worker" }));
  });
});
