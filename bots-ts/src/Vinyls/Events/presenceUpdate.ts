const { EmbedBuilder, PermissionsBitField, ActivityType } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { ensureMongoReady, isMongoTransientError } = require("../Utils/Database/mongoConnect") as typeof import("../Utils/Database/mongoConnect");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { shouldSendPublicMemberAnnouncement } = require("../Utils/Community/memberPublicAnnouncementGate") as typeof import("../Utils/Community/memberPublicAnnouncementGate");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { applyPronounGenderToEmbedForMember } = require("../Utils/Community/pronounGenderUtils") as typeof import("../Utils/Community/pronounGenderUtils");
const { syncPersistentAutoValutazioniForMember } = require("../Services/Staff/staffAutoValutazioniService") as typeof import("../Services/Staff/staffAutoValutazioniService");
const {
  textHasSupporterStatusLink,
  normalizeSupporterStatusText,
  SUPPORTER_STATUS_LINK_HINT_IT,
} = require("../Utils/Community/supporterStatusLink") as typeof import("../Utils/Community/supporterStatusLink");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const ROLE_ID = IDs.roles.Fan;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const CHANNEL_ID = IDs.channels.supporters;
const KNOWN_BOT_IDS = new Set(
  Object.values(IDs.bots || {})
    .map((id?) => String(id || "").trim())
    .filter(Boolean),
);

function isBotMember(member?) {
  if (!member) return true;
  if (KNOWN_BOT_IDS.has(String(member.id || ""))) return true;
  const user = member.user || member.client?.users?.cache?.get(member.id);
  if (user?.bot) return true;
  return false;
}

const statusCache = new Map();
const pendingChecks = new Map();
const removalChecks = new Map();
const bootstrappedUsers = new Set();
const PENDING_MS = 3 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;
const LINK_WARMUP_MS = 2 * 60 * 1000;
const REMOVE_CONFIRM_MS = 5 * 60 * 1000;
const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;
const STABLE_NO_INVITE_MS = 75 * 1000;

let bootstrapRan = false;
const cleanupIntervalsByGuild = new Map();

function makeStateKey(guildId?, userId?) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function isExpectedSupporterDmFailure(err?) {
  const code = Number(err?.code);
  const msg = String(err?.message || err || "").toLowerCase();
  if (code === 50007) return true;
  if (msg.includes("cannot send messages to this user")) return true;
  if (msg.includes("no mutual guilds")) return true;
  return false;
}

function getActivitiesArray(presence?) {
  const list = presence?.activities;
  return Array.isArray(list) ? list : [];
}

const RICH_PRESENCE_TYPES = new Set([ActivityType.Playing, ActivityType.Streaming, ActivityType.Listening, ActivityType.Watching]);

function hasRichPresenceWithoutCustom(presence?) {
  const list = getActivitiesArray(presence);
  if (!list.length) return false;
  let hasRich = false;
  let hasCustom = false;
  for (const a of list) {
    const t = Number(a?.type);
    if (t === ActivityType.Custom) hasCustom = true;
    if (RICH_PRESENCE_TYPES.has(t)) hasRich = true;
  }
  return hasRich && !hasCustom;
}

function collectActivitySearchStrings(activity?) {
  if (!activity || typeof activity !== "object") return [];
  const parts = [];
  const push = (v?) => {
    if (v == null || v === "") return;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) parts.push(t);
      return;
    }
    if (typeof v === "number" && Number.isFinite(v)) parts.push(String(v));
  };
  push(activity.state);
  push(activity.name);
  push(activity.details);
  push(activity.url);
  const assets = activity.assets;
  if (assets && typeof assets === "object") {
    push(assets.largeText);
    push(assets.smallText);
  }
  const btns = activity.buttons;
  if (Array.isArray(btns)) {
    for (const b of btns) {
      if (typeof b === "string") push(b);
      else if (b && typeof b === "object") {
        push(b.label);
        push(b.url);
      }
    }
  }
  return parts;
}

function normalizeStatusForMatch(text?) {
  return normalizeSupporterStatusText(text);
}

function allActivitiesSearchText(presence?) {
  const list = getActivitiesArray(presence);
  if (!list.length) return "";
  return list.flatMap((a?) => collectActivitySearchStrings(a)).join(" ");
}

function hasInvite(presence?) {
  const blob = normalizeStatusForMatch(allActivitiesSearchText(presence));
  return textHasSupporterStatusLink(blob);
}

function hasCustomActivity(presence?) {
  return getActivitiesArray(presence).some((a?) => Number(a?.type) === ActivityType.Custom);
}

function isCustomStatusTextMissing(presence?) {
  const customs = getActivitiesArray(presence).filter((a?) => Number(a?.type) === ActivityType.Custom);
  if (!customs.length) return false;
  for (const a of customs) {
    for (const raw of collectActivitySearchStrings(a)) {
      const t = normalizeStatusForMatch(raw).replace(/[^a-z0-9./]/g, "");
      if (!t || t === "customstatus") continue;
      return false;
    }
  }
  return true;
}

