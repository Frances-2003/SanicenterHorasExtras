import { createElement, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getDoc: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
  requireServices: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.login,
  signOut: mocks.logout,
}));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: mocks.getDoc }));
vi.mock("@/lib/firebase", () => ({ firebaseAuth: {}, db: {} }));
vi.mock("@/lib/emulator-config", () => ({
  isEmulatorMode: false,
  requireLocalServices: mocks.requireServices,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
}));
import { Route } from "@/routes/index";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireServices.mockResolvedValue(undefined);
  mocks.login.mockResolvedValue({ user: { uid: "worker" } });
  mocks.logout.mockResolvedValue(undefined);
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ username: "ANA", name: "Ana", role: "trabajador", active: true }),
  });
});
afterEach(cleanup);
function submit(username = "ana") {
  render(createElement(Route.options.component as ComponentType));
  fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: username } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}
describe("Existing Firebase password login", () => {
  it("preserves JBERNALES username mapping and worker navigation with simulated credentials", async () => {
    mocks.getDoc.mockResolvedValue({
      exists: () => true,
      data: () => ({
        username: "JBERNALES",
        name: "Trabajador de prueba",
        role: "trabajador",
        area: "Inventario",
        active: true,
      }),
    });
    submit("jbernales");
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/horas" }));
    expect(mocks.login).toHaveBeenCalledWith(
      {},
      "jbernales@auth.sanicenter.invalid",
      "test-password",
    );
  });
  it.each([
    ["config/firebase-disabled", "configuración"],
    ["connection/emulators-unavailable", "conectar"],
    ["auth/network-request-failed", "conectar"],
    ["auth/invalid-credential", "contraseña no son válidos"],
    ["auth/invalid-api-key", "configuración"],
    ["permission-denied", "perfil en Firestore"],
  ])("distinguishes %s and logs only its diagnostic code", async (code, message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const error = { code, customData: { privateValue: "not-for-logs" } };
      if (code.startsWith("config/") || code.startsWith("connection/"))
        mocks.requireServices.mockRejectedValue(error);
      else mocks.login.mockRejectedValue(error);
      submit();
      await waitFor(() =>
        expect(mocks.error).toHaveBeenCalledWith(expect.stringContaining(message)),
      );
      expect(log).toHaveBeenCalledWith("login_failed", { code });
      if (code.startsWith("config/") || code.startsWith("connection/"))
        expect(mocks.login).not.toHaveBeenCalled();
    } finally {
      log.mockRestore();
    }
  });
  it("preserves the technical email mapping and password SDK login", async () => {
    submit();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({ to: "/horas" }));
    expect(mocks.login).toHaveBeenCalledWith({}, "ana@auth.sanicenter.invalid", "test-password");
  });
  it.each(["inactive", "missing", "invalid-role"])("refuses %s profiles", async (kind) => {
    mocks.getDoc.mockResolvedValue({
      exists: () => kind !== "missing",
      data: () => ({
        username: "ANA",
        name: "Ana",
        role: kind === "invalid-role" ? "owner" : "trabajador",
        active: kind !== "inactive",
      }),
    });
    submit();
    await waitFor(() => expect(mocks.logout).toHaveBeenCalled());
    expect(mocks.navigate).not.toHaveBeenCalled();
  });
});
