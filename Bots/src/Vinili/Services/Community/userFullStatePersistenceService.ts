"use strict";

const axios = require("axios") as any;
const {
  ActivityUserProfile,
  UserFullDiscordStateHistory,
  GlobalSettings,
} = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { getClientGuildCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  isTrackedPersonalityRoleId,
  ALL_PERSONALITY_TRACKED_ROLE_IDS,
} = require("../../Utils/Community/personalityRolePersistence") as typeof import("../../Utils/Community/personalityRolePersistence");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const SCHEMA_VERSION = 1;
const DEBOUNCE_MS = 2_500;
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const FULL_BACKFILL_MIN_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const LIGHT_SWEEP_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;
const HISTORY_KEEP = 8;
const MAX_ICON_BYTES = 512 * 1024;
const CONCURRENCY = 4;

const pendingByKey = new Map();
let loopHandle = null;
let sweepBusy = false;
let lastFullBackfillAtMs = 0;
let lastLightSweepAtMs = 0;
/* rebootDurability1: flush debounce pendingByKey on shutdown */
let shutdownFlushRegistered = false;

function mainGuildId() {
  return String(IDs.guilds?.main || "").trim();
}

function roleColorsPayload(role?) {
  const c = role?.colors;
  if (!c || typeof c !== "object") return null;
  const primary = Number(c.primaryColor ?? c.primary ?? NaN);
  const secondary = Number(c.secondaryColor ?? c.secondary ?? NaN);
  const tertiary = Number(c.tertiaryColor ?? c.tertiary ?? NaN);
  const out: Record<string, any> = {};
  if (Number.isFinite(primary)) out.primaryColor = primary;
  if (Number.isFinite(secondary)) out.secondaryColor = secondary;
  if (Number.isFinite(tertiary)) out.tertiaryColor = tertiary;
  return Object.keys(out).length ? out : null;
}

function roleFingerprint(role?) {
  if (!role?.id) return null;
  let iconURL = null;
  try {
    if (typeof role.iconURL === "function") {
      iconURL = role.iconURL({ size: 256, extension: "png" }) || null;
    }
  } catch {
    iconURL = null;
  }
  return {
    id: String(role.id),
    name: String(role.name || ""),
    color: Number(role.color) || 0,
    colors: roleColorsPayload(role),
    icon: role.icon ? String(role.icon) : null,
    iconURL,
    unicodeEmoji: role.unicodeEmoji ? String(role.unicodeEmoji) : null,
    hoist: Boolean(role.hoist),
    mentionable: Boolean(role.mentionable),
    managed: Boolean(role.managed),
    position: Number(role.rawPosition ?? role.position) || 0,
  };
}

function serializeOverwrite(ow?) {
  if (!ow?.id) return null;
  const allow = ow.allow?.bitfield != null ? String(ow.allow.bitfield) : String(ow.allow ?? "0");
  const deny = ow.deny?.bitfield != null ? String(ow.deny.bitfield) : String(ow.deny ?? "0");
  return {
    id: String(ow.id),
    type: Number(ow.type),
    allow,
    deny,
  };
}

async function fetchIconBase64(iconURL?) {
  const url = String(iconURL || "").trim();
  if (!url || !/^https:\/\//i.test(url)) return null;
  try {
    const res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 8_000,
      maxContentLength: MAX_ICON_BYTES,
      maxBodyLength: MAX_ICON_BYTES,
      validateStatus: (s?) => s >= 200 && s < 300,
    });
    const buf = Buffer.from(res.data || []);
    if (!buf.length || buf.length > MAX_ICON_BYTES) return null;
    const ctype = String(res.headers?.["content-type"] || "image/png").split(";")[0].trim() || "image/png";
    return { contentType: ctype, base64: buf.toString("base64"), bytes: buf.length };
  } catch {
    return null;
  }
}

async function captureOwnedRoleDetails(guild?, roleId?, { withIconBytes = true } = {}) {
  const id = String(roleId || "").trim();
  if (!id) return null;
  let role = guild.roles.cache.get(id) || null;
  if (!role) role = await guild.roles.fetch(id).catch(() => null);
  if (!role) return { id, missing: true };
  const fp = roleFingerprint(role);
  let iconData = null;
  if (withIconBytes && fp?.iconURL) {
    iconData = await fetchIconBase64(fp.iconURL);
  }
  return {
    ...fp,
    iconData,
  };
}

