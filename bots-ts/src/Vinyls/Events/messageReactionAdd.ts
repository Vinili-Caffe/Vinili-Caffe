const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType, } = require("discord.js") as typeof import("discord.js");
const { skullboardFindOneLean, skullboardUpsert } = require("../Utils/Global/globalSettingsGuildStores") as typeof import("../Utils/Global/globalSettingsGuildStores");
const { handleMinigameReaction } = require("../Services/Minigames/minigameService") as typeof import("../Services/Minigames/minigameService");
const { handleReactPressReaction } = require("../Services/Community/hogwartsReactPressService") as typeof import("../Services/Community/hogwartsReactPressService");
const { handleHalloweenEmojiHuntReaction } = require("../Services/Community/halloweenEmojiHuntService") as typeof import("../Services/Community/halloweenEmojiHuntService");
const { handleIdeaBugReaction } = require("../Services/Community/ideaBugThreadService") as typeof import("../Services/Community/ideaBugThreadService");
const { handlePollVoteReaction } = require("../Services/Community/pollReactionThreadService") as typeof import("../Services/Community/pollReactionThreadService");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { cacheRoleIcon } = require("../Utils/Cache/roleIconCache") as typeof import("../Utils/Cache/roleIconCache");
const { guildMemberDisplayAvatarUrlDynamic, memberDisplayName } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { resolveCanvasDiscordMarkup } = require("../Utils/Discord/resolveCanvasDiscordText") as typeof import("../Utils/Discord/resolveCanvasDiscordText");

function isViniliFullFeatureGuild(guildId?) {
  try {
    const { isViniliFullFeatureGuild: check } = require("../MultiGuild/core/guildFeatureScope") as typeof import("../MultiGuild/core/guildFeatureScope");
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
    } = require("../MultiGuild/core/tenantGuildSettings") as typeof import("../MultiGuild/core/tenantGuildSettings");
    if (gid && !isTenantBoardFeatureEnabledSync(gid, "skull")) return null;
    const fromTenant = gid ? resolveTenantBoardChannelIdSync(gid, "skull") : null;
    if (fromTenant) return fromTenant;
  } catch {
      }
  return IDs.channels.quotes ? String(IDs.channels.quotes) : null;
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
  const renderSkullboardCanvas = require("../Utils/Render/skullboardCanvas") as typeof import("../Utils/Render/skullboardCanvas");
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

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: memberDisplayName(message.member || message.author),
      iconURL: guildMemberDisplayAvatarUrlDynamic(message.member || message.author, { size: 64 }) || undefined,
    })
    .setDescription(
      `<:VC_Skully:1331591939094614057> **Aggiungi la reazione ${SKULL_EMOJI} a un messaggio per pubblicarlo nella SkullBoard**`,
    )
    .addFields(
      { name: "<:VC_User:1482527453586002103> Autore", value: message.author.toString(), inline: true },
      { name: "<a:VC_Channel:1482534583944871996> Canale", value: `<#${message.channel.id}>`, inline: true },
      { name: "<:VC_Chat:1482532573002465413> Messaggio", value: `[Cliccami](${messageLink})`, inline: true },
    )
    .setImage(`attachment://${postImageName}`)
    .setFooter({ text: formattedDate })
    .setTimestamp(message.createdAt);
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
        const reactPressHandled = await handleReactPressReaction(client, reaction, user);
        if (reactPressHandled) return;
        const halloweenHuntHandled = await handleHalloweenEmojiHuntReaction(client, reaction, user);
        if (halloweenHuntHandled) return;
        try {
          const { handleStarWarsReaction } = require("../Services/Community/starWarsDiscordMinigamesService") as typeof import("../Services/Community/starWarsDiscordMinigamesService");
          const swHandled = await handleStarWarsReaction(client, reaction, user);
          if (swHandled) return;
        } catch (_) {}
        const handled = await handleMinigameReaction(client, reaction, user);
        if (handled) return;
        const ideaBugHandled = await handleIdeaBugReaction(reaction, user);
        if (ideaBugHandled) return;
        const pollVoteHandled = await handlePollVoteReaction(reaction, user);
        if (pollVoteHandled) return;
      } catch (mgErr) {
        global.logger?.error?.("[ReactionAdd] event reaction handler:", mgErr?.message || mgErr);
      }
      if (!isSkullReaction(reaction)) return;

      const message = await resolveReactionMessage(reaction);
      if (!message || !message.guild || !message.author) return;
      if ((message.embeds?.length || 0) > 0) return;

      const skullChannelId = resolveSkullboardChannelId(message.guild.id);
      if (!skullChannelId) return;
      if (!isSkullboardSourceChannel(message.channel)) {
        return;
      }
      if (String(message.channel?.id || "") === String(skullChannelId)) return;

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
      if (existing?.postMessageId) return;

      const skullboardChannel = await findSkullboardChannel(message.guild, skullChannelId);
      if (!skullboardChannel?.isTextBased?.()) return;

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

      const imageName = "skullboard.png";
      const imageAttachment=new AttachmentBuilder(canvasBuffer,{name:imageName,});
      const skullEmbed = buildSkullEmbed(user, message, imageName);

      const payload={embeds:[skullEmbed],files:[imageAttachment],allowedMentions:{parse:[]},};

      const replyRef=await maybeBuildReplyReference(message,skullboardChannel,);
      if (replyRef) {
        payload.reply = replyRef;
      }

      const postMessage=await skullboardChannel.send(payload).catch(() => null);
      if (!postMessage) return;

      await postMessage.react(SKULL_EMOJI).catch(() => {});

      await skullboardUpsert(message.guild.id, message.id, postMessage.id).catch(() => null);

      const confirmEmbed=new EmbedBuilder().setColor("#6f4e37").setDescription(`<:VC_Skully:1331591939094614057> Il messaggio è stato pubblicato nel canale <#${skullChannelId}>.`);

      const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel("Vai al Post").setEmoji(SKULL_EMOJI).setURL(postMessage.url),);

      await message.channel.send({ embeds: [confirmEmbed], components: [row] }).catch(() => {});
    } catch (err) {
      global.logger?.error?.("[Skullboard] Error:", err);
    } finally {
      if (inFlightSet && inFlightKey) inFlightSet.delete(inFlightKey);
    }
  },
};