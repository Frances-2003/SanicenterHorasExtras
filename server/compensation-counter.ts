import type { Firestore } from "firebase-admin/firestore";
export async function prepareCompensationCounter(db: Firestore, apply = false) {
  return db.runTransaction(async (tx) => {
    const ref = db.doc("counters/compensations");
    const existing = await tx.get(ref);
    if (existing.exists) {
      const value = existing.get("lastNumber");
      if (!Number.isSafeInteger(value) || value < 0)
        throw new Error("Contador existente inválido: requiere revisión, no se reemplaza.");
      return { action: "none", lastNumber: value, applied: false };
    }
    const records = await tx.get(db.collection("compensations"));
    let max = 0;
    for (const d of records.docs) {
      const match = /^CP-(\d+)$/.exec(d.get("code") || "");
      if (!match || !Number.isSafeInteger(Number(match[1])))
        throw new Error("Código existente inválido: detener y revisar.");
      max = Math.max(max, Number(match[1]));
    }
    if (apply) tx.create(ref, { lastNumber: max });
    return { action: "create-if-absent", lastNumber: max, applied: apply };
  });
}