async function captureCustomVoc(guild?, channelId?) {
  const id = String(channelId || "").trim();
  if (!id) return null;
  let channel = guild.channels.cache.get(id) || null;
  if (!channel) channel = await guild.channels.fetch(id).catch(() => null);
  if (!channel) return { id, missing: true };
  const overwrites = [];
  try {
    for (const ow of channel.permissionOverwrites?.cache?.values?.() || []) {
      const row = serializeOverwrite(ow);
      if (row) overwrites.push(row);
    }
  } catch {
    /* ignore */
  }
  return {
    id: String(channel.id),
    name: String(channel.name || ""),
    type: Number(channel.type),
    parentId: channel.parentId ? String(channel.parentId) : null,
    parentName: channel.parent?.name ? String(channel.parent.name) : null,
    bitrate: Number(channel.bitrate) || null,
    userLimit: Number(channel.userLimit) || 0,
    rtcRegion: channel.rtcRegion || null,
    position: Number(channel.rawPosition ?? channel.position) || 0,
    overwrites,
  };
}

function extractPersonalityFromRoleIds(roleIds?) {
  return [...new Set((Array.isArray(roleIds) ? roleIds : []).map(String).filter(isTrackedPersonalityRoleId))];
}

async function buildDiscordState(member?, profileLean?, reason?) {
  const guild = member.guild;
  const custom = profileLean?.profile?.customRole || {};
  const roleIds = Array.from(member.roles.cache.keys())
    .map(String)
    .filter((id?) => id && id !== String(guild.id));

  const roles = [];
  for (const id of roleIds) {
    const role = member.roles.cache.get(id);
    const fp = roleFingerprint(role);
    if (fp) roles.push(fp);
  }

  const personalityRoleIds = extractPersonalityFromRoleIds(roleIds);
  const ownedCustomRoles = {
    primary: await captureOwnedRoleDetails(guild, custom.roleId),
    secondary: await captureOwnedRoleDetails(guild, custom.secondaryRoleId),
  };
  const customVoc = await captureCustomVoc(guild, custom.customVocChannelId);

  return {
    schemaVersion: SCHEMA_VERSION,
    capturedAt: new Date(),
    source: String(reason || "unknown"),
    nickname: member.nickname || null,
    displayName: member.displayName || null,
    premiumSince: member.premiumSince || null,
    roleIds,
    roles,
    personalityRoleIds,
    ownedCustomRoles,
    customVocEmoji: custom.customVocEmoji || null,
    customVoc,
    profileCustomRole: {
      roleId: custom.roleId || null,
      secondaryRoleId: custom.secondaryRoleId || null,
      customVocChannelId: custom.customVocChannelId || null,
      customVocEmoji: custom.customVocEmoji || null,
      expiresAt: custom.expiresAt || null,
    },
  };
}

async function appendHistory(guildId?, userId?, state?) {
  await UserFullDiscordStateHistory.create({
    guildId,
    userId,
    capturedAt: state.capturedAt || new Date(),
    source: state.source || "unknown",
    state,
  }).catch(() => null);

  const extras = await UserFullDiscordStateHistory.find({ guildId, userId })
    .sort({ capturedAt: -1 })
    .skip(HISTORY_KEEP)
    .select("_id")
    .lean()
    .catch(() => []);
  if (Array.isArray(extras) && extras.length) {
    await UserFullDiscordStateHistory.deleteMany({
      _id: { $in: extras.map((x?) => x._id) },
    }).catch(() => null);
  }
}

/**
 * Persiste snapshot completo su ActivityUserProfile.discordState (+ history).
 * Aggiorna anche personalityRoleIds dal membro live.
 */
