/** Ruoli personalizzati: controlli e utilità (proprietario, colore, icona, pannello). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { findEmojiByShortName, resolveStoredCustomEmojiFromClient } = require("../../Community/utils/mentionReactionPanelUtils") as typeof import("../../Community/utils/mentionReactionPanelUtils");
const { resolveCustomRoleState, buildExpiryText } = require("../../Community/utils/customRoleState") as typeof import("../../Community/utils/customRoleState");
const { fetchGuildRole, replyEphemeral, refreshEmbedRoleLine } = require("../../Community/utils/customRoleUtils") as typeof import("../../Community/utils/customRoleUtils");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const PRIVATE_FLAG = 1 << 6;
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;
const CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS = [ IDs?.roles?.VIP, IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, ].filter(Boolean);

function isSafeRoleIconUrl(raw?) {
  const value = String(raw || "").trim();
  if (!value) return false;
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  ) {
    return false;
  }
  return true;
}

function extractMentionOrId(message?) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned?.id) return String(mentioned.id);
  const match = String(message?.content || "").match(/\d{16,20}/);
  return match ? String(match[0]) : "";
}

function normalizeHex(raw?) {
  const value = String(raw || "").trim();
  const hex = value.startsWith("#") ? value : `#${value}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "";
}

async function fetchRole(interaction?, roleId?) {
  const guild = interaction.guild;
  if (!guild) return null;
  return (
    guild.roles.cache.get(roleId) ||
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

export = { PRIVATE_FLAG, MAX_ROLE_ICON_BYTES, isSafeRoleIconUrl, extractMentionOrId, normalizeHex, fetchRole };
