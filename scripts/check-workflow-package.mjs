import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { unzipSync } from "fflate";

/** Test the actual Netlify archive, outside the repository's node_modules. */
export function checkWorkflowPackage(archive, nodeExecutable = process.execPath) {
  const files = unzipSync(readFileSync(archive));
  const entries = Object.keys(files);
  const modulePath = entries.find((name) =>
    name === "workflow.mjs" || name.endsWith("/functions-prepared/workflow.mjs"),
  );
  assert.ok(modulePath, "El ZIP no contiene el módulo workflow preparado.");
  assert.ok(entries.includes("___netlify-entry-point.mjs"), "Falta la entrada Lambda de Netlify.");
  const isolated = mkdtempSync(resolve(tmpdir(), "sanicenter-workflow-package-"));
  try {
    for (const [name, bytes] of Object.entries(files)) {
      const target = resolve(isolated, name);
      const rel = relative(isolated, target);
      assert.ok(rel && !rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
      if (name.endsWith("/")) mkdirSync(target, { recursive: true });
      else {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      }
    }
    // No service credential, ADC, emulator, NODE_OPTIONS or project settings are
    // inherited. Prevent even an accidental network request during cold start.
    const probe = `
      import assert from 'node:assert/strict';
      import http from 'node:http';
      import https from 'node:https';
      import net from 'node:net';
      import tls from 'node:tls';
      import { syncBuiltinESMExports } from 'node:module';
      const blocked = () => { throw new Error('Network forbidden in package test'); };
      globalThis.fetch = blocked;
      http.request = http.get = https.request = https.get = blocked;
      net.connect = net.createConnection = tls.connect = blocked;
      net.Socket.prototype.connect = blocked;
      syncBuiltinESMExports();
      assert.equal(process.env.NODE_OPTIONS, '');
      assert.equal(process.features.require_module, false);
      assert.equal(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, undefined);
      assert.equal(process.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
      assert.equal(process.env.WORKFLOW_PRODUCTION_ENABLED, 'false');
      // AWS provides this registration primitive before importing the bootstrap.
      globalThis.awslambda = {streamifyResponse: handler => handler};
      // Import both the platform bootstrap and the exact function inside the ZIP.
      const lambda = await import('./___netlify-entry-point.mjs');
      assert.equal(typeof lambda.handler, 'function');
      const { default: workflow, config } = await import(${JSON.stringify(`./${modulePath}`)});
      assert.equal(config.path, '/api/workflow');
      let checks = 0;
      for (const context of ['production', 'deploy-preview']) {
        for (const method of ['GET', 'POST']) {
          const response = await workflow(new Request('https://package.invalid/api/workflow', {
            method, ...(method === 'POST' ? {body: '{}'} : {})
          }), {deploy: {context}});
          assert.equal(response.status, 503);
          assert.equal(response.headers.get('cache-control'), 'no-store');
          assert.equal((await response.json()).ok, false);
          checks++;
        }
      }
      console.log(JSON.stringify({node: process.version, checks, status: 503, network: false, requireEsm: false}));
    `;
    const probePath = resolve(isolated, "probe.mjs");
    writeFileSync(probePath, probe);
    const env = {
      NODE_OPTIONS: "",
      WORKFLOW_PRODUCTION_ENABLED: "false",
      WORKFLOW_WRITE_MODE: "disabled",
      WORKFLOW_EMULATOR_MODE: "0",
    };
    // Windows needs these OS settings; no application environment is copied.
    for (const key of ["SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "PATH", "Path"])
      if (process.env[key]) env[key] = process.env[key];
    const result = spawnSync(nodeExecutable, [
      "--no-experimental-require-module",
      "--no-experimental-detect-module",
      probePath,
    ], { cwd: isolated, env, encoding: "utf8", timeout: 30000, windowsHide: true });
    if (result.status !== 0 || result.error) {
      // The child has no credentials; show the module failure for build diagnostics.
      const lines = result.stderr?.split(/\r?\n/).filter((line) => line.length < 500) || [];
      const diagnostic = [...lines.slice(0, 8), ...lines.slice(-6)].join("\n");
      throw new Error(`Falló la carga aislada del ZIP workflow: ${diagnostic || result.error?.message}`);
    }
    return JSON.parse(result.stdout.trim().split("\n").at(-1));
  } finally {
    // Only the fresh directory created above may be removed recursively.
    assert.ok(isolated.startsWith(resolve(tmpdir()) + sep));
    rmSync(isolated, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(checkWorkflowPackage(
    resolve(".netlify/deploy-functions/workflow.zip"),
    process.env.WORKFLOW_TEST_NODE || process.execPath,
  )));
}
