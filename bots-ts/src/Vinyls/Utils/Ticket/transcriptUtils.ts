const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const BOT_ROOT = path.resolve(__dirname, "..", "..");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");

const MEDIA_FETCH_TIMEOUT_MS = 12_000;
const MEDIA_MAX_BYTES_EACH = 2.5 * 1024 * 1024;
const MEDIA_MAX_BYTES_TOTAL = 28 * 1024 * 1024;
const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg)(?:\?|$)/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov)(?:\?|$)/i;

function escapeHtml(value?) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(timestamp?) {
  try {
    const value = new Date(timestamp);
    if (Number.isNaN(value.getTime())) return String(timestamp || "");
    return new Intl.DateTimeFormat("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value);
  } catch {
    return String(timestamp || "");
  }
}

function colorToCss(color?) {
  if (color == null || color === "") return "#5865f2";
  if (typeof color === "string" && /^#?[0-9a-f]{6}$/i.test(color.trim())) {
    const hex = color.trim().replace(/^#/, "");
    return `#${hex}`;
  }
  const n = Number(color);
  if (!Number.isFinite(n) || n < 0) return "#5865f2";
  return `#${Math.max(0, Math.min(0xffffff, Math.floor(n))).toString(16).padStart(6, "0")}`;
}

const RICH_TOKEN_REGEX = /<a?:([a-zA-Z0-9_]+):(\d{17,20})>|<@!?(\d{17,20})>|<@&(\d{17,20})>|<#(\d{17,20})>/g;

function getUserMentionLabel(message?, userId?) {
  const member = message.guild?.members?.cache?.get(userId) || message.mentions?.members?.get?.(userId);
  if (member?.displayName) return `@${member.displayName}`;

  const user = message.client?.users?.cache?.get(userId) || message.mentions?.users?.get?.(userId);
  if (user?.username) return `@${user.username}`;

  return `@user-${userId}`;
}

function getRoleMentionLabel(message?, roleId?) {
  const role = message.guild?.roles?.cache?.get(roleId) || message.mentions?.roles?.get?.(roleId);
  if (role?.name) return `@${role.name}`;
  return `@role-${roleId}`;
}

function getChannelMentionLabel(message?, channelId?) {
  const channel = message.guild?.channels?.cache?.get(channelId) || message.mentions?.channels?.get?.(channelId);
  if (channel?.name) return `#${channel.name}`;
  return `#channel-${channelId}`;
}

function isLikelyImageUrl(url?, contentType?) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  return IMAGE_EXT_RE.test(String(url || ""));
}

function isLikelyVideoUrl(url?, contentType?) {
  const ct = String(contentType || "").toLowerCase();
  if (ct.startsWith("video/")) return true;
  return VIDEO_EXT_RE.test(String(url || ""));
}

function createMediaBudget() {
  return { used: 0, maxTotal: MEDIA_MAX_BYTES_TOTAL, cache: new Map() };
}

async function fetchAsDataUri(url?, budget?) {
  const src = String(url || "").trim();
  if (!src || !/^https?:\/\//i.test(src)) return "";
  if (budget?.cache?.has(src)) return budget.cache.get(src);

  if (budget && budget.used >= budget.maxTotal) return "";

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MEDIA_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(src, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        Accept: "image/*,video/*,*/*;q=0.8",
        "User-Agent": "ViniliTranscriptBot/1.0",
      },
    });
    if (!res.ok) {
      if (budget?.cache) budget.cache.set(src, "");
      return "";
    }
    const mime = String(res.headers.get("content-type") || "application/octet-stream")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!(mime.startsWith("image/") || mime.startsWith("video/"))) {
      if (budget?.cache) budget.cache.set(src, "");
      return "";
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MEDIA_MAX_BYTES_EACH) {
      if (budget?.cache) budget.cache.set(src, "");
      return "";
    }
    if (budget && budget.used + buf.length > budget.maxTotal) {
      if (budget?.cache) budget.cache.set(src, "");
      return "";
    }
    if (budget) budget.used += buf.length;
    const dataUri = `data:${mime};base64,${buf.toString("base64")}`;
    if (budget?.cache) budget.cache.set(src, dataUri);
    return dataUri;
  } catch {
    if (budget?.cache) budget.cache.set(src, "");
    return "";
  } finally {
    clearTimeout(timer);
  }
}

async function resolveMediaSrc(url?, budget?) {
  const remote = String(url || "").trim();
  if (!remote) return "";
  const embedded = await fetchAsDataUri(remote, budget);
  return embedded || remote;
}

function customEmojiUrl(emojiId?, animated?) {
  const ext = animated ? "gif" : "png";
  return `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=96&animated=${animated ? "true" : "false"}`;
}

function countCustomEmojis(text?) {
  const input = String(text || "");
  const re = new RegExp(RICH_TOKEN_REGEX.source, "g");
  let n = 0;
  let m;
  while ((m = re.exec(input)) !== null) {
    if (m[2]) n += 1;
  }
  return n;
}

