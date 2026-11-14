const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType, } = require("discord.js") as typeof import("discord.js");
const { skullboardFindOneLean, skullboardUpsert } = require("../../Community/services/globalSettingsGuildStores") as typeof import("../../Community/services/globalSettingsGuildStores");
const { handleMinigameReaction } = require("../../Minigames/services/minigameService") as typeof import("../../Minigames/services/minigameService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { cacheRoleIcon } = require("../../../shared/cache/roleIconCache") as typeof import("../../../shared/cache/roleIconCache");
const { guildMemberDisplayAvatarUrlDynamic, memberDisplayName } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { resolveCanvasDiscordMarkup } = require("../../Community/utils/Render/resolveCanvasDiscordText") as typeof import("../../Community/utils/Render/resolveCanvasDiscordText");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
    return check(guildId);
  } catch {
    return true;
  }
}

const SKULL_EMOJI = "\u{1F480}";
const SKULL_SOURCE_WHITELIST_CHANNEL_IDS = new Set(
  [IDs.channels.chat, IDs.channels.media, IDs.channels.commands, IDs.channels.selfieVerificati]
    .filter(Boolean)
    .map((id?) => String(id)),
);

function resolveSkullboardChannelId(guildId?) {
  const gid = String(guildId || "").trim();
  try {
    const {
      isTenantBoardFeatureEnabledSync,
      resolveTenantBoardChannelIdSync,
    } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
    if (gid && !isTenantBoardFeatureEnabledSync(gid, "skull")) return null;
    const fromTenant = gid ? resolveTenantBoardChannelIdSync(gid, "skull") : null;
    if (fromTenant) return fromTenant;
  } catch {
      }
  /* niente ripiego sul vecchio #bacheca: il principale usa il sito, gli altri il loro canale skull */
  return null;
}

function isSkullboardSourceChannel(channel?) {
  if (!channel) return false;
  const id = String(channel.id || "");
  if (SKULL_SOURCE_WHITELIST_CHANNEL_IDS.has(id)) return true;

  const privateVoiceCategoryId = String(IDs.categories?.categoryPrivate || "");
  const target = channel.isThread?.() ? channel.parent : channel;
  if (!target) return false;

  const targetId = String(target.id || "");
  if (SKULL_SOURCE_WHITELIST_CHANNEL_IDS.has(targetId)) return true;

  if (target.type === ChannelType.GuildVoice || target.type === ChannelType.GuildStageVoice) {
    return typeof target.isTextBased !== "function" || target.isTextBased();
  }

  if (
    privateVoiceCategoryId &&
    (target.type === ChannelType.GuildText || target.type === ChannelType.GuildAnnouncement) &&
    String(target.parentId || "") === privateVoiceCategoryId
  ) {
    return true;
  }

  return false;
}
const MAX_REPLY_CONTENT_LENGTH = 240;
const MAX_DISPLAY_NAME_LENGTH = 80;

function normalizeEmojiName(value?) {
  return String(value || "")
    .replace(/[\uFE0E\uFE0F]/g, "")
    .trim();
}

function isSkullReaction(reaction?) {
  const name = normalizeEmojiName(reaction?.emoji?.name);
  return name === normalizeEmojiName(SKULL_EMOJI) || name === "\u2620";
}

function clamp(value?, max?) {
  const text = String(value || "");
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function sanitizeUsername(member?, author?) {
  const fallback = memberDisplayName(author);
  const raw = (member ? memberDisplayName(member) : fallback)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\n/g, " ")
    .trim()
    .normalize("NFKC");
  return clamp(raw || fallback, MAX_DISPLAY_NAME_LENGTH);
}

function extractMessageFiles(message?) {
  const files = [];
  const attachments = [...(message?.attachments?.values?.() || [])];
  for (const attachment of attachments) {
    if (!attachment?.url) continue;
    files.push({
      attachment: attachment.url,
      name: attachment.name || `file-${files.length + 1}`,
    });
    if (files.length >= 10) break;
  }
  return files;
}

function extractStickerUrls(message?) {
  const stickers = [...(message?.stickers?.values?.() || [])];
  return stickers
    .map((sticker?) => sticker?.url || sticker?.imageURL?.() || null)
    .filter(Boolean)
    .slice(0, 3);
}

