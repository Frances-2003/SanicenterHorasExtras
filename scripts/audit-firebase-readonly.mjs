// Explicitly scoped production audit. No SDK writes, deployment helpers or raw credential logging.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
const require = createRequire(import.meta.url);
require("../node_modules/firebase-tools/lib/logger.js").logger.silent = true;
const auth = require("../node_modules/firebase-tools/lib/auth.js");
const project = "sanicenterdb";
const account = auth.getGlobalDefaultAccount();
if (!account) throw new Error("Falta autenticar Firebase CLI.");
const { access_token: token } = await auth.getAccessToken(account.tokens.refresh_token, [
  "https://www.googleapis.com/auth/cloud-platform",
]);
const prefix = `projects/${project}`;
const base = `https://firestore.googleapis.com/v1/${prefix}/databases/(default)`;
const hash = (s) => createHash("sha256").update(s).digest("hex");
const report = {
  project,
  at: new Date().toISOString(),
  scope: "read-only",
  errors: [],
  requests: 0,
};
const hosts = new Set([
  "firebase.googleapis.com",
  "firebaserules.googleapis.com",
  "firestore.googleapis.com",
  "identitytoolkit.googleapis.com",
]);
async function read(url, body) {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    !hosts.has(parsed.hostname) ||
    !parsed.pathname.includes(`/${prefix}`)
  )
    throw new Error("Blocked: audit target outside sanicenterdb.");
  if (
    body &&
    ![":listCollectionIds", ":runAggregationQuery", "/accounts:lookup"].some((suffix) =>
      parsed.pathname.endsWith(suffix),
    )
  )
    throw new Error("Blocked: POST is not an approved read operation.");
  report.requests++;
  const response = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) {
    report.errors.push({
      host: parsed.hostname,
      path: parsed.pathname,
      status: response.status,
      reason: data.error?.status || "UNKNOWN",
      details: (data.error?.details || []).map((d) => ({
        reason: d.reason,
        permission: /^[\w.]+$/.test(d.metadata?.permission || "")
          ? d.metadata.permission
          : undefined,
      })),
    });
    return null;
  }
  return data;
}
const projectData = await read(`https://firebase.googleapis.com/v1beta1/${prefix}`);
if (!projectData || projectData.projectId !== project) {
  console.log(JSON.stringify({ projectVerified: false, errors: report.errors }, null, 2));
  process.exit(2);
}
report.projectMetadata = {
  projectId: projectData.projectId,
  displayName: projectData.displayName,
  state: projectData.state,
};
console.log(
  "Proyecto verificado: sanicenterdb. Consultando politicas y metadatos en modo lectura.",
);
const database = await read(base);
report.database = database
  ? {
      name: database.name,
      locationId: database.locationId,
      type: database.type,
      databaseEdition: database.databaseEdition,
      concurrencyMode: database.concurrencyMode,
      deleteProtectionState: database.deleteProtectionState,
    }
  : null;
