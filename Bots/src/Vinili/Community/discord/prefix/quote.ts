const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const renderQuoteCanvas = require("../../utils/Render/quoteCanvas") as typeof import("../../utils/Render/quoteCanvas");
const { nextQuoteCount } = require("../../utils/Quote/quoteCounter") as typeof import("../../utils/Quote/quoteCounter");
const { resolveQuotePostChannel } = require("../../utils/Quote/quotePostChannel") as typeof import("../../utils/Quote/quotePostChannel");
const { normalizeQuoteMessageText } = require("../../utils/Quote/normalizeQuoteMessageText") as typeof import("../../utils/Quote/normalizeQuoteMessageText");
const { registerQuoteBoardPost, buildQuoteBoardComponents } = require("../../utils/Quote/quoteBoardService") as typeof import("../../utils/Quote/quoteBoardService");
const { QuotePrivacy } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { accountUsername, memberDisplayName, memberLabelWithUsername, guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { isRepostDisabledInGuild } = require("../../services/repostService") as typeof import("../../services/repostService");
const { SITE_BOARD_CHANNEL, isBachecaSiteGuild, newBachecaItemId, buildBachecaLinkButton, putBachecaMedia, broadcastBachecaChanged } = require("../../../site/bacheca/bachecaSite") as typeof import("../../../site/bacheca/bachecaSite");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  getTenantBoardsSync,
  isTenantBoardFeatureEnabledSync,
} = require("../../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../../MultiGuild/core/tenantGuildSettings");

const QUOTE_DISABLED_MESSAGE = "Le quote sono disattivate su questo server.";

function buildQuotePostEmbed({ messageAuthorId, creatorId, totalPosts }) {
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(`${E.VC_Sparkles} Nuova quotazione ✨`)
    .setDescription(`${E.VC_Reply} Crea un post usando il comando **+quote** rispondendo al messaggio di un utente.`)
    .addFields(
      { name: "Messaggio di:", value: `<@${messageAuthorId}>` },
      { name: "Creato da:", value: `<@${creatorId}>` },
    )
    .setFooter({ text: `Post totali: ${totalPosts}` });
}

