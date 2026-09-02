const { ChannelType, PermissionsBitField, OverwriteType } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { queueCategoryRenumber } = require("../Community/communityOpsService");
const { buildRecoveryVoiceState } = require("../../../shared/discord/voiceStateRecovery");

const SUPERSCRIPT_MAP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const DIGIT_FROM_SUPERSCRIPT = Object.fromEntries(Object.entries(SUPERSCRIPT_MAP).map(([d, s]) => [s, d]));
const INDEX_SUFFIX_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+$/;
const EMPTY_DELETE_DELAY_MS = 1500;
const MIN_SUFFIX_DIGITS = 2;
const HUB_LOBBY_SPEAK_FLAGS = [
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.UseVAD,
  PermissionsBitField.Flags.Stream,
  PermissionsBitField.Flags.UseEmbeddedActivities,
  PermissionsBitField.Flags.UseExternalApps,
];
const HUB_SPAWN_MEMBER_TEXT_FLAGS = [PermissionsBitField.Flags.SendMessages];

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

const HUB_GROUP_LABELS = {
  duo: "Duo",
  trio: "Trio",
  quad: "Quad",
  penta: "Penta",
  hexa: "Hexa",
  setta: "Setta",
  octa: "Octa",
  lounge: "Lounge",
  squad: "Squad",
};

const HUB_CHANNEL_GROUP_KEYS = Object.fromEntries(
  [
    [String(IDs.channels?.vocaleDuo1 || "").trim(), "duo"],
    [String(IDs.channels?.vocaleTrio1 || "").trim(), "trio"],
    [String(IDs.channels?.vocaleQuad1 || "").trim(), "quad"],
    [String(IDs.channels?.vocalePenta1 || "").trim(), "penta"],
    [String(IDs.channels?.vocaleHexa1 || "").trim(), "hexa"],
    [String(IDs.channels?.vocaleSetta1 || "").trim(), "setta"],
    [String(IDs.channels?.vocaleOcta1 || "").trim(), "octa"],
  ].filter(([id]) => id),
);

