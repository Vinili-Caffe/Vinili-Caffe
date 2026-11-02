const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { guildIconUrl, userAvatarUrlDynamic, userAvatarUrlStatic } = require("../discord/guildDiscordIdentity") as typeof import("../discord/guildDiscordIdentity");
function loadTenantEmbedBranding() {
  try {
    return require("../../Vinili/MultiGuild/utils/tenantEmbedBranding");
  } catch {
    return {
      TENANT_EMBED_COLOR: "#9b59b6",
      isLegacyDefaultEmbedColor: () => false,
    };
  }
}
const { TENANT_EMBED_COLOR, isLegacyDefaultEmbedColor } = loadTenantEmbedBranding();
const {
  installEmbedMediaFallbackPatch,
  applyEmbedMediaFallbackToPayload,
  sanitizeEmbedMediaUrl,
  sanitizeEmbedDataObject,
  embedHasMeaningfulContent,
} = require("./embedMediaFallback") as typeof import("./embedMediaFallback");
const { sanitizeEmbedFooterText } = require("../discord/embedFooterText") as typeof import("../discord/embedFooterText");
const DEFAULT_FOOTER_TEXT = "© 2026 Vinili & Caffè. Tutti i diritti riservati.";
/** Branding ufficiale Vinili: viola. */
const DEFAULT_COLOR = TENANT_EMBED_COLOR;
let embedBrandDefaultColor = TENANT_EMBED_COLOR;
const ERROR_EMBED_COLORS = new Set([0xed4245, 0xe74c3c, 0xbe3851, 0xff0000]);
const ERROR_TITLE_SUBSTRINGS = ["errore", "error", "cooldown", "non hai i permessi", "accesso negato", "argomenti mancanti", "comando in esecuzione", "comando scaduto",];

function setEmbedBrandDefaultColor(color?) {
  const next = String(color || "").trim();
  embedBrandDefaultColor = next || TENANT_EMBED_COLOR;
  return embedBrandDefaultColor;
}

function getEmbedBrandDefaultColor() {
  return embedBrandDefaultColor || TENANT_EMBED_COLOR;
}

function hexToInt(hex?) {
  if (!hex) return null;
  const normalized = hex.startsWith("#") ? hex.slice(1) : hex;
  const value = Number.parseInt(normalized, 16);
  return Number.isNaN(value) ? null : value;
}

function normalizeColorInt(color?) {
  if (color == null || color === "") return null;
  if (typeof color === "number" && Number.isFinite(color)) return color >>> 0;
  const raw = String(color).trim().toLowerCase();
  if (!raw) return null;
  if (raw === "red") return 0xed4245;
  if (raw.startsWith("#")) {
    const value = Number.parseInt(raw.slice(1), 16);
    return Number.isFinite(value) ? value : null;
  }
  const asNum = Number(raw);
  return Number.isFinite(asNum) ? asNum >>> 0 : null;
}

function isErrorEmbedColor(color?) {
  const n = normalizeColorInt(color);
  return n != null && ERROR_EMBED_COLORS.has(n);
}
function hasFooter(embed?) {
  return Boolean(embed?.data?.footer || embed?.footer);
}