function getInviteState(presence?, prevHas = false) {
  if (!presence) return null;
  if (isOfflinePresence(presence)) return null;
  if (hasInvite(presence)) return true;
  if (!getActivitiesArray(presence).length && prevHas) return null;
  if (prevHas && hasRichPresenceWithoutCustom(presence)) return null;
    if (prevHas && hasCustomActivity(presence) && isCustomStatusTextMissing(presence)) return null;
  return false;
}

function readInvitePresence(presence?, assumeHadLink = false) {
  return getInviteState(presence, assumeHadLink);
}

function resolveInviteState(presence?, fallback = false) {
  const inviteState = getInviteState(presence, fallback);
  if (inviteState === null) return Boolean(fallback);
  return inviteState;
}

function computeSupporterLinkState(prev: Record<string, any> = {}, presence?) {
  const prevHas = typeof prev?.hasLink === "boolean" ? prev.hasLink : false;
  let inviteMissSince = prev?.inviteMissSince != null ? prev.inviteMissSince : null;

  if (!presence || isOfflinePresence(presence)) {
    return { newHas: prevHas, inviteMissSince };
  }

  const inviteState = getInviteState(presence, prevHas);
  if (inviteState === null) {
    return { newHas: prevHas, inviteMissSince };
  }
  if (inviteState === true) {
    return { newHas: true, inviteMissSince: null };
  }

  if (prevHas) {
    if (inviteMissSince == null) inviteMissSince = Date.now();
    if (Date.now() - inviteMissSince >= STABLE_NO_INVITE_MS) {
      return { newHas: false, inviteMissSince: null };
    }
    return { newHas: true, inviteMissSince };
  }

  return { newHas: false, inviteMissSince: null };
}

function isOfflinePresence(presence?) {
  return !presence || ["offline", "invisible"].includes(presence.status);
}

function withDefaultState(prev: Record<string, any> = {}) {
  return {
    hasLink: Boolean(prev.hasLink),
    lastAnnounced: prev.lastAnnounced || 0,
    lastMessageId: prev.lastMessageId || null,
    lastSeenOnlineAt: prev.lastSeenOnlineAt || 0,
  };
}

function getCachedState(guildId?, userId?) {
  return statusCache.get(makeStateKey(guildId, userId));
}

function setCachedState(guildId?, userId?, state?) {
  statusCache.set(makeStateKey(guildId, userId), state);
}

function deleteCachedState(guildId?, userId?) {
  statusCache.delete(makeStateKey(guildId, userId));
}

function getPendingState(guildId?, userId?) {
  return pendingChecks.get(makeStateKey(guildId, userId));
}

function setPendingState(guildId?, userId?, state?) {
  pendingChecks.set(makeStateKey(guildId, userId), state);
}

function deletePendingState(guildId?, userId?) {
  pendingChecks.delete(makeStateKey(guildId, userId));
}

function hasPendingState(guildId?, userId?) {
  return pendingChecks.has(makeStateKey(guildId, userId));
}

function getRemovalState(guildId?, userId?) {
  return removalChecks.get(makeStateKey(guildId, userId));
}

function setRemovalState(guildId?, userId?, state?) {
  removalChecks.set(makeStateKey(guildId, userId), state);
}

function deleteRemovalState(guildId?, userId?) {
  removalChecks.delete(makeStateKey(guildId, userId));
}

function hasRemovalState(guildId?, userId?) {
  return removalChecks.has(makeStateKey(guildId, userId));
}

function cancelScheduledRemoval(guildId?, userId?) {
  const st = getRemovalState(guildId, userId);
  if (st?.timeout) clearTimeout(st.timeout);
  deleteRemovalState(guildId, userId);
}

async function clearRemovalDue(guildId?, userId?) {
  cancelScheduledRemoval(guildId, userId);
  const info = getCachedState(guildId, userId);
  if (info && info.removalDueAt != null) {
    setCachedState(guildId, userId, { ...info, removalDueAt: null });
  }
  if (!isDbReady()) return;
  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $set: { "profile.supporterStatus.removalDueAt": null } },
  ).catch(() => null);
}

async function ensureRemovalDueAt(guildId?, userId?, existingDueAt = null) {
  const fromCache = getCachedState(guildId, userId)?.removalDueAt;
  let dueAt = Number(existingDueAt || fromCache || 0) || 0;
  if (dueAt > 0) return dueAt;
  dueAt = Date.now() + REMOVE_CONFIRM_MS;
  const info = getCachedState(guildId, userId) || {};
  setCachedState(guildId, userId, { ...info, hasLink: false, removalDueAt: dueAt });
  await persistStatus(guildId, userId, {
    hasLink: false,
    lastMessageId: info.lastMessageId || null,
    removalDueAt: dueAt,
  });
  return dueAt;
}

