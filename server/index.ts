import { createServer } from "node:http";
import { Readable } from "node:stream";
import { handleWorkflow } from "./http";
import { initializeRuntime } from "./runtime";

await initializeRuntime();
const local = process.env["WORKFLOW_EMULATOR_MODE"] === "1";
const server = createServer(async (req, res) => {
  try {
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers))
      if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
    const request = new Request(`http://127.0.0.1${req.url || "/"}`, {
      method: req.method || "GET",
      headers,
      ...(!["GET", "HEAD"].includes(req.method || "GET")
        ? { body: Readable.toWeb(req) as ReadableStream, duplex: "half" }
        : {}),
    } as RequestInit);
    const response = await handleWorkflow(request);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(503).end();
  }
});
server.requestTimeout = 45000;
server.headersTimeout = 10000;
server.listen(
  Number(process.env["WORKFLOW_PORT"] || process.env["PORT"] || 8788),
  local ? "127.0.0.1" : process.env["WORKFLOW_HOST"] || "127.0.0.1",
  () => console.log("Workflow API lista."),
);