function resolveBotFooterIconUrl(botUser?) {
  if (!botUser) return null;
  try {
    const staticUrl = userAvatarUrlStatic(botUser, { size: 64 });
    const cleanedStatic = sanitizeEmbedMediaUrl(staticUrl, { size: 64 });
    if (cleanedStatic && !/\/embed\/avatars\//i.test(cleanedStatic)) return cleanedStatic;
    if (typeof botUser.displayAvatarURL === "function") {
      const png = botUser.displayAvatarURL({ size: 64, extension: "png", forceStatic: true });
      const cleanedPng = sanitizeEmbedMediaUrl(png, { size: 64 });
      if (cleanedPng && !/\/embed\/avatars\//i.test(cleanedPng)) return cleanedPng;
    }
    const dyn = userAvatarUrlDynamic(botUser, { size: 64 });
    const cleanedDyn = sanitizeEmbedMediaUrl(dyn, { size: 64 });
    if (cleanedDyn && !/\/embed\/avatars\//i.test(cleanedDyn)) return cleanedDyn;
  } catch (err) {
    global.logger?.warn?.("[defaultFooter] ", err?.message || err);
  }
  return null;
}

function getBotIconUrl(guild?) {
  return resolveBotFooterIconUrl(guild?.client?.user || global?.botClient?.user);
}
function getGlobalBotIconUrl() {
  return resolveBotFooterIconUrl(global?.botClient?.user);
}
function getGuildIconUrl(guild?) {
  if (!guild) return null;
  try {
    return guildIconUrl(guild, { size: 64 });
  } catch (err) {
    global.logger?.warn?.("[defaultFooter] ", err?.message || err);
  }
  return null;
}
function isErrorEmbedInstance(embed?) {
  if (!embed) return false;
  const color = embed.data?.color ?? embed.color;
  if (isErrorEmbedColor(color)) return true;
  const title = (embed.data?.title ?? embed.title ?? "").toLowerCase();
  if (ERROR_TITLE_SUBSTRINGS.some((s?) => title.includes(s))) return true;
  return false;
}

function resolveDefaultEmbedColor(_guild?) {
  return getEmbedBrandDefaultColor();
}

function normalizeEmbedColorForBrand(embedColor?) {
  if (
    embedColor == null ||
    embedColor === "" ||
    isLegacyDefaultEmbedColor(embedColor)
  ) {
    return getEmbedBrandDefaultColor();
  }
  return embedColor;
}

function applyDefaultEmbedColor(embed?, guild?) {
  if (!embed || typeof embed.setColor !== "function") return embed;
  const currentColor = embed.data?.color ?? embed.color;
  const nextColor = normalizeEmbedColorForBrand(currentColor);
  if (nextColor !== currentColor) {
    embed.setColor(nextColor);
  } else if (currentColor == null || currentColor === "") {
    embed.setColor(resolveDefaultEmbedColor(guild));
  }
  return embed;
}

function applyDefaultFooter(embed?, guild?) {
  if (!embed) return embed;
    applyDefaultEmbedColor(embed, guild);
  if (isErrorEmbedInstance(embed)) return embed;
  const skipIcon = Boolean(embed.__skipFooterIcon);
  const iconURL = skipIcon ? null : (getBotIconUrl(guild) || getGuildIconUrl(guild));
  if (typeof embed.setFooter === "function") {
    if (!hasFooter(embed)) {
      embed.setFooter({
        text: DEFAULT_FOOTER_TEXT,
        ...(iconURL ? { iconURL } : {}),
      });
    } else if (iconURL) {
      const current = embed.data?.footer || embed.footer || {};
      const footerText = sanitizeEmbedFooterText(current.text || DEFAULT_FOOTER_TEXT);
      if (!current.icon_url && !current.iconURL) {
        embed.setFooter({ text: footerText, iconURL });
      } else if (footerText !== current.text) {
        embed.setFooter({
          text: footerText,
          iconURL: current.icon_url || current.iconURL || undefined,
        });
      }
    } else {
      const current = embed.data?.footer || embed.footer || {};
      const footerText = sanitizeEmbedFooterText(current.text || "");
      if (footerText && footerText !== current.text) {
        embed.setFooter({ text: footerText });
      }
    }
    if (!embed.data?.color && typeof embed.setColor === "function") {
      embed.setColor(resolveDefaultEmbedColor(guild));
    }
    return embed;
  }
  const resolvedColor = resolveDefaultEmbedColor(guild);
  const colorValue = hexToInt(resolvedColor);
  const existingFooter = embed.footer || null;
  let footer = existingFooter || { text: DEFAULT_FOOTER_TEXT };
  if (footer.text) footer = { ...footer, text: sanitizeEmbedFooterText(footer.text) };
  if (iconURL && !footer.icon_url && !footer.iconURL) {
    footer = { ...footer, icon_url: iconURL };
  }
  const normalizedColor = normalizeEmbedColorForBrand(embed.color ?? colorValue);
  const nextColor = typeof normalizedColor === "string" ? hexToInt(normalizedColor) : normalizedColor;
  return {
    ...embed,
    footer,
    color: nextColor ?? embed.color,
  };
}
function applyDefaultFooterToEmbeds(payload?, guild?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }
  if (payload.__defaultFooterApplied) return payload;
  if (!Array.isArray(payload.embeds)) return payload;
  const embeds = payload.embeds
    .map((embed?) => applyDefaultFooter(embed, guild))
    .filter((embed?) => embedHasMeaningfulContent(embed));
  if (!embeds.length) {
    const next = { ...payload, __defaultFooterApplied: true };
    delete next.embeds;
    return next;
  }
  return {
    ...payload,
    embeds,
    __defaultFooterApplied: true,
  };
}

function stripDefaultFooterInternals(payload?) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, "__defaultFooterApplied")) return payload;
  const next = { ...payload };
  delete next.__defaultFooterApplied;
  return next;
}

function resolveGuildFromContext(context?) {
  if (!context || typeof context !== "object") return null;
  return context.guild || context.channel?.guild || null;
}

function normalizeOutgoingPayload(payload?, guild?) {
  if (payload == null) return payload;

  let next = payload;
  try {
    const { applyEmergencyRoleRemapToOutgoingPayload } = require("../../Vinili/Utils/Config/emergencyRoleIdRemap") as typeof import("../../Vinili/Utils/Config/emergencyRoleIdRemap");
    next = applyEmergencyRoleRemapToOutgoingPayload(next);
  } catch (_) {}

  try {
    const { coercePlainContentToNoticePayload } = require("./simpleNoticeEmbed") as typeof import("./simpleNoticeEmbed");
    next = coercePlainContentToNoticePayload(next, guild) || next;
  } catch (_) {
    /* keep next */
  }

  if (typeof next === "string") return next;
  if (typeof next !== "object" || Array.isArray(next)) return next;
  if (next.__skipNoticeEmbed === true || next.skipNoticeEmbed === true) {
    const cleaned = { ...next };
    delete cleaned.__skipNoticeEmbed;
    delete cleaned.skipNoticeEmbed;
    delete cleaned.__skipDefaultEmbedFooter;
    return cleaned;
  }
  if (next.__skipDefaultEmbedFooter) {
    const cleaned = { ...next };
    delete cleaned.__skipDefaultEmbedFooter;
    return cleaned;
  }
  // Remap role mentions even when there are no embeds (partnership pings, etc.).
  if (!Array.isArray(next.embeds) || next.embeds.length === 0) return next;
  const withMedia = applyEmbedMediaFallbackToPayload(next);
  return stripDefaultFooterInternals(applyDefaultFooterToEmbeds(withMedia, guild));
}

