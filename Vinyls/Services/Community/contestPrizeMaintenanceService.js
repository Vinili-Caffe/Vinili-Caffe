const cron = require("node-cron");
const mongoose = require("mongoose");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

const MAIN_GUILD_ID = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
const TIME_ZONE = "Europe/Rome";
/** Prima `weeklycontestmetas`; ora unificato in `weeklycontests`. */
const LEGACY_WEEKLY_CONTEST_META_COLL = "weeklycontests";

function contestGuildId() {
  return MAIN_GUILD_ID;
}

async function migrateLegacyWeeklyContestMetaToProfiles(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const coll = db.collection(LEGACY_WEEKLY_CONTEST_META_COLL);
  const metas = await coll.find({ guildId: gid }).toArray().catch(() => []);
  const now = new Date();
  for (const meta of metas) {
    const ek = String(meta?.eventKey || "").trim();
    const removals = Array.isArray(meta?.finalePrizeRoleRemovals) ? meta.finalePrizeRoleRemovals : [];
    let migrationOk = true;
    for (const entry of removals) {
      const uid = String(entry?.userId || "").trim();
      const rid = String(entry?.roleId || "").trim();
      const removeAt = entry?.removeAt != null ? new Date(entry.removeAt) : null;
      if (!/^\d{17,22}$/.test(uid) || !/^\d{17,22}$/.test(rid) || !removeAt || !Number.isFinite(removeAt.getTime())) {
        continue;
      }
      if (!isValidGuildUserId(gid, uid)) continue;
      const existing = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
        .select("profile.contestPrizes.finalePendingRoleRemovals")
        .lean()
        .catch(() => null);
      const prev = Array.isArray(existing?.profile?.contestPrizes?.finalePendingRoleRemovals)
        ? existing.profile.contestPrizes.finalePendingRoleRemovals
        : [];
      const removeMs = removeAt.getTime();
      const dupe = prev.some(
        (x) => String(x?.roleId || "") === rid && new Date(x?.removeAt || 0).getTime() === removeMs,
      );
      if (dupe) continue;
      const res = await ActivityUserProfile.updateOne(
        { guildId: gid, userId: uid },
        {
          $push: {
            "profile.contestPrizes.finalePendingRoleRemovals": {
              roleId: rid,
              removeAt,
              hadRoleBefore: Boolean(entry?.hadRoleBefore),
              eventKey: ek,
            },
          },
          $setOnInsert: { guildId: gid, userId: uid },
        },
        { upsert: true },
      ).catch((err) => {
        migrationOk = false;
        global.logger?.warn?.("[CONTEST_PRIZE] migrazione removal meta→profilo:", err?.message || err);
        return null;
      });
      if (!res?.acknowledged) migrationOk = false;
    }
    const sec = String(meta?.finaleDisegniSecondPlaceUserId || "").trim();
    if (sec && /^\d{17,22}$/.test(sec) && isValidGuildUserId(gid, sec)) {
      const cur = await ActivityUserProfile.findOne({ guildId: gid, userId: sec })
        .select("profile.contestPrizes.disegniSecondPlaceUnlock profile.totals.exp.event.contestDisegniSecondPlaceUnlock")
        .lean()
        .catch(() => null);
      const hasUnlock =
        Boolean(cur?.profile?.contestPrizes?.disegniSecondPlaceUnlock) ||
        Boolean(cur?.profile?.totals?.exp?.event?.contestDisegniSecondPlaceUnlock);
      if (!hasUnlock) {
        const setUnlock = {
          "profile.contestPrizes.disegniSecondPlaceUnlock": true,
          "profile.contestPrizes.disegniSecondPlaceEventKey": ek || "legacy",
          "profile.contestPrizes.disegniSecondPlaceAt": now,
          "profile.totals.exp.event.contestDisegniSecondPlaceUnlock": true,
          "profile.totals.exp.event.contestDisegniSecondPlaceEventKey": ek || "legacy",
          "profile.totals.exp.event.contestDisegniSecondPlaceAt": now,
        };
        const res2 = await ActivityUserProfile.updateOne(
          { guildId: gid, userId: sec },
          { $set: setUnlock, $setOnInsert: { guildId: gid, userId: sec } },
          { upsert: true },
        ).catch((err) => {
          migrationOk = false;
          global.logger?.warn?.("[CONTEST_PRIZE] migrazione 2° meta→profilo:", err?.message || err);
          return null;
        });
        if (!res2?.acknowledged) migrationOk = false;
      }
    }
    const hadLegacyData = removals.length > 0 || (sec && /^\d{17,22}$/.test(sec));
    if (hadLegacyData && migrationOk && meta?._id) {
      await coll
        .updateOne(
          { _id: meta._id },
          { $set: { finalePrizeRoleRemovals: [], finaleDisegniSecondPlaceUserId: null } },
        )
        .catch((err) => global.logger?.warn?.("[CONTEST_PRIZE] cleanup meta legacy:", err?.message || err));
    }
  }
}

