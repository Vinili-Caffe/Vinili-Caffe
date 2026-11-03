/** Community ops: numbering vocali pubbliche (Lounge/Duo/… e separator). */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");
const { INDEX_PREFIX_RE, INDEX_SUFFIX_RE, toSuperscriptNumber } = require("./communityOpsCategoryNames") as typeof import("./communityOpsCategoryNames");
const { renameVoiceChannelWithGap } = require("./communityOpsCategoryRename") as typeof import("./communityOpsCategoryRename");

const PUBLIC_VOICE_SEPARATOR_NAME = "〝";
const PUBLIC_VOICE_NUMBERING_GROUPS = ["Lounge", "Duo", "Trio", "Quad", "Penta", "Hexa", "Setta", "Octa", "Squad"];
function getPublicVoiceHubChannelIdSet() {
  return new Set(
    (Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : [])
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );
}
const PUBLIC_VOICE_DECORATIVE_PREFIX = "༄";

function buildPublicVoiceSeparatorChannelIds() {
  const ids = new Set();
  const channels = IDs?.channels || {};
  for (const [key, value] of Object.entries(channels)) {
    if (!/^separator/i.test(String(key || ""))) continue;
    const id = String(value || "").trim();
    if (id) ids.add(id);
  }
  return ids;
}

const PUBLIC_VOICE_SEPARATOR_CHANNEL_IDS = buildPublicVoiceSeparatorChannelIds();

function stripPublicVoiceNumberingMarks(name?) {
  return String(name || "")
    .replace(INDEX_PREFIX_RE, "")
    .replace(INDEX_SUFFIX_RE, "")
    .replace(/^[0-9]{1,3}\s*/, "")
    .trim();
}

function looksLikeCorruptedPublicVoiceSeparatorName(stripped?) {
  const value = String(stripped || "").trim();
  if (!value) return false;
  if (value === PUBLIC_VOICE_SEPARATOR_NAME) return true;
  if (value === PUBLIC_VOICE_DECORATIVE_PREFIX) return true;
  if (value === '"' || value === "\u201d" || value === "\u201c") return true;
  if (/^[⁰¹²³⁴⁵⁶⁷⁸⁹0-9]+$/.test(value)) return true;
  if (
    value.startsWith(PUBLIC_VOICE_DECORATIVE_PREFIX) &&
    !/(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)/i.test(value) &&
    !/[\p{Extended_Pictographic}]/u.test(value.slice(PUBLIC_VOICE_DECORATIVE_PREFIX.length))
  ) {
    return true;
  }
  return false;
}

function isPublicVoiceNumberingSeparator(channel?) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  const channelId = String(channel.id || "");
  if (PUBLIC_VOICE_SEPARATOR_CHANNEL_IDS.has(channelId)) return true;
  const raw = String(channel.name || "").trim();
  const stripped = stripPublicVoiceNumberingMarks(raw);
  if (looksLikeCorruptedPublicVoiceSeparatorName(stripped)) return true;
  if (raw === PUBLIC_VOICE_SEPARATOR_NAME || raw === "〝") return true;
  if (raw.includes("🔒") && !resolvePublicVoiceNumberingGroup(channel)) return true;
  return false;
}

function resolvePublicVoiceNumberingGroup(channel?) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return "";
  const name = String(channel.name || "");
  if (/\bLounge\b/i.test(name)) return "Lounge";
  if (/\bDuo\b/i.test(name)) return "Duo";
  if (/\bTrio\b/i.test(name)) return "Trio";
  if (/\bQuad\b/i.test(name)) return "Quad";
  if (/\bPenta\b/i.test(name)) return "Penta";
  if (/\bHexa\b/i.test(name)) return "Hexa";
  if (/\bSetta\b/i.test(name)) return "Setta";
  if (/\bOcta\b/i.test(name)) return "Octa";
  if (/\bSquad\b/i.test(name)) return "Squad";
  return "";
}

function isPublicVoiceNumberingTarget(channel?) {
  if (getPublicVoiceHubChannelIdSet().has(String(channel?.id || ""))) return false;
  return Boolean(resolvePublicVoiceNumberingGroup(channel));
}

function buildPublicVoiceNumberedName(channelName?, nextNumber?) {
  const base = stripPublicVoiceNumberingMarks(channelName);
  return `${base}${nextNumber}`;
}

async function normalizePublicVoiceSeparatorName(channel?) {
  if (!channel?.manageable || !isPublicVoiceNumberingSeparator(channel)) return;
  const raw = String(channel.name || "").trim();
  const stripped = stripPublicVoiceNumberingMarks(raw);
  if (/(Lounge|Duo|Trio|Quad|Penta|Hexa|Setta|Octa|Squad)/i.test(stripped)) return;
  if (raw === PUBLIC_VOICE_SEPARATOR_NAME) return;
  await renameVoiceChannelWithGap(channel, PUBLIC_VOICE_SEPARATOR_NAME, "separator");
}

async function applyPublicVoiceSegmentNumbers(segment?, options?) {
  let index = 1;
  let pending = 0;
  const segmentList = Array.isArray(segment) ? segment : [...segment.values()];
  if (!segmentList.length) return pending;
  for (const channel of segmentList) {
    if (!channel || !isPublicVoiceNumberingTarget(channel)) continue;
    const nextNumber = toSuperscriptNumber(index++, options.minDigits);
    const expectedName = buildPublicVoiceNumberedName(channel.name, nextNumber);
    if (channel.name === expectedName) continue;
    if (!channel.manageable) {
      pending += 1;
      global.logger?.warn?.(
        "[CATEGORY NUMBERING] segment channel not manageable:",
        channel.id,
        channel.name,
        "->",
        expectedName,
      );
      continue;
    }
    const ok = await renameVoiceChannelWithGap(channel, expectedName, "segment");
    if (!ok) pending += 1;
  }
  return pending;
}

async function renumberCategoryVoiceChannels(guild?, categoryId?, options?) {
  if (!guild || !categoryId) return 0;

  const channels = guild.channels.cache
    .filter((channel?) => String(channel.parentId || "") === String(categoryId))
    .sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));

  for (const channel of channels.values()) {
    if (isPublicVoiceNumberingSeparator(channel)) {
      await normalizePublicVoiceSeparatorName(channel);
    }
  }

  let pending = 0;
  for (const group of PUBLIC_VOICE_NUMBERING_GROUPS) {
    const segment = [...channels.values()]
      .filter((channel?) => resolvePublicVoiceNumberingGroup(channel) === group)
      .sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));
    if (segment.length <= 0) continue;
    pending += await applyPublicVoiceSegmentNumbers(segment, options);
  }
  return pending;
}

export = {
  renumberCategoryVoiceChannels,
};
