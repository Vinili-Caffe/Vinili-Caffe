const ROME_TZ = "Europe/Rome";

function voteCountMonthKeyRome(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const ref = Number.isFinite(d.getTime()) ? d : new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: ROME_TZ, year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(ref);
  const y = parts.find((p) => p.type === "year")?.value;
  const m = parts.find((p) => p.type === "month")?.value;
  if (!y || !m) {
    const fy = ref.getUTCFullYear();
    const fm = ref.getUTCMonth() + 1;
    return `${String(fy).padStart(4, "0")}-${String(fm).padStart(2, "0")}`;
  }
  return `${y}-${m}`;
}

function isFirstCalendarDayRome(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const ref = Number.isFinite(d.getTime()) ? d : new Date();
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: ROME_TZ, day: "numeric" }).format(ref);
  return day === "1";
}

function romeMonthStartMs(now = new Date()) {
  const end = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const k = voteCountMonthKeyRome(new Date(end));
  let lo = end - 50 * 86400000;
  if (lo < 0) lo = 0;
  let hi = end;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (voteCountMonthKeyRome(new Date(mid)) === k) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

module.exports = { voteCountMonthKeyRome, romeMonthStartMs, isFirstCalendarDayRome };