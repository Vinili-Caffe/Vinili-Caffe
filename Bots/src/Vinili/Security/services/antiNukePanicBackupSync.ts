const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached, getGuildRoleCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { sendAntiNukeLog } = require("./antiNukeLog") as typeof import("./antiNukeLog");
const { restoreDeletedRoleSnapshots, restoreDeletedChannelSnapshots } = require("./antiNukePanicRestoreSnapshots") as typeof import("./antiNukePanicRestoreSnapshots");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function runAutoBackupSyncAfterPanic(guild?, state?) {
  const cfg = ANTINUKE_CONFIG.panicMode.autoBackupSync;
  if (!guild || !state) return;
  const me = guild.members?.me;
  const enabled = Boolean(cfg?.enabled);

  let channelsDeleted = 0;
  let categoriesDeleted = 0;
  let rolesDeleted = 0;
  let webhooksDeleted = 0;
  if (enabled && cfg.deleteNewChannels && me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    let isProtectedStage = () => false;
    try {
      ({ isProtectedStreamerStageChannelId: isProtectedStage } = require("../../Community/services/streamerStageGuardService"));
    } catch {
      isProtectedStage = () => false;
    }
    for (const channelId of state.createdChannelIds) {
      if ((isProtectedStage as any)(channelId, guild.client)) {
        global.logger?.warn?.("[AntiNuke] skip delete protected streamer stage:", channelId);
        continue;
      }
      const channel = await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000 });
      if (!channel) continue;
      const deleted = await channel.delete(`${E.VC_Unlock} AntiNuke panic cleanup: delete new channel`).then(() => true).catch(() => false);
      if (deleted) {
        if (Number(channel.type) === 4) categoriesDeleted += 1;
        else channelsDeleted += 1;
      }
    }
  }

  if (enabled && cfg.deleteNewRoles && me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    for (const roleId of state.createdRoleIds) {
      const role = await getGuildRoleCached(guild, String(roleId), { ttlMs: 30_000 });
      if (!role) continue;
      if (role.managed) continue;
      if (role.position >= me.roles.highest.position) continue;
      const deleted = await role.delete(`${E.VC_Unlock} AntiNuke panic cleanup: delete new role`).then(() => true).catch(() => false);
      if (deleted) rolesDeleted += 1;
    }
  }

  if (enabled && cfg.deleteNewWebhooks && me?.permissions?.has(PermissionsBitField.Flags.ManageWebhooks)) {
    const webhooks = typeof guild.fetchWebhooks === "function"
      ? await guild.fetchWebhooks().catch(() => null)
      : null;
    for (const webhook of webhooks?.values?.() || []) {
      if (!state.createdWebhookIds.has(String(webhook.id))) continue;
      const deleted = await webhook.delete(`${E.VC_Unlock} AntiNuke panic cleanup: delete new webhook`).then(() => true).catch(() => false);
      if (deleted) webhooksDeleted += 1;
    }
  }

  state.createdRoleIds.clear();
  state.createdChannelIds.clear();
  state.createdWebhookIds.clear();

  const pendingCategorySnapshots = Array.from(state?.deletedChannelSnapshots?.values?.() || [],).filter((snap?: any) => Number(snap?.type) === 4).length;
  const restoredRoles = enabled && cfg.restoreDeletedRoles ? await restoreDeletedRoleSnapshots(guild, state) : { restored: 0, failed: 0 };
  const restoredChannels = enabled && cfg.restoreDeletedChannels ? await restoreDeletedChannelSnapshots(guild, state) : { restored: 0, failed: 0 };

  const recoveredCategories = pendingCategorySnapshots;
  const recoveredChannels = Math.max(0, Number(restoredChannels.restored || 0) - recoveredCategories,);

  if (!enabled) {
    state.deletedRoleSnapshots?.clear?.();
    state.deletedChannelSnapshots?.clear?.();
  }

  if (
    Number(restoredRoles.restored || 0) > 0 ||
    Number(restoredRoles.failed || 0) > 0 ||
    Number(restoredChannels.restored || 0) > 0 ||
    Number(restoredChannels.failed || 0) > 0
  ) {
    await sendAntiNukeLog(
      guild,
      `${E.VC_Alert} AntiNuke: Restore System`,
      [
        `${E.VC_reason} **Roles ripristinati:** ${Number(restoredRoles.restored || 0)}`,
        `${E.VC_reason} **Ruoli falliti:** ${Number(restoredRoles.failed || 0)}`,
        `${E.VC_reason} **Canali ripristinati:** ${Number(restoredChannels.restored || 0)}`,
        `${E.VC_reason} **Canali falliti:** ${Number(restoredChannels.failed || 0)}`,
        `${E.VC_reason} Per ripristino completo canali/ruoli usa **+backup** → **Carica backup**.`,
      ],
      Number(restoredRoles.failed || 0) > 0 || Number(restoredChannels.failed || 0) > 0
        ? "#F59E0B"
        : "#57F287",
    );
  }
  return {
    loaded: enabled,
    rolesDeleted,
    rolesRecovered: Number(restoredRoles.restored || 0),
    channelsDeleted,
    channelsRecovered: recoveredChannels,
    categoriesDeleted,
    categoriesRecovered: recoveredCategories,
    webhooksDeleted,
  };
}

export = {
  runAutoBackupSyncAfterPanic,
};
