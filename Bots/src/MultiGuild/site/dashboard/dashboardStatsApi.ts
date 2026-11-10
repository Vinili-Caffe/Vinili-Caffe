/**
 * Statistiche del server per la dashboard: ticket (aperti/chiusi per giorno, durata, voti, tipi, staff)
 * e partnership (per giorno, manager più attivi). Periodo: 7, 30 o 90 giorni.
 * GET /webhooks/site-dashboard/guilds/:guildId/stats?days=30
 */
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { resolveDiscordUserLabels } = require("../../tickets/dashboard/dashboardTranscriptsApi") as typeof import("../../tickets/dashboard/dashboardTranscriptsApi");
const { ActivityUserProfile } = require("../../../Vinili/Community/schemas/communitySchemas") as typeof import("../../../Vinili/Community/schemas/communitySchemas");

const DAY = 24 * 60 * 60 * 1000;
const cache = new Map();
const CACHE_MS = 60_000;

function dayKey(ms?, timeZone = "Europe/Rome") {
  /* giorno nel fuso del server (impostazioni dashboard), così i grafici combaciano con quello che vede lo staff */
  return new Date(ms).toLocaleDateString("sv-SE", { timeZone });
}

function isOpen(t?) {
  const o = t?.open;
  return o === true || o === 1 || o === "1" || o === "true";
}

async function getDashboardStats(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access: any = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  const gid = access.guildId;
  const days = [7, 30, 90].includes(Number(query.days)) ? Number(query.days) : 30;
  const { getTenantTimezoneSync } = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
  const tz = getTenantTimezoneSync(gid);
  const key = `${gid}:${days}:${tz}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.out;

  const now = Date.now();
  const since = now - days * DAY;
  const prevSince = since - days * DAY;

  /* asse dei giorni: tutti presenti anche se a zero */
  const axis = [];
  for (let i = days - 1; i >= 0; i -= 1) axis.push(dayKey(now - i * DAY, tz));
  const series = () => Object.fromEntries(axis.map((d) => [d, 0]));

  /* ── ticket ── */
  const { GuildFeatureBucket } = require("../../schemas/guildFeatureBucketSchema") as typeof import("../../schemas/guildFeatureBucketSchema");
  const doc: any = await GuildFeatureBucket.findOne({ guildId: gid })
    .select({
      "tickets.open": 1,
      "tickets.createdAt": 1,
      "tickets.closedAt": 1,
      "tickets.ratingScore": 1,
      "tickets.claimedBy": 1,
      "tickets.closedBy": 1,
      "tickets.ticketType": 1,
    })
    .lean()
    .catch(() => null);
  const tickets = Array.isArray(doc?.tickets) ? doc.tickets : [];
  const opened = series();
  const closed = series();
  const ratings = [0, 0, 0, 0, 0];
  const types: Record<string, number> = {};
  const staff: Record<string, { closed: number; claimed: number }> = {};
  let openNow = 0;
  let openedPeriod = 0;
  let openedPrev = 0;
  let closedPeriod = 0;
  let durSum = 0;
  let durN = 0;
  let ratingSum = 0;
  let ratingN = 0;
  for (const t of tickets) {
    if (isOpen(t)) openNow += 1;
    const c = t?.createdAt ? new Date(t.createdAt).getTime() : 0;
    const x = t?.closedAt ? new Date(t.closedAt).getTime() : 0;
    if (c >= since) {
      openedPeriod += 1;
      const k = dayKey(c, tz);
      if (k in opened) opened[k] += 1;
      const ty = String(t.ticketType || "supporto");
      types[ty] = (types[ty] || 0) + 1;
    } else if (c >= prevSince) openedPrev += 1;
    if (x >= since && !isOpen(t)) {
      closedPeriod += 1;
      const k = dayKey(x, tz);
      if (k in closed) closed[k] += 1;
      if (c && x > c) {
        durSum += x - c;
        durN += 1;
      }
      const score = Number(t.ratingScore);
      if (Number.isFinite(score) && score >= 1 && score <= 5) {
        ratings[score - 1] += 1;
        ratingSum += score;
        ratingN += 1;
      }
      const cb = String(t.closedBy || "").trim();
      if (/^\d{16,22}$/.test(cb)) (staff[cb] ||= { closed: 0, claimed: 0 }).closed += 1;
      const cl = String(t.claimedBy || "").trim();
      if (/^\d{16,22}$/.test(cl)) (staff[cl] ||= { closed: 0, claimed: 0 }).claimed += 1;
    }
  }

  /* ── partnership ── */
  const partnersDay = series();
  const managers: Record<string, number> = {};
  let partnersPeriod = 0;
  let partnersPrev = 0;
  try {
    const rows: any[] = await ActivityUserProfile.aggregate([
      { $match: { guildId: gid } },
      { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
      { $match: { "staff.partnerActions.action": { $regex: /^create$/i }, "staff.partnerActions.date": { $gte: new Date(prevSince) } } },
      { $project: { _id: 0, userId: 1, date: "$staff.partnerActions.date" } },
    ]);
    for (const r of rows) {
      const ms = new Date(r.date).getTime();
      if (!Number.isFinite(ms)) continue;
      if (ms >= since) {
        partnersPeriod += 1;
        const k = dayKey(ms, tz);
        if (k in partnersDay) partnersDay[k] += 1;
        const uid = String(r.userId || "");
        if (uid) managers[uid] = (managers[uid] || 0) + 1;
      } else partnersPrev += 1;
    }
  } catch (err) {
    global.logger?.warn?.("[DASH STATS] partnership:", err?.message || err);
  }

  /* nomi di staff e manager più attivi */
  const topStaff = Object.entries(staff)
    .map(([userId, v]) => ({ userId, ...v, total: v.closed + v.claimed }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
  const topManagers = Object.entries(managers)
    .map(([userId, count]) => ({ userId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
  const labels: Record<string, any> = await resolveDiscordUserLabels(client, [...topStaff.map((s) => s.userId), ...topManagers.map((m) => m.userId)], { timeoutMs: 2000 }).catch(() => ({}));
  const nameOf = (id?) => {
    const l = labels?.[id];
    return typeof l === "string" ? l : l?.label || l?.username || l?.displayName || null;
  };

  const out = {
    ok: true,
    status: 200,
    guildId: gid,
    days,
    axis,
    tickets: {
      openNow,
      opened: openedPeriod,
      openedPrev,
      closed: closedPeriod,
      avgResolutionMs: durN ? Math.round(durSum / durN) : null,
      avgRating: ratingN ? Math.round((ratingSum / ratingN) * 10) / 10 : null,
      ratings,
      ratingCount: ratingN,
      openedByDay: axis.map((d) => opened[d]),
      closedByDay: axis.map((d) => closed[d]),
      types: Object.entries(types)
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
      topStaff: topStaff.map((s) => ({ ...s, name: nameOf(s.userId) })),
    },
    partnerships: {
      total: partnersPeriod,
      prev: partnersPrev,
      byDay: axis.map((d) => partnersDay[d]),
      topManagers: topManagers.map((m) => ({ ...m, name: nameOf(m.userId) })),
    },
  };
  cache.set(key, { at: Date.now(), out });
  return out;
}

export = { getDashboardStats };
