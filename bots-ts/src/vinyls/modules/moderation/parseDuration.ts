/** Parse durata stile `10m`, `2h`, `1d` → ms. Default 10m. Max 28d (Discord timeout). */
export function parseDurationMs(raw: string | undefined, fallbackMs = 10 * 60_000): number {
  const s = String(raw || "").trim().toLowerCase();
  if (!s) return fallbackMs;
  const m = s.match(/^(\d+)\s*(s|m|h|d)?$/);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return fallbackMs;
  const unit = m[2] || "m";
  const mult = unit === "s" ? 1000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  const ms = n * mult;
  const max = 28 * 86_400_000;
  return Math.min(max, Math.max(5_000, ms));
}

export function formatDurationMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