const releases = [];
let pageToken;
do {
  const data = await read(
    `https://firebaserules.googleapis.com/v1/${prefix}/releases?pageSize=10${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
  );
  if (!data) break;
  releases.push(...(data.releases || []));
  pageToken = data.nextPageToken;
} while (pageToken && releases.length < 100);
report.releases = releases.map((r) => ({
  name: r.name,
  rulesetName: r.rulesetName,
  updateTime: r.updateTime,
}));
const release =
  releases.find((r) => r.name === `${prefix}/releases/cloud.firestore`) ||
  releases.find((r) => r.name === `${prefix}/releases/cloud.firestore/(default)`);
if (release) {
  const rules = await read(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const local = readFileSync("firestore.rules", "utf8");
  const literals = new Set([
    "2",
    "users",
    "overtime",
    "compensations",
    "calendar",
    "audit",
    "counters",
    "workflowLocks",
    "authorizedAreas",
    "active",
    "role",
    "area",
    "workerId",
    "lastNumber",
    "status",
    "code",
    "date",
    "start",
    "end",
    "minutes",
    "reason",
    "createdAt",
    "username",
    "name",
    "trabajador",
    "jefe",
    "admin",
    "pendiente",
    "activo",
    "aprobada",
    "rechazada",
    "anulado",
    "anulada",
    "cancelacion_pendiente",
    "efectuada",
    "",
  ]);
  // Unknown string literals are omitted: rules can contain identifiers or embedded secrets.
  const sanitizeRules = (s) =>
    s
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (literal) =>
        literals.has(literal.slice(1, -1)) ? literal : '"[LITERAL OMITIDO]"',
      )
      .replace(/\/\*[\s\S]*?\*\//g, "/* comentario omitido */")
      .replace(/\/\/[^\r\n]*/g, "// comentario omitido");
  report.rules = rules
    ? {
        rulesetName: release.rulesetName,
        files: (rules.source?.files || []).map((f) => ({
          name: f.name,
          sha256: hash(f.content),
          identicalToLocal: f.content.replace(/\s/g, "") === local.replace(/\s/g, ""),
          sanitizedSource: sanitizeRules(f.content),
        })),
        localSha256: hash(local),
      }
    : null;
}
const indexes = await read(`${base}/collectionGroups/-/indexes`);
report.indexes = indexes
  ? {
      items: (indexes.indexes || []).map((i) => ({
        name: i.name,
        state: i.state,
        queryScope: i.queryScope,
        fields: i.fields,
      })),
      more: Boolean(indexes.nextPageToken),
    }
  : null;
const fields = await read(
  `${base}/collectionGroups/-/fields?filter=${encodeURIComponent("indexConfig.usesAncestorConfig=false OR ttlConfig:*")}`,
);
report.indexOverrides = fields
  ? {
      items: (fields.fields || []).map((f) => ({
        name: f.name,
        indexConfig: f.indexConfig,
        ttlConfig: f.ttlConfig,
      })),
      more: Boolean(fields.nextPageToken),
    }
  : null;
const config = await read(
  `https://identitytoolkit.googleapis.com/admin/v2/${prefix}/config?fields=${encodeURIComponent("signIn(email,anonymous,allowDuplicateEmails),authorizedDomains,mfa(state)")}`,
);
report.authentication = config
  ? {
      emailEnabled: config.signIn?.email?.enabled,
      passwordRequired: config.signIn?.email?.passwordRequired,
      anonymousEnabled: config.signIn?.anonymous?.enabled,
      authorizedDomains: config.authorizedDomains,
      mfaState: config.mfa?.state,
      allowDuplicateEmails: config.signIn?.allowDuplicateEmails,
    }
  : null;
const target = await read(`https://identitytoolkit.googleapis.com/v1/${prefix}/accounts:lookup`, {
  email: ["jbernales@auth.sanicenter.invalid"],
});
const targetUser = target?.users?.[0];
report.targetUser = {
  username: "JBERNALES",
  found: Boolean(targetUser),
  authQuerySucceeded: target !== null,
  ...(targetUser
    ? {
        uidReference: hash(targetUser.localId).slice(0, 12),
        disabled: targetUser.disabled === true,
        providers: targetUser.providerUserInfo?.map((p) => p.providerId),
        technicalEmailMatches:
          targetUser.email?.toLowerCase() === "jbernales@auth.sanicenter.invalid",
      }
    : {}),
};
function value(v) {
  if (!v) return undefined;
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.booleanValue !== undefined) return v.booleanValue;
  if (v.integerValue !== undefined) return Number(v.integerValue);
  if (v.doubleValue !== undefined) return v.doubleValue;
  if (v.timestampValue !== undefined) return { type: "timestamp" };
  if (v.arrayValue) return (v.arrayValue.values || []).map(value);
  if (v.mapValue)
    return Object.fromEntries(
      Object.entries(v.mapValue.fields || {}).map(([k, v]) => [k, value(v)]),
    );
  return null;
}
const plain = (d) =>
  Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, value(v)]));