const HUB_LOBBY_CREATE_PHRASE_RE = /\bcrea\s+un[a']?\s+/gi;

function stripHubLobbyCreatePhrase(name) {
  return String(name || "")
    .replace(HUB_LOBBY_CREATE_PHRASE_RE, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function voiceHubGroupKey(name, channelId) {
  const fromId = HUB_CHANNEL_GROUP_KEYS[String(channelId || "").trim()];
  if (fromId) return fromId;
  const raw = String(name || "");
  if (/\bduo\b/i.test(raw)) return "duo";
  if (/\btrio\b/i.test(raw)) return "trio";
  if (/\bquad\b/i.test(raw)) return "quad";
  if (/\bpenta\b/i.test(raw)) return "penta";
  if (/\bhexa\b/i.test(raw)) return "hexa";
  if (/\bsetta\b/i.test(raw)) return "setta";
  if (/\bocta\b/i.test(raw)) return "octa";
  if (/\blounge\b/i.test(raw)) return "lounge";
  if (/\bsquad\b/i.test(raw)) return "squad";
  return "";
}

function resolveHubGroupKey(channel) {
  if (!channel) return "";
  return voiceHubGroupKey(channel.name, channel.id);
}

function resolveHubSpawnBaseName(hubChannel) {
  const stripped = stripVoiceSuffix(hubChannel?.name || "");
  const withoutPhrase = stripHubLobbyCreatePhrase(stripped);
  if (withoutPhrase) return withoutPhrase;
  const fromIdKey = HUB_CHANNEL_GROUP_KEYS[String(hubChannel?.id || "").trim()];
  if (fromIdKey && HUB_GROUP_LABELS[fromIdKey]) return HUB_GROUP_LABELS[fromIdKey];
  return stripped;
}

function isHubGroupSpawnChannel(channel, hubChannel, client) {
  if (!channel || channel.type !== ChannelType.GuildVoice) return false;
  if (isPublicVoiceHubId(channel.id, client)) return false;
  const hubKey = resolveHubGroupKey(hubChannel);
  if (!hubKey || resolveHubGroupKey(channel) !== hubKey) return false;
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
  const hubKey = resolveHubGroupKey(hubChannel);
  if (!hubKey) return [];
  return listCategoryChannelsSorted(guild, parentId)
    .filter((ch) => ch.type === ChannelType.GuildVoice)
    .filter((ch) => resolveHubGroupKey(ch) === hubKey);
}

function nextSpawnSuffixIndex(groupChannels, hubId) {
  const used = new Set();
  for (const ch of groupChannels) {
    if (String(ch.id) === String(hubId)) continue;
    const n = parseVoiceSuffixIndex(ch.name);
    if (n > 0) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

function resolveInsertSlot(hubChannel, guild, client) {
  const parentId = String(hubChannel.parentId || "");
  const hubKey = resolveHubGroupKey(hubChannel);
  if (!hubKey) return null;
  const siblings = listCategoryChannelsSorted(guild, parentId);
  const hubIndex = siblings.findIndex((ch) => String(ch.id) === String(hubChannel.id));
  if (hubIndex < 0) return null;

  let insertAt = hubIndex + 1;
  for (let i = hubIndex + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (ch.type !== ChannelType.GuildVoice) continue;
    if (isPublicVoiceHubId(ch.id, client)) break;
    if (resolveHubGroupKey(ch) !== hubKey) break;
    insertAt = i + 1;
  }

  const prev = siblings[insertAt - 1];
  if (!prev) return null;
  const prevPos = Number(prev.rawPosition);
  if (!Number.isFinite(prevPos)) return null;

  if (insertAt < siblings.length) {
    const next = siblings[insertAt];
    const nextPos = Number(next.rawPosition);
    if (Number.isFinite(nextPos) && nextPos > prevPos + 1) return prevPos + 1;
    if (Number.isFinite(nextPos)) return nextPos;
  }
  return prevPos + 1;
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

function buildLimitateCategoryDesiredOrder(guild, client, parentId) {
  const siblings = listCategoryChannelsSorted(guild, parentId);
  const hubs = getHubChannelIds(client)
    .map((id) => guild.channels.cache.get(id))
    .filter((hub) => hub && String(hub.parentId || "") === String(parentId))
    .sort((a, b) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));

  const used = new Set();
  const ordered = [];
  for (const hub of hubs) {
    ordered.push(hub);
    used.add(String(hub.id));
    const spawns = siblings
      .filter((ch) => !used.has(String(ch.id)) && isHubGroupSpawnChannel(ch, hub, client))
      .sort((a, b) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
    for (const spawn of spawns) {
      ordered.push(spawn);
      used.add(String(spawn.id));
    }
  }
  for (const ch of siblings) {
    if (!used.has(String(ch.id))) ordered.push(ch);
  }
  return ordered;
}

async function applyCategoryPositionUpdates(guild, updates) {
  if (!updates.length) return { applied: 0 };
  const movable = [];
  for (const row of updates) {
    const ch = guild.channels.cache.get(row.channel);
    if (!ch) continue;
    if (ch.manageable === false) continue;
    movable.push(row);
  }
  if (!movable.length) return { applied: 0, reason: "nothing_movable" };
  try {
    if (typeof guild.channels?.setPositions === "function") {
      await guild.channels.setPositions(movable);
    } else {
      for (const row of movable) {
        const ch = guild.channels.cache.get(row.channel);
        if (ch?.setPosition) await ch.setPosition(row.position);
      }
    }
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return { applied: movable.length };
  } catch (err) {
    return {
      applied: 0,
      reason: "set_positions_failed",
      error: err?.message || String(err),
    };
  }
}

async function moveMisplacedHubSpawns(guild, client, parentId, desiredOrder, options = {}) {
  const gapMs = Number(options.gapMs) > 0 ? Number(options.gapMs) : 350;
  let current = listCategoryChannelsSorted(guild, parentId);
  let moved = 0;
  for (let targetIdx = desiredOrder.length - 1; targetIdx >= 0; targetIdx -= 1) {
    const target = desiredOrder[targetIdx];
    if (!target || isPublicVoiceHubId(target.id, client)) continue;
    const currentIdx = current.findIndex((ch) => String(ch.id) === String(target.id));
    if (currentIdx === targetIdx) continue;
    const fresh = guild.channels.cache.get(target.id) || target;
    if (!fresh.manageable) continue;
    const anchor = desiredOrder[targetIdx + 1] || null;
    let ok = false;
    if (anchor) {
      const anchorFresh = guild.channels.cache.get(anchor.id) || anchor;
      ok = await fresh.setPosition(anchorFresh.rawPosition).then(() => true).catch(() => false);
    } else {
      const prev = desiredOrder[targetIdx - 1];
      const prevPos = Number(prev?.rawPosition);
      if (Number.isFinite(prevPos)) {
        ok = await fresh.setPosition(prevPos + 1).then(() => true).catch(() => false);
      }
    }
    if (ok) {
      moved += 1;
      if (gapMs > 0) await pauseMs(gapMs);
      if (options.skipFetch !== true) {
        await guild.channels.fetch(undefined, { force: true }).catch(() => null);
      }
      current = listCategoryChannelsSorted(guild, parentId);
    }
  }
  return moved;
}

async function reorderLimitateCategory(guild, client, options = {}) {
  const stats = { moved: 0, failed: 0, parentId: "" };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return stats;
  const quick = options.quick === true;
  const maxAttempts = quick ? 1 : 3;
  const retryPauseMs = quick ? 0 : 450;
  const spawnGapMs = quick ? 0 : 350;

  const parentId = String(
    options.parentId ||
      IDs.categories?.categoryLimitate ||
      guild.channels.cache.get(getHubChannelIds(client)[0] || "")?.parentId ||
      "",
  );
  if (!parentId) return stats;
  stats.parentId = parentId;

  await refreshParentChannelsCache(guild, parentId, client, { force: options.forceFetch === true && !quick });
  const desired = buildLimitateCategoryDesiredOrder(guild, client, parentId);
  let siblings = listCategoryChannelsSorted(guild, parentId);
  if (siblingsOrderEqual(siblings, desired)) return stats;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    siblings = listCategoryChannelsSorted(guild, parentId);
    const desiredOrder = buildLimitateCategoryDesiredOrder(guild, client, parentId);
    if (siblingsOrderEqual(siblings, desiredOrder)) break;

    const updates = computeCategoryPositionUpdates(siblings, desiredOrder);
    const batch = await applyCategoryPositionUpdates(guild, updates);
    if (batch.applied > 0) {
      stats.moved += 1;
      if (retryPauseMs > 0) await pauseMs(retryPauseMs);
      continue;
    }

    const spawnMoved = await moveMisplacedHubSpawns(guild, client, parentId, desiredOrder, {
      gapMs: spawnGapMs,
      skipFetch: quick,
    });
    if (spawnMoved > 0) {
      stats.moved += spawnMoved;
      continue;
    }

    stats.failed += 1;
    if (!quick) {
      global.logger?.warn?.(
        "[publicVoiceHub] limitate reorder failed:",
        batch.reason || "spawn_move_failed",
        batch.error || "",
        siblings.map((ch) => `${ch.name}@${ch.rawPosition}`).join(" | "),
      );
    }
    break;
  }

  return stats;
}

function pauseMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureHubGroupChannelOrder(guild, hubChannel, client, options = {}) {
  const parentId = String(hubChannel?.parentId || "");
  const stats = await reorderLimitateCategory(guild, client, {
    parentId,
    forceFetch: options.forceFetch === true,
  });
  stats.hubId = String(hubChannel?.id || "");
  const verify = verifyHubGroupChannelOrder(guild, hubChannel, client);
  if (!verify.ok) stats.misplaced = verify.misplaced;
  return stats;
}

async function realignAllPublicVoiceHubGroups(guild, client) {
  const summary = { moved: 0, skipped: 0, failed: 0, misplaced: [] };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return summary;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  const stats = await reorderLimitateCategory(guild, client, { forceFetch: true });
  summary.moved += stats.moved || 0;
  summary.failed += stats.failed || 0;
  for (const hubId of getHubChannelIds(client)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    const verify = verifyHubGroupChannelOrder(guild, hub, client);
    if (!verify.ok && Array.isArray(verify.misplaced)) summary.misplaced.push(...verify.misplaced);
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

function mergeOverwriteFlags(overwrite, flags, allow) {
  const allowBits = new PermissionsBitField(overwrite.allow?.bitfield ?? overwrite.allow ?? 0n);
  const denyBits = new PermissionsBitField(overwrite.deny?.bitfield ?? overwrite.deny ?? 0n);
  for (const flag of flags) {
    if (allow) {
      denyBits.remove(flag);
      allowBits.add(flag);
    } else {
      allowBits.remove(flag);
      denyBits.add(flag);
    }
  }
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: allowBits.bitfield,
    deny: denyBits.bitfield,
  };
}

function mergeOverwriteSpeak(overwrite, allowSpeak) {
  return mergeOverwriteFlags(overwrite, HUB_LOBBY_SPEAK_FLAGS, allowSpeak);
}

function mergeSpawnOverwriteForRole(overwrite, lobbyRoles) {
  const id = String(overwrite.id);
  let patched = lobbyRoles.has(id) ? mergeOverwriteSpeak(overwrite, true) : overwrite;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && id === memberRoleId) {
    patched = mergeOverwriteFlags(patched, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
  }
  return patched;
}

async function ensureSpawnedChannelMemberTextAccess(channel, guild) {
  if (!channel?.permissionOverwrites?.cache || !channel.manageable) return;
  const patch = {
    SendMessages: true,
    UseEmbeddedActivities: true,
    UseExternalApps: true,
  };
  const targets = [];
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) targets.push(memberRoleId);
  const everyoneId = String(guild?.roles?.everyone?.id || "").trim();
  if (everyoneId) targets.push(everyoneId);
  for (const roleId of targets) {
    const existing = channel.permissionOverwrites.cache.get(roleId);
    if (existing) {
      await channel.permissionOverwrites.edit(roleId, patch).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] spawn activity/text edit failed:", channel.id, err?.message || err);
      });
      continue;
    }
    if (roleId === memberRoleId) {
      await channel.permissionOverwrites
        .create(roleId, { type: OverwriteType.Role, ...patch })
        .catch((err) => {
          global.logger?.warn?.("[publicVoiceHub] spawn activity/text create failed:", channel.id, err?.message || err);
        });
    }
  }
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
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const byId = new Map();
  for (const overwrite of copyPermissionOverwrites(hubChannel)) {
    byId.set(String(overwrite.id), overwrite);
  }
  const result = [];
  for (const overwrite of byId.values()) {
    result.push(mergeSpawnOverwriteForRole(overwrite, lobbyRoles));
  }
  for (const roleId of lobbyRoles) {
    if (byId.has(roleId)) continue;
    let entry = {
      id: roleId,
      type: OverwriteType.Role,
      allow:
        PermissionsBitField.Flags.Speak |
        PermissionsBitField.Flags.UseVAD |
        PermissionsBitField.Flags.Stream |
        PermissionsBitField.Flags.UseEmbeddedActivities |
        PermissionsBitField.Flags.UseExternalApps,
      deny: 0n,
    };
    if (memberRoleId && roleId === memberRoleId) {
      entry = mergeOverwriteFlags(entry, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
    }
    result.push(entry);
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

async function recoverPublicVoiceHubOnStartup(client) {
  if (client?.config?.publicVoiceHubs?.enabled === false) return { lobbies: 0, spawned: 0 };
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { lobbies: 0, spawned: 0 };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return { lobbies: 0, spawned: 0 };

  await guild.channels.fetch().catch(() => null);
  await guild.members.fetch({ withPresences: false }).catch(() => null);

  let spawned = 0;
  let lobbies = 0;

  for (const hubId of getHubChannelIds(client)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;

    for (const ch of listHubGroupChannels(guild, hub)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      await ensureSpawnedChannelMemberTextAccess(ch, guild);
      spawned += 1;
      if ((await countHumanMembersResolved(ch)) === 0) {
        scheduleSpawnedChannelDelete(ch, client);
      }
    }

        const lobbyUserIds = [
      ...new Set(
        [...guild.voiceStates.cache.values()]
          .filter((vs) => String(vs.channelId || "") === String(hubId))
          .map((vs) => String(vs.id || "").trim())
          .filter(Boolean),
      ),
    ];
    for (const userId of lobbyUserIds) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      const oldState = buildRecoveryVoiceState(guild, member, null);
      const newState = buildRecoveryVoiceState(guild, member, hubId);
      await handlePublicVoiceHubJoin(oldState, newState, client);
      lobbies += 1;
    }
  }

  if (lobbies > 0 || spawned > 0) {
    global.logger?.info?.(`[publicVoiceHub] recovery: lobbies=${lobbies} spawned=${spawned}`);
  }
  return { lobbies, spawned };
}

function startPublicVoiceHubSetup(client) {
  setImmediate(() => {
    (async () => {
      await ensurePublicVoiceHubChannelsOnReady(client).catch((err) =>
        global.logger?.warn?.("[publicVoiceHub] hub permission sync failed:", err?.message || err),
      );
      await recoverPublicVoiceHubOnStartup(client).catch((err) =>
        global.logger?.warn?.("[publicVoiceHub] lobby recovery failed:", err?.message || err),
      );
      await realignPublicVoiceHubGroupsOnStartup(client).catch((err) =>
        global.logger?.warn?.("[publicVoiceHub] realign failed:", err?.message || err),
      );
      await sweepEmptySpawnedHubChannels(client).catch((err) =>
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err),
      );
    })();
  });

  if (!client.__publicVoiceHubEmptySweep) {
    client.__publicVoiceHubEmptySweep = setInterval(() => {
      sweepEmptySpawnedHubChannels(client).catch((err) => {
        global.logger?.warn?.("[publicVoiceHub] empty sweep failed:", err?.message || err);
      });
    }, 60_000);
    client.__publicVoiceHubEmptySweep.unref?.();
  }
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
  const hubKey = resolveHubGroupKey(channel);
  if (!hubKey) return false;
  for (const hubId of getHubChannelIds(client)) {
    const hub = channel.guild?.channels?.cache?.get(hubId);
    if (!hub || String(hub.parentId || "") !== parentId) continue;
    if (resolveHubGroupKey(hub) === hubKey) return true;
  }
  return false;
}

function resolveVoiceStateUser(guild, vs) {
  const member = vs?.member || guild?.members?.cache?.get?.(vs?.id);
  const user = member?.user || guild?.client?.users?.cache?.get?.(vs?.id) || null;
  return { member: member || null, user };
}

function countHumanMembers(channel) {
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

async function countHumanMembersResolved(channel) {
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

function resolveMemberVoiceChannelId(guild, userId, member = null) {
  const uid = String(userId || member?.id || "");
  if (!uid) return "";
  const fromCache = guild?.voiceStates?.cache?.get?.(uid);
  if (fromCache?.channelId) return String(fromCache.channelId);
  const fromMember = member?.voice?.channelId;
  return fromMember ? String(fromMember) : "";
}

function memberStillInVoiceChannel(member, channelId, guild = null) {
  const expected = String(channelId || "");
  if (!expected) return false;
  const current = resolveMemberVoiceChannelId(guild || member?.guild, member?.id, member);
  return Boolean(current && current === expected);
}

function isUserDisconnectedVoiceError(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("not connected to voice") || msg.includes("target user is not connected");
}

async function resolveGuildMemberVoiceState(guild, member, userId) {
  const uid = String(userId || member?.id || "");
  if (!guild || !uid) return member || null;
  const cached = guild.members.cache.get(uid) || member;
  if (cached?.voice?.channelId) return cached;
  return guild.members.fetch(uid).catch(() => cached || null);
}

async function cleanupUnusedSpawnedChannel(created, reason) {
  if (!created?.id) return;
  forgetSpawnedChannel(created.id);
  await created.delete(reason).catch(() => {});
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
    const humans = await countHumanMembersResolved(fresh);
    if (humans > 0) return;
    if (!fresh.manageable && !fresh.deletable) {
      global.logger?.warn?.("[publicVoiceHub] empty spawn not deletable:", channelId, fresh.name);
      return;
    }
    const deleted = await fresh.delete("Vocale hub temporanea vuota").then(() => true).catch((err) => {
      global.logger?.warn?.("[publicVoiceHub] empty spawn delete failed:", channelId, err?.message || err);
      return false;
    });
    if (!deleted) return;
    const hubId = spawnedHubByChannel.get(channelId) || null;
    forgetSpawnedChannel(channelId);
    let hub = hubId ? guild.channels.cache.get(hubId) : null;
    if (!hub) {
      const hubKey = resolveHubGroupKey(fresh);
      if (hubKey) {
        hub = getHubChannelIds(client)
          .map((id) => guild.channels.cache.get(id))
          .find(
            (row) =>
              row &&
              String(row.parentId || "") === String(fresh.parentId || "") &&
              resolveHubGroupKey(row) === hubKey,
          );
      }
    }
    if (hub) {
      await reorderLimitateCategory(guild, client, { parentId: fresh.parentId, forceFetch: true }).catch(() => null);
    }
    queueCategoryRenumber(client, guild.id, 5000);
  }, EMPTY_DELETE_DELAY_MS);
  timer.unref?.();
  emptyDeleteTimers.set(channelId, timer);
}

function scheduleHubSpawnFollowUp(guild, client, hubChannel, createdChannelId) {
  const guildId = String(guild?.id || "");
  const hubId = String(hubChannel?.id || "");
  const channelId = String(createdChannelId || "");
  if (!guildId || !hubId) return;
  setImmediate(() => {
    (async () => {
      const liveGuild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      if (!liveGuild) return;
      const hub = liveGuild.channels.cache.get(hubId) || (await liveGuild.channels.fetch(hubId).catch(() => null));
      if (!hub) return;
      const created =
        liveGuild.channels.cache.get(channelId) ||
        (channelId ? await liveGuild.channels.fetch(channelId).catch(() => null) : null);
      if (created) {
        await ensureSpawnedChannelMemberTextAccess(created, liveGuild).catch(() => null);
      }
      await reorderLimitateCategory(liveGuild, client, {
        parentId: hub.parentId,
        forceFetch: true,
      }).catch(() => null);
      queueCategoryRenumber(client, liveGuild.id, 5000);
    })().catch((err) => {
      global.logger?.warn?.("[publicVoiceHub] deferred follow-up failed:", err?.message || err);
    });
  });
}

async function handlePublicVoiceHubJoin(oldState, newState, client) {
  const joinedId = String(newState.channelId || "");
  if (!joinedId || !isPublicVoiceHubId(joinedId, client)) return;

  const guild = newState.guild;
  if (!guild) return;
  const uid = String(newState.id || newState.member?.id || "").trim();
  if (!uid) return;

  let member = newState.member || guild.members.cache.get(uid) || null;
  if (!member) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  const hub =
    newState.channel ||
    guild.channels.cache.get(joinedId) ||
    (await guild.channels.fetch(joinedId).catch(() => null));
  if (!member || member.user?.bot || !hub?.isVoiceBased?.()) return;
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] bot missing ManageChannels/MoveMembers");
    return;
  }

  if (userCreateLocks.has(uid)) return;
  userCreateLocks.add(uid);

  try {
    await withHubCreateLock(joinedId, async () => {
      await refreshParentChannelsCache(guild, hub.parentId, client, { force: false });
      const freshHub = guild.channels.cache.get(joinedId) || hub;
      const group = listHubGroupChannels(guild, freshHub);
      const nextIndex = nextSpawnSuffixIndex(group, joinedId);
      const spawnName = `${resolveHubSpawnBaseName(freshHub)}${toSuperscriptNumber(nextIndex, MIN_SUFFIX_DIGITS)}`;
      const position = resolveInsertSlot(freshHub, guild, client);

      if (!memberStillInVoiceChannel(member, joinedId, guild)) return;

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

      rememberSpawnedChannel(created.id, joinedId);

      const freshMember = await resolveGuildMemberVoiceState(guild, member, uid);
      if (!memberStillInVoiceChannel(freshMember, joinedId, guild)) {
        await cleanupUnusedSpawnedChannel(created, "Utente non più in lobby hub");
        return;
      }

      const moved = await freshMember.voice.setChannel(created).then(() => true).catch((err) => {
        if (!isUserDisconnectedVoiceError(err)) {
          global.logger?.warn?.("[publicVoiceHub] move failed:", err?.message || err);
        }
        return false;
      });
      if (!moved) {
        await cleanupUnusedSpawnedChannel(created, "Move utente fallito");
        return;
      }

      scheduleHubSpawnFollowUp(guild, client, freshHub, created.id);
    });
  } finally {
    userCreateLocks.delete(uid);
  }
}

async function handlePublicVoiceHubEmpty(oldState, newState, client) {
  const leftId = String(oldState.channelId || "");
  if (!leftId || isPublicVoiceHubId(leftId, client)) return;
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
  scheduleSpawnedChannelDelete(channel, client);
}

async function sweepEmptySpawnedHubChannels(client) {
  if (client?.config?.publicVoiceHubs?.enabled === false) return 0;
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return 0;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild || !(await botCanManageVoiceHubs(guild))) return 0;

  let queued = 0;
  for (const hubId of getHubChannelIds(client)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    for (const ch of listHubGroupChannels(guild, hub)) {
      if (!isHubGroupSpawnChannel(ch, hub, client)) continue;
      rememberSpawnedChannel(ch.id, hubId);
      if ((await countHumanMembersResolved(ch)) > 0) continue;
      scheduleSpawnedChannelDelete(ch, client);
      queued += 1;
    }
  }
  return queued;
}

module.exports = {
  getHubChannelIds,
  isPublicVoiceHubId,
  isSpawnedHubChannel,
  stripVoiceSuffix,
  voiceHubGroupKey,
  resolveHubGroupKey,
  resolveHubSpawnBaseName,
  isHubGroupSpawnChannel,
  parseVoiceSuffixIndex,
  toSuperscriptNumber,
  handlePublicVoiceHubJoin,
  handlePublicVoiceHubEmpty,
  recoverPublicVoiceHubOnStartup,
  ensurePublicVoiceHubChannelsOnReady,
  startPublicVoiceHubSetup,
  sweepEmptySpawnedHubChannels,
  buildSpawnPermissionOverwrites,
  hubLobbyRoleIds,
  resolveInsertSlot,
  resolveInsertPosition,
  reorderLimitateCategory,
  buildLimitateCategoryDesiredOrder,
  ensureHubGroupChannelOrder,
  realignAllPublicVoiceHubGroups,
  realignPublicVoiceHubGroupsOnStartup,
  refreshParentChannelsCache,
  verifyHubGroupChannelOrder,
  buildDesiredSiblingsWithHubSpawns,
  computeCategoryPositionUpdates,
};