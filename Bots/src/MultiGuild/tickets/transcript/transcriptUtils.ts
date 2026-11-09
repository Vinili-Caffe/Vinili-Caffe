const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { VINILI_ROOT } = require("../../../Vinili/paths") as typeof import("../../../Vinili/paths");
const { TRANSCRIPT_MOBILE_CSS, upgradeLegacyTranscriptHtml } = require("./transcriptStyles") as typeof import("./transcriptStyles");
const { escapeHtml, formatDate, createMediaBudget, renderRichTextPlain, messageAuthorLabel, messageContentToHtml } = require("./transcriptRender") as typeof import("./transcriptRender");


const BOT_ROOT = VINILI_ROOT;
const { userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

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
    beforeId = (list[list.length - 1] as any)?.id;
    if (!beforeId) break;
  }

  return results.sort((a?, b?) => a.createdTimestamp - b.createdTimestamp).slice(0, maxMessages);
}

function authorMetaForTextTranscript(msg?) {
  const tag = String(msg?.author?.tag || msg?.author?.username || "Utente").trim() || "Utente";
  const id = String(msg?.author?.id || "").trim();
  if (!/^\d{16,22}$/.test(id)) return tag;
  let hash = "";
  try {
    const url = userAvatarUrlDynamic(msg.author, { size: 64 }) || "";
    const m = String(url).match(/\/avatars\/\d+\/([^./?#]+)\./);
    if (m?.[1]) hash = m[1];
  } catch {
    hash = "";
  }
  /* Formato: Nome <@id|avatarHash> così il viewer può ricostruire l'immagine. */
  return hash ? `${tag} <${id}|${hash}>` : `${tag} <${id}>`;
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
    txt += `[${new Date(msg.createdTimestamp).toLocaleString()}] ${authorMetaForTextTranscript(msg)}: ${content}\n\n`;
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
  resolveExistingTranscriptHtmlPath,
  fetchAllMessages,
};