const authUsers = [];
let authPage;
do {
  const users = await read(
    `https://identitytoolkit.googleapis.com/v1/${prefix}/accounts:batchGet?maxResults=1000&fields=${encodeURIComponent("users(localId,disabled,email,providerUserInfo(providerId)),nextPageToken")}${authPage ? `&nextPageToken=${encodeURIComponent(authPage)}` : ""}`,
  );
  if (!users) break;
  authUsers.push(...(users.users || []));
  authPage = users.nextPageToken;
} while (authPage && authUsers.length < 5000);
report.authInventory = {
  countInspected: authUsers.length,
  truncated: Boolean(authPage),
  users: authUsers.map((u) => ({
    reference: hash(u.localId).slice(0, 12),
    disabled: u.disabled === true,
    providers: u.providerUserInfo?.map((p) => p.providerId),
    isTarget: u.localId === targetUser?.localId,
  })),
};
if (targetUser) {
  const profile = await read(`${base}/documents/users/${encodeURIComponent(targetUser.localId)}`);
  const p = profile ? plain(profile) : null;
  report.targetUser.profile = p
    ? {
        exists: true,
        usernameMatches: p.username === "JBERNALES",
        role: p.role,
        area: p.area,
        active: p.active === true,
        activeType: typeof p.active,
        namePresent: typeof p.name === "string" && p.name.length > 0,
        authorizedAreas: p.authorizedAreas,
      }
    : { exists: false, querySucceeded: profile !== null };
}
const root = await read(`${base}/documents:listCollectionIds`, { pageSize: 100 });
report.structure = {
  rootCollections: root?.collectionIds || [],
  moreCollections: Boolean(root?.nextPageToken),
  collectionDetails: [],
};
const allowedFields = [
  "workerId",
  "status",
  "code",
  "date",
  "start",
  "end",
  "minutes",
  "allocations",
  "area",
  "role",
  "active",
  "username",
  "authorizedAreas",
  "createdAt",
  "lastNumber",
];
const docsByCollection = new Map();
for (const collection of [
  ...new Set([
    ...report.structure.rootCollections,
    "users",
    "overtime",
    "compensations",
    "counters",
    "calendar",
    "audit",
    "workflowLocks",
  ]),
]) {
  const count = await read(`${base}/documents:runAggregationQuery`, {
    structuredAggregationQuery: {
      aggregations: [{ alias: "total", count: {} }],
      structuredQuery: { from: [{ collectionId: collection }] },
    },
  });
  const total = count?.find((x) => x.result?.aggregateFields)?.result.aggregateFields.total
    ?.integerValue;
  const detail = { collection, totalDocuments: total !== undefined ? Number(total) : null };
  if (
    [
      "users",
      "overtime",
      "compensations",
      "counters",
      "calendar",
      "audit",
      "workflowLocks",
    ].includes(collection)
  ) {
    const mask = allowedFields.map((f) => `mask.fieldPaths=${encodeURIComponent(f)}`).join("&");
    const data = await read(
      `${base}/documents/${encodeURIComponent(collection)}?pageSize=100&showMissing=true&${mask}`,
    );
    const docs = (data?.documents || []).map((d) => ({
      id: d.name.split("/").pop(),
      fields: plain(d),
      fieldTypes: Object.fromEntries(
        Object.entries(d.fields || {}).map(([k, v]) => [k, Object.keys(v)[0]]),
      ),
    }));
    docsByCollection.set(collection, docs);
    detail.inspected = docs.length;
    detail.truncated = Boolean(data?.nextPageToken);
    detail.statuses = {};
    detail.fieldTypes = {};
    for (const d of docs) {
      const status = d.fields.status || "(sin estado)";
      detail.statuses[status] = (detail.statuses[status] || 0) + 1;
      for (const [key, type] of Object.entries(d.fieldTypes))
        detail.fieldTypes[key] = [...new Set([...(detail.fieldTypes[key] || []), type])];
    }
    detail.missingArea = docs.filter((d) => !d.fields.area).length;
    if (collection === "users")
      detail.profiles = docs.map((d) => ({
        reference: hash(d.id).slice(0, 12),
        role: d.fields.role,
        area: d.fields.area,
        active: d.fields.active,
        usernamePresent: typeof d.fields.username === "string",
        isTarget: d.id === targetUser?.localId,
        authorizedAreas: d.fields.authorizedAreas,
      }));
    if (["overtime", "compensations"].includes(collection))
      detail.records = docs.map((d) => ({
        reference: hash(d.id).slice(0, 12),
        workerReference:
          typeof d.fields.workerId === "string" ? hash(d.fields.workerId).slice(0, 12) : null,
        code: d.fields.code,
        status: d.fields.status,
        date: d.fields.date,
        start: d.fields.start,
        end: d.fields.end,
        minutes: d.fields.minutes,
        area: d.fields.area,
        allocations: Array.isArray(d.fields.allocations)
          ? d.fields.allocations.map((a) => ({
              sourceReference:
                typeof a.overtimeId === "string" ? hash(a.overtimeId).slice(0, 12) : null,
              minutes: a.minutes,
            }))
          : null,
      }));
    if (collection === "counters")
      detail.counters = docs.map((d) => ({
        id: d.id,
        lastNumber: d.fields.lastNumber,
        integer: Number.isSafeInteger(d.fields.lastNumber),
        nonnegative: d.fields.lastNumber >= 0,
      }));
    // Discover nested structure without reading nested document contents. Bound this first pass.
    detail.subcollections = [];
    for (const d of docs.slice(0, 10)) {
      const nested = await read(
        `${base}/documents/${encodeURIComponent(collection)}/${encodeURIComponent(d.id)}:listCollectionIds`,
        { pageSize: 100 },
      );
      if (nested?.collectionIds?.length)
        detail.subcollections.push({
          parentReference: hash(d.id).slice(0, 12),
          collections: nested.collectionIds,
          more: Boolean(nested.nextPageToken),
        });
    }
    detail.nestedParentsInspected = Math.min(10, docs.length);
  }
  report.structure.collectionDetails.push(detail);
}
const profiles = docsByCollection.get("users") || [];
report.authInventory.missingProfileReferences = authUsers
  .filter((u) => !profiles.some((p) => p.id === u.localId))
  .map((u) => hash(u.localId).slice(0, 12));
report.authInventory.profileWithoutAuthReferences = profiles
  .filter((p) => !authUsers.some((u) => u.localId === p.id))
  .map((p) => hash(p.id).slice(0, 12));
report.limits = {
  maxRootCollections: 100,
  maxDocumentsPerKnownCollection: 100,
  maxNestedParentsPerKnownCollection: 10,
  notABackup: true,
  unknownCollectionsContentsRead: false,
  passwordsTokensPrivateKeysExported: false,
};
const output = "AUDITORIA_SANICENTERDB_2026-11-10.local.json";
// The report contains whitelisted metadata only; raw API responses and credentials stay in memory.
writeFileSync(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
console.log(`Informe de metadatos saneados: ${output}`);
