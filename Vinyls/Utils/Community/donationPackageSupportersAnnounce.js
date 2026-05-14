const { EmbedBuilder } = require("discord.js");
const { DIVIDER_URL } = require("../../../shared/discord/constants");
const IDs = require("../Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const DONATIONS_INFO_URL = "https://www.viniliecaffe.it/donazioni/";

const TIER_RANK = { donator: 1, vip: 2, vipPlus: 3 };
const ROLE_ID_BY_TIER = {
  donator: IDs.roles.Donator,
  vip: IDs.roles.VIP,
  vipPlus: IDs.roles.VIPplus,
};

function pickHighestNewPurchasedTier(oldMember, newMember) {
  let best = null;
  let bestRank = 0;
  for (const [tier, rank] of Object.entries(TIER_RANK)) {
    const rid = ROLE_ID_BY_TIER[tier];
    if (!rid) continue;
    if (newMember.roles.cache.has(rid) && !oldMember.roles.cache.has(rid) && rank > bestRank) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

function buildDonationPackageEmbed(tier, member) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  const roleMention = (id) => `<@&${id}>`;

  let perkBlock = "";
  if (tier === "donator") {
    perkBlock =
      `### <a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER AVER ACQUISTATO IL PACCHETTO DONATOR!__**\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `<:sparkledred:1470064814502973591> Permesso di allegare **link e immagini** in chat\n` +
      `<:sparkle:1470064801811140866> Permesso di usare le **Soundboard** di altri server\n` +
      `<:pinkstar:1470064804835229768> Permesso di mandare **sticker ed emoji** di altri server\n` +
      `<a:reddiamond:1443652837346377841> Bypass dei requisiti nei **giveaway**\n` +
      `<:moon:1470064812615667827> Permesso di cambiare il tuo **nickname**\n` +
      `<:blueflash:1470064803157643468> Sblocchi i **COLORI PLUS** in \`+profile\`\n` +
      `<a:reddiamond:1443652837346377841> Sblocchi il comando \`+quote\`\n` +
      "<:exp:1470067108543987846> X4 EXP boost\n" +
      "\n" +
      `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!";
  } else if (tier === "vip") {
    perkBlock =
      `### <a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER AVER ACQUISTATO IL PACCHETTO VIP!__**\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `<:sparkledred:1470064814502973591> Tutti i perks del ruolo ${roleMention(IDs.roles.Donator)}\n` +
      "<a:VC_Loading:1482526818278969578> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)\n" +
      "<a:VC_Flame:1482725674711126140> Possibilità di aggiungere reazioni ai messaggi in chat\n" +
      "<a:VC_Winner:1482535294757507255> Possibilità di creare una vocale privata per te e i tuoi amici\n" +
      "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)\n" +
      "<:VC_Color:1482532543273238569> Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te\n" +
      "<:exp:1470067108543987846> X5 EXP boost\n" +
      "\n" +
      `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!";
  } else {
    perkBlock =
      `### <a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER AVER ACQUISTATO IL PACCHETTO VIP+!__**\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `<:sparkledred:1470064814502973591> Tutti i perks del ruolo ${roleMention(IDs.roles.VIP)}\n` +
      "\n" +
      "<a:VC_Loading:1482526818278969578> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 1 secondo)\n" +
      "<:VC_Color:1482532543273238569> Sfondo personalizzato per la tua card del comando \`+rank\` sul sito\n" +
      "<a:VC_Winner:1482535294757507255> Possibilità di creare un secondo ruolo **custom** con colore **GRADIENTE** scelto da te\n" +
      "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)\n" +
      "<:exp:1470067108543987846> X6 EXP boost\n" +
      "\n" +
      `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!";
  }

  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(perkBlock)
    .setColor("#6f4e37")
    .setThumbnail(avatarUrl || null)
}

async function maybeAnnounceDonationPackageInSupporters(oldMember, newMember) {
  const mainId = String(IDs.guilds?.main || "");
  if (!mainId || String(newMember.guild.id) !== mainId) return;
  if (newMember.user?.bot) return;

  const tier = pickHighestNewPurchasedTier(oldMember, newMember);
  if (!tier) return;

  const channelId = IDs.channels?.supporters;
  if (!channelId) return;

  const channel =
    newMember.guild.channels.cache.get(channelId) || (await getGuildChannelCached(newMember.guild, channelId));
  if (!channel?.isTextBased?.()) return;

  const staffPing = String(IDs.roles?.Staff || "").trim();
  const content = staffPing
    ? `<a:ThankYou:1329504268369002507> \`|\`  ${newMember.user} \`|\` <@&${staffPing}>`
    : `<a:ThankYou:1329504268369002507> \`|\`  ${newMember.user}`;

  await channel
    .send({
      content,
      embeds: [buildDonationPackageEmbed(tier, newMember)],
    })
    .catch(() => null);
}

module.exports = { maybeAnnounceDonationPackageInSupporters };