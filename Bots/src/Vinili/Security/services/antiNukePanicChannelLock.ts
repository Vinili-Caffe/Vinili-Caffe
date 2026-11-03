const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ANTINUKE_CONFIG } = require("./antiNukeConfig") as typeof import("./antiNukeConfig");
const { incrementPanicMetric } = require("./antiNukePanicReport") as typeof import("./antiNukePanicReport");
const { sleep } = require("./antiNukePanicState") as typeof import("./antiNukePanicState");

const LOCKDOWN_CHANNEL_PERMISSION_FLAGS = [["SendMessages", PermissionsBitField.Flags.SendMessages], ["AddReactions", PermissionsBitField.Flags.AddReactions], ["CreatePublicThreads", PermissionsBitField.Flags.CreatePublicThreads], ["CreatePrivateThreads", PermissionsBitField.Flags.CreatePrivateThreads], ["SendMessagesInThreads", PermissionsBitField.Flags.SendMessagesInThreads], ["Connect", PermissionsBitField.Flags.Connect], ["Speak", PermissionsBitField.Flags.Speak], ["Stream", PermissionsBitField.Flags.Stream], ["UseApplicationCommands", PermissionsBitField.Flags.UseApplicationCommands],].filter(([, bit]) => Boolean(bit));
const LOCKDOWN_EXTRA_ROLE_IDS = [IDs.roles?.Member, IDs.roles?.Staff,].map((id?) => String(id || "").trim()).filter(Boolean);

function getLockdownDenyMask() {
  return LOCKDOWN_CHANNEL_PERMISSION_FLAGS.reduce(
    (mask, [, bit]) => mask | BigInt(bit || 0n),
    0n,
  );
}

function buildLockdownRestorePayload(snapshot?) {
  const allowBits = BigInt(snapshot?.allowBits || 0n);
  const denyBits = BigInt(snapshot?.denyBits || 0n);
  const payload: Record<string, any> = {};
  for (const [name, bit] of LOCKDOWN_CHANNEL_PERMISSION_FLAGS) {
    const f = BigInt(bit || 0n);
    if ((allowBits & f) !== 0n) payload[(name as any)] = true;
    else if ((denyBits & f) !== 0n) payload[(name as any)] = false;
    else payload[(name as any)] = null;
  }
  return payload;
}

function getLockdownTargetIds(guild?) {
  const everyoneId = String(guild?.id || "").trim();
  return Array.from(
    new Set(
      [everyoneId, ...LOCKDOWN_EXTRA_ROLE_IDS]
        .map((id?) => String(id || "").trim())
        .filter(Boolean),
    ),
  );
}

async function lockGuildChannelsForPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown) return;
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return;
  const targetIds = getLockdownTargetIds(guild);
  if (!targetIds.length) return;
  const denyMask = getLockdownDenyMask();
  let ops = 0;
  for (const channel of guild.channels.cache.values()) {
    if (!channel?.permissionOverwrites?.edit) continue;
    if (!state.lockedChannels.has(String(channel.id))) {
      state.lockedChannels.set(String(channel.id), {
        targets: {},
      });
    }
    const channelSnapshot = state.lockedChannels.get(String(channel.id));
    if (
      !channelSnapshot ||
      typeof channelSnapshot !== "object" ||
      Array.isArray(channelSnapshot)
    ) {
      continue;
    }
    if (
      !channelSnapshot.targets ||
      typeof channelSnapshot.targets !== "object" ||
      Array.isArray(channelSnapshot.targets)
    ) {
      channelSnapshot.targets = {};
    }

    for (const targetId of targetIds) {
      const current = channel.permissionOverwrites.cache.get(targetId) || null;
      const currentDeny = BigInt(current?.deny?.bitfield || 0n);
      if (!channelSnapshot.targets[targetId]) {
        channelSnapshot.targets[targetId] = {
          hadOverwrite: Boolean(current),
          allowBits: String(BigInt(current?.allow?.bitfield || 0n)),
          denyBits: String(BigInt(current?.deny?.bitfield || 0n)),
        };
      }
      if ((currentDeny & denyMask) === denyMask) continue;
      const edited = await channel.permissionOverwrites
        .edit(
          targetId,
          Object.fromEntries(
            LOCKDOWN_CHANNEL_PERMISSION_FLAGS.map(([name]) => [name, false]),
          ),
          { reason: "<:VC_Lock:1482526739044368476> AntiNuke Panic: global channel lockdown" },
        )
        .then(() => true)
        .catch(() => false);
      if (edited) {
        incrementPanicMetric(
          state,
          Number(channel.type) === 4 ? "categories" : "channels",
          "edited",
          1,
        );
        ops += 1;
        if (ops % 8 === 0) {
          await sleep(125);
        }
      }
    }
  }
}

async function unlockGuildChannelsAfterPanic(guild?, state?) {
  if (!ANTINUKE_CONFIG.panicMode.lockdown.channelLockdown) {
    state?.lockedChannels?.clear?.();
    return { completed: true };
  }
  const me = guild?.members?.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageChannels)) {
    return { completed: false, reason: "missing_manage_channels" };
  }
  const targetIds = getLockdownTargetIds(guild);
  if (!targetIds.length) {
    return { completed: false, reason: "missing_everyone_id" };
  }

  let ops = 0;
  for (const [channelId, snapshot] of state.lockedChannels.entries()) {
    const channel = await getGuildChannelCached(guild, String(channelId), { ttlMs: 30_000, });
    if (!channel?.permissionOverwrites) continue;
    const targetsSnapshot = snapshot?.targets && typeof snapshot.targets === "object" ? snapshot.targets : { [String(guild.id || "")]: snapshot, };
    const restoreTargetIds = Array.from(new Set(Object.keys(targetsSnapshot || {}).concat(targetIds).filter(Boolean),),);
    for (const targetId of restoreTargetIds) {
      const targetSnapshot = targetsSnapshot?.[targetId];
      if (!targetSnapshot) continue;
      if (!targetSnapshot?.hadOverwrite) {
        await channel.permissionOverwrites
          .delete(targetId, "<a:VC_Unlock:1482532082466029608> AntiNuke Panic: restore channel overwrite")
          .catch(() => { });
        ops += 1;
        if (ops % 8 === 0) {
          await sleep(125);
        }
        continue;
      }
      await channel.permissionOverwrites
        .edit(
          targetId,
          buildLockdownRestorePayload(targetSnapshot),
          { reason: "<a:VC_Unlock:1482532082466029608> AntiNuke Panic: restore channel permissions" },
        )
        .catch(() => { });
      ops += 1;
      if (ops % 8 === 0) {
        await sleep(125);
      }
    }
  }
  state.lockedChannels.clear();
  return { completed: true };
}

export = {
  lockGuildChannelsForPanic,
  unlockGuildChannelsAfterPanic,
};
