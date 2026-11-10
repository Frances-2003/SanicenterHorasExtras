import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  danger,
  requireReason,
  onClose,
  onConfirm,
  busy = false,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  requireReason?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          setReason("");
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <textarea
          className="field min-h-20"
          placeholder={
            requireReason ? "Motivo u observación (obligatorio)" : "Observación (opcional)"
          }
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <DialogFooter>
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            disabled={busy || (requireReason && !reason.trim())}
            onClick={async () => {
              await onConfirm(reason);
            }}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
