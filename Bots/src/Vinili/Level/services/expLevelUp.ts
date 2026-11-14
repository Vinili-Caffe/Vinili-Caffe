/** EXP: messaggi di passaggio di livello e dei perk. */
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached, getClientGuildCached, getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { sendLevelMilestoneSupportersAnnouncement } = require("../../Community/utils/levelMilestoneSupportersAnnounceEmbeds") as typeof import("../../Community/utils/levelMilestoneSupportersAnnounceEmbeds");
const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { isLevelExpGuild, formatMemberMention, repairExpTotals, resolveLevelUpAnnounceLevel } = require("./expLevels") as typeof import("./expLevels");
const { memberDisplayName, resolveEmbedUserAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const VINILI_EMBED_COLOR_INT = 0x826bc2;
const LEVEL_UP_CHANNEL_ID = IDs.channels.commands;
const PERKS_CHANNEL_ID = IDs.channels.supporters;
/** Fallback se la dashboard non ha ancora i ruoli premio. */
const LEVEL_ROLE_MAP = new Map([
  [10, IDs.roles.Level10],
  [20, IDs.roles.Level20],
  [30, IDs.roles.Level30],
  [50, IDs.roles.Level50],
  [70, IDs.roles.Level70],
  [100, IDs.roles.Level100],
  [125, IDs.roles.Level120],
  [150, IDs.roles.Level150],
  [200, IDs.roles.Level200],
]);

async function getLevelRoleMap(guildId?) {
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg = await LVL.getConfig(String(guildId || ""));
    if (cfg?.roleRewards?.length) return LVL.roleRewardMap(cfg);
  } catch (_) {}
  return LEVEL_ROLE_MAP;
}

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

async function resolveLevelUpChannel(guild?, preferredId?) {
  if (!guild) return null;
  const id = String(preferredId || LEVEL_UP_CHANNEL_ID || "").trim();
  if (!id) return null;
  const client = guild.client;
  return guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id)) || (client ? await getClientChannelCached(client, id) : null);
}

async function levelUpVars(member?, level?, roleId = "", perksChannelId = "") {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const name = memberDisplayName(member);
  const mention = formatMemberMention(member);
  const perks = /^\d{16,22}$/.test(String(perksChannelId || "")) ? `<#${perksChannelId}>` : "";
  return {
    user: mention,
    username: name,
    level: String(level || 0),
    avatar: String(avatarUrl || ""),
    role: roleId ? `<@&${roleId}>` : "",
    roleid: String(roleId || ""),
    perks,
    server: String(member?.guild?.name || ""),
  };
}

async function sendDashboardLevelUp(guild?, member?, level?, opts: { roleId?: string; milestone?: boolean } = {}) {
  if (!guild || !member) return false;
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg = await LVL.getConfig(guild.id);
    const channel = await resolveLevelUpChannel(guild, cfg.levelUpChannelId);
    if (!channel) return false;
    const draft = opts.milestone ? cfg.milestoneDraft : cfg.levelUpDraft;
    if (T.draftIsEmpty?.(draft)) return false;
    const vars = await levelUpVars(member, level, opts.roleId || "", PERKS_CHANNEL_ID);
    const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId: member.id });
    const { applyPronounGenderToPayload } = require("../../Community/utils/pronounGenderUtils") as typeof import("../../Community/utils/pronounGenderUtils");
    const outgoing = applyDefaultFooterToEmbeds(
      applyPronounGenderToPayload(
        {
          content: body.content,
          embeds: body.embeds,
          components: body.components,
          flags: body.flags,
          allowedMentions: body.allowed_mentions,
        },
        member,
      ),
      guild,
    );
    await channel.send(outgoing).catch(() => null);
    return true;
  } catch (_) {
    return false;
  }
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
          `${E.VC_PandaClap} **Complimenti ${formatMemberMention(member)}!**`,
          `${E.VC_LevelUp2} Hai appena __raggiunto__ il **livello** \`${level}\``,
          `${E.VC_HelloKittyGift} __Continua__ ad essere **attivo** in __chat__ e in __vocale__ per avanzare di _livello_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendLevelUpMessage(guild?, member?, level?) {
  if (!guild || !member) return;
  if (await sendDashboardLevelUp(guild, member, level, { milestone: false })) return;
  const channel = await resolveLevelUpChannel(guild, null);
  if (!channel) return;
  const payload = await buildLevelUpEmbed(member, level);
  await sendLevelUpPayload(channel, member, payload);
}

async function sendLevelUpAnnouncement(guild?, member?, level?) {
  if (!guild || !member || !Number.isFinite(level) || level < 1) return;
  if (!isLevelExpGuild(guild.id)) return;
  const map = await getLevelRoleMap(guild.id);
  if (map.has(level)) {
    const roleId = map.get(level);
    await sendPerksLevelMessage(guild, member, level, roleId);
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
          `${E.VC_PandaClap} **Complimenti ${formatMemberMention(member)}!**`,
          `${E.VC_LevelUp2} Hai appena __raggiunto__ il <@&${roleId}>`,
          `${E.VC_HelloKittyGift} __Controlla__ <#${PERKS_CHANNEL_ID}> per sapere i nuovi **vantaggi** che hai _sbloccato_!`,
        ].join("\n"),
      },
    ],
  };
}

async function sendPerksLevelMessage(guild?, member?, level?, roleIdHint?) {
  const map = await getLevelRoleMap(guild?.id);
  const roleId = String(roleIdHint || map.get(level) || "").trim();
  if (!guild || !member || !roleId) return;
  if (await sendDashboardLevelUp(guild, member, level, { roleId, milestone: true })) return;
  const channel = await resolveLevelUpChannel(guild, null);
  if (!channel) return;
  const payload = await buildPerksLevelEmbed(member, level, roleId);
  await sendLevelUpPayload(channel, member, payload);
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
      const announceLevel = resolveLevelUpAnnounceLevel(Number(row.prevLevel) || 0, Number(row.level) || 0, snapshot);
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
  const { applyPronounGenderToPayload } = require("../../Community/utils/pronounGenderUtils") as typeof import("../../Community/utils/pronounGenderUtils");
  const outgoing = applyDefaultFooterToEmbeds(
    applyPronounGenderToPayload(
      {
        content: `${E.VC_LevelUp} ${formatMemberMention(member)} sei salito/a di livello!`,
        ...payload,
      },
      member,
    ),
    channel.guild,
  );
  await channel.send(outgoing).catch(() => {});
}

export = { LEVEL_ROLE_MAP, getLevelRoleMap, sendLevelUpAnnouncement, scheduleEventLevelUpMessage };
