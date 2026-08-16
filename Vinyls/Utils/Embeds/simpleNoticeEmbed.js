const { EmbedBuilder } = require("discord.js");
const {
  TENANT_EMBED_COLOR,
  LEGACY_VINILI_EMBED_COLOR,
  applyTenantPayloadBranding,
} = require("../../MultiGuild/utils/tenantEmbedBranding");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");

function resolveNoticeColor(guild) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && isViniliProtectedGuild(guildId)) return LEGACY_VINILI_EMBED_COLOR;
  return TENANT_EMBED_COLOR;
}

/** Solo deny/error/ACL — niente guide («usa +…»), loading («attendi») o successi. */
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
  // Scope ACL: preferire forme tipiche deny («solo in un/questo/server…»).
  // Evitare bare «solo in» → falso positivo su frasi tipo «solo in basso».
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

/** Match hint con boundary: «solo in» non deve matchare «solo informarvi». */
function textIncludesNoticeHint(text, hint) {
  const h = String(hint || "").toLowerCase();
  if (!h) return false;
  // Hint con spazio finale (es. "mancano "): substring intenzionale.
  if (/\s$/.test(h)) return text.includes(h);
  const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  try {
    return new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, "iu").test(text);
  } catch (_) {
    // Fallback senza lookbehind unicode (motori vecchi).
    return new RegExp(`(?:^|[^A-Za-zÀ-ÿ])${escaped}(?:$|[^A-Za-zÀ-ÿ])`, "i").test(text);
  }
}

/** Conferme / ok: restano plain text (niente notice embed). */
function contentLooksLikePlainSuccess(value) {
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

/** True se un `content` plain va mostrato come notice embed (deny/error). */
function contentLooksLikePlainNotice(value) {
  const text = String(value || "").toLowerCase();
  if (!text.trim()) return false;
  // Successi non vanno in embed “notice”.
  if (contentLooksLikePlainSuccess(text)) return false;
  // Annunci / post lunghi (heading markdown, multi-paragrafi): restano plain text.
  // Altrimenti emoji tipo VC_Alert nei template community finiscono in notice embed.
  const raw = String(value || "");
  if (raw.length >= 350) return false;
  if (/^\s*#\s+/m.test(raw)) return false;
  // Log PEX/DEPEX (canale staff): restano sempre plain text.
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
  // "warn" isolato (non "warn points")
  if (/\bwarn(s)?\b(?!\s*points?\b)/i.test(text)) return true;
  return PLAIN_NOTICE_HINTS.some((hint) => textIncludesNoticeHint(text, hint));
}

/**
 * Solo ping Discord (user/role/channel, anche multipli): lasciare in `content`.
 * Es. `<@&1> <@&2>` — non ha senso metterli in embed.
 */
function isMentionOnlyContent(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  // Solo menzioni + spazi / virgole / "e" / newline.
  const stripped = text
    .replace(/<(?:@!?|@&|#)\d{16,22}>/g, " ")
    .replace(/[,|;]/g, " ")
    .replace(/\b(?:e|and|ed)\b/gi, " ")
    .replace(/\s+/g, "")
    .trim();
  if (stripped) return false;
  return /<(?:@!?|@&|#)\d{16,22}>/.test(text);
}

/**
 * Short feedback embed (errors, ACL, setup prompts) — same look as main denies,
 * with tenant branding when applicable.
 */
function buildSimpleNoticeEmbed(description, options = {}) {
  const text = String(description || "").trim() || "\u200b";
  const embed = new EmbedBuilder()
    .setColor(options.color || TENANT_EMBED_COLOR)
    .setDescription(text);
  if (options.title) embed.setTitle(String(options.title));
  return embed;
}

function buildSimpleNoticePayload(description, guild, options = {}) {
  const color = options.color || resolveNoticeColor(guild);
  const embed = buildSimpleNoticeEmbed(description, {
    title: options.title,
    color,
  });
  let payload = {
    embeds: [embed],
    allowedMentions: options.allowedMentions || { parse: [] },
    // Notice = solo testo in embed. Niente author/banner/thumbnail brand.
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

  // Solo colore tenant se serve; mai banner/author su un deny/ephemeral.
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

  // Non strippare i flag anti-branding qui: finalizeOutgoingPayload deve vederli.
  return payload;
}

/**
 * Se il payload è solo `content` plain, lo mette in notice embed.
 * Default: solo deny/error/notice (non quote, ping, post community, successi casuali).
 * Opt-in wrap totale: `onlyIfLooksLikeNotice: false`.
 * Non tocca embed già presenti, file, poll, sticker, né ping-only.
 */
function coercePlainContentToNoticePayload(payload, guild, options = {}) {
  if (payload == null) return payload;
  // Default = solo messaggi “notice”; passare false per forzare tutto.
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
  const next = buildSimpleNoticePayload(content, guild, {
    ...options,
    allowedMentions: payload.allowedMentions || options.allowedMentions,
    flags: payload.flags,
    components: payload.components,
    ephemeral: payload.ephemeral,
  });
  if (payload.flags != null && next.flags == null) next.flags = payload.flags;
  return next;
}

module.exports = {
  buildSimpleNoticeEmbed,
  buildSimpleNoticePayload,
  coercePlainContentToNoticePayload,
  contentLooksLikePlainNotice,
  contentLooksLikePlainSuccess,
  isMentionOnlyContent,
  resolveNoticeColor,
};
