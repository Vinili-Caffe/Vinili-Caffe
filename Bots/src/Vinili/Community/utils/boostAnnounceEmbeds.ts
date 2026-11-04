const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { MENTION_RESPONSE_PERK_LINE_DISCORD } = require("./mentionResponseAccessUtils") as typeof import("./mentionResponseAccessUtils");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const BOOST_ANNOUNCE_STAFF_PING_ROLE_ID = "1442568910070349985";

function buildBoostEmbed(member?, boostCount?) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(
      `### ${E.ThankYou} **__GRAZIE ${member.user} PER IL BOOST!__**\n` +
      "\n" +
      `${E.VC_Boost} **Boostando il server una volta hai sbloccato questi vantaggi:**\n` +
      `${E.sparkledred} Ruolo Server Booster con badge speciale\n` +
      `${E.VC_NewsExclamation} Permesso di cambiare il nickname\n` +
      `${E.moon} Permesso di allegare immagini e link in chat\n` +
      `${E.pinkstar} Permesso di mandare emoji e adesivi di altri server\n` +
      `${E.sparkle} Permesso di usare le Soundboard del server\n` +
      `${E.VC_Winner} Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te\n` +
      `${E.blueflash} Sblocchi i COLORI PLUS in [Personalizza](https://www.viniliecaffe.it/personalizza/)\n` +
      `${E.VC_CrownYellow} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)\n` +
      `${MENTION_RESPONSE_PERK_LINE_DISCORD}\n` +
      `${E.VC_Money} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)\n` +
      `${E.reddiamond} Sblocchi i comandi \`+quote\` e \`+repost\` (gestione dal profilo sul sito)\n` +
      `${E.exp} X2 EXP Boost\n` +
      "\n" +
      `${E.flyingnitroboost} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      `${E.VC_Link} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`,
    )
    .setColor("#826bc2")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostEmbedSecond(member?, boostCount?) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: accountUsername(member), iconURL: avatarUrl || undefined })
    .setDescription(
      `### ${E.ThankYou} **__GRAZIE ${member.user} PER IL DOPPIO BOOST!__**\n` +
      "\n" +
      `${E.VC_Boost} **Boostando il server due volte hai sbloccato questi vantaggi:**\n` +
      `${E.sparkledred} Ruolo Double Booster con badge speciale\n` +
      `${E.moon} Tutti i perks precedenti\n` +
      `${E.sparkle} Permesso di usare le Soundboard esterne\n` +
      `${E.VC_Color} Sfondo personalizzato per la tua card del comando \`+rank\`\n` +
      `${E.VC_Flame} Possibilità di aggiungere reazioni ai messaggi in chat\n` +
      `${E.blueflash} Possibilità di creare un secondo ruolo **custom** e un canale **vocale privato custom**\n` +
      `${E.VC_CrownYellow} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)\n` +
      `${MENTION_RESPONSE_PERK_LINE_DISCORD}\n` +
      `${E.VC_Money} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi)\n` +
      `${E.reddiamond} Bypass requisiti dei giveaway\n` +
      `${E.exp} X3 EXP Boost\n` +
      "\n" +
      `${E.flyingnitroboost} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      `${E.VC_Link} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`,
    )
    .setColor("#826bc2")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostAnnounceContent(user?) {
  return `${E.VC_Boost} \`|\`  ${user} \`|\` <@&${BOOST_ANNOUNCE_STAFF_PING_ROLE_ID}>`;
}

/** Payload per `channel.send` (Components V2 / embed classico). */
function buildBoostPayload(member?, boostCount?) {
  return { embeds: [buildBoostEmbed(member, boostCount)] };
}

function buildBoostPayloadSecond(member?, boostCount?) {
  return { embeds: [buildBoostEmbedSecond(member, boostCount)] };
}

export = {
  buildBoostPayload,
  buildBoostPayloadSecond,
  buildBoostAnnounceContent,
};