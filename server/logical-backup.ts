import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from "node:crypto";

export type RawDocument = {
  path: string;
  exists: boolean;
  fields: Record<string, unknown>;
  createTime?: string;
  updateTime?: string;
};
export interface LogicalBackup {
  version: 1;
  projectId: string;
  databaseId: "(default)";
  capturedAt: string;
  records: RawDocument[];
  collectionPaths: string[];
}
type WireValue = {
  referenceValue?: string;
  mapValue?: { fields?: Record<string, unknown> };
  arrayValue?: { values?: unknown[] };
  [key: string]: unknown;
};
function normalizeWire(value: unknown): unknown {
  const v = value as WireValue;
  if (v?.mapValue)
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, normalizeWire(x)]),
        ),
      },
    };
  if (v?.arrayValue)
    return { arrayValue: { values: (v.arrayValue.values || []).map(normalizeWire) } };
  return value;
}
export const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(
          Object.keys(item)
            .sort()
            .map((key) => [key, item[key]]),
        )
      : item,
  );
const digest = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
const segmentPath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

export class FirestoreReadClient {
  readonly base: string;
  constructor(
    readonly projectId: string,
    readonly origin: string,
    private token: () => Promise<string>,
  ) {
    if (!(
      (projectId === "sanicenterdb" && origin === "https://firestore.googleapis.com") ||
      (projectId === "demo-sanicenter" && origin === "http://127.0.0.1:8095")
    ))
      throw new Error("Destino de respaldo no autorizado.");
    this.base = `${origin}/v1/projects/${projectId}/databases/(default)/documents`;
  }
  async read(path: string, body?: Record<string, unknown>) {
    if (!(
      path === ":listCollectionIds" ||
      path.endsWith(":listCollectionIds") ||
      path.startsWith("/")
    ))
      throw new Error("Consulta de respaldo inválida.");
    if (body && !path.endsWith(":listCollectionIds"))
      throw new Error("El respaldo solo admite operaciones de lectura.");
    const response = await fetch(`${this.base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${await this.token()}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `Consulta de respaldo fallida (HTTP ${response.status}); no se generó una copia completa.`,
      );
    return response.json();
  }
}
export async function collectLogicalBackup(
  client: FirestoreReadClient,
  maxDocuments = 5000,
): Promise<LogicalBackup> {
  const records: RawDocument[] = [],
    collectionPaths: string[] = [];
  async function visit(parent: string, depth: number) {
    if (depth > 100) throw new Error("Profundidad de respaldo excedida.");
    let pageToken: string | undefined;
    do {
      const collections = await client.read(
        `${parent ? `/${segmentPath(parent)}` : ""}:listCollectionIds`,
        { pageSize: 100, ...(pageToken ? { pageToken } : {}) },
      );
      for (const id of collections.collectionIds || []) {
        const collection = parent ? `${parent}/${id}` : id;
        collectionPaths.push(collection);
        let documentPage: string | undefined;
        do {
          const page = await client.read(
            `/${segmentPath(collection)}?pageSize=100&showMissing=true${documentPage ? `&pageToken=${encodeURIComponent(documentPage)}` : ""}`,
          );
          for (const doc of page.documents || []) {
            const prefix = `projects/${client.projectId}/databases/(default)/documents/`;
            if (!doc.name.startsWith(prefix))
              throw new Error("Documento fuera del proyecto de respaldo.");
            const path = doc.name.slice(prefix.length);
            if (records.length >= maxDocuments)
              throw new Error("Límite de documentos excedido; respaldo cancelado sin truncar.");
            records.push({
              path,
              exists: Boolean(doc.createTime),
              fields: Object.fromEntries(
                Object.entries(doc.fields || {}).map(([k, v]) => [k, normalizeWire(v)]),
              ),
              ...(doc.createTime ? { createTime: doc.createTime } : {}),
              ...(doc.updateTime ? { updateTime: doc.updateTime } : {}),
            });
            await visit(path, depth + 1);
          }
          documentPage = page.nextPageToken;
        } while (documentPage);
      }
      pageToken = collections.nextPageToken;
    } while (pageToken);
  }
  await visit("", 0);
  return {
    version: 1,
    projectId: client.projectId,
    databaseId: "(default)",
    capturedAt: new Date().toISOString(),
    records: records.sort((a, b) => a.path.localeCompare(b.path)),
    collectionPaths: collectionPaths.sort(),
  };
}
export async function consistentLogicalBackup(client: FirestoreReadClient, maxDocuments = 5000) {
  const first = await collectLogicalBackup(client, maxDocuments),
    second = await collectLogicalBackup(client, maxDocuments);
  if (
    digest({ records: first.records, collections: first.collectionPaths }) !==
    digest({ records: second.records, collections: second.collectionPaths })
  )
    throw new Error(
      "Los datos cambiaron durante el respaldo. Mantén los escritores pausados y repite.",
    );
  return second;
}
export function encryptBackup(backup: LogicalBackup, passphrase: string): string {
  if (passphrase.length < 20)
    throw new Error("La frase del respaldo debe tener al menos 20 caracteres.");
  const salt = randomBytes(16),
    iv = randomBytes(12);
  const key = scryptSync(passphrase, salt, 32, { N: 32768, maxmem: 128 * 1024 * 1024 });
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("sanicenter-backup-v1"));
  const encrypted = Buffer.concat([cipher.update(canonical(backup), "utf8"), cipher.final()]);
  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm+scrypt",
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: encrypted.toString("base64"),
  });
}
export function decryptBackup(text: string, passphrase: string): LogicalBackup {
  if (Buffer.byteLength(text) > 64 * 1024 * 1024)
    throw new Error("Archivo de respaldo demasiado grande.");
  const envelope = JSON.parse(text);
  if (envelope.version !== 1 || envelope.algorithm !== "aes-256-gcm+scrypt")
    throw new Error("Formato de respaldo no admitido.");
  const salt = Buffer.from(envelope.salt, "base64"),
    iv = Buffer.from(envelope.iv, "base64"),
    tag = Buffer.from(envelope.tag, "base64");
  if (salt.length !== 16 || iv.length !== 12 || tag.length !== 16)
    throw new Error("Respaldo inválido.");
  const key = scryptSync(passphrase, salt, 32, { N: 32768, maxmem: 128 * 1024 * 1024 });
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from("sanicenter-backup-v1"));
  cipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([
      cipher.update(Buffer.from(envelope.ciphertext, "base64")),
      cipher.final(),
    ]).toString("utf8"),
  );
}
function remapValue(value: unknown, source: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Tipo Firestore inválido.");
  const v = value as WireValue;
  if ("referenceValue" in v) {
    const prefix = `projects/${source}/databases/(default)/documents/`;
    if (typeof v["referenceValue"] !== "string" || !v["referenceValue"].startsWith(prefix))
      throw new Error(
        "Referencia externa: recuperación detenida para evitar conexiones fuera del emulador.",
      );
    return {
      referenceValue: `projects/demo-sanicenter/databases/(default)/documents/${v["referenceValue"].slice(prefix.length)}`,
    };
  }
  if (v["mapValue"])
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(v["mapValue"].fields || {}).map(([k, x]) => [k, remapValue(x, source)]),
        ),
      },
    };
  if (v["arrayValue"])
    return {
      arrayValue: {
        values: (v["arrayValue"].values || []).map((x: unknown) => remapValue(x, source)),
      },
    };
  return value;
}
export async function restoreOnlyToEmulator(
  backup: LogicalBackup,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (
    env["FIRESTORE_EMULATOR_HOST"] !== "127.0.0.1:8095" ||
    env["GCLOUD_PROJECT"] !== "demo-sanicenter"
  )
    throw new Error(
      "La restauración solo está permitida en el emulador de seguridad demo-sanicenter:8095.",
    );
  if (
    backup.version !== 1 ||
    backup.databaseId !== "(default)" ||
    !["sanicenterdb", "demo-sanicenter"].includes(backup.projectId) ||
    !Array.isArray(backup.records)
  )
    throw new Error("Manifiesto inválido.");
  const paths = new Set<string>();
  const planned = backup.records.map((record) => {
    const parts = record.path.split("/");
    if (
      parts.length % 2 ||
      parts.some((p) => !p || [".", ".."].includes(p)) ||
      paths.has(record.path)
    )
      throw new Error("Ruta o documento duplicado en el respaldo.");
    paths.add(record.path);
    return {
      ...record,
      fields: Object.fromEntries(
        Object.entries(record.fields).map(([k, v]) => [k, remapValue(v, backup.projectId)]),
      ),
    };
  });
  const client = new FirestoreReadClient(
    "demo-sanicenter",
    "http://127.0.0.1:8095",
    async () => "owner",
  );
  const existing = await client.read(":listCollectionIds", { pageSize: 1 });
  if (existing.collectionIds?.length)
    throw new Error("El emulador destino debe estar vacío; no se sobrescribirá ningún documento.");
  for (const record of planned.filter((d) => d.exists)) {
    const parts = record.path.split("/"),
      id = parts.pop()!;
    const response = await fetch(
      `${client.base}/${segmentPath(parts.join("/"))}?documentId=${encodeURIComponent(id)}`,
      {
        method: "POST",
        headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
        body: JSON.stringify({ fields: record.fields }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Restauración detenida (HTTP ${response.status}); destino parcial, nunca sobrescribir.`,
      );
  }
  const verified = await collectLogicalBackup(client);
  const expected = planned.map((d) => ({ path: d.path, exists: d.exists, fields: d.fields }));
  const actual = verified.records.map((d) => ({
    path: d.path,
    exists: d.exists,
    fields: d.fields,
  }));
  if (
    digest(expected) !== digest(actual) ||
    digest(backup.collectionPaths) !== digest(verified.collectionPaths)
  )
    throw new Error("La verificación de tipos/documentos no coincide.");
  return {
    restored: planned.filter((d) => d.exists).length,
    missingParents: planned.filter((d) => !d.exists).length,
    verified: true,
  };
}
