/**
 * Duration in whole minutes between HH:mm times.
 * Crosses midnight when end <= start, including a full day for equal times.
 */
export function diffMinutes(start: string, end: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) return 0;
  const partsS = start.split(":");
  const partsE = end.split(":");
  if (partsS.length !== 2 || partsE.length !== 2) return 0;
  const sh = Number(partsS[0]);
  const sm = Number(partsS[1]);
  const eh = Number(partsE[0]);
  const em = Number(partsE[1]);
  if (Number.isNaN(sh) || Number.isNaN(sm) || Number.isNaN(eh) || Number.isNaN(em)) return 0;
  if (sh < 0 || sh > 23 || sm < 0 || sm > 59 || eh < 0 || eh > 23 || em < 0 || em > 59) return 0;

  const startTotal = sh * 60 + sm;
  const endTotal = eh * 60 + em;

  let d = endTotal - startTotal;
  if (d <= 0) {
    // Crosses midnight
    d += 1440;
  }
  return d;
}
export function fmtMin(m: number): string {
  const sign = m < 0 ? "-" : "";
  const a = Math.abs(Math.round(m));
  const h = Math.floor(a / 60),
    mm = a % 60;
  return `${sign}${h}h ${String(mm).padStart(2, "0")}m`;
}
export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
export const monthKey = (iso: string) => iso.slice(0, 7);
export const MONTHS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];
export function fmtMonth(key: string) {
  const [y, m = "1"] = key.split("-");
  return `${MONTHS[+m - 1]} ${y}`;
}
export const code = (prefix: string, n: number) => `${prefix}-${String(n).padStart(6, "0")}`;
