const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { isMultiGuildLayerEnabled } = require("../core/env") as typeof import("../core/env");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");
const { shouldApplyMultiGuildLayer } = require("../core/accessPolicy") as typeof import("../core/accessPolicy");
const { guildIconUrl, userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { botPhotoCdnUrl } = require("../../../shared/discord/botPhotosCdn") as typeof import("../../../shared/discord/botPhotosCdn");

const TENANT_EMBED_COLOR = "#826bc2";
const LEGACY_VINILI_EMBED_COLOR = "#6f4e37";
const LEGACY_VINILI_EMBED_COLOR_INT = 0x6f4e37;
const BRANDING_IMAGE_NAME = "tenant-standard.gif";
const STANDARD_GIF_NAME = "standard.gif";
const TENANT_BRANDING_APPLIED_KEY = "__tenantBrandingApplied";
const PREFIX_DISPATCH_BRANDING_DONE_KEY = "__prefixDispatchBrandingDone";

const BRANDING_IMAGE_URL = botPhotoCdnUrl(STANDARD_GIF_NAME);
const BRANDING_IMAGE_ATTACHMENT_URL = `attachment://${BRANDING_IMAGE_NAME}`;
const BRANDING_IMAGE_ALIASES = [BRANDING_IMAGE_NAME, "standard.gif", "tenant-standard.gif"];

function standardGifFileExists() {
  return Boolean(BRANDING_IMAGE_URL);
}

function stripTenantBrandingInternals(payload?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const next = { ...payload };
  let changed = false;
  if (Object.prototype.hasOwnProperty.call(next, TENANT_BRANDING_APPLIED_KEY)) {
    delete next[TENANT_BRANDING_APPLIED_KEY];
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, PREFIX_DISPATCH_BRANDING_DONE_KEY)) {
    delete next[PREFIX_DISPATCH_BRANDING_DONE_KEY];
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, "includeBanner")) {
    delete next.includeBanner;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, "includeThumbnail")) {
    delete next.includeThumbnail;
    changed = true;
  }
  if (Object.prototype.hasOwnProperty.call(next, "includeAuthor")) {
    delete next.includeAuthor;
    changed = true;
  }
  return changed ? next : payload;
}

function isTenantBannerImageUrl(url?) {
  const imageUrl = String(url || "").trim().toLowerCase();
  if (!imageUrl) return false;
  if (imageUrl === String(BRANDING_IMAGE_URL || "").trim().toLowerCase()) return true;
  if (imageUrl.startsWith("attachment://")) {
    const name = imageUrl.slice("attachment://".length);
    return BRANDING_IMAGE_ALIASES.some((alias?) => name === String(alias).toLowerCase());
  }
  return BRANDING_IMAGE_ALIASES.some((alias?) => imageUrl.includes(String(alias).toLowerCase()));
}

function payloadHasTenantBannerEmbed(payload?) {
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
  return embeds.some((embed?) => isTenantBannerImageUrl(embedImageUrl(embed)));
}

function shouldSkipPrefixDispatcherBranding(payload?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (payload[PREFIX_DISPATCH_BRANDING_DONE_KEY] || payload[TENANT_BRANDING_APPLIED_KEY]) {
    return true;
  }
  return payloadHasTenantBannerEmbed(payload);
}

function normalizeEmbedColorInt(color?) {
  if (color == null || color === "") return null;
  if (typeof color === "number" && Number.isFinite(color)) return color;
  const raw = String(color).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "red") return 0xed4245;
  if (raw.startsWith("#")) {
    const value = Number.parseInt(raw.slice(1), 16);
    return Number.isFinite(value) ? value : null;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : null;
}

function isLegacyDefaultEmbedColor(color?) {
  const normalized = normalizeEmbedColorInt(color);
  return normalized === LEGACY_VINILI_EMBED_COLOR_INT;
}

function shouldUseTenantEmbedBranding(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || isViniliProtectedGuild(gid) || !isMultiGuildLayerEnabled()) return false;
  if (shouldApplyMultiGuildLayer(gid)) return true;
  try {
    const { isPartnershipOperational } = require("../../Partner/core/partnershipConfigResolver") as typeof import("../../Partner/core/partnershipConfigResolver");
    return isPartnershipOperational(gid);
  } catch {
    return false;
  }
}

