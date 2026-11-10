import { createElement, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  logout: vi.fn(),
  getDoc: vi.fn(),
  navigate: vi.fn(),
  error: vi.fn(),
}));
vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: mocks.login,
  signOut: mocks.logout,
}));
vi.mock("firebase/firestore", () => ({ doc: vi.fn(), getDoc: mocks.getDoc }));
vi.mock("@/lib/firebase", () => ({ firebaseAuth: {}, db: {} }));
vi.mock("@/lib/emulator-config", () => ({
  isEmulatorMode: false,
  requireLocalServices: async () => {},
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: mocks.error } }));
vi.mock("@tanstack/react-router", async (original) => ({
  ...(await original<typeof import("@tanstack/react-router")>()),
  useNavigate: () => mocks.navigate,
}));
import { Route } from "@/routes/index";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.login.mockResolvedValue({ user: { uid: "worker" } });
  mocks.logout.mockResolvedValue(undefined);
  mocks.getDoc.mockResolvedValue({
    exists: () => true,
    data: () => ({ username: "ANA", name: "Ana", role: "trabajador", active: true }),
  });
});
afterEach(cleanup);
function submit() {
  render(createElement(Route.options.component as ComponentType));
  fireEvent.change(screen.getByLabelText("Nombre de usuario"), { target: { value: "ana" } });
  fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Iniciar sesión" }));
}
describe("Existing Firebase password login", () => {
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
