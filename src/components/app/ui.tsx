import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
import type { CompStatus, OvertimeStatus } from "@/types";

export function Stat({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: "default" | "primary";
}) {
  return (
    <div
      className={`card flex items-center gap-3 p-4 ${tone === "primary" ? "border-primary/30 bg-secondary" : ""}`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <div className="truncate text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-bold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

const STYLES: Record<CompStatus | OvertimeStatus, string> = {
  pendiente: "bg-warning-soft text-warning",
  aprobada: "bg-secondary text-primary",
  activo: "bg-secondary text-primary",
  anulado: "bg-destructive-soft text-destructive",
  rechazada: "bg-destructive-soft text-destructive",
  anulada: "bg-destructive-soft text-destructive",
  cancelacion_pendiente: "bg-warning-soft text-warning",
  efectuada: "bg-secondary text-primary",
};

const LABELS: Record<CompStatus | OvertimeStatus, string> = {
  pendiente: "Pendiente",
  aprobada: "Aprobada",
  activo: "Legado: requiere revisión",
  anulado: "Anulado",
  rechazada: "Rechazada",
  anulada: "Anulada",
  cancelacion_pendiente: "Anulación pendiente",
  efectuada: "Efectuada",
};

export function StatusBadge({ status }: { status: CompStatus | OvertimeStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}

export function Pager({
  page,
  total,
  size = 10,
  onChange,
}: {
  page: number;
  total: number;
  size?: number;
  onChange: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.max(1, Math.min(page, pages));

  // Sync if filter shrunk results below current page
  useEffect(() => {
    if (page > pages) {
      onChange(pages);
    }
  }, [page, pages, onChange]);

  return (
    <div className="flex items-center justify-between border-t border-border px-3 py-2.5 text-xs text-muted-foreground">
      <span>{total} registro(s)</span>
      <div className="flex items-center gap-2">
        <button
          className="btn-ghost px-2 py-1"
          disabled={safePage <= 1}
          onClick={() => onChange(safePage - 1)}
          aria-label="Anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span>
          Página {safePage} de {pages}
        </span>
        <button
          className="btn-ghost px-2 py-1"
          disabled={safePage >= pages}
          onClick={() => onChange(safePage + 1)}
          aria-label="Siguiente"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export const paginate = <T,>(list: T[], page: number, size = 10) => {
  const maxPages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.max(1, Math.min(page, maxPages));
  return list.slice((safePage - 1) * size, safePage * size);
};
