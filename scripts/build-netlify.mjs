import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    NITRO_PRESET: "netlify",
    ...(process.env.CONTEXT && process.env.CONTEXT !== "production"
      ? { VITE_REAL_FIREBASE_ENABLED: "false" }
      : {}),
  },
});
if (result.status !== 0 || result.error) process.exit(result.status || 1);
// Reserve the API namespace for our authenticated function, apart from Nitro's SSR catch-all.
const entry = ".netlify/functions-internal/server/server.mjs";
const generated = readFileSync(entry, "utf8");
if (!generated.includes('excludedPath: ["/.netlify/*"]'))
  throw new Error("Revisar el formato del adaptador Nitro antes de publicar.");
writeFileSync(
  entry,
  generated.replace('excludedPath: ["/.netlify/*"]', 'excludedPath: ["/.netlify/*", "/api/*"]'),
);
mkdirSync("test-results/netlify", { recursive: true });
await build({
  entryPoints: ["netlify/functions/workflow.ts"],
  outfile: "test-results/netlify/workflow.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
});
process.env.WORKFLOW_EMULATOR_MODE = "0";
process.env.WORKFLOW_PRODUCTION_ENABLED = "false";
const { default: workflow, config } = await import(
  pathToFileURL(resolve("test-results/netlify/workflow.mjs")).href
);
if (
  config.path !== "/api/workflow" ||
  (
    await workflow(
      new Request("https://local.invalid/api/workflow", { method: "POST", body: "{}" }),
    )
  ).status !== 503
)
  throw new Error("Falló la comprobación del paquete de la función.");
function checkPublic(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) checkPublic(path);
    else if (
      /\.(js|json|html|map)$/.test(path) &&
      /FIREBASE_SERVICE_ACCOUNT_JSON|BEGIN (?:RSA )?PRIVATE KEY|"private_key"\s*:/.test(
        readFileSync(path, "utf8"),
      )
    )
      throw new Error("Contenido exclusivo del servidor detectado en el directorio público.");
  }
}
checkPublic("dist");
console.log(
  "Netlify: SSR sin rutas /api, función Node empaquetada y cerrada, frontend sin credenciales privadas.",
);
