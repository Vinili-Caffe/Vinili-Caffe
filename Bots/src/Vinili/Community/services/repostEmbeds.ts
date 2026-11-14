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
  return `*${escapeItalicMarkdown(clipped)}*`;
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

function buildShareAckEmbed({ reposterId, boardUrl, prefix, guildId, kind = "repost" }) {
  const safePrefix = String(prefix || "").trim() || "+";
  const boardKind = kind === "clip" ? "clip" : "repost";
  const linkLine = boardUrl
    ? boardKind === "clip"
      ? `[Apri la clip](${boardUrl})`
      : `[Clicca qui per vedere il repost](${boardUrl})`
    : boardKind === "clip"
      ? "Clip pubblicata."
      : "Repost salvato.";
  const ackPhrase = pickRepostAckPhrase(guildId, boardKind);
  let description = "";
  let footerHint = `✧ * . ˊ ${safePrefix}${boardKind === "clip" ? "clip" : "repost"}`;
  try {
    const {
      getBoardKindPresentationSync,
      fillBoardTemplate,
    } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    const pr = getBoardKindPresentationSync(guildId, boardKind);
    const vars = {
      prefix: safePrefix,
      reposter: `<@${reposterId}>`,
      phrase: ackPhrase,
      link: linkLine,
    };
    description = fillBoardTemplate(pr.ackDescription, vars);
    footerHint = fillBoardTemplate(pr.ackFooter, vars) || footerHint;
  } catch {
    /* fallback sotto */
  }
  if (!description) {
    description = [`${REPOST_EMOJI} * . ˊ <@${reposterId}> ${ackPhrase}`, "", linkLine].join("\n");
  }
  const footerText = DEFAULT_FOOTER_TEXT ? `${footerHint} · ${DEFAULT_FOOTER_TEXT}` : footerHint;
  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setDescription(String(description).slice(0, 4096))
    .setFooter({ text: String(footerText).slice(0, 2048) });
  const { tagBoardEmbed } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
  return tagBoardEmbed(embed, {
    guildId,
    kind: boardKind,
    slot: "reply",
    vars: { prefix: safePrefix, reposter: `<@${reposterId}>`, phrase: ackPhrase, link: linkLine, url: String(boardUrl || "") },
  });
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
  guildId,
  kind = "repost",
}) {
  const profile = resolveReposterProfile(reposter);
  const safePrefix = String(commandPrefix || "").trim() || "+";
  const boardKind = kind === "clip" ? "clip" : "repost";
  let pr = null;
  let fillBoardTemplate = (t?, _v?) => String(t || "");
  try {
    const boardsPresentation = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    pr = boardsPresentation.getBoardKindPresentationSync(guildId, boardKind);
    fillBoardTemplate = boardsPresentation.fillBoardTemplate;
  } catch {
    pr = null;
  }
  const body = imageOnly ? "" : formatRepostBody(text);
  const vars = {
    prefix: safePrefix,
    count: String(totalPosts ?? 0),
    reposter: `<@${reposterId}>`,
    author: `<@${sourceAuthorId}>`,
    source: String(sourceUrl || ""),
    text: String(text || "").trim(),
    body,
  };
  let description = "";
  let title = boardKind === "clip" ? `🆕 * . ˊ Nuova clip!` : `🆕 * . ˊ Nuovo repost!`;
  let footer =
    boardKind === "clip"
      ? `† · ৎ Aggiungi una clip alla bacheca ⭐ usando il comando ${safePrefix}clip · Post #${totalPosts}`
      : `† · ৎ Aggiungi un messaggio alla bacheca ⭐ usando il comando ${safePrefix}repost · Post #${totalPosts}`;
  if (pr) {
    title = fillBoardTemplate(pr.embedTitle, vars) || title;
    description = fillBoardTemplate(pr.embedDescription, vars);
    footer = fillBoardTemplate(pr.embedFooter, vars) || footer;
  }
  if (!description) {
    const parts = [`di <@${reposterId}> 🎀`];
    if (body) parts.push("", body);
    parts.push("", `• [Clicca qui per andare al messaggio](${sourceUrl})`, "", `ɤ⌒➴ Autore del messaggio: <@${sourceAuthorId}>`);
    description = parts.join("\n");
  }

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setAuthor({ name: profile.name, iconURL: profile.iconURL || undefined })
    .setTitle(String(title).slice(0, 256))
    .setDescription(String(description).slice(0, 4096))
    .setFooter({ text: String(footer).slice(0, 2048) });

  if (imageUrl) embed.setImage(imageUrl);
  const { tagBoardEmbed } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
  return tagBoardEmbed(embed, { guildId, kind: boardKind, slot: "post", vars: { ...vars, image: String(imageUrl || "") } });
}

