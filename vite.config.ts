// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    plugins: [
      {
        name: "sanicenter-production-data-guard",
        apply: "build",
        transform(_code, id) {
          if (/(?:^|[/\\])(?:demoData|local-fixtures)(?:\.[cm]?[jt]sx?)(?:\?|$)/.test(id))
            throw new Error(
              "Los datos de demostración no pueden formar parte de un build publicable.",
            );
          return null;
        },
      },
      {
        name: "sanicenter-local-api-guard",
        configureServer(server) {
          if (server.config.mode === "emulator") return;
          server.middlewares.use((req, res, next) => {
            const path = req.url?.split("?")[0];
            const workflow = path?.startsWith("/api/workflow");
            if (!workflow && !path?.startsWith("/api/local-health")) return next();
            res.writeHead(workflow ? 503 : 404, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            });
            res.end(
              JSON.stringify({
                ok: false,
                error:
                  "El modo normal permite iniciar sesión; el backend financiero está deshabilitado.",
              }),
            );
          });
        },
      },
    ],
    server: {
      watch: { ignored: ["**/playwright-report/**", "**/test-results/**", "**/*.log"] },
      proxy: {
        "/api/workflow": "http://127.0.0.1:8788",
        "/api/local-health": "http://127.0.0.1:8788",
      },
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
