import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { loadEnv } from "vite";
import { zipFunctions } from "@netlify/zip-it-and-ship-it";

const publicEnv = loadEnv("production", process.cwd(), "VITE_");
const preview = Boolean(process.env.CONTEXT && process.env.CONTEXT !== "production");
const realLogin = !preview && publicEnv.VITE_REAL_FIREBASE_ENABLED !== "false";
const realWrites = !preview && realLogin && publicEnv.VITE_REAL_FINANCIAL_WRITES_ENABLED === "true";
if (realLogin && publicEnv.VITE_WORKFLOW_API_URL?.trim())
  throw new Error(
    "En producción VITE_WORKFLOW_API_URL debe quedar vacío: el backend usa el mismo origen de Netlify.",
  );
if (
  realLogin &&
  (publicEnv.VITE_FIREBASE_PROJECT_ID !== "sanicenterdb" ||
    ["VITE_FIREBASE_API_KEY", "VITE_FIREBASE_AUTH_DOMAIN", "VITE_FIREBASE_APP_ID"].some(
      (k) => !publicEnv[k]?.trim(),
    ))
)
  throw new Error(
    "Configura los campos públicos de sanicenterdb antes de compilar para producción.",
  );
const result = spawnSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  windowsHide: true,
  env: {
    ...process.env,
    NITRO_PRESET: "netlify",
    VITE_REAL_FIREBASE_ENABLED: String(realLogin),
    VITE_REAL_FINANCIAL_WRITES_ENABLED: String(realWrites),
  },
});
if (result.status !== 0 || result.error) process.exit(result.status || 1);
const entry = ".netlify/functions-internal/server/server.mjs";
const generated = readFileSync(entry, "utf8");
if (!generated.includes('excludedPath: ["/.netlify/*"]'))
  throw new Error("Revisar el adaptador Nitro antes de publicar.");
writeFileSync(
  entry,
  generated.replace('excludedPath: ["/.netlify/*"]', 'excludedPath: ["/.netlify/*", "/api/*"]'),
);
mkdirSync(".netlify/functions-prepared", { recursive: true });
const runtime = resolve("server/runtime.ts");
const prepared = ".netlify/functions-prepared/workflow.mjs";
const compiled = await build({
  entryPoints: ["netlify/functions/workflow.ts"],
  outfile: prepared,
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  packages: "external",
  metafile: true,
  plugins: [
    {
      name: "production-runtime-only",
      setup(builder) {
        builder.onResolve({ filter: /(?:^|\/)runtime(?:\.ts)?$/ }, (args) => {
          const candidate = resolve(
            dirname(args.importer),
            args.path.endsWith(".ts") ? args.path : args.path + ".ts",
          );
          return candidate === runtime
            ? { path: resolve("server/runtime-production.ts") }
            : undefined;
        });
      },
    },
  ],
});
if (
  Object.keys(compiled.metafile.inputs).some((p) =>
    /emulator-safety|local-fixtures|server\/runtime\.ts$/.test(p),
  )
)
  throw new Error("El paquete de producción incluye un runtime de emuladores.");
process.env.WORKFLOW_EMULATOR_MODE = "0";
process.env.WORKFLOW_PRODUCTION_ENABLED = "false";
const { default: workflow, config } = await import(pathToFileURL(resolve(prepared)).href);
const closed = await workflow(
  new Request("https://local.invalid/api/workflow", { method: "POST", body: "{}" }),
  { deploy: { context: "production" } },
);
if (config.path !== "/api/workflow" || closed.status !== 503)
  throw new Error("Falló la comprobación del paquete cerrado.");
function checkPublic(dir) {
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, file.name);
    if (file.isDirectory()) checkPublic(path);
    else if (/\.(js|mjs|json|html|map)$/.test(path)) {
      const content = readFileSync(path, "utf8");
      if (
        /FIREBASE_SERVICE_ACCOUNT_JSON|BEGIN (?:RSA )?PRIVATE KEY|"private_key"\s*:/.test(content)
      )
        throw new Error("Credencial de servidor detectada en archivos públicos.");
      if (
        /demo-sanicenter|Ana Torres|Luis Ramírez|Admin Demo|SaniDemo2026!|local-ana/.test(content)
      )
        throw new Error("Datos de demostración detectados en el build publicable.");
    }
  }
}
checkPublic("dist");
checkPublic(".netlify/functions-internal/server");
const manifest = ".netlify/deploy-functions/manifest.json";
const archives = await zipFunctions(
  [".netlify/functions-prepared", ".netlify/functions-internal"],
  ".netlify/deploy-functions",
  {
    basePath: process.cwd(),
    archiveFormat: "zip",
    manifest,
    parallelLimit: 1,
    config: {
      "*": { nodeVersion: "24" },
      workflow: {
        nodeBundler: "esbuild",
        externalNodeModules: [
          "firebase-admin",
          "@google-cloud/firestore",
          "@google-cloud/firestore-api",
        ],
      },
      server: {
        nodeBundler: "none",
        includedFiles: ["**"],
        includedFilesBasePath: resolve(".netlify/functions-internal/server"),
      },
    },
  },
);
const packaged = JSON.parse(readFileSync(manifest, "utf8")).functions;
if (
  archives.length !== 2 ||
  !packaged.some(
    (f) => f.name === "workflow" && f.routes?.some((r) => r.pattern === "/api/workflow"),
  ) ||
  !packaged.some((f) => f.name === "server")
)
  throw new Error("Faltan funciones o rutas en el manifiesto publicable.");
const sha = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const report = {
  generatedAt: new Date().toISOString(),
  projectId: realLogin ? "sanicenterdb" : "disabled",
  realLogin,
  realFinancialWritesRequested: realWrites,
  backendActivation: "requires-authorized-runtime-settings",
  productionRuntimeHasEmulatorDependencies: false,
  demonstrationDataIncluded: false,
  firestoreRulesSha256: sha("firestore.rules"),
  firestoreIndexesSha256: sha("firestore.indexes.json"),
  functions: archives.map((f) => ({
    name: f.name,
    path: f.path,
    bytes: statSync(f.path).size,
    sha256: sha(f.path),
  })),
};
writeFileSync(".netlify/production-readiness.json", JSON.stringify(report, null, 2));
console.log(
  "Netlify: frontend y dos funciones empaquetadas; runtime productivo sin emuladores; credenciales fuera de dist.",
);
console.log(
  JSON.stringify({
    realLogin,
    realFinancialWritesRequested: realWrites,
    manifest,
    report: ".netlify/production-readiness.json",
  }),
);
