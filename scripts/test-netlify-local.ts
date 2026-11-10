import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { initializeRuntime } from "../server/runtime";
import { requireEmulators } from "../server/emulator-safety";
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// No implicit credentials or production fallback. No existing fixture is changed.
Object.assign(process.env, {
  WORKFLOW_EMULATOR_MODE: "1",
  GOOGLE_CLOUD_PROJECT: "demo-sanicenter",
  GCLOUD_PROJECT: "demo-sanicenter",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
});
delete process.env["GOOGLE_APPLICATION_CREDENTIALS"];
delete process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
await requireEmulators();
await initializeRuntime();
mkdirSync("test-results/netlify", { recursive: true });
await build({
  entryPoints: ["netlify/functions/workflow.ts"],
  outfile: "test-results/netlify/workflow.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
});
const { default: workflow } = await import(
  pathToFileURL(resolve("test-results/netlify/workflow.mjs")).href
);
const db = getFirestore(),
  auth = getAuth(),
  prefix = `netlify-${randomUUID()}`;
const accounts: Record<string, { uid: string; token: string }> = {};
for (const [name, role, area, active] of [
  ["worker", "trabajador", "Almacen", true],
  ["boss", "jefe", "Almacen", true],
  ["other", "jefe", "Ventas", true],
  ["inactive", "trabajador", "Almacen", false],
] as const) {
  const uid = `${prefix}-${name}`,
    email = `${uid}@auth.sanicenter.invalid`,
    password = `Prueba-${randomUUID()}`;
  await auth.createUser({ uid, email, password });
  await db
    .doc(`users/${uid}`)
    .create({ name: `Prueba Netlify ${name}`, username: uid, role, area, active });
  const response = await fetch(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=local-only",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    },
  );
  assert.equal(response.status, 200);
  accounts[name] = { uid, token: (await response.json()).idToken };
}
let checks = 0;
async function call(
  name: string,
  command: unknown,
  expected = 200,
  id = randomUUID(),
  extra: Record<string, string> = {},
) {
  const response = await workflow(
    new Request("http://127.0.0.1:8080/api/workflow", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accounts[name]!.token}`,
        "Content-Type": "application/json",
        "X-Request-Id": id,
        Origin: "http://127.0.0.1:8080",
        ...extra,
      },
      body: JSON.stringify(command),
    }),
  );
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  checks++;
  return result as { id: string };
}
const create = {
  action: "addOvertime",
  date: "2025-01-01",
  start: "23:00",
  end: "02:00",
  reason: "Validación adaptador Netlify",
};
const requestId = randomUUID();
const ot = await call("worker", create, 200, requestId);
assert.deepEqual(await call("worker", create, 200, requestId), ot);
await call("worker", { ...create, date: "2025-01-02", start: "01:00", end: "03:00" }, 400);
await call("inactive", create, 400);
await call("worker", create, 403, randomUUID(), { Origin: "https://other.invalid" });
await call("worker", { padding: "x".repeat(33000) }, 413);
const review = {
  action: "reviewOvertime",
  id: ot.id,
  approve: true,
  note: "Autorización de prueba",
};
await call("worker", review, 400);
await call("other", review, 400);
await db.doc(`overtime/${ot.id}`).update({ legacyMarker: "conservar" });
await call("boss", review);
assert.equal((await db.doc(`overtime/${ot.id}`).get()).get("legacyMarker"), "conservar");
async function requestComp(date: string) {
  return call("worker", {
    action: "requestCompensation",
    date,
    start: "08:00",
    end: "09:00",
    reason: "Descanso de prueba",
    allocations: [{ overtimeId: ot.id, minutes: 60 }],
  });
}
const comp = await requestComp("2099-01-01");
await call("boss", {
  action: "reviewCompensation",
  id: comp.id,
  approve: true,
  note: "Aprobación",
});
await call("worker", { action: "requestCancellation", id: comp.id, note: "Cambio de fecha" });
await call("boss", {
  action: "reviewCancellation",
  id: comp.id,
  approve: false,
  note: "Se mantiene",
});
assert.equal((await db.doc(`compensations/${comp.id}`).get()).get("status"), "aprobada");
const annulId = randomUUID(),
  annul = {
    action: "reviewCancellation",
    id: comp.id,
    direct: true,
    approve: true,
    note: "Anulación directa",
  };
await call("boss", annul, 200, annulId);
await call("boss", annul, 200, annulId);
await call("boss", annul, 400);
assert.equal((await db.doc(`compensations/${comp.id}`).get()).get("status"), "anulada");
assert.equal((await db.doc(`calendar/${comp.id}`).get()).get("active"), false);
const rejected = await requestComp("2099-01-02");
await call("boss", {
  action: "reviewCompensation",
  id: rejected.id,
  approve: false,
  note: "Rechazo",
});
const rest = await requestComp("2025-02-01");
await call("boss", {
  action: "reviewCompensation",
  id: rest.id,
  approve: true,
  note: "Autorizado",
});
await call("boss", {
  action: "confirmRest",
  id: rest.id,
  note: "Asistencia verificada manualmente",
});
await call("boss", { ...annul, id: rest.id }, 400);
assert.equal((await db.doc(`compensations/${rest.id}`).get()).get("status"), "efectuada");
await db
  .doc(`workflowLimits/${accounts["worker"]!.uid}`)
  .set({ bucket: Math.floor(Date.now() / 60000), calls: 30 });
await call("worker", { ...create, date: "2025-03-01" }, 429);
console.log(
  `Adaptador compilado Netlify, Node ${process.versions.node}: ${checks} solicitudes verificadas exclusivamente en demo-sanicenter (Auth y Firestore).`,
);