function buildBaseContent(message?) {
  const parts = [];
  const text = String(message?.content || "").trim();
  if (text) parts.push(text);

  const stickerUrls = extractStickerUrls(message);
  if (stickerUrls.length) {
    parts.push(stickerUrls.join("\n"));
  }

  if (parts.length) return parts.join("\n").trim();

  if (message?.attachments?.size > 0) {
    const firstAttachment = [...message.attachments.values()][0];
    const attachmentName = firstAttachment?.name || "file";
    if (firstAttachment?.contentType?.startsWith("image/")) return "";
    if (firstAttachment?.contentType?.startsWith("video/")) return "[Video]";
    return `[Allegato: ${attachmentName}]`;
  }
  return "";
}

function getNameColor(member?) {
  if (!member) return null;
  try {
    const hex = member.displayHexColor;
    if (typeof hex === "string" && /^#[\da-f]{6}$/i.test(hex)) {
      const lower = hex.toLowerCase();
      if (lower === "#000000") return null;
      return hex;
    }
  } catch {
  }
  const color = member.roles?.highest?.color;
  if (typeof color === "number" && Number.isFinite(color) && color !== 0) {
    return `#${color.toString(16).padStart(6, "0")}`;
  }
  return null;
}

/* skullNameGradient1: colori del ruolo che colora il nome (gradiente/olografico inclusi) */
function getNameColors(member?) {
  const role = member?.roles?.color;
  if (!role) return null;
  const hex = (n?) => (Number(n) > 0 ? `#${Number(n).toString(16).padStart(6, "0")}` : "");
  const c = role.colors || {};
  const list = [hex(c.primaryColor ?? role.color), hex(c.secondaryColor), hex(c.tertiaryColor)].filter(Boolean);
  return list.length > 1 ? list : null;
}

async function getRoleIcon(member?) {
  if (!member?.roles) return null;
  const hoistedRole=member.roles.cache.find((role?) => role.hoist&&role.iconURL(),);
  const iconUrl = hoistedRole?.iconURL({ extension: "png", size: 64 }) || null;
  if (!iconUrl) return null;
  return cacheRoleIcon(iconUrl);
}

async function prepareReplyData(message?) {
  if (!message.reference?.messageId) return null;

  const replied=await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
  if (!replied || !replied.author) return null;

  const repliedMember=replied.member||(await message.guild?.members?.fetch?.(replied.author.id).catch(() => null));

  const rawReply = String(replied.content || "");
  const resolvedReply = await resolveCanvasDiscordMarkup(
    message.guild,
    message.client,
    rawReply,
  );
  const clippedReply =
    resolvedReply.length > MAX_REPLY_CONTENT_LENGTH
      ? `${resolvedReply.slice(0, Math.max(0, MAX_REPLY_CONTENT_LENGTH - 3))}...`
      : resolvedReply;

  return {
    content: clippedReply,
    author: sanitizeUsername(repliedMember, replied.author),
    nameColor: getNameColor(repliedMember),
    avatarUrl: guildMemberDisplayAvatarUrlDynamic(repliedMember || replied.author, { size: 64 }) || "",
    roleIconUrl: await getRoleIcon(repliedMember),
  };
}

async function resolveReactionMessage(reaction?) {
  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }
  const message=reaction.message?.partial?await reaction.message.fetch().catch(() => null):reaction.message;
  return message || null;
}

async function findSkullboardChannel(guild?, channelId?) {
  const id = String(channelId || "").trim();
  if (!guild || !id) return null;
  return guild.channels.cache.get(id) || (await getGuildChannelCached(guild, id));
}

async function findAuthorMember(message?) {
  return message.member || (await getGuildMemberCached(message.guild, message.author.id));
}