async function executeFanRemoval(member?, channel?) {
  if (!member || isBotMember(member)) return false;
  const guildId = member.guild.id;
  const userId = member.id;
  cancelScheduledRemoval(guildId, userId);

  const liveChannel = channel?.isTextBased?.() ? channel : await resolveSupportersChannel(member.guild);
  const cached = getCachedState(guildId, userId);
    if (!isOfflinePresence(member.presence)) {
    const inviteState = readInvitePresence(member.presence, true);
    if (inviteState === true) {
      const info = cached || {};
      setCachedState(guildId, userId, {
        hasLink: true,
        lastAnnounced: info.lastAnnounced || 0,
        lastMessageId: info.lastMessageId || null,
        lastSeenOnlineAt: info.lastSeenOnlineAt || Date.now(),
        inviteMissSince: null,
        removalDueAt: null,
      });
      await clearRemovalDue(guildId, userId);
      await persistStatus(guildId, userId, { hasLink: true, lastMessageId: info.lastMessageId || null });
      return false;
    }
    if (inviteState === null) {
            const dueAt = Date.now() + REMOVE_CONFIRM_MS;
      const info = cached || getCachedState(guildId, userId) || {};
      setCachedState(guildId, userId, {
        ...info,
        hasLink: true,
        inviteMissSince: null,
        removalDueAt: dueAt,
      });
      await persistStatus(guildId, userId, {
        hasLink: true,
        lastMessageId: info.lastMessageId || null,
        removalDueAt: dueAt,
      });
      scheduleRemovalConfirm(member, liveChannel, { forceReschedule: true, removalDueAt: dueAt });
      return false;
    }
  }

  const removed = await removeRoleIfPossible(member);
  if (!removed && !(await hasFanRole(member))) {
      } else if (!removed) {
    return false;
  }

  try {
    const { tryRevokePicPermsIfIneligible } = require("../Utils/Community/manualSocialRoleAnnounceAndPicPerms") as typeof import("../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
    const freshAfterFan = (await refreshMember(member.guild, member.id)) || member;
    await tryRevokePicPermsIfIneligible(freshAfterFan);
  } catch (err) {
    global.logger?.warn?.("[presenceUpdate] picPerms revoke after fan removal:", err?.message || err);
  }

  try {
    await member.send(
      "Hai rimosso il link dallo status: hai perso i tuoi perks. Per riaverli, rimetti il link nel tuo status.",
    );
  } catch (err) {
    if (!isExpectedSupporterDmFailure(err)) {
      global.logger?.warn?.("[presenceUpdate] dm send:", err?.message || err);
    }
  }
  const info = cached || getCachedState(guildId, userId);
  if (info?.lastMessageId && liveChannel?.isTextBased?.()) {
    await liveChannel.messages.delete(info.lastMessageId).catch(() => { });
  }
  setCachedState(guildId, userId, {
    hasLink: false,
    lastAnnounced: info?.lastAnnounced || 0,
    lastMessageId: null,
    lastSeenOnlineAt: info?.lastSeenOnlineAt || 0,
    inviteMissSince: null,
    removalDueAt: null,
  });
  await clearPersistedStatus(guildId, userId);
  return true;
}

function scheduleRemovalConfirm(member?, channel?, opts: Record<string, any> = {}) {
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasRemovalState(guildId, userId) && !opts.forceReschedule) return;

  void (async () => {
    const dueAt = await ensureRemovalDueAt(guildId, userId, opts.removalDueAt);
    const waitMs = Math.max(0, dueAt - Date.now());

    if (hasRemovalState(guildId, userId) && !opts.forceReschedule) return;

    const run = async () => {
      deleteRemovalState(guildId, userId);
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) return;
      await executeFanRemoval(freshMember, channel);
    };

        if (waitMs <= 0) {
      await run();
      return;
    }

    const timeout = setTimeout(() => {
      void run();
    }, waitMs);
    timeout.unref?.();
    setRemovalState(guildId, userId, { timeout, dueAt });
  })();
}

function getBootstrapKey(guildId?, userId?) {
  return makeStateKey(guildId, userId);
}

function canManageRoles(member?) {
  const me = member.guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

async function addRoleIfPossible(member?) {
  if (!member || isBotMember(member)) return false;
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot member not cached; cannot add supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger?.warn?.(
      "[presenceUpdate] Missing Manage Roles permission; cannot add supporter role.",
    );
    return false;
  }

  let role = member.guild.roles.cache.get(ROLE_ID) || await member.guild.roles.fetch(ROLE_ID).catch(() => null);
  if (!role) {
    global.logger?.warn?.("[presenceUpdate] Fan role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot role hierarchy prevents adding supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (member.roles.cache.has(ROLE_ID)) return false;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (!added) {
    const refreshedMember = await refreshMember(member.guild, member.id);
    if (!refreshedMember?.roles?.cache?.has(ROLE_ID)) return false;
  }
  return true;
}

async function addPerkRoleIfPossible(member?) {
  if (!member || isBotMember(member)) return false;
  if (!PERK_ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) return false;
  if (!canManageRoles(member)) return false;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return false;
  if (role.position >= me.roles.highest.position) return false;
  if (member.roles.cache.has(PERK_ROLE_ID)) return false;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (added) return true;
  const refreshedMember = await refreshMember(member.guild, member.id);
  return Boolean(refreshedMember?.roles?.cache?.has(PERK_ROLE_ID));
}

async function removeRoleIfPossible(member?) {
  if (!ROLE_ID) return false;
  const me = member.guild.members.me;
  if (!me) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot member not cached; cannot remove supporter role.",
    );
    return false;
  }
  if (!canManageRoles(member)) {
    global.logger?.warn?.(
      "[presenceUpdate] Missing Manage Roles permission; cannot remove supporter role.",
    );
    return false;
  }

  let role = member.guild.roles.cache.get(ROLE_ID) || await member.guild.roles.fetch(ROLE_ID).catch(() => null);
  if (!role) {
    global.logger?.warn?.("[presenceUpdate] Fan role not found:", ROLE_ID);
    return false;
  }
  if (role.position >= me.roles.highest.position) {
    global.logger?.warn?.(
      "[presenceUpdate] Bot role hierarchy prevents removing supporter role:",
      ROLE_ID,
    );
    return false;
  }
  if (!member.roles.cache.has(ROLE_ID)) return false;

  const removed = await member.roles.remove(role).then(() => true).catch(() => false);
  if (removed) return true;
  const refreshedMember = await refreshMember(member.guild, member.id);
  return !refreshedMember?.roles?.cache?.has(ROLE_ID);
}

