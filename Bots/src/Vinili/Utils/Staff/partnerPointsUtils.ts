const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolvePartnerPointsShown } = require("./partnerPointsDisplayUtils") as typeof import("./partnerPointsDisplayUtils");
const {
  PARTNER_REWARD_CANONICAL_TIERS,
  PARTNER_REWARD_LABELS,
  getPartnerRewardPointCost,
  partnerManagerRedeemButtonLabel: buildPartnerManagerRedeemButtonLabel,
} = require("../../../shared/partner/partnerManagerRewardTiers") as typeof import("../../../shared/partner/partnerManagerRewardTiers");

const PARTNER_MANAGER_REDEEM_TIERS = [...PARTNER_REWARD_CANONICAL_TIERS];
const PARTNER_MILESTONE_POINT_TIERS = PARTNER_MANAGER_REDEEM_TIERS;
const PARTNER_MILESTONE_REWARD_LABELS = PARTNER_REWARD_LABELS;

function partnerManagerRedeemButtonLabel(tier?, now?) {
  return buildPartnerManagerRedeemButtonLabel(tier, now);
}

function formatPartnerPointsChange(action?, amount?) {
  const safeAmount = Number(amount || 0);
  const isSingular = Math.abs(safeAmount) === 1;
  if (action === "add") {
    return `${isSingular ? "Aggiunto" : "Aggiunti"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
  }
  return `${isSingular ? "Rimosso" : "Rimossi"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
}

async function addPartnerPoints(guildId?, userId?, amount?, milestoneNotify = null) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  const beforeLean = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("staff").lean().catch(() => null);
  const beforePoints = resolvePartnerPointsShown(beforeLean?.staff);
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $inc: { "staff.partnerCount": amount }, $setOnInsert: { guildId: g, userId: u } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!updated) return null;
  const afterPoints = resolvePartnerPointsShown(updated.staff);
  if (afterPoints <= beforePoints) return updated;
  if (!milestoneNotify?.client || !milestoneNotify?.guild) return updated;
  const { maybeSendPartnerManagerRewardMilestoneDms } = require("./partnerManagerMilestoneDm") as typeof import("./partnerManagerMilestoneDm");
  void maybeSendPartnerManagerRewardMilestoneDms(milestoneNotify.client, milestoneNotify.guild, u, beforePoints, afterPoints).catch(() => null);
  return updated;
}

async function removePartnerPoints(guildId?, userId?, amount?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  const dec = Math.floor(Number(amount) || 0);
  if (!g || !u || dec < 1) return null;

  const lean = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("staff").lean().catch(() => null);
  const before = resolvePartnerPointsShown(lean?.staff);
  const actualDec = Math.min(dec, before);
  if (actualDec < 1) return null;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $inc: { "staff.partnerRedeemSpend": actualDec } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!updated) return null;

  updated._partnerPointsRemoved = actualDec;
  return updated;
}


async function redeemPartnerManagerPointsForDisplay(guildId?, userId?, amount?) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  const amt = Math.floor(Number(amount) || 0);
  if (!g || !u || amt < 1) return { ok: false, code: "bad_input" };

  const lean = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("staff").lean().catch(() => null);
  const before = resolvePartnerPointsShown(lean?.staff);
  if (before < amt) return { ok: false, code: "insufficient", before };

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $inc: { "staff.partnerRedeemSpend": amt } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!updated) return { ok: false, code: "save_failed" };
  const after = resolvePartnerPointsShown(updated?.staff);
  return { ok: true, doc: updated, before, after };
}

function partnerManagerCanAffordReward(balance?, canonicalTier?, now?) {
  const pts = Math.max(0, Math.floor(Number(balance) || 0));
  const cost = getPartnerRewardPointCost(canonicalTier, now);
  return pts >= cost;
}

export = {
  PARTNER_MANAGER_REDEEM_TIERS,
  PARTNER_MILESTONE_POINT_TIERS,
  PARTNER_MILESTONE_REWARD_LABELS,
  partnerManagerRedeemButtonLabel,
  partnerManagerCanAffordReward,
  getPartnerRewardPointCost,
  addPartnerPoints,
  removePartnerPoints,
  redeemPartnerManagerPointsForDisplay,
  formatPartnerPointsChange,
};
