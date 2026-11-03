/** Boost: correzioni all'avvio (secondi boost, doppio booster, booster mai annunciati). */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { getAnnouncedBoostSlots, ensureBoostSlotsSynced, clearAnnouncedBoostSlotsMemoryForGuild } = require("../utils/boostSlotAnnounceTracker") as typeof import("../utils/boostSlotAnnounceTracker");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { textMentionsUserId, countRecentBotBoostAnnouncesForUser, extractBoostAnnounceTargetUserId, extractEmbedDescription, buildBoostAnnounceEmbedIndex } = require("./boostAnnounceState") as typeof import("./boostAnnounceState");
const { collectRecentNativeBoosterCandidates, countNativeBoostSlotsInRecentMessages } = require("./boostNative") as typeof import("./boostNative");
const { sleep } = require("./memberUpdateLogs") as typeof import("./memberUpdateLogs");
const { recoverBoostEmbedsForUserUntilComplete, recoverMissingBoostEmbedsForUser } = require("./boostAnnounce") as typeof import("./boostAnnounce");
const { fetchGuildMembersIfCacheThin, isPrimaryShard } = require("./boostRecovery") as typeof import("./boostRecovery");

async function correctMisleadingSingleBoostEmbedsOnStartup(client?) {
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

  await fetchGuildMembersIfCacheThin(guild);

  const batch = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!batch) return { ok: false, reason: "fetch_failed" };

  const botUid = String(client.user?.id || "");
  const sorted = [...batch.values()].sort((a?, b?) => Number(b?.createdTimestamp || 0) - Number(a?.createdTimestamp || 0));
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
    /* boostFalseDouble1: prova del 2° solo da messaggi nativi Discord, non dal ruolo Double Booster
       (che poteva essere stato assegnato per errore) né solo dallo slot DB gonfiato. */
    const nativeOnly = await countNativeBoostSlotsInRecentMessages(guild, channel, uid, {
      perChannelLimit: 100,
      sinceMs: embedTs > 0 ? embedTs - 10 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000,
    }).catch(() => 0);
    if (nativeOnly < 2) continue;
    const sessionSlots = await getMemberBoostSlotSignals(guild, uid, channel, {
      sinceMs: embedTs > 0 ? embedTs - 10 * 60 * 1000 : Date.now() - 24 * 60 * 60 * 1000,
      perChannelLimit: 100,
      ignoreDoubleBoosterRole: true,
    }).catch(() => 0);
    const slotSignals = Math.max(announced, sessionSlots, nativeOnly);
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

async function backfillAnnouncedBoostSlotsFromSupportersHistory(client?, opts: Record<string, any> = {}) {
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
    const embedTexts = embeds.map((e?) =>
      [e?.title || "", e?.description || "", e?.footer?.text || ""].join("\n"),
    );
    const text = [m.content || "", ...embedTexts].join("\n");
    if (!textMentionsUserId(text, uid)) continue;
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
    (existing || []).map((d?) => [String(d.userId), Math.max(0, Math.floor(Number(d?.profile?.serverBoostAnnouncedSlotCount || 0)))]),
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

async function reconcileDoubleBoosterRolesOnStartup(client?, opts: Record<string, any> = {}) {
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

async function getMemberBoostSlotSignals(guild?, userId?, channel?, opts: Record<string, any> = {}) {
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

async function recoverMissingSecondBoostEmbedsOnStartup(client?, opts: Record<string, any> = {}) {
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
  const members = await fetchGuildMembersIfCacheThin(guild);
  let memberEntries = [];
  if (members) {
    memberEntries = [...members.values()].filter((m?) => m.premiumSinceTimestamp && !m.user?.bot);
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

async function recoverUnannouncedBoostersOnStartup(client?, opts: Record<string, any> = {}) {
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

  await fetchGuildMembersIfCacheThin(guild);

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

    if (sent > 0) {
      membersRecovered += 1;
      embedsSent += sent;
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

export = { correctMisleadingSingleBoostEmbedsOnStartup, backfillAnnouncedBoostSlotsFromSupportersHistory, reconcileDoubleBoosterRolesOnStartup, recoverMissingSecondBoostEmbedsOnStartup, recoverUnannouncedBoostersOnStartup };
