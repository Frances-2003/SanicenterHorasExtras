import type { Config, Context } from "@netlify/functions";
import { handleWorkflow } from "../../server/http";
export default async function workflow(request: Request, context?: Pick<Context, "deploy">) {
  // CONTEXT is a build variable, so inspect the platform's runtime context as well.
  if (process.env["WORKFLOW_EMULATOR_MODE"] !== "1" && context?.deploy.context !== "production")
    return Response.json(
      { ok: false, error: "Función real bloqueada fuera del contexto de producción." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  return handleWorkflow(request);
}
export const config: Config = {
  path: "/api/workflow",
  rateLimit: {
    windowLimit: 120,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
    action: "rate_limit",
  },
};
