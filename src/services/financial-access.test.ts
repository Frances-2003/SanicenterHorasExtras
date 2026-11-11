import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ token: vi.fn(), requireServices: vi.fn() }));
vi.mock("@/lib/firebase", () => ({
  db: {},
  firebaseAuth: { currentUser: { uid: "worker", getIdToken: mocks.token } },
}));
vi.mock("@/lib/emulator-config", () => ({
  financialWritesEnabled: false,
  isEmulatorMode: false,
  isRealFirebaseEnabled: true,
  realFirebaseConfigurationError: null,
  requireLocalServices: mocks.requireServices,
}));
import {
  addOvertime,
  requestCompensation,
  reviewOvertime,
  voidOvertime,
  reviewCompensation,
  requestCancellation,
  reviewCancellation,
  confirmRest,
} from "./store";
it("blocks every real financial action before a token, HTTP call or counter operation", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  try {
    const actions = [
      () =>
        addOvertime({
          workerId: "worker",
          date: "2026-01-01",
          start: "18:00",
          end: "19:00",
          reason: "Prueba",
        }),
      () =>
        requestCompensation({
          workerId: "worker",
          date: "2099-01-01",
          start: "08:00",
          end: "09:00",
          reason: "Prueba",
          allocations: [],
        }),
      () => reviewOvertime("id", true, "Prueba"),
      () => reviewOvertime("id", false, "Prueba"),
      () => voidOvertime("id", "Prueba"),
      () => reviewCompensation("id", true, "Prueba"),
      () => reviewCompensation("id", false, "Prueba"),
      () => requestCancellation("id", "Prueba"),
      () => reviewCancellation("id", true, "Prueba"),
      () => reviewCancellation("id", false, "Prueba"),
      () => reviewCancellation("id", true, "Prueba", true),
      () => confirmRest("id", "Prueba"),
    ];
    for (const action of actions)
      expect(await action()).toMatchObject({
        ok: false,
        error: expect.stringContaining("bloqueadas"),
      });
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.token).not.toHaveBeenCalled();
    expect(mocks.requireServices).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllGlobals();
  }
});
