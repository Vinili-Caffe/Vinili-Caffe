const { EmbedBuilder } = require("discord.js");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");
const IDs = require("../Config/ids");
const { accountUsername, resolveEmbedUserAvatarUrl } = require("../Discord/guildDiscordIdentity");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { shouldSendPublicMemberAnnouncement } = require("./memberPublicAnnouncementGate");
const { MENTION_RESPONSE_PERK_LINE_DISCORD } = require("./mentionResponseAccessUtils");
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

function buildPerkBlockLines(level) {
  const L = Number(level);
  const lines = [];
  if (L === 10) {
    lines.push(
      "<:moon:1470064812615667827> Permesso di **cambiare nickname**",
      "<:pinkstar:1470064804835229768> Permesso di **allegare link e immagini** in chat",
      "<a:VC_Money:1482724694699278487> Permesso di inviare **messaggi vocali** in chat",
      "<a:reddiamond:1443652837346377841> Sblocchi i comandi **`+quote`**, **`+repost`** e **`+myrepost`**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv10}>`,
    );
  } else if (L === 20) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:pinkstar:1470064804835229768> Possibilità di **aggiungere reazioni** ai messaggi in chat",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv20}>`,
    );
  } else if (L === 30) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_NewsExclamation:1471891662786527253> Permesso di usare le **Soundboard di altri server**",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 15s**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv30}>`,
    );
  } else if (L === 50) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_Winner:1482535294757507255> Possibilità di creare un ruolo custom e un canale vocale privato custom tramite la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/)",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 5s**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv50}>`,
    );
  } else if (L === 70) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:pinkstar:1470064804835229768> **Sticker ed emoji** di altri server",
      "<a:VC_CrownYellow:1482706085440651428> **Reazioni** quando ti @menzionano in chat (max. **3**)",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv70}>`,
    );
  } else if (L === 100) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 1s**",
      "<:blueflash:1470064803157643468> **Bypass requisiti** delle candidature",
      "<:exp:1470067108543987846> Bonus **EXP permanente +15%**",
      MENTION_RESPONSE_PERK_LINE_DISCORD,
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.colorUnlockLv100}>`,
    );
  } else if (L === 125) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_Winner:1482535294757507255> **Bypass requisiti** dei giveaway",
      "<:exp:1470067108543987846> Bonus **EXP permanente +20%**",
      "<a:VC_Winner:1482535294757507255> Possibilità di creare un secondo ruolo custom tramite la pagina [Personalizza](https://www.viniliecaffe.it/personalizza/)",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.orangeBlackPlus}>`,
    );
  } else if (L === 150) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:exp:1470067108543987846> Bonus **EXP permanente +25%**",
      `<a:VC_Winner:1482535294757507255> **Decorazione a scelta** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}`,
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.greenBlackPlus}>`,
    );
  } else if (L === 200) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      `<a:VC_NewsExclamation:1471891662786527253> **Nitro Boost mensile** riscattabile tramite ${siteTicketsPageDiscordRef("HIGH STAFF")}`,
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con [Personalizza](https://www.viniliecaffe.it/personalizza/) <@&${IDs.roles.aquaBlackPlus}>`,
    );
  }
  return lines;
}

async function buildLevelMilestoneSupportersEmbed(member, level, roleId) {
  const avatarUrl = await resolveEmbedUserAvatarUrl(member, { size: 256 });
  const perkLines = buildPerkBlockLines(level);
  const perkBlock = perkLines.length ? `${perkLines.join("\n")}\n` : "";
  const roleLine = roleId ? `<@&${roleId}>` : `livello **${level}**`;
  const description =
    `### <a:ThankYou:1329504268369002507> **__COMPLIMENTI ${member.user}!__**\n` +
    "\n" +
    `<:exp:1470067108543987846> **Hai raggiunto il livello \`${level}\`** e il ruolo ${roleLine}.\n` +
    "\n" +
    `<a:VC_LevelUp:1482527020641419415> **Hai sbloccato i seguenti vantaggi:**\n` +
    "\n" +
    perkBlock +
    "\n" +
    "<a:flyingnitroboost:1443652205705170986> **Grazie** per essere attivo/a su **Vinili & Caffè**!\n" +
    "\n" +
    `<:VC_Link:1482460590894088222> Dettaglio completo: [viniliecaffe.it/perks](<${PERKS_PAGE_URL}>)`;
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(description)
    .setColor(TENANT_EMBED_COLOR)
    .setThumbnail(avatarUrl || null);
}

function buildLevelMilestoneSupportersAnnounceContent(user) {
  return `<a:VC_LevelUp:1482527020641419415> \`|\`  ${user}`;
}

async function sendLevelMilestoneSupportersAnnouncement(guild, member, level, roleId) {
  if (!guild || !member?.user || !SUPPORTERS_CHANNEL_ID) return;
  if (String(guild.id) !== MAIN_GUILD_ID) return;
  if (!Number.isFinite(Number(level)) || Number(level) < 1) return;
  if (!roleId) return;
  const allow = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
  if (!allow) return;
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

async function recoverLevelMilestoneSupportersAnnouncesOnStartup(client, opts = {}) {
  const {
    isRecoveryPrimaryShard,
    DEFAULT_RECOVERY_LOOKBACK_MS,
    EMBED_DEDUPE_LOOKBACK_MS,
    botSupportersEmbedExistsForUser,
    recoverySleep,
  } = require("./supportersChannelEmbedRecoveryUtils");
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
  const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
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
  pending.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  const seen = new Set();
  let recovered = 0;
  for (const row of pending) {
    if (recovered >= limit) break;
    const key = `${row.userId}:${row.level}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const roleId = LEVEL_MILESTONE_MAP.get(row.level);
    if (!roleId) continue;
    const exists = await botSupportersEmbedExistsForUser(channel, row.userId, botId, embedSinceMs, (blob) =>
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

module.exports = {
  buildLevelMilestoneSupportersEmbed,
  buildLevelMilestoneSupportersAnnounceContent,
  sendLevelMilestoneSupportersAnnouncement,
  recoverLevelMilestoneSupportersAnnouncesOnStartup,
};