const { EmbedBuilder, PermissionsBitField, ActivityType } = require("discord.js");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const mongoose = require("mongoose");
const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas");
const IDs = require("../Utils/Config/ids");
const { shouldSendPublicMemberAnnouncement } = require("../Utils/Community/memberPublicAnnouncementGate");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const ROLE_ID = IDs.roles.Fan;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const CHANNEL_ID = IDs.channels.supporters;
const INVITE_REGEX = /(?:discord\.gg|dsc\.gg|\.gg|discord\.com\/invite|discord\.me)\s*(?:\/|\\)?\s*viniliecaff[eèé]/i;

const statusCache = new Map();
const pendingChecks = new Map();
const removalChecks = new Map();
const bootstrappedUsers = new Set();

const PENDING_MS = 3 * 60 * 1000;
const CLEANUP_MS = 60 * 1000;
const LINK_WARMUP_MS = 2 * 60 * 1000;
const REMOVE_CONFIRM_MS = 5 * 60 * 1000;
const ANNOUNCE_COOLDOWN_MS = 30 * 60 * 1000;
/** Assenza del link nello status deve restare stabile così a lungo prima di considerarla reale (payload presenza spesso parziale). */
const STABLE_NO_INVITE_MS = 75 * 1000;

let bootstrapRan = false;
const cleanupIntervalsByGuild = new Map();

function makeStateKey(guildId, userId) {
  return `${String(guildId || "")}:${String(userId || "")}`;
}

function isDbReady() {
  return mongoose.connection?.readyState === 1;
}

function isExpectedSupporterDmFailure(err) {
  const code = Number(err?.code);
  const msg = String(err?.message || err || "").toLowerCase();
  if (code === 50007) return true;
  if (msg.includes("cannot send messages to this user")) return true;
  if (msg.includes("no mutual guilds")) return true;
  return false;
}

function getActivitiesArray(presence) {
  const list = presence?.activities;
  return Array.isArray(list) ? list : [];
}

/** Playing / Streaming / Listening / Watching: gli aggiornamento episodio possono arrivare senza il Custom Status nel payload. */
const RICH_PRESENCE_TYPES = new Set([
  ActivityType.Playing,
  ActivityType.Streaming,
  ActivityType.Listening,
  ActivityType.Watching,
]);

