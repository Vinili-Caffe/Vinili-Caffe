/** Repost: embed e pulsanti (conferma, bacheca, roulette, rimozione). */
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { DEFAULT_FOOTER_TEXT } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { pickRepostAckPhrase } = require("../utils/repostAckPhrases") as typeof import("../utils/repostAckPhrases");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { resolveQuotedAuthorIdFromQuoteMessage, isClipRepostDoc } = require("./repostClips") as typeof import("./repostClips");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const REPOST_COLOR = TENANT_EMBED_COLOR;
const REPOST_BTN_PREFIX = "repost_btn:";
const REPOST_SRC_PREFIX = "repost_src:";
const REPOST_REMOVE_PREFIX = "repost_remove:";
const REPOST_EMOJI = E.reddiamond;
const MAX_EMBED_BODY_CHARS = 3600;

function messageJumpUrl(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

function escapeItalicMarkdown(text?) {
  return String(text || "").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

function formatRepostBody(text?) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  const clipped = raw.length > MAX_EMBED_BODY_CHARS ? `${raw.slice(0, MAX_EMBED_BODY_CHARS - 1)}…` : raw;
  return `» *${escapeItalicMarkdown(clipped)}*`;
}

function resolveReposterProfile(reposter?) {
  const name = accountUsername(reposter);
  let iconURL = null;
  try {
    iconURL = guildMemberDisplayAvatarUrlDynamic(reposter, { size: 128 }) || null;
  } catch {
    iconURL = null;
  }
  return { name: String(name).slice(0, 256), iconURL };
}

function buildShareAckEmbed({ reposterId, boardUrl, prefix }) {
  const safePrefix = String(prefix || "").trim() || "+";
  const linkLine = boardUrl ? `» [Clicca qui per vedere il repost](${boardUrl})` : "» Repost salvato.";
  const ackPhrase = pickRepostAckPhrase();
  const lines = [
    `${REPOST_EMOJI} * . ˊ <@${reposterId}> ${ackPhrase}`,
    "",
    linkLine,
  ];
  const footerHint = `✧ * . ˊ ${safePrefix}repost`;
  const footerText = DEFAULT_FOOTER_TEXT ? `${footerHint} · ${DEFAULT_FOOTER_TEXT}` : footerHint;
  return new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setDescription(lines.join("\n"))
    .setFooter({ text: footerText });
}

function buildBoardEmbed({
  reposter,
  reposterId,
  sourceAuthorId,
  sourceUrl,
  totalPosts,
  text,
  imageUrl,
  commandPrefix,
  imageOnly,
}) {
  const profile = resolveReposterProfile(reposter);
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const parts = [`di <@${reposterId}> 🎀`];
  if (!imageOnly) {
    const body = formatRepostBody(text);
    if (body) parts.push("", body);
  }
  parts.push("", `• [Clicca qui per andare al messaggio](${sourceUrl})`, "", `ɤ⌒➴ Autore del messaggio: <@${sourceAuthorId}>`);

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setAuthor({ name: profile.name, iconURL: profile.iconURL || undefined })
    .setTitle(`🆕 * . ˊ Nuovo repost!`)
    .setDescription(parts.join("\n"))
    .setFooter({
      text: `† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando ${safePrefix}repost · Post #${totalPosts}`,
    });

  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRouletteEmbed({ sourceUrl, text, imageUrl }) {
  const parts = [];
  const body = formatRepostBody(text);
  if (body) parts.push(body);
  parts.push(`• [Messaggio Originale](${sourceUrl})`);

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setTitle(`${REPOST_EMOJI} * . ˊ Roulette dei Repost Passati`)
    .setDescription(parts.join("\n\n"))
    .setFooter({ text: "† · ৎ Revival casuale dal database 🎲" });

  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function buildRepostaSourceButtonRow(sourceChannelId?, sourceMessageId?, quotedAuthorId = "") {
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!sc || !sm) return null;
  const qa = String(quotedAuthorId || "").trim();
  const customId = `${REPOST_SRC_PREFIX}${sc}:${sm}${qa ? `:${qa}` : ""}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(customId)
      .setLabel("Reposta")
      .setEmoji("1443652837346377841")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildAckRepostaComponents({ repostId, targetMessage, sourceAuthorId = "" }) {
  const rid = String(repostId || "").trim();
  if (rid) return [buildRepostaButtonRow(rid)];
  if (!targetMessage?.channel?.id || !targetMessage?.id) return [];
  let authorId = String(sourceAuthorId || "").trim();
  if (!authorId && targetMessage.author?.bot) {
    authorId = resolveQuotedAuthorIdFromQuoteMessage(targetMessage) || "";
  }
  if (!authorId && targetMessage.author) {
    authorId = String(targetMessage.author.id || "");
  }
  const row = buildRepostaSourceButtonRow(targetMessage.channel.id, targetMessage.id, authorId);
  return row ? [row] : [];
}

function buildRepostaButton(repostId?) {
  return new ButtonBuilder()
    .setCustomId(`${REPOST_BTN_PREFIX}${repostId}`)
    .setLabel("Reposta")
    .setEmoji("1443652837346377841")
    .setStyle(ButtonStyle.Secondary);
}

function buildRepostaButtonRow(repostId?) {
  return new ActionRowBuilder().addComponents(buildRepostaButton(repostId));
}

function buildRepostRemoveButton(repostId?, doc = null) {
  const rid = String(repostId || "").trim();
  if (!rid) return null;
  const isClip = isClipRepostDoc(doc);
  return new ButtonBuilder()
    .setCustomId(`${REPOST_REMOVE_PREFIX}${rid}`)
    .setLabel(isClip ? "Rimuovi clip" : "Rimuovi repost")
    .setEmoji("🗑️")
    .setStyle(ButtonStyle.Danger);
}

function buildBoardMessageComponents(primaryRepostId?, doc?) {
  const rid = String(primaryRepostId || doc?._id || "").trim();
  if (!rid) return [];
  const buttons = [buildRepostaButton(rid)];
  if (doc) {
    const removeBtn = buildRepostRemoveButton(rid, doc);
    if (removeBtn) buttons.push(removeBtn);
  }
  return [new ActionRowBuilder().addComponents(...buttons.slice(0, 5))];
}

function buildRepostRemovedEmbed({ userId, isClip = false }) {
  const now = new Date();
  const dateStr = now.toLocaleDateString("it-IT");
  const timeStr = now.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setTitle(isClip ? "🗑️ Clip rimossa" : "🗑️ Repost rimosso")
    .setDescription(
      isClip
        ? "Questa clip vocale è stata rimossa dal database."
        : "Questo repost è stato rimosso dalla bacheca.",
    )
    .addFields(
      { name: "Rimosso da", value: `<@${userId}>`, inline: true },
      { name: "Data rimozione", value: `${dateStr} ${timeStr}`, inline: true },
    )
    .setFooter({ text: `Gestisci i tuoi repost dal profilo sul sito · Oggi alle ${timeStr}` });
}

/* repostPrivacyEmbed1: stesso stile dell'embed "Quote bloccate" */
function buildRepostPrivacyBlockedEmbed(authorLabel?) {
  const dateText = new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return new EmbedBuilder()
    .setColor("#ed4245")
    .setTitle(`${E.VC_Unlock} Repost bloccati`)
    .setDescription(
      [
        `**${authorLabel}** ha bloccato i repost dei propri messaggi.`,
        "",
        "**Rispetta la privacy**",
        "L'utente ha scelto di non essere repostato. Rispetta questa decisione!",
      ].join("\n"),
    )
    .setFooter({ text: `Se hai bisogno di condividere il messaggio, usa uno screenshot o chiedi il permesso diretto. ${dateText}` });
}

export = { REPOST_BTN_PREFIX, REPOST_SRC_PREFIX, REPOST_REMOVE_PREFIX, messageJumpUrl, buildShareAckEmbed, buildBoardEmbed, buildRouletteEmbed, buildAckRepostaComponents, buildRepostaButtonRow, buildBoardMessageComponents, buildRepostRemovedEmbed, buildRepostPrivacyBlockedEmbed };