function shouldUsePartnershipEmbedBranding(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !isMultiGuildLayerEnabled()) return false;
  if (isViniliProtectedGuild(gid)) return true;
  return shouldUseTenantEmbedBranding(gid);
}

function shouldApplyPayloadBranding(guildId?, context: Record<string, any> = {}) {
  if (context.partnershipBranding === true) {
    return shouldUsePartnershipEmbedBranding(guildId);
  }
  return shouldUseTenantEmbedBranding(guildId);
}

function shouldUseViniliBrandEmbedColor(guildId?) {
  return shouldUsePartnershipEmbedBranding(guildId);
}

function resolveEmbedColorForGuild(guildId?) {
  return shouldUseViniliBrandEmbedColor(guildId) ? TENANT_EMBED_COLOR : LEGACY_VINILI_EMBED_COLOR;
}

function shouldApplyTenantEmbedColor(guildId?, color?, context: Record<string, any> = {}) {
  const useBrandColor =
    context.partnershipBranding === true
      ? shouldUsePartnershipEmbedBranding(guildId)
      : shouldUseViniliBrandEmbedColor(guildId);
  if (!useBrandColor) return false;
  if (color == null || color === "") return true;
  return isLegacyDefaultEmbedColor(color);
}

function createStandardGifAttachment() {
  /* Media su CDN: niente attachment locale. */
  return null;
}

function applyBrandingBannerImage(embed?) {
  if (!embed) return embed;
  const builder = embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
  return builder.setImage(BRANDING_IMAGE_URL);
}

function payloadFilesIncludeBrandingBanner(files?) {
  if (!Array.isArray(files) || !files.length) return false;
  return files.some((file?) => {
    const name = String(file?.name || file?.attachment?.name || "").trim().toLowerCase();
    return BRANDING_IMAGE_ALIASES.some((alias?) => name === String(alias).toLowerCase());
  });
}

function embedData(embed?) {
  return embed?.data || embed || {};
}

function embedImageUrl(embed?) {
  return String(embedData(embed)?.image?.url || "").trim();
}

function embedThumbnailUrl(embed?) {
  return String(embedData(embed)?.thumbnail?.url || "").trim();
}

function embedHasAuthor(embed?) {
  const author = embedData(embed)?.author;
  return Boolean(
    String(author?.name || "").trim() ||
      String(author?.icon_url || author?.iconURL || "").trim(),
  );
}

function embedNeedsImage(embed?) {
  return !embedImageUrl(embed);
}

function shouldIncludeTenantBanner(payload?, context: Record<string, any> = {}) {
  if (context.includeBanner === true) return true;
  if (context.includeBanner === false) return false;
  if (payload && payload.includeBanner === true) return true;
  if (payload && payload.includeBanner === false) return false;
    return false;
}

function shouldIncludeTenantThumbnail(payload?, context: Record<string, any> = {}) {
  if (context.includeThumbnail === true) return true;
  if (context.includeThumbnail === false) return false;
  if (payload && payload.includeThumbnail === true) return true;
  if (payload && payload.includeThumbnail === false) return false;
  return false;
}

function shouldIncludeTenantAuthor(payload?, context: Record<string, any> = {}) {
  if (context.includeAuthor === true) return true;
  if (context.includeAuthor === false) return false;
  if (payload && payload.includeAuthor === true) return true;
  if (payload && payload.includeAuthor === false) return false;
  return false;
}

function resolveBrandingContext(context: Record<string, any> = {}) {
  const guild = context?.guild || null;
  const guildId = String(context?.guildId || guild?.id || "").trim() || null;
  const client = context?.client || guild?.client || null;
  return { guildId, guild, client };
}

function applyTenantEmbedColor(embed?, guildId?, context: Record<string, any> = {}) {
  if (!embed || !shouldApplyPayloadBranding(guildId, context)) return embed;
  const currentColor = embedData(embed)?.color;
  if (!shouldApplyTenantEmbedColor(guildId, currentColor)) return embed;
  const builder = embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
  return builder.setColor(TENANT_EMBED_COLOR);
}

