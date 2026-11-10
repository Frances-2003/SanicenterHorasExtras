import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import {
  FirestoreReadClient,
  collectLogicalBackup,
  consistentLogicalBackup,
  encryptBackup,
  decryptBackup,
  restoreOnlyToEmulator,
} from "../server/logical-backup";

let environment: RulesTestEnvironment;
const client = new FirestoreReadClient(
  "demo-sanicenter",
  "http://127.0.0.1:8095",
  async () => "owner",
);
const local = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8095", GCLOUD_PROJECT: "demo-sanicenter" };
beforeAll(async () => {
  if (
    process.env["FIRESTORE_EMULATOR_HOST"] !== local.FIRESTORE_EMULATOR_HOST ||
    process.env["GCLOUD_PROJECT"] !== local.GCLOUD_PROJECT
  )
    throw new Error("Solo emulador aislado.");
  environment = await initializeTestEnvironment({
    projectId: "demo-sanicenter",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
  await environment.clearFirestore();
});
afterAll(async () => environment?.cleanup());

describe("Encrypted logical backup, emulator restore only", () => {
  it("preserves nested collections, missing parents and native Firestore types without converting integers or timestamps", async () => {
    const fields = {
      integer: { integerValue: "9223372036854775807" },
      stamp: { timestampValue: "2026-01-02T03:04:05.123456789Z" },
      text: { stringValue: "Inventario ñ" },
      bool: { booleanValue: true },
      nil: { nullValue: null },
      double: { doubleValue: 1.25 },
      nan: { doubleValue: "NaN" },
      infinity: { doubleValue: "Infinity" },
      bytes: { bytesValue: "AQIDBA==" },
      location: { geoPointValue: { latitude: -12.04, longitude: -77.03 } },
      ref: { referenceValue: "projects/demo-sanicenter/databases/(default)/documents/sample/root" },
      map: {
        mapValue: {
          fields: {
            array: {
              arrayValue: { values: [{ integerValue: "9007199254740993" }, { mapValue: {} }] },
            },
          },
        },
      },
      empty: { arrayValue: {} },
    };
    async function create(collection: string, id: string, data: unknown) {
      const r = await fetch(`${client.base}/${collection}?documentId=${id}`, {
        method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: data }),
      });
      expect(r.status).toBe(200);
    }
    await create("sample", "root", fields);
    await create("sample/root/children", "child", { nested: { booleanValue: true } });
    await create("orphans/missing/children", "leaf", { preserved: { integerValue: "7" } });
    const backup = await consistentLogicalBackup(client);
    expect(backup.records.find((d) => d.path === "orphans/missing")?.exists).toBe(false);
    const password = "solo-pruebas-locales-frase-larga";
    const encrypted = encryptBackup(backup, password);
    expect(encrypted).not.toContain("Inventario");
    expect(decryptBackup(encrypted, password)).toEqual(backup);
    expect(() => decryptBackup(encrypted, "incorrecta")).toThrow();
    const tampered = JSON.parse(encrypted);
    tampered.tag = Buffer.alloc(16).toString("base64");
    expect(() => decryptBackup(JSON.stringify(tampered), password)).toThrow();
    await expect(restoreOnlyToEmulator(backup, local)).rejects.toThrow("vacío");
    await expect(restoreOnlyToEmulator(backup, { GCLOUD_PROJECT: "sanicenterdb" })).rejects.toThrow(
      "solo",
    );
    // Represent a real-project backup without ever querying that project.
    const realShaped = JSON.parse(
      JSON.stringify(backup).replaceAll("demo-sanicenter", "sanicenterdb"),
    );
    await environment.clearFirestore();
    const restored = await restoreOnlyToEmulator(
      decryptBackup(encryptBackup(realShaped, password), password),
      local,
    );
    expect(restored).toEqual({ restored: 3, missingParents: 1, verified: true });
    const after = await collectLogicalBackup(client);
    expect(after.records.find((d) => d.path === "sample/root")?.fields).toEqual(
      backup.records.find((d) => d.path === "sample/root")?.fields,
    );
    expect(after.records.find((d) => d.path === "sample/root")?.createTime).toBeDefined();
    await expect(collectLogicalBackup(client, 1)).rejects.toThrow("sin truncar");
  });
  it("restricts backup destinations and rejects external references before any restore writes", async () => {
    expect(
      () => new FirestoreReadClient("sanicenterdb", "http://127.0.0.1:8095", async () => "owner"),
    ).toThrow();
    await expect(client.read("/sample", { fields: {} })).rejects.toThrow("lectura");
    const backup = await collectLogicalBackup(client);
    const doc = backup.records.find((d) => d.exists)!;
    doc.fields["external"] = {
      referenceValue: "projects/other/databases/(default)/documents/secret/x",
    };
    await expect(restoreOnlyToEmulator(backup, local)).rejects.toThrow("Referencia externa");
  });
});
