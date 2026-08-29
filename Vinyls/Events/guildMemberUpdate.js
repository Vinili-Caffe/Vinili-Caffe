const { EmbedBuilder, PermissionsBitField, AuditLogEvent, MessageType, } = require("discord.js");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const IDs = require("../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const { scheduleStaffListRefresh, didStaffMembershipChange, didStaffListDisplayRolesChange, memberHasStaffRole } = require("../Utils/Community/staffListUtils");
const { memberHasPartnerManagerRole, memberHasAnyStaffPresenceForDepexSync, buildStaffPartnerManagerIdUnsetUpdate } = require("../Utils/Staff/staffPmUtils");
const { deleteStaffPauseRequestChannelMessages, deleteStaffRelatedMessagesFromConfiguredChannels, ensureStaff, archiveStaffRolesHistoryThenUnsetStaff, } = require("../Utils/Staff/staffDocUtils");
const { ActivityUserProfile, CustomRole } = require("../Schemas/Community/communitySchemas");
const { grantBestStaffPauseBonusYear, scheduleAcceptedPauseMessagesRefreshAfterRankChange, getMemberStaffRankRoleId } = require("../Utils/Pause/pauseHandlersUtils");
const { getJoinGateConfigSnapshot, } = require("../Services/Moderation/joinGateService");
const { resolveJoinGateConfiguredExempt, isSponsorJoinGateGuildId, } = require("../Services/Moderation/joinGateExemptUtils");
const { ARROW, formatAuditActor, resolveChannelRolesLogChannel, resolveResponsible, } = require("../Utils/Logging/channelRolesLogUtils");
const { resolveModLogChannel, formatResponsible, nowDiscordTs } = require("../Utils/Logging/modAuditLogUtils");
const { handleMemberRoleAddition: antiNukeHandleMemberRoleAddition } = require("../Services/Moderation/antiNukeService");
const { handleStaffRoleAssignmentGuard } = require("../Services/Moderation/staffRoleAssignmentGuardService");
const { hasEventWeekWinnerGrant } = require("../Services/Community/weekWinnerGrantsService");
const { hasExtraCustomPerksUnlock } = require("../Utils/Community/customPerksUnlock");
const { createModCase, getModConfig, logModCase } = require("../Utils/Moderation/moderation");
const { buildUnbanRequestRow } = require("../Utils/Moderation/unbanRequestButton");
const { setWelcomeContextActive } = require("../Utils/Message/officialMessageCommunityHandlers");
const { syncClanTagRolesForUserEverywhereAfterMemberEvent } = require("../Services/Community/clanTagRoleService");
const { syncPersistentAutoValutazioniForMember, handleStaffBoostAutoValutazioneMemberUpdate, resolveAutoValutazioneCreateKeysFromMemberUpdate } = require("../Services/Staff/staffAutoValutazioniService");
const { handleMainGuildMemberUpdate } = require("../Services/Staff/staffAccessMirrorService");
const { getAnnouncedBoostSlots, setAnnouncedBoostSlots, deleteAnnouncedBoostSlots, ensureBoostSlotsSynced, persistAnnouncedBoostSlotsToDb, clearAnnouncedBoostSlotsMemoryForGuild } = require("../Utils/Community/boostSlotAnnounceTracker");
const { isValidGuildUserId } = require("../Utils/DB/validateWriteIds");
const { shouldSendPublicMemberAnnouncement, normalVerificationCompletedBetween } = require("../Utils/Community/memberPublicAnnouncementGate");
const { runDeferredJoinAnnouncements } = require("./guildMemberAdd");
const { handlePreMemberRoleOnMemberUpdate } = require("../Utils/Community/preMemberRoleService");
const { syncStaffChatThreadsForMemberChange } = require("../Services/Staff/staffChatThreadsService");
const { syncStaffCmdsThreadsForMemberChange } = require("../Services/Staff/staffCmdsThreadsService");
const { autoUnclaimOpenTicketsClaimedByUser } = require("../Utils/Ticket/ticketAutoUnclaimOnStaffLoss");
const sponsorVerifiedRequiresMain = require("../Services/Community/sponsorVerifiedRequiresMainService");
const { syncMutedMirrorRoleFromMemberUpdate, memberIsInMuteMirrorState } = require("../Services/Moderation/mutedMirrorRoleService");
const { wasRoleRestoredByMuteMirror } = require("../Utils/Moderation/muteRestoreAnnounceSuppress");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Utils/Discord/guildDiscordIdentity");
const { maybeAnnounceDonationPackageInSupporters } = require("../Utils/Community/donationPackageSupportersAnnounce");
const { maybeAnnounceManualSocialRolesAndGrantPicPermsBundle } = require("../Utils/Community/manualSocialRoleAnnounceAndPicPerms");
const { maybeSyncPatronRoleForMember } = require("../Utils/Community/patronRoleService");
const { upsertVerifiedMember, applyTenureForMember } = require("../Services/Community/communityOpsService");
const { buildBoostEmbed, buildBoostEmbedSecond, buildBoostAnnounceContent } = require("../Utils/Community/boostAnnounceEmbeds");
const { isViniliFullFeatureGuild } = require("../MultiGuild/core/guildFeatureScope");
const AUDIT_FETCH_LIMIT = 20;
const AUDIT_LOOKBACK_MS = 120 * 1000;
const MAX_UNVERIFIED_ROLE_DIFF = 4;
const ROLE_UPDATE_LOG_DEDUPE = new Map();
const ROLE_UPDATE_LOG_DEDUPE_TTL_MS = 5_000;
const PERK_ROLE_ID = IDs.roles.PicPerms;
const BOOST_NATIVE_WAIT_INITIAL_MS = 0;
const BOOST_NATIVE_WAIT_POLL_MS = 150;
const BOOST_NATIVE_WAIT_SINGLE_MS = 1200;
const BOOST_NATIVE_WAIT_MAX_MS = 3500;
const NATIVE_BOOST_ACCUMULATE_MS = 60_000;
const BOOST_CHANNEL_EMBED_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000;
const CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS = [IDs.roles.VIP, IDs.roles.DoubleBooster, IDs.roles.Level50, IDs.roles.Level70, IDs.roles.Donator, IDs.roles.vip, IDs.roles.VIPplus].filter(Boolean);
const STAFF_HISTORY_ROLES = [IDs.roles.PartnerManager, IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.SeniorModerator, IDs.roles.HighStaff, IDs.roles.Director, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.Founder,];
const PLUS_COLOR_ROLE_IDS = [IDs.roles.redPlus, IDs.roles.orangePlus, IDs.roles.yellowPlus, IDs.roles.greenPlus, IDs.roles.bluePlus, IDs.roles.purplePlus, IDs.roles.pinkPlus, IDs.roles.blackPlus, IDs.roles.grayPlus, IDs.roles.whitePlus, IDs.roles.orangeBlackPlus, IDs.roles.greenBlackPlus, IDs.roles.aquaBlackPlus,];
const boostCountCache = new Map();
const boostAnnounceCache = new Map();
const boostFollowupLocks = new Map();
const boostAnnounceSendLocks = new Set();
const boostAnnounceHandledUntil = new Map();
const nativeBoostSeenByKey = new Map();
const BOOST_ANNOUNCE_HANDLED_TTL_MS = 3 * 60 * 1000;
const NATIVE_BOOST_SEEN_TTL_MS = 15 * 60 * 1000;

function clearBoostAnnounceHandled(boostKey) {
  if (!boostKey) return;
  boostAnnounceHandledUntil.delete(String(boostKey));
}

function noteNativeBoostSeen(guildId, userId, slotCount = 1, messageId = "") {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return;
  const key = `${gid}:${uid}`;
  const at = Date.now();
  const slots = Math.max(1, Math.min(2, Number(slotCount || 1)));
  const mid = String(messageId || "").trim();
  const prev = nativeBoostSeenByKey.get(key);
  const ids = new Set(Array.isArray(prev?.ids) ? prev.ids : []);
  let nextSlots = slots;
  if (mid && ids.has(mid)) {
    nextSlots = Math.max(Number(prev?.slots || 0), slots);
  } else if (prev && at - Number(prev.at || 0) < NATIVE_BOOST_ACCUMULATE_MS) {
    if (mid) ids.add(mid);
    const dt = at - Number(prev.at || 0);
    if (slots >= 2) nextSlots = 2;
    else if (dt < 5000) nextSlots = Math.max(Number(prev.slots || 0), slots);
    else nextSlots = Math.min(2, Number(prev.slots || 0) + slots);
  } else {
    ids.clear();
    if (mid) ids.add(mid);
    nextSlots = slots;
  }
  if (mid) ids.add(mid);
  nativeBoostSeenByKey.set(key, { at, slots: nextSlots, ids: [...ids].slice(-8) });
  clearBoostAnnounceHandled(key);
}

function nativeBoostSeenSince(guildId, userId, sinceMs) {
  const row = nativeBoostSeenByKey.get(`${String(guildId || "")}:${String(userId || "")}`);
  if (!row) return 0;
  const at = Number(row.at || 0);
  const minTs = Math.max(0, Number(sinceMs || 0) - 2000);
  if (!at || at < minTs) return 0;
  if (Date.now() - at > NATIVE_BOOST_SEEN_TTL_MS) {
    nativeBoostSeenByKey.delete(`${String(guildId || "")}:${String(userId || "")}`);
    return 0;
  }
  return Math.max(0, Number(row.slots || 0));
}

function resolveNativeBoostMessageUserId(message, guild = null) {
  if (!message || parseNativeBoostSlotCount(message) <= 0) return "";
  const authorId = String(message.author?.id || "").trim();
  if (authorId && !message.author?.bot) return authorId;
  const interactionUserId = String(
    message.interactionMetadata?.user?.id ||
    message.interaction?.user?.id ||
    "",
  ).trim();
  if (interactionUserId) return interactionUserId;
  const memberId = String(message.member?.id || "").trim();
  if (memberId) return memberId;
  const users = message.mentions?.users;
  if (users?.size) {
    const first = users.first?.() || users.values?.()?.next?.()?.value;
    if (first?.id) return String(first.id);
  }
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const blob = [embed?.description, embed?.title, embed?.author?.name, embed?.footer?.text]
      .map((x) => String(x || ""))
      .filter(Boolean)
      .join("\n");
    const mentionMatch = blob.match(/<@!?(\d{17,20})>/);
    if (mentionMatch) return mentionMatch[1];
  }
  const text = String(message.content || "").trim();
  const mentionMatch = text.match(/<@!?(\d{17,20})>/);
  if (mentionMatch) return mentionMatch[1];
  return resolveBoosterUserIdFromBoostContent(message, guild);
}

function resolveBoosterUserIdFromBoostContent(message, guild) {
  const chunks = [String(message?.content || "")];
  for (const embed of Array.isArray(message?.embeds) ? message.embeds : []) {
    chunks.push(
      embed?.description,
      embed?.title,
      embed?.author?.name,
      embed?.footer?.text,
    );
  }
  const text = chunks.map((x) => String(x || "")).filter(Boolean).join("\n").trim();
  if (!text || !guild?.members?.cache) return "";
  const patterns = [
    /(.+?)\s+ha\s+appena\s+potenziato\s+il\s+server/i,
    /(.+?)\s+just\s+boosted\s+the\s+server/i,
    /(.+?)\s+boosted\s+the\s+server/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const label = m[1].replace(/\*\*/g, "").replace(/\s+\d+\s+volte.*$/i, "").trim();
    if (!label) continue;
    const lower = label.toLowerCase();
    let partial = "";
    for (const member of guild.members.cache.values()) {
      if (member.user?.bot) continue;
      const candidates = [
        String(member.displayName || ""),
        String(member.user?.globalName || ""),
        String(member.user?.username || ""),
      ].map((x) => x.toLowerCase()).filter(Boolean);
      for (const candidate of candidates) {
        if (candidate === lower) return String(member.id);
        if (candidate.includes(lower) || lower.includes(candidate)) {
          partial = String(member.id);
        }
      }
    }
    if (partial) return partial;
  }
  return "";
}

function handleNativeBoostSystemMessage(message) {
  const guildId = String(message?.guild?.id || "").trim();
  const mainId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !mainId || guildId !== mainId) return null;
  const userId = resolveNativeBoostMessageUserId(message, message?.guild || null);
  if (!userId) return null;
  const slots = parseNativeBoostSlotCount(message);
  noteNativeBoostSeen(guildId, userId, slots, message?.id);
  const accumulated = nativeBoostSeenSince(guildId, userId, Date.now() - NATIVE_BOOST_ACCUMULATE_MS);
  return { guildId, userId, slots: Math.max(slots, accumulated) };
}

function markBoostAnnounceHandled(boostKey) {
  if (!boostKey) return;
  boostAnnounceHandledUntil.set(String(boostKey), Date.now() + BOOST_ANNOUNCE_HANDLED_TTL_MS);
}

function isBoostAnnounceHandled(boostKey) {
  const until = Number(boostAnnounceHandledUntil.get(String(boostKey || "")) || 0);
  if (!until) return false;
  if (Date.now() > until) {
    boostAnnounceHandledUntil.delete(String(boostKey));
    return false;
  }
  return true;
}

function boostAnnounceLooksLikeBoost(text) {
  return (
    /grazie\s+.*\s+per\s+il\s+boost/i.test(text) ||
    /per\s+il\s+doppio\s+boost/i.test(text) ||
    /per\s+il\s+boost/i.test(text) ||
    /ora\s+siamo\s+a\s+\d+\s+boost/i.test(text)
  );
}

/** Un embed "doppio" copre 2 slot; uno singolo ne copre 1. */
function boostAnnounceSlotWeightFromText(text) {
  const t = String(text || "");
  if (!boostAnnounceLooksLikeBoost(t)) return 0;
  if (/doppio\s+boost/i.test(t) || /PER IL DOPPIO BOOST/i.test(t)) return 2;
  return 1;
}

function messageBoostAnnounceSlotWeight(message, uid, botId) {
  if (!messageMatchesBotBoostAnnounce(message, uid, botId)) return 0;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embedTexts = embeds.map((embed) =>
    [embed?.title || "", embed?.description || "", embed?.footer?.text || ""].join("\n"),
  );
  const text = [message.content || "", ...embedTexts].join("\n");
  return boostAnnounceSlotWeightFromText(text);
}

function messageMatchesBotBoostAnnounce(message, uid, botId) {
  if (botId && String(message?.author?.id || "") !== botId) return false;
  if (!botId && !message?.author?.bot) return false;
  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  const embedTexts = embeds.map((embed) =>
    [embed?.title || "", embed?.description || "", embed?.footer?.text || ""].join("\n"),
  );
  const text = [message.content || "", ...embedTexts].join("\n");
  if (!text.includes(`<@${uid}>`) && !text.includes(uid)) return false;
  return boostAnnounceLooksLikeBoost(text);
}

async function countRecentBotBoostAnnouncesForUser(channel, userId, opts = {}) {
  const uid = String(userId || "");
  if (!channel?.messages?.fetch || !uid) return 0;
  const botId = String(opts.botId || channel.client?.user?.id || "");
  const lookbackMs = Math.max(60_000, Number(opts.lookbackMs || 10 * 60 * 1000));
  const sinceMs = Number.isFinite(Number(opts.sinceMs))
    ? Math.max(0, Number(opts.sinceMs))
    : Date.now() - lookbackMs;
  const limit = Math.max(20, Math.min(100, Number(opts.limit || 80)));
  const recent = await channel.messages.fetch({ limit }).catch(() => null);
  if (!recent) return 0;
  let count = 0;
  for (const message of recent.values()) {
    const ts = Number(message?.createdTimestamp || 0);
    if (!ts || ts < sinceMs) continue;
    count += messageBoostAnnounceSlotWeight(message, uid, botId);
  }
  return Math.min(2, count);
}