function recentlyOnline(info?) {
  if (!info?.lastSeenOnlineAt) return false;
  return Date.now() - info.lastSeenOnlineAt < LINK_WARMUP_MS;
}

async function hasFanRole(member?) {
  if (member.roles?.cache?.has(ROLE_ID)) return true;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  return fresh?.roles?.cache?.has(ROLE_ID) || false;
}

async function clearPending(guildId?, userId?, channel?) {
  const pending = getPendingState(guildId, userId);
  if (!pending) return;

  if (pending.timeout) clearTimeout(pending.timeout);
  if (pending.messageId && channel?.isTextBased?.()) {
    await channel.messages.delete(pending.messageId).catch(() => { });
  }
  deletePendingState(guildId, userId);
}

async function resolveSupportersChannel(guild?) {
  if (!guild || !CHANNEL_ID) return null;
  return guild.channels.cache.get(CHANNEL_ID) || (await getGuildChannelCached(guild, CHANNEL_ID));
}

async function refreshMember(guild?, userId?) {
  if (!guild || !userId) return null;
  return getGuildMemberCached(guild, userId);
}

/* perfP0: coalesce presence→Mongo (presence è alto volume) */
const PERSIST_DEBOUNCE_MS = Math.max(500, Number(process.env.VC_PRESENCE_PERSIST_DEBOUNCE_MS || 2500) || 2500);
const pendingPersistByKey = new Map();

async function flushPersistStatus(guildId?, userId?, payload?) {
  if (!isDbReady()) return;
  const $set = {
    "profile.supporterStatus.hasLink": Boolean(payload?.hasLink),
    "profile.supporterStatus.lastMessageId": payload?.lastMessageId || null,
  };
  if (payload?.lastSentAt) $set["profile.supporterStatus.lastSentAt"] = payload.lastSentAt;
  if (payload?.removalDueAt === null) {
    $set["profile.supporterStatus.removalDueAt"] = null;
  } else if (payload?.removalDueAt != null) {
    $set["profile.supporterStatus.removalDueAt"] = new Date(payload.removalDueAt);
  }
  const update = () => ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set,
    },
    { upsert: true },
  );
  try {
    await update();
  } catch (error) {
    if (isMongoTransientError(error)) {
      await ensureMongoReady({ maxWaitMs: 3000 }).catch(() => false);
      try {
        await update();
        return;
      } catch (retryErr) {
        if (!isMongoTransientError(retryErr)) {
          global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", retryErr?.message || retryErr);
          return;
        }
      }
      global.logger?.warn?.("[SUPPORTER STATUS] Persist skipped (MongoDB timeout), will retry on next update.");
      return;
    }
    global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", error?.message || error);
  }
}

async function persistStatus(guildId?, userId?, payload?, { immediate = false } = {}) {
  if (!guildId || !userId) return;
  const key = makeStateKey(guildId, userId);
  const prev = pendingPersistByKey.get(key);
  const merged = {
    ...(prev?.payload || {}),
    ...(payload || {}),
  };
  const urgent =
    immediate ||
    Boolean(payload?.lastSentAt) ||
    (typeof payload?.lastMessageId === "string" && payload.lastMessageId.length > 0);
  if (urgent) {
    if (prev?.timer) clearTimeout(prev.timer);
    pendingPersistByKey.delete(key);
    await flushPersistStatus(guildId, userId, merged);
    return;
  }
  if (prev?.timer) clearTimeout(prev.timer);
  const timer = setTimeout(() => {
    pendingPersistByKey.delete(key);
    void flushPersistStatus(guildId, userId, merged);
  }, PERSIST_DEBOUNCE_MS);
  timer.unref?.();
  pendingPersistByKey.set(key, { payload: merged, timer });
}

