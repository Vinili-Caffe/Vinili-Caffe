/**
 * Promemoria Wordle giornaliero (Europe/Rome 00:00):
 * notifica sito + push; DM Discord solo se push sito non attiva.
 */
"use strict";

const cron = require("node-cron") as typeof import("node-cron");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { sendDm } = require("../../Community/utils/noDmList") as typeof import("../../Community/utils/noDmList");
const { enqueueSiteInAppNotification } = require("../../site/notifications/siteInAppNotificationsService") as typeof import("../../site/notifications/siteInAppNotificationsService");
const { shouldSkipDiscordDmForActiveWebPush } = require("../../site/http/siteNotifPrefs") as typeof import("../../site/http/siteNotifPrefs");
const { getClientGuildCached, getGuildMemberCached, getUserCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { isBotPresentInGuild } = require("../../../shared/discord/botGuildPresence") as typeof import("../../../shared/discord/botGuildPresence");
const { shouldStartExternalWorkerLoop } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");
const wordle = require("./wordleService") as typeof import("./wordleService");

const DEFAULT_TZ = "Europe/Rome";
const PLAY_URL = "https://www.viniliecaffe.it/wordle/";
const QUAD_URL = "https://www.viniliecaffe.it/wordle/quattro/";

let cronMain: any = null;
let cronBackup: any = null;
let tickRunning = false;

function mainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function isStartedBucket(bucket?, day?) {
  if (!bucket || typeof bucket !== "object" || !day) return false;
  for (const raw of Object.values(bucket)) {
    if (!raw || typeof raw !== "object") continue;
    const g = raw as any;
    if (String(g.day || "") !== String(day)) continue;
    const boardLen = Array.isArray(g.board) ? g.board.length : 0;
    const guessesLen = Array.isArray(g.guesses) ? g.guesses.length : 0;
    if (boardLen > 0 || guessesLen > 0 || g.done || g.won || g.lost) return true;
  }
  return false;
}

function alreadyPlayedToday(profile?, day?) {
  return (
    isStartedBucket(profile?.siteWordleDaily, day) || isStartedBucket(profile?.siteWordleQuadDaily, day)
  );
}

async function claimRemindDay(guildId?, userId?, day?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const d = String(day || "").slice(0, 12);
  if (!gid || !uid || !d) return false;
  const res = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: gid,
      userId: uid,
      "profile.siteWordleRemind.enabled": true,
      $or: [
        { "profile.siteWordleRemind.lastRemindedDay": { $ne: d } },
        { "profile.siteWordleRemind.lastRemindedDay": { $exists: false } },
        { "profile.siteWordleRemind.lastRemindedDay": null },
        { "profile.siteWordleRemind.lastRemindedDay": "" },
      ],
    },
    { $set: { "profile.siteWordleRemind.lastRemindedDay": d } },
    { new: true },
  ).catch(() => null);
  return Boolean(res);
}

async function releaseRemindDay(guildId?, userId?, day?) {
  await ActivityUserProfile.updateOne(
    {
      guildId: String(guildId || ""),
      userId: String(userId || ""),
      "profile.siteWordleRemind.lastRemindedDay": String(day || ""),
    },
    { $unset: { "profile.siteWordleRemind.lastRemindedDay": 1 } },
  ).catch(() => null);
}

function buildSiteOpts(guildId?, userId?, day?) {
  return {
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    title: "Wordle del giorno",
    body: "È mezzanotte: c’è una nuova parola da indovinare. Vinci e guadagni EXP.",
    kind: "wordle_reminder",
    openUrl: PLAY_URL,
    dedupeKey: `wordle_reminder_${day}`,
    dedupeWindowMs: 20 * 60 * 60 * 1000,
  };
}

function buildDmPayload() {
  const embed = new EmbedBuilder()
    .setColor(0xd99a5b)
    .setTitle("Wordle del giorno")
    .setDescription("Nuova parola (e anche le quattro, se ti va). Vinci e guadagni EXP sul livello.")
    .setURL(PLAY_URL);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Gioca").setURL(PLAY_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Quattro parole").setURL(QUAD_URL),
  );
  return { embeds: [embed], components: [row] };
}

