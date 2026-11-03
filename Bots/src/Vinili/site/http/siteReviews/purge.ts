const { SiteDocument } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { broadcastSiteReviewsChanged } = require("../../suggestions/siteSuggestionsBroadcast") as typeof import("../../suggestions/siteSuggestionsBroadcast");
const { RV, STAFF_ROLE_ID, HIGH_STAFF_ROLE_ID } = require("./constants") as typeof import("./constants");
const { resolveGuild } = require("./helpers") as typeof import("./helpers");
const { invalidatePublicReviewsListCache } = require("./cache") as typeof import("./cache");
const { getStaffTargets } = require("./staffTargets") as typeof import("./staffTargets");

/* exStaffReviewsPurge1: le recensioni di chi non è più staff (depex o uscito) si cancellano.
   Ogni staffer è ricontrollato su Discord uno per uno: un elenco membri incompleto non cancella niente. */
let exStaffSweepTimer = null;
let exStaffSweepRunning = false;

async function stafferStillStaff(guild?, userId?) {
  const m = await guild.members.fetch({ user: userId, force: true }).catch((err?) => (err?.code === 10007 ? false : null));
  if (m === null) return true; // Discord non ha risposto: nel dubbio si tiene
  if (m === false) return false; // non è più nel server
  return [STAFF_ROLE_ID, HIGH_STAFF_ROLE_ID].filter(Boolean).some((r?) => m.roles.cache.has(r));
}

async function purgeExStaffReviews(client?) {
  if (exStaffSweepRunning || (!STAFF_ROLE_ID && !HIGH_STAFF_ROLE_ID)) return { removed: 0 };
  exStaffSweepRunning = true;
  try {
    const guild = await resolveGuild(client);
    if (!guild) return { removed: 0 };
    const ids = await SiteDocument.distinct("staffUserId", { docType: RV, guildId: guild.id, reviewKind: "staff" }).catch(() => []);
    let removed = 0;
    for (const raw of ids) {
      const uid = String(raw || "").trim();
      if (!/^\d{5,32}$/.test(uid)) continue;
      if (await stafferStillStaff(guild, uid)) continue;
      const res = await SiteDocument.deleteMany({ docType: RV, guildId: guild.id, reviewKind: "staff", staffUserId: uid }).catch(() => null);
      const n = Number(res?.deletedCount || 0);
      if (n) removed += n;
    }
    if (removed) {
      invalidatePublicReviewsListCache(guild.id);
      try {
        broadcastSiteReviewsChanged();
      } catch (_) {}
    }
    return { removed };
  } finally {
    exStaffSweepRunning = false;
  }
}

/** Da chiamare quando qualcuno perde lo staff o esce: aspetta un attimo (i ruoli si assestano) e pulisce. */
function scheduleExStaffReviewsPurge(client?, delayMs = 20_000) {
  if (exStaffSweepTimer) clearTimeout(exStaffSweepTimer);
  exStaffSweepTimer = setTimeout(() => {
    exStaffSweepTimer = null;
    purgeExStaffReviews(client).catch((err?) => global.logger?.warn?.("[siteReviewsApi] purge ex staff:", err?.message || err));
  }, delayMs);
  exStaffSweepTimer.unref?.();
}

async function cleanupOrphanStaffReviews(client?, guild?) {
  /* reviewsStaffOrphanSafe1: never delete on read — incomplete Discord roster
     used to wipe staff reviews ($nin / empty ids). Keep docs; UI still lists them. */
  return getStaffTargets(client, guild);
}

export = { purgeExStaffReviews, scheduleExStaffReviewsPurge, cleanupOrphanStaffReviews, stafferStillStaff };
