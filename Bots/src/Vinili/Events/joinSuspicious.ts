/** Ingresso membri: account sospetti (età, nome, avatar, ingressi a raffica). */
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../shared/recovery/snapshotStore") as typeof import("../../shared/recovery/snapshotStore");
const { hasNoAvatar } = require("./joinBots") as typeof import("./joinBots");

const SUSPICIOUS_JOIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const recentJoinSignalsByGuild = new Map();
const JOIN_SIGNALS_SNAPSHOT_PATH = path.join(__dirname, "..", "Data", "joinSignalsSnapshot.json");
let joinSignalsLoaded = false;

function persistJoinSignalsNow() {
  const payload: Record<string, any> = {};
  for (const [guildId, rows] of recentJoinSignalsByGuild.entries()) {
    if (!guildId || !Array.isArray(rows) || !rows.length) continue;
    payload[guildId] = rows.slice(-120);
  }
  writeSnapshotWithMeta({ filePath: JOIN_SIGNALS_SNAPSHOT_PATH, walPath: `${JOIN_SIGNALS_SNAPSHOT_PATH}.wal`, key: "vinyls_join_signals", version: 1, payload });
}

function ensureJoinSignalsLoaded() {
  if (joinSignalsLoaded) return;
  joinSignalsLoaded = true;
  const raw = readSnapshotWithMeta({ filePath: JOIN_SIGNALS_SNAPSHOT_PATH, walPath: `${JOIN_SIGNALS_SNAPSHOT_PATH}.wal`, key: "vinyls_join_signals", version: 1, fallback: {} });
  for (const [guildId, rows] of Object.entries(raw || {})) {
    if (!guildId || !Array.isArray(rows)) continue;
    recentJoinSignalsByGuild.set(guildId, rows.slice(-120));
  }
}

function toUnix(date?) {
  return Math.floor(date.getTime() / 1000);
}

