import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimePolicy, requirePilotAccess } from "../server/runtime-production";
const fixtures = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  records: new Map<string, Record<string, unknown>>(),
}));
vi.mock("firebase-admin/firestore", () => ({
  FieldValue: { serverTimestamp: vi.fn() },
  getFirestore: () => {
    const ref = (path: string) => ({ path, id: path.split("/").at(-1) });
    return {
      doc: ref,
      collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
      runTransaction: (fn: (tx: unknown) => unknown) =>
        fn({
          get: async (source: { path: string }) => {
            const data = fixtures.records.get(source.path);
            return { exists: Boolean(data), get: (key: string) => data?.[key], data: () => data };
          },
          create: fixtures.create,
          update: fixtures.update,
          set: fixtures.set,
        }),
    };
  },
}));
import { execute } from "../server/workflow-store";
const env = {
  WORKFLOW_PRODUCTION_ENABLED: "true",
  GOOGLE_CLOUD_PROJECT: "sanicenterdb",
  APP_ORIGIN: "https://sani.example",
  WORKFLOW_WRITE_MODE: "enabled",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  fixtures.records.clear();
});
describe("Final production contract without Firebase access", () => {
  it("allows a local real runtime only with Netlify Dev, explicit opt-in, fixed origin and limited UIDs", () => {
    const local = {
      ...env,
      NETLIFY_DEV: "true",
      CONTEXT: "dev",
      WORKFLOW_LOCAL_REAL_ENABLED: "true",
      APP_ORIGIN: "http://localhost:8888",
      WORKFLOW_WRITE_MODE: "pilot",
      WORKFLOW_ALLOWED_ACTOR_UIDS: "worker,boss",
      WORKFLOW_ALLOWED_WORKER_UIDS: "worker",
    };
    expect(runtimePolicy(local).writeMode).toBe("pilot");
    expect(() => requirePilotAccess("worker", "worker", local)).not.toThrow();
    expect(() => requirePilotAccess("boss", "worker", local)).not.toThrow();
    expect(() => requirePilotAccess("other", "worker", local)).toThrow("alcance");
    expect(() => requirePilotAccess("boss", "other", local)).toThrow("alcance");
    for (const changed of [
      { NETLIFY_DEV: "false" },
      { WORKFLOW_LOCAL_REAL_ENABLED: "false" },
      { CONTEXT: "deploy-preview" },
      { APP_ORIGIN: "http://remote.invalid:8888" },
      { WORKFLOW_WRITE_MODE: "enabled" },
    ])
      expect(() => runtimePolicy({ ...local, ...changed })).toThrow();
    expect(() => runtimePolicy({ ...local, WORKFLOW_PRODUCTION_ENABLED: "false" })).toThrow(
      "deshabilitado",
    );
  });
  it("uses real runtime only and defaults to disabled writes", () => {
    expect(runtimePolicy(env).local).toBe(false);
    expect(runtimePolicy({ ...env, WORKFLOW_WRITE_MODE: "disabled" }).writeMode).toBe("disabled");
    expect(() =>
      requirePilotAccess("existing", undefined, { ...env, WORKFLOW_WRITE_MODE: "disabled" }),
    ).toThrow("deshabilitadas");
  });
  it.each(["WORKFLOW_EMULATOR_MODE", "FIRESTORE_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST"])(
    "refuses %s in production",
    (key) => {
      expect(() =>
        runtimePolicy({ ...env, [key]: key === "WORKFLOW_EMULATOR_MODE" ? "1" : "127.0.0.1:1" }),
      ).toThrow("emuladores");
    },
  );
  it("cannot authorize a manager for the original area of a record after a worker changes areas", async () => {
    fixtures.records.set("users/existing-manager", { active: true, role: "jefe", area: "Ventas" });
    fixtures.records.set("users/existing-worker", {
      active: true,
      role: "trabajador",
      area: "Ventas",
    });
    fixtures.records.set("overtime/existing-record", {
      workerId: "existing-worker",
      area: "Inventario",
      status: "pendiente",
    });
    await expect(
      execute(
        "existing-manager",
        "existing-request",
        { action: "reviewOvertime", id: "existing-record", approve: true, note: "Revisión" },
        { authorizeWorker: () => {}, enforceRateLimit: true },
      ),
    ).rejects.toThrow("área original");
    expect(fixtures.create).not.toHaveBeenCalled();
    expect(fixtures.update).not.toHaveBeenCalled();
    expect(fixtures.set).not.toHaveBeenCalled();
  });
});