async function countRecentBotBoostAnnouncesForUserMulti(channel, userId, thresholds = {}) {
  const uid = String(userId || "");
  if (!channel?.messages?.fetch || !uid) {
    return { since: 0, period: 0, lookback: 0 };
  }
  const botId = String(thresholds.botId || channel.client?.user?.id || "");
  const sinceMs = Math.max(0, Number(thresholds.sinceMs || 0));
  const periodSinceMs = Math.max(0, Number(thresholds.periodSinceMs || 0));
  const lookbackSinceMs = Math.max(
    0,
    Date.now() - Math.max(60_000, Number(thresholds.lookbackMs || 10 * 60 * 1000)),
  );
  const limit = Math.max(20, Math.min(100, Number(thresholds.limit || 100)));
  const recent = await channel.messages.fetch({ limit }).catch(() => null);
  if (!recent) return { since: 0, period: 0, lookback: 0 };
  let since = 0;
  let period = 0;
  let lookback = 0;
  for (const message of recent.values()) {
    const ts = Number(message?.createdTimestamp || 0);
    if (!ts) continue;
    const w = messageBoostAnnounceSlotWeight(message, uid, botId);
    if (!w) continue;
    if (ts >= sinceMs) since += w;
    if (ts >= periodSinceMs) period += w;
    if (ts >= lookbackSinceMs) lookback += w;
  }
  return {
    since: Math.min(2, since),
    period: Math.min(2, period),
    lookback: Math.min(2, lookback),
  };
}

async function resolveBoostAnnounceSyncState(guild, userId, channel, opts = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  const sinceMs = Number.isFinite(Number(opts.sinceMs))
    ? Math.max(0, Number(opts.sinceMs))
    : Date.now() - Math.max(60_000, Number(opts.nativeLookbackMs || 10 * 60 * 1000));
  const nativeLookbackMs = Math.max(60_000, Number(opts.nativeLookbackMs || 10 * 60 * 1000));
  const knownNative = Math.max(0, Number(opts.knownNativeSlots || 0));
  const seenNative = nativeBoostSeenSince(gid, uid, sinceMs);
  // Skip solo se già sappiamo di un doppio boost: un native "2 volte" va letto dal canale.
  const skipNativeScan = Boolean(opts.skipNativeScan) || Math.max(knownNative, seenNative) >= 2;
  const scannedNative = channel && !skipNativeScan
    ? await detectRecentNativeBoostEventsForUser(guild, channel, uid, nativeLookbackMs).catch(() => 0)
    : 0;
  const nativeBoostEvents = Math.max(knownNative, seenNative, scannedNative);
  const announcedSlots = channel
    ? await resolveEffectiveAnnouncedBoostSlots(gid, uid, channel, { sinceMs, lookbackMs: nativeLookbackMs }).catch(() => getAnnouncedBoostSlots(gid, uid))
    : getAnnouncedBoostSlots(gid, uid);
  return {
    nativeBoostEvents,
    announcedSlots,
    missing: Math.max(0, nativeBoostEvents - announcedSlots),
  };
}

async function markBoostAnnounceHandledIfSynced(guild, userId, channel, opts = {}) {
  const sync = await resolveBoostAnnounceSyncState(guild, userId, channel, opts).catch(() => null);
  if (!sync || sync.missing > 0) return false;
  markBoostAnnounceHandled(`${String(guild?.id || "")}:${String(userId || "")}`);
  return true;
}

async function resolveEffectiveAnnouncedBoostSlots(guildId, userId, channel, opts = {}) {
  await ensureBoostSlotsSynced(guildId, userId).catch(() => null);
  const tracked = getAnnouncedBoostSlots(guildId, userId);
  if (!channel) return tracked;
  const channelCount = await countRecentBotBoostAnnouncesForUser(channel, userId, opts).catch(() => 0);
  const safeChannel = Math.max(0, Number(channelCount || 0));
  if (safeChannel > 0 && safeChannel < tracked) {
    setAnnouncedBoostSlots(guildId, userId, safeChannel);
    await persistAnnouncedBoostSlotsToDb(guildId, userId).catch(() => null);
    return safeChannel;
  }
  return Math.max(tracked, safeChannel);
}

function highestTrackedStaffRole(member) {
  if (!member?.roles?.cache) return "";
  for (const roleId of STAFF_HISTORY_ROLES) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return "";
}

function listStaffRolesAdded(oldMember, newMember) {
  const added = [];
  for (const roleId of STAFF_HISTORY_ROLES) {
    const id = String(roleId || "").trim();
    if (!id) continue;
    if (newMember?.roles?.cache?.has?.(id) && !oldMember?.roles?.cache?.has?.(id)) {
      added.push(id);
    }
  }
  const { STAFF_LIST_SECTION_ROLE_IDS } = require("../Utils/Community/staffListUtils");
  const listSet = new Set(STAFF_LIST_SECTION_ROLE_IDS.map(String));
  return added.sort((a, b) => {
    const aListed = listSet.has(a) ? 0 : 1;
    const bListed = listSet.has(b) ? 0 : 1;
    return aListed - bListed;
  });
}

async function recordManualStaffRoleHistoryIfNeeded(oldMember, newMember) {
  const guildId = String(newMember?.guild?.id || "").trim();
  if (!guildId || guildId !== String(IDs.guilds?.main || "")) return;
  if (newMember?.user?.bot) return;
  // Founder: carriera fissa (Member → Founder); non loggare altri ruoli staff aggiunti a mano.
  const founderRoleId = String(IDs.roles?.Founder || "").trim();
  if (founderRoleId && newMember?.roles?.cache?.has?.(founderRoleId)) return;
  const addedRoleIds = listStaffRolesAdded(oldMember, newMember);
  if (!addedRoleIds.length) return;

  const beforeRoleId = highestTrackedStaffRole(oldMember) || String(IDs.roles?.Member || "").trim();
  const now = new Date();
  const profileDoc = await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId: String(newMember.id) },
    { $setOnInsert: { guildId, userId: String(newMember.id) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const staff = ensureStaff(profileDoc);
  if (!profileDoc || !staff) return;
  if (!Array.isArray(staff.rolesHistory)) staff.rolesHistory = [];

  let changed = false;
  for (const addedRoleId of addedRoleIds) {
    if (wasRoleRestoredByMuteMirror(guildId, newMember.id, addedRoleId)) continue;
    const hadRoleBefore = staff.rolesHistory.some((row) => String(row?.newRole || "").trim() === String(addedRoleId));
    if (hadRoleBefore) continue;
    const hasRecentSameRole = staff.rolesHistory.some((row) => {
      if (String(row?.newRole || "") !== String(addedRoleId)) return false;
      const when = row?.date ? new Date(row.date) : null;
      if (!when || Number.isNaN(when.getTime())) return false;
      return Math.abs(now.getTime() - when.getTime()) <= 5 * 60 * 1000;
    });
    if (hasRecentSameRole) continue;
    staff.rolesHistory.push({
      oldRole: beforeRoleId,
      newRole: addedRoleId,
      reason: "Ruolo staff aggiunto manualmente.",
      date: now,
      displayName: String(newMember.displayName || newMember.user?.globalName || newMember.user?.username || "").trim() || null,
      username: String(newMember.user?.username || "").trim() || null,
      avatarUrl:
        (typeof newMember.displayAvatarURL === "function"
          ? newMember.displayAvatarURL({ size: 128, extension: "png" })
          : "") || null,
    });
    changed = true;
  }
  if (!changed) return;
  profileDoc.markModified("staff");
  await profileDoc.save().catch((err) => {
    global.logger?.warn?.("[guildMemberUpdate] manual staff rolesHistory save:", newMember.id, err?.message || err);
  });
}

function normalizeBoostAnnounceEntry(raw) {
  if (raw != null && typeof raw === "object" && !Array.isArray(raw) && typeof raw.count === "number") {
    return {
      count: raw.count,
      premiumTs: raw.premiumTs != null ? Number(raw.premiumTs) : null,
    };
  }
  if (typeof raw === "number") return { count: raw, premiumTs: null };
  return null;
}

function rememberBoostAnnounce(boostKey, guildPremiumCount, premiumSinceTs) {
  boostAnnounceCache.set(boostKey, {
    count: Number(guildPremiumCount || 0),
    premiumTs: premiumSinceTs != null ? Number(premiumSinceTs) : null,
  });
}

function resolveBoostSlotTarget(member, announcedSlots, nativeBoostEvents, forcedSlots, opts = {}) {
  if (Number(member?.premiumSinceTimestamp || 0) <= 0 && !forcedSlots && !opts.allowSecondRecovery) return 0;
  const announced = Math.max(0, Number(announcedSlots || 0));
  let target = Math.min(
    2,
    Math.max(
      Number(forcedSlots || 0),
      Number(nativeBoostEvents || 0),
      Number(opts.nativeSeenSlots || 0),
      Number(opts.expectedSlots || 0),
      announced,
    ),
  );
  // Secondo boost a distanza (ore): il native dice ancora "1 volta", non "2 volte".
  // Va sommato allo slot già annunciato, non confrontato come totale assoluto.
  if (opts.incrementalNativeEvent) {
    const eventSlots = Math.max(1, Math.min(2, Number(opts.nativeEventSlots || forcedSlots || 1)));
    target = Math.min(2, Math.max(target, announced + eventSlots));
  }
  if (
    (opts.secondBoostConfirmed || opts.allowSecondRecovery) &&
    announced >= 1 &&
    Number(member?.premiumSinceTimestamp || 0) > 0
  ) {
    target = Math.min(2, Math.max(target, 2));
  }
  return target;
}

function boostAnnouncePeriodSinceMs(member, opts = {}, nativeLookbackMs = 10 * 60 * 1000) {
  const premiumSince = Number(member?.premiumSinceTimestamp || 0);
  if (premiumSince > 0) return Math.max(0, premiumSince - 1000);
  const recoveryStartedAt = Number(opts.startedAt);
  if (Number.isFinite(recoveryStartedAt) && recoveryStartedAt > 0) {
    return Math.max(0, recoveryStartedAt - 1000);
  }
  return Date.now() - Math.max(60_000, Number(nativeLookbackMs || 10 * 60 * 1000));
}

async function syncAnnouncedBoostSlotsFromChannelCount(guildId, userId, channelCount) {
  const next = Math.max(0, Math.floor(Number(channelCount || 0)));
  const current = getAnnouncedBoostSlots(guildId, userId);
  if (next <= current) return current;
  setAnnouncedBoostSlots(guildId, userId, next);
  await persistAnnouncedBoostSlotsToDb(guildId, userId).catch(() => null);
  return next;
}

function shouldSkipDuplicateBoostAnnounce(boostKey, countIncreased, currentCount, newBoostTs) {
  if (!countIncreased) return false;
  const meta = normalizeBoostAnnounceEntry(boostAnnounceCache.get(boostKey));
  if (!meta || meta.count !== currentCount) return false;
  const ts = Number(newBoostTs || 0);
  if (meta.premiumTs != null && ts > 0) return meta.premiumTs === ts;
  if (meta.premiumTs == null && ts > 0) return true;
  return false;
}

function isPrimaryShard(client) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

function buildJoinGateTriggeredEmbed(member, reason) {
  return new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle(`<:VC_User:1482527453586002103> ${member.user.username} ha attivato il joingate!`)
    .setDescription([`<:VC_User:1482527453586002103> **Membro:** ${member.user.username} [\`${member.user.id}\`]`, `<:VC_reason:1478517122929004544> **Motivo:** ${reason}`,].join("\n"))
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null);
}

function toDiscordTimestamp(value = new Date(), style = "F") {
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return "<t:0:F>";
  return `<t:${Math.floor(ms / 1000)}:${style}>`;
}

function toRelativeDiscordTime(value) {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return `<t:${Math.floor(ms / 1000)}:R>`;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function cleanupRoleUpdateLogDedupe(now = Date.now()) {
  for (const [key, ts] of ROLE_UPDATE_LOG_DEDUPE.entries()) {
    if (now - Number(ts || 0) > ROLE_UPDATE_LOG_DEDUPE_TTL_MS) {
      ROLE_UPDATE_LOG_DEDUPE.delete(key);
    }
  }
}

function shouldSkipRoleUpdateLog(guildId, userId, additions = [], removals = []) {
  const now = Date.now();
  cleanupRoleUpdateLogDedupe(now);
  const signature = [String(guildId || ""), String(userId || ""), additions.map((role) => String(role?.id || "")).sort().join(","), removals.map((role) => String(role?.id || "")).sort().join(","),].join(":");
  const lastTs = Number(ROLE_UPDATE_LOG_DEDUPE.get(signature) || 0);
  ROLE_UPDATE_LOG_DEDUPE.set(signature, now);
  return now - lastTs <= ROLE_UPDATE_LOG_DEDUPE_TTL_MS;
}

async function resolveActivityLogChannel(guild) {
  const channelId = IDs.channels.activityLogs;
  if (!guild || !channelId) return null;
  return guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
}

function didNickChange(oldMember, newMember) {
  return String(oldMember?.nickname || "") !== String(newMember?.nickname || "");
}

function didTimeoutChange(oldMember, newMember) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  return Number(oldTs) !== Number(newTs);
}

function buildNickChangeLine(oldMember, newMember) {
  const oldNick = String(oldMember?.nickname || "").trim() || "<:cancel:1461730653677551691>";
  const newNick = String(newMember?.nickname || "").trim() || "<:cancel:1461730653677551691>";
  return `${oldNick} <a:VC_Arrow:1482706699365257397> ${newNick}`;
}

function buildTimeoutChangeLine(oldMember, newMember) {
  const oldTs = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTs = newMember?.communicationDisabledUntilTimestamp || 0;
  const oldLabel = oldTs ? toRelativeDiscordTime(oldTs) : "<:cancel:1461730653677551691>";
  const newLabel = newTs ? toRelativeDiscordTime(newTs) : "<:cancel:1461730653677551691>";
  return `${oldLabel} <a:VC_Arrow:1482706699365257397> ${newLabel}`;
}

async function resolveMemberUpdateAuditInfo(guild, targetUserId) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return { executor: null, reason: null };
  }

  let entry = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: AUDIT_FETCH_LIMIT, }).catch(() => null);

    if (logs?.entries?.size) {
      const nowMs = Date.now();
      entry =
        logs.entries.find((item) => {
          const createdMs = Number(item?.createdTimestamp || 0);
          const targetId = String(item?.target?.id || "");
          const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS;
          return withinWindow && targetId === String(targetUserId || "");
        }) || null;
    }

    if (entry) break;
    if (attempt < 2) await sleep(700);
  }

  return {
    executor: entry?.executor || null,
    reason: entry?.reason || null,
  };
}