async function clearPersistedStatus(guildId?, userId?) {
  if (!isDbReady()) return;
  const key = makeStateKey(guildId, userId);
  const pending = pendingPersistByKey.get(key);
  if (pending?.timer) clearTimeout(pending.timer);
  pendingPersistByKey.delete(key);
  const update = () => ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $set: {
        "profile.supporterStatus.hasLink": false,
        "profile.supporterStatus.lastMessageId": null,
        "profile.supporterStatus.lastSentAt": null,
        "profile.supporterStatus.removalDueAt": null,
      },
    },
  );
  try {
    await update();
  } catch (error) {
    if (isMongoTransientError(error)) {
      await ensureMongoReady({ maxWaitMs: 3000 }).catch(() => false);
      try {
        await update();
        return;
      } catch (retryErr) {
        if (!isMongoTransientError(retryErr)) {
          global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", retryErr?.message || retryErr);
          return;
        }
      }
      global.logger?.warn?.("[SUPPORTER STATUS] Delete skipped (MongoDB timeout).");
      return;
    }
    global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", error?.message || error);
  }
}

async function getPersistedStatus(guildId?, userId?) {
  if (!isDbReady() || !guildId || !userId) return null;
  try {
    const doc = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.supporterStatus")
      .lean();
    if (!doc?.profile?.supporterStatus) return null;
    const dueRaw = doc.profile.supporterStatus.removalDueAt;
    const dueMs = dueRaw ? new Date(dueRaw).getTime() : 0;
    return {
      hasLink: Boolean(doc.profile.supporterStatus.hasLink),
      lastMessageId: doc.profile.supporterStatus.lastMessageId || null,
      lastSentAt: doc.profile.supporterStatus.lastSentAt || null,
      removalDueAt: Number.isFinite(dueMs) && dueMs > 0 ? dueMs : null,
    };
  } catch {
    return null;
  }
}

function buildPendingEmbed(member?) {
  const thumb = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: accountUsername(member),
      iconURL: thumb || undefined,
    })
    .setTitle("Nuovx Fan <a:VC_StarPink:1330194976440848500>")
    .setThumbnail(thumb || null)
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        "<:VC_Reply:1482532158080942191> Ti verrà dato entro **3 minuti** dal bot!",
        "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
        "<a:VC_HeartWhite:1448673535253024860> - Permesso di cambiare nickname",
        "",
        `<a:VC_Arrow:1482706699365257397> Metti ${SUPPORTER_STATUS_LINK_HINT_IT} nel tuo status.`,
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });
  return applyPronounGenderToEmbedForMember(embed, member);
}

async function scheduleSupporterRoleGrantWithoutChannelEmbed(member?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasPendingState(guildId, userId)) return;

  setPendingState(guildId, userId, {
    timeout: null,
    messageId: null,
    inFlight: true,
  });

  const timeout = setTimeout(async () => {
    try {
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) {
        deletePendingState(guildId, userId);
        return;
      }
      const cached = getCachedState(guildId, userId);
      const stillHasInvite = computeSupporterLinkState(cached || { hasLink: true }, freshMember.presence).newHas;
      if (!stillHasInvite) {
        deletePendingState(guildId, userId);
        const current = getCachedState(guildId, userId);
        setCachedState(guildId, userId, {
          hasLink: false,
          lastAnnounced: current?.lastAnnounced || 0,
          lastMessageId: null,
          lastSeenOnlineAt: current?.lastSeenOnlineAt || 0,
          inviteMissSince: null,
        });
        return;
      }
      await addRoleIfPossible(freshMember);
      deletePendingState(guildId, userId);
    } catch (_) {
      deletePendingState(guildId, userId);
    }
  }, PENDING_MS);
  timeout.unref?.();

  setPendingState(guildId, userId, { timeout, messageId: null, inFlight: false });
  await persistStatus(guildId, userId, { hasLink: true, lastMessageId: null });
}

async function startPendingFlow(member?, channel?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasPendingState(guildId, userId)) return;

  const existing = getCachedState(guildId, userId);
  let sent = null;
  const botId = member.client.user?.id;

  if (existing?.lastMessageId && channel?.isTextBased?.() && botId) {
    try {
      const fetched = await channel.messages.fetch(existing.lastMessageId);
      if (fetched && String(fetched.author?.id) === String(botId)) {
        sent = fetched;
      }
    } catch (_) { }
  }

  if (!sent) {
    setPendingState(guildId, userId, { timeout: null, messageId: null, inFlight: true });

    sent = await channel
      .send({
        content: `<@${userId}>`,
        embeds: [buildPendingEmbed(member)],
      })
      .catch(() => null);
  } else {
    await sent
      .edit({
        content: `<@${userId}>`,
        embeds: [buildPendingEmbed(member)],
      })
      .catch(() => { });
    setPendingState(guildId, userId, { timeout: null, messageId: sent.id, inFlight: true });
  }

  if (sent) {
    const timeout = setTimeout(async () => {
      const freshMember = await refreshMember(member.guild, userId);
      if (!freshMember) {
        deletePendingState(guildId, userId);
        return;
      }
      const liveChannel = await resolveSupportersChannel(member.guild);
      const cached = getCachedState(guildId, userId);
      const stillHasInvite = computeSupporterLinkState(cached || { hasLink: true }, freshMember.presence).newHas;
      if (!stillHasInvite) {
        if (liveChannel?.isTextBased?.()) await liveChannel.messages.delete(sent.id).catch(() => { });
        deletePendingState(guildId, userId);
        const current = getCachedState(guildId, userId);
        setCachedState(guildId, userId, {
          hasLink: false,
          lastAnnounced: current?.lastAnnounced || 0,
          lastMessageId: null,
          lastSeenOnlineAt: current?.lastSeenOnlineAt || 0,
          inviteMissSince: null,
        });
        return;
      }
      await addRoleIfPossible(freshMember);
      deletePendingState(guildId, userId);
    }, PENDING_MS);
    timeout.unref?.();
    setPendingState(guildId, userId, { timeout, messageId: sent.id, inFlight: false });
  } else {
    deletePendingState(guildId, userId);
  }

  const current = getCachedState(guildId, userId);
  setCachedState(guildId, userId, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: sent?.id || null, lastSeenOnlineAt: current?.lastSeenOnlineAt || Date.now(), inviteMissSince: null });
  await persistStatus(guildId, userId, { hasLink: true, lastMessageId: sent?.id || null, lastSentAt: new Date() });
}