export = {
  name: "quote",
  allowEmptyArgs: true,
  async execute(message?) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.vegax} Questo comando può essere usato solo in un server.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (!isTenantBoardFeatureEnabledSync(message.guild.id, "quote")) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`${E.vegax} ${QUOTE_DISABLED_MESSAGE}`),
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
              `${E.vegax} Devi rispondere a un messaggio per usare questo comando.`,
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
              `${E.vegax} Impossibile trovare il messaggio selezionato.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const text = normalizeQuoteMessageText(targetMessage);
    const author = targetMessage.author;
    const displayName =
      memberDisplayName(targetMessage.member, author) || accountUsername(author);
    if (!author || !text) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.vegax} Il messaggio selezionato non ha testo.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const quoteUserLabel = memberLabelWithUsername(targetMessage.member, author) || displayName;

    try {
      const privacy=await (QuotePrivacy.findOne({guildId:message.guild.id,userId:author.id,}) as any);
      if (privacy?.blocked) {
        const dateText=new Date().toLocaleString("it-IT",{timeZone:"Europe/Rome",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",});
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("#ed4245")
              .setTitle(`${E.VC_Unlock} Quote bloccate`)
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
      const guild = message.guild;
      const boards = getTenantBoardsSync(guild?.id);
      const style = boards?.quoteStyle;
      const avatarMode = String(style?.avatarMode || "dynamic").toLowerCase() === "static" ? "static" : "dynamic";
      const coverImageUrl =
        (avatarMode === "dynamic"
          ? guildMemberDisplayAvatarUrlDynamic(targetMessage.member || author, { size: 512 })
          : guildMemberDisplayAvatarUrlStatic(targetMessage.member || author, { size: 512 })) || "";
      const out = await renderQuoteCanvas({
        coverImageUrl,
        message: text,
        username: quoteUserLabel,
        style,
      });
      buffer = out.buffer;
      quoteFormat = out.format === "gif" ? "gif" : "png";
    } catch {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `${E.vegax} Impossibile creare il canvas.`,
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
              `${E.vegax} Contatore quote non disponibile. Riprova tra poco.`,
            ),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const attachment = new AttachmentBuilder(buffer, { name: quoteFormat === "gif" ? "quote.gif" : "quote.png" });
    /* bachecaSite1: sul server principale la quote va sulla Bacheca del sito, non nel canale */
    const siteBoard = isBachecaSiteGuild(message.guild.id);
    const siteItemId = siteBoard ? newBachecaItemId() : "";
    const quoteChannel = siteBoard ? null : await resolveQuotePostChannel(message.guild);
    const embedDescription = siteBoard
      ? `${E.VC_Sparkles} La quote è appesa in **Bacheca** sul sito!`
      : quoteChannel
        ? `${E.VC_Sparkles} Puoi trovare il post creato nel canale: <#${quoteChannel.id}>!`
        : `${E.VC_Sparkles} Quote pubblicata in questo canale.`;
    const embed = new EmbedBuilder()
      .setColor(TENANT_EMBED_COLOR)
      .setDescription(embedDescription)
      .addFields({
        name: "📸 Totale immagini generate:",
        value: String(totalPosts),
      });

    const replyMsg=await safeMessageReply(message,{files:[attachment],embeds:[embed],allowedMentions:{repliedUser:false},});
    if (replyMsg?.id && (siteBoard || !isRepostDisabledInGuild(message.guild.id))) {
      const repostRow = new ActionRowBuilder();
      if (!isRepostDisabledInGuild(message.guild.id)) {
        repostRow.addComponents(
          new ButtonBuilder()
            .setCustomId(`repost_src:${message.channel.id}:${replyMsg.id}:${author.id}`)
            .setLabel("Reposta")
            .setEmoji("1443652837346377841")
            .setStyle(ButtonStyle.Secondary),
        );
      }
      if (siteBoard) repostRow.addComponents(buildBachecaLinkButton(siteItemId));
      await replyMsg.edit({ components: [repostRow as any] }).catch(() => {});
    }

    if (siteBoard) {
      const fileName = quoteFormat === "gif" ? "quote.gif" : "quote.png";
      const cdnUrl = await putBachecaMedia("quote", siteItemId, fileName, buffer, quoteFormat === "gif" ? "image/gif" : "image/png");
      const replyImageUrl =
        [...(replyMsg?.attachments?.values?.() || [])].find((att?) => /\.(png|gif)(\?|$)/i.test(String(att?.name || att?.url || "")))?.url || "";
      await registerQuoteBoardPost({
        guildId: message.guild.id,
        creatorUserId: message.author.id,
        quotedUserId: author.id,
        boardChannelId: SITE_BOARD_CHANNEL,
        boardMessageId: siteItemId,
        originChannelId: message.channel.id,
        originMessageId: replyMsg?.id || "0",
        imageUrl: cdnUrl || replyImageUrl,
        quotedUsername: quoteUserLabel,
        totalPosts,
      }).catch(() => null);
      broadcastBachecaChanged("new", siteItemId);
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
      const removeOnly = buildQuoteBoardComponents({
        guildId: message.guild.id,
        creatorUserId: message.author.id,
        originChannelId,
        originMessageId,
        boardChannelId: "",
        boardMessageId: "",
        quotedUserId: author.id,
      });
      const boardMsg = await quoteChannel
        .send({
          files: [postAttachment],
          embeds: [postEmbed],
          components: removeOnly,
        })
        .catch(() => null);
      if (boardMsg?.id) {
        const boardComponents = buildQuoteBoardComponents({
          guildId: message.guild.id,
          creatorUserId: message.author.id,
          originChannelId,
          originMessageId,
          boardChannelId: quoteChannel.id,
          boardMessageId: boardMsg.id,
          quotedUserId: author.id,
        });
        if (boardComponents.length) {
          const attachments = [...(boardMsg.attachments?.values() || [])]
            .map((att?) => String(att?.id || "").trim())
            .filter((id?) => /^\d{16,20}$/.test(id))
            .map((id?) => ({ id }));
          await boardMsg
            .edit({
              components: boardComponents,
              ...(attachments.length ? { attachments } : {}),
            })
            .catch(() => null);
        }
        const imageUrl =
          [...(boardMsg.attachments?.values() || [])].find((att?) =>
            /\.(png|jpe?g|gif|webp)(\?|$)/i.test(String(att?.name || att?.url || "")),
          )?.url || "";
        await registerQuoteBoardPost({
          guildId: message.guild.id,
          creatorUserId: message.author.id,
          quotedUserId: author.id,
          boardChannelId: quoteChannel.id,
          boardMessageId: boardMsg.id,
          originChannelId,
          originMessageId,
          imageUrl,
          quotedUsername: quoteUserLabel,
          totalPosts,
        }).catch(() => null);
      }
    }

    return replyMsg;
  },
};