"use strict";

/**
 * Shared Discord-ish markdown → HTML for staff guide (API + static bake).
 * Handles: custom emoji, [label](url) / [label](<url>), <@user>, <@&role>, <#ch>, bare URLs.
 * guideCatalogNames1: role/channel/bot labels from idsCatalog (nomi Discord reali), non dai key JS.
 */

function escapeHtml(text?) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function humanizeIdKey(key?) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function loadIdsCatalogEntries() {
  try {
    const catalog = require("../../Config/idsCatalog") as typeof import("../../Config/idsCatalog");
    return catalog && catalog.entries ? catalog.entries : null;
  } catch {
    return null;
  }
}

function sanitizeChannelLabel(raw?) {
  try {
    const { sanitizeDiscordChannelName } = require("../utils/discordDisplayName") as typeof import("../utils/discordDisplayName");
    return sanitizeDiscordChannelName(raw) || String(raw || "").trim();
  } catch {
    return String(raw || "")
      .replace(/\u3164/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
}

/** Hardcoded labels for bake (no Discord client). Override via opts.userNames Map. */
const KNOWN_GUIDE_USERS = {
  /* Owner — username Discord reale (global_name filler); probe 2026-09-20 */
  "295500038401163264": "terronizzarsi",
};

function shortGuideLinkLabel(url?) {
  const raw = String(url || "").trim();
  if (!raw) return "Link";
  try {
    const u = new URL(raw);
    const host = String(u.hostname || "")
      .replace(/^www\./i, "")
      .toLowerCase();
    const path = String(u.pathname || "/");
    const q = String(u.search || "");
    if (host === "viniliecaffe.it" || host.endsWith(".viniliecaffe.it")) {
      if (/\/tickets\/?/i.test(path)) {
        return /view=staff/i.test(q) ? "Ticket staff" : "Ticket";
      }
      if (/\/staff\/compiti/i.test(path)) return "Compiti staff";
      if (/\/staff\/guida|\/guida\/?/i.test(path)) return "Guida staff";
      if (/\/pause\/?/i.test(path)) return "Pause staff";
      if (/\/staff\/?/i.test(path)) return "Area staff";
      if (/\/personalizza|\/rank/i.test(path)) return "Personalizza rank";
      if (/\/notifications/i.test(path)) return "Notifiche";
      if (path === "/" || path === "") return "Vinili & Caffè";
      const seg = path
        .split("/")
        .filter(Boolean)
        .pop();
      if (seg) return humanizeIdKey(decodeURIComponent(seg));
    }
    if (host === "docs.google.com" || host === "drive.google.com") {
      return "Documento Google";
    }
  } catch {
    /* ignore */
  }
  if (raw.length > 52) return raw.slice(0, 49) + "…";
  return raw;
}

function buildCatalogIdNameMap(kind?) {
  const map = new Map();
  const entries = loadIdsCatalogEntries();
  const list = entries && Array.isArray(entries[kind]) ? entries[kind] : [];
  for (const row of list) {
    const id = String(row?.id || "").trim();
    const name = String(row?.name || "").trim();
    if (id && name) map.set(id, name);
  }
  return map;
}

function buildDefaultRoleNameMap(IDs?) {
  const map = buildCatalogIdNameMap("roles");
  /* fallback: key JS solo se manca nel catalogo */
  const roles = (IDs && IDs.roles) || {};
  for (const [key, id] of Object.entries(roles)) {
    const rid = String(id || "").trim();
    if (!rid || map.has(rid)) continue;
    map.set(rid, humanizeIdKey(key) || key);
  }
  if (IDs && Array.isArray(IDs.fullCatalog?.roles)) {
    for (const row of IDs.fullCatalog.roles) {
      const rid = String(row?.id || "").trim();
      const name = String(row?.name || "").trim();
      if (rid && name) map.set(rid, name);
    }
  }
  return map;
}

function buildDefaultChannelNameMap(IDs?) {
  const map = new Map();
  const fromCatalog = buildCatalogIdNameMap("channels");
  for (const [id, name] of fromCatalog.entries()) {
    map.set(id, sanitizeChannelLabel(name));
  }
  const channels = (IDs && IDs.channels) || {};
  for (const [key, id] of Object.entries(channels)) {
    const cid = String(id || "").trim();
    if (!cid || map.has(cid)) continue;
    map.set(cid, sanitizeChannelLabel(humanizeIdKey(key) || key));
  }
  if (IDs && Array.isArray(IDs.fullCatalog?.channels)) {
    for (const row of IDs.fullCatalog.channels) {
      const cid = String(row?.id || "").trim();
      const name = String(row?.name || "").trim();
      if (cid && name) map.set(cid, sanitizeChannelLabel(name));
    }
  }
  return map;
}

function buildDefaultUserNameMap(IDs?, extra?) {
  const map = new Map();
  for (const [id, name] of Object.entries(KNOWN_GUIDE_USERS)) {
    map.set(id, name);
  }
  const fromCatalog = buildCatalogIdNameMap("bots");
  for (const [id, name] of fromCatalog.entries()) {
    map.set(id, name);
  }
  const bots = (IDs && IDs.bots) || {};
  for (const [key, id] of Object.entries(bots)) {
    const uid = String(id || "").trim();
    if (!uid || map.has(uid)) continue;
    if (key === "ViniliCaffeBot") map.set(uid, "Vinili");
    else if (key === "ViniliCaffeBotTest") map.set(uid, "Vinili (test)");
    else map.set(uid, humanizeIdKey(key) || key);
  }
  if (IDs && Array.isArray(IDs.fullCatalog?.bots)) {
    for (const row of IDs.fullCatalog.bots) {
      const uid = String(row?.id || "").trim();
      const name = String(row?.name || "").trim();
      if (uid && name) map.set(uid, name);
    }
  }
  if (extra && typeof extra.entries === "function") {
    for (const [id, name] of extra.entries()) {
      const uid = String(id || "").trim();
      const label = String(name || "").trim();
      if (uid && label) map.set(uid, label);
    }
  } else if (extra && typeof extra === "object") {
    for (const [id, name] of Object.entries(extra)) {
      const uid = String(id || "").trim();
      const label = String(name || "").trim();
      if (uid && label) map.set(uid, label);
    }
  }
  return map;
}

function applyInlineMarkdown(escaped?) {
  let s = String(escaped || "");
  /* residual md links after escape: [label](&lt;url&gt;) or [label](url) */
  s = s.replace(
    /\[([^\]]+)\]\(\s*(?:&lt;)?(https?:\/\/[^)\s]+?)(?:&gt;)?\s*\)/gi,
    (_m?, label?, url?) => {
      const safeUrl = String(url)
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/"/g, "");
      return `<a class="vc-staff-guide-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*__(.+?)__\*\*/g, "<strong><u>$1</u></strong>");
  s = s.replace(/__\*\*(.+?)\*\*__/g, "<strong><u>$1</u></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<u>$1</u>");
  s = s.replace(/~~(.+?)~~/g, "<s>$1</s>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/_(.+?)_/g, "<em>$1</em>");
  return s;
}

function formatQuotedOrHeadingLine(line?, formatInline?) {
  const trimmed = String(line || "").trim();
  if (/^###\s+/.test(trimmed)) {
    return `<h3 class="vc-staff-guide-h3">${formatInline(trimmed.replace(/^###\s+/, ""))}</h3>`;
  }
  if (/^##\s+/.test(trimmed)) {
    return `<h2 class="vc-staff-guide-h2">${formatInline(trimmed.replace(/^##\s+/, ""))}</h2>`;
  }
  if (/^#\s+/.test(trimmed)) {
    return `<h2 class="vc-staff-guide-h2">${formatInline(trimmed.replace(/^#\s+/, ""))}</h2>`;
  }
  if (/^-#\s+/.test(trimmed)) {
    return `<p class="vc-staff-guide-sub">${formatInline(trimmed.replace(/^-#\s+/, ""))}</p>`;
  }
  if (!trimmed) return "";
  return `<p class="vc-staff-guide-p vc-staff-guide-p--quote">${formatInline(line)}</p>`;
}

/**
 * @param {string} markdown
 * @param {{ IDs?: object, roleNames?: Map, channelNames?: Map, userNames?: Map|object }} [opts]
 */
function discordGuideMarkdownToHtml(markdown?, opts: Record<string, any> = {}) {
  const IDs = opts.IDs || null;
  const roleNames = opts.roleNames || buildDefaultRoleNameMap(IDs);
  const channelNames = opts.channelNames || buildDefaultChannelNameMap(IDs);
  const userNameMap = buildDefaultUserNameMap(IDs, opts.userNames || null);

  const tokens = [];
  const stash = (html?) => {
    const key = `\u0000VC${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let text = String(markdown || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  text = text.replace(/<(a?):([A-Za-z0-9_~]+):(\d{5,32})>/g, (_m?, animated?, name?, id?) => {
    const src = animated
      ? `https://cdn.discordapp.com/emojis/${id}.webp?size=64&animated=true`
      : `https://cdn.discordapp.com/emojis/${id}.webp?size=64&quality=lossless`;
    return stash(
      `<img class="vc-emoji vc-discord-emoji vc-staff-guide-emoji" src="${src}" alt=":${escapeHtml(name)}:" width="22" height="22" loading="lazy" decoding="async" />`,
    );
  });

  /* Discord md links: [label](url) and [label](<url>) */
  text = text.replace(/\[([^\]]+)\]\(\s*<?((?:https?:\/\/)[^)\s>]+)>?\s*\)/gi, (_m?, label?, url?) => {
    const safeUrl = String(url || "").replace(/"/g, "");
    return stash(
      `<a class="vc-staff-guide-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
  });

  text = text.replace(/<@&(\d{5,32})>/g, (_m?, id?) => {
    const name = roleNames.get(String(id)) || "Ruolo";
    return stash(
      `<span class="vc-staff-guide-mention vc-staff-guide-mention--role">@${escapeHtml(name)}</span>`,
    );
  });
  text = text.replace(/<#(\d{5,32})>/g, (_m?, id?) => {
    const name = channelNames.get(String(id)) || "canale";
    return stash(
      `<span class="vc-staff-guide-mention vc-staff-guide-mention--channel">#${escapeHtml(name)}</span>`,
    );
  });
  text = text.replace(/<@!?(\d{5,32})>/g, (_m?, id?) => {
    const name = userNameMap.get(String(id)) || "Utente";
    return stash(
      `<span class="vc-staff-guide-mention vc-staff-guide-mention--user" title="${escapeHtml(id)}">@${escapeHtml(name)}</span>`,
    );
  });

  /* Bare URLs (after md-links already stashed) */
  text = text.replace(/https?:\/\/[^\s<>"'`]+/gi, (url?) => {
    const clean = String(url).replace(/[),.;!?]+$/g, "");
    const trail = String(url).slice(clean.length);
    const label = shortGuideLinkLabel(clean);
    return (
      stash(
        `<a class="vc-staff-guide-link" href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
      ) + trail
    );
  });

  function restoreTokens(fragment?) {
    return String(fragment || "").replace(/\u0000VC(\d+)\u0000/g, (_m?, idx?) => tokens[Number(idx)] || "");
  }

  function formatInline(raw?) {
    return restoreTokens(applyInlineMarkdown(escapeHtml(raw)));
  }

  const lines = text.split("\n");
  const htmlParts = [];
  let inCode = false;
  let codeBuf = [];
  let quoteBuf = [];

  function flushQuote() {
    if (!quoteBuf.length) return;
    const inner = quoteBuf.map((line?) => formatQuotedOrHeadingLine(line, formatInline)).join("");
    htmlParts.push(`<blockquote class="vc-staff-guide-quote">${inner}</blockquote>`);
    quoteBuf = [];
  }

  function flushCode() {
    if (!codeBuf.length) return;
    htmlParts.push(
      `<pre class="vc-staff-guide-code"><code>${escapeHtml(restoreTokens(codeBuf.join("\n")))}</code></pre>`,
    );
    codeBuf = [];
  }

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```") || trimmed.includes("```")) {
      const onlyFence = /^```/.test(trimmed) || trimmed === "```";
      if (onlyFence || /^```/.test(trimmed)) {
        if (inCode) {
          flushCode();
          inCode = false;
        } else {
          flushQuote();
          inCode = true;
        }
        continue;
      }
    }
    if (inCode) {
      codeBuf.push(rawLine);
      continue;
    }

    if (/^>\s?/.test(rawLine) || rawLine.startsWith(">")) {
      quoteBuf.push(rawLine.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();

    if (!trimmed) continue;

    if (/^###\s+/.test(trimmed)) {
      htmlParts.push(`<h3 class="vc-staff-guide-h3">${formatInline(trimmed.replace(/^###\s+/, ""))}</h3>`);
      continue;
    }
    if (/^##\s+/.test(trimmed)) {
      htmlParts.push(`<h2 class="vc-staff-guide-h2">${formatInline(trimmed.replace(/^##\s+/, ""))}</h2>`);
      continue;
    }
    if (/^#\s+/.test(trimmed)) {
      htmlParts.push(`<h2 class="vc-staff-guide-h2">${formatInline(trimmed.replace(/^#\s+/, ""))}</h2>`);
      continue;
    }
    if (/^-#\s+/.test(trimmed)) {
      htmlParts.push(`<p class="vc-staff-guide-sub">${formatInline(trimmed.replace(/^-#\s+/, ""))}</p>`);
      continue;
    }

    const restoredStart = restoreTokens(trimmed).slice(0, 120);
    const isTreeLine = /alt=":[^"]*(?:Reply|Dot|DoubleReply)[^"]*:"/i.test(restoredStart);
    if (isTreeLine) {
      htmlParts.push(`<p class="vc-staff-guide-p vc-staff-guide-p--tree">${formatInline(rawLine)}</p>`);
      continue;
    }

    htmlParts.push(`<p class="vc-staff-guide-p">${formatInline(rawLine)}</p>`);
  }

  flushQuote();
  if (inCode) flushCode();

  return htmlParts.join("");
}

export = {
  escapeHtml,
  humanizeIdKey,
  discordGuideMarkdownToHtml,
  buildDefaultRoleNameMap,
  buildDefaultChannelNameMap,
  buildDefaultUserNameMap,
};