async function persistUserFullState(guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return { ok: false, reason: "invalid_ids" };

  /* roleShrinkRevalidate1: cache membro spesso incompleta (1 ruolo) → false shrink.
     Preferisci fetch fresco; se ancora “shrink” rivaluta con force:true prima di skip. */
  let member = options.member || null;
  const client = options.client || global.botClient || null;
  let guild = options.guild || member?.guild || null;
  if (!guild && client) {
    guild = await getClientGuildCached(client, gid).catch(() => null);
  }
  if (!member && guild) {
    member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member) member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
  }
  if (!member?.guild || member.user?.bot) {
    return { ok: false, reason: "no_member" };
  }
  if (!guild) guild = member.guild;

  const profileLean = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.customRole profile.personalityRoleIds")
    .lean()
    .catch(() => null);

  let state = await buildDiscordState(member, profileLean, options.reason || "persist");

  // Non sovrascrivere un discordState ricco con lo strip mute (pochi ruoli).
  let skipRoleShrink = false;
  let shrinkMute = false;
  try {
    const {
      memberIsInMuteMirrorState,
      hasPendingMuteMirrorSnapshot,
    } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
    if (memberIsInMuteMirrorState(member) || (await hasPendingMuteMirrorSnapshot(gid, uid).catch(() => false))) {
      skipRoleShrink = true;
      shrinkMute = true;
    }
  } catch (_) {}

  if (!skipRoleShrink) {
    const existing = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.discordState.roleIds")
      .lean()
      .catch(() => null);
    const existingIds = Array.isArray(existing?.profile?.discordState?.roleIds)
      ? existing.profile.discordState.roleIds.map(String).filter(Boolean)
      : [];
    let nextIds = Array.isArray(state.roleIds) ? state.roleIds.map(String).filter(Boolean) : [];
    const shrinkThreshold = Math.max(2, Math.floor(existingIds.length * 0.35));
    if (existingIds.length >= 5 && nextIds.length < shrinkThreshold) {
      /* roleShrinkRevalidate1: un GUILD_MEMBER_UPDATE parziale non deve congelare i ruoli */
      const freshMember = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
      if (freshMember && !freshMember.user?.bot) {
        member = freshMember;
        state = await buildDiscordState(member, profileLean, options.reason || "persist");
        nextIds = Array.isArray(state.roleIds) ? state.roleIds.map(String).filter(Boolean) : [];
      }
      if (nextIds.length < shrinkThreshold) {
        skipRoleShrink = true;
        const reason = String(options.reason || "");
        const quiet =
          shrinkMute ||
          reason === "leave_backup" ||
          /leave|remove|timeout|mute/i.test(reason);
        const line = `${nextIds.length}<${existingIds.length}`;
        if (quiet) {
          global.logger?.info?.("[USER FULL STATE] keep discordState roles (strip/leave):", gid, uid, line);
        } else {
          global.logger?.warn?.(
            "[USER FULL STATE] skip discordState role shrink:",
            gid,
            uid,
            line,
          );
        }
      }
    }
  }

  if (skipRoleShrink) {
    const existing = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.discordState")
      .lean()
      .catch(() => null);
    const prev = existing?.profile?.discordState;
    if (prev && Array.isArray(prev.roleIds) && prev.roleIds.length) {
      state.roleIds = prev.roleIds.map(String).filter(Boolean);
      if (Array.isArray(prev.roles) && prev.roles.length) state.roles = prev.roles;
      if (Array.isArray(prev.personalityRoleIds) && prev.personalityRoleIds.length) {
        state.personalityRoleIds = prev.personalityRoleIds;
      }
    }
  }

  const setPayload = {
    "profile.discordState": state,
  };
  if (state.personalityRoleIds?.length) {
    setPayload["profile.personalityRoleIds"] = state.personalityRoleIds;
  } else if (Array.isArray(profileLean?.profile?.personalityRoleIds) && profileLean.profile.personalityRoleIds.length) {
    // keep existing if member currently has none (mute / temp strip) — do not wipe
  } else {
    setPayload["profile.personalityRoleIds"] = [];
  }

  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: setPayload },
    { upsert: true },
  ).catch(() => null);

  if (options.skipHistory !== true) {
    await appendHistory(gid, uid, state);
  }

  return { ok: true, roleCount: state.roleIds.length, personalityCount: state.personalityRoleIds.length };
}

async function flushPendingUserFullStateOnShutdown() {
  const entries = [...pendingByKey.entries()];
  pendingByKey.clear();
  const tasks = [];
  for (const [key, row] of entries) {
    if (row?.timer) {
      try {
        clearTimeout(row.timer);
      } catch (_) {}
    }
    const idx = String(key || "").indexOf(":");
    if (idx <= 0) continue;
    const gid = key.slice(0, idx);
    const uid = key.slice(idx + 1);
    if (!gid || !uid) continue;
    const { timer: _timer, ...opts } = row || {};
    tasks.push(
      persistUserFullState(gid, uid, { ...opts, reason: opts?.reason || "shutdown_flush" }).catch((err?) => {
        global.logger?.warn?.(
          "[USER FULL STATE] shutdown persist failed:",
          gid,
          uid,
          err?.message || err,
        );
      }),
    );
  }
  if (tasks.length) await Promise.allSettled(tasks);
}

