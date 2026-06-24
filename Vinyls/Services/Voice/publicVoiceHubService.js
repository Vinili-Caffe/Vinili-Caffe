const { ChannelType, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { queueCategoryRenumber } = require("../Community/communityOpsService");

const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const DIGIT_FROM_SUPERSCRIPT = Object.fromEntries(Object.entries(SUPERSCRIPT_MAP).map(([d, s]) => [s, d]));
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const EMPTY_DELETE_DELAY_MS = 1500;
const MIN_SUFFIX_DIGITS = 2;

const userCreateLocks = new Set();
const hubCreateLocks = new Map();
const spawnedHubByChannel = new Map();
const emptyDeleteTimers = new Map();

function getHubChannelIds(client) {
  const fromConfig = client?.config?.publicVoiceHubs?.channelIds;
  if (Array.isArray(fromConfig) && fromConfig.length) {
    return fromConfig.map((id) => String(id || "").trim()).filter(Boolean);
  }
  const fromIds = Array.isArray(IDs.publicVoiceHubChannelIds) ? IDs.publicVoiceHubChannelIds : [];
  return fromIds.map((id) => String(id || "").trim()).filter(Boolean);
}

function isPublicVoiceHubId(channelId, client) {
  const id = String(channelId || "").trim();
  return id ? getHubChannelIds(client).includes(id) : false;
}

function stripVoiceSuffix(name) {
  return String(name || "").replace(INDEX_SUFFIX_RE, "").trimEnd();
}

function parseVoiceSuffixIndex(name) {
  const match = String(name || "").match(INDEX_SUFFIX_RE);
  if (!match) return 0;
  const digits = [...match[0]].map((ch) => DIGIT_FROM_SUPERSCRIPT[ch] ?? "").join("");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function toSuperscriptNumber(value, minDigits = MIN_SUFFIX_DIGITS) {
  const normalized = Math.max(1, Number(value) || 1).toString().padStart(minDigits, "0");
  return normalized.split("").map((digit) => SUPERSCRIPT_MAP[digit] || digit).join("");
}

function botCanManageVoiceHubs(guild) {
  const me = guild?.members?.me;
  if (!me) return false;
  try {
    return me.permissions.has(PermissionsBitField.Flags.ManageChannels | PermissionsBitField.Flags.MoveMembers);
  } catch {
    return false;
  }
}

function listCategoryChannelsSorted(guild, parentId) {
  return [...guild.channels.cache.values()]
    .filter((ch) => String(ch.parentId || "") === String(parentId || ""))
    .sort((a, b) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));
}

function listHubGroupChannels(guild, hubChannel) {
  const parentId = String(hubChannel.parentId || "");
  const base = stripVoiceSuffix(hubChannel.name);
  return listCategoryChannelsSorted(guild, parentId)
    .filter((ch) => ch.type === ChannelType.GuildVoice)
    .filter((ch) => stripVoiceSuffix(ch.name) === base);
}

function nextSpawnSuffixIndex(groupChannels, hubId) {
  let max = 0;
  for (const ch of groupChannels) {
    if (String(ch.id) === String(hubId)) continue;
    max = Math.max(max, parseVoiceSuffixIndex(ch.name));
  }
  return max + 1;
}

function resolveInsertPosition(hubChannel, guild) {
  const parentId = String(hubChannel.parentId || "");
  const base = stripVoiceSuffix(hubChannel.name);
  const siblings = listCategoryChannelsSorted(guild, parentId);
  const hubIndex = siblings.findIndex((ch) => String(ch.id) === String(hubChannel.id));
  if (hubIndex < 0) return Number(hubChannel.rawPosition) + 1;

  let insertAfter = siblings[hubIndex];
  for (let i = hubIndex + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (ch.type !== ChannelType.GuildVoice) break;
    if (stripVoiceSuffix(ch.name) !== base) break;
    insertAfter = ch;
  }
  return Number(insertAfter.rawPosition) + 1;
}

function copyPermissionOverwrites(channel) {
  return channel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

async function withHubCreateLock(hubId, fn) {
  const key = String(hubId || "");
  if (!key) return fn();
  while (hubCreateLocks.has(key)) {
    await hubCreateLocks.get(key).catch(() => {});
  }
  const job = Promise.resolve().then(fn).finally(() => {
    if (hubCreateLocks.get(key) === job) hubCreateLocks.delete(key);
  });
  hubCreateLocks.set(key, job);
  return job;
}

function rememberSpawnedChannel(channelId, hubId) {
  const cid = String(channelId || "");
  const hid = String(hubId || "");
  if (cid && hid) spawnedHubByChannel.set(cid, hid);
}

function forgetSpawnedChannel(channelId) {
  const cid = String(channelId || "");
  if (!cid) return;
  spawnedHubByChannel.delete(cid);
  const timer = emptyDeleteTimers.get(cid);
  if (timer) {
    clearTimeout(timer);
    emptyDeleteTimers.delete(cid);
  }
}

function isSpawnedHubChannel(channel, client) {
  const id = String(channel?.id || "");
  if (!id || isPublicVoiceHubId(id, client)) return false;
  if (spawnedHubByChannel.has(id)) return true;
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (!INDEX_SUFFIX_RE.test(String(channel.name || ""))) return false;
  const parentId = String(channel.parentId || "");
  const base = stripVoiceSuffix(channel.name);
  for (const hubId of getHubChannelIds(client)) {
    const hub = channel.guild?.channels?.cache?.get(hubId);
    if (!hub || String(hub.parentId || "") !== parentId) continue;
    if (stripVoiceSuffix(hub.name) === base) return true;
  }
  return false;
}

function countHumanMembers(channel) {
  if (!channel?.members) return 0;
  return channel.members.filter((m) => !m.user?.bot).size;
}

function scheduleSpawnedChannelDelete(channel, client) {
  const channelId = String(channel?.id || "");
  if (!channelId) return;
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
    if (countHumanMembers(fresh) > 0) return;
    if (!fresh.manageable) return;
    await fresh.delete("Vocale hub temporanea vuota").catch(() => {});
    forgetSpawnedChannel(channelId);
    queueCategoryRenumber(client, guild.id);
  }, EMPTY_DELETE_DELAY_MS);
  timer.unref?.();
  emptyDeleteTimers.set(channelId, timer);
}