async function dispatchWordleDailyReminder(client?, opts: Record<string, any> = {}) {
  const gid = String(opts.guildId || mainGuildId()).trim();
  const uid = String(opts.userId || "").trim();
  const day = String(opts.day || wordle.todayKey()).slice(0, 12);
  if (!gid || !uid || !day) return { ok: false };

  if (!isBotPresentInGuild(client, gid)) {
    return { ok: true, skippedBotAbsent: true };
  }

  const guild = await getClientGuildCached(client, gid);
  const member = guild ? await getGuildMemberCached(guild, uid) : null;
  if (!guild || !member) return { ok: true, skippedNotInGuild: true };

  const claimed = await claimRemindDay(gid, uid, day);
  if (!claimed) return { ok: true, skippedDuplicate: true };

  const siteOpts = buildSiteOpts(gid, uid, day);
  let siteOk = false;
  try {
    siteOk = await enqueueSiteInAppNotification({
      ...siteOpts,
      pushTtlSeconds: 60 * 60 * 14,
    });
  } catch (err) {
    global.logger?.warn?.("[WORDLE REMIND] site notif failed:", uid, err?.message || err);
    siteOk = false;
  }
  if (!siteOk) {
    await releaseRemindDay(gid, uid, day);
    return { ok: false, siteEnqueueFailed: true };
  }

  const skipDmForPush = await shouldSkipDiscordDmForActiveWebPush(gid, uid, siteOpts).catch(() => false);
  if (skipDmForPush) return { ok: true, delivered: true, skippedDiscordForWebPush: true };

  let user = member.user || (await getUserCached(client, uid));
  if (!user && client?.users?.fetch) user = await client.users.fetch(uid).catch(() => null);
  if (!user) return { ok: true, delivered: false };

  const sent = await sendDm(user, buildDmPayload(), {
    guildId: gid,
    category: "wordle",
    skipIfWebPush: true,
    webPushNotifMeta: siteOpts,
  }).catch(() => null);

  return { ok: true, delivered: Boolean(sent) };
}

async function runWordleRemindTick(client?) {
  if (tickRunning) return { skipped: true };
  tickRunning = true;
  try {
    const gid = mainGuildId();
    if (!gid || !client) return { ok: false };
    await wordle.ensureReady(client?.config?.minigames?.wordle || null);
    const day = wordle.todayKey();
    let scanned = 0;
    let sent = 0;
    let skippedPlayed = 0;

    const cursor = ActivityUserProfile.find({
      guildId: gid,
      "profile.siteWordleRemind.enabled": true,
    })
      .select("userId profile.siteWordleDaily profile.siteWordleQuadDaily profile.siteWordleRemind")
      .lean()
      .cursor();

    for await (const doc of cursor) {
      scanned += 1;
      const uid = String(doc?.userId || "").trim();
      if (!uid) continue;
      if (alreadyPlayedToday(doc.profile, day)) {
        skippedPlayed += 1;
        continue;
      }
      const out = await dispatchWordleDailyReminder(client, { guildId: gid, userId: uid, day });
      if (out?.delivered || out?.skippedDiscordForWebPush) sent += 1;
    }

    if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
      global.logger?.info?.(`[WORDLE REMIND] day=${day} scanned=${scanned} nudged=${sent} skippedPlayed=${skippedPlayed}`);
    }
    return { ok: true, day, scanned, sent, skippedPlayed };
  } catch (err) {
    global.logger?.error?.("[WORDLE REMIND] tick failed:", err?.message || err);
    return { ok: false, error: String(err?.message || err) };
  } finally {
    tickRunning = false;
  }
}

function startWordleDailyReminderLoop(client?) {
  if (!shouldStartExternalWorkerLoop("COMMUNITY_POLL")) return null;
  if (!client || cronMain) return cronMain;

  cronMain = cron.schedule(
    "0 0 * * *",
    () => {
      void runWordleRemindTick(client).catch((e?) =>
        global.logger?.error?.("[WORDLE REMIND] 00:00 failed:", e),
      );
    },
    { timezone: DEFAULT_TZ, noOverlap: true },
  );

  cronBackup = cron.schedule(
    "5 0 * * *",
    () => {
      void runWordleRemindTick(client).catch((e?) =>
        global.logger?.error?.("[WORDLE REMIND] 00:05 failed:", e),
      );
    },
    { timezone: DEFAULT_TZ, noOverlap: true },
  );

  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    global.logger?.info?.("[WORDLE REMIND] cron Europe/Rome 00:00+00:05");
  }
  return cronMain;
}

async function getWordleRemindEnabled(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({
    guildId: String(guildId || mainGuildId()),
    userId: String(userId || ""),
  })
    .select("profile.siteWordleRemind")
    .lean()
    .catch(() => null);
  return Boolean(doc?.profile?.siteWordleRemind?.enabled);
}

async function setWordleRemindEnabled(guildId?, userId?, enabled?) {
  const gid = String(guildId || mainGuildId()).trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $setOnInsert: { guildId: gid, userId: uid },
      $set: { "profile.siteWordleRemind.enabled": Boolean(enabled) },
    },
    { upsert: true },
  ).catch(() => null);
  return true;
}

export = {
  startWordleDailyReminderLoop,
  runWordleRemindTick,
  dispatchWordleDailyReminder,
  getWordleRemindEnabled,
  setWordleRemindEnabled,
  alreadyPlayedToday,
};
