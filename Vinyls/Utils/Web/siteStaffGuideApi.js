const IDs = require("../Config/ids");
const { sanitizeDiscordChannelName } = require("../Discord/discordDisplayName");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const {
  listReadableStaffGuideSections,
  memberCanReadStaffGuideSection,
} = require("../Staff/staffGuideAccess");
const {
  buildStaffGuideIntroMarkdown,
  buildStaffGuideSectionMarkdown,
  getStaffGuideSectionMeta,
  getStaffGuideChildSectionIds,
  listStaffGuideSectionMeta,
} = require("../Staff/staffGuideContent");

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function humanizeIdKey(key) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
}

function buildRoleNameMap(guild) {
  const map = new Map();
  const roles = IDs.roles || {};
  for (const [key, id] of Object.entries(roles)) {
    const rid = String(id || "").trim();
    if (!rid) continue;
    const fromGuild = guild?.roles?.cache?.get?.(rid);
    const name = fromGuild?.name || key;
    map.set(rid, name);
  }
  if (guild?.roles?.cache) {
    for (const role of guild.roles.cache.values()) {
      if (role?.id && role?.name) map.set(String(role.id), role.name);
    }
  }
  return map;
}

function buildChannelNameMap(guild) {
  const map = new Map();
  const channels = IDs.channels || {};
  for (const [key, id] of Object.entries(channels)) {
    const cid = String(id || "").trim();
    if (!cid) continue;
    const fromGuild = guild?.channels?.cache?.get?.(cid);
    const name = sanitizeDiscordChannelName(fromGuild?.name || key);
    map.set(cid, name);
  }
  if (guild?.channels?.cache) {
    for (const ch of guild.channels.cache.values()) {
      if (ch?.id && ch?.name) map.set(String(ch.id), sanitizeDiscordChannelName(ch.name));
    }
  }
  return map;
}

function buildUserNameMap(guild, extra = null) {
  const map = new Map();
  if (extra && typeof extra.entries === "function") {
    for (const [id, name] of extra.entries()) {
      const uid = String(id || "").trim();
      const label = String(name || "").trim();
      if (uid && label) map.set(uid, label);
    }
  }
  for (const [key, id] of Object.entries(IDs.bots || {})) {
    const uid = String(id || "").trim();
    if (!uid || map.has(uid)) continue;
    if (key === "ViniliCaffeBot") map.set(uid, "Vinili");
    else if (key === "ViniliCaffeBotTest") map.set(uid, "Vinili (test)");
    else map.set(uid, humanizeIdKey(key));
  }
  if (guild?.members?.cache) {
    for (const member of guild.members.cache.values()) {
      const uid = String(member?.id || member?.user?.id || "").trim();
      if (!uid || map.has(uid)) continue;
      const label = String(member?.displayName || member?.user?.globalName || member?.user?.username || "").trim();
      if (label) map.set(uid, label);
    }
  }
  const users = guild?.client?.users?.cache;
  if (users) {
    for (const user of users.values()) {
      const uid = String(user?.id || "").trim();
      if (!uid || map.has(uid)) continue;
      const label = String(user?.globalName || user?.username || "").trim();
      if (label) map.set(uid, label);
    }
  }
  return map;
}

function collectMentionUserIds(markdown) {
  const ids = [];
  const re = /<@!?(\d{16,22})>/g;
  let m;
  const text = String(markdown || "");
  while ((m = re.exec(text))) ids.push(m[1]);
  return [...new Set(ids)];
}

async function resolveGuideUserNames(client, guild, markdown) {
  const map = buildUserNameMap(guild);
  const missing = collectMentionUserIds(markdown).filter((id) => !map.has(id));
  if (!missing.length || !client?.users?.fetch) return map;
  const chunkSize = 5;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          const user = await client.users.fetch(uid);
          const label = String(user?.globalName || user?.username || "").trim();
          if (label) map.set(uid, label);
        } catch {
                  }
      }),
    );
  }
  return map;
}

function applyInlineMarkdown(escaped) {
  let s = String(escaped || "");
    s = s.replace(
    /\[([^\]]+)\]\(\s*(?:&lt;)?(https?:\/\/[^)\s&]+)(?:&gt;)?\s*\)/gi,
    (_m, label, url) => {
      const safeUrl = String(url).replace(/&amp;/g, "&").replace(/"/g, "");
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  );
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*__(.+?)__\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/__\*\*(.+?)\*\*__/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<em>$1</em>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/_(.+?)_/g, "<em>$1</em>");
  return s;
}

