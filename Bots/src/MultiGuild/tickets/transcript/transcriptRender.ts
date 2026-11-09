/** Trascrizioni: come si disegnano in HTML messaggi, embed, allegati, sticker, bottoni ed emoji (con le immagini incorporate). */
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

  return "@utente";
}

function getRoleMentionLabel(message?, roleId?) {
  const role = message.guild?.roles?.cache?.get(roleId) || message.mentions?.roles?.get?.(roleId);
  if (role?.name) return `@${role.name}`;
  return "@ruolo";
}

function getChannelMentionLabel(message?, channelId?) {
  const channel = message.guild?.channels?.cache?.get(channelId) || message.mentions?.channels?.get?.(channelId);
  if (channel?.name) return `#${channel.name}`;
  return "#canale";
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
  /* link mascherati [testo](url) e link nudi */
  s = s.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (_?, label?, url?) =>
    park(`<a class="md-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(label)}</a>`),
  );
  s = s.replace(/<?(https?:\/\/[^\s<>]+[^\s<>.,;:!?)'"\]])>?/g, (_?, url?) =>
    park(`<a class="md-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(url)}</a>`),
  );

  const apply = (re?, open?, close?) => {
    s = s.replace(re, (_?, inner?) => park(`${open}${renderMarkdownSegment(inner)}${close}`));
  };
  apply(/\*\*(.+?)\*\*/gs, "<strong>", "</strong>");
  apply(/__(.+?)__/gs, "<u>", "</u>");
  apply(/~~(.+?)~~/gs, "<s>", "</s>");
  apply(/\|\|(.+?)\|\|/gs, '<span class="spoiler" title="Spoiler">', "</span>");
  s = s.replace(/(^|[^\w_])_([^_\n]+)_(?![\w_])/g, (_?, pre?, inner?) => `${pre}${park(`<em>${renderMarkdownSegment(inner)}</em>`)}`);
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (_?, pre?, inner?) => `${pre}${park(`<em>${renderMarkdownSegment(inner)}</em>`)}`);

  s = escapeHtml(s).replace(/\u0000(\d+)\u0000/g, (_?, idx?) => slots[Number(idx)] || "");
  return s;
}

function renderRichTextHtml(message?, text?, options: Record<string, any> = {}) {
  const input = String(text || "");
  const out = [];
  const fence = /```(?:([a-zA-Z0-9_+.-]{1,20})\n)?([\s\S]*?)```/g;
  let last = 0;
  let m;
  while ((m = fence.exec(input)) !== null) {
    out.push(renderBlocksHtml(message, input.slice(last, m.index), options));
    const code = String(m[2] || "").replace(/^\n+|\n+$/g, "");
    out.push(`<pre class="codeblock"${m[1] ? ` data-lang="${escapeHtml(m[1])}"` : ""}><code>${escapeHtml(code)}</code></pre>`);
    last = fence.lastIndex;
  }
  out.push(renderBlocksHtml(message, input.slice(last), options));
  return out.filter(Boolean).join("");
}

/** Righe con significato in Discord: > citazione, >>> citazione lunga, # titoli, -# piccolo, - elenchi. */
function renderBlocksHtml(message?, text?, options: Record<string, any> = {}) {
  const src = String(text || "");
  if (!src.trim()) return "";
  const lines = src.replace(/^\n+|\n+$/g, "").split("\n");
  const html = [];
  let quote = [];
  let list = [];
  const inline = (t?) => renderInlineRichTextHtml(message, t, options);
  const flushQuote = () => {
    if (!quote.length) return;
    html.push(`<blockquote class="md-quote">${quote.map(inline).join("<br>")}</blockquote>`);
    quote = [];
  };
  const flushList = () => {
    if (!list.length) return;
    html.push(`<ul class="md-list">${list.map((li?) => `<li>${inline(li)}</li>`).join("")}</ul>`);
    list = [];
  };
  let plain = [];
  const flushPlain = () => {
    if (!plain.length) return;
    html.push(plain.map(inline).join("<br>"));
    plain = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^>>> ?/.test(line)) {
      flushPlain();
      flushList();
      quote.push(line.replace(/^>>> ?/, ""), ...lines.slice(i + 1));
      break;
    }
    if (/^> ?/.test(line) && line.trim() !== ">") {
      flushPlain();
      flushList();
      quote.push(line.replace(/^> ?/, ""));
      continue;
    }
    flushQuote();
    const h = line.match(/^(#{1,3}) (.+)$/);
    if (h) {
      flushPlain();
      flushList();
      html.push(`<div class="md-h md-h${h[1].length}">${inline(h[2])}</div>`);
      continue;
    }
    const sub = line.match(/^-# (.+)$/);
    if (sub) {
      flushPlain();
      flushList();
      html.push(`<div class="md-sub">${inline(sub[1])}</div>`);
      continue;
    }
    const li = line.match(/^\s*[-*] (.+)$/);
    if (li) {
      flushPlain();
      list.push(li[1]);
      continue;
    }
    flushList();
    plain.push(line);
  }
  flushQuote();
  flushList();
  flushPlain();
  return html.join("");
}

function renderInlineRichTextHtml(message?, text?, options: Record<string, any> = {}) {
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
  return out;
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

export = { escapeHtml, formatDate, createMediaBudget, renderRichTextPlain, messageAuthorLabel, messageContentToHtml };
