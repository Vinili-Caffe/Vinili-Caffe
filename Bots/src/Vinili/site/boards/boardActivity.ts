/** Bacheche: attività di un server in vetrina, ora per ora (dai dati che il bot già raccoglie). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { loadHourlyRows } = require("../../Community/services/activityRows") as typeof import("../../Community/services/activityRows");
const { getLastNHourKeys } = require("../../Community/services/activityTime") as typeof import("../../Community/services/activityTime");
const { BL, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { snowflakeOk } = require("./boardSanitize") as typeof import("./boardSanitize");

const ACTIVITY_DAYS = 14;
const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { at: number; value: Record<string, any> }>();

/** Un minuto in vocale pesa come un messaggio. */
function weightOf(row?) {
  return Math.max(0, Number(row?.textCount || 0)) + Math.max(0, Number(row?.voiceSeconds || 0)) / 60;
}

async function getListingActivity(client?, listingId?) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL })
    .select({ boardKind: 1, boardDiscordId: 1, status: 1 })
    .lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  const empty = { ok: true, status: 200, available: false, days: ACTIVITY_DAYS, hours: new Array(24).fill(0) };
  const gid = String(doc.boardDiscordId || "").trim();
  if (String(doc.boardKind || "") === "bot" || !snowflakeOk(gid)) {
    cache.set(id, { at: Date.now(), value: empty });
    return empty;
  }

  let rows: any[] = [];
  try {
    rows = (await loadHourlyRows(gid, getLastNHourKeys(24 * ACTIVITY_DAYS))) || [];
  } catch (err) {
    global.logger?.warn?.("[site-boards] activity:", err?.message || err);
    rows = [];
  }
  const sums = new Array(24).fill(0);
  const activeDays = new Set<string>();
  for (const r of rows) {
    const hk = String(r?.hourKey || "");
    const m = hk.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})$/);
    if (!m) continue;
    const w = weightOf(r);
    if (w <= 0) continue;
    sums[Number(m[2])] += w;
    activeDays.add(m[1]);
  }
  const total = sums.reduce((a, b) => a + b, 0);
  /* media giornaliera per fascia oraria, sui giorni in cui c'erano dati */
  const div = Math.max(1, activeDays.size);
  const hours = sums.map((v) => Math.round((v / div) * 10) / 10);
  const peak = total > 0 ? hours.indexOf(Math.max(...hours)) : null;
  const value = {
    ok: true,
    status: 200,
    available: total > 0 && activeDays.size >= 2,
    days: ACTIVITY_DAYS,
    activeDays: activeDays.size,
    hours,
    peakHour: peak,
    perDay: Math.round(total / div),
  };
  cache.set(id, { at: Date.now(), value });
  if (cache.size > 500) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return value;
}

export = { getListingActivity };
