const ROME_TZ = "Europe/Rome";

function voteCountMonthKeyRome(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const ref = Number.isFinite(d.getTime()) ? d : new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: ROME_TZ, year: "numeric", month: "2-digit" });
  const parts = formatter.formatToParts(ref);
  const y = parts.find((p?) => p.type === "year")?.value;
  const m = parts.find((p?) => p.type === "month")?.value;
  if (!y || !m) {
    const fy = ref.getUTCFullYear();
    const fm = ref.getUTCMonth() + 1;
    return `${String(fy).padStart(4, "0")}-${String(fm).padStart(2, "0")}`;
  }
  return `${y}-${m}`;
}

/** Giorno calendario Europe/Rome → YYYY-MM-DD (streak bump). */
function dayKeyRome(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const ref = Number.isFinite(d.getTime()) ? d : new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(ref);
  const y = parts.find((p?) => p.type === "year")?.value;
  const m = parts.find((p?) => p.type === "month")?.value;
  const day = parts.find((p?) => p.type === "day")?.value;
  if (!y || !m || !day) return ref.toISOString().slice(0, 10);
  return `${y}-${m}-${day}`;
}

/** Giorno precedente (YYYY-MM-DD) in calendario Europe/Rome. */
function prevDayKeyRome(dayKey?) {
  const key = String(dayKey || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  /* mezzogiorno UTC sul giorno → -24h resta sullo stesso giorno Roma in pratica */
  const noon = new Date(`${key}T12:00:00.000Z`);
  if (!Number.isFinite(noon.getTime())) return "";
  return dayKeyRome(new Date(noon.getTime() - 24 * 3600_000));
}

export = { voteCountMonthKeyRome, dayKeyRome, prevDayKeyRome };