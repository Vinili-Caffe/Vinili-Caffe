const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const {
  TENANT_EMBED_COLOR,
  LEGACY_VINILI_EMBED_COLOR,
  applyTenantPayloadBranding,
} = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");

function resolveNoticeColor(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && isViniliProtectedGuild(guildId)) return LEGACY_VINILI_EMBED_COLOR;
  return TENANT_EMBED_COLOR;
}

const PLAIN_NOTICE_HINTS = [
  "errore",
  "error",
  "non valido",
  "invalid",
  "permesso",
  "permission",
  "non puoi",
  "impossibile",
  "warning",
  "not found",
  "non trovato",
  "non hai",
  "non ti è",
  "non ti e",
  "accesso negato",
  "riservato",
      "solo nel",
  "solo in un",
  "solo in una",
  "solo in questo",
  "solo in questa",
  "solo in server",
  "solo in canale",
  "solo in dm",
  "scaduto",
  "mancanti",
  "non riuscito",
  "negato",
  "vietato",
  "non disponibile",
  "non configurato",
  "non abilitato",
  "non consentito",
  "non autorizzato",
  "non permesso",
  "manca il",
  "manca la",
  "mancano ",
];

function textIncludesNoticeHint(text?, hint?) {
  const h = String(hint || "").toLowerCase();
  if (!h) return false;
    if (/\s$/.test(h)) return text.includes(h);
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  try {
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu").test(text);
  } catch (_) {
        return new RegExp(`(?:^|[^A-Za-zÀ-ÿ])${escaped}(?:$|[^A-Za-zÀ-ÿ])`, "i").test(text);
  }
}

function contentLooksLikePlainSuccess(value?) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  return (
    text.includes("vegacheckmark") ||
    text.includes(":success") ||
    text.includes("success:") ||
    text.includes("vc_verified") ||
    text.includes("vc_check")
  );
}

function contentLooksLikePlainNotice(value?) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
    if (contentLooksLikePlainSuccess(text)) return false;
      const raw = String(value || "");
  if (raw.length >= 350) return false;
  if (/^\s*#\s+/m.test(raw)) return false;
    if (/\bdepex\b/.test(text) || /\*\*[^*]*\bpex\b[^*]*\*\*/.test(text)) return false;
  if (
    text.includes("vegax") ||
    text.includes("vc_cross") ||
    text.includes("vc_attention") ||
    text.includes("vc_lock") ||
    text.includes("vc_alert") ||
    text.includes(":cancel") ||
    text.includes("cancel:")
  ) {
    return true;
  }
    if (/\bwarn(s)?\b(?!\s*points?\b)/i.test(text)) return true;
  return PLAIN_NOTICE_HINTS.some((hint?) => textIncludesNoticeHint(text, hint));
}

function isMentionOnlyContent(value?) {
  const text = String(value || "").trim();
  if (!text) return false;
    const stripped = text
    .replace(/<(?:@!?|@&|#)\d{16,22}>/g, " ")
    .replace(/[,|;]/g, " ")
    .replace(/\b(?:e|and|ed)\b/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (stripped) return false;
  return /<(?:@!?|@&|#)\d{16,22}>/.test(text);
}

function buildSimpleNoticeEmbed(description?, options: Record<string, any> = {}) {
  const text = String(description || "").trim() || "\u200b";
  const embed = new EmbedBuilder()
    .setColor(options.color || TENANT_EMBED_COLOR)
    .setDescription(text);
  if (options.title) embed.setTitle(String(options.title));
  return embed;
}

function buildSimpleNoticePayload(description?, guild?, options: Record<string, any> = {}) {
  const color = options.color || resolveNoticeColor(guild);
  const embed = buildSimpleNoticeEmbed(description, {
    title: options.title,
    color,
  });
  let payload: Record<string, any> = {
    embeds: [embed],
    allowedMentions: options.allowedMentions || { parse: [] },
        includeAuthor: false,
    includeBanner: false,
    includeThumbnail: false,
    __tenantBrandingApplied: true,
    __skipDefaultEmbedFooter: options.includeFooter === true ? undefined : true,
  };
  if (options.flags != null) payload.flags = options.flags;
  if (options.ephemeral) {
    payload.flags = (Number(payload.flags) || 0) | (1 << 6);
  }
  if (options.components) payload.components = options.components;

    if (options.includeBanner === true || options.includeThumbnail === true || options.includeAuthor === true) {
    payload = applyTenantPayloadBranding(payload, {
      guild,
      guildId: guild?.id,
      client: options.client || guild?.client,
      includeBanner: options.includeBanner === true,
      includeThumbnail: options.includeThumbnail === true,
      includeAuthor: options.includeAuthor === true,
    }) || payload;
  }

    return payload;
}

function coercePlainContentToNoticePayload(payload?, guild?, options: Record<string, any> = {}) {
  if (payload == null) return payload;
    const filterNoticesOnly = options.onlyIfLooksLikeNotice !== false;
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text) return payload;
    if (isMentionOnlyContent(text)) return payload;
    if (filterNoticesOnly && !contentLooksLikePlainNotice(text)) return payload;
    return buildSimpleNoticePayload(text, guild, options);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (payload.skipNoticeEmbed === true || payload.__skipNoticeEmbed === true) return payload;
  if (Array.isArray(payload.embeds) && payload.embeds.length > 0) return payload;
  if (payload.poll) return payload;
  if (Array.isArray(payload.files) && payload.files.length > 0) return payload;
  if (Array.isArray(payload.stickers) && payload.stickers.length > 0) return payload;
  if (Array.isArray(payload.attachments) && payload.attachments.length > 0) return payload;
  const content = String(payload.content || "").trim();
  if (!content) return payload;
  if (isMentionOnlyContent(content)) return payload;
  if (filterNoticesOnly && !contentLooksLikePlainNotice(content)) return payload;
  const next: any = buildSimpleNoticePayload(content, guild, {
    ...options,
    allowedMentions: payload.allowedMentions || options.allowedMentions,
    flags: payload.flags,
    components: payload.components,
    ephemeral: payload.ephemeral,
  });
  if (payload.flags != null && next.flags == null) next.flags = payload.flags;
  return next;
}

export = {
  buildSimpleNoticeEmbed,
  buildSimpleNoticePayload,
  coercePlainContentToNoticePayload,
  contentLooksLikePlainNotice,
  contentLooksLikePlainSuccess,
  isMentionOnlyContent,
  resolveNoticeColor,
};
