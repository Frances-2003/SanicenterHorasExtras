import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { createHash } from "node:crypto";
import { commandSchema, transition, WorkflowError, type Command } from "../src/services/workflow";
import type { Compensation, Overtime, User } from "../src/types";
import { canManageArea } from "../src/services/auth";
import { PolicyError } from "./runtime";

/** All database mutations are centralized here, behind store.ts's authenticated API. */
export async function execute(
  uid: string,
  requestId: string,
  raw: unknown,
  options?: { authorizeWorker: (workerId: string) => void; enforceRateLimit: boolean },
) {
  if (!process.env["FIRESTORE_EMULATOR_HOST"] && !options)
    throw new PolicyError("La ejecución real requiere el control de acceso del endpoint.");
  const parsed = commandSchema.safeParse(raw);
  if (!parsed.success)
    throw new WorkflowError("Solicitud inválida: revisa horarios, motivo y minutos enteros.");
  const command = parsed.data as Command;
  const db = getFirestore();
  const creates = command.action === "addOvertime" || command.action === "requestCompensation";
  const overtime =
    command.action === "addOvertime" ||
    command.action === "reviewOvertime" ||
    command.action === "voidOvertime";
  const collection = overtime ? "overtime" : "compensations";
  const recordRef = db
    .collection(collection)
    .doc(creates ? requestId : (command as { id: string }).id);
  const auditRef = db.collection("audit").doc(requestId);
  const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
  return db.runTransaction(
    async (tx) => {
      const actorSnap = await tx.get(db.doc(`users/${uid}`));
      const actor = { ...actorSnap.data(), id: uid } as User;
      if (!actorSnap.exists || actor.active !== true)
        throw new WorkflowError("Perfil inactivo o inexistente.");
      const replay = await tx.get(auditRef);
      if (replay.exists) {
        options?.authorizeWorker(replay.get("workerId"));
        if (replay.get("actorId") !== uid || replay.get("fingerprint") !== fingerprint)
          throw new WorkflowError("Identificador de operación ya utilizado.");
        return { ok: true, id: replay.get("recordId") };
      }
      const recordSnap = await tx.get(recordRef);
      if (creates && recordSnap.exists) throw new WorkflowError("Registro ya existente.");
      if (!creates && !recordSnap.exists) throw new WorkflowError("Registro no encontrado.");
      const workerId = creates ? uid : recordSnap.get("workerId");
      if (typeof workerId !== "string" || !/^[\w-]{1,128}$/.test(workerId))
        throw new WorkflowError("Trabajador inválido.");
      options?.authorizeWorker(workerId);
      const workerSnap = await tx.get(db.doc(`users/${workerId}`));
      const worker = { ...workerSnap.data(), id: workerId } as User;
      if (!workerSnap.exists || worker.active !== true || worker.role !== "trabajador")
        throw new WorkflowError("Trabajador inactivo o inexistente.");
      const own = uid === workerId && actor.role === "trabajador";
      const manager = uid !== workerId && canManageArea(actor, worker.area);
      if (!own && !manager) throw new WorkflowError("No tienes acceso a este trabajador.");
      if (manager && recordSnap.exists && !canManageArea(actor, recordSnap.get("area")))
        throw new WorkflowError("No tienes acceso al área original de esta solicitud.");
      const calendarRef = db.doc(`calendar/${recordRef.id}`);
      const calendarSnapshot = !overtime ? await tx.get(calendarRef) : null;
      if (calendarSnapshot?.exists) {
        const publicKeys = new Set([
          "active",
          "workerId",
          "workerName",
          "area",
          "code",
          "date",
          "start",
          "end",
          "minutes",
          "status",
          "archivedAt",
        ]);
        if (
          calendarSnapshot.get("workerId") !== workerId ||
          Object.keys(calendarSnapshot.data()!).some((key) => !publicKeys.has(key))
        )
          throw new WorkflowError(
            "Proyección de calendario incompatible: requiere revisión sin sobrescribir datos.",
          );
      }
      const rateRef = db.doc(`workflowLimits/${uid}`);
      const rateSnapshot = options?.enforceRateLimit ? await tx.get(rateRef) : null;
      const minuteBucket = Math.floor(Date.now() / 60000);
      const calls =
        rateSnapshot?.get("bucket") === minuteBucket ? Number(rateSnapshot.get("calls")) || 0 : 0;
      if (calls >= 30) throw new PolicyError("Límite de operaciones por minuto alcanzado.", 429);
      // Every operation reads AND writes this lock: serializes phantom inserts as well as balance changes.
      const lockRef = db.doc(`workflowLocks/${workerId}`);
      await tx.get(lockRef);
      const otsSnap = await tx.get(db.collection("overtime").where("workerId", "==", workerId));
      const compsSnap = await tx.get(
        db.collection("compensations").where("workerId", "==", workerId),
      );
      const ots = otsSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as Overtime[];
      const comps = compsSnap.docs.map((d) => ({ ...d.data(), id: d.id })) as Compensation[];
      let next = 0;
      const counterRef = db.doc(
        `counters/${collection === "overtime" ? "overtime" : "compensations"}`,
      );
      if (creates) {
        const counter = await tx.get(counterRef);
        const last = counter.get("lastNumber");
        if (
          !counter.exists ||
          !Number.isSafeInteger(last) ||
          last < 0 ||
          last >= Number.MAX_SAFE_INTEGER
        )
          throw new WorkflowError(
            "Contador ausente o inválido. Solicita su revisión; no se reiniciará automáticamente.",
          );
        next = last + 1;
        const collisions = await tx.get(
          db
            .collection(collection)
            .where("code", "==", `${overtime ? "HE" : "CP"}-${String(next).padStart(6, "0")}`)
            .limit(1),
        );
        if (!collisions.empty)
          throw new WorkflowError(
            "El contador está atrasado. Requiere revisión manual sin reiniciarlo.",
          );
      }
      const now = new Date().toISOString();
      const result = transition(command, actor, worker, ots, comps, recordRef.id, next, now);
      const { id: ignored, ...data } = result;
      // Commands are never persisted as record fields.
      delete (data as Record<string, unknown>)["action"];
      if (creates) tx.create(recordRef, { ...data, area: worker.area });
      else {
        const allowed = [
          "status",
          "reviewedAt",
          "reviewedBy",
          "reviewNote",
          "voidedAt",
          "voidedBy",
          "voidReason",
          "cancellationRequestedAt",
          "cancellationReviewedAt",
          "cancellationReviewedBy",
          "cancellationNote",
          "cancellationReviewNote",
          "confirmedAt",
          "confirmedBy",
          "confirmationNote",
        ];
        const patch = Object.fromEntries(
          allowed
            .filter(
              (key) =>
                (data as Record<string, unknown>)[key] !== undefined &&
                (data as Record<string, unknown>)[key] !== recordSnap.get(key),
            )
            .map((key) => [key, (data as Record<string, unknown>)[key]]),
        );
        tx.update(recordRef, patch);
      }
      if (rateSnapshot) tx.set(rateRef, { bucket: minuteBucket, calls: calls + 1 });
      tx.set(lockRef, { updatedAt: FieldValue.serverTimestamp() });
      if (creates) tx.update(counterRef, { lastNumber: next });
      tx.create(auditRef, {
        actorId: uid,
        actorRole: actor.role,
        workerId,
        area: worker.area,
        action: command.action,
        directCancellation: command.action === "reviewCancellation" && command.direct === true,
        recordId: recordRef.id,
        collection,
        fingerprint,
        beforeStatus: recordSnap.exists ? recordSnap.get("status") : null,
        afterStatus: result.status,
        note: "note" in command ? command.note : command.reason,
        at: FieldValue.serverTimestamp(),
      });
      if (!overtime) {
        if (["aprobada", "cancelacion_pendiente", "efectuada"].includes(result.status)) {
          tx.set(
            calendarRef,
            {
              active: true,
              workerId,
              workerName: worker.name,
              area: worker.area,
              code: result.code,
              date: result.date,
              start: result.start,
              end: result.end,
              minutes: result.minutes,
              status: result.status,
            },
            { merge: true },
          );
        } else if (calendarSnapshot?.exists)
          tx.update(calendarRef, {
            active: false,
            status: result.status,
            archivedAt: FieldValue.serverTimestamp(),
          });
      }
      return { ok: true, id: recordRef.id };
    },
    { maxAttempts: 3 },
  );
}
