export function fmtCurrency(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "$0.00";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function fmtInt(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return "0";
  return Math.round(n).toLocaleString("en-US");
}
export function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !isFinite(n)) return "0%";
  return `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
}
export function safeDiv(a: number, b: number): number {
  return b === 0 || !isFinite(b) ? 0 : a / b;
}