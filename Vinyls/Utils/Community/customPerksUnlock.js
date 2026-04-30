const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");

/** Unlock extra perk (es. 2° classificato contest disegni): stesso criterio usato in +profile / migrazione perks. */
async function hasExtraCustomPerksUnlock(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const row = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.contestPrizes profile.totals.exp.event")
    .lean()
    .catch(() => null);
  return Boolean(
    row?.profile?.contestPrizes?.disegniSecondPlaceUnlock ||
      row?.profile?.totals?.exp?.event?.contestDisegniSecondPlaceUnlock,
  );
}

module.exports = { hasExtraCustomPerksUnlock };