async function processContestFinalePrizeRoleRemovals(client) {
  const gid = contestGuildId();
  if (!gid || !client) return;
  await migrateLegacyWeeklyContestMetaToProfiles(gid);
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;
  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "profile.contestPrizes.finalePendingRoleRemovals.0": { $exists: true },
  })
    .select("userId profile.contestPrizes.finalePendingRoleRemovals")
    .lean()
    .catch(() => []);
  const now = Date.now();
  for (const doc of docs) {
    const uid = String(doc?.userId || "").trim();
    if (!/^\d{17,22}$/.test(uid)) continue;
    const raw = doc.profile?.contestPrizes?.finalePendingRoleRemovals;
    if (!Array.isArray(raw) || !raw.length) continue;
    const keep = [];
    for (const entry of raw) {
      const removeAt = new Date(entry?.removeAt || 0).getTime();
      if (!Number.isFinite(removeAt)) {
        keep.push(entry);
        continue;
      }
      if (removeAt > now) {
        keep.push(entry);
        continue;
      }
      if (entry?.hadRoleBefore) continue;
      const rid = String(entry?.roleId || "").trim();
      if (!rid) continue;
      const member =
        (await getGuildMemberCached(guild, uid, { preferFresh: true })) || (await guild.members.fetch(uid).catch(() => null));
      if (!member) continue;
      if (!member.roles.cache.has(rid)) continue;
      let ok = true;
      await member.roles.remove(rid, "Contest sfondi: premio 30 giorni scaduto").catch((err) => {
        ok = false;
        global.logger?.warn?.("[CONTEST_PRIZE] rimozione premio:", err?.message || err);
      });
      if (!ok) keep.push(entry);
    }
    if (keep.length !== raw.length) {
      await ActivityUserProfile.updateOne(
        { guildId: gid, userId: uid },
        { $set: { "profile.contestPrizes.finalePendingRoleRemovals": keep } },
      ).catch((err) => global.logger?.warn?.("[CONTEST_PRIZE] update removals profilo:", err?.message || err));
    }
  }
}

let contestPrizeCronTask = null;

function startContestPrizeMaintenanceCron(client) {
  if (contestPrizeCronTask) return contestPrizeCronTask;
  if (!MAIN_GUILD_ID) return null;
  contestPrizeCronTask = cron.schedule(
    "0 * * * *",
    () => {
      void processContestFinalePrizeRoleRemovals(client).catch((err) =>
        global.logger?.error?.("[CONTEST_PRIZE] cron rimozioni premio:", err),
      );
    },
    { timezone: TIME_ZONE },
  );
  contestPrizeCronTask.unref?.();
  void processContestFinalePrizeRoleRemovals(client).catch((err) =>
    global.logger?.warn?.("[CONTEST_PRIZE] rimozioni premio (catch-up avvio):", err?.message || err),
  );
  return contestPrizeCronTask;
}

module.exports = {
  contestGuildId,
  processContestFinalePrizeRoleRemovals,
  startContestPrizeMaintenanceCron,
};