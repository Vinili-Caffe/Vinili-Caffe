const {
  buildPartnershipPingPrefix,
} = require("./partnershipPingUtils") as typeof import("./partnershipPingUtils");
const { unwrapDiscordForwardQuoteDump } = require("./partnershipMessageBody") as typeof import("./partnershipMessageBody");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const DISCORD_INVITE_URL_RE =
  /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite|discord\.com\/invite)\/[A-Za-z0-9-]+(?:\?[^\s<>()[\]"']*)?/gi;

function extractInviteCode(text?) {
  if (!text) return null;
  const fromUrl = extractInviteCodeFromUrl(text);
  if (fromUrl) return fromUrl;
  const fallback = String(text).match(/\b([a-zA-Z0-9-]{6,32})\b/);
  return fallback ? fallback[1] : null;
}

function extractInviteCodeFromUrl(text?) {
  if (!text) return null;
  const patterns = [
    /discord\.gg\/([a-zA-Z0-9-]+)/i,
    /discord\.com\/invite\/([a-zA-Z0-9-]+)/i,
    /discordapp\.com\/invite\/([a-zA-Z0-9-]+)/i,
  ];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function hasRequiredDiscordInviteLink(text?) {
  return Boolean(extractInviteCodeFromUrl(text));
}

function textContainsDiscordInviteUrl(text?) {
  DISCORD_INVITE_URL_RE.lastIndex = 0;
  return DISCORD_INVITE_URL_RE.test(String(text || ""));
}

function normalizePartnerDescriptionInviteLinks(text?, inviteUrl?) {
  const normalized = String(text || "").replace(/\r\n/g, "\n").trim();
  const url = String(inviteUrl || "").trim();
  if (!normalized || !url) return normalized;

  const hadInvite = textContainsDiscordInviteUrl(normalized);
  DISCORD_INVITE_URL_RE.lastIndex = 0;
  let result = normalized.replace(DISCORD_INVITE_URL_RE, url);

  if (!hadInvite && !result.includes(url)) {
    result = `${result}\n${url}`;
  }

  return result.trim();
}

function isValidServerName(name?) {
  if (!name) return false;
  const trimmed = String(name).replace(/\s+/g, " ").trim();
  if (!trimmed) return false;
  return /[\p{L}\p{N}]/u.test(trimmed);
}

function stripLinksFromDescription(text?) {
  const str = String(text || "");
  const withoutNonInviteUrls = str
    .replace(
      /\bhttps?:\/\/(?!discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)\S+/gi,
      " ",
    )
    .replace(/\bwww\.[^\s<>()]+\.[a-z]{2,}(?:\/\S*)?/gi, " ")
    .replace(
      /\b(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<>()]*)?/gi,
      (match?) =>
        /^(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|discord\.com\/invite\/)/i.test(
          String(match || "").trim(),
        )
          ? match
          : " ",
    );
  return withoutNonInviteUrls
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

function stripOuterCodeBlock(text?) {
  if (!text) return "";
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:[a-zA-Z0-9_-]+)?\n?([\s\S]*?)```$/);
  if (match?.[1]) return match[1].trim();
  return trimmed.replace(/^```/, "").replace(/```$/, "").trim();
}

function stripCustomEmojisFromDescription(text?) {
  return String(text || "").replace(/<a?:\w+:\d+>/g, "");
}

function stripInvisibleCharsFromDescription(text?) {
  return String(text || "").replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, "");
}

function stripSpoilersFromDescription(text?) {
  return String(text || "").replace(/\|\|([\s\S]*?)\|\|/g, "$1");
}

function stripExtraInvitesFromDescription(text?) {
  const str = String(text || "");
  let seen = false;
  DISCORD_INVITE_URL_RE.lastIndex = 0;
  return str.replace(DISCORD_INVITE_URL_RE, (match?) => {
    if (!seen) {
      seen = true;
      return match;
    }
    return " ";
  });
}

function normalizePartnershipContentFilters(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  return {
    stripMentions: src.stripMentions === true || src.m === true,
    stripMassMentions:
      src.stripMassMentions === true ||
      src.stripEveryoneHere === true ||
      src.e === true,
    stripNonInviteLinks: src.stripNonInviteLinks === true || src.l === true,
    stripCustomEmojis: src.stripCustomEmojis === true || src.ce === true,
    stripInvisibleChars: src.stripInvisibleChars === true || src.z === true,
    stripSpoilers: src.stripSpoilers === true || src.sp === true,
    stripExtraInvites: src.stripExtraInvites === true || src.xi === true,
  };
}

function mainPartnershipContentFilters() {
  return {
    stripMentions: true,
    stripMassMentions: true,
    stripNonInviteLinks: true,
    stripCustomEmojis: false,
    stripInvisibleChars: false,
    stripSpoilers: false,
    stripExtraInvites: false,
  };
}

function applyPartnershipContentFilters(raw?, filtersInput = null) {
  const filters = normalizePartnershipContentFilters(filtersInput);
  const any =
    filters.stripMentions ||
    filters.stripMassMentions ||
    filters.stripNonInviteLinks ||
    filters.stripCustomEmojis ||
    filters.stripInvisibleChars ||
    filters.stripSpoilers ||
    filters.stripExtraInvites;
  let text = String(raw || "").trim();
  if (!any) return text;
  text = stripOuterCodeBlock(text);
  if (filters.stripInvisibleChars) {
    text = stripInvisibleCharsFromDescription(text);
  }
  if (filters.stripSpoilers) {
    text = stripSpoilersFromDescription(text);
  }
  if (filters.stripCustomEmojis) {
    text = stripCustomEmojisFromDescription(text);
  }
  if (filters.stripMentions) {
    text = text
      .replace(/<@!?\d+>/g, "")
      .replace(/<@&\d+>/g, "")
      .replace(/<#\d+>/g, "");
  }
  if (filters.stripMassMentions) {
    text = text.replace(/@everyone/g, "").replace(/@here/g, "");
  }
  if (filters.stripNonInviteLinks) {
    text = stripLinksFromDescription(text);
  }
  if (filters.stripExtraInvites) {
    text = stripExtraInvitesFromDescription(text);
  }
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+|\n+$/g, "")
    .trim();
}

function parseManagerFromContent(content?, authorId?) {
  const text = String(content || "");
  const managerLine = text.match(/(?:<:VC_Mention:\d+>\s*)?Manager:\s*<@!?(\d{16,20})>/i);
  if (managerLine?.[1]) return managerLine[1];
  const mentions = [...text.matchAll(/<@!?(\d{16,20})>/g)].map((m?) => m[1]);
  const author = String(authorId || "");
  return mentions.find((id?) => id !== author) || null;
}

function splitMessage(message?, maxLength = 2000) {
  if (!message) return [""];
  const parts = [];
  let current = "";
  for (const line of message.split("\n")) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > maxLength) {
      if (current) {
        parts.push(current);
        current = "";
      }
      if (line.length > maxLength) {
        for (let i = 0; i < line.length; i += maxLength) {
          parts.push(line.slice(i, i + maxLength));
        }
      } else {
        current = line;
      }
    } else {
      current = next;
    }
  }
  if (current) parts.push(current);
  return parts;
}

function stripTrailingManagerLine(text?) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
        .replace(/\n*<:VC_Mention:\d+>\s*Manager:\s*<@!?\d+>(?:\s+[^\n]*)?\s*$/gi, "")
    .replace(/\n*Manager:\s*<@!?\d+>(?:\s+[^\n]*)?\s*$/gi, "")
    .trim();
}

function formatManagerBadgeSuffix(badgeEmojis?) {
  const list = Array.isArray(badgeEmojis)
    ? badgeEmojis.map((e?) => String(e || "").trim()).filter(Boolean)
    : String(badgeEmojis || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean);
  return list.length ? ` ${list.join(" ")}` : "";
}

function formatPartnershipManagerLine(managerId?, badgeEmojis = null) {
  if (!managerId) return "";
  return `\n\n${E.VC_Mention} Manager: <@${managerId}>${formatManagerBadgeSuffix(badgeEmojis)}`;
}

function buildPartnershipAboveEmbedContent({
  managerId = null,
  pingPlan = null,
  badgeEmojis = null,
} = {}) {
  const pingPrefix = buildPartnershipPingPrefix(pingPlan, { includeRolePing: true });
  const managerLine = managerId
    ? formatPartnershipManagerLine(managerId, badgeEmojis).trim()
    : "";
  const parts = [];
  if (pingPrefix) parts.push(pingPrefix);
  if (managerLine) parts.push(managerLine);
  return parts.length ? parts.join("\n\n") : null;
}

function stripManagerReferencesFromDescription(text?, managerId = null) {
  let content = stripTrailingManagerLine(text);
  const id = String(managerId || "").trim();
  if (id) {
    content = content.replace(new RegExp(`<@!?${id}>`, "g"), "");
  }
  return content
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function resolvePartnershipDescriptionForPublish({
  description,
  legacy = false,
  contentFilters = null,
}: any = {}) {
    const raw = unwrapDiscordForwardQuoteDump(String(description || "").trim());
    const filters = legacy
    ? normalizePartnershipContentFilters(
        contentFilters && typeof contentFilters === "object"
          ? contentFilters
          : mainPartnershipContentFilters(),
      )
    : normalizePartnershipContentFilters(contentFilters);
  return applyPartnershipContentFilters(raw, filters);
}

export = {
  extractInviteCode,
  extractInviteCodeFromUrl,
  hasRequiredDiscordInviteLink,
  normalizePartnerDescriptionInviteLinks,
  isValidServerName,
  stripOuterCodeBlock,
  mainPartnershipContentFilters,
  parseManagerFromContent,
  splitMessage,
  stripTrailingManagerLine,
  formatPartnershipManagerLine,
  formatManagerBadgeSuffix,
  buildPartnershipAboveEmbedContent,
  stripManagerReferencesFromDescription,
  resolvePartnershipDescriptionForPublish,
};
