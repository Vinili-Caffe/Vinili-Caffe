const { PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");

async function restoreDeletedRoleSnapshots(guild?, state?) {
  const pending = Array.from(state?.deletedRoleSnapshots?.values?.() || []);
  if (!pending.length) return { restored: 0, failed: 0 };
  const me = guild?.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { restored: 0, failed: pending.length, reason: "missing_manage_roles" };
  }
  let restored = 0;
  let failed = 0;
  pending.sort((a?: any, b?: any) => Number(a.position || 0) - Number(b.position || 0));
  for (const snap of pending) {
    const payload = {
      name: String((snap as any).name || "restored-role"),
      colors: { primaryColor: Number((snap as any).color || 0) },
      hoist: Boolean((snap as any).hoist),
      mentionable: Boolean((snap as any).mentionable),
      permissions: BigInt(String((snap as any).permissions || "0")),
      reason: "AntiNuke restore: deleted role snapshot",
    };
    const role = await guild.roles.create(payload).catch(() => null);
    if (!role) {
      failed += 1;
      continue;
    }
    const targetPosition = Math.max(1, Number((snap as any).position || 1));
    await role.setPosition(targetPosition, { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke restore: role position" }).catch(() => { });
    restored += 1;
  }
  state.deletedRoleSnapshots?.clear?.();
  return { restored, failed };
}

async function restoreDeletedChannelSnapshots(guild?, state?) {
  const pending = Array.from(state?.deletedChannelSnapshots?.values?.() || []);
  if (!pending.length) return { restored: 0, failed: 0 };
  const me = guild?.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) {
    return { restored: 0, failed: pending.length, reason: "missing_manage_channels" };
  }
  let restored = 0;
  let failed = 0;
  for (const snap of pending) {
    const type = Number((snap as any).type ?? 0);
    if ([10, 11, 12, 14].includes(type)) {
      failed += 1;
      continue;
    }
    const parentId = String((snap as any).parentId || "").trim();
    const parentChannel = parentId ? await getGuildChannelCached(guild, parentId, { ttlMs: 30_000 }) : null;
    const overwritePayload = (Array.isArray((snap as any).permissionOverwrites) ? (snap as any).permissionOverwrites : []).map((ov?) => ({ id: String(ov?.id || ""), type: Number(ov?.type ?? 0), allow: BigInt(String(ov?.allow || "0")), deny: BigInt(String(ov?.deny || "0")), })).filter((ov?) => { if (!ov.id) return false; if (ov.type === OverwriteType.Role) { return ov.id === String(guild.id || "") || guild.roles.cache.has(ov.id); } if (ov.type === OverwriteType.Member) { return guild.members.cache.has(ov.id); } return false; }).filter((ov?) => ov.id);

    const createPayload: Record<string, any> = { name: String((snap as any).name || "restored-channel"), type, parent: parentChannel?.type === 4 ? String(parentChannel.id) : null, permissionOverwrites: overwritePayload, reason: "AntiNuke restore: deleted channel snapshot", };
    if (typeof (snap as any).nsfw === "boolean") createPayload.nsfw = (snap as any).nsfw;
    if (typeof (snap as any).topic === "string" && [0, 5, 15, 16].includes(type)) createPayload.topic = (snap as any).topic;
    if (Number.isFinite(Number((snap as any).rateLimitPerUser)) && [0, 5, 15, 16].includes(type)) {
      createPayload.rateLimitPerUser = Math.max(0, Number((snap as any).rateLimitPerUser || 0));
    }
    if (Number.isFinite(Number((snap as any).bitrate)) && [2, 13].includes(type)) {
      createPayload.bitrate = Number((snap as any).bitrate || 0);
    }
    if (Number.isFinite(Number((snap as any).userLimit)) && [2, 13].includes(type)) {
      createPayload.userLimit = Math.max(0, Number((snap as any).userLimit || 0));
    }
    if ((snap as any).rtcRegion && [2, 13].includes(type)) createPayload.rtcRegion = (snap as any).rtcRegion;
    if (Number.isFinite(Number((snap as any).videoQualityMode)) && [2, 13].includes(type)) {
      createPayload.videoQualityMode = Number((snap as any).videoQualityMode || 1);
    }
    if (Number.isFinite(Number((snap as any).defaultAutoArchiveDuration)) && [0, 5, 15, 16].includes(type)) {
      createPayload.defaultAutoArchiveDuration = Number((snap as any).defaultAutoArchiveDuration || 1440);
    }

    const restoredChannel = await guild.channels.create(createPayload).catch(() => null);
    if (!restoredChannel) {
      failed += 1;
      continue;
    }
    const position = Number((snap as any).position || 0);
    if (Number.isFinite(position) && position >= 0) {
      await restoredChannel.setPosition(position, { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke restore: channel position" }).catch(() => { });
    }
    restored += 1;
  }
  state.deletedChannelSnapshots?.clear?.();
  return { restored, failed };
}

export = {
  restoreDeletedRoleSnapshots,
  restoreDeletedChannelSnapshots,
};
