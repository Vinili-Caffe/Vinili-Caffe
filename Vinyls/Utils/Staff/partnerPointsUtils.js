const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolvePartnerPointsShown } = require("./partnerPointsDisplayUtils");
const { PARTNER_MILESTONE_POINT_TIERS } = require("./partnerManagerMilestoneDm");
const PARTNER_MANAGER_REDEEM_TIERS = [...PARTNER_MILESTONE_POINT_TIERS];
const PARTNER_MANAGER_REDEEM_BUTTON_LABELS = Object.freeze({ 50: "50 partner · Custom Role e Custom Voc per 30 giorni", 100: "100 partner · Ruolo VIP per 30 giorni", 150: "150 partner · Decorazione a scelta (max 15,99 €)", 200: "200 partner · Nitro Boost", 250: "250 partner · 5 € PayPal" });

function partnerManagerRedeemButtonLabel(tier) {
  const n = Math.floor(Number(tier) || 0);
  return PARTNER_MANAGER_REDEEM_BUTTON_LABELS[n] || `Riscatto ${n} punti partner`;
}

function partnerManagerRedeemTierFromAction(action) {
  const m = String(action || "").match(/^ppm_r(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return PARTNER_MANAGER_REDEEM_TIERS.includes(n) ? n : null;
}

function partnerManagerApplyPerkTierFromAction(action) {
  const m = String(action || "").match(/^ppm_a(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return n === 50 || n === 100 ? n : null;
}

function formatPartnerPointsChange(action, amount) {
  const safeAmount = Number(amount || 0);
  const isSingular = Math.abs(safeAmount) === 1;
  if (action === "add") {
    return `${isSingular ? "Aggiunto" : "Aggiunti"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
  }
  return `${isSingular ? "Rimosso" : "Rimossi"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
}

async function addPartnerPoints(guildId, userId, amount, milestoneNotify = null) {
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
  const { maybeSendPartnerManagerRewardMilestoneDms } = require("./partnerManagerMilestoneDm");
  void maybeSendPartnerManagerRewardMilestoneDms(milestoneNotify.client, milestoneNotify.guild, u, beforePoints, afterPoints).catch(() => null);
  return updated;
}

async function removePartnerPoints(guildId, userId, amount) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  const dec = Number(amount || 0);
  return ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    [
      {
        $set: {
          guildId: g,
          userId: u,
          "staff.partnerCount": {
            $max: [0, { $subtract: [{ $ifNull: ["$staff.partnerCount", 0] }, dec] }],
          },
        },
      },
    ],
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
}


async function redeemPartnerManagerPointsForDisplay(guildId, userId, amount) {
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

module.exports = { PARTNER_MANAGER_REDEEM_TIERS, PARTNER_MANAGER_REDEEM_BUTTON_LABELS, partnerManagerRedeemButtonLabel, partnerManagerRedeemTierFromAction, partnerManagerApplyPerkTierFromAction, addPartnerPoints, removePartnerPoints, redeemPartnerManagerPointsForDisplay, formatPartnerPointsChange };