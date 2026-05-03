const { EmbedBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const BOOST_ANNOUNCE_STAFF_PING_ROLE_ID = "1442568910070349985";

function buildBoostEmbed(member, boostCount) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(
      `### <a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER IL BOOST!__**\n` +
      "\n" +
      `<a:VC_Boost:1482706171386269830> **Boostando il server una volta hai sbloccato questi vantaggi:**\n` +
      `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.ServerBooster}> con badge speciale\n` +
      `<a:VC_NewsExclamation:1471891662786527253> Permesso di cambiare il nickname\n` +
      `<:moon:1470064812615667827> Permesso di allegare immagini e link in chat\n` +
      `<:pinkstar:1470064804835229768> Permesso di mandare emoji e adesivi di altri server\n` +
      `<:sparkle:1470064801811140866> Permesso di usare le Soundboard del server\n` +
      "<a:VC_Winner:1482535294757507255> Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te\n" +
      "<:blueflash:1470064803157643468> Sblocchi i COLORI PLUS in `+colors`\n" +
      "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)\n" +
      "<a:VC_Money:1482724694699278487> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)\n" +
      "<a:reddiamond:1443652837346377841> Sblocchi il comando `+ quote`\n" +
      "<:exp:1470067108543987846> X2 EXP Boost\n" +
      "\n" +
      `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostEmbedSecond(member, boostCount) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(
      `### <a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER IL DOPPIO BOOST!__**\n` +
      "\n" +
      `<a:VC_Boost:1482706171386269830> **Boostando il server due volte hai sbloccato questi vantaggi:**\n` +
      `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.DoubleBooster}> con badge speciale\n` +
      "<:moon:1470064812615667827> Tutti i perks precedenti\n" +
      "<:sparkle:1470064801811140866> Permesso di usare le Soundboard esterne\n" +
      "<:VC_Color:1482532543273238569> Sfondo personalizzato per la tua card del comando `+rank`\n" +
      "<a:VC_Flame:1482725674711126140> Possibilità di aggiungere reazioni ai messaggi in chat\n" +
      "<:blueflash:1470064803157643468> Possibilità di creare un secondo ruolo **custom** e un canale **vocale privato custom**\n" +
      "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)\n" +
      "<a:VC_Money:1482724694699278487> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi)\n" +
      "<a:reddiamond:1443652837346377841> Bypass requisiti dei giveaway\n" +
      "<:exp:1470067108543987846> X3 EXP Boost\n" +
      "\n" +
      `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostAnnounceContent(user) {
  return `<a:VC_Boost:1482706171386269830> \`|\`  ${user} \`|\` <@&${BOOST_ANNOUNCE_STAFF_PING_ROLE_ID}>`;
}

module.exports = {
  buildBoostEmbed,
  buildBoostEmbedSecond,
  buildBoostAnnounceContent,
};