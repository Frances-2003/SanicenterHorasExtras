import { getAuth } from "firebase-admin/auth";
import { execute } from "./workflow-store";
import { WorkflowError } from "../src/services/workflow";
import { initializeRuntime, PolicyError, requirePilotAccess, runtimePolicy } from "./runtime";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
async function boundedBody(request: Request) {
  if (Number(request.headers.get("content-length")) > 32768)
    throw new PolicyError("Solicitud demasiado grande.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new WorkflowError("JSON inválido.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 32768) {
        await reader.cancel();
        throw new PolicyError("Solicitud demasiado grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkflowError("JSON inválido.");
  }
}
export async function handleWorkflow(request: Request): Promise<Response> {
  let cors: Record<string, string> = {};
  try {
    const policy = runtimePolicy();
    const path = new URL(request.url).pathname;
    if (!["/api/workflow", "/api/local-health"].includes(path)) return json({ ok: false }, 404);
    const origin = request.headers.get("origin");
    if (origin && origin !== policy.origin)
      return json({ ok: false, error: "Origen no autorizado." }, 403);
    if (origin)
      cors = {
        "Access-Control-Allow-Origin": policy.origin,
        Vary: "Origin",
        "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Request-Id",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (path === "/api/local-health") {
      if (!policy.local || request.method !== "GET") return json({ ok: false }, 404);
      await initializeRuntime();
      return json({ projectId: "demo-sanicenter", emulators: true });
    }
    if (request.method !== "POST")
      return json({ ok: false, error: "Método no permitido." }, 405, { Allow: "POST, OPTIONS" });
    if (policy.writeMode === "disabled")
      throw new PolicyError("Las escrituras están deshabilitadas.");
    const bearer = /^Bearer (.+)$/.exec(request.headers.get("authorization") || "");
    if (!bearer?.[1]) return json({ ok: false, error: "Inicia sesión." }, 401, cors);
    const id = request.headers.get("x-request-id") || "";
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
      throw new WorkflowError("Identificador de operación inválido.");
    const body = await boundedBody(request);
    await initializeRuntime();
    let uid: string;
    try {
      uid = (await getAuth().verifyIdToken(bearer[1], true)).uid;
    } catch {
      return json({ ok: false, error: "Sesión inválida o revocada." }, 401, cors);
    }
    requirePilotAccess(uid);
    return json(
      await execute(uid, id, body, {
        authorizeWorker: (workerId) => requirePilotAccess(uid, workerId),
        enforceRateLimit: true,
      }),
      200,
      cors,
    );
  } catch (error) {
    if (error instanceof PolicyError)
      return json({ ok: false, error: error.message }, error.status, cors);
    if (error instanceof WorkflowError) return json({ ok: false, error: error.message }, 400, cors);
    console.error("workflow_failed", {
      code: (error as { code?: string | number })?.code || "internal",
    });
    return json(
      {
        ok: false,
        error: "Operación no confirmada. Reintenta la misma solicitud; no se duplicará.",
      },
      503,
      cors,
    );
  }
}