function isJumboEmojiMessage(text?) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  const withoutCustom = raw.replace(/<a?:[a-zA-Z0-9_]+:\d{17,20}>/g, "");
  const withoutSpace = withoutCustom.replace(/\s+/g, "");
  if (!withoutSpace && countCustomEmojis(raw) > 0 && countCustomEmojis(raw) <= 8) return true;
  return false;
}

function renderMarkdownSegment(raw?) {
  const input = String(raw || "");
  if (!input) return "";
  const slots = [];
  const park = (html?) => {
    const i = slots.length;
    slots.push(html);
    return `\u0000${i}\u0000`;
  };

  let s = input.replace(/`([^`\n]+)`/g, (_?, code?) => park(`<code class="inline-code">${escapeHtml(code)}</code>`));

  const apply = (re?, open?, close?) => {
    s = s.replace(re, (_?, inner?) => park(`${open}${renderMarkdownSegment(inner)}${close}`));
  };
  apply(/\*\*(.+?)\*\*/gs, "<strong>", "</strong>");
  apply(/__(.+?)__/gs, "<u>", "</u>");
  apply(/~~(.+?)~~/gs, "<s>", "</s>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_?, pre?, inner?) => `${pre}${park(`<em>${renderMarkdownSegment(inner)}</em>`)}`);

  s = escapeHtml(s).replace(/\u0000(\d+)\u0000/g, (_?, idx?) => slots[Number(idx)] || "");
  return s;
}

function renderRichTextHtml(message?, text?, options: Record<string, any> = {}) {
  const input = String(text || "");
  const jumbo = options.jumbo === true;
  let out = "";
  let last = 0;
  const regex = new RegExp(RICH_TOKEN_REGEX.source, "g");
  let match;

  while ((match = regex.exec(input)) !== null) {
    out += renderMarkdownSegment(input.slice(last, match.index));

    const full = match[0];
    const emojiName = match[1];
    const emojiId = match[2];
    const userId = match[3];
    const roleId = match[4];
    const channelId = match[5];

    if (emojiId) {
      const animated = full.startsWith("<a:");
      const url = customEmojiUrl(emojiId, animated);
      const cls = jumbo ? "custom-emoji is-jumbo" : "custom-emoji";
      out += `<img class="${cls}" src="${escapeHtml(url)}" alt="${escapeHtml(`:${emojiName}:`)}" title="${escapeHtml(`:${emojiName}:`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
    } else if (userId) {
      out += `<span class="mention mention-user">${escapeHtml(getUserMentionLabel(message, userId))}</span>`;
    } else if (roleId) {
      out += `<span class="mention mention-role">${escapeHtml(getRoleMentionLabel(message, roleId))}</span>`;
    } else if (channelId) {
      out += `<span class="mention mention-channel">${escapeHtml(getChannelMentionLabel(message, channelId))}</span>`;
    } else {
      out += escapeHtml(full);
    }

    last = regex.lastIndex;
  }

  out += renderMarkdownSegment(input.slice(last));
  return out.replace(/\n/g, "<br>");
}

function renderRichTextPlain(message?, text?) {
  return String(text || "").replace(
    RICH_TOKEN_REGEX,
    (full?, emojiName?, emojiId?, userId?, roleId?, channelId?) => {
            if (emojiId) return `:${emojiName}:`;
      if (userId) return `<@${userId}>`;
      if (roleId) return `<@&${roleId}>`;
      if (channelId) return `<#${channelId}>`;
      return full;
    },
  );
}