function wrapOutgoingPayloadMethod(prototype?, methodName?, resolveGuild?) {
  if (!prototype || typeof prototype[methodName] !== "function") return;
  const patchKey = "__viniliOutgoingEmbedPatched";
  if (!prototype[patchKey]) prototype[patchKey] = {};
  if (prototype[patchKey][methodName]) return;
  const original = prototype[methodName];
  prototype[methodName] = function wrappedOutgoingPayloadMethod(payload?, ...rest) {
    const guild = resolveGuild(this);
    const next = normalizeOutgoingPayload(payload, guild);
    return original.call(this, next, ...rest);
  };
  prototype[patchKey][methodName] = true;
}

function installOutgoingMessageEmbedPatch(discord?) {
  installEmbedMediaFallbackPatch();
  if (!discord || discord.__viniliOutgoingEmbedPatchInstalled) return;
  const { Message, Interaction } = discord;
  const patchedSend = new Set();
  for (const value of Object.values(discord)) {
    if (typeof value !== "function" || !value.prototype) continue;
    const sendFn = value.prototype.send;
    if (typeof sendFn !== "function" || patchedSend.has(sendFn)) continue;
    wrapOutgoingPayloadMethod(value.prototype, "send", (target?) => resolveGuildFromContext(target));
    patchedSend.add(sendFn);
  }
  if (Message?.prototype) {
    wrapOutgoingPayloadMethod(Message.prototype, "reply", (message?) => resolveGuildFromContext(message));
    wrapOutgoingPayloadMethod(Message.prototype, "edit", (message?) => resolveGuildFromContext(message));
  }
  if (Interaction?.prototype) {
    wrapOutgoingPayloadMethod(Interaction.prototype, "reply", (interaction?) => resolveGuildFromContext(interaction));
    wrapOutgoingPayloadMethod(Interaction.prototype, "followUp", (interaction?) => resolveGuildFromContext(interaction));
    wrapOutgoingPayloadMethod(Interaction.prototype, "editReply", (interaction?) => resolveGuildFromContext(interaction));
  }
  discord.__viniliOutgoingEmbedPatchInstalled = true;
}

function isErrorEmbed(data?) {
  if (!data || typeof data !== "object") return false;
  if (isErrorEmbedColor(data.color)) return true;
  const title = (data.title ?? "").toLowerCase();
  if (ERROR_TITLE_SUBSTRINGS.some((s?) => title.includes(s))) return true;
  return false;
}

function installEmbedFooterPatch() {
  if (!EmbedBuilder || typeof EmbedBuilder !== "function") return;
  installEmbedMediaFallbackPatch();
  if ((EmbedBuilder.prototype as any).__defaultFooterPatched) return;
  const originalToJSON = EmbedBuilder.prototype.toJSON;
  if (typeof originalToJSON !== "function") return;
  EmbedBuilder.prototype.toJSON = function toJSONWithDefaultFooter(...args) {
    const data = originalToJSON.apply(this, args);
    const brandColor = hexToInt(getEmbedBrandDefaultColor());
    const skipFooter = isErrorEmbed(data);
    if (brandColor && (!data.color || isLegacyDefaultEmbedColor(data.color))) {
      data.color = brandColor;
    }
    const withMedia = sanitizeEmbedDataObject(data);
    if (skipFooter) return withMedia;
    const iconURL = this.__skipFooterIcon ? null : getGlobalBotIconUrl();
    if (!withMedia.footer) {
      withMedia.footer = { text: DEFAULT_FOOTER_TEXT };
    } else if (withMedia.footer.text) {
      withMedia.footer.text = sanitizeEmbedFooterText(withMedia.footer.text);
    }
    if (iconURL && !withMedia.footer.icon_url) {
      withMedia.footer.icon_url = sanitizeEmbedMediaUrl(iconURL, { size: 64 }) || iconURL;
    }
    return withMedia;
  };
  (EmbedBuilder.prototype as any).__defaultFooterPatched = true;
}

export = {
  DEFAULT_FOOTER_TEXT,
  applyDefaultFooter,
  applyDefaultFooterToEmbeds,
  stripDefaultFooterInternals,
  installEmbedFooterPatch,
  installOutgoingMessageEmbedPatch,
  setEmbedBrandDefaultColor,
};