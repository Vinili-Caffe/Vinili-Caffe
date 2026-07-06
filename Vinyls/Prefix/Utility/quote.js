const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const renderQuoteCanvas = require("../../Utils/Render/quoteCanvas");
const { nextQuoteCount } = require("../../Utils/Quote/quoteCounter");
const { resolveQuotePostChannel } = require("../../Utils/Quote/quotePostChannel");
const { normalizeQuoteMessageText } = require("../../Utils/Quote/normalizeQuoteMessageText");
const { QuotePrivacy } = require("../../Schemas/Community/communitySchemas");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { isRepostDisabledInGuild } = require("../../Services/Community/repostService");

function buildQuotePostEmbed({ messageAuthorId, creatorId, totalPosts }) {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Sparkles:1468546911936974889> Nuova quotazione ✨")
    .setDescription("<:VC_Reply:1482532158080942191> Crea un post usando il comando **+quote** rispondendo al messaggio di un utente.")
    .addFields(
      { name: "Messaggio di:", value: `<@${messageAuthorId}>` },
      { name: "Creato da:", value: `<@${creatorId}>` },
    )
    .setFooter({ text: `Post totali: ${totalPosts}` });
}

module.exports = {
  name: "quote",
  allowEmptyArgs: true,
  async execute(message) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Questo comando può essere usato solo in un server.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const refId = message.reference?.messageId;
    if (!refId) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Devi rispondere a un messaggio per usare questo comando.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const targetMessage=await message.channel.messages.fetch(refId).catch(() => null);
    if (!targetMessage) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Impossibile trovare il messaggio selezionato.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const text = normalizeQuoteMessageText(targetMessage);
    const author = targetMessage.author;
    const displayName = targetMessage.member?.displayName || author?.username;
    if (!author || !text) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Il messaggio selezionato non ha testo.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const quoteUserLabel = accountUsername(author) || displayName;

    try {
      const privacy=await QuotePrivacy.findOne({guildId:message.guild.id,userId:author.id,});
      if (privacy?.blocked) {
        const dateText=new Date().toLocaleString("it-IT",{timeZone:"Europe/Rome",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",});
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#ed4245")
              .setTitle("<a:VC_Unlock:1482532082466029608> Quote bloccate")
              .setDescription(
                [
                  `**${quoteUserLabel}** ha bloccato le quote dei propri messaggi.`,
                  "",
                  "**Rispetta la privacy**",
                  "L'utente ha scelto di non essere quotato. Rispetta questa decisione!",
                ].join("\n"),
              )
              .setFooter({
                text: `Se hai bisogno di condividere il messaggio, usa un screenshot o chiedi il permesso diretto. ${dateText}`,
              }),
          ],
          allowedMentions: { repliedUser: false },
        });
      }
    } catch (err) {
      global.logger?.warn?.("[quote] ", err?.message || err);
    }

    let buffer;
    let quoteFormat = "png";
    try {
      const footerText = String(message.client?.config?.botServerInvite || "").replace(/^https?:\/\//i, "").trim();
      const guild = message.guild;
      const coverImageUrl =
        guildMemberDisplayAvatarUrlDynamic(targetMessage.member || author, { size: 512 }) || "";
      const out = await renderQuoteCanvas({
        coverImageUrl,
        message: text,
        username: quoteUserLabel,
        footerText,
      });
      buffer = out.buffer;
      quoteFormat = out.format === "gif" ? "gif" : "png";
    } catch {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Impossibile creare il canvas.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    let totalPosts;
    try {
      totalPosts = await nextQuoteCount(message.guild.id);
    } catch (err) {
      global.logger?.warn?.("[quote] counter failed:", err?.message || err);
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Contatore quote non disponibile. Riprova tra poco.",
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const attachment = new AttachmentBuilder(buffer, { name: quoteFormat === "gif" ? "quote.gif" : "quote.png" });
    const quoteChannel = await resolveQuotePostChannel(message.guild);
    const embedDescription = quoteChannel
      ? `<a:VC_Sparkles:1468546911936974889> Puoi trovare il post creato nel canale: <#${quoteChannel.id}>!`
      : "<a:VC_Sparkles:1468546911936974889> Quote pubblicata in questo canale.";
    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setDescription(embedDescription)
      .addFields({
        name: "📸 Totale immagini generate:",
        value: String(totalPosts),
      });

    const replyMsg=await safeMessageReply(message,{files:[attachment],embeds:[embed],allowedMentions:{repliedUser:false},});
    if (replyMsg?.id && !isRepostDisabledInGuild(message.guild.id)) {
      const repostRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`repost_src:${message.channel.id}:${replyMsg.id}:${author.id}`)
          .setLabel("Reposta")
          .setEmoji("1443652837346377841")
          .setStyle(ButtonStyle.Secondary),
      );
      await replyMsg.edit({ components: [repostRow] }).catch(() => {});
    }

    if (
      quoteChannel?.isTextBased?.() &&
      typeof quoteChannel.send === "function" &&
      quoteChannel.id !== message.channel.id
    ) {
      const postAttachment = new AttachmentBuilder(buffer, {
        name: quoteFormat === "gif" ? "quote.gif" : "quote.png",
      });
      const postEmbed=buildQuotePostEmbed({messageAuthorId:author.id,creatorId:message.author.id,totalPosts,});
      const originChannelId = message.channel.id;
      const originMessageId = replyMsg?.id || "0";
      const rowButtons = [
        new ButtonBuilder()
          .setCustomId(`quote_remove:${message.author.id}:${originChannelId}:${originMessageId}`)
          .setLabel("Rimuovi questa quote")
          .setEmoji("🗑️")
          .setStyle(ButtonStyle.Danger),
      ];
      const removeRow = new ActionRowBuilder().addComponents(...rowButtons);
      await quoteChannel
        .send({
          files: [postAttachment],
          embeds: [postEmbed],
          components: [removeRow],
        })
        .catch(() => {});
    }

    return replyMsg;
  },
};