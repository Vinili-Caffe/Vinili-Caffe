const { JOIN_RAID_CONFIG } = require("./joinRaidConfig") as typeof import("./joinRaidConfig");
const { nowMs } = require("./joinRaidState") as typeof import("./joinRaidState");
const {
  isJoinGateSuspiciousAccount,
} = require("./joinGateSuspiciousService") as typeof import("./joinGateSuspiciousService");

function normalizeUsername(input?) {
  return String(input || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function usernameSkeleton(input?) {
  return normalizeUsername(input).replace(/\d+/g, "");
}

function countIdMatches(state?, member?, at = nowMs()) {
  if (!JOIN_RAID_CONFIG.idFlag.enabled) return 0;
  const createdAt = new Date(member.user.createdAt).getTime();
  const skeleton = usernameSkeleton(
    member.user.globalName || member.displayName || member.user.username,
  );

  let matches = 0;
  for (const sample of state.samples) {
    const delta = Math.abs(createdAt - Number(sample.createdAt || 0));
    const createdNear = delta <= JOIN_RAID_CONFIG.idFlag.createdAtDeltaMs;
    const nameNear =
      skeleton.length >= 4 &&
      sample.skeleton &&
      (sample.skeleton.startsWith(skeleton.slice(0, 4)) ||
        skeleton.startsWith(sample.skeleton.slice(0, 4)));
    if (createdNear || nameNear) matches += 1;
  }
  return matches;
}

function getRequiredIdMatches(state?, at = nowMs()) {
  const base = Math.max(1, Number(JOIN_RAID_CONFIG.idFlag.minimumMatches || 4));
  const mode = String(
    JOIN_RAID_CONFIG.idFlag.categorization || "adaptive",
  ).toLowerCase();
  if (mode === "static") return base;
  const recentSamples = (Array.isArray(state?.samples) ? state.samples : [])
    .filter(
      (sample?) =>
        at - Number(sample?.ts || 0) <=
        Number(JOIN_RAID_CONFIG.idFlag.compareWindowMs || 0),
    ).length;
  const algorithmicThreshold = Math.max(
    2,
    Math.min(10, Math.round(recentSamples / 6)),
  );
  if (mode === "algorithm") return algorithmicThreshold;
  return Math.max(2, Math.min(base, algorithmicThreshold + 1));
}

function isNoPfp(member?) {
  return !member?.user?.avatar;
}

function isTooYoung(member?) {
  const ageMs = nowMs() - new Date(member.user.createdAt).getTime();
  return ageMs < JOIN_RAID_CONFIG.ageFlag.minimumAgeMs;
}

async function getFlagReasons(state?, member?, at = nowMs()) {
  const reasons = [];
  if (JOIN_RAID_CONFIG.idFlag.enabled) {
    const matches = countIdMatches(state, member, at);
    const needed = getRequiredIdMatches(state, at);
    if (matches >= needed) {
      reasons.push({
        key: "id_flag",
        label: "ID Flag",
        detail: `${matches} matches (need ${needed})`,
      });
    }
  }
  if (JOIN_RAID_CONFIG.noPfpFlag.enabled && isNoPfp(member)) {
    reasons.push({
      key: "no_pfp",
      label: "NoPFP Flag",
      detail: "No profile picture",
    });
  }
  if (JOIN_RAID_CONFIG.ageFlag.enabled && isTooYoung(member)) {
    reasons.push({
      key: "age_flag",
      label: "Age Flag",
      detail: "Account too young",
    });
  }
  const joinGateSuspicious = await isJoinGateSuspiciousAccount(
    member?.guild?.id,
    member?.id,
  ).catch(() => false);
  if (joinGateSuspicious) {
    reasons.push({
      key: "join_gate_suspicious",
      label: "JoinGate Suspicious",
      detail: "User flagged by JoinGate suspicious-account filter",
    });
  }
  return reasons;
}

function matchJoinRaidAccountType(member?, reasons = []) {
  const accountType = String(JOIN_RAID_CONFIG.accountType || "any").toLowerCase();
  const keys = new Set(
    (Array.isArray(reasons) ? reasons : []).map((x?) => String(x?.key || "")),
  );
  keys.delete("join_gate_suspicious");
  if (!keys.size) return false;
  if (accountType === "any") return true;
  if (accountType === "young") return keys.has("age_flag");
  if (accountType === "no_pfp") return keys.has("no_pfp");
  if (accountType === "young_or_no_pfp") {
    return keys.has("age_flag") || keys.has("no_pfp");
  }
  if (accountType === "id_flag") return keys.has("id_flag");
  return keys.size > 0;
}

function isHighRiskJoinRaidReasons(reasons = []) {
  const keys = new Set(
    (Array.isArray(reasons) ? reasons : []).map((x?) => String(x?.key || "")),
  );
  if (!keys.size) return false;
  if (keys.has("id_flag")) return true;
  return keys.has("age_flag") && keys.has("no_pfp");
}

export = {
  normalizeUsername,
  usernameSkeleton,
  countIdMatches,
  getRequiredIdMatches,
  isNoPfp,
  isTooYoung,
  getFlagReasons,
  matchJoinRaidAccountType,
  isHighRiskJoinRaidReasons,
};
