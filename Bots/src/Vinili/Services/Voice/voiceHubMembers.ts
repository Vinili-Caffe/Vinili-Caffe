/** Vocali pubbliche: chi c'è nei canali creati e loro eliminazione quando si svuotano. */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { queueCategoryRenumber } = require("../Community/communityOpsService") as typeof import("../Community/communityOpsService");
const { INDEX_SUFFIX_RE, getHubChannelIds, getPublicVoiceHubCategoryId, isPublicVoiceHubId, resolveHubGroupKey, isHubGroupSpawnChannel, botCanManageVoiceHubs } = require("./voiceHubConfig") as typeof import("./voiceHubConfig");
const { listHubGroupChannels, reorderLimitateCategory } = require("./voiceHubOrder") as typeof import("./voiceHubOrder");

const EMPTY_DELETE_DELAY_MS = 1500;
const spawnedHubByChannel = new Map();
const emptyDeleteTimers = new Map();

function rememberSpawnedChannel(channelId?, hubId?) {
  const cid = String(channelId || "");
  const hid = String(hubId || "");
  if (cid && hid) spawnedHubByChannel.set(cid, hid);
}

function forgetSpawnedChannel(channelId?) {
  const cid = String(channelId || "");
  if (!cid) return;
  spawnedHubByChannel.delete(cid);
  const timer = emptyDeleteTimers.get(cid);
  if (timer) {
    clearTimeout(timer);
    emptyDeleteTimers.delete(cid);
  }
}

function isSpawnedHubChannel(channel?, client?) {
  const id = String(channel?.id || "");
  if (!id || isPublicVoiceHubId(id, client, channel?.guild)) return false;
  if (spawnedHubByChannel.has(id)) return true;
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (!INDEX_SUFFIX_RE.test(String(channel.name || ""))) return false;
  const parentId = String(channel.parentId || "");
  const hubKey = resolveHubGroupKey(channel, client);
  if (!hubKey) return false;
  const spawnCategoryId = getPublicVoiceHubCategoryId(client, channel);
  for (const hubId of getHubChannelIds(client, channel.guild)) {
    const hub = channel.guild?.channels?.cache?.get(hubId);
    if (!hub) continue;
    const hubParent = String(hub.parentId || "");
    const sameCategory =
      parentId &&
      (parentId === hubParent || (spawnCategoryId && parentId === spawnCategoryId));
    if (!sameCategory) continue;
    if (resolveHubGroupKey(hub, client) === hubKey) return true;
  }
  return false;
}

function resolveVoiceStateUser(guild?, vs?) {
  const member = vs?.member || guild?.members?.cache?.get?.(vs?.id);
  const user = member?.user || guild?.client?.users?.cache?.get?.(vs?.id) || null;
  return { member: member || null, user };
}

function countHumanMembers(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return 0;
  let n = 0;
  for (const vs of guild.voiceStates.cache.values()) {
    if (String(vs.channelId || "") !== channelId) continue;
    const { member, user } = resolveVoiceStateUser(guild, vs);
    if (user?.bot || member?.user?.bot) continue;
    if (!user && !member) continue;
    n += 1;
  }
  return n;
}

function hasBotMemberInChannel(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return false;
  for (const vs of guild.voiceStates.cache.values()) {
    if (String(vs.channelId || "") !== channelId) continue;
    const { member, user } = resolveVoiceStateUser(guild, vs);
    if (user?.bot || member?.user?.bot) return true;
  }
  return false;
}

async function countHumanMembersResolved(channel?) {
  const guild = channel?.guild;
  const channelId = String(channel?.id || "");
  if (!guild?.voiceStates?.cache || !channelId) return 0;
  let n = 0;
  for (const vs of [...guild.voiceStates.cache.values()]) {
    if (String(vs.channelId || "") !== channelId) continue;
    let { member, user } = resolveVoiceStateUser(guild, vs);
    if (!member && vs?.id) {
      member = await guild.members.fetch(vs.id).catch(() => null);
      user = member?.user || user;
    }
    if (user?.bot || member?.user?.bot) continue;
    if (!member && !user) continue;
        const stillHere = String(member?.voice?.channelId || guild.voiceStates.cache.get(vs.id)?.channelId || "") === channelId;
    if (!stillHere) continue;
    n += 1;
  }
  return n;
}

function resolveMemberVoiceChannelId(guild?, userId?, member = null) {
  const uid = String(userId || member?.id || "");
  if (!uid) return "";
  const fromCache = guild?.voiceStates?.cache?.get?.(uid);
  if (fromCache?.channelId) return String(fromCache.channelId);
  const fromMember = member?.voice?.channelId;
  return fromMember ? String(fromMember) : "";
}

function memberStillInVoiceChannel(member?, channelId?, guild = null) {
  const expected = String(channelId || "");
  if (!expected) return false;
  const current = resolveMemberVoiceChannelId(guild || member?.guild, member?.id, member);
  return Boolean(current && current === expected);
}

function isUserDisconnectedVoiceError(err?) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("not connected to voice") || msg.includes("target user is not connected");
}

