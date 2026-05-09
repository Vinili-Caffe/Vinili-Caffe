const cron = require("node-cron");
const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument } = require("../../Schemas/Community/communitySchemas");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const { ensureStaffProfileDoc, getStaffDoc, valutazionePositiveAddCore, valutazioneNegativeAddCore, } = require("../../Utils/Staff/valutazionePanelActions");
const { buildResocontoActivityScope, getWeeklySanctionCountByMod, resolveStaffRole, STAFF_ACTIVITY_LIMITS, STAFF_SANCTION_LIMITS } = require("./weeklyStaffResocontoService");
const { getUserOverviewStats } = require("../Community/activityService");
const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SERATA_FILM_CHANNEL_ID = "1497535199813042306";
const SERATA_FILM_MIN_MS = 30 * 60 * 1000;
const AUTO_SYNC_CRON = "*/30 * * * *";
const INVITE_REGEX = /(?:discord\.gg|dsc\.gg|\.gg|discord\.com\/invite|discord\.me)\s*(?:\/|\\)?\s*viniliecaff[eèé]/i;
const autoWeeklyLoops = new WeakSet();
const serataFilmSessions = new Map();

function autoActor(guild) {
  return { user: guild?.client?.user || { username: "Automazione Staff" }, member: null };
}

function isStaffMember(member) {
  if (!member || member.user?.bot) return false;
  if (member.roles?.cache?.has(String(IDs.roles?.Founder))) return false;
  return Boolean(
    member.roles?.cache?.has(String(IDs.roles?.Staff)) ||
    resolveStaffRole(member) ||
    member.roles?.cache?.has(String(IDs.roles?.HighStaff)),
  );
}

function hasAnyRole(member, roleIds) {
  return roleIds.some((roleId) => roleId && member.roles?.cache?.has(String(roleId)));
}

function getGuildedRoleIds(client) {
  const sponsorIds = Object.values(IDs.sponsorRoles || {});
  const configuredIds = Object.values(client?.config?.guildedRoleIds || {});
  return [...new Set([IDs.roles?.Guilded, ...sponsorIds, ...configuredIds].map((x) => String(x || "")).filter(Boolean))];
}

function resolveInviteState(presence) {
  if (!presence || ["offline", "invisible"].includes(String(presence.status || ""))) return false;
  const activities = Array.isArray(presence.activities) ? presence.activities : [];
  const parts = [];
  for (const activity of activities) {
    if (!activity || typeof activity !== "object") continue;
    for (const value of [activity.state, activity.name, activity.details, activity.url, activity.assets?.largeText, activity.assets?.smallText]) {
      if (typeof value === "string" && value.trim()) parts.push(value);
    }
    if (Array.isArray(activity.buttons)) {
      for (const button of activity.buttons) {
        if (typeof button === "string") parts.push(button);
        else if (button && typeof button === "object") parts.push(button.label || "", button.url || "");
      }
    }
  }
  return INVITE_REGEX.test(parts.join(" ").toLowerCase());
}

function hasVanitySupporterOrClanTag(member) {
  const hasVanity = resolveInviteState(member.presence, false) || member.roles?.cache?.has(String(IDs.roles?.Fan));
  const hasSupporter = member.roles?.cache?.has(String(IDs.roles?.SocialSupporter));
  const hasClanTag = hasAnyRole(member, getGuildedRoleIds(member.client));
  return Boolean(hasVanity || hasSupporter || hasClanTag);
}

function weekKeyFromDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getCurrentWeekStartRome(now = new Date()) {
  const date = new Date(now);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function shouldEvaluateWeeklyForStaffRole(staffRoleId, now = new Date()) {
  const date = new Date(now);
  if (date.getDay() !== 0) return false;
  const minutes = date.getHours() * 60 + date.getMinutes();
  const thresholds = {
    [String(IDs.roles?.Mod || "")]: 17 * 60,
    [String(IDs.roles?.SeniorModerator || "")]: 17 * 60 + 30,
    [String(IDs.roles?.Director || "")]: 17 * 60 + 45,
    [String(IDs.roles?.Admin || "")]: 18 * 60,
  };
  const threshold = thresholds[String(staffRoleId || "")];
  return threshold != null && minutes >= threshold;
}

async function resolveValutazioniChannel(guild) {
  const channelId = IDs.channels?.valutazioniStaff;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

async function deleteAutoMessage(guild, entry) {
  const channelId = String(entry?.channelId || "");
  const messageId = String(entry?.messageId || "");
  if (!guild || !channelId || !messageId) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.() || !channel.messages?.fetch) return;
  const message = await channel.messages.fetch(messageId).catch(() => null);
  if (message) await message.delete().catch(() => null);
}

async function ensureAutoValutazione(guild, member, key, type, reason) {
  if (!guild || !member?.user || !key || !type) return { ok: false };
  if (!isStaffMember(member)) return { ok: false, skipped: "not_staff" };

  let profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
  let staff = ensureStaff(profileDoc);
  if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  const existing = staff.autoValutazioni.find((entry) => String(entry?.key || "") === String(key));
  if (existing && existing.type === type) return { ok: true, skipped: "exists" };
  if (existing) {
    await removeAutoValutazione(guild, member.id, key);
    profileDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, member.id), guild.id, member.id);
    staff = ensureStaff(profileDoc);
    if (!Array.isArray(staff.autoValutazioni)) staff.autoValutazioni = [];
  }

  const channel = await resolveValutazioniChannel(guild);
  if (!channel?.isTextBased?.()) return { ok: false, skipped: "no_channel" };

  const result = type === "negative"
    ? await valutazioneNegativeAddCore(guild, profileDoc, member.user, reason, autoActor(guild), channel)
    : await valutazionePositiveAddCore(profileDoc, member.user, reason, autoActor(guild), channel);

  staff = ensureStaff(profileDoc);
  staff.autoValutazioni.push({
    key: String(key),
    type,
    reason: String(reason || ""),
    channelId: String(channel.id || ""),
    messageId: result?.message?.id ? String(result.message.id) : null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  profileDoc.markModified("staff");
  await profileDoc.save();
  return { ok: true };
}

async function removeAutoValutazione(guild, userId, key) {
  const profileDoc = await getStaffDoc(guild?.id, userId);
  if (!profileDoc?.staff) return { ok: true, skipped: "missing_profile" };
  const staff = ensureStaff(profileDoc);
  const list = Array.isArray(staff.autoValutazioni) ? staff.autoValutazioni : [];
  const index = list.findIndex((entry) => String(entry?.key || "") === String(key || ""));
  if (index < 0) return { ok: true, skipped: "missing_entry" };

  const [entry] = list.splice(index, 1);
  const reasons = entry.type === "negative" ? staff.negativeReasons : staff.positiveReasons;
  if (Array.isArray(reasons)) {
    const reasonIndex = reasons.lastIndexOf(String(entry.reason || ""));
    if (reasonIndex >= 0) reasons.splice(reasonIndex, 1);
  }
  if (entry.type === "negative") staff.negativeCount = Math.max(0, Number(staff.negativeCount || 0) - 1);
  else staff.positiveCount = Math.max(0, Number(staff.positiveCount || 0) - 1);
  staff.valutazioniCount = Math.max(0, Number(staff.valutazioniCount || 0) - 1);

  profileDoc.markModified("staff");
  await profileDoc.save();
  await deleteAutoMessage(guild, entry);
  return { ok: true };
}

async function hasFourStarServerReview(guildId, userId) {
  const doc = await SiteDocument.findOne({
    docType: "review",
    guildId: String(guildId),
    reviewKind: "server",
    userId: String(userId),
    rating: { $gte: 4 },
  }).select("_id").lean().catch(() => null);
  return Boolean(doc);
}

function getSupportAutoValutazioneReason(member) {
  if (resolveInviteState(member.presence)) {
    return "Mette il link vanity nello status.";
  }

  if (member.roles?.cache?.has(String(IDs.roles?.SocialSupporter))) {
    return "Mette il link vanity nella bio.";
  }

  if (hasAnyRole(member, getGuildedRoleIds(member.client))) {
    return "Mette una nostra GUILD TAGS.";
  }

  return null;
}


async function syncPersistentAutoValutazioniForMember(member) {
  if (!member?.guild || member.user?.bot) return;
  if (MAIN_GUILD_ID && String(member.guild.id) !== MAIN_GUILD_ID) return;
  if (!isStaffMember(member)) return;

  const supportKey = "supporto_vanity_supporter_clantag";
  const supportReason = getSupportAutoValutazioneReason(member);

  if (supportReason) {
    await ensureAutoValutazione(
      member.guild,
      member,
      supportKey,
      "positive",
      supportReason,
    );
  } else {
    await removeAutoValutazione(member.guild, member.id, supportKey);
  }


  const followerKey = "ruolo_follower";
  if (member.roles.cache.has(String(IDs.roles?.Follower))) {
    await ensureAutoValutazione(member.guild, member, followerKey, "positive", "Mette il follow su una delle nostre pagine social.");
  } else {
    await removeAutoValutazione(member.guild, member.id, followerKey);
  }

  const reviewKey = "recensione_sito_4_stelle";
  if (await hasFourStarServerReview(member.guild.id, member.id)) {
    await ensureAutoValutazione(member.guild, member, reviewKey, "positive", "Mette una recensione sul nostro sito.");
  } else {
    await removeAutoValutazione(member.guild, member.id, reviewKey);
  }
}

async function syncWeeklyAutoValutazioniForMember(member, now = new Date()) {
  if (!member?.guild || !isStaffMember(member)) return;
  const staffRoleId = resolveStaffRole(member);
  if (!staffRoleId) return;

  const weekStart = getCurrentWeekStartRome(now);
  const weekEnd = now;
  const weekKey = weekKeyFromDate(weekStart);
  const activityKey = `weekly_activity:${weekKey}`;
  const sanctionKey = `weekly_sanzioni:${weekKey}`;
  const canEvaluateForRole = shouldEvaluateWeeklyForStaffRole(staffRoleId, now);
  const limits = STAFF_ACTIVITY_LIMITS[String(staffRoleId)];
  if (limits) {
    const scope = buildResocontoActivityScope(member.guild);
    const overview = await getUserOverviewStats(member.guild.id, member.id, 7, null, scope);
    const d7 = overview?.windows?.d7 || {};
    const messages = Math.max(0, Math.floor(Number(d7.text || 0)));
    const hours = Math.max(0, Number(d7.voiceSeconds || 0) / 3600);
    const reachedBase = messages >= Number(limits.messages || 0) && hours >= Number(limits.hours || 0);
    const reachedDouble = messages >= Number(limits.messages || 0) * 2 && hours >= Number(limits.hours || 0) * 2;

    if (reachedDouble && canEvaluateForRole) {
      await ensureAutoValutazione(member.guild, member, activityKey, "positive", `Limiti settimanali completati del doppio.`);
    } else if (!reachedBase && canEvaluateForRole) {
      await ensureAutoValutazione(member.guild, member, activityKey, "negative", `Limiti settimanali non raggiunti.`);
    } else if (reachedBase) {
      await removeAutoValutazione(member.guild, member.id, activityKey);
    }
  }

  const sanctionLimit = STAFF_SANCTION_LIMITS[String(staffRoleId)];
  if (sanctionLimit != null) {
    if (!canEvaluateForRole) return;
    const sanctions = await getWeeklySanctionCountByMod(member.guild.id, weekStart, weekEnd);
    const count = Number(sanctions.get(String(member.id)) || 0);
    if (count >= Number(sanctionLimit)) {
      await ensureAutoValutazione(member.guild, member, sanctionKey, "positive", `Compito sanzioni completato.`);
    } else {
      await removeAutoValutazione(member.guild, member.id, sanctionKey);
    }
  }
}

async function fetchMainGuildStaffMembers(client, withPresences = false) {
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return [];
  const members = await guild.members.fetch({ withPresences, force: false }).catch(() => guild.members.cache);
  return [...members.values()].filter(isStaffMember);
}

async function syncAllStaffAutoValutazioni(client) {
  const members = await fetchMainGuildStaffMembers(client, true);
  for (const member of members) {
    await syncPersistentAutoValutazioniForMember(member).catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] persistent sync failed:", member.id, err?.message || err);
    });
    await syncWeeklyAutoValutazioniForMember(member).catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] weekly sync failed:", member.id, err?.message || err);
    });
  }
}