function buildRouletteEmbed({
  sourceUrl,
  text,
  imageUrl,
  guildId,
  prefix,
  count,
  authorId,
  reposterId,
}: Record<string, any> = {}) {
  const body = formatRepostBody(text);
  let title = `${REPOST_EMOJI} * . ˊ Roulette dei Repost Passati`;
  let description = "";
  let footer = "† · ৎ Revival casuale dal database 🎲";
  let safePrefix = String(prefix || "").trim() || "+";
  try {
    if (!String(prefix || "").trim()) {
      const { resolveCommandPrefixForGuild } = require("../../../MultiGuild/core/tenantGuildSettings") as typeof import("../../../MultiGuild/core/tenantGuildSettings");
      safePrefix = resolveCommandPrefixForGuild(guildId) || "+";
    }
  } catch {
    /* ignore */
  }
  const vars: Record<string, string> = {
    body,
    source: String(sourceUrl || ""),
    text: String(text || "").trim(),
    prefix: safePrefix,
    count: String(count ?? ""),
    author: authorId ? `<@${authorId}>` : "",
    reposter: reposterId ? `<@${reposterId}>` : "",
    image: String(imageUrl || ""),
  };
  try {
    const {
      getBoardKindPresentationSync,
      fillBoardTemplate,
    } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    const pr = getBoardKindPresentationSync(guildId, "repost");
    title = fillBoardTemplate(pr.rouletteTitle, vars) || title;
    description = fillBoardTemplate(pr.rouletteDescription, vars);
    footer = fillBoardTemplate(pr.rouletteFooter, vars) || footer;
  } catch {
    /* fallback sotto */
  }
  if (!description) {
    const parts = [];
    if (body) parts.push(body);
    parts.push(`• [Messaggio Originale](${sourceUrl})`);
    description = parts.join("\n\n");
  }

  const embed = new EmbedBuilder()
    .setColor(REPOST_COLOR)
    .setTitle(String(title).slice(0, 256))
    .setDescription(String(description).slice(0, 4096))
    .setFooter({ text: String(footer).slice(0, 2048) });

  if (imageUrl) embed.setImage(imageUrl);
  const { tagBoardEmbed } = require("../utils/boardDrafts") as typeof import("../utils/boardDrafts");
  return tagBoardEmbed(embed, {
    guildId,
    kind: "repost",
    slot: "roulette",
    vars,
  });
}

function boardButtonLabels(guildId?, kind = "repost") {
  try {
    const { getBoardKindPresentationSync } = require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation");
    const pr = getBoardKindPresentationSync(guildId, kind === "clip" ? "clip" : "repost");
    return {
      repost: String(pr.buttonRepost || "Reposta").slice(0, 80),
      remove: String(pr.buttonRemove || (kind === "clip" ? "Rimuovi clip" : "Rimuovi repost")).slice(0, 80),
    };
  } catch {
    return { repost: "Reposta", remove: kind === "clip" ? "Rimuovi clip" : "Rimuovi repost" };
  }
}

function buildRepostaSourceButtonRow(sourceChannelId?, sourceMessageId?, quotedAuthorId = "", guildId = "") {
  const sc = String(sourceChannelId || "").trim();
  const sm = String(sourceMessageId || "").trim();
  if (!sc || !sm) return null;
  const qa = String(quotedAuthorId || "").trim();
  const customId = `${REPOST_SRC_PREFIX}${sc}:${sm}${qa ? `:${qa}` : ""}`;
  const labels = boardButtonLabels(guildId, "repost");
  return new ActionRowBuilder().addComponents(
    (require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation")).styleBoardButton(
      new ButtonBuilder().setCustomId(customId).setLabel(labels.repost).setEmoji("1443652837346377841").setStyle(ButtonStyle.Secondary),
      guildId,
      "repost",
      "repost",
    ),
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

function buildRepostaButton(repostId?, guildId = "", kind = "repost") {
  const labels = boardButtonLabels(guildId, kind);
  return (require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation")).styleBoardButton(
    new ButtonBuilder().setCustomId(`${REPOST_BTN_PREFIX}${repostId}`).setLabel(labels.repost).setEmoji("1443652837346377841").setStyle(ButtonStyle.Secondary),
    guildId,
    kind === "clip" ? "clip" : "repost",
    "repost",
  );
}

function buildRepostaButtonRow(repostId?, guildId = "", kind = "repost") {
  return new ActionRowBuilder().addComponents(buildRepostaButton(repostId, guildId, kind));
}

function buildRepostRemoveButton(repostId?, doc = null) {
  const rid = String(repostId || "").trim();
  if (!rid) return null;
  const isClip = isClipRepostDoc(doc);
  const labels = boardButtonLabels(doc?.guildId, isClip ? "clip" : "repost");
  return (require("../utils/boardsPresentation") as typeof import("../utils/boardsPresentation")).styleBoardButton(
    new ButtonBuilder().setCustomId(`${REPOST_REMOVE_PREFIX}${rid}`).setLabel(labels.remove).setEmoji("🗑️").setStyle(ButtonStyle.Danger),
    doc?.guildId,
    isClip ? "clip" : "repost",
    "remove",
  );
}

function buildBoardMessageComponents(primaryRepostId?, doc?) {
  const rid = String(primaryRepostId || doc?._id || "").trim();
  if (!rid) return [];
  const isClip = isClipRepostDoc(doc);
  const buttons = [buildRepostaButton(rid, doc?.guildId, isClip ? "clip" : "repost")];
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
