const IDs = require("../Config/ids");
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
    const name = fromGuild?.name || key;
    map.set(cid, name);
  }
  if (guild?.channels?.cache) {
    for (const ch of guild.channels.cache.values()) {
      if (ch?.id && ch?.name) map.set(String(ch.id), ch.name);
    }
  }
  return map;
}

function applyInlineMarkdown(escaped) {
  let s = String(escaped || "");
  // Links: [label](url) or Discord [label](<url>)
  s = s.replace(/\[([^\]]+)\]\(\s*<?(https?:\/\/[^)\s>]+)>?\s*\)/gi, (_m, label, url) => {
    const safeUrl = String(url).replace(/"/g, "");
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  // Bold / italic / underline / code (order matters)
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  s = s.replace(/\*\*__(.+?)__\*\*/g, "<strong><em>$1</em></strong>");
  s = s.replace(/__\*\*(.+?)\*\*__/g, "<strong><em>$1</em></strong>");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__(.+?)__/g, "<em>$1</em>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/_(.+?)_/g, "<em>$1</em>");
  return s;
}

/**
 * Convert Discord-flavored markdown (as used in staff guide embeds) to simple HTML.
 */
function discordGuideMarkdownToHtml(markdown, { guild } = {}) {
  const roleNames = buildRoleNameMap(guild);
  const channelNames = buildChannelNameMap(guild);
  const tokens = [];
  const stash = (html) => {
    const key = `\u0000VC${tokens.length}\u0000`;
    tokens.push(html);
    return key;
  };

  let text = String(markdown || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Custom emoji → img (placeholder until after escape)
  text = text.replace(/<(a?):([A-Za-z0-9_~]+):(\d+)>/g, (_m, animated, name, id) => {
    const ext = animated ? "gif" : "png";
    const src = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=48&quality=lossless`;
    return stash(
      `<img class="vc-staff-guide-emoji" src="${src}" alt=":${escapeHtml(name)}:" width="22" height="22" loading="lazy" />`,
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
    return stash(`<span class="vc-staff-guide-mention vc-staff-guide-mention--user">@${escapeHtml(id)}</span>`);
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
    const inner = quoteBuf.map((line) => formatInline(line)).join("<br />");
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

    if (rawLine.startsWith(">")) {
      quoteBuf.push(rawLine.replace(/^>\s?/, ""));
      continue;
    }
    flushQuote();

    if (!trimmed) {
      htmlParts.push("<br />");
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

    htmlParts.push(`<p class="vc-staff-guide-p">${formatInline(rawLine)}</p>`);
  }

  flushQuote();
  if (inCode) flushCode();

  return htmlParts.join("\n");
}

function buildIntroPayload(guild) {
  const markdown = buildStaffGuideIntroMarkdown();
  return {
    title: "Guida staff",
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild }),
  };
}

function buildSectionPayload(member, sectionId) {
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

  const payload = {
    id: meta.id,
    label: meta.label,
    description: meta.description,
    markdown,
    html: discordGuideMarkdownToHtml(markdown, { guild }),
  };
  if (meta.parent) payload.parent = meta.parent;
  if (children.length) payload.children = children;
  return payload;
}

/**
 * GET Bearer [?section=id] — sezioni guida staff leggibili dal membro.
 */
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
      const section = buildSectionPayload(member, sectionId);
      res.setHeader("Cache-Control", "private, max-age=60");
      return res.status(200).json({ ok: true, section });
    }

    const sections = listReadableStaffGuideSections(member);
    const intro = buildIntroPayload(member.guild);
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