async function recoverSupporterStatusAnnouncesOnStartup(client?, opts: Record<string, any> = {}) {
  const { isRecoveryPrimaryShard, recoverySleep } = require("../Utils/Community/supportersChannelEmbedRecoveryUtils") as typeof import("../Utils/Community/supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!MAIN_GUILD_ID) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const channel = await resolveSupportersChannel(guild);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "no_channel" };
  const limit = Math.max(1, Math.min(30, Number(opts.limit || 15)));
  const botId = String(client.user?.id || "");
  let docs = [];
  if (isDbReady()) {
    docs = await ActivityUserProfile.find({
      guildId: MAIN_GUILD_ID,
      "profile.supporterStatus.hasLink": true,
    })
      .select("userId profile.supporterStatus")
      .limit(250)
      .lean()
      .catch(() => []);
  }
  let recovered = 0;
  for (const doc of docs) {
    if (recovered >= limit) break;
    const uid = String(doc?.userId || "");
    if (!uid) continue;
    const lastMessageId = doc?.profile?.supporterStatus?.lastMessageId || null;
    let needsRecovery = !lastMessageId;
    if (lastMessageId) {
      try {
        const msg = await channel.messages.fetch(lastMessageId);
        if (!msg || String(msg.author?.id) !== botId) needsRecovery = true;
      } catch {
        needsRecovery = true;
      }
    }
    if (!needsRecovery) continue;
    const { botSupportersEmbedExistsForUser, EMBED_DEDUPE_LOOKBACK_MS } = require("../Utils/Community/supportersChannelEmbedRecoveryUtils") as typeof import("../Utils/Community/supportersChannelEmbedRecoveryUtils");
    const fanEmbedExists = await botSupportersEmbedExistsForUser(
      channel,
      uid,
      botId,
      Date.now() - EMBED_DEDUPE_LOOKBACK_MS,
      (blob?) => /Nuov\w* Fan/i.test(blob),
    );
    if (fanEmbedExists) {
      setCachedState(guild.id, uid, {
        hasLink: true,
        lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : Date.now(),
        lastMessageId: lastMessageId || null,
        lastSeenOnlineAt: Date.now(),
        inviteMissSince: null,
      });
      continue;
    }
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member || isBotMember(member)) continue;
    if (isOfflinePresence(member.presence)) continue;
    if (!hasInvite(member.presence)) continue;
    if (hasPendingState(guild.id, uid)) continue;
    setCachedState(guild.id, uid, {
      hasLink: true,
      lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : 0,
      lastMessageId: needsRecovery && lastMessageId ? null : lastMessageId,
      lastSeenOnlineAt: Date.now(),
      inviteMissSince: null,
    });
    if (await shouldSendPublicMemberAnnouncement(member)) {
      await startPendingFlow(member, channel);
      recovered += 1;
      global.logger?.info?.("[supporter-status-recovery] pending flow:", uid);
      await recoverySleep(450);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(member);
    }
  }
  if (recovered > 0) global.logger?.info?.("[supporter-status-recovery] done:", recovered);
  return { ok: true, recovered };
}

