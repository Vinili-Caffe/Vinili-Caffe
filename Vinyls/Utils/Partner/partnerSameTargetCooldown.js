const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

/** Tra due partnership con lo stesso server target devono passare almeno 12 ore (in tutta la guild). */
const PARTNER_SAME_TARGET_COOLDOWN_MS = 12 * 60 * 60 * 1000;

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Data/ora dell’ultima azione `create` verso lo stesso partner (per guildId Discord del target o stesso codice invite).
 * @param {string} guildId
 * @param {string} partnerGuildId
 * @param {string} inviteCode codice invite (senza URL)
 * @returns {Promise<Date|null>}
 */
async function getLatestPartnerCreateAtForTarget(guildId, partnerGuildId, inviteCode) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const pg = String(partnerGuildId || "").trim();
  const code = String(inviteCode || "").trim().toLowerCase();

  const or = [];
  if (pg && /^\d{17,22}$/.test(pg)) {
    or.push({ "staff.partnerActions.partnerGuildId": pg });
  }
  if (code) {
    const e = escapeRegExp(code);
    or.push({ "staff.partnerActions.invite": new RegExp(`discord\\.gg/${e}(?:\\?|[/\\s]|$)`, "i") });
    or.push({ "staff.partnerActions.invite": new RegExp(`discord\\.com/invite/${e}(?:\\?|[/\\s]|$)`, "i") });
  }
  if (!or.length) return null;

  const rows = await ActivityUserProfile.aggregate([
    { $match: { guildId: gid } },
    { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "staff.partnerActions.action": "create",
        $or: or,
      },
    },
    { $group: { _id: null, lastAt: { $max: "$staff.partnerActions.date" } } },
  ]).catch(() => []);

  const raw = rows?.[0]?.lastAt;
  if (!raw) return null;
  const d = raw instanceof Date ? raw : new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, nextAllowedAt: Date }>}
 */
async function checkSamePartnerTargetCooldown(guildId, partnerGuildId, inviteCode) {
  const last = await getLatestPartnerCreateAtForTarget(guildId, partnerGuildId, inviteCode);
  if (!last) return { ok: true };
  const elapsed = Date.now() - last.getTime();
  if (elapsed >= PARTNER_SAME_TARGET_COOLDOWN_MS) return { ok: true };
  return { ok: false, nextAllowedAt: new Date(last.getTime() + PARTNER_SAME_TARGET_COOLDOWN_MS) };
}

module.exports = {
  PARTNER_SAME_TARGET_COOLDOWN_MS,
  getLatestPartnerCreateAtForTarget,
  checkSamePartnerTargetCooldown,
};