async function renderEmbedHtml(message?, embed?, budget?) {
  if (!embed) return "";
  const border = colorToCss(embed.hexColor || embed.color);
  const authorName = embed.author?.name ? String(embed.author.name) : "";
  const authorIconRemote = String(embed.author?.iconURL || embed.author?.proxyIconURL || "").trim();
  const authorUrl = String(embed.author?.url || "").trim();
  const title = embed.title ? String(embed.title) : "";
  const titleUrl = String(embed.url || "").trim();
  const description = embed.description ? String(embed.description) : "";
  const footerText = embed.footer?.text ? String(embed.footer.text) : "";
  const footerIconRemote = String(embed.footer?.iconURL || embed.footer?.proxyIconURL || "").trim();
  const ts = embed.timestamp ? formatDate(embed.timestamp) : "";
  const thumbRemote = String(embed.thumbnail?.proxyURL || embed.thumbnail?.url || "").trim();
  const imageRemote = String(embed.image?.proxyURL || embed.image?.url || "").trim();

  const [authorIcon, footerIcon, thumbSrc, imageSrc] = await Promise.all([
    authorIconRemote ? resolveMediaSrc(authorIconRemote, budget) : Promise.resolve(""),
    footerIconRemote ? resolveMediaSrc(footerIconRemote, budget) : Promise.resolve(""),
    thumbRemote ? resolveMediaSrc(thumbRemote, budget) : Promise.resolve(""),
    imageRemote ? resolveMediaSrc(imageRemote, budget) : Promise.resolve(""),
  ]);

  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const fieldsHtml =
    fields.length > 0
      ? `<div class="embed-fields">${fields
          .map((field?) => {
            const inline = field.inline ? " is-inline" : "";
            return `<div class="embed-field${inline}"><div class="embed-field-name">${renderRichTextHtml(
              message,
              field.name,
            )}</div><div class="embed-field-value">${renderRichTextHtml(message, field.value)}</div></div>`;
          })
          .join("")}</div>`
      : "";

  const authorHtml = authorName
    ? `<div class="embed-author">${
        authorIcon
          ? `<img class="embed-author-icon" src="${escapeHtml(authorIcon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
          : ""
      }${
        authorUrl
          ? `<a class="embed-author-name" href="${escapeHtml(authorUrl)}" target="_blank" rel="noreferrer noopener">${escapeHtml(authorName)}</a>`
          : `<span class="embed-author-name">${escapeHtml(authorName)}</span>`
      }</div>`
    : "";

  const titleHtml = title
    ? titleUrl
      ? `<a class="embed-title" href="${escapeHtml(titleUrl)}" target="_blank" rel="noreferrer noopener">${renderRichTextHtml(message, title)}</a>`
      : `<div class="embed-title">${renderRichTextHtml(message, title)}</div>`
    : "";

  const footerBits = [];
  if (footerText) footerBits.push(escapeHtml(footerText));
  if (ts) footerBits.push(escapeHtml(ts));
  const footerHtml =
    footerBits.length > 0
      ? `<div class="embed-footer">${
          footerIcon
            ? `<img class="embed-footer-icon" src="${escapeHtml(footerIcon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : ""
        }<span>${footerBits.join(" • ")}</span></div>`
      : "";

  return `
    <div class="embed" style="border-left-color:${escapeHtml(border)}">
      <div class="embed-layout${thumbSrc ? " has-thumb" : ""}">
        <div class="embed-main">
          ${authorHtml}
          ${titleHtml}
          ${description ? `<div class="embed-description">${renderRichTextHtml(message, description)}</div>` : ""}
          ${fieldsHtml}
          ${footerHtml}
        </div>
        ${
          thumbSrc
            ? `<a class="embed-thumb-wrap" href="${escapeHtml(thumbRemote || thumbSrc)}" target="_blank" rel="noreferrer noopener"><img class="embed-thumb" src="${escapeHtml(thumbSrc)}" alt="thumbnail" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
            : ""
        }
      </div>
      ${
        imageSrc
          ? `<a class="embed-image-wrap" href="${escapeHtml(imageRemote || imageSrc)}" target="_blank" rel="noreferrer noopener"><img class="embed-image" src="${escapeHtml(imageSrc)}" alt="embed" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a>`
          : ""
      }
    </div>
  `;
}

async function renderAttachmentHtml(attachment?, budget?) {
  const name = String(attachment?.name || "file").trim() || "file";
  const remote = String(attachment?.proxyURL || attachment?.url || "").trim();
  if (!remote) return "";
  const contentType = String(attachment?.contentType || "").trim();
  const isImage = isLikelyImageUrl(remote, contentType);
  const isVideo = !isImage && isLikelyVideoUrl(remote, contentType);

  if (isImage) {
    const src = await resolveMediaSrc(remote, budget);
    return `<figure class="att-media"><a href="${escapeHtml(remote)}" target="_blank" rel="noreferrer noopener"><img class="att-image" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"></a><figcaption><a href="${escapeHtml(remote)}" target="_blank" rel="noreferrer noopener">${escapeHtml(name)}</a></figcaption></figure>`;
  }

  if (isVideo) {
    const src = await resolveMediaSrc(remote, budget);
    return `<figure class="att-media"><video class="att-video" controls preload="metadata" src="${escapeHtml(src)}"></video><figcaption><a href="${escapeHtml(remote)}" target="_blank" rel="noreferrer noopener">${escapeHtml(name)}</a></figcaption></figure>`;
  }

  const size = Number(attachment?.size);
  const sizeLabel = Number.isFinite(size) && size > 0 ? ` (${Math.max(1, Math.round(size / 1024))} KB)` : "";
  return `<div class="att-file"><a href="${escapeHtml(remote)}" target="_blank" rel="noreferrer noopener">${escapeHtml(name)}${escapeHtml(sizeLabel)}</a></div>`;
}