async function bootstrapSupporter(client?) {
  if (bootstrapRan) return;
  bootstrapRan = true;
  if (!MAIN_GUILD_ID) return;
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return;

  const guildId = guild.id;
  const channel = await resolveSupportersChannel(guild);
  if (!channel) return;

  let persisted = [];
  if (isDbReady()) {
    try {
      persisted = await ActivityUserProfile.find({
        guildId,
        $or: [
          { "profile.supporterStatus.hasLink": true },
          { "profile.supporterStatus.lastMessageId": { $ne: null } },
          { "profile.supporterStatus.removalDueAt": { $ne: null } },
        ],
      })
        .select("userId profile.supporterStatus")
        .lean();
    } catch {
      persisted = [];
    }
  }

  for (const doc of persisted) {
    if (!doc?.userId) continue;
    const userId = String(doc.userId);
    bootstrappedUsers.add(getBootstrapKey(guildId, userId));
    const dueRaw = doc?.profile?.supporterStatus?.removalDueAt;
    const dueMs = dueRaw ? new Date(dueRaw).getTime() : 0;
    setCachedState(guildId, userId, {
      hasLink: Boolean(doc?.profile?.supporterStatus?.hasLink),
      lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : 0,
      lastMessageId: doc?.profile?.supporterStatus?.lastMessageId || null,
      lastSeenOnlineAt: 0,
      removalDueAt: Number.isFinite(dueMs) && dueMs > 0 ? dueMs : null,
    });
  }

  await guild.members.fetch({ withPresences: true }).catch(() => null);
  for (const member of guild.members.cache.values()) {
    if (isBotMember(member)) continue;
            const freshMember = member;
    if (!freshMember || isBotMember(freshMember)) continue;

    const online = !isOfflinePresence(freshMember.presence);
        const inviteState = readInvitePresence(freshMember.presence, true);
    const inviteOk = inviteState === true;
    const inviteMissing = inviteState === false;
    const hasFan = freshMember.roles.cache.has(ROLE_ID);
    const existing = getCachedState(guildId, freshMember.id) || {};
    const dueAt = Number(existing.removalDueAt || 0) || 0;

        if (hasFan && dueAt > 0 && dueAt <= Date.now() && !(online && !inviteMissing)) {
      await executeFanRemoval(freshMember, channel);
      continue;
    }

        if (online && hasFan && inviteMissing) {
      setCachedState(guildId, freshMember.id, {
        hasLink: false,
        lastAnnounced: existing.lastAnnounced || 0,
        lastMessageId: existing.lastMessageId || null,
        lastSeenOnlineAt: existing.lastSeenOnlineAt || Date.now(),
        inviteMissSince: existing.inviteMissSince != null ? existing.inviteMissSince : Date.now(),
        removalDueAt: existing.removalDueAt || null,
      });
      if (!hasPendingState(guildId, freshMember.id)) {
        scheduleRemovalConfirm(freshMember, channel, { removalDueAt: existing.removalDueAt || null });
      }
      continue;
    }

    if (online && inviteOk) {
      await clearRemovalDue(guildId, freshMember.id);
    }

    if (!online || !inviteOk) continue;

    if (hasFan) continue;
    if (hasPendingState(guildId, freshMember.id)) continue;

    if (existing?.lastMessageId) continue;

    if (await shouldSendPublicMemberAnnouncement(freshMember)) {
      await startPendingFlow(freshMember, channel);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(freshMember);
    }
  }
  startCleanupClock(client, guildId);
}

function startCleanupClock(client?, guildId?) {
  if (!client || !guildId) return;
  if (cleanupIntervalsByGuild.has(guildId)) return;

  const interval = setInterval(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = await resolveSupportersChannel(guild);

        if (ROLE_ID) {
      for (const member of guild.members.cache.values()) {
        if (isBotMember(member)) continue;
        if (!member.roles?.cache?.has(ROLE_ID)) continue;
        if (hasPendingState(guildId, member.id)) continue;

        const online = !isOfflinePresence(member.presence);
                const inviteState = readInvitePresence(member.presence, true);
        if (inviteState === true) {
          await clearRemovalDue(guildId, member.id);
          continue;
        }
                if (inviteState === null) continue;

        const existing = getCachedState(guildId, member.id) || {};
        const dueAt = Number(existing.removalDueAt || 0) || 0;

                if (!online && dueAt > 0 && dueAt <= Date.now()) {
          await executeFanRemoval(member, channel);
          continue;
        }
        if (!online) continue;

                setCachedState(guildId, member.id, {
          hasLink: false,
          lastAnnounced: existing.lastAnnounced || 0,
          lastMessageId: existing.lastMessageId || null,
          lastSeenOnlineAt: Date.now(),
          inviteMissSince: existing.inviteMissSince != null ? existing.inviteMissSince : Date.now(),
          removalDueAt: existing.removalDueAt || null,
        });
        await clearPending(guildId, member.id, channel);
        scheduleRemovalConfirm(member, channel, { removalDueAt: existing.removalDueAt || null });
      }
    }

    for (const [stateKey, info] of statusCache.entries()) {
      if (!stateKey.startsWith(`${guildId}:`)) continue;
      const [, userId] = stateKey.split(":");
      const shouldCheck = info?.hasLink || info?.lastMessageId;
      if (!shouldCheck) continue;

      const member = await getGuildMemberCached(guild, userId);
      if (!member) continue;
      if (isOfflinePresence(member.presence)) continue;
      if (hasPendingState(guildId, userId)) continue;

      const { newHas, inviteMissSince: nextMiss } = computeSupporterLinkState(info, member.presence);
      if (nextMiss !== info?.inviteMissSince) {
        setCachedState(guildId, userId, { hasLink: info.hasLink, lastAnnounced: info.lastAnnounced || 0, lastMessageId: info.lastMessageId || null, lastSeenOnlineAt: info.lastSeenOnlineAt || 0, inviteMissSince: nextMiss });
      }
      if (!info?.hasLink || newHas || recentlyOnline(info)) continue;
      await clearPending(guildId, userId, channel);
      scheduleRemovalConfirm(member, channel);
    }
  }, CLEANUP_MS);

  if (typeof interval.unref === "function") interval.unref();
  cleanupIntervalsByGuild.set(guildId, interval);
}

