const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { shouldSendPublicMemberAnnouncement } = require("./memberPublicAnnouncementGate");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SUPPORTERS_CHANNEL_ID = IDs.channels?.supporters;
const PERKS_PAGE_URL = "https://viniliecaffe.it/perks/";

function buildPerkBlockLines(level) {
  const L = Number(level);
  const lines = [];
  if (L === 10) {
    lines.push(
      "<:moon:1470064812615667827> Permesso di **cambiare nickname**",
      "<:pinkstar:1470064804835229768> Permesso di **allegare link e immagini** in chat",
      "<a:VC_Money:1482724694699278487> Permesso di inviare **messaggi vocali** in chat",
      "<a:reddiamond:1443652837346377841> Sblocchi il comando **`+quote`**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv10}>`,
    );
  } else if (L === 20) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:VC_Dot:1482532364222595303> Possibilità di **scrivere in gigante**",
      "<:pinkstar:1470064804835229768> Possibilità di **aggiungere reazioni** ai messaggi in chat",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv20}>`,
    );
  } else if (L === 30) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_NewsExclamation:1471891662786527253> Permesso di usare le **Soundboard di altri server**",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 15s**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv30}>`,
    );
  } else if (L === 50) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_Winner:1482535294757507255> **Ruolo custom** e **vocale privata custom** permanenti (`+profile`)",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 5s**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv50}>`,
    );
  } else if (L === 70) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:pinkstar:1470064804835229768> **Sticker ed emoji** di altri server",
      "<a:VC_CrownYellow:1482706085440651428> **Reazioni** quando ti @menzionano in chat (max. **3**)",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv70}>`,
    );
  } else if (L === 100) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_Money:1482724694699278487> Cooldown comandi del bot **30s → 1s**",
      "<a:VC_Winner:1482535294757507255> **Bypass requisiti** dei giveaway",
      "<:blueflash:1470064803157643468> **Bypass requisiti** delle candidature",
      "<:exp:1470067108543987846> Bonus **EXP permanente +15%**",
      `<:VC_Color:1482532543273238569> Nuovo **colore gradiente** con \`+profile\` <@&${IDs.roles.colorUnlockLv100}>`,
    );
  } else if (L === 125) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:exp:1470067108543987846> Ruolo milestone **༄ Funk¹²⁵⁺**",
      "<:exp:1470067108543987846> Bonus **EXP permanente +20%**",
      "<a:VC_Winner:1482535294757507255> Sblocchi il **secondo custom role**",
      `<:VC_Color:1482532543273238569> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.orangeBlackPlus}>`,
    );
  } else if (L === 150) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<:exp:1470067108543987846> Ruolo milestone **༄ Blues¹⁵⁰⁺**",
      "<:exp:1470067108543987846> Bonus **EXP permanente +25%**",
      `<:VC_Color:1482532543273238569> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.greenBlackPlus}>`,
    );
  } else if (L === 200) {
    lines.push(
      "<:sparkle:1470064801811140866> Tutte le ricompense dei livelli precedenti",
      "<a:VC_NewsExclamation:1471891662786527253> **Nitro Boost mensile** riscattabile tramite ticket **HIGH STAFF**",
      "<:exp:1470067108543987846> Ruolo milestone **༄ Indie²⁰⁰⁺**",
      `<:VC_Color:1482532543273238569> Nuovo **Plus combo Black** con \`+profile\` <@&${IDs.roles.aquaBlackPlus}>`,
    );
  }
  return lines;
}

function buildLevelMilestoneSupportersEmbed(member, level, roleId) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
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
    `<:VC_Logo:1498073401317916803> Dettaglio completo: [viniliecaffe.it/perks](<${PERKS_PAGE_URL}>)`;
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(description)
    .setColor("#6f4e37")
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
  const embed = buildLevelMilestoneSupportersEmbed(member, level, roleId);
  await channel
    .send({
      content: buildLevelMilestoneSupportersAnnounceContent(member.user),
      embeds: [embed],
    })
    .catch(() => null);
}

module.exports = {
  buildLevelMilestoneSupportersEmbed,
  buildLevelMilestoneSupportersAnnounceContent,
  sendLevelMilestoneSupportersAnnouncement,
};