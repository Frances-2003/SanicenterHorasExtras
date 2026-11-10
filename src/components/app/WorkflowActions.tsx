import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ReasonDialog } from "./ReasonDialog";
import {
  confirmRest,
  requestCancellation,
  reviewCancellation,
  reviewCompensation,
  reviewOvertime,
  voidOvertime,
  type Result,
} from "@/services/store";
import type { Compensation, Overtime } from "@/types";
import { canAnnulBeforeStart } from "@/services/workflow";

export function WorkflowActions({
  record,
  manager,
  overtime = false,
}: {
  record: Overtime | Compensation;
  manager: boolean;
  overtime?: boolean;
}) {
  const [chosen, setChosen] = useState<{
    label: string;
    run: (note: string) => Promise<Result>;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const beforeStart = !overtime && canAnnulBeforeStart(record, now);
  const actions: { label: string; run: (note: string) => Promise<Result> }[] = [];
  if (manager && record.status === "pendiente") {
    const review = overtime ? reviewOvertime : reviewCompensation;
    actions.push(
      { label: "Aprobar", run: (note) => review(record.id, true, note) },
      { label: "Rechazar", run: (note) => review(record.id, false, note) },
    );
  }
  if (overtime && manager && record.status === "aprobada")
    actions.push({ label: "Anular", run: (note) => voidOvertime(record.id, note) });
  if (!overtime && !manager && record.status === "aprobada" && beforeStart)
    actions.push({
      label: "Solicitar anulación",
      run: (note) => requestCancellation(record.id, note),
    });
  if (!overtime && manager && record.status === "cancelacion_pendiente")
    actions.push(
      ...(beforeStart
        ? [
            {
              label: "Autorizar anulación",
              run: (note: string) => reviewCancellation(record.id, true, note),
            },
          ]
        : []),
      { label: "Denegar anulación", run: (note) => reviewCancellation(record.id, false, note) },
    );
  if (!overtime && manager && record.status === "aprobada" && beforeStart)
    actions.push({
      label: "Anular compensación",
      run: (note) => reviewCancellation(record.id, true, note, true),
    });
  if (!overtime && manager && record.status === "aprobada")
    actions.push({
      label: "Confirmar descanso realizado",
      run: (note) => confirmRest(record.id, note),
    });
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            className="btn-ghost px-2 py-1 text-xs"
            disabled={busy}
            onClick={() => setChosen(a)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <ReasonDialog
        key={chosen?.label || "closed"}
        open={!!chosen}
        title={`${chosen?.label || ""} ${record.code}`}
        description="La operación quedará registrada con tu usuario, fecha y motivo. El saldo se verificará al guardar."
        confirmLabel={busy ? "Guardando..." : "Confirmar"}
        requireReason
        busy={busy}
        onClose={() => {
          if (!busy) setChosen(null);
        }}
        onConfirm={async (note) => {
          if (!chosen || busy) return;
          setBusy(true);
          try {
            const result = await chosen.run(note);
            if (result.ok) {
              toast.success("Operación registrada.");
              setChosen(null);
            } else toast.error(result.error);
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}
