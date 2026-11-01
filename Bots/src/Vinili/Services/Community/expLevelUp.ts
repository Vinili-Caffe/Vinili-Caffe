/** EXP: messaggi di passaggio di livello e dei perk. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientGuildCached, getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { sendLevelMilestoneSupportersAnnouncement } = require("../../Utils/Community/levelMilestoneSupportersAnnounceEmbeds") as typeof import("../../Utils/Community/levelMilestoneSupportersAnnounceEmbeds");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { isLevelExpGuild, formatMemberMention, repairExpTotals, resolveLevelUpAnnounceLevel } = require("./expLevels") as typeof import("./expLevels");
const { memberDisplayName, resolveEmbedUserAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");

const VINILI_EMBED_COLOR_INT = 0x826bc2;
const LEVEL_UP_CHANNEL_ID = IDs.channels.commands;
const PERKS_CHANNEL_ID = IDs.channels.supporters;
const LEVEL_ROLE_MAP = new Map([[10, IDs.roles.Level10], [20, IDs.roles.Level20], [30, IDs.roles.Level30], [50, IDs.roles.Level50], [70, IDs.roles.Level70], [100, IDs.roles.Level100], [125, IDs.roles.Level120], [150, IDs.roles.Level150], [200, IDs.roles.Level200],]);

async function fetchUserExpSnapshot(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.totals.exp.totalExp profile.totals.exp.level")
    .lean()
    .catch(() => null);
  const exp = doc?.profile?.totals?.exp;
  if (!exp) return { totalExp: 0, level: 0, levelFromExp: 0, exists: false };
  const repaired = repairExpTotals(exp);
  return { ...repaired, exists: true };
}

async function buildLevelUpEmbed(member?, level?) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const name = memberDisplayName(member);
  return {
    embeds: [
      {
        color: VINILI_EMBED_COLOR_INT,
        title: `${name} leveled up!`,
        thumbnail: { url: avatarUrl },
        author: { name, icon_url: avatarUrl },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${formatMemberMention(member)}!**`,
          `<:VC_LevelUp2:1482527047871107143> Hai appena __raggiunto__ il **livello** \`${level}\``,
          `<a:VC_HelloKittyGift:1329447876857958471> __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendLevelUpMessage(guild?, member?, level?) {
  if (!guild || !member) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = await buildLevelUpEmbed(member, level);
  await sendLevelUpPayload(channel, member, payload);
}

async function sendLevelUpAnnouncement(guild?, member?, level?) {
  if (!guild || !member || !Number.isFinite(level) || level < 1) return;
  if (!isLevelExpGuild(guild.id)) return;
  if (LEVEL_ROLE_MAP.has(level)) {
    const roleId = LEVEL_ROLE_MAP.get(level);
    await sendPerksLevelMessage(guild, member, level);
    await sendLevelMilestoneSupportersAnnouncement(guild, member, level, roleId).catch(() => null);
  } else {
    await sendLevelUpMessage(guild, member, level);
  }
}

async function buildPerksLevelEmbed(member?, level?, roleId?) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const name = memberDisplayName(member);
  return {
    embeds: [
      {
        color: VINILI_EMBED_COLOR_INT,
        title: `${name} leveled up!`,
        thumbnail: { url: avatarUrl },
        author: { name, icon_url: avatarUrl },
        description: [
          `<a:VC_PandaClap:1331620157398712330> **Complimenti ${formatMemberMention(member)}!**`,
          `<:VC_LevelUp2:1482527047871107143> Hai appena __raggiunto__ il <@&${roleId}>`,
          `<a:VC_HelloKittyGift:1329447876857958471> __Controlla__ <#${PERKS_CHANNEL_ID}> per sapere i nuovi **vantaggi** che hai _sbloccato_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendPerksLevelMessage(guild?, member?, level?) {
  const roleId = LEVEL_ROLE_MAP.get(level);
  if (!guild || !member || !roleId) return;
  const channel = await getLevelUpChannel(guild);
  if (!channel) return;
  const payload = await buildPerksLevelEmbed(member, level, roleId);
  await sendLevelUpPayload(channel, member, payload);
}

async function getLevelUpChannel(guild?) {
  if (!guild || !LEVEL_UP_CHANNEL_ID) return null;
  const client = guild.client;
  return guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) || (await getGuildChannelCached(guild, LEVEL_UP_CHANNEL_ID)) || (client ? (await getClientChannelCached(client, LEVEL_UP_CHANNEL_ID)) : null);
}

const EVENT_LEVEL_UP_DEBOUNCE_MS = 1800;
const eventLevelUpPending = new Map();
let eventLevelUpFlushRegistered = false;

async function flushPendingEventLevelUpMessages() {
  const rows = Array.from(eventLevelUpPending.values());
  eventLevelUpPending.clear();
  for (const row of rows) {
    try {
      if (row?.timeoutId) clearTimeout(row.timeoutId);
    } catch (_) {}
  }
  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const userId = String(row?.userId || row?.key?.split?.(":")?.[1] || "");
    const client = row?.client;
    if (!guildId || !userId || !client) continue;
    try {
      const g = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
      if (!g) continue;
      const mem = await getGuildMemberCached(g, userId);
      if (!mem) continue;
      const snapshot = await fetchUserExpSnapshot(guildId, userId).catch(() => null);
      const announceLevel = resolveLevelUpAnnounceLevel(
        Number(row.prevLevel) || 0,
        Number(row.level) || 0,
        snapshot,
      );
      if (!announceLevel) continue;
      await sendLevelUpAnnouncement(g, mem, announceLevel);
    } catch (err) {
      global.logger?.error?.("[expService] shutdown level-up flush error:", err?.message || err);
    }
  }
}

function ensureEventLevelUpShutdownFlush() {
  if (eventLevelUpFlushRegistered) return;
  eventLevelUpFlushRegistered = true;
  try {
    const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
    armShutdownCheckpoint();
    registerShutdownFlush("vinyls_event_levelup_pending", () => flushPendingEventLevelUpMessages());
  } catch (_) {}
}

function scheduleEventLevelUpMessage(clientOrGuild?, guildId?, userId?, level?, prevLevel = 0) {
  if (!guildId || !userId || !Number.isFinite(level) || level < 1) return;
  const client = clientOrGuild?.client ?? clientOrGuild;
  if (!client) return;
  ensureEventLevelUpShutdownFlush();
  const key = `${String(guildId)}:${String(userId)}`;
  const safePrev = Math.max(0, Math.floor(Number(prevLevel || 0)));
  const existing = eventLevelUpPending.get(key);
  if (existing) {
    clearTimeout(existing.timeoutId);
    level = Math.max(Number(level), Number(existing.level) || 0);
    prevLevel = Math.min(safePrev, Math.max(0, Math.floor(Number(existing.prevLevel || 0))));
  } else {
    prevLevel = safePrev;
  }
  const flushLevel = Math.floor(Number(level));
  const flushPrevLevel = Math.max(0, Math.floor(Number(prevLevel || 0)));
  const timeoutId = setTimeout(async () => {
    eventLevelUpPending.delete(key);
    try {
      const g = client.guilds.cache.get(guildId) || (await getClientGuildCached(client, guildId));
      if (!g) return;
      const mem = await getGuildMemberCached(g, userId);
      if (!mem) return;
      const snapshot = await fetchUserExpSnapshot(guildId, userId).catch(() => null);
      const announceLevel = resolveLevelUpAnnounceLevel(flushPrevLevel, flushLevel, snapshot);
      if (!announceLevel) return;
      await sendLevelUpAnnouncement(g, mem, announceLevel);
    } catch (err) {
      global.logger?.error?.("[expService] scheduleEventLevelUpMessage flush error:", err);
    }
  }, EVENT_LEVEL_UP_DEBOUNCE_MS);
  timeoutId.unref?.();
  eventLevelUpPending.set(key, {
    timeoutId,
    level: flushLevel,
    prevLevel: flushPrevLevel,
    guildId: String(guildId),
    userId: String(userId),
    client,
  });
}

async function sendLevelUpPayload(channel?, member?, payload?) {
  if (!channel || !member || !payload) return;
  const { applyPronounGenderToPayload } = require("../../Utils/Community/pronounGenderUtils") as typeof import("../../Utils/Community/pronounGenderUtils");
  const outgoing = applyDefaultFooterToEmbeds(
    applyPronounGenderToPayload(
      {
        content: `<a:VC_LevelUp:1482527020641419415> ${formatMemberMention(member)} sei salito/a di livello!`,
        ...payload,
      },
      member,
    ),
    channel.guild,
  );
  await channel.send(outgoing).catch(() => { });
}

export = { LEVEL_ROLE_MAP, sendLevelUpMessage, sendLevelUpAnnouncement, scheduleEventLevelUpMessage };
