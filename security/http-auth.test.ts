import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), execute: vi.fn(), initialize: vi.fn() }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken: mocks.verify }) }));
vi.mock("../server/workflow-store", () => ({ execute: mocks.execute }));
vi.mock("../server/runtime", async () => {
  const actual = await import("../server/runtime-production");
  const env = {
    WORKFLOW_PRODUCTION_ENABLED: "true",
    GOOGLE_CLOUD_PROJECT: "sanicenterdb",
    APP_ORIGIN: "https://sanicenter.example",
    CONTEXT: "production",
    WORKFLOW_WRITE_MODE: "enabled",
  };
  return {
    PolicyError: actual.PolicyError,
    runtimePolicy: () => actual.runtimePolicy(env),
    requireWorkflowAccess: () => actual.requireWorkflowAccess(env),
    initializeRuntime: mocks.initialize,
  };
});
import { handleWorkflow } from "../server/http";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue({ ok: true, id: "saved" });
});
afterEach(() => vi.restoreAllMocks());
const request = (token?: string) =>
  new Request("https://sanicenter.example/api/workflow", {
    method: "POST",
    headers: {
      Origin: "https://sanicenter.example",
      "Content-Type": "application/json",
      "X-Request-Id": "11111111-1111-4111-8111-111111111111",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      action: "addOvertime",
      date: "2026-11-01",
      start: "18:00",
      end: "19:00",
      reason: "Trabajo",
    }),
  });
it("obtains the caller UID only from a verified Firebase token, including users created in the future", async () => {
  for (const uid of ["current-worker", "future-worker", "future-jefe", "future-admin"]) {
    mocks.verify.mockResolvedValueOnce({ uid });
    expect((await handleWorkflow(request("synthetic-test-token"))).status).toBe(200);
    expect(mocks.verify).toHaveBeenLastCalledWith("synthetic-test-token", true);
    expect(mocks.execute.mock.calls.at(-1)?.[0]).toBe(uid);
  }
});
it("denies missing, invalid, revoked or disabled-account tokens before invoking the transaction", async () => {
  expect((await handleWorkflow(request())).status).toBe(401);
  for (const code of ["auth/argument-error", "auth/id-token-revoked", "auth/user-disabled"]) {
    mocks.verify.mockRejectedValueOnce({ code });
    expect((await handleWorkflow(request("synthetic-test-token"))).status).toBe(401);
  }
  expect(mocks.execute).not.toHaveBeenCalled();
});
