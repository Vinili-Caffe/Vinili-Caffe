/** "3 min fa", "2 h fa", poi la data. */
export const timeAgo = (iso: string, now = Date.now()) => {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "adesso";
  if (s < 3600) return `${Math.floor(s / 60)} min fa`;
  if (s < 86400) return `${Math.floor(s / 3600)} h fa`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} g fa`;
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
};

/** Stesso formato di timeAgo, partendo da un timestamp ms. */
export function timeAgoMs(atMs: number, now = Date.now()) {
  if (!Number.isFinite(atMs) || atMs <= 0) return "";
  return timeAgo(new Date(atMs).toISOString(), now);
}
