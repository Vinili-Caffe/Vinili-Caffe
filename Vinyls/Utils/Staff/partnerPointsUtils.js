const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { countValidAllTimePartners } = require("../Partner/partnerLeaderboardRuntime");

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

function resolveDisplayedPartnerPoints(staff) {
  if (!staff) return { before: 0, fromActions: 0, fromCounter: 0 };
  const fromActions = countValidAllTimePartners(Array.isArray(staff.partnerActions) ? staff.partnerActions : []);
  const fromCounter = Math.max(0, Math.floor(Number(staff.partnerCount ?? 0)));
  return { before: Math.max(fromCounter, fromActions), fromActions, fromCounter };
}

/**
 * Riscatto premi: il saldo mostrato è max(partnerCount, storico create).
 * Imposta partnerCount al nuovo totale così che max(nuovo, storico) = prima - importo.
 */
async function redeemPartnerManagerPointsForDisplay(guildId, userId, amount) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  const amt = Math.floor(Number(amount) || 0);
  if (!g || !u || amt < 1) return { ok: false, code: "bad_input" };

  const lean = await ActivityUserProfile.findOne({ guildId: g, userId: u }).select("staff").lean().catch(() => null);
  const { before, fromActions } = resolveDisplayedPartnerPoints(lean?.staff);
  if (before < amt) return { ok: false, code: "insufficient", before };
  const after = before - amt;
  if (after < fromActions) {
    const surplus = before - fromActions;
    return { ok: false, code: "floor", before, fromActions, surplus };
  }

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $set: { "staff.partnerCount": after } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (!updated) return { ok: false, code: "save_failed" };
  return { ok: true, doc: updated, before, after };
}

module.exports = {
  PARTNER_MANAGER_REDEEM_TIERS,
  partnerManagerRedeemTierFromAction,
  addPartnerPoints,
  removePartnerPoints,
  redeemPartnerManagerPointsForDisplay,
  resolveDisplayedPartnerPoints,
  formatPartnerPointsChange,
};