function startStaffAutoValutazioniLoop(client) {
  if (!client || autoWeeklyLoops.has(client)) return;
  autoWeeklyLoops.add(client);
  const task = cron.schedule(AUTO_SYNC_CRON, () => {
    syncAllStaffAutoValutazioni(client).catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] loop failed:", err?.message || err);
    });
  }, { timezone: "Europe/Rome" });
  task.start();
}

function isSerataFilmEvent(event) {
  const name = String(event?.name || "").toUpperCase();
  return name.includes("SERATA FILM") && String(event?.channelId || "") === SERATA_FILM_CHANNEL_ID;
}

function serataSessionKey(event) {
  return `${String(event?.guildId || event?.guild?.id || "")}:${String(event?.id || "")}`;
}

function closeAttendance(session, userId, now = Date.now()) {
  const uid = String(userId || "");
  const started = Number(session.presentSince.get(uid) || 0);
  if (!started) return;
  session.presentSince.delete(uid);
  session.attendanceMs.set(uid, Number(session.attendanceMs.get(uid) || 0) + Math.max(0, now - started));
}

async function startSerataFilmSession(event) {
  if (!isSerataFilmEvent(event)) return;
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return;
  const key = serataSessionKey(event);
  if (serataFilmSessions.has(key)) return;
  const session = { eventId: String(event.id), guildId: String(guild.id), startedAt: Date.now(), presentSince: new Map(), attendanceMs: new Map() };
  serataFilmSessions.set(key, session);

  const channel = guild.channels.cache.get(SERATA_FILM_CHANNEL_ID) || (await getGuildChannelCached(guild, SERATA_FILM_CHANNEL_ID));
  if (channel?.members?.size) {
    for (const member of channel.members.values()) {
      if (isStaffMember(member)) session.presentSince.set(String(member.id), Date.now());
    }
  }
}

