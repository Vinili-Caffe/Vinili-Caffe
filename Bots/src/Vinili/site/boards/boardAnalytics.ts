/**
 * Bacheche: statistiche delle schede (visite, interazioni, voti, fonti, dispositivo, paese).
 * Solo conteggi giornalieri per scheda: niente IP, niente utenti salvati.
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { getDayKey } = require("../../Community/services/activityTime") as typeof import("../../Community/services/activityTime");
const { BL, featureGate, hashIp } = require("./boardReviews") as typeof import("./boardReviews");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");

const { Schema, models, model } = mongoose;

const statsDaySchema = new Schema(
  {
    listingId: { type: String, required: true },
    day: { type: String, required: true },
    views: { type: Number, default: 0 },
    engagements: { type: Number, default: 0 },
    votes: { type: Number, default: 0 },
    actions: { type: Schema.Types.Mixed, default: {} },
    sources: { type: Schema.Types.Mixed, default: {} },
    leads: { type: Schema.Types.Mixed, default: {} },
    devices: { type: Schema.Types.Mixed, default: {} },
    countries: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false },
);
statsDaySchema.index({ listingId: 1, day: 1 }, { unique: true });
const BoardStatsDay: any = models.BoardStatsDay || model("BoardStatsDay", statsDaySchema, "board_listing_stats");

const EVENTS = new Set(["view", "invite", "link", "vote", "share"]);
const SOURCES = new Set(["search", "tag", "category", "list", "landing", "direct", "site", "external"]);
const DEVICES = new Set(["desktop", "mobile"]);
/** Sotto questa soglia di visite il paese resta nascosto (privacy). */
const COUNTRY_THRESHOLD = 50;

/* una visita per persona al giorno per scheda (solo in memoria, con l'IP già cifrato) */
const seen = new Map<string, number>();
function firstSeenToday(key: string) {
  const now = Date.now();
  if (seen.size > 20000) {
    for (const [k, exp] of seen) if (exp < now) seen.delete(k);
    if (seen.size > 20000) seen.clear();
  }
  const exp = seen.get(key);
  if (exp && exp > now) return false;
  seen.set(key, now + 24 * 3600_000);
  return true;
}

/** Chiave sicura per Mongo (niente punti o $), corta. */
function safeKey(raw?, max = 40) {
  return String(raw || "")
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[.$\u0000]/g, "")
    .replace(/[^\p{L}\p{N} _\-#]/gu, "")
    .trim()
    .slice(0, max);
}

function countryOf(headers?) {
  const c = String(headers?.["cf-ipcountry"] || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : "";
}

async function bump(listingId: string, inc: Record<string, number>) {
  const day = getDayKey(new Date());
  await BoardStatsDay.updateOne({ listingId, day }, { $setOnInsert: { listingId, day }, $inc: inc }, { upsert: true });
}

/** Registra un evento della pagina pubblica (visita o click). */
async function trackListingEvent(client?, payload: Record<string, any> = {}, reqMeta: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(payload.listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const event = String(payload.event || "").trim();
  if (!EVENTS.has(event)) return { ok: false, status: 400, error: "invalid_event", message: "Evento non valido." };
  const exists = await SiteDocument.exists({ _id: id, docType: BL });
  if (!exists) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };

  const who = hashIp(reqMeta.ip) || "anon";
  const day = getDayKey(new Date());
  if (!firstSeenToday(`${id}:${event}:${who}:${day}`)) return { ok: true, status: 200, counted: false };

  const inc: Record<string, number> = {};
  if (event === "view") {
    inc.views = 1;
    const source = SOURCES.has(String(payload.source || "")) ? String(payload.source) : "direct";
    inc[`sources.${source}`] = 1;
    const lead = safeKey(payload.lead);
    if (lead && (source === "search" || source === "tag" || source === "category")) inc[`leads.${source}|${lead}`] = 1;
    else if (source === "landing" || source === "direct" || source === "list") inc[`leads.${source}|`] = 1;
    const device = DEVICES.has(String(payload.device || "")) ? String(payload.device) : "desktop";
    inc[`devices.${device}`] = 1;
    const country = countryOf(reqMeta.headers);
    if (country) inc[`countries.${country}`] = 1;
  } else {
    inc.engagements = 1;
    inc[`actions.${event}`] = 1;
  }
  await bump(id, inc);
  return { ok: true, status: 200, counted: true };
}

/** Chiamato quando un voto va a buon fine. */
async function trackListingVote(listingId?) {
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return;
  await bump(id, { votes: 1 }).catch(() => null);
}

function addInto(target: Record<string, number>, src?) {
  if (!src || typeof src !== "object") return;
  for (const [k, v] of Object.entries(src)) {
    const n = Number(v) || 0;
    if (n) target[k] = (target[k] || 0) + n;
  }
}

/** Statistiche per il proprietario (o l'high staff). */
async function getListingAnalytics(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(payload.listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL }).select({ userId: 1, boardKind: 1, title: 1 }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (!payload.isHighStaff) {
    const auth: any = await resolveBoardsUser(payload.accessToken);
    if (!auth.ok) return auth;
    if (String(doc.userId) !== String(auth.userId)) {
      return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
    }
  }

  const days = [7, 14, 30, 90].includes(Number(payload.days)) ? Number(payload.days) : 14;
  const dayKeys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) dayKeys.push(getDayKey(new Date(Date.now() - i * 86400_000)));
  const uniq = [...new Set(dayKeys)];
  const rows: any[] = await BoardStatsDay.find({ listingId: id, day: { $in: uniq } }).lean();
  const byDay = new Map(rows.map((r) => [String(r.day), r]));

  const series = uniq.map((day) => {
    const r: any = byDay.get(day) || {};
    return { day, views: Number(r.views) || 0, engagements: Number(r.engagements) || 0, votes: Number(r.votes) || 0 };
  });
  const totals = series.reduce((a, s) => ({ views: a.views + s.views, engagements: a.engagements + s.engagements, votes: a.votes + s.votes }), { views: 0, engagements: 0, votes: 0 });

  const sources: Record<string, number> = {};
  const leadsRaw: Record<string, number> = {};
  const devices: Record<string, number> = {};
  const countries: Record<string, number> = {};
  const actions: Record<string, number> = {};
  for (const r of rows) {
    addInto(sources, r.sources);
    addInto(leadsRaw, r.leads);
    addInto(devices, r.devices);
    addInto(countries, r.countries);
    addInto(actions, r.actions);
  }
  const leads = Object.entries(leadsRaw)
    .map(([k, count]) => {
      const [source, value] = k.split("|");
      return { source, value: value || "", count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);
  const countryList = Object.entries(countries)
    .map(([code, count]) => ({ code, count }))
    .sort((a, b) => b.count - a.count);

  return {
    ok: true,
    status: 200,
    days,
    totals,
    series,
    sources,
    leads,
    devices,
    actions,
    countries: {
      threshold: COUNTRY_THRESHOLD,
      hidden: totals.views < COUNTRY_THRESHOLD,
      list: totals.views < COUNTRY_THRESHOLD ? [] : countryList.slice(0, 10),
      total: countryList.reduce((a, c) => a + c.count, 0),
    },
  };
}

export = { trackListingEvent, trackListingVote, getListingAnalytics, BoardStatsDay };