async function renderSkullCanvas(
  message?,
  member?,
  content?,
  replyData?,
  mediaUrl?,
  hasMedia?,
  hasEmbedOnly?,
) {
  const renderSkullboardCanvas = require("../../Community/utils/Render/skullboardCanvas") as typeof import("../../Community/utils/Render/skullboardCanvas");
  return renderSkullboardCanvas({
    avatarUrl: guildMemberDisplayAvatarUrlDynamic(member || message.author, { size: 256 }) || "",
    username: sanitizeUsername(member, message.author),
    message: content || "",
    nameColor: getNameColor(member),
    nameColors: getNameColors(member),
    /* skullCard1: riga ruolo e intestazione canale, come l'anteprima del sito */
    roleName: String(member?.roles?.color?.name || ""),
    channelName: String(message.channel?.name || ""),
    createdAt: message.createdAt,
    reply: replyData,
    roleIconUrl: await getRoleIcon(member),
    mediaUrl,
    hasMedia,
    hasEmbedOnly,
  });
}

function buildSkullEmbed(user?, message?, postImageName?) {
  const messageLink = `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`;
  const formattedDate=new Intl.DateTimeFormat("it-IT",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false,}).format(message.createdAt);
  let description = `${E.VC_Skully} **Aggiungi la reazione ${SKULL_EMOJI} a un messaggio per pubblicarlo nella SkullBoard**`;
  let fieldAuthor = `${E.VC_User} Autore`;
  let fieldChannel = `${E.VC_Channel} Canale`;
  let fieldMessage = `${E.VC_Chat} Messaggio`;
  let footer = formattedDate;
  try {
    const {
      getBoardKindPresentationSync,
      fillBoardTemplate,
    } = require("../../Community/utils/boardsPresentation") as typeof import("../../Community/utils/boardsPresentation");
    const pr = getBoardKindPresentationSync(message.guild.id, "skull");
    const vars = {
      date: formattedDate,
      author: message.author.toString(),
      channel: `<#${message.channel.id}>`,
      source: messageLink,
    };
    description =
      fillBoardTemplate(pr.embedDescription, vars) || description;
    fieldAuthor = (pr.fieldAuthor || fieldAuthor).slice(0, 256);
    fieldChannel = (pr.fieldChannel || fieldChannel).slice(0, 256);
    fieldMessage = (pr.fieldMessage || fieldMessage).slice(0, 256);
    footer = fillBoardTemplate(pr.embedFooter, vars) || footer;
  } catch {
    /* fallback live */
  }

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: memberDisplayName(message.member || message.author),
      iconURL: guildMemberDisplayAvatarUrlDynamic(message.member || message.author, { size: 64 }) || undefined,
    })
    .setDescription(String(description).slice(0, 4096))
    .addFields(
      { name: fieldAuthor, value: message.author.toString(), inline: true },
      { name: fieldChannel, value: `<#${message.channel.id}>`, inline: true },
      { name: fieldMessage, value: `[Cliccami](${messageLink})`, inline: true },
    )
    .setImage(`attachment://${postImageName}`)
    .setFooter({ text: String(footer).slice(0, 2048) })
    .setTimestamp(message.createdAt);
}

/** Embed della skullboard marcato per il messaggio personalizzato della dashboard. */
function tagSkull(embed?, guildId?, slot: "post" | "reply" = "post", vars: Record<string, string> = {}) {
  const { tagBoardEmbed } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
  return tagBoardEmbed(embed, { guildId, kind: "skull", slot, vars });
}

function buildSkullAckDescription({ guildId, siteBoard, channelId }) {
  const channelMention = channelId ? `<#${channelId}>` : "";
  try {
    const {
      getBoardKindPresentationSync,
      fillBoardTemplate,
    } = require("../../Community/utils/boardsPresentation") as typeof import("../../Community/utils/boardsPresentation");
    const pr = getBoardKindPresentationSync(guildId, "skull");
    const vars = { channel: channelMention };
    if (siteBoard) {
      return (
        fillBoardTemplate(pr.ackDescriptionSite, vars) ||
        `${E.VC_Skully} Il messaggio è stato appeso in **Bacheca** sul sito.`
      );
    }
    if (channelId) {
      return (
        fillBoardTemplate(pr.ackDescriptionChannel, vars) ||
        fillBoardTemplate(pr.ackDescription, vars) ||
        `${E.VC_Skully} Il messaggio è stato pubblicato nel canale ${channelMention}.`
      );
    }
    return (
      fillBoardTemplate(pr.ackDescription, vars) ||
      `${E.VC_Skully} Il messaggio è stato pubblicato nel canale ${channelMention}.`
    );
  } catch {
    return siteBoard
      ? `${E.VC_Skully} Il messaggio è stato appeso in **Bacheca** sul sito.`
      : `${E.VC_Skully} Il messaggio è stato pubblicato nel canale ${channelMention}.`;
  }
}

