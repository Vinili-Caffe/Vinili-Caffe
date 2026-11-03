"use strict";

/** Custom profile: persistenza full-state, costanti e helper condivisi. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

function scheduleFullStatePersist(guild?, ownerId?, reason?) {
  try {
    const { schedulePersistUserFullState } = require("./userFullStatePersistenceService") as typeof import("./userFullStatePersistenceService");
    schedulePersistUserFullState(guild?.id, ownerId, { guild, reason: reason || "custom_profile_mutation" });
  } catch {
    /* ignore */
  }
}

function okPersist(guild?, ownerId?, reason?, payload?) {
  scheduleFullStatePersist(guild, ownerId, reason);
  return payload;
}

const ANCHOR_ROLE_ID = IDs?.roles?.separatore4 || "1469452890761596981";
const CUSTOM_VOC_CREATE_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"], IDs?.roles?.Level50].filter(Boolean);
const CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS = [IDs?.roles?.VIP, IDs?.roles?.ServerBooster, IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus].filter(Boolean);
const MAX_ROLE_ICON_BYTES = 2 * 1024 * 1024;
const HOLO = { primaryColor: 11127295, secondaryColor: 16759788, tertiaryColor: 16761760 };

function trimRoleName(name?) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  const base = clean || "Custom Role";
  const prefixed = base.startsWith("༄") ? base : `༄ ${base}`;
  return prefixed.slice(0, 100).trim();
}

function memberCanCreateCustomVoc(member?) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_VOC_CREATE_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
}

function memberHasGradientHoloAccess(member?) {
  if (!member?.roles?.cache) return false;
  return CUSTOM_ROLE_GRADIENT_HOLO_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId));
}

function isSafeRoleIconUrl(raw?) {
  const value = String(raw || "").trim();
  if (!value) return false;
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").trim().toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local")) return false;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return false;
  return true;
}

function resolveCustomEmojiFromValue(value?) {
  const text = String(value || "").trim();
  if (!text) return null;
  const customMatch = text.match(/<a?:([a-zA-Z0-9_~]{2,32}):(\d{16,22})>/);
  if (customMatch) {
    return { id: String(customMatch[2]), animated: /^<a:/i.test(customMatch[0]) };
  }
  return null;
}

export = {
  okPersist,
  ANCHOR_ROLE_ID,
  MAX_ROLE_ICON_BYTES,
  HOLO,
  trimRoleName,
  memberCanCreateCustomVoc,
  memberHasGradientHoloAccess,
  isSafeRoleIconUrl,
  resolveCustomEmojiFromValue,
};
