import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/lib/firebase", () => ({ db: {}, firebaseAuth: { currentUser: null } }));
import { setAuthenticatedUser, useStore } from "./store";

it("keeps the server hydration snapshot stable while the client session changes", () => {
  setAuthenticatedUser(null);
  function Probe() {
    return <span>{useStore().authLoading ? "loading" : "ready"}</span>;
  }
  expect(renderToString(<Probe />)).toContain("loading");
  const client = renderHook(() => useStore());
  expect(client.result.current.authLoading).toBe(false);
  client.unmount();
});
