import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const sdk = vi.hoisted(() => ({
  initialize: vi.fn((options, name) => ({ options, name })),
  authEmulator: vi.fn(),
  firestoreEmulator: vi.fn(),
}));
vi.mock("firebase/app", () => ({
  getApps: () => [],
  getApp: vi.fn(),
  initializeApp: sdk.initialize,
}));
vi.mock("firebase/auth", () => ({ getAuth: () => ({}), connectAuthEmulator: sdk.authEmulator }));
vi.mock("firebase/firestore", () => ({
  getFirestore: () => ({}),
  connectFirestoreEmulator: sdk.firestoreEmulator,
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    MODE: "development",
    VITE_REAL_FIREBASE_ENABLED: "true",
    VITE_REAL_FINANCIAL_WRITES_ENABLED: "false",
    VITE_FIREBASE_PROJECT_ID: "sanicenterdb",
    VITE_FIREBASE_API_KEY: "public-test-key",
    VITE_FIREBASE_AUTH_DOMAIN: "sanicenterdb.firebaseapp.com",
    VITE_FIREBASE_APP_ID: "public-test-app",
  }))
    vi.stubEnv(key, value);
  vi.stubEnv("DEV", true);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe("Firebase login and financial environment separation", () => {
  it("normal development selects sanicenterdb and permits login without probing emulators", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { app } = await import("./firebase");
    const policy = await import("./emulator-config");
    expect(app.options.projectId).toBe("sanicenterdb");
    await expect(policy.requireLocalServices()).resolves.toBeUndefined();
    expect(policy.financialWritesEnabled).toBe(false);
    expect(sdk.authEmulator).not.toHaveBeenCalled();
    expect(sdk.firestoreEmulator).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("real financial writes remain blocked in development even if a write flag is accidentally enabled", async () => {
    vi.stubEnv("VITE_REAL_FINANCIAL_WRITES_ENABLED", "true");
    expect((await import("./emulator-config")).financialWritesEnabled).toBe(false);
  });
  it("demo overrides all real settings and connects only to fixed loopback emulators", async () => {
    vi.stubEnv("MODE", "emulator");
    const { app } = await import("./firebase");
    const policy = await import("./emulator-config");
    expect(app.options.projectId).toBe("demo-sanicenter");
    expect(sdk.authEmulator).toHaveBeenCalledWith({}, "http://127.0.0.1:9099", {
      disableWarnings: true,
    });
    expect(sdk.firestoreEmulator).toHaveBeenCalledWith({}, "127.0.0.1", 8085);
    expect(policy.financialWritesEnabled).toBe(true);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(policy.requireLocalServices()).rejects.toMatchObject({
      code: "connection/emulators-unavailable",
    });
    expect(sdk.initialize).toHaveBeenCalledTimes(1);
  });
  it.each([
    "VITE_FIREBASE_PROJECT_ID",
    "VITE_FIREBASE_API_KEY",
    "VITE_FIREBASE_AUTH_DOMAIN",
    "VITE_FIREBASE_APP_ID",
  ])("invalid %s blocks authentication with an explicit configuration error", async (key) => {
    vi.stubEnv(key, "");
    const policy = await import("./emulator-config");
    await expect(policy.requireLocalServices()).rejects.toMatchObject({
      code: "config/firebase-invalid",
    });
    expect((await import("./firebase")).app.options.projectId).toBe("sanicenter-disabled");
  });
  it("production build stays disabled without separate explicit activation", async () => {
    vi.stubEnv("MODE", "production");
    vi.stubEnv("DEV", false);
    vi.stubEnv("VITE_REAL_FIREBASE_ENABLED", "false");
    const policy = await import("./emulator-config");
    expect(policy.financialWritesEnabled).toBe(false);
    await expect(policy.requireLocalServices()).rejects.toMatchObject({
      code: "config/firebase-disabled",
    });
  });
});