async function applyOnlineState(member?, userId?, prev?, prevHas?, presenceFresh?) {
  if (!member || isBotMember(member)) return;
  const guildId = member.guild.id;
  const presence = presenceFresh || member.presence;
  const effectivePrev = prev != null ? prev : { hasLink: Boolean(prevHas) };
    const linkPrev = {
    ...effectivePrev,
    hasLink:
      Boolean(effectivePrev?.hasLink) ||
      Boolean(prevHas) ||
      Boolean(member.roles?.cache?.has(ROLE_ID)),
  };
  const { newHas, inviteMissSince } = computeSupporterLinkState(linkPrev, presence);
  const lastSeenOnlineAt = Date.now();

  if (newHas) {
    await clearRemovalDue(guildId, userId);
  }

  if (newHas && member.roles.cache.has(ROLE_ID)) {
    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (newHas && (await hasFanRole(member))) {
    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (!prevHas && newHas) {
    if (hasPendingState(guildId, userId)) return;
    if (prev?.lastMessageId) return;
    if (prev?.lastAnnounced && Date.now() - prev.lastAnnounced < ANNOUNCE_COOLDOWN_MS) {
      return;
    }

    if (await hasFanRole(member)) {
      setCachedState(guildId, userId, { hasLink: true, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
      await persistStatus(guildId, userId, { hasLink: true, lastMessageId: prev?.lastMessageId || null });
      await addPerkRoleIfPossible(member);
      return;
    }

    setCachedState(guildId, userId, { hasLink: true, lastAnnounced: Date.now(), lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });

    const channel = await resolveSupportersChannel(member.guild);
    if (!channel) return;
    if (await shouldSendPublicMemberAnnouncement(member)) {
      await startPendingFlow(member, channel);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(member);
    }
    await addPerkRoleIfPossible(member);
    return;
  }

  if (prevHas && !newHas) {
    const channel = await resolveSupportersChannel(member.guild);
    await clearPending(guildId, userId, channel);

    setCachedState(guildId, userId, { hasLink: false, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: null });
    await persistStatus(guildId, userId, { hasLink: false, lastMessageId: prev?.lastMessageId || null });
    scheduleRemovalConfirm(member, channel);
    return;
  }

    if (!newHas && (member.roles.cache.has(ROLE_ID) || (await hasFanRole(member)))) {
    const channel = await resolveSupportersChannel(member.guild);
    await clearPending(guildId, userId, channel);
    setCachedState(guildId, userId, {
      hasLink: false,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: inviteMissSince != null ? inviteMissSince : Date.now(),
    });
    await persistStatus(guildId, userId, { hasLink: false, lastMessageId: prev?.lastMessageId || null });
    scheduleRemovalConfirm(member, channel);
    return;
  }

  setCachedState(guildId, userId, { hasLink: newHas, lastAnnounced: prev?.lastAnnounced || 0, lastMessageId: prev?.lastMessageId || null, lastSeenOnlineAt, inviteMissSince: inviteMissSince != null ? inviteMissSince : null });
  await persistStatus(guildId, userId, { hasLink: newHas, lastMessageId: prev?.lastMessageId || null });
}

export = {
  name: "presenceUpdate",
  async execute(oldPresence?, newPresence?) {
    try {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || isBotMember(member)) return;
      if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;

      startCleanupClock(member.client, member.guild.id);

      const guildId = member.guild.id;
      const userId = member.id;
      let prev = getCachedState(guildId, userId);
      if (!prev) {
        const persisted = await getPersistedStatus(guildId, userId);
        if (persisted) {
          prev = {
            hasLink: Boolean(persisted.hasLink),
            lastAnnounced: persisted.lastSentAt
              ? new Date(persisted.lastSentAt).getTime()
              : 0,
            lastMessageId: persisted.lastMessageId || null,
            lastSeenOnlineAt: 0,
            inviteMissSince: null,
            removalDueAt: persisted.removalDueAt || null,
          };
          setCachedState(guildId, userId, prev);
        }
      }

      const prevHas = typeof prev?.hasLink === "boolean" ? prev.hasLink : resolveInviteState(oldPresence, false);

      if (isOfflinePresence(newPresence)) {
        if (!getCachedState(guildId, userId)) {
          setCachedState(
            guildId,
            userId,
            withDefaultState({
              hasLink: prevHas,
              lastAnnounced: prev?.lastAnnounced,
              lastSeenOnlineAt: prev?.lastSeenOnlineAt,
            }),
          );
        }
        return;
      }

      await applyOnlineState(member, userId, prev, prevHas, newPresence);
      {
        const nowHasVanity = resolveInviteState(newPresence, false);
        const vanityJustAdded = !prevHas && nowHasVanity;
        await syncPersistentAutoValutazioniForMember(member, {
          allowCreate: vanityJustAdded,
          createKeys: vanityJustAdded ? new Set(["supporto_vanity_supporter_clantag"]) : null,
          allowRemove: false,
        }).catch((err?) => {
          global.logger?.warn?.("[presenceUpdate] staff auto valutazioni sync:", member.id, err?.message || err);
        });
      }
    } catch (error) {
      global.logger?.error?.("[presenceUpdate] failed:", error);
    }
  },
  bootstrapSupporter,
  recoverSupporterStatusAnnouncesOnStartup,
  resolveInviteState,
};