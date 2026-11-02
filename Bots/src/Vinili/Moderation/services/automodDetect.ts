/** Automod: riconoscimento delle violazioni in un messaggio. */
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ACTIVITY_MAIN_GUILD_ID } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { TEXT_RULES, nowMs } = require("./automodText") as typeof import("./automodText");
const { PANIC_MODE, getPanicState } = require("./automodEmbeds") as typeof import("./automodEmbeds");
const { findHateSpeechMatch } = require("../utils/automodHateSpeechMatch") as typeof import("../utils/automodHateSpeechMatch");

const AUTOMOD_IMAGE_ONLY_MAX_COUNT = 30;
const AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER = 0.12;

function isAutomodMainGuild(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const mainId = String(ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
  return Boolean(mainId && gid === mainId);
}
const SUSPICIOUS_ACCOUNT_STRONG_KEYS = new Set([
  "mention_user",
  "mention_role",
  "mention_everyone",
  "mention_hour_cap",
  "mentions_lockdown",
  "invite",
  "scam_pattern",
  "scam_image_bait",
  "grabbed_scam_image",
  "nsfw_link",
  "link_blacklist",
  "attachment_embed",
  "attachment_image",
  "attachment_file",
  "attachment_link",
  "attachment_sticker",
]);
const SPAM_WHITELIST_CATEGORY_IDS = new Set([].filter(Boolean).map(String),);
const INVITE_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);
const MENTION_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);
const EVERYONE_WHITELIST_CHANNEL_IDS = new Set([IDs?.channels?.partnerships, "1442569193470824448",].filter(Boolean).map(String),);

function isWhitelistedByChannel(channelId?, parentChannelId?, setRef?) {
  const set = setRef instanceof Set ? setRef : new Set();
  if (!set.size) return false;
  return set.has(String(channelId || "")) || set.has(String(parentChannelId || ""));
}

function applyProfileHeat(heat?, profile?) {
  const multiplier = Number(profile?.heatMultiplier || 1);
  const scaled = Number(heat || 0) * (Number.isFinite(multiplier) ? multiplier : 1);
  return Number(Math.max(0, scaled).toFixed(2));
}

function resolveAttachmentHeatScale(profile?) {
  const configured = Number(profile?.attachmentHeatMultiplier);
  if (!Number.isFinite(configured)) return null;
  return Math.max(0, Math.min(1, configured));
}

function resolveImageOnlyMaxCount(profile?) {
  const configured = Number(profile?.imageOnlyMaxCount);
  if (Number.isFinite(configured) && configured > 0) return Math.floor(configured);
  return AUTOMOD_IMAGE_ONLY_MAX_COUNT;
}

function isPanicModeActive(guildId?, at = nowMs()) {
  if (!PANIC_MODE.enabled) return false;
  const state = getPanicState(guildId);
  return state.activeUntil > at;
}

function detectInvite(content?) {
  const text = String(content || "");
  const match = text.match(/(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]{2,})/i,);
  return match ? String(match[1] || "").toLowerCase() : null;
}

function findBlacklistedWordMatch(content?) {
  if (!TEXT_RULES.wordBlacklist.enabled) return null;
  if (TEXT_RULES.wordBlacklist.useRacistList === false) return null;
  return findHateSpeechMatch(content);
}

function countZalgo(content?) {
  return (String(content || "").match(/[\u0300-\u036f]/g) || []).length;
}

export = { AUTOMOD_IMAGE_ONLY_HEAT_MULTIPLIER, isAutomodMainGuild, SUSPICIOUS_ACCOUNT_STRONG_KEYS, SPAM_WHITELIST_CATEGORY_IDS, INVITE_WHITELIST_CHANNEL_IDS, MENTION_WHITELIST_CHANNEL_IDS, EVERYONE_WHITELIST_CHANNEL_IDS, isWhitelistedByChannel, applyProfileHeat, resolveAttachmentHeatScale, resolveImageOnlyMaxCount, isPanicModeActive, detectInvite, findBlacklistedWordMatch, countZalgo };