async function sendTimeoutRemovedModLog(oldMember, newMember) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild || !newMember?.user) return;
  const hadTimeout = Number(oldMember?.communicationDisabledUntilTimestamp || 0) > 0;
  const hasTimeout = Number(newMember?.communicationDisabledUntilTimestamp || 0) > 0;
  if (!hadTimeout || hasTimeout) return;

  const modLogChannel = await resolveModLogChannel(guild);
  if (!modLogChannel?.isTextBased?.()) return;

  const audit = await resolveMemberUpdateAuditInfo(guild, newMember.user.id);
  const responsible = formatResponsible(audit.executor);

  const embed = new EmbedBuilder()
    .setColor("#57F287")
    .setTitle("<:VC_User:1482527453586002103> Timeout Rimosso")
    .setDescription(
      [
        `<:VC_User:1482527453586002103> **Timeout per** ${newMember.user} **è stato rimosso**`,
        `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
        `<:VC_Clock:1473359204189474886> ${nowDiscordTs()}`,
        audit.reason ? `<:VC_reason:1478517122929004544> **Motivo:** ${audit.reason}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .setFooter({ text: `ID: ${newMember.user.id}` })
    .setTimestamp();

  await modLogChannel.send({ embeds: [embed] }).catch(() => null);
}

async function sendMemberUpdateLog(oldMember, newMember) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild || !newMember?.user) return;

  const nickChanged = didNickChange(oldMember, newMember);
  const timeoutChanged = didTimeoutChange(oldMember, newMember);
  if (!nickChanged && !timeoutChanged) return;

  if (timeoutChanged) {
    const hadTimeout = Number(oldMember?.communicationDisabledUntilTimestamp || 0) > 0;
    const hasTimeout = Number(newMember?.communicationDisabledUntilTimestamp || 0) > 0;
    if (hadTimeout && !hasTimeout) await sendTimeoutRemovedModLog(oldMember, newMember);
  }

  if (!(await shouldSendPublicMemberAnnouncement(newMember))) return;

  const logChannel = await resolveActivityLogChannel(guild);
  if (!logChannel?.isTextBased?.()) return;

  const audit = await resolveMemberUpdateAuditInfo(guild, newMember.user.id);
  const responsibleText = formatAuditActor(audit.executor);

  const lines = [
    `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsibleText}`,
    `<:VC_User:1482527453586002103> **Utente:** ${newMember.user} \`${newMember.user.id}\``,
    `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
  ];

  if (audit.reason) {
    lines.push(`<:VC_reason:1478517122929004544> **Motivo:** ${audit.reason}`);
  }

  lines.push("", "**<:VC_tools:1478862265305272364> Cambiamenti**");

  if (timeoutChanged) {
    lines.push("<:VC_Info:1482526956703580372> **Disabilitazione comunicazione fino a**");
    lines.push(`  ${buildTimeoutChangeLine(oldMember, newMember)}`);
  }

  if (nickChanged) {
    lines.push("<:VC_Modifica:1478859646587633717> **Nick**");
    lines.push(`  ${buildNickChangeLine(oldMember, newMember)}`);
  }

  const embed = new EmbedBuilder()
    .setColor("#F59E0B")
    .setTitle("<:VC_User:1482527453586002103> Membro Aggiornato")
    .setDescription(lines.join("\n"));

  await logChannel.send({ embeds: [embed] }).catch((err) => {
    global.logger.error("[guildMemberUpdate] Failed to send member update log:", err);
  });
}

async function sendMemberRoleUpdateLog(oldMember, newMember) {
  const guild = newMember?.guild || oldMember?.guild;
  if (!guild) return;
  if (!rolesChanged(oldMember, newMember)) return;

  const actionType = AuditLogEvent?.MemberRoleUpdate ?? AuditLogEvent?.MemberUpdate;
  const oldRoles = oldMember?.roles?.cache || new Map();
  const newRoles = newMember?.roles?.cache || new Map();
  const cacheAdditions = [];
  const cacheRemovals = [];

  for (const role of newRoles.values()) {
    if (role?.id === guild.id) continue;
    if (!oldRoles.has(role.id)) cacheAdditions.push(role);
  }
  for (const role of oldRoles.values()) {
    if (role?.id === guild.id) continue;
    if (!newRoles.has(role.id)) cacheRemovals.push(role);
  }
  if (!cacheAdditions.length && !cacheRemovals.length) return;

  const expectedAddedIds = new Set(cacheAdditions.map((role) => String(role?.id || "")).filter(Boolean));
  const expectedRemovedIds = new Set(cacheRemovals.map((role) => String(role?.id || "")).filter(Boolean));
  const audit = await resolveResponsible(guild, actionType, (entry) => { if (String(entry?.target?.id || "") !== String(newMember?.id || "")) return 0; let score = 3; const changes = Array.isArray(entry?.changes) ? entry.changes : []; const auditAddedIds = new Set(); const auditRemovedIds = new Set(); for (const change of changes) { const key = String(change?.key || ""); const raw = Array.isArray(change?.new) ? change.new : Array.isArray(change?.old) ? change.old : []; if (key !== "$add" && key !== "$remove") continue; for (const item of raw) { const id = String(item?.id || item?.role_id || "").trim(); if (!id) continue; if (key === "$add") auditAddedIds.add(id); if (key === "$remove") auditRemovedIds.add(id); } } if (!auditAddedIds.size && !auditRemovedIds.size) return score; for (const id of auditAddedIds) { if (expectedAddedIds.has(id)) score += 4; } for (const id of auditRemovedIds) { if (expectedRemovedIds.has(id)) score += 4; } if (auditAddedIds.size === expectedAddedIds.size && auditRemovedIds.size === expectedRemovedIds.size) { score += 6; } return score; },); const auditAdditions = []; const auditRemovals = [];
  const auditChanges = Array.isArray(audit?.entry?.changes) ? audit.entry.changes : [];
  for (const change of auditChanges) {
    const key = String(change?.key || "");
    const raw = Array.isArray(change?.new) ? change.new : Array.isArray(change?.old) ? change.old : [];
    if (key !== "$add" && key !== "$remove") continue;

    for (const item of raw) {
      const roleId = String(item?.id || item?.role_id || "").trim();
      if (!roleId || roleId === guild.id) continue;
      const role = guild.roles.cache.get(roleId);
      const fallback = {
        id: roleId, toString: () => `<@&${roleId}>`,
      };
      if (key === "$add") auditAdditions.push(role || fallback);
      if (key === "$remove") auditRemovals.push(role || fallback);
    }
  }

  const hasTrustedAuditDiff = auditAdditions.length > 0 || auditRemovals.length > 0;
  const usingFallbackDiff = !hasTrustedAuditDiff;
  const additions = hasTrustedAuditDiff ? auditAdditions : cacheAdditions;
  const removals = hasTrustedAuditDiff ? auditRemovals : cacheRemovals;
  if (!additions.length && !removals.length) return;
  const unverifiedDiffSize = additions.length + removals.length;
  if (usingFallbackDiff && unverifiedDiffSize > MAX_UNVERIFIED_ROLE_DIFF) return;

  const responsible = formatAuditActor(audit.executor);
  const executorId = String(audit?.executor?.id || "");
  if (shouldSkipRoleUpdateLog(guild.id, newMember.id, additions, removals)) return;

  const allowPublicAnn = await shouldSendPublicMemberAnnouncement(newMember);
  const gainingNormalVerification = normalVerificationCompletedBetween(oldMember, newMember);

  const logChannel = await resolveChannelRolesLogChannel(guild);
  if (logChannel?.isTextBased?.() && (allowPublicAnn || gainingNormalVerification)) {
    const lines = [
      `<:VC_Staff:1494286904089247754> **Responsabile:** ${responsible}`,
      `<:VC_User:1482527453586002103> **Utente:** ${newMember.user} \`${newMember.user.id}\``,
      `<:VC_Clock:1473359204189474886> ${toDiscordTimestamp(new Date(), "F")}`,
      "",
      "**<:VC_tools:1478862265305272364> Cambiamenti**",
    ];

    if (additions.length) {
      lines.push("<:success:1461731530333229226> **Additions:**");
      for (const role of additions.slice(0, 15)) {
        lines.push(`<a:VC_Arrow:1482706699365257397> ${role}`);
      }
    }

    if (removals.length) {
      lines.push("<:cancel:1461730653677551691> **Removals:**");
      for (const role of removals.slice(0, 15)) {
        lines.push(`<a:VC_Arrow:1482706699365257397> ${role}`);
      }
    }

    const embed = new EmbedBuilder()
      .setColor("#F59E0B")
      .setTitle("<:VC_User:1482527453586002103> Ruolo Membro Aggiornato")
      .setDescription(lines.join("\n"));

    await logChannel.send({ embeds: [embed] }).catch((err) => {
      global.logger.error("[guildMemberUpdate] Failed to send member role update log:", err);
    });
  }

  if (additions.length && hasTrustedAuditDiff) {
    await handleStaffRoleAssignmentGuard({
      guild,
      targetMember: newMember,
      addedRoles: additions,
      executorId,
      executor: audit.executor,
      client: guild.client,
    }).catch((err) => {
      global.logger?.warn?.("[guildMemberUpdate] staff role assignment guard:", newMember.id, err?.message || err);
    });
    await antiNukeHandleMemberRoleAddition({
      guild,
      targetMember: newMember,
      addedRoles: additions,
      executorId,
    });
  }
}

function hasManageRolesPermission(member) {
  const me = member.guild.members.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageRoles));
}

async function addPerkRoleIfPossible(member) {
  if (!PERK_ROLE_ID) return;
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const role = member.guild.roles.cache.get(PERK_ROLE_ID);
  if (!role) return;
  if (role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PERK_ROLE_ID)) return;

  const added = await member.roles.add(role).then(() => true).catch(() => false);
  if (added) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  if (!refreshedMember?.roles?.cache?.has(PERK_ROLE_ID)) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to add perk role:", member.guild.id, member.id, PERK_ROLE_ID);
  }
}

async function removePlusColorsIfNotEligible(member) {
  const me = member.guild.members.me;
  if (!me) return;
  if (!hasManageRolesPermission(member)) return;

  const unlocks = require("../Utils/Community/personalityColorUnlocks");
  const canPickPlus = await unlocks.memberHasPlusColorFullEligibilityAsync(member);
  const level = await unlocks.fetchNumericProfileLevel(member.guild.id, member.id);
  const allowedPlus = new Set(unlocks.listUnlockedPlusRoleIds(member.guild, canPickPlus, level));

  const heldPlusRoles = PLUS_COLOR_ROLE_IDS.filter((roleId) => member.roles.cache.has(roleId));
  const removableRoleIds = heldPlusRoles.filter((roleId) => {
    if (allowedPlus.has(roleId)) return false;
    const role = member.guild.roles.cache.get(roleId);
    return role && role.position < me.roles.highest.position;
  });
  if (!removableRoleIds.length) return;

  const removed = await member.roles.remove(removableRoleIds).then(() => true).catch(() => false);
  if (removed) return;
  const refreshedMember = await getGuildMemberCached(member.guild, member.id, { preferFresh: true });
  const stillHeldRoles = removableRoleIds.filter((roleId) => refreshedMember?.roles?.cache?.has(roleId));
  if (stillHeldRoles.length) {
    global.logger?.warn?.("[guildMemberUpdate] Failed to remove plus color roles:", member.guild.id, member.id, stillHeldRoles);
  }
}

async function sendBoostEmbeds(channel, member, times, boostCount, priorAnnouncedSlots = 0) {
  if (!channel?.isTextBased?.()) return 0;
  const safeTimes = Math.max(0, Number(times || 0));
  const start = Math.max(0, Math.floor(Number(priorAnnouncedSlots || 0)));
  if (safeTimes <= 0) return 0;

  const endExclusive = start + safeTimes;
  // Arrivando al 2° slot (insieme da 0→2 OPPURE 2° boost dopo un po'):
  // manda SOLO l'embed doppio, mai di nuovo quello da 1 boost.
  if (start < 2 && endExclusive >= 2) {
    const embed = buildBoostEmbedSecond(member, Math.max(1, Number(boostCount || 0)));
    const sent = await channel
      .send({
        content: buildBoostAnnounceContent(member.user),
        embeds: [embed],
      })
      .catch((err) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) return 0;
    return Math.max(0, 2 - start);
  }

  let sentCount = 0;
  for (let i = 0; i < safeTimes; i += 1) {
    const slotIndex = start + i;
    const remainingInBatch = safeTimes - i - 1;
    const countForEmbed = Math.max(1, Number(boostCount || 0) - remainingInBatch);
    const embed =
      slotIndex >= 1
        ? buildBoostEmbedSecond(member, countForEmbed)
        : buildBoostEmbed(member, countForEmbed);
    const sent = await channel
      .send({
        content: buildBoostAnnounceContent(member.user),
        embeds: [embed],
      })
      .catch((err) => {
        global.logger?.warn?.(
          "[guildMemberUpdate] boost embed send failed:",
          member?.id,
          err?.message || err,
        );
        return null;
      });
    if (!sent?.id) break;
    sentCount += 1;
    if (i + 1 < safeTimes) await sleep(350);
  }
  return sentCount;
}

async function trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member, guildId, nextCount) {
  const mainId = String(IDs.guilds.main || "");
  if (!mainId || String(member?.guild?.id || "") !== mainId) return;
  if (member.user?.bot) return;
  const next = Math.min(2, Math.max(0, Math.floor(Number(nextCount || 0))));
  setAnnouncedBoostSlots(guildId, member.id, next);
  await persistAnnouncedBoostSlotsToDb(guildId, member.id).catch(() => null);

  const doubleId = IDs?.roles?.DoubleBooster;
  if (!doubleId || !member?.roles?.add) return;
  const me = member.guild.members.me;
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) return;
  const role = member.guild.roles.cache.get(doubleId);
  if (!role || role.position >= me.roles.highest.position) return;
  if (next < 2 || member.roles.cache.has(doubleId)) return;
  const ok = await member.roles.add(doubleId).then(() => true).catch(() => false);
  if (!ok) {
    global.logger?.warn?.("[guildMemberUpdate] Double Booster add failed:", member.guild.id, member.id);
  }
}

function rolesChanged(oldMember, newMember) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;

  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role) => !newRoles.has(role.id)) ||
    newRoles.some((role) => !oldRoles.has(role.id))
  );
}