async function maybeBuildReplyReference(message?, skullboardChannel?) {
  if (!message.reference?.messageId) return null;

  const mirroredReply = await skullboardFindOneLean(message.guild.id, message.reference.messageId).catch(() => null);
  if (!mirroredReply?.postMessageId) return null;

  const mirroredMsg=await skullboardChannel.messages.fetch(mirroredReply.postMessageId).catch(() => null);
  if (!mirroredMsg) return null;

  return { messageReference: mirroredMsg.id, failIfNotExists: false };
}

export = {
  name: "messageReactionAdd",

  async execute(reaction?, user?) {
    let inFlightKey = null;
    let inFlightSet = null;
    try {
      if (user?.bot) return;

      const tenantGuildId = String(
        reaction?.message?.guildId || reaction?.message?.guild?.id || "",
      ).trim();
      if (tenantGuildId && !isViniliFullFeatureGuild(tenantGuildId)) return;

      try {
        const client = reaction.client || reaction.message?.client || user?.client;
        const handled = await handleMinigameReaction(client, reaction, user);
        if (handled) return;
      } catch (mgErr) {
        global.logger?.error?.("[ReactionAdd] event reaction handler:", mgErr?.message || mgErr);
      }
      try {
        const client = reaction.client || reaction.message?.client || user?.client;
        const { handleStarWarsReaction } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsDiscordMinigamesService") as any;
        if (typeof handleStarWarsReaction === "function") {
          const swHandled = await handleStarWarsReaction(client, reaction, user);
          if (swHandled) return;
        }
      } catch (swErr) {
        global.logger?.error?.("[ReactionAdd] starWars reaction handler:", swErr?.message || swErr);
      }
      if (!isSkullReaction(reaction)) return;

      const message = await resolveReactionMessage(reaction);
      if (!message || !message.guild || !message.author) return;
      if ((message.embeds?.length || 0) > 0) return;

      /* bachecaSite1: sul server principale la 💀 appende il messaggio sulla Bacheca del sito */
      const bachecaSite = require("../../site/bacheca/bachecaSite") as typeof import("../../site/bacheca/bachecaSite");
      const siteBoard = bachecaSite.isBachecaSiteGuild(message.guild.id);
      const skullChannelId = siteBoard ? "" : resolveSkullboardChannelId(message.guild.id);
      if (!siteBoard && !skullChannelId) return;
      if (!isSkullboardSourceChannel(message.channel)) {
        return;
      }
      if (!siteBoard && String(message.channel?.id || "") === String(skullChannelId)) return;

      if (message.client) {
        if (!message.client._skullboardInFlight) {
          message.client._skullboardInFlight = new Set();
        }
        inFlightSet = message.client._skullboardInFlight;
        inFlightKey = `${message.guild.id}:${message.id}`;
        if (inFlightSet.has(inFlightKey)) return;
        inFlightSet.add(inFlightKey);
      }

      const existing = await skullboardFindOneLean(message.guild.id, message.id).catch(() => null);
      if (existing?.postMessageId) {
        if (siteBoard) {
          /* altre 💀 sullo stesso messaggio: il conteggio sul sito sale */
          const { GuildSkullPost } = require("../../Community/schemas/guildBoardPostSchema") as typeof import("../../Community/schemas/guildBoardPostSchema");
          await GuildSkullPost.updateOne(
            { guildId: message.guild.id, sourceMessageId: message.id },
            { $max: { skullCount: Math.max(1, Number(reaction.count || 1)) } },
          ).catch(() => null);
          bachecaSite.broadcastBachecaChanged("skull", existing.postMessageId);
        }
        return;
      }

      const skullboardChannel = siteBoard ? null : await findSkullboardChannel(message.guild, skullChannelId);
      if (!siteBoard && !skullboardChannel?.isTextBased?.()) return;

      const member = await findAuthorMember(message);
      const rawContent = buildBaseContent(message);
      const content = await resolveCanvasDiscordMarkup(
        message.guild,
        message.client,
        rawContent,
      );
      const files = extractMessageFiles(message);
      const replyData = await prepareReplyData(message);

      const firstAttachment = files[0];
      const mediaUrl = firstAttachment?.attachment || null;
      const hasMedia = Boolean(mediaUrl);
      const hasEmbedOnly=!String(message.content||"").trim()&&!(message.attachments?.size>0)&&(message.embeds?.length||0)>0;

      let canvasBuffer;
      try {
        canvasBuffer = await renderSkullCanvas(message, member, content, replyData, mediaUrl, hasMedia, hasEmbedOnly);
      } catch (error) {
        global.logger?.error?.("[Skullboard] Canvas render failed:", error);
        return;
      }

      if (siteBoard) {
        const { registerBachecaSkull } = require("../../site/bacheca/bachecaSkull") as typeof import("../../site/bacheca/bachecaSkull");
        const saved = await registerBachecaSkull({
          message,
          member,
          reactorId: String(user?.id || ""),
          content: rawContent,
          canvasBuffer,
          files,
          skullCount: Number(reaction.count || 1),
        });
        if (!saved.ok) return;
        await skullboardUpsert(message.guild.id, message.id, saved.itemId).catch(() => null);
        const siteConfirm = new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            buildSkullAckDescription({
              guildId: message.guild.id,
              siteBoard: true,
              channelId: "",
            }).slice(0, 4096),
          );
        tagSkull(siteConfirm, message.guild.id, "reply", { channel: "", author: message.author.toString() });
        const { withBoardDraft } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
        await message.channel
          .send(withBoardDraft({ embeds: [siteConfirm], components: [bachecaSite.buildBachecaLinkRow(saved.itemId, "Vai alla Bacheca") as any] }))
          .catch(() => {});
        return;
      }

      const imageName = "skullboard.png";
      const imageAttachment=new AttachmentBuilder(canvasBuffer,{name:imageName,});
      const skullEmbed = tagSkull(buildSkullEmbed(user, message, imageName), message.guild.id, "post", {
        author: message.author.toString(),
        channel: `<#${message.channel.id}>`,
        source: `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${message.id}`,
        date: new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(message.createdAt),
      });
      const { withBoardDraft } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");

      const payload: Record<string, any>={embeds:[skullEmbed],files:[imageAttachment],allowedMentions:{parse:[]},};

      const replyRef=await maybeBuildReplyReference(message,skullboardChannel,);
      if (replyRef) {
        payload.reply = replyRef;
      }

      const postMessage = await skullboardChannel.send(withBoardDraft(payload)).catch(() => null);
      if (!postMessage) return;

      await postMessage.react(SKULL_EMOJI).catch(() => {});

      await skullboardUpsert(message.guild.id, message.id, postMessage.id).catch(() => null);

      const confirmEmbed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setDescription(
          buildSkullAckDescription({
            guildId: message.guild.id,
            siteBoard: false,
            channelId: skullChannelId,
          }).slice(0, 4096),
        );

      /* testo ed emoji del pulsante dalla dashboard (Bacheca › Skullboard) */
      const linkBtn = new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Vai al Post").setEmoji(SKULL_EMOJI).setURL(postMessage.url);
      try {
        const { getBoardKindPresentationSync } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
        const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
        const pr: any = getBoardKindPresentationSync(message.guild.id, "skull");
        if (pr.buttonLink) linkBtn.setLabel(String(pr.buttonLink).slice(0, 80));
        const em = pr.buttonLinkEmoji ? T.parseEmoji(pr.buttonLinkEmoji) : null;
        if (em) linkBtn.setEmoji(em);
        else if (pr.buttonLinkEmoji === "") delete (linkBtn as any).data.emoji;
      } catch {
        /* come prima */
      }
      const row = new ActionRowBuilder().addComponents(linkBtn);

      tagSkull(confirmEmbed, message.guild.id, "reply", { channel: `<#${skullChannelId}>`, author: message.author.toString(), url: postMessage.url });
      await message.channel.send(withBoardDraft({ embeds: [confirmEmbed], components: [row] })).catch(() => {});
    } catch (err) {
      global.logger?.error?.("[Skullboard] Error:", err);
    } finally {
      if (inFlightSet && inFlightKey) inFlightSet.delete(inFlightKey);
    }
  },
};