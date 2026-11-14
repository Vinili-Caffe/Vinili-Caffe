const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { accountUsername, resolveEmbedUserAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { shouldSendPublicMemberAnnouncement } = require("./memberPublicAnnouncementGate") as typeof import("./memberPublicAnnouncementGate");
const { MENTION_RESPONSE_PERK_LINE_DISCORD } = require("./mentionResponseAccessUtils") as typeof import("./mentionResponseAccessUtils");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SUPPORTERS_CHANNEL_ID = IDs.channels?.supporters;
const PERKS_PAGE_URL = "https://viniliecaffe.it/perks/";
const LEVEL_MILESTONE_MAP = new Map([
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

function buildPerkBlockLines(level?) {
  const L = Number(level);
  const lines = [];
  if (L === 10) {
    lines.push(
      `${E.moon} Permesso di **cambiare nickname**`,
      `${E.pinkstar} Permesso di **allegare link e immagini** in chat`,
      `${E.VC_Money} Permesso di inviare **messaggi vocali** in chat`,
      `${E.reddiamond} Sblocchi i comandi **\`+quote\`** e **\`+repost\`** (gestione dal profilo sul sito)`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv10}>`,
    );
  } else if (L === 20) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.pinkstar} Possibilità di **aggiungere reazioni** ai messaggi in chat`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv20}>`,
    );
  } else if (L === 30) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.VC_NewsExclamation} Permesso di usare le **Soundboard di altri server**`,
      `${E.VC_Money} Cooldown comandi del bot **30s → 15s**`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv30}>`,
    );
  } else if (L === 50) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.VC_Winner} Possibilità di creare un ruolo custom e un canale vocale privato custom tramite la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/)`,
      `${E.VC_Money} Cooldown comandi del bot **30s → 5s**`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv50}>`,
    );
  } else if (L === 70) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.pinkstar} **Sticker ed emoji** di altri server`,
      `${E.VC_CrownYellow} **Reazioni** quando ti @menzionano in chat (max. **3**)`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv70}>`,
    );
  } else if (L === 100) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.VC_Money} Cooldown comandi del bot **30s → 1s**`,
      `${E.blueflash} **Bypass requisiti** delle candidature`,
      `${E.exp} Bonus **EXP permanente +15%**`,
      MENTION_RESPONSE_PERK_LINE_DISCORD,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv100}>`,
    );
  } else if (L === 125) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.VC_Winner} **Bypass requisiti** dei giveaway`,
      `${E.exp} Bonus **EXP permanente +20%**`,
      `${E.VC_Winner} Possibilità di creare un secondo ruolo custom tramite la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/)`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.orangeBlackPlus}>`,
    );
  } else if (L === 150) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.exp} Bonus **EXP permanente +25%**`,
      `${E.VC_Winner} **Decorazione a scelta** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.greenBlackPlus}>`,
    );
  } else if (L === 200) {
    lines.push(
      `${E.sparkle} Tutte le ricompense dei livelli precedenti`,
      `${E.VC_NewsExclamation} **Nitro Boost mensile** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}`,
      `${E.VC_Color} Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.aquaBlackPlus}>`,
    );
  }
  return lines;
}

async function buildLevelMilestoneSupportersEmbed(member?, level?, roleId?) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const perkLines = buildPerkBlockLines(level);
  const perkBlock = perkLines.length ? `${perkLines.join("\n")}\n` : "";
  const roleLine = roleId ? `<@&${roleId}>` : `livello **${level}**`;
  const description =
    `### ${E.ThankYou} **__COMPLIMENTI ${member.user}!__**\n` +
    "\n" +
    `${E.exp} **Hai raggiunto il livello \`${level}\`** e il ruolo ${roleLine}.\n` +
    "\n" +
    `${E.VC_LevelUp} **Hai sbloccato i seguenti vantaggi:**\n` +
    "\n" +
    perkBlock +
    "\n" +
    `${E.flyingnitroboost} **Grazie** per essere attivo/a su **Vinili & Caffè**!\n` +
    "\n" +
    `${E.VC_Link} Dettaglio completo: [viniliecaffe.it/perks](<${PERKS_PAGE_URL}>)`;
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(description)
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(avatarUrl || null);
}

function buildLevelMilestoneSupportersAnnounceContent(user?) {
  return `${E.VC_LevelUp} \`|\`  ${user}`;
}

