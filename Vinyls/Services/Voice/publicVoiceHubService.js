const { ChannelType, PermissionsBitField, OverwriteType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { queueCategoryRenumber } = require("../Community/communityOpsService");

const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const DIGIT_FROM_SUPERSCRIPT = Object.fromEntries(Object.entries(SUPERSCRIPT_MAP).map(([d, s]) => [s, d]));
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const EMPTY_DELETE_DELAY_MS = 1500;
const MIN_SUFFIX_DIGITS = 2;
const HUB_LOBBY_SPEAK_FLAGS = [
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.UseVAD,
  PermissionsBitField.Flags.Stream,
];

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

function voiceHubGroupKey(name) {
  const raw = String(name || "");
  if (/\bduo\b/i.test(raw)) return "duo";
  if (/\btrio\b/i.test(raw)) return "trio";
  if (/\bquad\b/i.test(raw)) return "quad";
  if (/\blounge\b/i.test(raw)) return "lounge";
  if (/\bsquad\b/i.test(raw)) return "squad";
  return "";
}

function isHubGroupSpawnChannel(channel, hubChannel, client) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (isPublicVoiceHubId(channel.id, client)) return false;
  const hubKey = voiceHubGroupKey(hubChannel?.name);
  if (!hubKey || voiceHubGroupKey(channel.name) !== hubKey) return false;
  return parseVoiceSuffixIndex(channel.name) > 0;
}