function formatQuotedOrHeadingLine(line, formatInline) {
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

function discordGuideMarkdownToHtml(markdown, { guild, userNames = null } = {}) {
  const roleNames = buildRoleNameMap(guild);
  const channelNames = buildChannelNameMap(guild);
  const userNameMap = buildUserNameMap(guild, userNames);
  const tokens = [];
  const stash = (html) => {
    const key = `\u0000VC${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let text = String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

    text = text.replace(/<(a?):([A-Za-z0-9_~]+):(\d+)>/g, (_m, animated, name, id) => {
    const src = animated
      ? `https://cdn.discordapp.com/emojis/${id}.webp?size=64&animated=true`
      : `https://cdn.discordapp.com/emojis/${id}.webp?size=64&quality=lossless`;
    return stash(
      `<img class="vc-emoji vc-discord-emoji vc-staff-guide-emoji" src="${src}" alt=":${escapeHtml(name)}:" width="22" height="22" loading="lazy" decoding="async" />`,
    );
  });

    text = text.replace(/\[([^\]]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi, (_m, label, url) => {
    const safeUrl = String(url || "").replace(/"/g, "");
    return stash(
      `<a class="vc-staff-guide-link" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`,
    );
  });

  text = text.replace(/<@&(\d+)>/g, (_m, id) => {
    const name = roleNames.get(String(id)) || "Ruolo";
    return stash(`<span class="vc-staff-guide-mention vc-staff-guide-mention--role">@${escapeHtml(name)}</span>`);
  });
  text = text.replace(/<#(\d+)>/g, (_m, id) => {
    const name = channelNames.get(String(id)) || "canale";
    return stash(`<span class="vc-staff-guide-mention vc-staff-guide-mention--channel">#${escapeHtml(name)}</span>`);
  });
  text = text.replace(/<@!?(\d+)>/g, (_m, id) => {
    const name = userNameMap.get(String(id)) || null;
    const label = name || "Utente";
    return stash(
      `<span class="vc-staff-guide-mention vc-staff-guide-mention--user" title="${escapeHtml(id)}">@${escapeHtml(label)}</span>`,
    );
  });

  function restoreTokens(fragment) {
    return String(fragment || "").replace(/\u0000VC(\d+)\u0000/g, (_m, idx) => tokens[Number(idx)] || "");
  }

  function formatInline(raw) {
    return restoreTokens(applyInlineMarkdown(escapeHtml(raw)));
  }

  const lines = text.split("\n");
  const htmlParts = [];
  let inCode = false;
  let codeBuf = [];
  let quoteBuf = [];

  function flushQuote() {
    if (!quoteBuf.length) return;
    const inner = quoteBuf.map((line) => formatQuotedOrHeadingLine(line, formatInline)).join("");
    htmlParts.push(`<blockquote class="vc-staff-guide-quote">${inner}</blockquote>`);
    quoteBuf = [];
  }

  function flushCode() {
    if (!codeBuf.length) return;
    htmlParts.push(`<pre class="vc-staff-guide-code"><code>${escapeHtml(restoreTokens(codeBuf.join("\n")))}</code></pre>`);
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

    if (!trimmed) {
      continue;
    }

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

async function buildIntroPayload(client, guild) {
  const markdown = buildStaffGuideIntroMarkdown();
  const userNames = await resolveGuideUserNames(client, guild, markdown);
  return {
    title: "Guida staff",
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild, userNames }),
  };
}

async function buildSectionPayload(client, member, sectionId) {
  const meta = getStaffGuideSectionMeta(sectionId);
  const markdown = buildStaffGuideSectionMarkdown(sectionId);
  if (!meta || markdown == null) return null;

  const guild = member?.guild || null;
  const children = getStaffGuideChildSectionIds(sectionId)
    .filter((cid) => memberCanReadStaffGuideSection(member, cid))
    .map((cid) => {
      const childMeta = getStaffGuideSectionMeta(cid);
      return childMeta
        ? { id: childMeta.id, label: childMeta.label, description: childMeta.description }
        : { id: cid, label: cid, description: "" };
    });

  const userNames = await resolveGuideUserNames(client, guild, markdown);
  const payload = {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild, userNames }),
  };
  if (meta.parent) payload.parent = meta.parent;
  if (children.length) payload.children = children;
  return payload;
}

async function handleSiteStaffGuideGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const member = access.member;
    const sectionId = String(req.query?.section || "").trim();

    if (sectionId) {
      if (!listStaffGuideSectionMeta().some((s) => s.id === sectionId)) {
        return res.status(404).json({
          ok: false,
          error: "unknown_section",
          message: "Sezione guida non trovata.",
        });
      }
      if (!memberCanReadStaffGuideSection(member, sectionId)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden_section",
          message: "Non hai i permessi per leggere questa sezione della guida.",
        });
      }
      const section = await buildSectionPayload(client, member, sectionId);
      if (!section) {
        return res.status(404).json({
          ok: false,
          error: "section_unavailable",
          message: "Sezione non disponibile.",
        });
      }
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json({ ok: true, section });
    }

    const sections = listReadableStaffGuideSections(member);
    const intro = await buildIntroPayload(client, member.guild);
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).json({ ok: true, sections, intro });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-guide:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffGuideGet,
  discordGuideMarkdownToHtml,
};