async function handlePublicVoiceHubJoin(oldState, newState, client) {
  const joinedId = String(newState.channelId || "");
  if (!joinedId || !isPublicVoiceHubId(joinedId, client)) return;

  const guild = newState.guild;
  const member = newState.member;
  const hub = newState.channel;
  if (!guild || !member || member.user?.bot || !hub?.isVoiceBased?.()) return;
  if (!botCanManageVoiceHubs(guild)) {
    global.logger?.warn?.("[publicVoiceHub] bot missing ManageChannels/MoveMembers");
    return;
  }

  const uid = String(member.id);
  if (userCreateLocks.has(uid)) return;
  userCreateLocks.add(uid);

  try {
    await withHubCreateLock(joinedId, async () => {
      const group = listHubGroupChannels(guild, hub);
      const nextIndex = nextSpawnSuffixIndex(group, joinedId);
      const spawnName = `${stripVoiceSuffix(hub.name)}${toSuperscriptNumber(nextIndex, MIN_SUFFIX_DIGITS)}`;
      const position = resolveInsertPosition(hub, guild);

      const created = await guild.channels.create({
        name: spawnName,
        type: ChannelType.GuildVoice,
        parent: hub.parentId || undefined,
        userLimit: Math.max(0, Number(hub.userLimit) || 0),
        rtcRegion: hub.rtcRegion || undefined,
        permissionOverwrites: copyPermissionOverwrites(hub),
        reason: `Vocale hub ${hub.name}`,
      }).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] create failed:", err?.message || err);
        return null;
      });
      if (!created) return;

      if (Number.isFinite(position)) {
        await created.setPosition(position).catch((err) => {
          global.logger?.warn?.("[publicVoiceHub] setPosition failed:", err?.message || err);
        });
      }

      rememberSpawnedChannel(created.id, joinedId);

      const moved = await member.voice.setChannel(created).then(() => true).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] move failed:", err?.message || err);
        return false;
      });
      if (!moved) {
        forgetSpawnedChannel(created.id);
        await created.delete("Move utente fallito").catch(() => {});
        return;
      }

      queueCategoryRenumber(client, guild.id);
    });
  } finally {
    userCreateLocks.delete(uid);
  }
}

async function handlePublicVoiceHubEmpty(oldState, newState, client) {
  const leftId = String(oldState.channelId || "");
  if (!leftId || isPublicVoiceHubId(leftId, client)) return;

  const channel = oldState.channel;
  if (!channel?.isVoiceBased?.() || !isSpawnedHubChannel(channel, client)) return;

  if (String(newState.channelId || "") === leftId) return;

  if (countHumanMembers(channel) > 0) return;
  scheduleSpawnedChannelDelete(channel, client);
}

module.exports = {
  getHubChannelIds,
  isPublicVoiceHubId,
  isSpawnedHubChannel,
  stripVoiceSuffix,
  parseVoiceSuffixIndex,
  toSuperscriptNumber,
  handlePublicVoiceHubJoin,
  handlePublicVoiceHubEmpty,
  resolveInsertPosition,
};