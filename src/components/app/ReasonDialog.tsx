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
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  requireReason?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
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
            onClick={() => {
              setReason("");
              onClose();
            }}
          >
            Cancelar
          </button>
          <button
            className={danger ? "btn-danger" : "btn-primary"}
            disabled={requireReason && !reason.trim()}
            onClick={() => {
              onConfirm(reason);
              setReason("");
            }}
          >
            {confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