async function renderStickerHtml(sticker?, budget?) {
  const name = String(sticker?.name || "sticker").trim() || "sticker";
  const remote = String(sticker?.url || "").trim();
  if (!remote) return `<div class="sticker-fallback">${escapeHtml(`:${name}:`)}</div>`;
  const src = await resolveMediaSrc(remote, budget);
  return `<figure class="att-media is-sticker"><img class="att-sticker" src="${escapeHtml(src)}" alt="${escapeHtml(name)}" title="${escapeHtml(name)}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><figcaption>${escapeHtml(name)}</figcaption></figure>`;
}

function buttonStyleClass(style?) {
  const n = Number(style);
  if (n === 1) return "btn-primary";
  if (n === 3) return "btn-success";
  if (n === 4) return "btn-danger";
  if (n === 5) return "btn-link";
  return "btn-secondary";
}

function componentLabelHtml(comp?) {
  const emoji = comp?.emoji;
  let emojiHtml = "";
  if (emoji?.id) {
    const url = customEmojiUrl(emoji.id, Boolean(emoji.animated));
    emojiHtml = `<img class="btn-emoji" src="${escapeHtml(url)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
  } else if (emoji?.name) {
    emojiHtml = `<span class="btn-emoji-uni">${escapeHtml(emoji.name)}</span>`;
  }
  const label = escapeHtml(String(comp?.label || "").trim());
  return `${emojiHtml}${label ? `<span>${label}</span>` : ""}`;
}

function renderComponentsHtml(message?) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  if (!rows.length) return "";
  const rowsHtml = rows
    .map((row?) => {
      const comps = Array.isArray(row?.components) ? row.components : [];
      if (!comps.length) return "";
      const buttons = comps
        .map((comp?) => {
          const type = Number(comp?.type || comp?.data?.type || 0);
          const looksLikeButton =
            !type || type === 2 || comp?.label != null || comp?.style != null || comp?.url;
          if (!looksLikeButton) {
            const fallback = String(comp?.placeholder || comp?.label || "Componente").trim();
            return `<span class="comp-chip">${escapeHtml(fallback || "Componente")}</span>`;
          }
          const style = buttonStyleClass(comp?.style ?? comp?.data?.style);
          const disabled = comp?.disabled ? " is-disabled" : "";
          const url = String(comp?.url || "").trim();
          const inner = componentLabelHtml(comp);
          if (url) {
            return `<a class="discord-btn ${style}${disabled}" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${inner || "Link"}</a>`;
          }
          return `<span class="discord-btn ${style}${disabled}" role="button" aria-disabled="true">${inner || "Bottone"}</span>`;
        })
        .join("");
      return buttons ? `<div class="action-row">${buttons}</div>` : "";
    })
    .filter(Boolean)
    .join("");
  return rowsHtml ? `<div class="components">${rowsHtml}</div>` : "";
}

function messageAuthorLabel(message?) {
  const memberName = message.member?.displayName || message.member?.nickname;
  if (memberName) return String(memberName);
  const user = message.author;
  if (!user) return "Utente sconosciuto";
  return String(user.displayName || user.globalName || user.username || user.tag || "Utente sconosciuto");
}

async function messageContentToHtml(message?, budget?) {
  let body = "";
  if (message.content) {
    const jumbo = isJumboEmojiMessage(message.content);
    body += `<div class="content${jumbo ? " is-jumbo" : ""}">${renderRichTextHtml(message, message.content, { jumbo })}</div>`;
  }

  if (Array.isArray(message.embeds) && message.embeds.length > 0) {
    for (const embed of message.embeds) {
      body += await renderEmbedHtml(message, embed, budget);
    }
  }

  if (message.stickers?.size > 0) {
    const stickers = [];
    for (const sticker of message.stickers.values()) {
      stickers.push(await renderStickerHtml(sticker, budget));
    }
    if (stickers.length) body += `<div class="stickers">${stickers.join("")}</div>`;
  }

  if (message.attachments?.size > 0) {
    const items = [];
    for (const attachment of message.attachments.values()) {
      items.push(await renderAttachmentHtml(attachment, budget));
    }
    if (items.length) body += `<div class="attachments">${items.join("")}</div>`;
  }

  body += renderComponentsHtml(message);

  if (message.reactions?.cache?.size > 0) {
    const reactions = [];
    for (const reaction of message.reactions.cache.values()) {
      const count = Number(reaction.count || 0);
      if (!(count > 0)) continue;
      const emoji = reaction.emoji;
      let label = "";
      if (emoji?.id) {
        const url = customEmojiUrl(emoji.id, Boolean(emoji.animated));
        label = `<img class="custom-emoji is-reaction" src="${escapeHtml(url)}" alt="${escapeHtml(`:${emoji.name || "emoji"}:`)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
      } else {
        label = `<span class="unicode-emoji">${escapeHtml(emoji?.name || "?")}</span>`;
      }
      reactions.push(
        `<span class="reaction">${label}<span class="reaction-count">${escapeHtml(String(count))}</span></span>`,
      );
    }
    if (reactions.length) body += `<div class="reactions">${reactions.join("")}</div>`;
  }

  if (!body) {
    return "";
  }

  return body;
}