async function finishSerataFilmSession(event) {
  if (!isSerataFilmEvent(event)) return;
  const key = serataSessionKey(event);
  const session = serataFilmSessions.get(key);
  if (!session) return;
  serataFilmSessions.delete(key);
  const guild = event.guild || (await event.client?.guilds?.fetch?.(event.guildId).catch(() => null));
  if (!guild) return;
  const now = Date.now();
  for (const uid of [...session.presentSince.keys()]) closeAttendance(session, uid, now);
  const staffMembers = await fetchMainGuildStaffMembers(guild.client, false);
  for (const member of staffMembers) {
    const ms = Number(session.attendanceMs.get(String(member.id)) || 0);
    if (ms >= SERATA_FILM_MIN_MS) continue;
    await ensureAutoValutazione(guild, member, `serata_film:${session.eventId}`, "negative", "Non si presenta durante la serata film o rimane per meno di 30 minuti.").catch((err) => {
      global.logger?.warn?.("[STAFF AUTO VALUTAZIONI] serata film negative failed:", member.id, err?.message || err);
    });
  }
}

async function handleSerataFilmScheduledEventUpdate(oldEvent, newEvent) {
  const oldStatus = Number(oldEvent?.status || 0);
  const newStatus = Number(newEvent?.status || 0);
  if (newStatus === 2 && oldStatus !== 2) await startSerataFilmSession(newEvent);
  if (oldStatus === 2 && (newStatus === 3 || newStatus === 4)) await finishSerataFilmSession(newEvent);
}

async function handleSerataFilmVoiceState(oldState, newState) {
  const guildId = String(newState?.guild?.id || oldState?.guild?.id || "");
  const userId = String(newState?.id || oldState?.id || "");
  if (!guildId || !userId || !serataFilmSessions.size) return;
  const now = Date.now();
  const oldInChannel = String(oldState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const newInChannel = String(newState?.channelId || "") === SERATA_FILM_CHANNEL_ID;
  const joined = !oldInChannel && newInChannel;
  const left = oldInChannel && !newInChannel;
  for (const session of serataFilmSessions.values()) {
    if (String(session.guildId) !== guildId) continue;
    if (joined) session.presentSince.set(userId, now);
    if (left) closeAttendance(session, userId, now);
  }
}

async function restoreActiveSerataFilmSessions(client) {
  const guild = client?.guilds?.cache?.get(MAIN_GUILD_ID) || (await client?.guilds?.fetch?.(MAIN_GUILD_ID).catch(() => null));
  if (!guild?.scheduledEvents?.fetch) return;
  const events = await guild.scheduledEvents.fetch().catch(() => null);
  if (!events?.size) return;
  for (const event of events.values()) {
    if (Number(event.status) === 2 && isSerataFilmEvent(event)) await startSerataFilmSession(event);
  }
}

module.exports = {
  ensureAutoValutazione,
  removeAutoValutazione,
  syncPersistentAutoValutazioniForMember,
  syncWeeklyAutoValutazioniForMember,
  syncAllStaffAutoValutazioni,
  startStaffAutoValutazioniLoop,
  startSerataFilmSession,
  finishSerataFilmSession,
  handleSerataFilmScheduledEventUpdate,
  handleSerataFilmVoiceState,
  restoreActiveSerataFilmSessions,
};