function getJoinGateNameCandidate(member) {
  return String(
    member?.user?.globalName ||
    member?.displayName ||
    member?.nickname ||
    member?.user?.username ||
    "",
  );
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

function wildcardToRegex(wildcard) {
  const escaped = String(wildcard || "").replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
  return new RegExp(`^${escaped}$`, "i");
}

function matchUsernameFilters(candidate, rules) {
  if (!rules?.enabled) return null;
  const normalized = normalizeText(candidate);
  if (!normalized) return null;

  const strictWords = Array.isArray(rules?.strictWords) ? rules.strictWords : [];
  for (const word of strictWords) {
    const normalizedWord = normalizeText(word);
    if (!normalizedWord) continue;
    if (normalized.includes(normalizedWord)) {
      return { type: "strict", value: word };
    }
  }

  const wildcardWords = Array.isArray(rules?.wildcardWords) ? rules.wildcardWords : [];
  for (const wildcard of wildcardWords) {
    const regex = wildcardToRegex(normalizeText(wildcard));
    if (regex.test(normalized)) {
      return { type: "wildcard", value: wildcard };
    }
  }

  return null;
}

async function sendJoinGatePostJoinDm(member, reason, extraLines = [], action = "") {
  const embed = new EmbedBuilder().setColor("#ED4245").setTitle("Join Gate").setDescription([`${ARROW} **Azione applicata dopo il join**`,
  `${ARROW} **Motivo:** ${reason}`,
  ...extraLines.filter(Boolean),
  ].join("\n"),
  );
  try {
    const components = String(action || "").toLowerCase() === "ban" ? [buildUnbanRequestRow()] : [];
    await member.send({ embeds: [embed], components });
    return true;
  } catch {
    return false;
  }
}

async function enforceJoinGatePostJoinUsername(oldMember, newMember) {
  if (!oldMember?.guild || !newMember?.user) return;
  if (newMember.user.bot) return;
  if (isSponsorJoinGateGuildId(newMember.guild.id)) return;
  if (await resolveJoinGateConfiguredExempt(newMember.guild, newMember.id, newMember)) return;

  const cfg = getJoinGateConfigSnapshot();
  if (!cfg?.enabled) return;
  if (!cfg?.usernameFilter?.enabled) return;
  if (!cfg?.usernameFilter?.postJoinEnabled) return;

  const oldCandidate = getJoinGateNameCandidate(oldMember);
  const newCandidate = getJoinGateNameCandidate(newMember);
  if (normalizeText(oldCandidate) === normalizeText(newCandidate)) return;

  const match = matchUsernameFilters(newCandidate, cfg.usernameFilter);
  if (!match) return;

  const action = String(cfg?.usernameFilter?.action || "kick").toLowerCase();
  const me = newMember.guild.members.me;
  const canKick = Boolean(me?.permissions?.has(PermissionsBitField.Flags.KickMembers)) && Boolean(newMember?.kickable);
  const canBan = Boolean(me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) && Boolean(newMember?.bannable);
  const canTimeout = Boolean(me?.permissions?.has(PermissionsBitField.Flags.ModerateMembers)) && Boolean(newMember?.moderatable);

  let punished = false;
  let appliedAction = action;
  const reason = "JoinGate post-join username filter match.";

  if (action === "kick" && canKick) {
    punished = await newMember.kick(reason).then(() => true).catch(() => false);
  } else if (action === "ban" && canBan) {
    punished = await newMember.guild.members
      .ban(newMember.id, { deleteMessageSeconds: 604800, reason })
      .then(() => true)
      .catch(() => false);
  } else if (action === "timeout" && canTimeout) {
    try {
      const { captureMuteRoleSnapshot } = require("../Services/Moderation/mutedMirrorRoleService");
      await captureMuteRoleSnapshot(newMember, { reason: "JoinGate post-join (pre-timeout)" });
    } catch (err) {
      global.logger?.warn?.("[JoinGate post-join] pre-timeout snapshot:", newMember.id, err?.message || err);
    }
    punished = await newMember
      .timeout(6 * 60 * 60_000, reason)
      .then(() => true)
      .catch(() => false);
  } else {
    appliedAction = "log";
  }

  if (!punished && appliedAction !== "log" && canTimeout) {
    try {
      const { captureMuteRoleSnapshot } = require("../Services/Moderation/mutedMirrorRoleService");
      await captureMuteRoleSnapshot(newMember, { reason: "JoinGate post-join fallback (pre-timeout)" });
    } catch (err) {
      global.logger?.warn?.("[JoinGate post-join] fallback pre-timeout snapshot:", newMember.id, err?.message || err);
    }
    punished = await newMember
      .timeout(6 * 60 * 60_000, "JoinGate post-join fallback timeout.")
      .then(() => true)
      .catch(() => false);
    if (punished) appliedAction = "timeout";
  }
  if (!punished && appliedAction !== "log") {
    appliedAction = "log";
  }

  let dmSent = false;
  if (punished && appliedAction !== "log" && cfg?.dmPunishedMembers !== false) {
    dmSent = await sendJoinGatePostJoinDm(newMember, reason, [
      `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
      `<:VC_Info:1482526956703580372> **Tipo di match:** ${match.type}`,
      `<:VC_Modifica:1478859646587633717> **Match:** ${match.value}`,
      `<:VC_Modifica:1478859646587633717> **Nome:** ${newCandidate || "N/A"}`,
    ], appliedAction);
  }

  if (punished && appliedAction !== "log" && newMember.guild?.client) {
    const modAction = appliedAction === "timeout" ? "MUTE" : appliedAction === "ban" ? "BAN" : "KICK";
    const durationMs = appliedAction === "timeout" ? 6 * 60 * 60_000 : null;
    const caseReason = `JoinGate post-join: ${reason}`;
    try {
      const config = await getModConfig(newMember.guild.id);
      const { doc, created } = await createModCase({ guildId: newMember.guild.id, action: modAction, userId: newMember.id, modId: newMember.client.user.id, reason: caseReason, durationMs, context: {}, dedupe: { enabled: true, windowMs: 15_000, matchReason: true }, });
      if (created) {
        await logModCase({ client: newMember.client, guild: newMember.guild, modCase: doc, config });
      }
    } catch (e) {
      global.logger?.warn?.("[JoinGate post-join] ModCase creation failed:", newMember.guild.id, newMember.id, e?.message || e);
    }
  }

  const modLogId = IDs.channels?.modLogs;
  const logChannel = modLogId ? (newMember.guild.channels.cache.get(modLogId) || (await getGuildChannelCached(newMember.guild, modLogId))) : null;
  if (!logChannel?.isTextBased?.()) return;

  const embed = punished ? new EmbedBuilder().setColor("#A97142").setTitle(`${newMember.user.username} has been ${String(appliedAction || "kick").toLowerCase() === "timeout" ? "timed out" : String(appliedAction || "kick").toLowerCase() === "ban" ? "banned" : "kicked"}!!`,
  )
    .setDescription(
      [
        `<:VC_User:1482527453586002103> **Membro:** ${newMember.user.username} [\`${newMember.user.id}\`]`,
        `<:VC_reason:1478517122929004544> **Motivo:** Username matches blocked pattern (post-join filter).`,
        `<:VC_Rules:1482527309868040393> **Regola:** Filtro username`,
        `<:VC_Action:1482527453586002103> **Azione:** ${String(appliedAction || "log").toUpperCase()}`,
        `<:VC_Info:1482526956703580372> **Tipo di match:** ${match.type}`,
        `<:VC_Modifica:1478859646587633717> **Match:** ${match.value}`,
        `<:VC_Modifica:1478859646587633717> **Nome vecchio:** ${oldCandidate || "N/A"}`,
        `<:VC_Modifica:1478859646587633717> **Nome nuovo:** ${newCandidate || "N/A"}`,
        "",
        "**<:VC_tools:1478862265305272364> Informazioni aggiuntive**",
        `<:VC_Info:1482526956703580372> **Membro messaggio diretto?** ${dmSent ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
        `<:VC_Info:1482526956703580372> **Membro punito?** ${punished ? "<a:VC_Verified:1482532479637127188>" : "<a:VC_Cross:1482532424570376253>"}`,
      ].join("\n"),
    )
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(newMember, { size: 256 }) || null)
    : buildJoinGateTriggeredEmbed(newMember, "Filtro username matchato.");

  await logChannel.send({ embeds: [embed] }).catch(() => { });
}

function computeBoostDelta(oldMember, newMember, guildId, opts = {}) {
  const currentCount = Number(newMember.guild.premiumSubscriptionCount || 0);
  const oldCountFromEvent = Number(oldMember?.guild?.premiumSubscriptionCount || 0);
  const snapshot = opts.prevCachedCount;
  const prevCount =
    typeof snapshot === "number" && Number.isFinite(snapshot)
      ? snapshot
      : typeof boostCountCache.get(guildId) === "number"
        ? boostCountCache.get(guildId)
        : oldCountFromEvent;
  // Non usare min(cache, guild.premiumSubscriptionCount): old/new condividono lo
  // stesso Guild, e un fetch() precedente azzera il delta (1 solo embed sul "2 volte").
  const effectivePrev = Number.isFinite(Number(prevCount)) ? Number(prevCount) : 0;
  const countIncreased = currentCount > effectivePrev;
  const boostDelta = countIncreased ? Math.max(1, currentCount - effectivePrev) : 0;
  const guildBoostDecreased = currentCount < effectivePrev;
  const boostDrop = guildBoostDecreased ? Math.max(0, effectivePrev - currentCount) : 0;

  return { currentCount, countIncreased, boostDelta, effectivePrev, guildBoostDecreased, boostDrop };
}

async function auditShowsRecentPremiumSinceChangeForMember(guild, memberId, maxAgeMs = 15000) {
  if (!guild?.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog)) return false;
  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 25 }).catch(() => null);
  if (!logs?.entries?.size) return false;
  const now = Date.now();
  const mid = String(memberId || "");
  for (const entry of logs.entries.values()) {
    if (String(entry.targetId || "") !== mid) continue;
    const age = now - entry.createdTimestamp;
    if (age > maxAgeMs || age < 0) continue;
    const changes = entry.changes || [];
    if (changes.some((c) => String(c.key) === "premium_since")) return true;
  }
  return false;
}

async function maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop }) {
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (!doubleBoosterId || mainId !== String(guildId) || !newMember?.roles?.cache) return;
  await ensureBoostSlotsSynced(guildId, newMember.id);
  if (!newMember.roles.cache.has(doubleBoosterId)) return;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  if (!newBoostTs) return;
  const d = Math.max(0, Math.floor(Number(drop || 0)));
  if (d < 1) return;

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const premiumChanged = (oldBoostTs || 0) !== (newBoostTs || 0);
  let treatAsThisMemberBoostChange = premiumChanged;
  if (!treatAsThisMemberBoostChange) {
    treatAsThisMemberBoostChange = await auditShowsRecentPremiumSinceChangeForMember(newMember.guild, newMember.id);
  }
  if (!treatAsThisMemberBoostChange) return;

  let slots = getAnnouncedBoostSlots(guildId, newMember.id);
  if (slots < 2) slots = 2;
  slots = Math.max(0, slots - d);
  setAnnouncedBoostSlots(guildId, newMember.id, slots);
  await persistAnnouncedBoostSlotsToDb(guildId, newMember.id);

  if (slots < 2) {
    const me = newMember.guild.members.me;
    const role = newMember.guild.roles.cache.get(doubleBoosterId);
    if (
      me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
      role &&
      role.position < me.roles.highest.position
    ) {
      await newMember.roles.remove(doubleBoosterId).catch(() => { });
    }
  }
  if (slots <= 0) await deleteAnnouncedBoostSlots(guildId, newMember.id);
}

function getBoostSystemMessageTypes() {
  return new Set(
    [
      MessageType?.GuildBoost,
      MessageType?.GuildBoostTier1,
      MessageType?.GuildBoostTier2,
      MessageType?.GuildBoostTier3,
      MessageType?.UserPremiumGuildSubscription,
      MessageType?.UserPremiumGuildSubscriptionTier1,
      MessageType?.UserPremiumGuildSubscriptionTier2,
      MessageType?.UserPremiumGuildSubscriptionTier3,
      8,
      9,
      10,
      11,
    ].filter((x) => typeof x === "number"),
  );
}

function parseNativeBoostSlotCount(message) {
  const boostTypes = getBoostSystemMessageTypes();
  const isBoostType = boostTypes.has(Number(message?.type));
  const raw = String(message?.content || "");
  // Il client mostra "2 volte"; in API il numero è spesso `**2**` o solo `"2"`.
  const text = raw.replace(/\*/g, " ").replace(/\s+/g, " ").trim();
  const isBoostText = /(ha\s+appena\s+potenziato\s+il\s+server|just\s+boosted\s+the\s+server)/i.test(text);
  if (!isBoostType && !isBoostText) return 0;

  if (/\b(due\s+volte|twice)\b/i.test(text)) return 2;
  const countMatch =
    text.match(/\b(\d{1,2})\s+volte\b/i) ||
    text.match(/\b(\d{1,2})\s+times\b/i) ||
    text.match(/\b(\d{1,2})\s+time\b/i);
  if (countMatch) {
    const parsed = Number(countMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.min(10, Math.floor(parsed)));
  }
  if (isBoostType && /^\d{1,2}$/.test(text)) {
    const parsed = Number(text);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(1, Math.min(10, Math.floor(parsed)));
  }
  return 1;
}

function mergeNativeBoostSlotEvents(events) {
  const list = Array.isArray(events) ? events.slice() : [];
  list.sort((a, b) => Number(a?.ts || 0) - Number(b?.ts || 0));
  const merged = [];
  const seenIds = new Set();
  for (const ev of list) {
    const id = String(ev?.id || "");
    if (id) {
      if (seenIds.has(id)) continue;
      seenIds.add(id);
    }
    const slots = Math.max(0, Math.min(2, Number(ev?.slots || 0)));
    const ts = Number(ev?.ts || 0);
    if (slots <= 0) continue;
    const last = merged[merged.length - 1];
    if (last && ts && last.ts && Math.abs(ts - last.ts) <= 5000) {
      last.slots = Math.max(last.slots, slots);
      last.ts = Math.max(last.ts, ts);
      continue;
    }
    merged.push({ id, ts, slots });
  }
  return Math.min(2, merged.reduce((sum, row) => sum + Number(row.slots || 0), 0));
}

async function collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, opts = {}) {
  if (!userId) return [];
  const minTs = Math.max(0, Number(opts.minTs || 0));
  const limit = Math.max(20, Math.min(100, Number(opts.limit || 80)));
  const channels = await resolveBoostNativeScanChannelsAsync(guild, primaryChannel);
  const events = [];
  for (const channel of channels) {
    const recent = await channel.messages.fetch({ limit }).catch(() => null);
    if (!recent) continue;
    for (const m of recent.values()) {
      const messageUserId = resolveNativeBoostMessageUserId(m, guild);
      if (!messageUserId || String(messageUserId) !== String(userId)) continue;
      const ts = Number(m.createdTimestamp || 0);
      if (minTs > 0 && ts && ts < minTs) continue;
      const slots = parseNativeBoostSlotCount(m);
      if (slots > 0) events.push({ id: String(m.id || ""), ts, slots });
    }
  }
  return events;
}

function channelIdIsBoostNativeRecoveryTarget(guild, channelId) {
  if (!guild || String(guild.id) !== String(IDs.guilds?.main || "")) return false;
  const id = String(channelId || "");
  if (!id) return false;
  if (id === String(IDs.channels?.supporters || "")) return true;
  if (guild.systemChannelId && id === String(guild.systemChannelId)) return true;
  if (guild.publicUpdatesChannelId && id === String(guild.publicUpdatesChannelId)) return true;
  if (guild.rulesChannelId && id === String(guild.rulesChannelId)) return true;
  return false;
}

async function resolveBoostNativeScanChannelsAsync(guild, primaryChannel) {
  const list = [];
  const seen = new Set();
  function push(ch) {
    if (!ch?.id) return;
    const sid = String(ch.id);
    if (seen.has(sid)) return;
    if (!ch.isTextBased?.()) return;
    seen.add(sid);
    list.push(ch);
  }
  push(primaryChannel);
  if (!guild) return list;
  // Solo canali dove Discord posta i boost: niente scan di tutta la guild (era la causa del ritardo).
  const ids = [
    guild.systemChannelId,
    guild.publicUpdatesChannelId,
    guild.rulesChannelId,
    IDs.channels?.supporters,
  ].filter((x) => x != null && String(x).length > 10);
  for (const rawId of ids) {
    const sid = String(rawId);
    let ch = guild.channels.cache.get(sid);
    if (!ch) ch = await guild.channels.fetch(sid).catch(() => null);
    push(ch);
  }
  return list;
}

async function detectRecentNativeBoostEventsForUser(guild, primaryChannel, userId, windowMs = 10 * 60 * 1000) {
  if (!primaryChannel?.isTextBased?.() || !userId) return 0;
  const minTs = Date.now() - Math.max(60 * 1000, Number(windowMs || 0));
  const events = await collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, {
    minTs,
    limit: 80,
  }).catch(() => []);
  return mergeNativeBoostSlotEvents(events);
}

async function countNativeBoostEventsSince(guild, primaryChannel, userId, sinceMs) {
  if (!primaryChannel?.isTextBased?.() || !userId) return 0;
  const minTs = Math.max(0, Number(sinceMs || 0) - 2000);
  const events = await collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, {
    minTs,
    limit: 40,
  }).catch(() => []);
  return mergeNativeBoostSlotEvents(events);
}

async function resolveNativeBoostSignalsSince(guild, primaryChannel, userId, sinceMs, opts = {}) {
  const seen = nativeBoostSeenSince(guild?.id, userId, sinceMs);
  if (seen > 0) return seen;
  if (opts.allowChannelScan !== true) return 0;
  return countNativeBoostEventsSince(guild, primaryChannel, userId, sinceMs);
}

async function announceBoostEmbedsAfterNativeWait({
  boostAnnounceChannel,
  member,
  guildId,
  boostKey,
  expectedSlots = 1,
  currentCount = 0,
  premiumSinceTs = 0,
  startedAt = Date.now(),
}) {
  const expectedNew = Math.max(1, Number(expectedSlots || 1));
  const lookbackMs = Math.max(120_000, Date.now() - startedAt + 30_000);
  const tryRecover = async (knownNativeSlots = expectedNew) =>
    recoverMissingBoostEmbedsForUser(member.guild, member.id, {
      nativeLookbackMs: lookbackMs,
      startedAt,
      knownNativeSlots,
      expectedSlots: Math.max(expectedNew, knownNativeSlots),
    }).catch(() => ({ ok: false, sent: 0 }));

  const sync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: expectedNew,
  }).catch(() => null);
  let nativeSinceStart = Math.max(
    Number(sync?.nativeBoostEvents || 0),
    nativeBoostSeenSince(guildId, member.id, startedAt),
    expectedNew,
  );

  if (nativeSinceStart > 0 || Date.now() - startedAt >= 400) {
    const recovered = await tryRecover(Math.max(expectedNew, nativeSinceStart));
    if (Math.max(0, Number(recovered?.sent || 0)) > 0) {
      nativeSinceStart = Math.max(
        nativeSinceStart,
        nativeBoostSeenSince(guildId, member.id, startedAt),
      );
      if (nativeSinceStart >= 2 && Number(recovered.sent || 0) >= 2) {
        await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
          sinceMs: startedAt - 1000,
          nativeLookbackMs: lookbackMs,
          knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
        });
        return true;
      }
    }
    const syncAfter = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
      sinceMs: startedAt - 1000,
      nativeLookbackMs: lookbackMs,
      knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
    }).catch(() => null);
    const announcedAfter = Number(syncAfter?.announcedSlots || 0);
    const nativeAfter = Math.max(nativeSinceStart, Number(syncAfter?.nativeBoostEvents || 0));
    if (syncAfter && syncAfter.missing <= 0 && (announcedAfter >= 2 || nativeAfter >= 2)) {
      await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
        sinceMs: startedAt - 1000,
        nativeLookbackMs: lookbackMs,
        knownNativeSlots: Math.max(expectedNew, nativeAfter),
      });
      return true;
    }
    nativeSinceStart = Math.max(nativeSinceStart, nativeAfter);
  }

  const announcedSoFar = Math.max(
    getAnnouncedBoostSlots(guildId, member.id),
    Number(sync?.announcedSlots || 0),
  );
  const maxWaitMs =
    expectedNew >= 2 || nativeSinceStart >= 2 || announcedSoFar >= 1
      ? BOOST_NATIVE_WAIT_MAX_MS
      : BOOST_NATIVE_WAIT_SINGLE_MS;
  if (Date.now() - startedAt < maxWaitMs) return false;

  const finalSync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: Math.max(expectedNew, nativeSinceStart),
    skipNativeScan: false,
  }).catch(() => null);
  const finalNative = Math.max(
    expectedNew,
    nativeSinceStart,
    Number(finalSync?.nativeBoostEvents || 0),
    nativeBoostSeenSince(guildId, member.id, startedAt),
  );
  await tryRecover(finalNative);
  await markBoostAnnounceHandledIfSynced(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: finalNative,
    skipNativeScan: false,
  });
  let missingAfter = Number((await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
    sinceMs: startedAt - 1000,
    nativeLookbackMs: lookbackMs,
    knownNativeSlots: finalNative,
    skipNativeScan: false,
  }).catch(() => null))?.missing || 0);
  if (missingAfter > 0) {
    clearBoostAnnounceHandled(boostKey);
    const forced = await recoverMissingBoostEmbedsForUser(member.guild, member.id, {
      knownNativeSlots: Math.max(2, finalNative),
      expectedSlots: Math.max(2, finalNative),
      startedAt,
      nativeLookbackMs: Math.max(lookbackMs, 30 * 60 * 1000),
      allowSecondRecovery: true,
      skipNativeScan: false,
      currentCount,
      maxSend: missingAfter,
    }).catch(() => ({ ok: false, sent: 0 }));
    const forcedSent = Math.max(0, Number(forced?.sent || 0));
    if (forcedSent > 0) {
      missingAfter = Math.max(0, missingAfter - forcedSent);
    }
    if (missingAfter > 0) {
      scheduleBoostFollowup(boostAnnounceChannel, member, guildId, boostKey, {
        expectedSlots: Math.min(2, finalNative + missingAfter),
        currentCount,
        premiumSinceTs,
      });
    }
  }
  return true;
}

async function tryDispatchBoostAnnounceImmediately(boostAnnounceChannel, member, guildId, boostKey, opts = {}) {
  const expectedSlots = Math.max(1, Number(opts.expectedSlots || 1));
  return recoverMissingBoostEmbedsForUser(member.guild, member.id, {
    knownNativeSlots: expectedSlots,
    expectedSlots,
    startedAt: Date.now(),
    nativeLookbackMs: 180_000,
    skipNativeScan: expectedSlots >= 2,
    currentCount: opts.currentCount,
    nativeEventIncrement: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || 0) || undefined,
  }).catch(() => ({ ok: false, sent: 0 }));
}

async function announceBoostFromMemberUpdate(boostAnnounceChannel, member, guildId, boostKey, opts = {}) {
  const result = await tryDispatchBoostAnnounceImmediately(boostAnnounceChannel, member, guildId, boostKey, opts);
  const sent = Math.max(0, Number(result?.sent || 0));
  // Un solo avviso native "2 volte": il primo embed parte subito, il secondo arriva dal follow-up.
  if (sent >= 2) return;
  scheduleBoostFollowup(boostAnnounceChannel, member, guildId, boostKey, opts);
}

function scheduleBoostAnnounceAfterNative(boostAnnounceChannel, member, guildId, boostKey, opts = {}) {
  const startedAt = Date.now();
  const expectedSlots = Math.max(1, Number(opts.expectedSlots || 1));
  const currentCount = Number(opts.currentCount || 0);
  const premiumSinceTs = Number(opts.premiumSinceTs || member.premiumSinceTimestamp || 0);
  const recoverOpts = {
    knownNativeSlots: expectedSlots,
    expectedSlots,
    startedAt,
    nativeLookbackMs: 180_000,
    nativeEventIncrement: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || 0) || undefined,
  };

  recoverMissingBoostEmbedsForUser(member.guild, member.id, recoverOpts).catch(() => null);

  boostFollowupLocks.delete(boostKey);
  boostFollowupLocks.set(boostKey, true);

  const release = () => {
    boostFollowupLocks.delete(boostKey);
  };

  const poll = async () => {
    try {
      const sync = await resolveBoostAnnounceSyncState(member.guild, member.id, boostAnnounceChannel, {
        sinceMs: startedAt - 1000,
        knownNativeSlots: expectedSlots,
      }).catch(() => null);
      if (sync && Number(sync.announcedSlots || 0) >= 2) {
        release();
        return;
      }
      const seenNative = nativeBoostSeenSince(guildId, member.id, startedAt);
      const maxWaitMs =
        expectedSlots >= 2 || seenNative >= 2 || Number(sync?.announcedSlots || 0) >= 1
          ? BOOST_NATIVE_WAIT_MAX_MS
          : BOOST_NATIVE_WAIT_SINGLE_MS;
      const done = await announceBoostEmbedsAfterNativeWait({
        boostAnnounceChannel,
        member,
        guildId,
        boostKey,
        expectedSlots,
        currentCount,
        premiumSinceTs,
        startedAt,
      });
      if (done) {
        release();
        return;
      }
      if (Date.now() - startedAt >= maxWaitMs) {
        release();
        return;
      }
      setTimeout(poll, BOOST_NATIVE_WAIT_POLL_MS).unref?.();
    } catch (err) {
      global.logger?.warn?.("[guildMemberUpdate] boost native wait failed:", member?.id, err?.message || err);
      release();
    }
  };

  setTimeout(poll, BOOST_NATIVE_WAIT_INITIAL_MS).unref?.();
}

function scheduleBoostFollowup(boostAnnounceChannel, newMember, guildId, boostKey, opts = {}) {
  scheduleBoostAnnounceAfterNative(boostAnnounceChannel, newMember, guildId, boostKey, opts);
}

async function handleBoostUpdate(oldMember, newMember) {
  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return;
  const boostAnnounceChannel = newMember.guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(newMember.guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return;

  const guildId = newMember.guild.id;
  const mainIdForBoost = String(IDs.guilds.main || "");
  if (mainIdForBoost && String(guildId) === mainIdForBoost) {
    await ensureBoostSlotsSynced(guildId, newMember.id);
  }

  const oldBoostTs = oldMember.premiumSinceTimestamp || 0;
  const newBoostTs = newMember.premiumSinceTimestamp || 0;
  const boostKey = `${guildId}:${newMember.id}`;
  const mainId = String(IDs.guilds.main || "");
  const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
  if (mainIdForBoost && String(guildId) === mainIdForBoost && oldBoostTs > 0 && !newBoostTs) {
    boostAnnounceCache.delete(boostKey);
    await deleteAnnouncedBoostSlots(guildId, newMember.id);
    if (
      doubleBoosterId &&
      newMember.roles.cache.has(doubleBoosterId)
    ) {
      const me = newMember.guild.members.me;
      const role = newMember.guild.roles.cache.get(doubleBoosterId);
      if (
        me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
        role &&
        role.position < me.roles.highest.position
      ) {
        await newMember.roles.remove(doubleBoosterId).catch(() => { });
      }
    }
  }

  const prevCachedBoostCount =
    typeof boostCountCache.get(guildId) === "number"
      ? boostCountCache.get(guildId)
      : Number(oldMember?.guild?.premiumSubscriptionCount || 0);

  if (mainIdForBoost && String(guildId) === mainIdForBoost && oldBoostTs > 0 && newBoostTs > 0) {
    await newMember.guild.fetch().catch(() => {});
  }

  // Aggiorna il conteggio boost da Discord per il footer, ma il delta usa lo snapshot
  // precedente: fetch() muta lo stesso Guild di oldMember e azzererebbe +2 → +0.
  const freshBoostCount = await resolveFreshGuildBoostCount(newMember.guild).catch(() => null);
  if (Number.isFinite(Number(freshBoostCount))) {
    try {
      newMember.guild.premiumSubscriptionCount = Number(freshBoostCount);
    } catch (ePc) {}
  }

  const { currentCount, countIncreased, boostDelta, guildBoostDecreased, boostDrop } = computeBoostDelta(
    oldMember,
    newMember,
    guildId,
    { prevCachedCount: prevCachedBoostCount },
  );
  if (guildBoostDecreased && boostDrop > 0) {
    await maybeRevokeDoubleBoosterAfterSlotLoss({ oldMember, newMember, guildId, drop: boostDrop }).catch((err) => {
      global.logger?.warn?.("[guildMemberUpdate] Double Booster partial revoke:", newMember?.id, err?.message || err);
    });
  }

  const alreadyBoostingBefore = oldBoostTs > 0;
  const startedBoostingNow = !alreadyBoostingBefore && newBoostTs > 0;
  const boosterRoleId = IDs?.roles?.ServerBooster || null;
  const boosterRoleAdded = Boolean(boosterRoleId && oldMember?.roles?.cache && newMember?.roles?.cache && !oldMember.roles.cache.has(boosterRoleId) && newMember.roles.cache.has(boosterRoleId));
  const boosterRoleAddedWithoutPremiumSince = boosterRoleAdded && !oldBoostTs && !newBoostTs;
  const premiumSinceChanged = alreadyBoostingBefore && newBoostTs > 0 && newBoostTs !== oldBoostTs;
  const realNewBoost = newBoostTs > 0 && countIncreased;
  const recentNativeSlots = nativeBoostSeenSince(guildId, newMember.id, Date.now() - NATIVE_BOOST_ACCUMULATE_MS);
  const shouldAnnounce = Boolean(
    startedBoostingNow ||
    realNewBoost ||
    (premiumSinceChanged && (countIncreased || recentNativeSlots > 0)) ||
    (boosterRoleAddedWithoutPremiumSince && (countIncreased || recentNativeSlots > 0)),
  );
  if (!shouldAnnounce) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  if (shouldSkipDuplicateBoostAnnounce(boostKey, countIncreased, currentCount, newBoostTs)) {
    boostCountCache.set(guildId, currentCount);
    return;
  }

  if (boostAnnounceSendLocks.has(boostKey)) {
    boostCountCache.set(guildId, currentCount);
    scheduleBoostFollowup(boostAnnounceChannel, newMember, guildId, boostKey, {
      expectedSlots: Math.min(2, Math.max(1, recentNativeSlots || 1)),
      currentCount,
      premiumSinceTs: newBoostTs,
    });
    return;
  }

  boostCountCache.set(guildId, currentCount);
  void addPerkRoleIfPossible(newMember).catch(() => null);
  let alreadyAnnouncedSlots = getAnnouncedBoostSlots(guildId, newMember.id);
  if (startedBoostingNow && alreadyAnnouncedSlots > 0) {
    setAnnouncedBoostSlots(guildId, newMember.id, 0);
    await persistAnnouncedBoostSlotsToDb(guildId, newMember.id).catch(() => null);
    alreadyAnnouncedSlots = 0;
  }
  let expectedSlots;
  if (startedBoostingNow) {
    expectedSlots = Math.min(2, Math.max(1, recentNativeSlots || 1));
  } else {
    expectedSlots = Math.min(
      2,
      Math.max(alreadyAnnouncedSlots + 1, recentNativeSlots || 0, 1),
    );
  }
  expectedSlots = Math.max(1, expectedSlots);
  await announceBoostFromMemberUpdate(boostAnnounceChannel, newMember, guildId, boostKey, {
    expectedSlots,
    currentCount,
    premiumSinceTs: newBoostTs,
    nativeEventIncrement: !startedBoostingNow,
    nativeEventSlots: Math.max(1, recentNativeSlots >= 2 ? 2 : 1),
  });
  recoverConcurrentNativeBoosts(newMember.guild, boostAnnounceChannel, { windowMs: 3 * 60 * 1000 }).catch(() => null);
}

async function collectRecentNativeBoosterCandidates(guild, primaryChannel, opts = {}) {
  const maxWindowMs = opts.longWindow
    ? Math.max(60_000, Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.maxWindowMs || 48 * 60 * 60 * 1000)))
    : 10 * 60 * 1000;
  const windowMs = Math.max(60_000, Math.min(maxWindowMs, Number(opts.windowMs || 3 * 60 * 1000)));
  const fetchLimit = Math.max(60, Math.min(100, Number(opts.messageLimit || 100)));
  const minTs = Date.now() - windowMs;
  const channels = await resolveBoostNativeScanChannelsAsync(guild, primaryChannel);
  const eventsByUser = new Map();
  for (const channel of channels) {
    const recent = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
    if (!recent) continue;
    for (const message of recent.values()) {
      const ts = Number(message.createdTimestamp || 0);
      if (!ts || ts < minTs) continue;
      const slots = parseNativeBoostSlotCount(message);
      if (slots <= 0) continue;
      const uid = resolveNativeBoostMessageUserId(message, guild);
      if (!uid) continue;
      const list = eventsByUser.get(uid) || [];
      list.push({ id: String(message.id || ""), ts, slots });
      eventsByUser.set(uid, list);
    }
  }
  const byUser = new Map();
  for (const [uid, events] of eventsByUser.entries()) {
    const slots = mergeNativeBoostSlotEvents(events);
    if (slots <= 0) continue;
    let firstTs = Number.POSITIVE_INFINITY;
    let lastTs = 0;
    for (const ev of events) {
      const ts = Number(ev?.ts || 0);
      if (!ts) continue;
      firstTs = Math.min(firstTs, ts);
      lastTs = Math.max(lastTs, ts);
    }
    byUser.set(uid, {
      slots,
      lastTs,
      firstTs: Number.isFinite(firstTs) ? firstTs : lastTs,
    });
  }
  return { byUser, windowMs, minTs };
}

async function recoverBoostEmbedsForUserUntilComplete(guild, channel, userId, opts = {}) {
  const uid = String(userId || "");
  if (!uid) return { sent: 0, reason: "invalid_user" };
  const expected = Math.max(1, Math.min(2, Number(opts.expected || 1)));
  const maxPasses = Math.max(1, Math.min(5, Number(opts.maxPasses || 3)));
  const embedSinceMs = Number.isFinite(Number(opts.embedSinceMs))
    ? Math.max(0, Number(opts.embedSinceMs))
    : Math.max(0, Number(opts.startedAt || 0) - 1000);
  const nativeLookbackMs = Math.max(60_000, Number(opts.nativeLookbackMs || 48 * 60 * 60 * 1000));
  const startedAt = Number.isFinite(Number(opts.startedAt)) ? Number(opts.startedAt) : Date.now() - nativeLookbackMs;

  clearBoostAnnounceHandled(`${String(guild?.id || "")}:${uid}`);
  let totalSent = 0;
  let lastReason = "";

  for (let pass = 0; pass < maxPasses; pass += 1) {
    const embedCount = await countRecentBotBoostAnnouncesForUser(channel, uid, {
      sinceMs: embedSinceMs,
      limit: 100,
    }).catch(() => 0);
    if (embedCount >= expected) {
      lastReason = "complete";
      break;
    }
    const result = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: expected,
      expectedSlots: expected,
      startedAt,
      nativeLookbackMs,
      allowSecondRecovery: expected >= 2,
    }).catch(() => ({ ok: false, sent: 0, reason: "exception" }));
    const sent = Math.max(0, Number(result?.sent || 0));
    lastReason = String(result?.reason || (sent > 0 ? "sent" : "no_progress"));
    if (sent <= 0) break;
    totalSent += sent;
    await sleep(500);
  }

  return { sent: totalSent, reason: lastReason, expected };
}

async function recoverConcurrentNativeBoosts(guild, primaryChannel, opts = {}) {
  const gid = String(guild?.id || "");
  const mainId = String(IDs.guilds?.main || "");
  if (!gid || !mainId || gid !== mainId) return { ok: false, reason: "not_main_guild" };
  const { byUser, windowMs } = await collectRecentNativeBoosterCandidates(guild, primaryChannel, opts);
  let embedsSent = 0;
  for (const [uid, row] of byUser.entries()) {
    const slots = Math.max(1, Math.min(2, Number(row?.slots || 1)));
    const result = await recoverBoostEmbedsForUserUntilComplete(guild, primaryChannel, uid, {
      expected: slots,
      startedAt: Number(row?.firstTs || Date.now() - windowMs),
      embedSinceMs: Math.max(0, Number(row?.firstTs || 0) - 10 * 60 * 1000),
      nativeLookbackMs: windowMs,
    }).catch(() => ({ sent: 0 }));
    embedsSent += Math.max(0, Number(result?.sent || 0));
    if (byUser.size > 1) await sleep(400);
  }
  return { ok: true, users: byUser.size, embedsSent };
}

async function resolveFreshGuildBoostCount(guild, fallbackCount = null) {
  const gid = String(guild?.id || "");
  const freshGuild = await guild?.fetch?.().catch(() => null);
  const fromFresh = Number(freshGuild?.premiumSubscriptionCount);
  if (Number.isFinite(fromFresh) && fromFresh >= 0) {
    if (gid) boostCountCache.set(gid, fromFresh);
    return fromFresh;
  }
  const fromGuild = Number(guild?.premiumSubscriptionCount);
  if (Number.isFinite(fromGuild) && fromGuild >= 0) {
    if (gid) boostCountCache.set(gid, fromGuild);
    return fromGuild;
  }
  const fromFallback = Number(fallbackCount);
  if (Number.isFinite(fromFallback) && fromFallback >= 0) return fromFallback;
  const fromCache = Number(boostCountCache.get(gid));
  return Number.isFinite(fromCache) && fromCache >= 0 ? fromCache : 0;
}

async function recoverMissingBoostEmbedsForUser(guild, userId, opts = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  if (!gid || !uid) return { ok: false, reason: "invalid_input" };
  const boostKey = `${gid}:${uid}`;
  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel =
    guild.channels.cache.get(boostChannelId) ||
    (await getGuildChannelCached(guild, boostChannelId).catch(() => null));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };
  const member =
    guild.members.cache.get(uid) ||
    (await getGuildMemberCached(guild, uid, { ttlMs: 30_000, preferFresh: true }).catch(() => null));
  if (!member || member.user?.bot) return { ok: false, reason: "member_not_found" };
  const mainId = String(IDs.guilds.main || "");
  if (mainId && gid === mainId) {
    await ensureBoostSlotsSynced(gid, uid).catch(() => null);
  }
  const latestCount = await resolveFreshGuildBoostCount(guild, opts.currentCount);
  const nativeLookbackMs = Math.max(
    60_000,
    Math.min(14 * 24 * 60 * 60 * 1000, Number(opts.nativeLookbackMs ?? 10 * 60 * 1000)),
  );
  const sinceMs = Number.isFinite(Number(opts.startedAt))
    ? Math.max(0, Number(opts.startedAt) - 1000)
    : Date.now() - nativeLookbackMs;
  const sync = await resolveBoostAnnounceSyncState(guild, uid, boostAnnounceChannel, {
    sinceMs,
    nativeLookbackMs,
    knownNativeSlots: Number(opts.knownNativeSlots || 0),
    skipNativeScan: Boolean(opts.skipNativeScan),
  }).catch(() => null);
  const forcedSlots = Math.max(0, Number(opts.knownNativeSlots || 0));
  const announcedSlots = Math.max(0, Number(sync?.announcedSlots || 0));
  let nativeBoostEvents = Math.max(forcedSlots, Number(sync?.nativeBoostEvents || 0));
  const seenNativeSlots = nativeBoostSeenSince(gid, uid, sinceMs);
  nativeBoostEvents = Math.max(nativeBoostEvents, seenNativeSlots);
  if (nativeBoostEvents <= 0) {
    const premiumSince = Number(member.premiumSinceTimestamp || 0);
    const expected = Math.max(0, Number(opts.expectedSlots || opts.knownNativeSlots || 0));
    const announceWindowStart = Number.isFinite(Number(opts.startedAt))
      ? Math.max(0, Number(opts.startedAt) - 120_000)
      : sinceMs - 60_000;
    if (premiumSince > 0 && (premiumSince >= announceWindowStart || expected > 0)) {
      nativeBoostEvents = Math.max(1, Math.min(2, expected || 1));
    } else if (expected > 0) {
      nativeBoostEvents = Math.min(2, expected);
    } else {
      return { ok: true, sent: 0, reason: "no_native_signals" };
    }
  }
  const slotTarget = resolveBoostSlotTarget(member, announcedSlots, nativeBoostEvents, forcedSlots, {
    startedAt: opts.startedAt,
    nativeLookbackMs,
    nativeSeenSlots: seenNativeSlots,
    expectedSlots: Number(opts.expectedSlots || 0),
    secondBoostConfirmed: Boolean(opts.secondBoostConfirmed || opts.allowSecondRecovery),
    allowSecondRecovery: Boolean(opts.allowSecondRecovery),
    incrementalNativeEvent: Boolean(opts.nativeEventIncrement),
    nativeEventSlots: Number(opts.nativeEventSlots || opts.knownNativeSlots || 0),
  });
  if (slotTarget <= 0) return { ok: true, sent: 0, reason: "not_boosting" };
  const periodSinceMs = boostAnnouncePeriodSinceMs(member, opts, nativeLookbackMs);
  const embedCounts = await countRecentBotBoostAnnouncesForUserMulti(boostAnnounceChannel, uid, {
    sinceMs,
    periodSinceMs,
    lookbackMs: nativeLookbackMs,
    limit: 100,
  }).catch(() => ({ since: 0, period: 0, lookback: 0 }));
  const channelEmbedsInPeriod = Math.max(0, Number(embedCounts.period || 0));
  // Slot già contati: canale + stato persistito (il 2° boost "dopo un po'" non deve
  // ripartire da 0 e rimandare anche l'embed da 1 boost).
  const priorSlots = Math.max(channelEmbedsInPeriod, announcedSlots);
  if (priorSlots >= slotTarget) {
    await syncAnnouncedBoostSlotsFromChannelCount(gid, uid, Math.max(announcedSlots, priorSlots));
    await markBoostAnnounceHandledIfSynced(guild, uid, boostAnnounceChannel, {
      sinceMs,
      nativeLookbackMs,
      knownNativeSlots: slotTarget,
    });
    return { ok: true, sent: 0, reason: "already_announced_in_period" };
  }
  const channelSinceStart = Math.max(0, Number(embedCounts.since || 0));
  const channelInLookback = Math.max(0, Number(embedCounts.lookback || 0));
  const recoveryStartedAt = Number.isFinite(Number(opts.startedAt)) ? Number(opts.startedAt) : 0;
  const recentRecovery =
    recoveryStartedAt > 0 && Date.now() - recoveryStartedAt <= nativeLookbackMs;
  let extraMissing = Math.max(0, slotTarget - priorSlots);
  if (recentRecovery) {
    if (forcedSlots > 0) {
      extraMissing = Math.max(extraMissing, Math.max(0, forcedSlots - Math.max(channelSinceStart, priorSlots)));
    }
    extraMissing = Math.max(extraMissing, Math.max(0, nativeBoostEvents - Math.max(channelInLookback, priorSlots)));
  }
  extraMissing = Math.min(extraMissing, Math.max(0, slotTarget - priorSlots));
  if (extraMissing <= 0) {
    await markBoostAnnounceHandledIfSynced(guild, uid, boostAnnounceChannel, {
      sinceMs,
      nativeLookbackMs,
      knownNativeSlots: nativeBoostEvents,
    });
    return { ok: true, sent: 0 };
  }
  if (boostAnnounceSendLocks.has(boostKey)) {
    await new Promise((resolve) => setTimeout(resolve, 200)).catch(() => { });
    if (boostAnnounceSendLocks.has(boostKey)) return { ok: true, sent: 0, reason: "send_in_progress" };
  }
  boostAnnounceSendLocks.add(boostKey);
  try {
    if (channelSinceStart >= nativeBoostEvents && forcedSlots <= 0 && priorSlots >= slotTarget) {
      await markBoostAnnounceHandledIfSynced(guild, uid, boostAnnounceChannel, {
        sinceMs,
        nativeLookbackMs,
        knownNativeSlots: nativeBoostEvents,
      });
      return { ok: true, sent: 0, reason: "already_in_channel" };
    }
    await addPerkRoleIfPossible(member).catch(() => { });
    const maxSend = Math.max(0, Math.floor(Number(opts.maxSend || 0)));
    const toSend = maxSend > 0 ? Math.min(extraMissing, maxSend) : extraMissing;
    const sentNow = await sendBoostEmbeds(boostAnnounceChannel, member, toSend, latestCount, priorSlots);
    if (sentNow <= 0) {
      return { ok: true, sent: 0, reason: "send_failed" };
    }
    await trackBoostSlotsAnnouncedAndMaybeGrantDoubleBooster(member, gid, priorSlots + sentNow);
    rememberBoostAnnounce(boostKey, latestCount, member.premiumSinceTimestamp);
    await markBoostAnnounceHandledIfSynced(guild, uid, boostAnnounceChannel, {
      sinceMs,
      nativeLookbackMs,
      knownNativeSlots: nativeBoostEvents,
    });
    return { ok: true, sent: sentNow };
  } finally {
    boostAnnounceSendLocks.delete(boostKey);
  }
}

async function recoverLastGlobalNativeBoostEmbedsOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel =
    guild.channels.cache.get(boostChannelId) ||
    (await getGuildChannelCached(guild, boostChannelId).catch(() => null));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const messageTarget = Math.max(1, Math.min(10, Number(opts.messageLimit ?? opts.limit ?? 2)));
  const lookbackMs = Math.max(
    60 * 60 * 1000,
    Math.min(14 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs ?? 7 * 24 * 60 * 60 * 1000)),
  );
  const fetchLimit = Math.max(30, Math.min(100, Number(opts.fetchPerChannel ?? 100)));
  const channels = await resolveBoostNativeScanChannelsAsync(guild, boostAnnounceChannel);
  const minTs = Date.now() - lookbackMs;
  const collected = [];
  for (const ch of channels) {
    const recent = await ch.messages.fetch({ limit: fetchLimit }).catch(() => null);
    if (!recent) continue;
    for (const m of recent.values()) {
      const ts = Number(m.createdTimestamp || 0);
      if (!ts || ts < minTs) continue;
      if (parseNativeBoostSlotCount(m) <= 0) continue;
      if (!resolveNativeBoostMessageUserId(m, guild)) continue;
      collected.push(m);
    }
  }
  const byId = new Map();
  for (const m of collected) {
    byId.set(String(m.id), m);
  }
  const unique = [...byId.values()].sort((a, b) => Number(b.createdTimestamp || 0) - Number(a.createdTimestamp || 0));
  const top = unique.slice(0, messageTarget);
  let embedsSent = 0;
  for (const m of top) {
    const uid = resolveNativeBoostMessageUserId(m, guild);
    if (!uid) continue;
    const r = await recoverMissingBoostEmbedsForUser(guild, uid, { nativeLookbackMs: lookbackMs }).catch(() => ({
      ok: false,
      sent: 0,
    }));
    embedsSent += Math.max(0, Number(r?.sent || 0));
    await sleep(700);
  }
  return { ok: true, boostsExamined: top.length, embedsSent };
}

async function recoverRecentBoostEmbedsOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const boostAnnounceChannel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!boostAnnounceChannel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const limit = Math.max(1, Math.min(5, Number(opts.limit || 2)));
  const lookbackMs = Math.max(5 * 60 * 1000, Math.min(24 * 60 * 60 * 1000, Number(opts.lookbackMs || 2 * 60 * 60 * 1000)));
  const now = Date.now();
  const fallbackMemberScan = opts?.fallbackMemberScan !== false;
  const fallbackChannelScan = opts?.fallbackChannelScan !== false;
  const debugEnabled =
    opts?.debug === true || String(process.env.BOOST_RECOVERY_DEBUG || "").trim() === "1";

  const me = guild.members?.me || null;
  const perms = me && boostAnnounceChannel?.permissionsFor ? boostAnnounceChannel.permissionsFor(me) : null;
  const canViewChannel = Boolean(perms?.has?.(PermissionsBitField.Flags.ViewChannel));
  const canReadHistory = Boolean(perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory));
  const canSend = Boolean(perms?.has?.(PermissionsBitField.Flags.SendMessages));

  let candidates = [];
  const canReadAudit = Boolean(
    guild.members?.me?.permissions?.has?.(PermissionsBitField.Flags.ViewAuditLog),
  );
  let auditCandidates = 0;
  let memberCandidates = 0;
  let channelCandidates = 0;
  let channelFetchOk = null;
  let memberFetchOk = null;
  let candidateCounts = null;
  if (canReadAudit) {
    const audits = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: 50 }).catch(() => null);
    const entries = audits?.entries ? Array.from(audits.entries.values()) : [];
    for (const entry of entries) {
      const createdMs = Number(entry?.createdTimestamp || 0);
      if (!createdMs || now - createdMs > lookbackMs) continue;
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      const hasPremiumSinceChange = changes.some((c) => String(c?.key || "").toLowerCase() === "premium_since");
      if (!hasPremiumSinceChange) continue;
      const targetId = String(entry?.target?.id || "");
      if (!targetId) continue;
      candidates.push({ targetId, createdMs });
    }
    auditCandidates = candidates.length;
  }

  if (!candidates.length && fallbackMemberScan) {
    const members = await guild.members.fetch().catch(() => null);
    memberFetchOk = Boolean(members);
    const rows = members ? Array.from(members.values()) : [];
    const minTs = now - lookbackMs;
    const fromMembers = [];
    for (const member of rows) {
      const ts = Number(member?.premiumSinceTimestamp || 0);
      if (!ts || ts < minTs) continue;
      fromMembers.push({ targetId: String(member.id), createdMs: ts });
    }
    candidates = fromMembers;
    memberCandidates = candidates.length;
  }

  if (!candidates.length && fallbackChannelScan) {
    const recentBoostMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
    channelFetchOk = Boolean(recentBoostMessages);
    const recent = recentBoostMessages ? Array.from(recentBoostMessages.values()) : [];
    const minTs = now - lookbackMs;
    const typeCounts = {};
    const samples = [];
    const fromChannel = [];
    for (const m of recent) {
      if (!m?.author?.id) continue;
      const createdMs = Number(m.createdTimestamp || 0);
      if (!createdMs || createdMs < minTs) continue;
      const t = Number(m.type);
      typeCounts[String(Number.isFinite(t) ? t : "NaN")] = Number(typeCounts[String(t)] || 0) + 1;
      if (samples.length < 6) {
        samples.push({
          id: String(m.id || ""),
          type: Number.isFinite(t) ? t : null,
          system: Boolean(m.system),
          authorId: String(m.author?.id || ""),
          contentLen: Number(String(m.content || "").length),
          hasEmbeds: Array.isArray(m.embeds) && m.embeds.length > 0,
          createdTimestamp: createdMs,
        });
      }
      const slotCount = parseNativeBoostSlotCount(m);
      if (slotCount <= 0) continue;
      const targetId = resolveNativeBoostMessageUserId(m, guild);
      if (!targetId) continue;
      fromChannel.push({ targetId, createdMs, slotCount });
    }
    candidates = fromChannel;
    channelCandidates = candidates.length;
    if (candidates.length) {
      candidateCounts = candidates.reduce((acc, c) => {
        const id = String(c?.targetId || "");
        if (!id) return acc;
        acc[id] = Number(acc[id] || 0) + Math.max(1, Number(c?.slotCount || 1));
        return acc;
      }, {});
    }
    if (debugEnabled) {
      global.logger?.info?.("[BOOST RECOVERY DEBUG] channel scan:", {
        boostTypes: Array.from(getBoostSystemMessageTypes().values()),
        typeCounts,
        samples,
      });
    }
  }

  const counts = candidateCounts || candidates.reduce((acc, c) => {
    const id = String(c?.targetId || "");
    if (!id) return acc;
    acc[id] = Number(acc[id] || 0) + Math.max(1, Number(c?.slotCount || 1));
    return acc;
  }, {});
  const orderedUserIds = Object.entries(counts)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0))
    .slice(0, limit)
    .map(([id]) => id);

  if (!orderedUserIds.length) {
    const debug = { canReadAudit, auditCandidates, memberFetchOk, memberCandidates, channelFetchOk, channelCandidates, canViewChannel, canReadHistory, canSend, lookbackMs, limit };
    if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] no candidates:", debug);
    return { ok: true, recovered: 0, debug };
  }

  const recentMessages = await boostAnnounceChannel.messages.fetch({ limit: 80 }).catch(() => null);
  const recent = recentMessages ? Array.from(recentMessages.values()) : [];
  const botIdForBoostRecovery = String(client.user?.id || "");
  const countAlreadyAnnounced = (userId) => {
    const needle = `<@${String(userId)}>`;
    let n = 0;
    for (const m of recent) {
      if (!m) continue;
      if (String(m.author?.id || "") !== botIdForBoostRecovery) continue;
      const embeds = Array.isArray(m.embeds) ? m.embeds : [];
      const embedTexts = embeds.map((e) =>
        [e?.title || "", e?.description || "", e?.footer?.text || ""].join("\n"),
      );
      const text = [m.content || "", ...embedTexts].join("\n");
      if (!text.includes(needle)) continue;
      if (!boostAnnounceLooksLikeBoost(text)) continue;
      n += 1;
    }
    return n;
  };

  const freshGuild = await guild.fetch().catch(() => null);
  const currentCount = Number(freshGuild?.premiumSubscriptionCount || guild.premiumSubscriptionCount || 0);
  boostCountCache.set(guild.id, currentCount);

  let recovered = 0;
  for (const targetId of orderedUserIds) {
    const want = Math.max(1, Number(counts[String(targetId)] || 1));
    const already = countAlreadyAnnounced(targetId);
    let missing = Math.max(0, want - already);

    const member = await getGuildMemberCached(guild, targetId, { preferFresh: true }).catch(() => null);
    const user = member?.user || (await client.users.fetch(String(targetId)).catch(() => null));
    if (!user) continue;
    if (member && !Number(member.premiumSinceTimestamp || 0)) continue;

    await ensureBoostSlotsSynced(guild.id, targetId);

    if (missing <= 0) continue;

    if (member) await addPerkRoleIfPossible(member).catch(() => { });
    const recovery = await recoverMissingBoostEmbedsForUser(guild, targetId, {
      nativeLookbackMs: lookbackMs,
      knownNativeSlots: want,
      expectedSlots: want,
      startedAt: Number(member?.premiumSinceTimestamp || 0) || undefined,
      allowSecondRecovery: want >= 2,
    }).catch(() => ({ ok: false, sent: 0 }));
    const sent = Math.max(0, Number(recovery?.sent || 0));
    recovered += sent;
    if (sent <= 0) continue;
    await sleep(900);
  }

  const debug = debugEnabled ? { canReadAudit, auditCandidates, memberFetchOk, memberCandidates, channelFetchOk, channelCandidates, canViewChannel, canReadHistory, canSend, lookbackMs, limit } : undefined;
  if (debugEnabled) global.logger?.info?.("[BOOST RECOVERY DEBUG] done:", { recovered, debug });
  return { ok: true, recovered, debug };
}

function extractBoostAnnounceTargetUserId(content) {
  const m = String(content || "").match(/<@!?(\d{17,20})>/);
  return m ? m[1] : "";
}

function extractEmbedDescription(embed) {
  if (!embed) return "";
  const fromData = embed.data && typeof embed.data.description === "string" ? embed.data.description : "";
  if (fromData) return fromData;
  return typeof embed.description === "string" ? embed.description : "";
}

function parseBoostCountFromFooter(footerText) {
  const m = String(footerText || "").match(/Ora siamo a\s*(\d+)\s*boost/i);
  return m ? Math.max(0, Number(m[1]) || 0) : 0;
}

async function correctMisleadingSingleBoostEmbedsOnStartup(client) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const channel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const me = guild.members?.me;
  const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory) || !perms?.has?.(PermissionsBitField.Flags.ManageMessages)) {
    return { ok: false, reason: "missing_perms_edit" };
  }

  await guild.members.fetch().catch(() => null);

  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!batch) return { ok: false, reason: "fetch_failed" };

  const botUid = String(client.user?.id || "");
  const sorted = [...batch.values()].sort((a, b) => Number(b?.createdTimestamp || 0) - Number(a?.createdTimestamp || 0));
  const userIdsWithNewerDoubleEmbed = new Set();
  for (const msg of sorted) {
    if (String(msg.author?.id || "") !== botUid) continue;
    const uidScan = extractBoostAnnounceTargetUserId(msg.content);
    if (!uidScan) continue;
    const descScan = extractEmbedDescription(msg.embeds?.[0]);
    if (!descScan || !descScan.includes("GRAZIE")) continue;
    if (descScan.includes("DOPPIO") && /boost/i.test(descScan)) userIdsWithNewerDoubleEmbed.add(uidScan);
  }

  const alreadyCorrectedUserIds = new Set();
  let fixed = 0;

  for (const msg of sorted) {
    if (String(msg.author?.id || "") !== botUid) continue;
    const uid = extractBoostAnnounceTargetUserId(msg.content);
    if (!uid || alreadyCorrectedUserIds.has(uid)) continue;
    const emb = msg.embeds?.[0];
    const desc = extractEmbedDescription(emb);
    if (!desc) continue;
    if (desc.includes("DOPPIO")) continue;
    if (!desc.includes("PER IL BOOST!")) continue;
    if (userIdsWithNewerDoubleEmbed.has(uid)) continue;

    const announced = getAnnouncedBoostSlots(guild.id, uid);
    const embedTs = Number(msg.createdTimestamp || 0);
    const sessionSlots = await getMemberBoostSlotSignals(guild, uid, channel, {
      sinceMs: embedTs > 0 ? embedTs - 10 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000,
      perChannelLimit: 100,
    }).catch(() => 0);
    const slotSignals = Math.max(announced, sessionSlots);
    if (slotSignals < 2) continue;

    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member) continue;

    const recovery = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: 2,
      expectedSlots: 2,
      startedAt: embedTs > 0 ? embedTs - 1000 : Number(member.premiumSinceTimestamp || 0),
      nativeLookbackMs: 24 * 60 * 60 * 1000,
      allowSecondRecovery: true,
    }).catch(() => ({ ok: false, sent: 0 }));
    const sent = Math.max(0, Number(recovery?.sent || 0));
    if (sent <= 0) continue;

    alreadyCorrectedUserIds.add(uid);
    fixed += sent;
  }

  if (fixed > 0) {
    global.logger?.info?.("[guildMemberUpdate] sent missing second boost embeds:", fixed);
  }

  return { ok: true, fixed };
}

async function backfillAnnouncedBoostSlotsFromSupportersHistory(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId || !client?.user?.id) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const channel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const me = guild.members?.me;
  const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory)) {
    return { ok: false, reason: "missing_read_history" };
  }

  const fetchLimit = Math.max(50, Math.min(300, Number(opts.fetchLimit || 200)));
  const batch = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!batch) return { ok: false, reason: "fetch_failed" };

  const botUid = String(client.user.id);
  const counts = new Map();
  for (const m of batch.values()) {
    if (String(m.author?.id || "") !== botUid) continue;
    const uid = extractBoostAnnounceTargetUserId(m.content);
    if (!uid || !isValidGuildUserId(guildId, uid)) continue;
    const embeds = Array.isArray(m.embeds) ? m.embeds : [];
    const embedTexts = embeds.map((e) =>
      [e?.title || "", e?.description || "", e?.footer?.text || ""].join("\n"),
    );
    const text = [m.content || "", ...embedTexts].join("\n");
    const needle = `<@${String(uid)}>`;
    if (!text.includes(needle)) continue;
    const looksLikeBoost = (
      /grazie\s+per\s+il\s+boost/i.test(text) ||
      /per\s+il\s+doppio\s+boost/i.test(text) ||
      /per\s+il\s+boost/i.test(text) ||
      /ora\s+siamo\s+a\s+\d+\s+boost/i.test(text)
    );
    if (!looksLikeBoost) continue;
    counts.set(uid, Math.min(10, Number(counts.get(uid) || 0) + 1));
  }

  if (!counts.size) {
    clearAnnouncedBoostSlotsMemoryForGuild(guildId);
    return { ok: true, updated: 0, scannedUsers: 0 };
  }

  const userIds = [...counts.keys()];
  const existing = await ActivityUserProfile.find({ guildId, userId: { $in: userIds } })
    .select("userId profile.serverBoostAnnouncedSlotCount")
    .lean()
    .catch(() => []);

  const prevByUser = new Map(
    (existing || []).map((d) => [String(d.userId), Math.max(0, Math.floor(Number(d?.profile?.serverBoostAnnouncedSlotCount || 0)))]),
  );

  let updated = 0;
  for (const [uid, chCount] of counts.entries()) {
    const prev = Math.max(0, Number(prevByUser.get(uid) || 0));
    const next = Math.min(10, Math.max(prev, chCount));
    if (next <= 0 || next === prev) continue;
    const ok = await ActivityUserProfile.findOneAndUpdate(
      { guildId, userId: uid },
      {
        $set: {
          guildId,
          userId: uid,
          "profile.serverBoostAnnouncedSlotCount": next,
        },
      },
      { upsert: true, setDefaultsOnInsert: true },
    ).then(() => true).catch(() => false);
    if (ok) updated += 1;
  }

  clearAnnouncedBoostSlotsMemoryForGuild(guildId);
  return { ok: true, updated, scannedUsers: counts.size };
}

async function reconcileDoubleBoosterRolesOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild =
    client.guilds.cache.get(guildId) ||
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const doubleBoosterId = String(IDs?.roles?.DoubleBooster || "").trim();
  if (!doubleBoosterId) return { ok: false, reason: "no_double_role_id" };
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) {
    return { ok: false, reason: "missing_manage_roles" };
  }
  const role = guild.roles.cache.get(doubleBoosterId);
  if (!role || role.position >= me.roles.highest.position) {
    return { ok: false, reason: "role_not_manageable" };
  }

  const maxUsers = Math.max(10, Math.min(1000, Number(opts.maxUsers || 300)));
  const rows = await ActivityUserProfile.find({
    guildId,
    "profile.serverBoostAnnouncedSlotCount": { $gte: 2 },
  })
    .select("userId profile.serverBoostAnnouncedSlotCount")
    .limit(maxUsers)
    .lean()
    .catch(() => []);

  let assigned = 0;
  let scanned = 0;
  for (const row of rows) {
    const userId = String(row?.userId || "").trim();
    if (!/^\d{17,20}$/.test(userId)) continue;
    scanned += 1;

    const member = await getGuildMemberCached(guild, userId, {
      preferFresh: true,
    }).catch(() => null);
    if (!member || member.user?.bot) continue;
    if (!member.premiumSinceTimestamp) continue;
    if (member.roles.cache.has(doubleBoosterId)) continue;

    const ok = await member.roles.add(doubleBoosterId).then(() => true).catch(() => false);
    if (ok) assigned += 1;
  }

  return { ok: true, scanned, assigned };
}

async function fetchGuildPremiumSubscriptionsMap(guild) {
  return new Map();
}

async function getMemberBoostSlotSignals(guild, userId, channel, opts = {}) {
  const gid = String(guild?.id || "");
  const uid = String(userId || "");
  if (!gid || !uid) return 0;
  await ensureBoostSlotsSynced(gid, uid).catch(() => null);
  const announced = getAnnouncedBoostSlots(gid, uid);
  const lookbackMs = Math.max(60_000, Number(opts.lookbackMs || 7 * 24 * 60 * 60 * 1000));
  const sinceMs = Number.isFinite(Number(opts.sinceMs)) ? Math.max(0, Number(opts.sinceMs)) : 0;
  const nativeSlots = await countNativeBoostSlotsInRecentMessages(guild, channel, uid, {
    perChannelLimit: Math.max(20, Number(opts.perChannelLimit || 100)),
    sinceMs: sinceMs > 0 ? sinceMs : Date.now() - lookbackMs,
  }).catch(() => 0);
  let roleSlots = 0;
  if (!opts.ignoreDoubleBoosterRole) {
    const member =
      guild.members.cache.get(uid) ||
      (await getGuildMemberCached(guild, uid, { preferFresh: true, ttlMs: 30_000 }).catch(() => null));
    const doubleBoosterId = IDs?.roles?.DoubleBooster || null;
    if (doubleBoosterId && member?.roles?.cache?.has(doubleBoosterId)) roleSlots = 2;
  }
  return Math.min(2, Math.max(announced, nativeSlots, roleSlots));
}

async function countNativeBoostSlotsInRecentMessages(guild, primaryChannel, userId, opts = {}) {
  if (!primaryChannel?.isTextBased?.() || !userId) return 0;
  const perChannelLimit = Math.max(20, Math.min(100, Number(opts.perChannelLimit || 100)));
  const minTs = Number.isFinite(Number(opts.sinceMs)) ? Math.max(0, Number(opts.sinceMs)) : 0;
  const events = await collectNativeBoostSlotEventsForUser(guild, primaryChannel, userId, {
    minTs,
    limit: perChannelLimit,
  }).catch(() => []);
  return mergeNativeBoostSlotEvents(events);
}

async function buildBoostAnnounceEmbedIndex(channel, botUid, fetchLimit = 200) {
  const byUser = new Map();
  const batch = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!batch) return byUser;
  for (const msg of batch.values()) {
    if (String(msg.author?.id || "") !== botUid) continue;
    const uid = extractBoostAnnounceTargetUserId(msg.content);
    if (!uid) continue;
    const desc = extractEmbedDescription(msg.embeds?.[0]);
    const text = [msg.content || "", desc].join("\n");
    if (!boostAnnounceLooksLikeBoost(text)) continue;
    const row = byUser.get(uid) || { total: 0, hasDouble: false };
    row.total += 1;
    if (desc.includes("DOPPIO") && /boost/i.test(desc)) row.hasDouble = true;
    byUser.set(uid, row);
  }
  return byUser;
}

async function recoverMissingSecondBoostEmbedsOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId || !client?.user?.id) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const channel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const me = guild.members?.me;
  const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory) || !perms?.has?.(PermissionsBitField.Flags.SendMessages)) {
    return { ok: false, reason: "missing_channel_perms" };
  }

  const lookbackMs = Math.max(
    24 * 60 * 60 * 1000,
    Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || 7 * 24 * 60 * 60 * 1000)),
  );
  const recoverySinceMs = Date.now() - lookbackMs;
  const maxRecover = Math.max(1, Math.min(50, Number(opts.maxRecover || 15)));
  const fetchLimit = Math.max(50, Math.min(300, Number(opts.fetchLimit || 200)));
  const botUid = String(client.user.id);
  const embedIndex = await buildBoostAnnounceEmbedIndex(channel, botUid, fetchLimit);
  await guild.members.fetch().catch(() => null);
  const members = await guild.members.fetch().catch(() => null);
  let memberEntries = [];
  if (members) {
    memberEntries = [...members.values()].filter((m) => m.premiumSinceTimestamp && !m.user?.bot);
  } else {
    const candidateIds = new Set();
    for (const [uid, row] of embedIndex.entries()) {
      if (row.total >= 1 && !row.hasDouble) candidateIds.add(String(uid));
    }
    for (const uid of candidateIds) {
      const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
      if (member?.premiumSinceTimestamp && !member.user?.bot) memberEntries.push(member);
    }
  }
  if (!memberEntries.length) return { ok: false, reason: "member_fetch_failed" };

  let scanned = 0;
  let recovered = 0;
  let embedsSent = 0;

  for (const member of memberEntries) {
    scanned += 1;

    const uid = String(member.id);
    const indexRow = embedIndex.get(uid) || { total: 0, hasDouble: false };

    await ensureBoostSlotsSynced(guildId, uid).catch(() => null);
    const announced = getAnnouncedBoostSlots(guildId, uid);
    if (announced >= 2 || indexRow.hasDouble) continue;

    const recentNativeSlots = await countNativeBoostSlotsInRecentMessages(guild, channel, uid, {
      perChannelLimit: fetchLimit,
      sinceMs: recoverySinceMs,
    }).catch(() => 0);
    if (recentNativeSlots < 2) continue;

    const channelEmbedsRecent = Math.max(
      indexRow.hasDouble ? 2 : indexRow.total,
      await countRecentBotBoostAnnouncesForUser(channel, uid, {
        sinceMs: recoverySinceMs,
        limit: 100,
      }).catch(() => indexRow.total),
    );
    const effectiveEmbeds = Math.max(channelEmbedsRecent, Math.min(announced, 2));
    const missing = Math.min(1, 2 - effectiveEmbeds);
    if (missing <= 0) continue;
    if (recovered >= maxRecover) break;

    const result = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: 2,
      expectedSlots: 2,
      startedAt: recoverySinceMs,
      nativeLookbackMs: lookbackMs,
      allowSecondRecovery: true,
      maxSend: missing,
    }).catch(() => ({ ok: false, sent: 0 }));
    const sent = Math.max(0, Number(result?.sent || 0));
    if (sent > 0) {
      recovered += 1;
      embedsSent += sent;
      await sleep(900);
    }
    if (recovered >= maxRecover) break;
  }

  return { ok: true, scanned, recovered, embedsSent };
}

async function recoverUnannouncedBoostersOnStartup(client, opts = {}) {
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const boostChannelId = IDs.channels.supporters;
  if (!boostChannelId) return { ok: false, reason: "no_boost_channel" };
  const channel = guild.channels.cache.get(boostChannelId) || (await getGuildChannelCached(guild, boostChannelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };

  const me = guild.members?.me;
  const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory) || !perms?.has?.(PermissionsBitField.Flags.SendMessages)) {
    return { ok: false, reason: "missing_channel_perms" };
  }

  const lookbackMs = Math.max(
    60 * 60 * 1000,
    Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || 48 * 60 * 60 * 1000)),
  );
  const maxRecover = Math.max(1, Math.min(50, Number(opts.maxRecover || 25)));

  await guild.members.fetch().catch(() => null);

  const { byUser: nativeByUser, windowMs, minTs } = await collectRecentNativeBoosterCandidates(guild, channel, {
    windowMs: lookbackMs,
    longWindow: true,
    messageLimit: 100,
  });

  const candidateIds = new Set(nativeByUser.keys());
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    const premiumSince = Number(member.premiumSinceTimestamp || 0);
    if (premiumSince && premiumSince >= minTs) candidateIds.add(String(member.id));
  }

  let embedsSent = 0;
  let membersScanned = 0;
  let membersRecovered = 0;
  let membersSkipped = 0;

  for (const uid of candidateIds) {
    if (embedsSent >= maxRecover) break;
    const member =
      guild.members.cache.get(uid) ||
      (await getGuildMemberCached(guild, uid, { preferFresh: true, ttlMs: 30_000 }).catch(() => null));
    if (!member || member.user?.bot) continue;
    membersScanned += 1;

    const nativeRow = nativeByUser.get(uid) || null;
    const premiumSince = Number(member.premiumSinceTimestamp || 0);
    const embedSinceMs = nativeRow?.firstTs
      ? Math.max(0, Number(nativeRow.firstTs) - 10 * 60 * 1000)
      : Math.max(0, premiumSince - 1000);

    const slotSignals = await getMemberBoostSlotSignals(guild, uid, channel, {
      lookbackMs,
      sinceMs: embedSinceMs,
      perChannelLimit: 100,
    }).catch(() => 0);
    const expected = Math.min(2, Math.max(1, Number(nativeRow?.slots || 0), slotSignals));

    const embedCount = await countRecentBotBoostAnnouncesForUser(channel, uid, {
      sinceMs: embedSinceMs,
      limit: 100,
    }).catch(() => 0);
    if (embedCount >= expected) {
      membersSkipped += 1;
      continue;
    }

    const result = await recoverBoostEmbedsForUserUntilComplete(guild, channel, uid, {
      expected,
      startedAt: nativeRow?.firstTs || premiumSince || minTs,
      embedSinceMs,
      nativeLookbackMs: lookbackMs,
      maxPasses: 4,
    }).catch(() => ({ sent: 0, reason: "exception" }));

    const sent = Math.max(0, Number(result?.sent || 0));
    const afterCount = await countRecentBotBoostAnnouncesForUser(channel, uid, {
      sinceMs: embedSinceMs,
      limit: 100,
    }).catch(() => embedCount + sent);

    if (sent > 0) {
      membersRecovered += 1;
      embedsSent += sent;
      global.logger?.info?.(
        "[guildMemberUpdate] unannounced booster recovery:",
        uid,
        `sent=${sent}`,
        `expected=${expected}`,
        `had=${embedCount}`,
        `now=${afterCount}`,
      );
    } else if (afterCount < expected) {
      global.logger?.warn?.(
        "[guildMemberUpdate] unannounced booster recovery skipped:",
        uid,
        `reason=${result?.reason || "unknown"}`,
        `expected=${expected}`,
        `had=${embedCount}`,
      );
    }
    await sleep(500);
  }

  return {
    ok: true,
    embedsSent,
    membersScanned,
    membersRecovered,
    membersSkipped,
    nativeUsers: nativeByUser.size,
    candidates: candidateIds.size,
  };
}

async function ensureCustomVocAccess(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageChannels)) return;

  const { syncCustomVocChannelForOwner } = require("../Services/Community/customVocPermissionsService");
  await syncCustomVocChannelForOwner(guild, newMember.id).catch(() => {});
}

async function syncCustomVocEligibilityWindow(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.customVocChannelId) return;

  const hasRequiredRole = CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS.some((roleId) => newMember.roles.cache.has(roleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  const eligible = hasRequiredRole || hasEventWeek2Grant || hasEventWeek3Grant || hasContestExtraUnlock;

  if (eligible) {
    if (doc.customVocEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customVocEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customVocEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customVocEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

async function syncCustomRoleEligibilityWindow(newMember) {
  const guild = newMember?.guild;
  if (!guild || !newMember?.id) return;
  const guildId = String(guild.id);
  const userId = String(newMember.id);

  const doc = await CustomRole.findOne({ guildId, userId }).lean().catch(() => null);
  if (!doc?.roleId && !doc?.secondaryRoleId) return;

  const hasRequiredRole = CUSTOM_ROLE_VOC_ELIGIBLE_ROLE_IDS.some((roleId) => newMember.roles.cache.has(roleId));
  const hasEventWeek2Grant = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
  const hasEventWeek3Grant = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
  const hasContestExtraUnlock = await hasExtraCustomPerksUnlock(guildId, userId).catch(() => false);
  const eligible = hasRequiredRole || hasEventWeek2Grant || hasEventWeek3Grant || hasContestExtraUnlock;

  if (eligible) {
    if (doc.customRoleEligibilityLostAt) {
      await CustomRole.updateOne(
        { guildId, userId },
        { $set: { customRoleEligibilityLostAt: null } },
      ).catch(() => { });
    }
    return;
  }

  if (!doc.customRoleEligibilityLostAt) {
    await CustomRole.updateOne(
      { guildId, userId },
      { $set: { customRoleEligibilityLostAt: new Date() } },
    ).catch(() => { });
  }
}

module.exports = {
  name: "guildMemberUpdate",
  channelIdIsBoostNativeRecoveryTarget,
  handleNativeBoostSystemMessage,
  recoverMissingBoostEmbedsForUser,
  recoverConcurrentNativeBoosts,
  recoverLastGlobalNativeBoostEmbedsOnStartup,
  recoverRecentBoostEmbedsOnStartup,
  correctMisleadingSingleBoostEmbedsOnStartup,
  backfillAnnouncedBoostSlotsFromSupportersHistory,
  reconcileDoubleBoosterRolesOnStartup,
  recoverMissingSecondBoostEmbedsOnStartup,
  recoverUnannouncedBoostersOnStartup,
  countNativeBoostSlotsInRecentMessages,
  countRecentBotBoostAnnouncesForUser,
  __test: {
    resolveBoostSlotTarget,
    noteNativeBoostSeen,
    nativeBoostSeenSince,
    resolveBoosterUserIdFromBoostContent,
    parseNativeBoostSlotCount,
    computeBoostDelta,
  },
  async execute(oldMember, newMember, client) {
    try {
      if (!oldMember || !newMember?.guild || !newMember?.user) return;
      if (!isViniliFullFeatureGuild(newMember.guild.id)) return;
      if (String(newMember.guild.id) === String(IDs.guilds?.main || "")) {
        await handlePreMemberRoleOnMemberUpdate(oldMember, newMember).catch((err) => {
          global.logger?.warn?.("[guildMemberUpdate] preMember role:", newMember.id, err?.message || err);
        });
        const memberRoleId = String(IDs.roles?.Member || "").trim();
        if (
          memberRoleId &&
          !newMember.user?.bot &&
          !oldMember.roles.cache.has(memberRoleId) &&
          newMember.roles.cache.has(memberRoleId)
        ) {
          try {
            const record = await upsertVerifiedMember(newMember.guild.id, newMember.id, new Date());
            await applyTenureForMember(newMember, record);
          } catch (err) {
            global.logger?.warn?.(
              "[guildMemberUpdate] verification tenure on Member add:",
              newMember.id,
              err?.message || err,
            );
          }
        }
        const canAnnNow = await shouldSendPublicMemberAnnouncement(newMember);
        const couldAnnBefore = await shouldSendPublicMemberAnnouncement(oldMember);
        if (canAnnNow && !couldAnnBefore) {
          await runDeferredJoinAnnouncements(newMember).catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] deferred join announce:", newMember.guild.id, newMember.id, err?.message || err);
          });
        }
      }
      await syncStaffCmdsThreadsForMemberChange(oldMember, newMember).catch(() => { });
      await syncStaffChatThreadsForMemberChange(oldMember, newMember).catch(() => { });
      await sponsorVerifiedRequiresMain
        .handleGuildMemberUpdate(oldMember, newMember, client)
        .catch((err) => {
          global.logger?.warn?.("[guildMemberUpdate] sponsorVerifiedRequiresMain:", err?.message || err);
        });
      await sendMemberUpdateLog(oldMember, newMember);
      await syncMutedMirrorRoleFromMemberUpdate(oldMember, newMember).catch((err) => {
        global.logger?.warn?.("[guildMemberUpdate] muted mirror role:", newMember.id, err?.message || err);
      });
      try {
        const { memberIsMuted } = require("../Events/interaction/unmuteWebsiteHandlers");
        const { autoClosePendingAppealsForUser } = require("../Utils/Web/siteStaffAppealsRuntime");
        const wasMuted = memberIsMuted(oldMember);
        const isMuted = memberIsMuted(newMember);
        if (wasMuted && !isMuted) {
          void autoClosePendingAppealsForUser(newMember.guild, newMember.id, "unmute").catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] appeal auto-close unmute:", newMember.id, err?.message || err);
          });
        }
      } catch (_) {}
      await sendMemberRoleUpdateLog(oldMember, newMember);
      await enforceJoinGatePostJoinUsername(oldMember, newMember);
      const resolvedClientForClan = client || newMember.client;
      if (resolvedClientForClan) {
        await syncClanTagRolesForUserEverywhereAfterMemberEvent(resolvedClientForClan, newMember.user);
      }

      const botClient = client || newMember.client;
      if (newMember?.guild?.id === IDs.guilds.main && botClient) {
        await handleMainGuildMemberUpdate(oldMember, newMember).catch((err) => {
          global.logger?.warn?.("[guildMemberUpdate] staff access mirror:", newMember.id, err?.message || err);
        });
        const stafferDelMeseId = String(IDs.roles?.StafferDelMese || "").trim();
        if (
          stafferDelMeseId &&
          !oldMember.roles.cache.has(stafferDelMeseId) &&
          newMember.roles.cache.has(stafferDelMeseId)
        ) {
          await grantBestStaffPauseBonusYear(newMember.guild.id, newMember.id).catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] bestStaffPauseBonusYear:", newMember.id, err?.message || err);
          });
        }
        if (didStaffMembershipChange(oldMember, newMember) || didStaffListDisplayRolesChange(oldMember, newMember)) {
          await recordManualStaffRoleHistoryIfNeeded(oldMember, newMember).catch((err) => {
            global.logger?.warn?.("[guildMemberUpdate] manual staff rolesHistory:", newMember.id, err?.message || err);
          });
          scheduleStaffListRefresh(botClient, newMember.guild.id);
          const oldRank = getMemberStaffRankRoleId(oldMember);
          const newRank = getMemberStaffRankRoleId(newMember);
          if (oldRank !== newRank) {
            void scheduleAcceptedPauseMessagesRefreshAfterRankChange(newMember.guild, newMember.id);
          }
          if (!memberHasStaffRole(oldMember) && memberHasStaffRole(newMember)) {
            setWelcomeContextActive(newMember.guild.id);
          }
          if (memberHasAnyStaffPresenceForDepexSync(oldMember) && !memberHasAnyStaffPresenceForDepexSync(newMember)) {
            // Critico: con cache membri/ruoli limitata Discord.js può mandare un update
            // dove newMember sembra senza ruoli staff anche se li ha ancora → wipe valutazioni.
            const verifiedMember = await newMember.guild.members
              .fetch({ user: newMember.id, force: true })
              .catch(() => null);
            if (!verifiedMember || memberHasAnyStaffPresenceForDepexSync(verifiedMember)) {
              global.logger?.warn?.(
                "[guildMemberUpdate] depex abortito (ruoli staff ancora presenti o fetch fallito):",
                newMember.id,
              );
            } else {
              const staffLean = await ActivityUserProfile.findOne(
                { guildId: newMember.guild.id, userId: newMember.id },
                { staff: 1 },
              ).lean().catch(() => null);
              await deleteStaffPauseRequestChannelMessages(newMember.guild, newMember.id);
              await deleteStaffRelatedMessagesFromConfiguredChannels(newMember.guild, newMember.id, staffLean?.staff).catch((err) => {
                global.logger?.warn?.("[guildMemberUpdate] staff channels scan delete:", newMember.id, err?.message || err);
              });
              try {
                const {
                  cancelPendingResocontiWorkflowForUser,
                  autoCancelPendingPausesIfNotEligible,
                } = require("../Utils/Web/siteStaffWorkflowStore");
                // Solo resoconti staff: se resta PM, i resoconti PM restano in inbox.
                await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                  kind: "s",
                  statusLabel: "Annullato (depex)",
                  decidedBy: "system",
                });
                if (!memberHasPartnerManagerRole(verifiedMember)) {
                  await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                    kind: "p",
                    statusLabel: "Annullato (depex PM)",
                    decidedBy: "system",
                  });
                }
                await autoCancelPendingPausesIfNotEligible(newMember.guild, newMember.id, {
                  decidedBy: "system",
                  statusLabel: "Annullato (depex)",
                }).catch((err) => {
                  global.logger?.warn?.(
                    "[guildMemberUpdate] cancel pending pauses on depex:",
                    newMember.id,
                    err?.message || err,
                  );
                });
              } catch (err) {
                global.logger?.warn?.("[guildMemberUpdate] cancel pending resoconti on depex:", newMember.id, err?.message || err);
              }
              if (!memberIsInMuteMirrorState(verifiedMember)) {
                await archiveStaffRolesHistoryThenUnsetStaff(newMember.guild.id, newMember.id);
                await autoUnclaimOpenTicketsClaimedByUser(newMember.guild, newMember.id).catch((err) => {
                  global.logger?.warn?.("[guildMemberUpdate] ticket auto-unclaim on depex:", newMember.id, err?.message || err);
                });
              }
            }
          }
          if (memberHasPartnerManagerRole(oldMember) && !memberHasPartnerManagerRole(newMember)) {
            const verifiedPm = await newMember.guild.members
              .fetch({ user: newMember.id, force: true })
              .catch(() => null);
            if (verifiedPm && !memberHasPartnerManagerRole(verifiedPm)) {
              try {
                const {
                  cancelPendingResocontiWorkflowForUser,
                  autoCancelPendingPausesIfNotEligible,
                } = require("../Utils/Web/siteStaffWorkflowStore");
                await cancelPendingResocontiWorkflowForUser(newMember.guild.id, newMember.id, {
                  kind: "p",
                  statusLabel: "Annullato (depex PM)",
                  decidedBy: "system",
                });
                await autoCancelPendingPausesIfNotEligible(newMember.guild, newMember.id, {
                  decidedBy: "system",
                }).catch((err) => {
                  global.logger?.warn?.(
                    "[guildMemberUpdate] cancel pending pauses on PM depex:",
                    newMember.id,
                    err?.message || err,
                  );
                });
              } catch (err) {
                global.logger?.warn?.(
                  "[guildMemberUpdate] cancel pending PM resoconti on depex:",
                  newMember.id,
                  err?.message || err,
                );
              }
            }
          }
          if (memberHasStaffRole(newMember) && !memberHasPartnerManagerRole(newMember)) {
            await ActivityUserProfile.updateOne(
              { guildId: newMember.guild.id, userId: newMember.id },
              buildStaffPartnerManagerIdUnsetUpdate(),
            ).catch(() => { });
          }
        }
      }

      await removePlusColorsIfNotEligible(newMember);
      await maybeAnnounceManualSocialRolesAndGrantPicPermsBundle(oldMember, newMember);
      await maybeSyncPatronRoleForMember(oldMember, newMember);
      {
        const createKeys = resolveAutoValutazioneCreateKeysFromMemberUpdate(oldMember, newMember);
        await syncPersistentAutoValutazioniForMember(newMember, {
          allowCreate: createKeys.size > 0,
          createKeys,
          allowRemove: true,
        }).catch((err) => {
          global.logger?.warn?.("[guildMemberUpdate] staff auto valutazioni sync:", newMember.id, err?.message || err);
        });
      }
      await ensureCustomVocAccess(newMember);
      await syncCustomVocEligibilityWindow(newMember);
      await syncCustomRoleEligibilityWindow(newMember);
      await handleBoostUpdate(oldMember, newMember);
      await handleStaffBoostAutoValutazioneMemberUpdate(oldMember, newMember).catch((err) => {
        global.logger?.warn?.("[guildMemberUpdate] staff boost auto valutazione:", newMember.id, err?.message || err);
      });
      await maybeAnnounceDonationPackageInSupporters(oldMember, newMember);
    } catch (error) {
      global.logger?.error?.("[guildMemberUpdate] failed:", error);
    }
  },
};