function applyBrandingToEmbed(embed?, context?) {
  if (!embed) return { embed, needsFile: false };
  const {
    guild,
    guildId,
    client,
    includeBanner = false,
    includeThumbnail = false,
    includeAuthor = false,
  } = context;
  let builder = embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed);
  let needsFile = false;

  builder = applyTenantEmbedColor(builder, guildId, context);

  if (includeThumbnail && !embedThumbnailUrl(builder)) {
    const botAvatar = userAvatarUrlDynamic(client?.user, { size: 256 });
    if (botAvatar) builder = builder.setThumbnail(botAvatar);
  }

  if (includeAuthor && !embedHasAuthor(builder) && guild) {
    const authorName = String(guild.name || "Server").trim() || "Server";
    const authorIcon = guildIconUrl(guild, { size: 256 });
    builder = builder.setAuthor(
      authorIcon ? { name: authorName, iconURL: authorIcon } : { name: authorName },
    );
  }

  if (includeBanner && embedNeedsImage(builder)) {
        builder = applyBrandingBannerImage(builder);
    needsFile = standardGifFileExists();
  }

  return { embed: builder, needsFile };
}

function applyPartnershipPayloadBranding(payload?, context: Record<string, any> = {}) {
  return applyTenantPayloadBranding(payload, { ...context, partnershipBranding: true });
}

function applyTenantPayloadBranding(payload?, context: Record<string, any> = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (payload[TENANT_BRANDING_APPLIED_KEY]) return stripTenantBrandingInternals(payload);

  const { guildId, guild, client } = resolveBrandingContext(context);
  if (!guildId || !shouldApplyPayloadBranding(guildId, context)) return payload;

  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];
  if (!embeds.length) return payload;

  const includeBanner = shouldIncludeTenantBanner(payload, context);
  const includeThumbnail = shouldIncludeTenantThumbnail(payload, context);
  const includeAuthor = shouldIncludeTenantAuthor(payload, context);
  const brandingContext = {
    guildId,
    guild,
    client,
    includeBanner,
    includeThumbnail,
    includeAuthor,
    partnershipBranding: context.partnershipBranding === true,
  };

  let needsBannerFile = false;
  const nextEmbeds = embeds.map((embed?, index?) => {
    const embedBrandingContext = {
      ...brandingContext,
            includeBanner: includeBanner && index === 0,
    };
    const result = applyBrandingToEmbed(embed, embedBrandingContext);
    if (result.needsFile) needsBannerFile = true;
    return result.embed;
  });

  let files = Array.isArray(payload.files) ? [...payload.files] : payload.files;
  if (needsBannerFile) {
    if (!payloadFilesIncludeBrandingBanner(files)) {
      const bannerFile = createStandardGifAttachment();
      if (bannerFile) {
        files = Array.isArray(files) ? [...files, bannerFile] : [bannerFile];
      }
    }
  } else if (Array.isArray(files) && files.length) {
        files = files.filter((file?) => {
      const name = String(file?.name || file?.attachment?.name || "").trim().toLowerCase();
      return !BRANDING_IMAGE_ALIASES.some((alias?) => name === String(alias).toLowerCase());
    });
  }

  return {
    ...payload,
    embeds: nextEmbeds,
    ...(Array.isArray(files) ? { files } : {}),
    [TENANT_BRANDING_APPLIED_KEY]: true,
  };
}

function registerTenantEmbedBrandingApplier() {
  try {
    const replyRuntime = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
    if (typeof replyRuntime.setTenantEmbedBrandingApplier !== "function") return;
    replyRuntime.setTenantEmbedBrandingApplier((payload?, context?) =>
      applyTenantPayloadBranding(payload, { ...context, partnershipBranding: true }),
    );
  } catch {
      }
}

export = {
  TENANT_EMBED_COLOR,
  LEGACY_VINILI_EMBED_COLOR,
  LEGACY_VINILI_EMBED_COLOR_INT,
  BRANDING_IMAGE_NAME,
  normalizeEmbedColorInt,
  isLegacyDefaultEmbedColor,
  resolveEmbedColorForGuild,
  applyTenantPayloadBranding,
  applyPartnershipPayloadBranding,
  stripTenantBrandingInternals,
  PREFIX_DISPATCH_BRANDING_DONE_KEY,
  payloadHasTenantBannerEmbed,
  shouldSkipPrefixDispatcherBranding,
  createStandardGifAttachment,
  applyBrandingBannerImage,
  registerTenantEmbedBrandingApplier,
};
