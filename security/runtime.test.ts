import { afterEach, describe, expect, it, vi } from "vitest";
import { runtimePolicy, requirePilotAccess } from "../server/runtime";
import workflow, { config } from "../netlify/functions/workflow";
const production = {
  WORKFLOW_PRODUCTION_ENABLED: "true",
  GOOGLE_CLOUD_PROJECT: "sanicenterdb",
  APP_ORIGIN: "https://example.netlify.app",
  CONTEXT: "production",
};
afterEach(() => vi.unstubAllEnvs());
describe("Netlify activation safety", () => {
  it("defaults to disabled and rejects mixed projects, emulator hosts and previews", () => {
    expect(() => runtimePolicy({})).toThrow("deshabilitado");
    expect(runtimePolicy(production).writeMode).toBe("disabled");
    expect(() => runtimePolicy({ ...production, GOOGLE_CLOUD_PROJECT: "other" })).toThrow(
      "inconsistente",
    );
    expect(() =>
      runtimePolicy({ ...production, FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099" }),
    ).toThrow("inconsistente");
    expect(() => runtimePolicy({ ...production, CONTEXT: "deploy-preview" })).toThrow("previews");
    expect(() => runtimePolicy({ ...production, APP_ORIGIN: "http://example.com" })).toThrow(
      "HTTPS",
    );
  });
  it("limits pilots by both actor and worker without granting business permissions", () => {
    const env = {
      ...production,
      WORKFLOW_WRITE_MODE: "pilot",
      WORKFLOW_ALLOWED_ACTOR_UIDS: "boss,worker",
      WORKFLOW_ALLOWED_WORKER_UIDS: "worker",
    };
    expect(() => requirePilotAccess("boss", "worker", env)).not.toThrow();
    expect(() => requirePilotAccess("other", "worker", env)).toThrow("piloto");
    expect(() => requirePilotAccess("boss", "outside", env)).toThrow("piloto");
    expect(() => requirePilotAccess("boss", undefined, production)).toThrow("deshabilitadas");
  });
  it("the native function responds closed before loading credentials or accessing Firebase", async () => {
    vi.stubEnv("WORKFLOW_EMULATOR_MODE", "0");
    vi.stubEnv("WORKFLOW_PRODUCTION_ENABLED", "false");
    expect(config.path).toBe("/api/workflow");
    const response = await workflow(
      new Request("https://example.netlify.app/api/workflow", { method: "POST", body: "{}" }),
    );
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private_key");
  });
  it("uses the Netlify runtime deploy context to block preview writes even if activation variables were copied", async () => {
    vi.stubEnv("WORKFLOW_EMULATOR_MODE", "0");
    vi.stubEnv("WORKFLOW_PRODUCTION_ENABLED", "true");
    const response = await workflow(new Request("https://preview.invalid/api/workflow"), {
      deploy: { context: "deploy-preview", id: "local", published: false },
    });
    expect(response.status).toBe(503);
    expect(await response.text()).toContain("contexto");
  });
});
