/** Shared value formatting, matching the classic frontend's helpers. */

export function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function minutesLabel(n?: number | null): string {
  if (n == null) return "—";
  if (n < 60) return `${n} min`;
  return `${Math.floor(n / 60)}h ${n % 60}m`;
}

export function percentLabel(n?: number | null): string {
  return n == null ? "—" : `${n}%`;
}
