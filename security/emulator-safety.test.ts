import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertEmulatorEnvironment,
  localCredential,
  requireEmulators,
} from "../server/emulator-safety";

const safe = {
  WORKFLOW_EMULATOR_MODE: "1",
  GOOGLE_CLOUD_PROJECT: "demo-sanicenter",
  GCLOUD_PROJECT: "demo-sanicenter",
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8085",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
};
beforeEach(() => {
  for (const [key, value] of Object.entries(safe)) vi.stubEnv(key, value);
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Fail-closed emulator guards", () => {
  it.each(Object.keys(safe))("rejects missing or altered %s before any connection", (key) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() => assertEmulatorEnvironment({ ...safe, [key]: "production" })).toThrow("bloqueado");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("rejects production credential files", () => {
    expect(() =>
      assertEmulatorEnvironment({ ...safe, GOOGLE_APPLICATION_CREDENTIALS: "real.json" }),
    ).toThrow("credenciales");
  });
  it("refuses unavailable Auth or Firestore instead of falling back", async () => {
    for (const unavailable of [0, 1]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => ({
          ok: !url.includes(unavailable === 0 ? ":9099" : ":8085"),
          status: url.includes(unavailable === 0 ? ":9099" : ":8085") ? 503 : 200,
        })),
      );
      await expect(requireEmulators()).rejects.toThrow("bloqueada");
    }
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
    await expect(requireEmulators()).rejects.toThrow("ECONNREFUSED");
  });
  it("uses only fixed loopback endpoints", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetch);
    await requireEmulators();
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) expect(new URL(url).hostname).toBe("127.0.0.1");
  });
  it("synthetic local credentials cannot obtain Google OAuth tokens", async () => {
    await expect(localCredential().getAccessToken()).rejects.toThrow(
      "no puede solicitar credenciales",
    );
  });
});