async function trySendDashboardMilestoneToSupporters(guild?, member?, level?, roleId?, alreadyPostedChannelId?) {
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
    const { applyPronounGenderToPayload } = require("./pronounGenderUtils") as typeof import("./pronounGenderUtils");
    const { formatMemberMention } = require("../../Level/services/expLevels") as typeof import("../../Level/services/expLevels");
    const { memberDisplayName, resolveEmbedUserAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

    const cfg = await LVL.getConfig(String(guild.id));
    if (!(cfg.userSaved || cfg.seedVersion > 0)) return false;
    /* Dashboard › Livelli › Annunci › Vantaggi sbloccati */
    if (cfg.perksEnabled === false || T.draftIsEmpty?.(cfg.perksDraft)) return true;
    void alreadyPostedChannelId;
    const perksChannelId = String(cfg.perksChannelId || SUPPORTERS_CHANNEL_ID || "");
    const channel = guild.channels.cache.get(perksChannelId) || (await getGuildChannelCached(guild, perksChannelId));
    if (!channel?.isTextBased?.()) return false;
    const reward = (cfg.roleRewards || []).find((r: any) => Number(r.level) === Number(level));
    const perklist = typeof reward?.perks === "string" ? reward.perks : buildPerkBlockLines(level).join("\n");

    const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
    const vars = {
      user: formatMemberMention(member),
      username: memberDisplayName(member),
      level: String(level || 0),
      avatar: String(avatarUrl || ""),
      role: roleId ? `<@&${roleId}>` : "",
      roleid: String(roleId || ""),
      perks: `<#${perksChannelId}>`,
      perklist: perklist || "—",
      server: String(guild.name || ""),
    };
    const body: any = T.buildMessageBody(cfg.perksDraft, vars, [], { mentionUserId: member.id });
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

async function sendLevelMilestoneSupportersAnnouncement(guild?, member?, level?, roleId?, opts: { alreadyPostedChannelId?: string | null } = {}) {
  if (!guild || !member?.user || !SUPPORTERS_CHANNEL_ID) return;
  if (String(guild.id) !== MAIN_GUILD_ID) return;
  if (!Number.isFinite(Number(level)) || Number(level) < 1) return;
  if (!roleId) return;
  const allow = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
  if (!allow) return;
  try {
    const A = require("../../../MultiGuild/services/announcementsRuntime") as typeof import("../../../MultiGuild/services/announcementsRuntime");
    if (await A.roleRuleHandles(guild.id, roleId)) return;
    if (await A.trySendConfiguredRoleAnnounce(guild.client, member, roleId, { fallbackChannelId: SUPPORTERS_CHANNEL_ID })) {
      return;
    }
  } catch (_) {}
  /* dashboard Livelli seedata → solo milestoneDraft (niente embed perk hardcoded) */
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg = await LVL.getConfig(String(guild.id));
    if (cfg && (cfg.userSaved || cfg.seedVersion > 0)) {
      await trySendDashboardMilestoneToSupporters(guild, member, level, roleId, opts.alreadyPostedChannelId);
      return;
    }
  } catch (_) {}
  const channel =
    guild.channels.cache.get(SUPPORTERS_CHANNEL_ID) || (await getGuildChannelCached(guild, SUPPORTERS_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return;
  const embed = await buildLevelMilestoneSupportersEmbed(member, level, roleId);
  await channel
    .send({
      content: buildLevelMilestoneSupportersAnnounceContent(member.user),
      embeds: [embed],
    })
    .catch(() => null);
}

async function recoverLevelMilestoneSupportersAnnouncesOnStartup(client?, opts: Record<string, any> = {}) {
  const {
    isRecoveryPrimaryShard,
    DEFAULT_RECOVERY_LOOKBACK_MS,
    EMBED_DEDUPE_LOOKBACK_MS,
    botSupportersEmbedExistsForUser,
    recoverySleep,
  } = require("./supportersChannelEmbedRecoveryUtils") as typeof import("./supportersChannelEmbedRecoveryUtils");
  const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
  const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!MAIN_GUILD_ID) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const lookbackMs = Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || DEFAULT_RECOVERY_LOOKBACK_MS)));
  const limit = Math.max(1, Math.min(50, Number(opts.limit || 25)));
  const minTs = Date.now() - lookbackMs;
  const embedSinceMs = Date.now() - EMBED_DEDUPE_LOOKBACK_MS;
  const channel =
    guild.channels.cache.get(SUPPORTERS_CHANNEL_ID) || (await getGuildChannelCached(guild, SUPPORTERS_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "no_channel" };
  const botId = String(client.user?.id || "");
  const milestoneLevels = [...LEVEL_MILESTONE_MAP.keys()];
  const docs = await ActivityUserProfile.find({ guildId: MAIN_GUILD_ID, "profile.totals.exp.level": { $gte: 10 } })
    .select("userId profile.totals.exp.levelHistory")
    .limit(500)
    .lean()
    .catch(() => []);
  const pending = [];
  for (const doc of docs) {
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    const history = Array.isArray(doc?.profile?.totals?.exp?.levelHistory) ? doc.profile.totals.exp.levelHistory : [];
    for (const entry of history) {
      const at = new Date(entry?.createdAt || 0).getTime();
      if (!Number.isFinite(at) || at < minTs) continue;
      const afterLevel = Math.floor(Number(entry?.afterLevel || 0));
      const beforeLevel = Math.floor(Number(entry?.beforeLevel || 0));
      if (!milestoneLevels.includes(afterLevel) || afterLevel <= beforeLevel) continue;
      pending.push({ userId: uid, level: afterLevel, at });
    }
  }
  pending.sort((a?, b?) => Number(b.at || 0) - Number(a.at || 0));
  const seen = new Set();
  let recovered = 0;
  for (const row of pending) {
    if (recovered >= limit) break;
    const key = `${row.userId}:${row.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const roleId = LEVEL_MILESTONE_MAP.get(row.level);
    if (!roleId) continue;
    const exists = await botSupportersEmbedExistsForUser(channel, row.userId, botId, embedSinceMs, (blob?) =>
      new RegExp(`livello\\s*[\`']?${row.level}[\`']?|leveled up|<@&${roleId}>`, "i").test(blob),
    );
    if (exists) continue;
    const member = await getGuildMemberCached(guild, row.userId, { preferFresh: true }).catch(() => null);
    if (!member) continue;
    await sendLevelMilestoneSupportersAnnouncement(guild, member, row.level, roleId);
    recovered += 1;
    global.logger?.info?.("[level-milestone-recovery] announce:", row.userId, row.level);
    await recoverySleep(450);
  }
  if (recovered > 0) global.logger?.info?.("[level-milestone-recovery] done:", recovered);
  return { ok: true, recovered };
}

export = {
  buildPerkBlockLines,
  sendLevelMilestoneSupportersAnnouncement,
  recoverLevelMilestoneSupportersAnnouncesOnStartup,
};