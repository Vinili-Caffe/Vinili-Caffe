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

export = { voteCountMonthKeyRome };