function ensureUserFullStateShutdownFlush() {
  if (shutdownFlushRegistered) return;
  shutdownFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_user_full_state_pending", () => flushPendingUserFullStateOnShutdown());
}

function schedulePersistUserFullState(guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return;
  ensureUserFullStateShutdownFlush();
  const key = `${gid}:${uid}`;
  const prev = pendingByKey.get(key);
  if (prev?.timer) clearTimeout(prev.timer);

  const merged = {
    ...prev,
    ...options,
    member: options.member || prev?.member || null,
    guild: options.guild || prev?.guild || null,
    client: options.client || prev?.client || null,
    reason: options.reason || prev?.reason || "scheduled",
  };

  const timer = setTimeout(() => {
    pendingByKey.delete(key);
    persistUserFullState(gid, uid, merged).catch((err?) => {
      global.logger?.warn?.(
        "[USER FULL STATE] persist failed:",
        gid,
        uid,
        err?.message || err,
      );
    });
  }, DEBOUNCE_MS);
  timer.unref?.();
  pendingByKey.set(key, { ...merged, timer });
}

async function mapPool(items?, concurrency?, worker?) {
  const list = Array.isArray(items) ? items : [];
  let idx = 0;
  const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (idx < list.length) {
      const cur = list[idx++];
      await worker(cur);
    }
  });
  await Promise.all(runners);
}

async function sweepCustomPerkOwners(client?) {
  const gid = mainGuildId();
  if (!gid || !client) return { scanned: 0, ok: 0 };
  const docs = await ActivityUserProfile.find({
    guildId: gid,
    $or: [
      { "profile.customRole.roleId": { $ne: null } },
      { "profile.customRole.secondaryRoleId": { $ne: null } },
      { "profile.customRole.customVocChannelId": { $ne: null } },
    ],
  })
    .select("userId")
    .lean()
    .catch(() => []);

  const guild = await getClientGuildCached(client, gid);
  if (!guild) return { scanned: 0, ok: 0 };

  let ok = 0;
  await mapPool(docs, CONCURRENCY, async (doc?) => {
    const uid = String(doc?.userId || "").trim();
    if (!uid) return;
    const res = await persistUserFullState(gid, uid, {
      client,
      guild,
      reason: "sweep_custom_perks",
      skipHistory: true,
    }).catch(() => ({ ok: false }));
    if (res?.ok) ok += 1;
  });
  return { scanned: docs.length, ok };
}

async function sweepPersonalityHoldersFromCache(client?) {
  const gid = mainGuildId();
  if (!gid || !client) return { scanned: 0, ok: 0 };
  const guild = await getClientGuildCached(client, gid);
  if (!guild) return { scanned: 0, ok: 0 };

  const tracked = new Set(ALL_PERSONALITY_TRACKED_ROLE_IDS.map(String));
  const targets = [];
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    const hit = [...member.roles.cache.keys()].some((id?) => tracked.has(String(id)));
    if (hit) targets.push(member);
  }

  let ok = 0;
  await mapPool(targets, CONCURRENCY, async (member?) => {
    const res = await persistUserFullState(gid, member.id, {
      member,
      guild,
      client,
      reason: "sweep_personality_cache",
      skipHistory: true,
    }).catch(() => ({ ok: false }));
    if (res?.ok) ok += 1;
  });
  return { scanned: targets.length, ok };
}

async function loadMaintenanceTimestamps() {
  const gid = mainGuildId();
  if (!gid) return;
  const doc = await GlobalSettings.findOne({ guildId: gid })
    .select("userFullStateMaintenance")
    .lean()
    .catch(() => null);
  const fullMs = new Date(doc?.userFullStateMaintenance?.lastFullBackfillAt || 0).getTime();
  const lightMs = new Date(doc?.userFullStateMaintenance?.lastLightSweepAt || 0).getTime();
  if (Number.isFinite(fullMs) && fullMs > 0) lastFullBackfillAtMs = fullMs;
  if (Number.isFinite(lightMs) && lightMs > 0) lastLightSweepAtMs = lightMs;
}

