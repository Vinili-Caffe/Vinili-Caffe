const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { incrementPanicMetric } = require("./antiNukePanicReport") as typeof import("./antiNukePanicReport");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const DANGEROUS_PERMS = [PermissionsBitField.Flags.Administrator, PermissionsBitField.Flags.ManageGuild, PermissionsBitField.Flags.ManageRoles, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ManageWebhooks, PermissionsBitField.Flags.BanMembers, PermissionsBitField.Flags.KickMembers,];

function getDangerMask(flags = DANGEROUS_PERMS) {
  let mask = 0n;
  for (const flag of flags) mask |= BigInt(flag);
  return mask;
}

async function lockDangerousRolesForPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.dangerousRoles) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;

  const allowlist = ANTINUKE_CONFIG.panicMode.lockdown.roleAllowlistIds;
  const dangerMask = getDangerMask(DANGEROUS_PERMS);
  for (const role of guild.roles.cache.values()) {
    if (!role || role.managed || role.id === guild.id) continue;
    if (allowlist?.size && allowlist.has(String(role.id))) continue;
    if (role.position >= me.roles.highest.position) continue;
    const current = BigInt(role.permissions?.bitfield || 0n);
    if ((current & dangerMask) === 0n) continue;
    if (!state.lockedRoles.has(role.id)) {
      state.lockedRoles.set(role.id, String(current));
    }
    const safeBits = current & ~dangerMask;
    if (safeBits !== current) {
      const ok = await role
        .setPermissions(
          safeBits,
          `${E.VC_Lock} AntiNuke Panic: lock dangerous role permissions`,
        )
        .then(() => true)
        .catch(() => false);
      if (ok) incrementPanicMetric(state, "roles", "edited", 1);
    }
  }
}

async function unlockDangerousRolesAfterPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.unlockDangerousRolesOnFinish) {
    state?.lockedRoles?.clear?.();
    return { completed: true };
  }
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { completed: false, reason: "missing_manage_roles" };
  }

  for (const [roleId, oldBitsStr] of state.lockedRoles.entries()) {
    const role = await getGuildRoleCached(guild, roleId, { ttlMs: 30_000 });
    if (!role) continue;
    if (role.position >= me.roles.highest.position) continue;
    const oldBits = BigInt(oldBitsStr || 0n);
    await role
      .setPermissions(oldBits, `${E.VC_Unlock} AntiNuke Panic: restore role permissions`)
      .catch(() => { });
  }
  state.lockedRoles.clear();
  return { completed: true };
}

export = {
  DANGEROUS_PERMS,
  getDangerMask,
  lockDangerousRolesForPanic,
  unlockDangerousRolesAfterPanic,
};