async function botCanManageVoiceHubs(guild) {
  if (!guild) return false;
  let me = guild.members?.me;
  if (!me && typeof guild.members?.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
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
  const hubKey = voiceHubGroupKey(hubChannel.name);
  if (!hubKey) return [];
  return listCategoryChannelsSorted(guild, parentId)
    .filter((ch) => ch.type === ChannelType.GuildVoice)
    .filter((ch) => voiceHubGroupKey(ch.name) === hubKey);
}

function nextSpawnSuffixIndex(groupChannels, hubId) {
  let max = 0;
  for (const ch of groupChannels) {
    if (String(ch.id) === String(hubId)) continue;
    max = Math.max(max, parseVoiceSuffixIndex(ch.name));
  }
  return max + 1;
}

function resolveInsertSlot(hubChannel, guild, client) {
  const parentId = String(hubChannel.parentId || "");
  const hubKey = voiceHubGroupKey(hubChannel.name);
  if (!hubKey) return null;
  const siblings = listCategoryChannelsSorted(guild, parentId);
  const hubIndex = siblings.findIndex((ch) => String(ch.id) === String(hubChannel.id));
  if (hubIndex < 0) return null;

  let insertAt = hubIndex + 1;
  for (let i = hubIndex + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (isPublicVoiceHubId(ch.id, client)) break;
    if (voiceHubGroupKey(ch.name) !== hubKey) break;
    insertAt = i + 1;
  }

  if (insertAt < siblings.length) {
    return Number(siblings[insertAt].rawPosition);
  }
  const last = siblings[siblings.length - 1];
  return Number(last?.rawPosition ?? hubChannel.rawPosition) + 1;
}

function resolveInsertPosition(hubChannel, guild, client) {
  return resolveInsertSlot(hubChannel, guild, client);
}

async function refreshParentChannelsCache(guild, parentId, client, options = {}) {
  if (!guild?.channels?.fetch || !parentId) return;
  const force = options.force === true;
  const parentIdStr = String(parentId);
  const hubIds = client ? getHubChannelIds(client) : [];

  if (force || hubIds.some((id) => !guild.channels.cache.has(id))) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const cachedInParent = [...guild.channels.cache.values()].filter(
    (ch) => String(ch.parentId || "") === parentIdStr,
  );
  const hubsInParent = hubIds
    .map((id) => guild.channels.cache.get(id))
    .filter((ch) => ch && String(ch.parentId || "") === parentIdStr);
  if (!hubsInParent.length && !cachedInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const siblings = listCategoryChannelsSorted(guild, parentId);
  const missingHubInSiblings = hubsInParent.some(
    (hub) => !siblings.some((ch) => String(ch.id) === String(hub.id)),
  );
  if (missingHubInSiblings) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const voiceInParentCount = cachedInParent.filter((ch) => ch.type === ChannelType.GuildVoice).length;
  if (voiceInParentCount < hubsInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  }
}

function verifyHubGroupChannelOrder(guild, hubChannel, client) {
  const parentId = String(hubChannel?.parentId || "");
  if (!parentId) return { ok: true, misplaced: [] };
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  const siblings = listCategoryChannelsSorted(guild, parentId);
  const hubIdx = siblings.findIndex((ch) => String(ch.id) === String(freshHub.id));
  if (hubIdx < 0) return { ok: true, misplaced: [] };

  const spawns = siblings
    .filter((ch) => isHubGroupSpawnChannel(ch, freshHub, client))
    .sort((a, b) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
  const misplaced = [];
  for (let i = 0; i < spawns.length; i += 1) {
    const idx = siblings.findIndex((ch) => String(ch.id) === String(spawns[i].id));
    const expectedIdx = hubIdx + 1 + i;
    if (idx !== expectedIdx) {
      misplaced.push({ id: spawns[i].id, name: spawns[i].name, idx, expectedIdx });
    }
  }
  return { ok: misplaced.length === 0, misplaced };
}

function buildDesiredSiblingsWithHubSpawns(siblings, hub, spawns) {
  const spawnIdSet = new Set(spawns.map((ch) => String(ch.id)));
  const withoutSpawns = siblings.filter((ch) => !spawnIdSet.has(String(ch.id)));
  const hubIdx = withoutSpawns.findIndex((ch) => String(ch.id) === String(hub.id));
  if (hubIdx < 0) return siblings;
  return [
    ...withoutSpawns.slice(0, hubIdx + 1),
    ...spawns,
    ...withoutSpawns.slice(hubIdx + 1),
  ];
}

function siblingsOrderEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (String(left[i].id) !== String(right[i].id)) return false;
  }
  return true;
}

function computeCategoryPositionUpdates(currentSorted, desiredOrder) {
  if (currentSorted.length !== desiredOrder.length) return [];
  const base = Math.min(...currentSorted.map((ch) => Number(ch.rawPosition)));
  const updates = [];
  for (let i = 0; i < desiredOrder.length; i += 1) {
    const ch = desiredOrder[i];
    const wantPos = base + i;
    const orderMismatch = String(currentSorted[i]?.id) !== String(ch.id);
    const posMismatch = Number(ch.rawPosition) !== wantPos;
    if (orderMismatch || posMismatch) {
      updates.push({ channel: ch.id, position: wantPos });
    }
  }
  return updates;
}

async function applyCategoryPositionUpdates(guild, updates) {
  if (!updates.length) return { applied: 0 };
  for (const row of updates) {
    const ch = guild.channels.cache.get(row.channel);
    if (ch && ch.manageable === false) {
      return { applied: 0, reason: "unmanageable", channelId: String(row.channel) };
    }
  }
  try {
    if (typeof guild.channels?.setPositions === "function") {
      await guild.channels.setPositions(updates);
    } else {
      for (const row of updates) {
        const ch = guild.channels.cache.get(row.channel);
        if (ch?.setPosition) await ch.setPosition(row.position);
      }
    }
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return { applied: updates.length };
  } catch (err) {
    return {
      applied: 0,
      reason: "set_positions_failed",
      error: err?.message || String(err),
    };
  }
}

function pauseMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureHubGroupChannelOrder(guild, hubChannel, client, options = {}) {
  const parentId = String(hubChannel.parentId || "");
  const stats = { moved: 0, skipped: 0, failed: 0, hubId: String(hubChannel?.id || "") };
  if (!parentId || !(await botCanManageVoiceHubs(guild))) return stats;
  const hubKey = voiceHubGroupKey(hubChannel.name);
  if (!hubKey) return stats;

  await refreshParentChannelsCache(guild, parentId, client, { force: options.forceFetch === true });
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  let siblings = listCategoryChannelsSorted(guild, parentId);
  const spawns = siblings
    .filter((ch) => isHubGroupSpawnChannel(ch, freshHub, client))
    .sort((a, b) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
  if (!spawns.length) return stats;

  const desired = buildDesiredSiblingsWithHubSpawns(siblings, freshHub, spawns);
  if (siblingsOrderEqual(siblings, desired)) {
    const preVerify = verifyHubGroupChannelOrder(guild, freshHub, client);
    if (preVerify.ok) return stats;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await refreshParentChannelsCache(guild, parentId, client, { force: true });
    siblings = listCategoryChannelsSorted(guild, parentId);
    const freshSpawns = spawns
      .map((ch) => guild.channels.cache.get(ch.id) || siblings.find((row) => String(row.id) === String(ch.id)))
      .filter(Boolean)
      .sort((a, b) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
    const desiredOrder = buildDesiredSiblingsWithHubSpawns(siblings, freshHub, freshSpawns);
    if (siblingsOrderEqual(siblings, desiredOrder)) break;

    const updates = computeCategoryPositionUpdates(siblings, desiredOrder);
    if (!updates.length) {
      global.logger?.warn?.(
        "[publicVoiceHub] realign skipped empty updates:",
        freshHub.name || freshHub.id,
        siblings.map((ch) => `${ch.name}@${ch.rawPosition}`).join(" | "),
      );
      break;
    }

    const moveResult = await applyCategoryPositionUpdates(guild, updates);
    if (moveResult.applied > 0) stats.moved += 1;
    else {
      stats.failed += 1;
      if (moveResult.reason) {
        global.logger?.warn?.(
          "[publicVoiceHub] realign failed:",
          moveResult.channelId || freshHub.id,
          moveResult.reason,
          moveResult.error || "",
        );
      }
      break;
    }
    if (attempt < 2) await pauseMs(450);
  }

  await refreshParentChannelsCache(guild, parentId, client, { force: true });
  const verify = verifyHubGroupChannelOrder(guild, freshHub, client);
  if (!verify.ok) stats.misplaced = verify.misplaced;
  return stats;
}

async function realignAllPublicVoiceHubGroups(guild, client) {
  const summary = { moved: 0, skipped: 0, failed: 0, misplaced: [] };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return summary;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  for (const hubId of getHubChannelIds(client)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    const stats = await ensureHubGroupChannelOrder(guild, hub, client, { forceFetch: true });
    summary.moved += stats.moved || 0;
    summary.skipped += stats.skipped || 0;
    summary.failed += stats.failed || 0;
    if (Array.isArray(stats.misplaced) && stats.misplaced.length) {
      summary.misplaced.push(...stats.misplaced);
    }
  }
  return summary;
}

async function realignPublicVoiceHubGroupsOnStartup(client) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] realign skipped: missing ManageChannels/MoveMembers or members.me");
    return { ok: false, reason: "missing_permissions" };
  }
  const summary = await realignAllPublicVoiceHubGroups(guild, client);
  if (summary.misplaced.length) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign incomplete:",
      summary.misplaced.map((row) => `${row.name || row.id} idx=${row.idx} expected=${row.expectedIdx}`).join("; "),
      `(moved=${summary.moved} failed=${summary.failed})`,
    );
    return { ok: false, reason: "misplaced_after_realign", summary };
  }
  if (summary.failed > 0) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign had failures:",
      `moved=${summary.moved} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return { ok: false, reason: "move_failed", summary };
  }
  return { ok: true, summary };
}

function copyPermissionOverwrites(channel) {
  const cache = channel.permissionOverwrites?.cache;
  if (!cache) return [];
  const entries = typeof cache.values === "function" ? [...cache.values()] : [];
  return entries.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

function hubLobbyRoleIds(guild) {
  const ids = new Set([String(guild.roles.everyone.id)]);
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) ids.add(memberRoleId);
  return [...ids];
}

function mergeOverwriteSpeak(overwrite, allowSpeak) {
  const allow = new PermissionsBitField(overwrite.allow?.bitfield ?? overwrite.allow ?? 0n);
  const deny = new PermissionsBitField(overwrite.deny?.bitfield ?? overwrite.deny ?? 0n);
  for (const flag of HUB_LOBBY_SPEAK_FLAGS) {
    if (allowSpeak) {
      deny.remove(flag);
      allow.add(flag);
    } else {
      allow.remove(flag);
      deny.add(flag);
    }
  }
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: allow.bitfield,
    deny: deny.bitfield,
  };
}

function hubOverwriteSpeakDenied(overwrite) {
  if (!overwrite) return false;
  try {
    return overwrite.deny?.has?.(PermissionsBitField.Flags.Speak) === true;
  } catch {
    return false;
  }
}

function buildSpawnPermissionOverwrites(hubChannel, guild) {
  const lobbyRoles = new Set(hubLobbyRoleIds(guild));
  const byId = new Map();
  for (const overwrite of copyPermissionOverwrites(hubChannel)) {
    byId.set(String(overwrite.id), overwrite);
  }
  const result = [];
  for (const overwrite of byId.values()) {
    const id = String(overwrite.id);
    result.push(lobbyRoles.has(id) ? mergeOverwriteSpeak(overwrite, true) : overwrite);
  }
  for (const roleId of lobbyRoles) {
    if (byId.has(roleId)) continue;
    result.push({
      id: roleId,
      type: OverwriteType.Role,
      allow: PermissionsBitField.Flags.Speak | PermissionsBitField.Flags.UseVAD | PermissionsBitField.Flags.Stream,
      deny: 0n,
    });
  }
  return result;
}

async function ensureHubLobbySpeakDenied(hubChannel, guild) {
  if (!hubChannel?.permissionOverwrites || !hubChannel.manageable) return;
  for (const roleId of hubLobbyRoleIds(guild)) {
    const existing = hubChannel.permissionOverwrites.cache.get(roleId);
    if (hubOverwriteSpeakDenied(existing)) continue;
    const patch = {
      Speak: false,
      UseVAD: false,
      Stream: false,
    };
    if (existing) {
      await hubChannel.permissionOverwrites.edit(roleId, patch).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny edit failed:", hubChannel.id, roleId, err?.message || err);
      });
      continue;
    }
    await hubChannel.permissionOverwrites
      .create(roleId, {
        type: OverwriteType.Role,
        deny: HUB_LOBBY_SPEAK_FLAGS,
      })
      .catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny create failed:", hubChannel.id, roleId, err?.message || err);
      });
  }
}

async function ensurePublicVoiceHubChannelsOnReady(client) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return;
  for (const hubId of getHubChannelIds(client)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    await ensureHubLobbySpeakDenied(hub, guild);
  }
}

function startPublicVoiceHubSetup(client) {
  setImmediate(() => {
    ensurePublicVoiceHubChannelsOnReady(client).catch((err) =>
      global.logger?.warn?.("[publicVoiceHub] hub permission sync failed:", err?.message || err),
    );
  });
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
  const hubKey = voiceHubGroupKey(channel.name);
  if (!hubKey) return false;
  for (const hubId of getHubChannelIds(client)) {
    const hub = channel.guild?.channels?.cache?.get(hubId);
    if (!hub || String(hub.parentId || "") !== parentId) continue;
    if (voiceHubGroupKey(hub.name) === hubKey) return true;
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
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] bot missing ManageChannels/MoveMembers");
    return;
  }

  const uid = String(member.id);
  if (userCreateLocks.has(uid)) return;
  userCreateLocks.add(uid);

  try {
    await withHubCreateLock(joinedId, async () => {
      await refreshParentChannelsCache(guild, hub.parentId, client, { force: true });
      const freshHub = guild.channels.cache.get(joinedId) || hub;
      await ensureHubLobbySpeakDenied(freshHub, guild);
      const group = listHubGroupChannels(guild, freshHub);
      const nextIndex = nextSpawnSuffixIndex(group, joinedId);
      const spawnName = `${stripVoiceSuffix(freshHub.name)}${toSuperscriptNumber(nextIndex, MIN_SUFFIX_DIGITS)}`;
      const position = resolveInsertSlot(freshHub, guild, client);

      const createOptions = {
        name: spawnName,
        type: ChannelType.GuildVoice,
        parent: freshHub.parentId || undefined,
        userLimit: Math.max(0, Number(freshHub.userLimit) || 0),
        rtcRegion: freshHub.rtcRegion || undefined,
        permissionOverwrites: buildSpawnPermissionOverwrites(freshHub, guild),
        reason: `Vocale hub ${freshHub.name}`,
      };
      if (Number.isFinite(position)) createOptions.position = position;

      const created = await guild.channels.create(createOptions).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] create failed:", err?.message || err);
        return null;
      });
      if (!created) return;

      if (Number.isFinite(position) && Number(created.rawPosition) !== Number(position)) {
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

      const realignStats = await ensureHubGroupChannelOrder(guild, freshHub, client, { forceFetch: true });
      if (Array.isArray(realignStats.misplaced) && realignStats.misplaced.length) {
        global.logger?.warn?.(
          "[publicVoiceHub] spawn still misplaced after join realign:",
          realignStats.misplaced.map((row) => row.name || row.id).join(", "),
        );
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
  voiceHubGroupKey,
  isHubGroupSpawnChannel,
  parseVoiceSuffixIndex,
  toSuperscriptNumber,
  handlePublicVoiceHubJoin,
  handlePublicVoiceHubEmpty,
  ensurePublicVoiceHubChannelsOnReady,
  startPublicVoiceHubSetup,
  buildSpawnPermissionOverwrites,
  hubLobbyRoleIds,
  resolveInsertSlot,
  resolveInsertPosition,
  ensureHubGroupChannelOrder,
  realignAllPublicVoiceHubGroups,
  realignPublicVoiceHubGroupsOnStartup,
  refreshParentChannelsCache,
  verifyHubGroupChannelOrder,
  buildDesiredSiblingsWithHubSpawns,
  computeCategoryPositionUpdates,
};