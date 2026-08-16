const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env");
const { isViniliProtectedGuild } = require("../../MultiGuild/core/viniliProtectedGuilds");
const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy");
const {
  getPartnershipConfigSync,
  refreshPartnershipConfigCache,
  isPartnershipSetupComplete,
} = require("../../MultiGuild/core/tenantPartnershipSettings");
const {
  getPartnerManagerRoleId,
  memberHasPartnerManagerRole,
} = require("../../Utils/Partner/partnershipConfigResolver");

/**
 * Se il ruolo Partner Manager viene tolto su un tenant:
 * - azzera i punti “attivi” sul server (classifica / spendibili)
 * - lascia `partnerActions` intatte (storico + attribuzione sul profilo)
 */
async function resetTenantPartnerServerScoreOnRoleRemove(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!/^\d{16,20}$/.test(gid) || !/^\d{16,20}$/.test(uid)) {
    return { ok: false, reason: "invalid_ids" };
  }

  const now = new Date();
  const result = await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        "staff.partnerCount": 0,
        "staff.partnerRedeemSpend": 0,
        "staff.partnerServerResetAt": now,
        "staff.managerId": null,
      },
    },
  ).catch((err) => {
    global.logger?.warn?.("[tenantPmRole] reset score failed:", err?.message || err);
    return null;
  });

  if (!result) return { ok: false, reason: "db_error" };
  if (!result.matchedCount && !result.n) {
    return { ok: true, skipped: true, reason: "no_profile" };
  }

  try {
    const { invalidateLeaderboardCache } = require("./tenantLeaderboardService");
    invalidateLeaderboardCache();
  } catch (_) {}

  return { ok: true, resetAt: now };
}

function roleWasRemoved(oldMember, newMember, roleId) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const had = Boolean(oldMember?.roles?.cache?.has?.(rid));
  const has = Boolean(newMember?.roles?.cache?.has?.(rid));
  return had && !has;
}

async function handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client) {
  void client;
  if (!oldMember || !newMember?.guild?.id || !newMember?.user || newMember.user.bot) return;
  const guildId = String(newMember.guild.id);

  if (!isMultiGuildLayerEnabled()) return;
  if (isViniliProtectedGuild(guildId)) return;
  if (!shouldApplyMultiGuildLayer(guildId)) return;

  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(guildId);
  if (!isPartnershipSetupComplete(config)) return;

  const roleId = getPartnerManagerRoleId(guildId) || config?.partnerManagerRoleId;
  if (!roleWasRemoved(oldMember, newMember, roleId)) return;

  // Conferma: non ha più il ruolo PM configurato.
  if (memberHasPartnerManagerRole(newMember, guildId)) return;

  await resetTenantPartnerServerScoreOnRoleRemove(guildId, newMember.id);
}

module.exports = {
  handleTenantPartnerManagerRoleUpdate,
  resetTenantPartnerServerScoreOnRoleRemove,
};