async function resolveGuildMemberVoiceState(guild?, member?, userId?) {
  const uid = String(userId || member?.id || "");
  if (!guild || !uid) return member || null;
  const cached = guild.members.cache.get(uid) || member;
  if (cached?.voice?.channelId) return cached;
  return guild.members.fetch(uid).catch(() => cached || null);
}

async function cleanupUnusedSpawnedChannel(created?, reason?) {
  if (!created?.id) return;
  try {
    const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
    if (isProtectedStreamerStageChannelId(created.id)) {
      global.logger?.warn?.("[publicVoiceHub] refused delete of protected streamer stage:", created.id);
      return;
    }
  } catch {
    /* ignore */
  }
  forgetSpawnedChannel(created.id);
  await created.delete(reason).catch(() => {});
}

function scheduleSpawnedChannelDelete(channel?, client?) {
  const channelId = String(channel?.id || "");
  if (!channelId) return;
  try {
    const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
    if (isProtectedStreamerStageChannelId(channelId, client)) {
      global.logger?.warn?.("[publicVoiceHub] skip empty-delete for protected streamer stage:", channelId);
      return;
    }
  } catch {
    /* ignore */
  }
  const existing = emptyDeleteTimers.get(channelId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(async () => {
    emptyDeleteTimers.delete(channelId);
    const guild = channel.guild;
    if (!guild) {
      forgetSpawnedChannel(channelId);
      return;
    }
    const fresh =
      guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
    if (!fresh?.isVoiceBased?.()) {
      forgetSpawnedChannel(channelId);
      return;
    }
    const humans = await countHumanMembersResolved(fresh);
    if (humans > 0) return;
    try {
      const { isProtectedStreamerStageChannelId } = require("../Community/streamerStageGuardService") as typeof import("../Community/streamerStageGuardService");
      if (isProtectedStreamerStageChannelId(channelId, client)) {
        global.logger?.warn?.("[publicVoiceHub] abort empty-delete protected streamer stage:", channelId);
        return;
      }
    } catch {
      /* ignore */
    }
    if (!fresh.manageable && !fresh.deletable) {
      global.logger?.warn?.("[publicVoiceHub] empty spawn not deletable:", channelId, fresh.name);
      return;
    }
    const deleted = await fresh.delete("Vocale hub temporanea vuota").then(() => true).catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] empty spawn delete failed:", channelId, err?.message || err);
      return false;
    });
    if (!deleted) return;
    const hubId = spawnedHubByChannel.get(channelId) || null;
    forgetSpawnedChannel(channelId);
    let hub = hubId ? guild.channels.cache.get(hubId) : null;
    if (!hub) {
      const hubKey = resolveHubGroupKey(fresh, client);
      if (hubKey) {
        hub = getHubChannelIds(client, guild)
          .map((id?) => guild.channels.cache.get(id))
          .find(
            (row?) =>
              row &&
              String(row.parentId || "") === String(fresh.parentId || "") &&
              resolveHubGroupKey(row, client) === hubKey,
          );
      }
    }
    if (hub) {
      await reorderLimitateCategory(guild, client, {
        parentId: getPublicVoiceHubCategoryId(client, hub) || fresh.parentId,
        forceFetch: true,
      }).catch(() => null);
    }
    queueCategoryRenumber(client, guild.id, 5000);
  }, EMPTY_DELETE_DELAY_MS);
  timer.unref?.();
  emptyDeleteTimers.set(channelId, timer);
}

async function handlePublicVoiceHubEmpty(oldState?, newState?, client?) {
  const leftId = String(oldState.channelId || "");
  if (!leftId || isPublicVoiceHubId(leftId, client, oldState.guild || newState.guild)) return;
  if (String(newState.channelId || "") === leftId) return;

  const guild = oldState.guild || newState.guild;
  let channel = oldState.channel;
  if (!channel?.isVoiceBased?.()) {
    channel =
      guild?.channels?.cache?.get(leftId) ||
      (await guild?.channels?.fetch?.(leftId).catch(() => null));
  }
  if (!channel?.isVoiceBased?.() || !isSpawnedHubChannel(channel, client)) return;

  if ((await countHumanMembersResolved(channel)) > 0) return;
  if (hasBotMemberInChannel(channel)) return;
  scheduleSpawnedChannelDelete(channel, client);
}

async function sweepEmptySpawnedHubChannels(client?) {
  if (
    client?.config?.publicVoiceHubs?.enabled === false &&
    client?.config?.gameVoiceHubs?.enabled === false
  ) {
    return 0;
  }
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return 0;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return 0;

  let queued = 0;
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    for (const ch of listHubGroupChannels(guild, hub, client)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      if ((await countHumanMembersResolved(ch)) > 0) continue;
      if (hasBotMemberInChannel(ch)) continue;
      scheduleSpawnedChannelDelete(ch, client);
      queued += 1;
    }
  }
  return queued;
}

export = { rememberSpawnedChannel, isSpawnedHubChannel, countHumanMembersResolved, memberStillInVoiceChannel, isUserDisconnectedVoiceError, resolveGuildMemberVoiceState, cleanupUnusedSpawnedChannel, scheduleSpawnedChannelDelete, handlePublicVoiceHubEmpty, sweepEmptySpawnedHubChannels };