async function saveMaintenanceTimestamps({ full = false, light = false } = {}) {
  const gid = mainGuildId();
  if (!gid) return;
  const $set: Record<string, any> = {};
  if (full) $set["userFullStateMaintenance.lastFullBackfillAt"] = new Date(lastFullBackfillAtMs || Date.now());
  if (light) $set["userFullStateMaintenance.lastLightSweepAt"] = new Date(lastLightSweepAtMs || Date.now());
  if (!Object.keys($set).length) return;
  await GlobalSettings.updateOne(
    { guildId: gid },
    { $set, $setOnInsert: { guildId: gid } },
    { upsert: true },
  ).catch(() => null);
}

async function runFullGuildMemberBackfill(client?) {
  const gid = mainGuildId();
  if (!gid || !client) return { scanned: 0, ok: 0 };
  const guild = await getClientGuildCached(client, gid);
  if (!guild) return { scanned: 0, ok: 0 };

  /* perfP1: full fetch solo se cache incompleta (evita spike RAM/API ogni backfill) */
  const memberCount = Math.max(0, Number(guild.memberCount) || 0);
  const cacheSize = guild.members.cache.size;
  const cacheRatio = memberCount > 0 ? cacheSize / memberCount : 1;
  if (cacheRatio < 0.85) {
    await guild.members.fetch().catch(() => null);
  }
  const humans = [...guild.members.cache.values()].filter((m?) => !m.user?.bot);
  let ok = 0;
  await mapPool(humans, CONCURRENCY, async (member?) => {
    const res = await persistUserFullState(gid, member.id, {
      member,
      guild,
      client,
      reason: "full_backfill",
      skipHistory: true,
    }).catch(() => ({ ok: false }));
    if (res?.ok) ok += 1;
  });
  lastFullBackfillAtMs = Date.now();
  await saveMaintenanceTimestamps({ full: true });
  return { scanned: humans.length, ok };
}

async function runUserFullStateSweep(client?, options: Record<string, any> = {}) {
  if (sweepBusy) return { skipped: true, reason: "busy" };
  sweepBusy = true;
  try {
    await loadMaintenanceTimestamps();

    const forceFull = options.forceFull === true || String(process.env.VC_FULL_STATE_BACKFILL || "").trim() === "1";
    const forceLight = options.forceLight === true;
    const now = Date.now();
    const lightDue =
      forceLight ||
      !lastLightSweepAtMs ||
      now - lastLightSweepAtMs >= LIGHT_SWEEP_MIN_INTERVAL_MS;
    const fullDue =
      forceFull ||
      !lastFullBackfillAtMs ||
      now - lastFullBackfillAtMs >= FULL_BACKFILL_MIN_INTERVAL_MS;

    if (!lightDue && !fullDue) {
      return {
        skipped: true,
        reason: "throttle",
        nextLightInMs: Math.max(0, LIGHT_SWEEP_MIN_INTERVAL_MS - (now - lastLightSweepAtMs)),
        nextFullInMs: Math.max(0, FULL_BACKFILL_MIN_INTERVAL_MS - (now - lastFullBackfillAtMs)),
      };
    }

    let custom = null;
    let personality = null;
    if (lightDue) {
      custom = await sweepCustomPerkOwners(client);
      personality = await sweepPersonalityHoldersFromCache(client);
      lastLightSweepAtMs = Date.now();
      await saveMaintenanceTimestamps({ light: true });
    }

    let full = null;
    if (fullDue) {
      full = await runFullGuildMemberBackfill(client);
      global.logger?.info?.(
        `[USER FULL STATE] full backfill scanned=${full.scanned} ok=${full.ok}`,
      );
    }

    return { custom, personality, full, skipped: false };
  } finally {
    sweepBusy = false;
  }
}

function startUserFullStatePersistenceLoop(client?) {
  /* perfP1: su COMMUNITY_POLL_EXTERNAL gira sul worker REST (members.fetch via API). */
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return null;
  if (!client) return null;
  if (loopHandle) return loopHandle;
  ensureUserFullStateShutdownFlush();

  setTimeout(() => {
    runUserFullStateSweep(client).catch((err?) => {
      global.logger?.warn?.("[USER FULL STATE] startup sweep failed:", err?.message || err);
    });
  }, 90_000).unref?.();

  loopHandle = setInterval(() => {
    runUserFullStateSweep(client).catch(() => {});
  }, SWEEP_INTERVAL_MS);
  loopHandle.unref?.();
  return loopHandle;
}

export = {
  persistUserFullState,
  schedulePersistUserFullState,
  startUserFullStatePersistenceLoop,
};
