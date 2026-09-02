const mongoose = require("mongoose");
const { OverwriteType, PermissionFlagsBits } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const IDs = require("../Config/ids");

const COUNTING_BAN_TIME_ZONE = "Europe/Rome";
const unbanTimers = new Map();

function getRomeDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: COUNTING_BAN_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function getRomeEndOfDayMs(from = new Date()) {
  const start = from.getTime();
  const dayKey = getRomeDayKey(from);
  let probe = start + 60_000;
  const limit = start + 48 * 60 * 60 * 1000;
  while (probe < limit && getRomeDayKey(new Date(probe)) === dayKey) {
    probe += 60_000;
  }
  return probe;
}

function timerKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function clearUnbanTimer(guildId, userId) {
  const key = timerKey(guildId, userId);
  const existing = unbanTimers.get(key);
  if (existing) {
    clearTimeout(existing);
    unbanTimers.delete(key);
  }
}

function scheduleUnbanTimer(guildId, userId, channelId, banUntilMs, client) {
  clearUnbanTimer(guildId, userId);
  const delay = Math.max(1000, banUntilMs - Date.now());
  const timer = setTimeout(() => {
    unbanTimers.delete(timerKey(guildId, userId));
    void restoreCountingChannelSendByIds(guildId, userId, channelId, client, "Counting: fine ban giornaliero").catch(() => null);
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
  unbanTimers.set(timerKey(guildId, userId), timer);
}

function memberBypassesCountingChannelBan(member, channel) {
  if (!member) return true;
  if (String(member.id) === String(member.guild?.ownerId || "")) return true;
  try {
    const perms = channel?.permissionsFor?.(member) || member.permissions;
    if (perms?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (perms?.has?.(PermissionFlagsBits.ManageMessages)) return true;
  } catch {
      }
  return false;
}

function isObviousCountingWrong(expectedNext, submittedRaw) {
  const expected = Math.floor(Number(expectedNext));
  const submitted = Math.floor(Number(submittedRaw));
  if (!Number.isFinite(expected) || expected <= 0 || !Number.isFinite(submitted)) return false;
  const diff = Math.abs(submitted - expected);
  if (submitted <= 0) return true;
  if (submitted === 1 && expected >= 25) return true;
  if (diff >= 10) return true;
  if (expected >= 8 && diff >= 5) return true;
  if (expected >= 3 && diff >= expected) return true;
  return false;
}

async function revokeCountingChannelSend(guild, channel, userId, client, reason) {
  if (!guild || !channel?.permissionOverwrites?.edit || !userId) return false;
  if (String(userId) === String(guild.ownerId || "")) return false;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) {
    global.logger?.warn?.("[COUNTING WRITE-BAN] Bot needs ManageChannels to deny SendMessages in counting");
    return false;
  }
  const member =
    guild.members?.cache?.get(String(userId)) ||
    (await guild.members?.fetch(String(userId)).catch(() => null));
  if (!member) return false;
  try {
    await channel.permissionOverwrites.edit(
      userId,
      {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
      },
      { type: OverwriteType.Member, reason: String(reason || "Counting").slice(0, 450) },
    );
    return true;
  } catch (err) {
    if (err?.code === 10009 || err?.code === 10013 || err?.code === 10026) return false;
    global.logger?.warn?.("[COUNTING WRITE-BAN]", err?.message || err);
    return false;
  }
}

async function restoreCountingChannelSend(guild, channel, userId, reason) {
  if (!guild || !channel?.permissionOverwrites || !userId) return false;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return false;
  const overwrite = channel.permissionOverwrites.cache.get(String(userId));
  if (!overwrite) return true;
  try {
    await channel.permissionOverwrites.delete(userId, String(reason || "Counting: fine ban").slice(0, 450));
    return true;
  } catch (err) {
    if (err?.code === 10009 || err?.code === 10013 || err?.code === 10026) return false;
    global.logger?.warn?.("[COUNTING WRITE-BAN] restore:", err?.message || err);
    return false;
  }
}

async function clearCountingChannelBanRecord(guildId, userId) {
  if (!isValidGuildUserId(guildId, userId)) return;
  if (mongoose.connection?.readyState !== 1) return;
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId), userId: String(userId) },
    { $unset: { "profile.countingChannelBanUntil": "" } },
  ).catch(() => null);
}