function hasRichPresenceWithoutCustom(presence) {
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

function collectActivitySearchStrings(activity) {
  if (!activity || typeof activity !== "object") return [];
  const parts = [];
  const push = (v) => {
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

function normalizeStatusForMatch(text) {
  return String(text || "")
    .replace(/\u2044|\u2215/g, "/")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .toLowerCase();
}

function allActivitiesSearchText(presence) {
  const list = getActivitiesArray(presence);
  if (!list.length) return "";
  return list.flatMap((a) => collectActivitySearchStrings(a)).join(" ");
}

function hasInvite(presence) {
  const blob = normalizeStatusForMatch(allActivitiesSearchText(presence));
  return INVITE_REGEX.test(blob);
}

function getInviteState(presence, prevHas = false) {
  if (!presence) return null;
  if (isOfflinePresence(presence)) return null;
  if (hasInvite(presence)) return true;
  // Cambio client (es. desktop ↔ mobile): Discord può mandare presenza online con
  // activities vuote per un attimo; non trattare come "nessun link" per evitare
  // spam di annunci / rimozioni ruolo.
  if (!getActivitiesArray(presence).length && prevHas) return null;
  // Aggiornamento Watching/Playing/Listening: spesso il payload non include il Custom Status
  // per un evento; senza questo si toglieva e rimetteva il ruolo Fan a ogni episodio.
  if (prevHas && hasRichPresenceWithoutCustom(presence)) return null;
  return false;
}

function resolveInviteState(presence, fallback = false) {
  const inviteState = getInviteState(presence, fallback);
  if (inviteState === null) return Boolean(fallback);
  return inviteState;
}

function computeSupporterLinkState(prev = {}, presence) {
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

function isOfflinePresence(presence) {
  return !presence || ["offline", "invisible"].includes(presence.status);
}

function withDefaultState(prev = {}) {
  return {
    hasLink: Boolean(prev.hasLink),
    lastAnnounced: prev.lastAnnounced || 0,
    lastMessageId: prev.lastMessageId || null,
    lastSeenOnlineAt: prev.lastSeenOnlineAt || 0,
  };
}

function getCachedState(guildId, userId) {
  return statusCache.get(makeStateKey(guildId, userId));
}

function setCachedState(guildId, userId, state) {
  statusCache.set(makeStateKey(guildId, userId), state);
}

function deleteCachedState(guildId, userId) {
  statusCache.delete(makeStateKey(guildId, userId));
}

function getPendingState(guildId, userId) {
  return pendingChecks.get(makeStateKey(guildId, userId));
}

function setPendingState(guildId, userId, state) {
  pendingChecks.set(makeStateKey(guildId, userId), state);
}

function deletePendingState(guildId, userId) {
  pendingChecks.delete(makeStateKey(guildId, userId));
}

function hasPendingState(guildId, userId) {
  return pendingChecks.has(makeStateKey(guildId, userId));
}

function getRemovalState(guildId, userId) {
  return removalChecks.get(makeStateKey(guildId, userId));
}

function setRemovalState(guildId, userId, state) {
  removalChecks.set(makeStateKey(guildId, userId), state);
}

function deleteRemovalState(guildId, userId) {
  removalChecks.delete(makeStateKey(guildId, userId));
}

function hasRemovalState(guildId, userId) {
  return removalChecks.has(makeStateKey(guildId, userId));
}

function cancelScheduledRemoval(guildId, userId) {
  const st = getRemovalState(guildId, userId);
  if (st?.timeout) clearTimeout(st.timeout);
  deleteRemovalState(guildId, userId);
}

function getBootstrapKey(guildId, userId) {
  return makeStateKey(guildId, userId);
}

function canManageRoles(member) {
  const me = member.guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionsBitField.Flags.ManageRoles);
}

async function addRoleIfPossible(member) {
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

async function addPerkRoleIfPossible(member) {
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

async function removeRoleIfPossible(member) {
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

function recentlyOnline(info) {
  if (!info?.lastSeenOnlineAt) return false;
  return Date.now() - info.lastSeenOnlineAt < LINK_WARMUP_MS;
}

async function hasFanRole(member) {
  if (member.roles?.cache?.has(ROLE_ID)) return true;
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  return fresh?.roles?.cache?.has(ROLE_ID) || false;
}

async function clearPending(guildId, userId, channel) {
  const pending = getPendingState(guildId, userId);
  if (!pending) return;

  if (pending.timeout) clearTimeout(pending.timeout);
  if (pending.messageId && channel?.isTextBased?.()) {
    await channel.messages.delete(pending.messageId).catch(() => {});
  }
  deletePendingState(guildId, userId);
}

async function resolveSupportersChannel(guild) {
  if (!guild || !CHANNEL_ID) return null;
  return guild.channels.cache.get(CHANNEL_ID) || (await getGuildChannelCached(guild, CHANNEL_ID));
}

async function refreshMember(guild, userId) {
  if (!guild || !userId) return null;
  return getGuildMemberCached(guild, userId);
}

function scheduleRemovalConfirm(member, channel) {
  const guildId = member.guild.id;
  const userId = member.id;
  if (hasRemovalState(guildId, userId)) return;

  const timeout = setTimeout(async () => {
    deleteRemovalState(guildId, userId);
    const freshMember = await refreshMember(member.guild, userId);
    if (!freshMember) return;
    const liveChannel = channel?.isTextBased?.() ? channel : await resolveSupportersChannel(member.guild);
    const cached = getCachedState(guildId, userId);
    const stillHasInvite = computeSupporterLinkState(cached || { hasLink: true }, freshMember.presence).newHas;
    if (stillHasInvite) return;
    await removeRoleIfPossible(freshMember);
    try {
      await freshMember.send(
        "Hai rimosso il link dallo status: hai perso i tuoi perks. Per riaverli, rimetti il link nel tuo status.",
      );
    } catch (err) {
      if (!isExpectedSupporterDmFailure(err)) {
        global.logger?.warn?.("[presenceUpdate] dm send:", err?.message || err);
      }
    }
    const info = getCachedState(guildId, userId);
    if (info?.lastMessageId && liveChannel?.isTextBased?.()) {
      await liveChannel.messages.delete(info.lastMessageId).catch(() => {});
    }
    setCachedState(guildId, userId, {
      hasLink: false,
      lastAnnounced: info?.lastAnnounced || 0,
      lastMessageId: null,
      lastSeenOnlineAt: info?.lastSeenOnlineAt || 0,
      inviteMissSince: null,
    });
    await clearPersistedStatus(guildId, userId);
  }, REMOVE_CONFIRM_MS);
  timeout.unref?.();
  setRemovalState(guildId, userId, { timeout });
}

async function persistStatus(guildId, userId, payload) {
  if (!isDbReady()) return;
  try {
    await ActivityUserProfile.updateOne(
      { guildId, userId },
      {
        $setOnInsert: { guildId, userId },
        $set: {
          "profile.supporterStatus.hasLink": Boolean(payload?.hasLink),
          "profile.supporterStatus.lastMessageId": payload?.lastMessageId || null,
          ...(payload?.lastSentAt ? { "profile.supporterStatus.lastSentAt": payload.lastSentAt } : {}),
        },
      },
      { upsert: true },
    );
  } catch (error) {
    const isMongoNetwork = error?.name === "MongoNetworkTimeoutError" || error?.name === "MongoServerSelectionError";
    if (isMongoNetwork) {
      global.logger?.warn?.("[SUPPORTER STATUS] Persist skipped (MongoDB timeout), will retry on next update.");
    } else {
      global.logger?.error?.("[SUPPORTER STATUS] Persist failed:", error);
    }
  }
}

async function clearPersistedStatus(guildId, userId) {
  if (!isDbReady()) return;
  try {
    await ActivityUserProfile.updateOne(
      { guildId, userId },
      { $set: { "profile.supporterStatus.hasLink": false, "profile.supporterStatus.lastMessageId": null, "profile.supporterStatus.lastSentAt": null } },
    );
  } catch (error) {
    const isMongoNetwork = error?.name === "MongoNetworkTimeoutError" || error?.name === "MongoServerSelectionError";
    if (isMongoNetwork) {
      global.logger?.warn?.("[SUPPORTER STATUS] Delete skipped (MongoDB timeout).");
    } else {
      global.logger?.error?.("[SUPPORTER STATUS] Delete failed:", error);
    }
  }
}

async function getPersistedStatus(guildId, userId) {
  if (!isDbReady() || !guildId || !userId) return null;
  try {
    const doc = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.supporterStatus")
      .lean();
    if (!doc?.profile?.supporterStatus) return null;
    return {
      hasLink: Boolean(doc.profile.supporterStatus.hasLink),
      lastMessageId: doc.profile.supporterStatus.lastMessageId || null,
      lastSentAt: doc.profile.supporterStatus.lastSentAt || null,
    };
  } catch {
    return null;
  }
}

function buildPendingEmbed(member) {
  const thumb = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
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
        `<:VC_Reply:1482532158080942191> Il ruolo <@&${ROLE_ID}> ti verrà dato entro **3 minuti** dal bot!`,
        "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
        "<a:VC_HeartWhite:1448673535253024860> - Permesso di cambiare nickname",
        "",
        "<a:VC_Arrow:1482706699365257397> Metti `.gg/viniliecaffe` o `discord.gg/viniliecaffe` nel tuo status.",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" })
    .setImage(DIVIDER_URL);
}

async function scheduleSupporterRoleGrantWithoutChannelEmbed(member) {
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

  setPendingState(guildId, userId, {
    timeout,
    messageId: null,
    inFlight: false,
  });

  await persistStatus(guildId, userId, {
    hasLink: true,
    lastMessageId: null,
  });
}

async function startPendingFlow(member, channel) {
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
    } catch (_) {}
  }

  if (!sent) {
    setPendingState(guildId, userId, {
      timeout: null,
      messageId: null,
      inFlight: true,
    });

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
      .catch(() => {});
    setPendingState(guildId, userId, {
      timeout: null,
      messageId: sent.id,
      inFlight: true,
    });
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
        if (liveChannel?.isTextBased?.()) await liveChannel.messages.delete(sent.id).catch(() => {});
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

    setPendingState(guildId, userId, {
      timeout,
      messageId: sent.id,
      inFlight: false,
    });
  } else {
    deletePendingState(guildId, userId);
  }

  const current = getCachedState(guildId, userId);
  setCachedState(guildId, userId, {
    hasLink: true,
    lastAnnounced: Date.now(),
    lastMessageId: sent?.id || null,
    lastSeenOnlineAt: current?.lastSeenOnlineAt || Date.now(),
    inviteMissSince: null,
  });
  await persistStatus(guildId, userId, {
    hasLink: true,
    lastMessageId: sent?.id || null,
    lastSentAt: new Date(),
  });
}

async function bootstrapSupporter(client) {
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
    setCachedState(guildId, userId, {
      hasLink: Boolean(doc?.profile?.supporterStatus?.hasLink),
      lastAnnounced: doc?.profile?.supporterStatus?.lastSentAt ? new Date(doc.profile.supporterStatus.lastSentAt).getTime() : 0,
      lastMessageId: doc?.profile?.supporterStatus?.lastMessageId || null,
      lastSeenOnlineAt: 0,
    });
  }

  await guild.members.fetch({ withPresences: true }).catch(() => null);
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    const freshMember = await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => member);
    if (!freshMember || freshMember.user?.bot) continue;
    
    // Safety check: only proceed if they are actually online and have the invite link
    if (isOfflinePresence(freshMember.presence) || !hasInvite(freshMember.presence)) continue;

    if (freshMember.roles.cache.has(ROLE_ID)) continue;
    if (hasPendingState(guildId, freshMember.id)) continue;

    const existing = getCachedState(guildId, freshMember.id);
    if (existing?.lastMessageId) continue;

    if (await shouldSendPublicMemberAnnouncement(freshMember)) {
      await startPendingFlow(freshMember, channel);
    } else {
      await scheduleSupporterRoleGrantWithoutChannelEmbed(freshMember);
    }
  }
}

function startCleanupClock(client, guildId) {
  if (!client || !guildId) return;
  if (cleanupIntervalsByGuild.has(guildId)) return;

  const interval = setInterval(async () => {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const channel = await resolveSupportersChannel(guild);
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
        setCachedState(guildId, userId, {
          hasLink: info.hasLink,
          lastAnnounced: info.lastAnnounced || 0,
          lastMessageId: info.lastMessageId || null,
          lastSeenOnlineAt: info.lastSeenOnlineAt || 0,
          inviteMissSince: nextMiss,
        });
      }
      if (!info?.hasLink || newHas || recentlyOnline(info)) continue;
      await clearPending(guildId, userId, channel);
      scheduleRemovalConfirm(member, channel);
    }
  }, CLEANUP_MS);

  if (typeof interval.unref === "function") interval.unref();
  cleanupIntervalsByGuild.set(guildId, interval);
}

