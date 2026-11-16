import { afterEach, describe, expect, it, vi } from "vitest";
import {
  runtimePolicy,
  requireWorkflowAccess,
  isWorkflowServiceAccount,
  WORKFLOW_SERVICE_ACCOUNT,
} from "../server/runtime-production";
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
  it("allows local general operation only with Netlify Dev, explicit opt-in and fixed origin", () => {
    const local = {
      ...env,
      NETLIFY_DEV: "true",
      CONTEXT: "dev",
      WORKFLOW_LOCAL_REAL_ENABLED: "true",
      APP_ORIGIN: "http://localhost:8888",
      WORKFLOW_WRITE_MODE: "enabled",
    };
    expect(runtimePolicy(local).writeMode).toBe("enabled");
    expect(() => requireWorkflowAccess(local)).not.toThrow();
    for (const changed of [
      { NETLIFY_DEV: "false" },
      { WORKFLOW_LOCAL_REAL_ENABLED: "false" },
      { CONTEXT: "deploy-preview" },
      { APP_ORIGIN: "http://remote.invalid:8888" },
      { WORKFLOW_WRITE_MODE: "pilot" },
    ])
      expect(() => runtimePolicy({ ...local, ...changed })).toThrow();
    expect(() => runtimePolicy({ ...local, WORKFLOW_PRODUCTION_ENABLED: "false" })).toThrow(
      "deshabilitado",
    );
  });
  it("uses real runtime only and defaults to disabled writes", () => {
    expect(runtimePolicy(env).local).toBe(false);
    expect(runtimePolicy({ ...env, WORKFLOW_WRITE_MODE: "disabled" }).writeMode).toBe("disabled");
    expect(() => requireWorkflowAccess({ ...env, WORKFLOW_WRITE_MODE: "disabled" })).toThrow(
      "deshabilitadas",
    );
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
    fixtures.records.set("users/existing-manager", {
      active: true,
      role: "jefe",
      area: "Ventas",
      name: "Manager",
    });
    fixtures.records.set("users/existing-worker", {
      active: true,
      role: "trabajador",
      area: "Ventas",
      name: "Worker",
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
  it("accepts a replacement key for the same dedicated service identity, never another account/project", () => {
    const sample = {
      type: "service_account",
      project_id: "sanicenterdb",
      client_email: WORKFLOW_SERVICE_ACCOUNT,
      private_key_id: "synthetic-replacement-id",
      private_key: "synthetic-test-value-not-a-private-key",
    };
    expect(isWorkflowServiceAccount(sample)).toBe(true);
    for (const changed of [
      { project_id: "other" },
      { client_email: "other@sanicenterdb.iam.gserviceaccount.com" },
      { private_key: "" },
      { private_key_id: "" },
      { type: "authorized_user" },
    ])
      expect(isWorkflowServiceAccount({ ...sample, ...changed })).toBe(false);
  });
  it.each([
    null,
    { active: false, role: "trabajador", name: "Name", area: "Inventario" },
    { active: true, role: "unknown", name: "Name", area: "Inventario" },
    { active: true, role: "trabajador", name: "", area: "Inventario" },
    { active: true, role: "trabajador", name: "Name", area: "" },
    { active: true, role: "jefe", name: "Name", area: "Inventario", authorizedAreas: [123] },
  ])("rejects a missing, inactive or malformed profile before any write", async (profile) => {
    if (profile) fixtures.records.set("users/future-uid", profile);
    await expect(
      execute(
        "future-uid",
        "new-request",
        {
          action: "addOvertime",
          date: "2026-11-01",
          start: "18:00",
          end: "19:00",
          reason: "Horas",
        },
        { authorizeWorker: () => {}, enforceRateLimit: true },
      ),
    ).rejects.toThrow("Perfil");
    expect(fixtures.create).not.toHaveBeenCalled();
    expect(fixtures.update).not.toHaveBeenCalled();
    expect(fixtures.set).not.toHaveBeenCalled();
  });
});