async function restoreCountingChannelSendByIds(guildId, userId, channelId, client, reason) {
  clearUnbanTimer(guildId, userId);
  const gid = String(guildId || "");
  const uid = String(userId || "");
  const cid = String(channelId || IDs.channels?.counting || "");
  if (!gid || !uid) return false;
  const guild =
    client?.guilds?.cache?.get(gid) ||
    (await client?.guilds?.fetch?.(gid).catch(() => null));
  if (!guild) return false;
  const channel =
    guild.channels?.cache?.get(cid) ||
    (await guild.channels?.fetch?.(cid).catch(() => null));
  if (!channel?.isTextBased?.()) return false;
  await restoreCountingChannelSend(guild, channel, uid, reason);
  await clearCountingChannelBanRecord(gid, uid);
  return true;
}

async function persistCountingChannelBanUntil(guildId, userId, banUntilMs) {
  if (!isValidGuildUserId(guildId, userId)) return false;
  if (mongoose.connection?.readyState !== 1) return false;
  const banUntil = new Date(banUntilMs);
  if (!Number.isFinite(banUntil.getTime())) return false;
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId), userId: String(userId) },
    {
      $setOnInsert: { guildId: String(guildId), userId: String(userId) },
      $set: { "profile.countingChannelBanUntil": banUntil },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return true;
}

async function applyObviousWrongDayBan({ member, channel, client, expectedNext, submittedValue }) {
  if (!member?.id || !channel?.id || !client) return { applied: false, banUntilMs: null };
  if (memberBypassesCountingChannelBan(member, channel)) return { applied: false, banUntilMs: null };
  if (!isObviousCountingWrong(expectedNext, submittedValue)) return { applied: false, banUntilMs: null };
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  const banUntilMs = getRomeEndOfDayMs();
  if (banUntilMs <= Date.now()) return { applied: false, banUntilMs: null };
  const revoked = await revokeCountingChannelSend(
    member.guild,
    channel,
    userId,
    client,
    "Counting: numero palesemente sbagliato",
  );
  if (!revoked) return { applied: false, banUntilMs: null };
  await persistCountingChannelBanUntil(guildId, userId, banUntilMs);
  scheduleUnbanTimer(guildId, userId, channel.id, banUntilMs, client);
  return { applied: true, banUntilMs };
}

function formatBanUntilRomeTime(banUntilMs) {
  try {
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: COUNTING_BAN_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(banUntilMs));
  } catch {
    return "fine giornata";
  }
}

async function rehydrateCountingChannelBans(client) {
  if (!client || mongoose.connection?.readyState !== 1) return;
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  const now = new Date();
  const active = await ActivityUserProfile.find({
    ...(mainGuildId ? { guildId: mainGuildId } : {}),
    "profile.countingChannelBanUntil": { $gt: now },
  })
    .select("guildId userId profile.countingChannelBanUntil")
    .lean()
    .catch(() => []);
  for (const doc of active || []) {
    const guildId = String(doc?.guildId || "");
    const userId = String(doc?.userId || "");
    const banUntilMs = new Date(doc?.profile?.countingChannelBanUntil || 0).getTime();
    if (!isValidGuildUserId(guildId, userId) || !Number.isFinite(banUntilMs) || banUntilMs <= Date.now()) continue;
    const guild =
      client.guilds?.cache?.get(guildId) ||
      (await client.guilds?.fetch?.(guildId).catch(() => null));
    if (!guild) continue;
    const channelId = String(IDs.channels?.counting || "");
    const channel =
      guild.channels?.cache?.get(channelId) ||
      (await guild.channels?.fetch?.(channelId).catch(() => null));
    if (!channel?.isTextBased?.()) continue;
    await revokeCountingChannelSend(
      guild,
      channel,
      userId,
      client,
      "Counting: ban giornaliero (rehydrate)",
    ).catch(() => null);
    scheduleUnbanTimer(guildId, userId, channel.id, banUntilMs, client);
  }
  const expired = await ActivityUserProfile.find({
    ...(mainGuildId ? { guildId: mainGuildId } : {}),
    "profile.countingChannelBanUntil": { $lte: now },
  })
    .select("guildId userId")
    .lean()
    .catch(() => []);
  for (const doc of expired || []) {
    const guildId = String(doc?.guildId || "");
    const userId = String(doc?.userId || "");
    if (!isValidGuildUserId(guildId, userId)) continue;
    await restoreCountingChannelSendByIds(
      guildId,
      userId,
      IDs.channels?.counting,
      client,
      "Counting: ban scaduto (rehydrate)",
    ).catch(() => null);
  }
}

module.exports = {
  isObviousCountingWrong,
  revokeCountingChannelSend,
  restoreCountingChannelSend,
  applyObviousWrongDayBan,
  formatBanUntilRomeTime,
  rehydrateCountingChannelBans,
};