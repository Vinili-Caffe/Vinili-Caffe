const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolvePartnerPointsShown } = require("./partnerPointsDisplayUtils");

const PARTNER_MANAGER_REDEEM_TIERS = [50, 75, 150];

function partnerManagerRedeemTierFromAction(action) {
  const m = String(action || "").match(/^ppm_r(\d+)$/);
  if (!m) return null;
  const n = Number(m[1]);
  return PARTNER_MANAGER_REDEEM_TIERS.includes(n) ? n : null;
}

function formatPartnerPointsChange(action, amount) {
  const safeAmount = Number(amount || 0);
  const isSingular = Math.abs(safeAmount) === 1;
  if (action === "add") {
    return `${isSingular ? "Aggiunto" : "Aggiunti"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
  }
  return `${isSingular ? "Rimosso" : "Rimossi"} \`${safeAmount}\` ${isSingular ? "punto" : "punti"}`;
}

async function addPartnerPoints(guildId, userId, amount) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    {
      $inc: { "staff.partnerCount": amount },
      $setOnInsert: { guildId: g, userId: u },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  );
}

async function removePartnerPoints(guildId, userId, amount) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    [
      {
        $set: {
          guildId: g,
          userId: u,
          "staff.partnerCount": {
            $max: [
              0,
              {
                $subtract: [
                  { $ifNull: ["$staff.partnerCount", 0] },
                  Number(amount || 0),
                ],
              },
            ],
          },
        },
      },
    ],
    {
      new: true,
      upsert: true,
    },
  );
}

/**
 * Riscatto premi PM: incrementa `staff.partnerRedeemSpend` così il saldo mostrato
 * (resolvePartnerPointsShown) scende senza essere bloccato dallo storico partnership.
 */
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

module.exports = {
  PARTNER_MANAGER_REDEEM_TIERS,
  partnerManagerRedeemTierFromAction,
  addPartnerPoints,
  removePartnerPoints,
  redeemPartnerManagerPointsForDisplay,
  formatPartnerPointsChange,
};