async function applyOnlineState(member, userId, prev, prevHas, presenceFresh) {
  const guildId = member.guild.id;
  const presence = presenceFresh || member.presence;
  const effectivePrev = prev != null ? prev : { hasLink: Boolean(prevHas) };
  const { newHas, inviteMissSince } = computeSupporterLinkState(effectivePrev, presence);
  const lastSeenOnlineAt = Date.now();

  if (newHas) {
    cancelScheduledRemoval(guildId, userId);
  }

  if (newHas && member.roles.cache.has(ROLE_ID)) {
    setCachedState(guildId, userId, {
      hasLink: true,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: null,
    });
    await persistStatus(guildId, userId, {
      hasLink: true,
      lastMessageId: prev?.lastMessageId || null,
    });
    await addPerkRoleIfPossible(member);
    return;
  }

  if (newHas && (await hasFanRole(member))) {
    setCachedState(guildId, userId, {
      hasLink: true,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: null,
    });
    await persistStatus(guildId, userId, {
      hasLink: true,
      lastMessageId: prev?.lastMessageId || null,
    });
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
      setCachedState(guildId, userId, {
        hasLink: true,
        lastAnnounced: prev?.lastAnnounced || 0,
        lastMessageId: prev?.lastMessageId || null,
        lastSeenOnlineAt,
        inviteMissSince: null,
      });
      await persistStatus(guildId, userId, {
        hasLink: true,
        lastMessageId: prev?.lastMessageId || null,
      });
      await addPerkRoleIfPossible(member);
      return;
    }

    setCachedState(guildId, userId, {
      hasLink: true,
      lastAnnounced: Date.now(),
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: null,
    });

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

    setCachedState(guildId, userId, {
      hasLink: false,
      lastAnnounced: prev?.lastAnnounced || 0,
      lastMessageId: prev?.lastMessageId || null,
      lastSeenOnlineAt,
      inviteMissSince: null,
    });
    await persistStatus(guildId, userId, {
      hasLink: false,
      lastMessageId: prev?.lastMessageId || null,
    });
    scheduleRemovalConfirm(member, channel);
    return;
  }

  setCachedState(guildId, userId, {
    hasLink: newHas,
    lastAnnounced: prev?.lastAnnounced || 0,
    lastMessageId: prev?.lastMessageId || null,
    lastSeenOnlineAt,
    inviteMissSince: inviteMissSince != null ? inviteMissSince : null,
  });
  await persistStatus(guildId, userId, {
    hasLink: newHas,
    lastMessageId: prev?.lastMessageId || null,
  });
}

module.exports = {
  name: "presenceUpdate",
  async execute(oldPresence, newPresence) {
    try {
      const member = newPresence?.member || oldPresence?.member;
      if (!member || member.user?.bot) return;
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
          };
          setCachedState(guildId, userId, prev);
        }
      }

      const prevHas=typeof prev?.hasLink==="boolean"?prev.hasLink:resolveInviteState(oldPresence,false);

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
    } catch (error) {
      global.logger?.error?.("[presenceUpdate] failed:", error);
    }
  },
  bootstrapSupporter,
};