async function fetchAllMessages(channel?, maxMessages = 2000) {
  const results = [];
  let beforeId = null;

  while (results.length < maxMessages) {
    const chunk = await channel.messages
      .fetch({ limit: 100, ...(beforeId ? { before: beforeId } : {}) })
      .catch(() => null);
    if (!chunk || chunk.size === 0) break;

    const list = Array.from(chunk.values());
    results.push(...list);

    if (chunk.size < 100) break;
    beforeId = list[list.length - 1]?.id;
    if (!beforeId) break;
  }

  return results.sort((a?, b?) => a.createdTimestamp - b.createdTimestamp).slice(0, maxMessages);
}

async function createTranscript(channel?) {
  const sorted = await fetchAllMessages(channel);
  let txt = `Transcript del canale: ${channel.name}\n\n`;
  sorted.forEach((msg?) => {
    let content = renderRichTextPlain(msg, msg.content || "");
    if (msg.embeds.length > 0) {
      msg.embeds.forEach((embed?, i?) => {
        content += `\n[Embed ${i + 1}]\n`;
        if (embed.title) content += `Titolo: ${renderRichTextPlain(msg, embed.title)}\n`;
        if (embed.description) content += `Descrizione: ${renderRichTextPlain(msg, embed.description)}\n`;
        if (embed.fields) {
          embed.fields.forEach((f?) => {
            content += `${renderRichTextPlain(msg, f.name)}: ${renderRichTextPlain(msg, f.value)}\n`;
          });
        }
        if (embed.image?.url) content += `[Embed image] ${embed.image.url}\n`;
        if (embed.thumbnail?.url) content += `[Embed thumb] ${embed.thumbnail.url}\n`;
      });
    }
    if (msg.stickers?.size > 0) {
      msg.stickers.forEach((sticker?) => {
        content += `\n[Sticker] ${sticker.name || "sticker"} ${sticker.url || ""}`;
      });
    }
    if (msg.attachments.size > 0) {
      msg.attachments.forEach((att?) => {
        content += `\n[Attachment] ${att.url}`;
      });
    }
    if (!content) content = "*Nessun contenuto messaggio*";
    txt += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${msg.author.tag}: ${content}\n\n`;
  });
  return txt;
}

async function createTranscriptHtml(channel?) {
  const messages = await fetchAllMessages(channel);
  const guildName = escapeHtml(channel.guild?.name || "Server");
  const channelName = escapeHtml(channel.name || "ticket");
  const budget = createMediaBudget();

  const rowParts = [];
  for (const message of messages) {
    const avatar = userAvatarUrlDynamic(message.author, { size: 64 }) || "";
    const author = escapeHtml(messageAuthorLabel(message));
    const time = escapeHtml(formatDate(message.createdTimestamp));
    const isBot = Boolean(message.author?.bot);
    const botTag = isBot ? '<span class="bot-tag" title="Bot">BOT</span>' : "";
    const messageBody = await messageContentToHtml(message, budget);
    if (!messageBody) continue;
    rowParts.push(`
      <article class="msg">
        <img class="avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer">
        <div class="right">
          <div class="meta"><span class="author">${author}</span>${botTag}<span class="time">${time}</span></div>
          ${messageBody}
        </div>
      </article>`);
  }
  const rows = rowParts.join("");

  return `<!doctype html>
<html lang="it" data-vc-tx-modern="1" data-vc-tx-mobile="1">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Transcript #${channelName}</title>
  <style>
    :root {
      --bg: #313338;
      --surface: #313338;
      --surface-soft: #2b2d31;
      --text: #dbdee1;
      --muted: #949ba4;
      --accent: #5865f2;
      --embed-border: #5865f2;
      --line: rgba(0,0,0,0.18);
      --hover: rgba(0,0,0,0.08);
    }
    * { box-sizing: border-box; }
    html, body {
      height: 100%;
      overflow-x: hidden;
      -webkit-text-size-adjust: 100%;
      text-size-adjust: 100%;
    }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    body, body * {
      letter-spacing: normal !important;
      word-spacing: normal !important;
    }
    .wrap { min-height: 100%; padding: 0; }
    .header {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      background: #2b2d31;
      border-bottom: 1px solid #1e1f22;
      box-shadow: 0 1px 0 rgba(0,0,0,0.2);
    }
    .header-hash { color: var(--muted); font-size: 22px; font-weight: 700; line-height: 1; }
    .title { font-size: 16px; font-weight: 700; margin: 0; color: #f2f3f5; }
    .sub { color: var(--muted); font-size: 12px; margin-left: auto; }
    .timeline { padding: 8px 0 24px; }
    .msg {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr);
      gap: 12px;
      padding: 6px 16px;
      border-radius: 0;
    }
    .msg:hover { background: var(--hover); }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #1a1b1e;
      object-fit: cover;
      margin-top: 2px;
    }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; margin-bottom: 2px; }
    .author { font-weight: 600; color: #f2f3f5; font-size: 1rem; }
    .bot-tag {
      display: inline-flex;
      align-items: center;
      height: 15px;
      padding: 0 4px;
      border-radius: 3px;
      background: #5865f2;
      color: #fff;
      font-size: 10px;
      font-weight: 700;
      line-height: 15px;
      text-transform: uppercase;
    }
    .time {
      color: var(--muted);
      font-size: 0.75rem;
      font-weight: 500;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }
    .content { white-space: normal; line-height: 1.375; overflow-wrap: break-word; word-break: break-word; font-size: 1rem; }
    .content.is-jumbo { line-height: 1.1; }
    .inline-code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 0.9em;
      padding: 0.1em 0.35em;
      border-radius: 4px;
      background: rgba(0,0,0,0.35);
    }
    .muted { color: var(--muted); }
    .embed {
      margin-top: 6px;
      border-left: 4px solid var(--embed-border);
      background: var(--surface-soft);
      border-radius: 4px;
      padding: 8px 12px 10px;
      max-width: 520px;
    }
    .embed-layout { display: grid; gap: 10px; }
    .embed-layout.has-thumb {
      grid-template-columns: 1fr 80px;
      align-items: start;
    }
    .embed-author {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .embed-author-icon { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; }
    .embed-author-name { color: #f2f3f5; text-decoration: none; }
    a.embed-author-name:hover { text-decoration: underline; }
    .embed-title {
      display: inline-block;
      font-weight: 700;
      margin-bottom: 4px;
      color: #00a8fc;
      text-decoration: none;
      font-size: 1rem;
    }
    a.embed-title:hover { text-decoration: underline; }
    .embed-description { color: #dbdee1; font-size: 0.9rem; line-height: 1.375; }
    .embed-fields {
      margin-top: 8px;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }
    .embed-field.is-inline { min-width: 0; }
    .embed-field-name { font-weight: 700; font-size: 12px; color: #f2f3f5; margin-bottom: 2px; }
    .embed-field-value { color: #dbdee1; font-size: 13px; }
    .embed-footer {
      margin-top: 8px;
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-size: 12px;
    }
    .embed-footer-icon { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; }
    .embed-thumb-wrap { display: block; }
    .embed-thumb {
      width: 80px;
      height: 80px;
      border-radius: 4px;
      object-fit: cover;
      background: #1a1b1e;
    }
    .embed-image-wrap { display: block; margin-top: 10px; }
    .embed-image {
      display: block;
      max-width: min(100%, 480px);
      max-height: 420px;
      width: auto;
      height: auto;
      border-radius: 4px;
      object-fit: contain;
      background: #1a1b1e;
    }
    .attachments, .stickers { margin-top: 8px; display: grid; gap: 10px; }
    .att-media { margin: 0; max-width: min(100%, 560px); }
    .att-image, .att-video {
      display: block;
      max-width: 100%;
      max-height: 520px;
      width: auto;
      height: auto;
      border-radius: 8px;
      background: #1a1b1e;
      object-fit: contain;
    }
    .att-sticker { display: block; width: 160px; height: 160px; object-fit: contain; }
    .att-media figcaption, .att-file { margin-top: 6px; font-size: 12px; }
    .att-media a, .att-file a { color: #00a8fc; text-decoration: none; }
    .att-media a:hover, .att-file a:hover { text-decoration: underline; }
    .components { margin-top: 8px; display: grid; gap: 6px; }
    .action-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .discord-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 32px;
      padding: 2px 16px;
      border-radius: 3px;
      border: 0;
      font-size: 14px;
      font-weight: 500;
      line-height: 16px;
      color: #fff;
      text-decoration: none;
      cursor: default;
      user-select: none;
      white-space: nowrap;
    }
    .discord-btn .btn-emoji { width: 18px; height: 18px; object-fit: contain; }
    .discord-btn .btn-emoji-uni { font-size: 16px; line-height: 1; }
    .discord-btn.btn-primary { background: #5865f2; }
    .discord-btn.btn-secondary { background: #4e5058; }
    .discord-btn.btn-success { background: #248046; }
    .discord-btn.btn-danger { background: #da373c; }
    .discord-btn.btn-link {
      background: transparent;
      color: #00a8fc;
      padding-left: 4px;
      padding-right: 4px;
    }
    .discord-btn.is-disabled { opacity: 0.5; }
    a.discord-btn { cursor: pointer; }
    a.discord-btn:hover { filter: brightness(1.08); }
    .comp-chip {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      padding: 2px 10px;
      border-radius: 3px;
      background: #4e5058;
      color: #dbdee1;
      font-size: 13px;
    }
    .custom-emoji {
      width: 1.375em;
      height: 1.375em;
      object-fit: contain;
      vertical-align: -0.2em;
    }
    .custom-emoji.is-jumbo {
      width: 48px;
      height: 48px;
      vertical-align: middle;
      margin: 2px;
    }
    .custom-emoji.is-reaction { width: 18px; height: 18px; vertical-align: middle; }
    .reactions { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px; }
    .reaction {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 8px;
      padding: 2px 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .unicode-emoji { font-size: 14px; line-height: 1; }
    .mention {
      display: inline-block;
      padding: 0 2px;
      border-radius: 3px;
      font-weight: 500;
      font-size: 0.95em;
    }
    .mention-user,
    .mention-role,
    .mention-channel {
      background: rgba(88, 101, 242, 0.3);
      color: #c9cdfb;
    }
    html, body { overflow-x: hidden; }
    img, video { max-width: 100%; height: auto; }
    ${TRANSCRIPT_MOBILE_CSS}
  </style>
</head>
<body>
  <main class="wrap">
    <section class="header">
      <span class="header-hash" aria-hidden="true">#</span>
      <h1 class="title">${channelName}</h1>
      <div class="sub">${guildName}</div>
    </section>
    <section class="timeline">
      ${rows || '<article class="msg"><div></div><div class="muted">Nessun messaggio nel ticket.</div></article>'}
    </section>
  </main>
</body>
</html>`;
}

async function saveTranscriptHtml(channel?, html?) {
  const basePath = path.join(BOT_ROOT, "local_transcripts", String(channel.guild?.id || "global"));
  fs.mkdirSync(basePath, { recursive: true });
  const filename = `transcript_${channel.id}_${Date.now()}.html`;
  const filepath = path.join(basePath, filename);
  fs.writeFileSync(filepath, html, "utf8");
  return filepath;
}

const LEGACY_TRANSCRIPT_UPGRADE_CSS = `
html, body { height: 100% !important; }
body {
  margin: 0 !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  background: #313338 !important;
  color: #dbdee1 !important;
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
body, body * {
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
.wrap { max-width: none !important; margin: 0 !important; padding: 0 !important; min-height: 100% !important; }
.header {
  position: sticky !important;
  top: 0 !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 12px 16px !important;
  margin-bottom: 0 !important;
  background: #2b2d31 !important;
  border: 0 !important;
  border-bottom: 1px solid #1e1f22 !important;
  border-radius: 0 !important;
  box-shadow: 0 1px 0 rgba(0,0,0,0.2) !important;
}
.header .title { font-size: 16px !important; margin: 0 !important; color: #f2f3f5 !important; }
.header .sub { color: #949ba4 !important; font-size: 12px !important; margin-left: auto !important; }
.timeline {
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  overflow: visible !important;
  padding: 8px 0 24px !important;
}
.msg {
  display: grid !important;
  grid-template-columns: 40px 1fr !important;
  gap: 12px !important;
  padding: 6px 16px !important;
  border-bottom: 0 !important;
}
.msg:hover { background: rgba(0,0,0,0.08) !important; }
.avatar { width: 40px !important; height: 40px !important; border-radius: 50% !important; margin-top: 2px !important; }
.author { font-weight: 600 !important; color: #f2f3f5 !important; }
.time { color: #949ba4 !important; font-size: 0.75rem !important; }
.embed {
  margin-top: 6px !important;
  border-radius: 4px !important;
  background: #2b2d31 !important;
  max-width: 520px !important;
}
.att-media a, .att-file a, .embed-title { color: #00a8fc !important; }
`;

const TRANSCRIPT_MOBILE_CSS = `
html, body, body * {
  letter-spacing: normal !important;
  word-spacing: normal !important;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}
.msg { grid-template-columns: 40px minmax(0, 1fr) !important; }
.time {
  white-space: nowrap !important;
  font-variant-numeric: tabular-nums !important;
}
.content, .embed-description, .embed-field-value, .embed-title, .embed-footer {
  overflow-wrap: break-word !important;
  word-break: break-word !important;
}
.inline-code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size: 0.9em !important;
  padding: 0.1em 0.35em !important;
  border-radius: 4px !important;
  background: rgba(0,0,0,0.35) !important;
}
@media (max-width: 720px) {
  html, body { overflow-x: hidden !important; -webkit-text-size-adjust: 100%; }
  .header {
    flex-wrap: wrap !important;
    align-items: flex-start !important;
    gap: 4px 8px !important;
    padding: 10px 12px !important;
  }
  .header-hash { font-size: 18px !important; margin-top: 1px !important; }
  .title, .header .title {
    flex: 1 1 0 !important;
    min-width: 0 !important;
    font-size: 14px !important;
    line-height: 1.25 !important;
    overflow: hidden !important;
    text-overflow: ellipsis !important;
    white-space: nowrap !important;
  }
  .sub, .header .sub {
    margin-left: 26px !important;
    width: calc(100% - 26px) !important;
    flex: 1 0 100% !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
    white-space: normal !important;
    overflow-wrap: break-word !important;
  }
  .timeline { padding: 4px 0 20px !important; }
  .msg {
    grid-template-columns: 32px minmax(0, 1fr) !important;
    gap: 8px !important;
    padding: 8px 10px !important;
  }
  .avatar { width: 32px !important; height: 32px !important; }
  .meta { gap: 4px 6px !important; }
  .author { font-size: 0.95rem !important; }
  .time {
    white-space: normal !important;
    font-size: 0.7rem !important;
    line-height: 1.3 !important;
  }
  .content { font-size: 0.95rem !important; }
  .embed {
    max-width: 100% !important;
    width: 100% !important;
    padding: 8px 10px 10px !important;
  }
  .embed-layout.has-thumb {
    grid-template-columns: minmax(0, 1fr) !important;
  }
  .embed-thumb-wrap {
    display: flex !important;
    justify-content: flex-start !important;
  }
  .embed-thumb {
    width: 72px !important;
    height: 72px !important;
  }
  .embed-fields {
    grid-template-columns: 1fr !important;
  }
  .embed-image,
  .att-media,
  .att-image,
  .att-video {
    max-width: 100% !important;
    max-height: min(55vh, 360px) !important;
  }
  .att-sticker { width: 112px !important; height: 112px !important; }
  .action-row {
    flex-direction: column !important;
    align-items: stretch !important;
  }
  .discord-btn {
    width: 100% !important;
    max-width: 100% !important;
    white-space: normal !important;
    text-align: center !important;
    min-height: 36px !important;
    padding: 8px 12px !important;
  }
  .comp-chip { max-width: 100% !important; white-space: normal !important; }
  .custom-emoji.is-jumbo { width: 40px !important; height: 40px !important; }
}
`;

function isModernTranscriptHtml(html?) {
  const s = String(html || "");
  return (
    s.includes('data-vc-tx-modern="1"') ||
    s.includes("header-hash") ||
    s.includes("data-vc-tx-upgrade=")
  );
}

function injectHeadSnippet(html?, snippet?) {
  const raw = String(html || "");
  if (!raw || !snippet) return raw;
  if (/<\/head>/i.test(raw)) return raw.replace(/<\/head>/i, `${snippet}</head>`);
  return `${snippet}${raw}`;
}

function ensureTranscriptMobileCss(html?) {
  let raw = String(html || "");
  if (!raw) return raw;
    raw = raw.replace(/<style\s+data-vc-tx-mobile="[^"]*"[\s\S]*?<\/style>/gi, "");
  raw = raw.replace(/<script\s+data-vc-tx-mobile="[^"]*"[\s\S]*?<\/script>/gi, "");
  return injectHeadSnippet(
    raw,
    `<style data-vc-tx-mobile="2">${TRANSCRIPT_MOBILE_CSS}</style>` +
      `<script data-vc-tx-mobile="2">document.documentElement.setAttribute("data-vc-tx-mobile","2");</script>`,
  );
}

function upgradeMarkdownInStoredHtml(html?) {
  const raw = String(html || "");
  if (!raw) return raw;
    return raw
    .replace(/\*\*([^*<>\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_<>\n]+)__/g, "<u>$1</u>")
    .replace(/~~([^~<>\n]+)~~/g, "<s>$1</s>");
}

function upgradeLegacyTranscriptHtml(html?) {
  let raw = String(html || "");
  if (!raw) return raw;
  if (!isModernTranscriptHtml(raw)) {
    const inject =
      `<style data-vc-tx-upgrade="1">${LEGACY_TRANSCRIPT_UPGRADE_CSS}</style>` +
      `<script data-vc-tx-upgrade="1">document.documentElement.setAttribute("data-vc-tx-modern","1");</script>`;
    raw = injectHeadSnippet(raw, inject);
  }
  raw = upgradeMarkdownInStoredHtml(raw);
  return ensureTranscriptMobileCss(raw);
}

function resolveExistingTranscriptHtmlPath(ticketDoc?) {
  const fp = String(ticketDoc?.transcriptHtmlPath || "").trim();
  if (fp && fs.existsSync(fp)) return fp;
  const base = path.basename(fp);
  if (!base || base === "." || base === "..") return "";
  const guildId = String(ticketDoc?.guildId || "").trim() || "global";
  const candidates = [
    path.join(BOT_ROOT, "local_transcripts", guildId, base),
    path.join(BOT_ROOT, "local_transcripts", base),
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  return "";
}

export = {
  createTranscript,
  createTranscriptHtml,
  saveTranscriptHtml,
  upgradeLegacyTranscriptHtml,
  isModernTranscriptHtml,
  resolveExistingTranscriptHtmlPath,
  fetchAllMessages,
};