function formatAccountAge(createdAt?) {
  const now = Date.now();
  const ageMs = now - createdAt.getTime();
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  const remainingDays = days % 30;

  const parts = [];
  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (remainingDays > 0 || parts.length === 0) {
    parts.push(`${remainingDays} day${remainingDays !== 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

function isTooYoungAccount(member?, minAgeDays = 3) {
  const safeMinDays = Math.max(0, Number(minAgeDays || 0));
  const minAgeMs = safeMinDays * 24 * 60 * 60 * 1000;
  const accountAgeMs = Date.now() - member.user.createdAt.getTime();
  return accountAgeMs < minAgeMs;
}

function getJoinGateNameCandidate(member?) {
  return String(member?.user?.globalName || member?.displayName || member?.nickname || member?.user?.username || "");
}

function normalizeText(value?) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function inviteLikeInName(text?) {
  const normalized = normalizeText(text);
  return /(?:discord\.gg\/|discord(?:app)?\.com\/invite\/|invite\.gg\/|dsc\.gg\/)/i.test(
    normalized,
  );
}

function wildcardToRegex(pattern?) {
  const escaped = String(pattern || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate?, rules?) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (normalizedWord && normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules.wildcardWords) ? rules.wildcardWords : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }
  return null;
}

function toAccountNameSkeleton(input?) {
  return normalizeText(input)
    .replace(/[0@]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/[8]/g, "b");
}

function hasMixedScripts(input?) {
  const value = String(input || "");
  if (!value) return false;
  const hasLatin = /[A-Za-z]/.test(value);
  const hasCyrillic = /[\u0400-\u04FF]/.test(value);
  const hasGreek = /[\u0370-\u03FF]/.test(value);
  const nonLatinScripts = Number(hasCyrillic) + Number(hasGreek);
  return hasLatin && nonLatinScripts > 0;
}

function normalizeCompact(input?) {
  return normalizeText(input).replace(/\s+/g, "");
}

function countVowels(input?) {
  return (String(input || "").match(/[aeiou]/gi) || []).length;
}

function looksRandomName(input?) {
  const raw = String(input || "").trim();
  if (!raw) return false;

  const compact = normalizeCompact(raw);
  if (compact.length < 6 || compact.length > 18) return false;
  if (!/^[a-z0-9._-]+$/i.test(raw)) return false;

  const alnum = compact.replace(/[^a-z0-9]/g, "");
  const letterOnly = alnum.replace(/\d/g, "");
  const vowelCount = countVowels(letterOnly);
  const vowelRatio = letterOnly.length > 0 ? vowelCount / letterOnly.length : 0;
  const digitCount = (alnum.match(/\d/g) || []).length;
  const uniqueRatio = alnum.length > 0 ? new Set(alnum.split("")).size / alnum.length : 0;
  const longConsonantRun = /[bcdfghjklmnpqrstvwxyz]{4,}/i.test(letterOnly);

  return (
    (digitCount >= 2 && vowelRatio <= 0.25 && uniqueRatio >= 0.68) ||
    (longConsonantRun && vowelRatio <= 0.3) ||
    (vowelCount === 0 && letterOnly.length >= 6)
  );
}

function pruneJoinSignals(records?) {
  const now = Date.now();
  return records.filter((item?) => now - Number(item?.joinedAt || 0) <= SUSPICIOUS_JOIN_WINDOW_MS);
}

function trackRecentJoinSignal(member?) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  if (!guildId || !userId) return;

  const avatarHash = String(member?.user?.avatar || "");
  const nameSkeleton = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );
  ensureJoinSignalsLoaded();
  const existing = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  existing.push({
    userId,
    joinedAt: Date.now(),
    avatarHash: avatarHash || null,
    nameSkeleton: nameSkeleton || null,
  });
  if (existing.length > 2500) {
    existing.splice(0, existing.length - 2500);
  }
  recentJoinSignalsByGuild.set(guildId, existing);
  persistJoinSignalsNow();
}

function getJoinSignalStats(member?) {
  const guildId = String(member?.guild?.id || "");
  const userId = String(member?.user?.id || "");
  const avatarHash = String(member?.user?.avatar || "");
  if (!guildId || !userId) {
    return { reusedAvatarCount: 0, similarNameCount: 0 };
  }

  ensureJoinSignalsLoaded();
  const records = pruneJoinSignals(recentJoinSignalsByGuild.get(guildId) || []);
  recentJoinSignalsByGuild.set(guildId, records);
  persistJoinSignalsNow();
  const normalizedName = toAccountNameSkeleton(`${member?.user?.username || ""}${member?.user?.globalName || ""}`.trim(),
  );

  const reusedAvatarCount = avatarHash ? records.filter((item?) => item?.userId !== userId && item?.avatarHash && String(item.avatarHash) === avatarHash,).length : 0;

  const similarNameCount = normalizedName ? records.filter((item?) => item?.userId !== userId && item?.nameSkeleton && String(item.nameSkeleton) === normalizedName,).length : 0;

  return { reusedAvatarCount, similarNameCount };
}

function detectSuspiciousAccount(member?) {
  const usernameRaw = String(member?.user?.username || "");
  const globalNameRaw = String(member?.user?.globalName || "");
  const displayNameRaw = String(member?.displayName || "");
  const combinedRaw = `${usernameRaw} ${globalNameRaw} ${displayNameRaw}`.trim();
  const combinedSkeleton = toAccountNameSkeleton(combinedRaw);
  const accountAgeMs = Date.now() - new Date(member.user.createdAt).getTime();
  const ageHours = accountAgeMs / (60 * 60 * 1000);
  const ageDays = ageHours / 24;

  const scamKeywords = ["nitro", "airdrop", "crypto", "steam", "gift", "giveaway", "freegift", "steamgift"];
  const impersonationKeywords = ["support", "moderator", "admin", "staff", "discordstaff", "discordsupport"];

  const signalLabels = [];
  let score = 0;
  let strongSignals = 0;

  if (inviteLikeInName(combinedRaw)) {
    score += 80;
    strongSignals += 1;
    signalLabels.push("invite-link");
  }

  const scamHits = scamKeywords.filter((kw?) => combinedSkeleton.includes(kw));
  if (scamHits.length > 0) {
    score += Math.min(50, 22 + scamHits.length * 10);
    strongSignals += 1;
    signalLabels.push(`scam:${scamHits.slice(0, 3).join(",")}`);
  }
  const impersonationHits = impersonationKeywords.filter((kw?) => combinedSkeleton.includes(kw));
  if (impersonationHits.length >= 2) {
    score += 28;
    strongSignals += 1;
    signalLabels.push(`impersonation:${impersonationHits.slice(0, 3).join(",")}`);
  } else if (impersonationHits.length === 1) {
    score += 10;
    signalLabels.push(`impersonation:${impersonationHits[0]}`);
  }

  const digitCount = (combinedRaw.match(/\d/g) || []).length;
  const separatorCount = (combinedRaw.match(/[._-]/g) || []).length;
  if (digitCount >= 8) {
    score += 16;
    signalLabels.push(`digits:${digitCount}`);
  }
  if (separatorCount >= 5) {
    score += 10;
    signalLabels.push(`separators:${separatorCount}`);
  }
  if (/(.)\1{4,}/i.test(combinedRaw)) {
    score += 10;
    signalLabels.push("repeated-chars");
  }
  if (hasMixedScripts(combinedRaw)) {
    score += 30;
    strongSignals += 1;
    signalLabels.push("mixed-scripts");
  }

  if (looksRandomName(usernameRaw) || looksRandomName(globalNameRaw)) {
    score += 24;
    strongSignals += 1;
    signalLabels.push("random-name");
  }

  if (ageHours <= 24) {
    score += 28;
    signalLabels.push("age<=24h");
  } else if (ageHours <= 72) {
    score += 18;
    signalLabels.push("age<=72h");
  } else if (ageDays <= 7) {
    score += 8;
    signalLabels.push("age<=7d");
  }

  if (hasNoAvatar(member) && ageDays <= 7) {
    score += 22;
    signalLabels.push("no-avatar+young");
  }

  const { reusedAvatarCount, similarNameCount } = getJoinSignalStats(member);
  if (reusedAvatarCount >= 3) {
    score += 36;
    strongSignals += 1;
    signalLabels.push(`avatar-reused:${reusedAvatarCount + 1}`);
  } else if (reusedAvatarCount === 2) {
    score += 14;
    signalLabels.push("avatar-reused:3");
  }
  if (similarNameCount >= 3) {
    score += 18;
    signalLabels.push(`name-clone:${similarNameCount + 1}`);
  }

  const suspicious = score >= 90 || (strongSignals >= 2 && score >= 78);
  if (suspicious) {
    return `score ${Math.min(100, score)}/100 | segnali: ${signalLabels.slice(0, 5).join(" | ")}`;
  }
  return null;
}

export = { toUnix, formatAccountAge, isTooYoungAccount, getJoinGateNameCandidate, inviteLikeInName, matchUsernameFilters, trackRecentJoinSignal, detectSuspiciousAccount };
