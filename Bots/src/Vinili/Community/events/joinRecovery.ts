/** Ingresso membri: benvenuti mancati (dopo un riavvio o un errore). */
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { shouldSendPublicMemberAnnouncement } = require("../../Community/utils/memberPublicAnnouncementGate") as typeof import("../../Community/utils/memberPublicAnnouncementGate");
const { getClientGuildCached, getGuildChannelCached, getGuildMemberCached, isUnknownDiscordMemberError } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { activateWelcomeContextForGuild } = require("../../Community/services/officialMessageCommunityHandlers") as typeof import("../../Community/services/officialMessageCommunityHandlers");
const { restoreUserOnJoin } = require("../../Community/services/userLeaveBackupService") as typeof import("../../Community/services/userLeaveBackupService");
const { syncMutedMirrorOnMemberJoin } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
const { cancelCustomPerksDiscordCleanupQueue } = require("../../Community/services/customPerksDiscordCleanupQueueService") as typeof import("../../Community/services/customPerksDiscordCleanupQueueService");
const { accountUsername } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { syncPreMemberRoleForMember } = require("../../Community/utils/preMemberRoleService") as typeof import("../../Community/utils/preMemberRoleService");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { resolveGuildChannel, resolveInviteInfo, inviteCodeFromInfo, trackInviteJoin, announceInviteInfo, maybeSendInviteReward, maybeSendInviteNearRewardReminder } = require("./joinInvites") as typeof import("./joinInvites");
const { sendWelcomeChannelAnnouncement, markJoinAnnounceSent } = require("../../Moderation/events/joinBots") as typeof import("../../Moderation/events/joinBots");
const { sendDmWelcome } = require("./joinWelcome") as typeof import("./joinWelcome");
const { memberHasAnyTenureRole, maybeApplyVerificationTenureOnJoin } = require("./joinRestore") as typeof import("./joinRestore");

async function markJoinAnnouncePending(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) return;
  if (member.user?.bot) return;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $setOnInsert: { guildId, userId }, $set: { "profile.joinAnnouncePending": true } },
    { upsert: true },
  ).catch(() => null);
}

async function clearJoinAnnouncePending(member?) {
  if (!member?.guild?.id || !member?.id) return;
  await ActivityUserProfile.updateOne(
    { guildId: String(member.guild.id), userId: String(member.id) },
    { $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => null);
}

async function resolveWelcomeChannelForMember(member?) {
  const welcomeChannelId = IDs.channels.chat;
  let welcomeChannel = await resolveGuildChannel(member.guild, welcomeChannelId);
  if (!welcomeChannel && member.client) {
    const mainGuild = await getClientGuildCached(member.client, IDs.guilds.main);
    welcomeChannel = mainGuild ? await getGuildChannelCached(mainGuild, welcomeChannelId) : null;
  }
  if (!welcomeChannel) {
    try {
      const fetched = await member.guild.channels.fetch(String(welcomeChannelId)).catch(() => null);
      if (fetched?.isTextBased?.()) welcomeChannel = fetched;
    } catch (_) {}
  }
  return welcomeChannel;
}

async function welcomeAnnounceExistsForUser(channel?, memberOrUserId?, botId?, sinceMs?) {
  if (!channel?.messages?.fetch) return false;
  const userId = String(typeof memberOrUserId === "object" ? memberOrUserId?.id : memberOrUserId || "");
  if (!userId) return false;
  const uname = typeof memberOrUserId === "object" ? accountUsername(memberOrUserId) : "";
  const needle = `<@${userId}>`;
  const minTs = Math.max(0, Number(sinceMs || 0) - 60_000);
  const welcomeRe = /Vinili & Caff[eèé]|Benvento|Benvenuto|nella nostra community/i;
  let before = undefined;
  for (let page = 0; page < 4; page += 1) {
    const recent = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!recent?.size) break;
    let oldestTs = Infinity;
    for (const m of recent.values()) {
      const ts = Number(m.createdTimestamp || 0);
      if (ts && ts < oldestTs) oldestTs = ts;
      if (ts && ts < minTs) continue;
      if (botId && String(m.author?.id || "") !== botId) continue;
      const embeds = Array.isArray(m.embeds) ? m.embeds : [];
      const parts = [String(m.content || "")];
      for (const e of embeds) {
        parts.push(String(e?.title || ""), String(e?.description || ""), String(e?.author?.name || ""));
      }
      const blob = parts.join("\n");
      const mentionsUser = blob.includes(needle) || blob.includes(`<@!${userId}>`);
      const authorMatches = uname && embeds.some((e?) => String(e?.author?.name || "").trim() === uname);
      if (!mentionsUser && !authorMatches) continue;
      if (welcomeRe.test(blob)) return true;
    }
    if (oldestTs <= minTs) break;
    const oldest = [...recent.values()].sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0))[0];
    if (!oldest?.id) break;
    before = oldest.id;
  }
  return false;
}

async function joinWelcomeAlreadySent(channel?, member?, botId?) {
  if (!member?.id) return false;
  const guildId = String(member.guild?.id || "");
  const userId = String(member.id);
  const joined = Number(member.joinedTimestamp || 0);
  /* prova prima in canale: il flag mongo da solo mentiva (claim prima dell’invio) */
  const sinceMs = joined || Date.now() - 7 * 24 * 60 * 60 * 1000;
  const inChannel = await welcomeAnnounceExistsForUser(channel, member, botId, sinceMs);
  if (inChannel) {
    await markJoinAnnounceSent(member);
    return true;
  }
  if (isMongoReady()) {
    const doc = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.joinAnnounceSentAt")
      .lean()
      .catch(() => null);
    const sentRaw = doc?.profile?.joinAnnounceSentAt;
    if (sentRaw) {
      const sentAt = new Date(sentRaw).getTime();
      /*
       * Segno "benvenuto inviato": ora si salva solo DOPO che il messaggio è partito (claim + invio + mark),
       * quindi è affidabile. Prima, se il messaggio non sembrava quello vecchio in chat (il benvenuto della
       * dashboard ha un altro formato), il segno veniva cancellato e il benvenuto rimandato a ogni riavvio.
       */
      if (Number.isFinite(sentAt) && sentAt > 0 && (!joined || sentAt >= joined - 5_000)) return true;
    }
  }
  return false;
}

function joinRecoverySleep(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

function isJoinRecoveryPrimaryShard(client?) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

async function dispatchPublicJoinAnnouncements(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) {
    return { ok: false, reason: "wrong_guild" };
  }
  const fresh = await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => member);
  if (!fresh?.user) return { ok: false, reason: "no_member" };
  if (!(await shouldSendPublicMemberAnnouncement(fresh))) {
    return { ok: false, reason: "gate_blocked" };
  }

  const welcomeChannel = await resolveWelcomeChannelForMember(fresh);
  const info = await resolveInviteInfo(fresh).catch(() => null);
  const botId = String(fresh.client?.user?.id || "");
  const welcomeAlreadySent = welcomeChannel ? await joinWelcomeAlreadySent(welcomeChannel, fresh, botId) : false;

  if (fresh.client) await activateWelcomeContextForGuild(fresh.guild.id, fresh.id);
  let welcomeMsg = null;
  let welcomeSkipReason = null;
  if (welcomeChannel && !welcomeAlreadySent) {
    const out = await sendWelcomeChannelAnnouncement(welcomeChannel, fresh);
    if (out && typeof out === "object" && out.skipped) {
      welcomeSkipReason = String(out.reason || "skipped");
      /* claim_busy = un altro invio è già in corso/appena riuscito: non è un errore */
      if (welcomeSkipReason !== "claim_busy") {
        global.logger?.info?.("[JOIN RECOVER] welcome skipped:", fresh.id, welcomeSkipReason);
      }
    } else if (out) {
      welcomeMsg = out;
      await announceInviteInfo(fresh, welcomeChannel, info);
    } else {
      global.logger?.warn?.("[JOIN RECOVER] welcome send failed:", fresh.id);
    }
  } else if (welcomeAlreadySent) {
    await clearJoinAnnouncePending(fresh);
  }

  if (info && !info.isVanity && info.inviterId) {
    await trackInviteJoin(fresh, info.inviterId, inviteCodeFromInfo(info)).catch(() => { });
  }
  await maybeSendInviteNearRewardReminder(fresh, info);
  await maybeSendInviteReward(fresh, info);

  return {
    ok: true,
    announced: Boolean(welcomeMsg),
    already: Boolean(welcomeAlreadySent),
    welcomeFailed: Boolean(welcomeChannel && !welcomeAlreadySent && !welcomeMsg && welcomeSkipReason !== "claim_busy"),
    welcomeSkipReason,
  };
}

async function recoverJoinAnnouncementsOnStartup(client?, opts: Record<string, any> = {}) {
  if (!isJoinRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };

  const limit = Math.max(1, Math.min(80, Number(opts.limit || 40)));
  const lookbackMs = Math.max(
    5 * 60 * 1000,
    Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || 24 * 60 * 60 * 1000)),
  );
  const minJoinedMs = Date.now() - lookbackMs;
  const botId = String(client.user?.id || "");
  const welcomeChannel = await resolveGuildChannel(guild, IDs.channels.chat);
  if (!welcomeChannel?.isTextBased?.()) return { ok: false, reason: "no_welcome_channel" };

  let recovered = 0;
  let pendingProcessed = 0;
  let pendingWaitingVerify = 0;
  let pendingClearedGone = 0;
  let pendingStaleCleared = 0;
  let pendingReady = 0;
  let missedScanned = 0;
  let missedRecovered = 0;
  let missedSkippedOk = 0;
  let rolesFixed = 0;

  /* joinRecoverPendingDrain1: non limitare ai primi N (erano tutti unverified e bloccavano i ready) */
  const pendingLimit = Math.max(20, Math.min(120, Math.max(limit * 3, 80)));
  const missedLimit = Math.max(1, Math.min(50, limit));

  const pendingRows = await ActivityUserProfile.find({
    guildId,
    "profile.joinAnnouncePending": true,
  })
    .select("userId")
    .limit(pendingLimit)
    .lean()
    .catch(() => []);

  for (const row of pendingRows) {
    const userId = String(row?.userId || "");
    if (!userId) continue;
    pendingProcessed += 1;

    let member = null;
    try {
      member = await guild.members.fetch({ user: userId, force: true });
    } catch (err) {
      if (!isUnknownDiscordMemberError(err)) {
        member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      }
    }
    if (!member || member.user?.bot) {
      const cleared = await ActivityUserProfile.updateOne(
        { guildId, userId },
        { $unset: { "profile.joinAnnouncePending": "" } },
      ).catch(() => null);
      if (Number(cleared?.modifiedCount || cleared?.nModified || 0) > 0 || !member) {
        pendingClearedGone += 1;
      }
      continue;
    }

    /* joinRecoverPendingSkip1: ancora senza Member+separatore → lascia pending per deferred verify */
    const canAnnounce = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
    if (!canAnnounce) {
      pendingWaitingVerify += 1;
      continue;
    }

    const joinedMs = Number(member.joinedTimestamp || 0);
    const withinLookback = !joinedMs || joinedMs >= minJoinedMs;
    if (!withinLookback) {
      /* già verificato ma join fuori lookback: niente welcome spam, sblocca la coda */
      await maybeApplyVerificationTenureOnJoin(member).catch(() => {});
      const cleared = await ActivityUserProfile.updateOne(
        { guildId, userId },
        {
          $set: { "profile.joinAnnounceSentAt": new Date() },
          $unset: { "profile.joinAnnouncePending": "" },
        },
      ).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] stale clear failed:", userId, err?.message || err);
        return null;
      });
      if (Number(cleared?.modifiedCount || cleared?.nModified || 0) > 0) {
        pendingStaleCleared += 1;
      }
      continue;
    }

    pendingReady += 1;
    const out = await processMissedJoinMember(member, { sendDm: false }).catch((err?) => {
      global.logger?.warn?.("[JOIN RECOVER] pending member failed:", userId, err?.message || err);
      return null;
    });
    if (out?.roles) rolesFixed += 1;
    /* solo invii veri: "already" non conta come welcome recuperato */
    if (out?.announced) recovered += 1;
    await joinRecoverySleep(450);
  }

  /* missedJoinCatchup1: join avvenuti a bot offline (nessun guildMemberAdd) */
  const candidateIds = await collectRecentMissedJoinCandidateIds(guild, {
    minJoinedMs,
    limit: Math.max(missedLimit, 50),
  }).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] collect missed joins failed:", err?.message || err);
    return [];
  });

  for (const userId of candidateIds) {
    if (missedRecovered >= missedLimit) break;
    missedScanned += 1;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member || member.user?.bot) {
      missedSkippedOk += 1;
      continue;
    }

    const profile = isMongoReady()
      ? await ActivityUserProfile.findOne({ guildId, userId })
          .select("profile.joinAnnounceSentAt profile.joinAnnouncePending")
          .lean()
          .catch(() => null)
      : null;

    if (!memberNeedsMissedJoinCatchup(member, profile)) {
      missedSkippedOk += 1;
      continue;
    }

    /* joinRecoverPendingDrain1: waitingVerify già in coda → skip; altrimenti processa ruoli senza contare recover */
    const canAnnounce = await shouldSendPublicMemberAnnouncement(member).catch(() => false);
    if (!canAnnounce) {
      if (profile?.profile?.joinAnnouncePending === true) {
        missedSkippedOk += 1;
        continue;
      }
      const outPending = await processMissedJoinMember(member, { sendDm: false }).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] missed pending-setup failed:", userId, err?.message || err);
        return null;
      });
      if (outPending?.pending || outPending?.ok) pendingWaitingVerify += 1;
      missedSkippedOk += 1;
      await joinRecoverySleep(350);
      continue;
    }

    const out = await processMissedJoinMember(member, {
      sendDm: Number(member.joinedTimestamp || 0) >= Date.now() - 6 * 60 * 60 * 1000,
    }).catch((err?) => {
      global.logger?.warn?.("[JOIN RECOVER] missed join failed:", userId, err?.message || err);
      return null;
    });
    if (!out?.ok) continue;
    if (out.pending) {
      pendingWaitingVerify += 1;
      missedSkippedOk += 1;
      continue;
    }
    missedRecovered += 1;
    if (out.roles) rolesFixed += 1;
    if (out.announced) recovered += 1;
    await joinRecoverySleep(500);
  }

  /* Sempre una riga: altrimenti sembrava che al boot non recuperasse niente. */
  global.logger?.warn?.(
    `[JOIN RECOVER] pending=${pendingProcessed} ready=${pendingReady} waitingVerify=${pendingWaitingVerify} clearedGone=${pendingClearedGone} staleCleared=${pendingStaleCleared} missedScanned=${missedScanned} missedSkippedOk=${missedSkippedOk} missedRecovered=${missedRecovered} welcomes=${recovered} rolesFixed=${rolesFixed} lookbackMs=${lookbackMs}`,
  );

  return {
    ok: true,
    recovered,
    pendingProcessed,
    pendingReady,
    pendingWaitingVerify,
    pendingClearedGone,
    pendingStaleCleared,
    missedScanned,
    missedSkippedOk,
    missedRecovered,
    rolesFixed,
    lookbackMs,
  };
}

function memberNeedsMissedJoinCatchup(member?, profileDoc?) {
  if (!member?.id || member.user?.bot) return false;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const preRoleId = String(IDs.roles?.preMember || "").trim();
  const hasMember = Boolean(memberRoleId && member.roles?.cache?.has?.(memberRoleId));
  const hasPre = Boolean(preRoleId && member.roles?.cache?.has?.(preRoleId));
  const hasTenure = memberHasAnyTenureRole(member);
  if (!hasMember && !hasPre) return true;
  if (hasMember && !hasTenure) return true;
  /* pending gestito dal drain dedicato — non forzare re-entry nel missed loop */
  const joined = Number(member.joinedTimestamp || 0);
  const sentRaw = profileDoc?.profile?.joinAnnounceSentAt;
  const sentMs = sentRaw ? new Date(sentRaw).getTime() : 0;
  if (joined > 0 && (!Number.isFinite(sentMs) || sentMs <= 0 || sentMs < joined - 5_000)) {
    return true;
  }
  return false;
}

async function collectRecentMissedJoinCandidateIds(guild?, opts: Record<string, any> = {}) {
  const minJoinedMs = Number(opts.minJoinedMs || 0);
  const limit = Math.max(1, Math.min(100, Number(opts.limit || 50)));
  const byId = new Map();

  /* missedJoinCatchup1: Discord non emette audit MemberAdd per join utenti.
     Serve lo sweep su joinedTimestamp (fetch membri se la cache è incompleta). */
  try {
    const cached = Number(guild.members?.cache?.size || 0);
    const total = Number(guild.memberCount || 0);
    const needFetch =
      typeof guild.members?.fetch === "function" &&
      (cached < 50 || (total > 0 && cached < Math.min(total, Math.max(80, Math.floor(total * 0.35)))));
    if (needFetch) {
      await guild.members.fetch({ withPresences: false }).catch((err?) => {
        global.logger?.warn?.("[JOIN RECOVER] members.fetch failed:", err?.message || err);
      });
    }
  } catch (errFetch) {
    global.logger?.warn?.("[JOIN RECOVER] members hydrate failed:", errFetch?.message || errFetch);
  }

  try {
    for (const m of guild.members.cache.values()) {
      if (!m || m.user?.bot) continue;
      const joined = Number(m.joinedTimestamp || 0);
      if (!joined || joined < minJoinedMs) continue;
      byId.set(String(m.id), joined);
    }
  } catch (_) {}

  return [...byId.entries()]
    .sort((a?, b?) => Number(b[1]) - Number(a[1]))
    .slice(0, limit)
    .map(([id]) => id);
}

async function processMissedJoinMember(member?, opts: Record<string, any> = {}) {
  if (!member?.guild?.id || !member?.id || member.user?.bot) {
    return { ok: false, reason: "invalid" };
  }
  if (String(member.guild.id) !== String(IDs.guilds?.main || "")) {
    return { ok: false, reason: "wrong_guild" };
  }

  let current = member;
  await syncMutedMirrorOnMemberJoin(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] muted mirror:", current.id, err?.message || err);
  });
  await restoreUserOnJoin(current.guild.id, current.id, current).catch(() => false);
  await cancelCustomPerksDiscordCleanupQueue(current.guild.id, current.id).catch(() => {});

  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  await maybeApplyVerificationTenureOnJoin(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] tenure:", current.id, err?.message || err);
  });
  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  await syncPreMemberRoleForMember(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] preMember:", current.id, err?.message || err);
  });
  current =
    (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;

  const rolesOk = true;
  const canAnnounce = await shouldSendPublicMemberAnnouncement(current);
  if (!canAnnounce) {
    await markJoinAnnouncePending(current);
    return { ok: true, announced: false, pending: true, roles: rolesOk };
  }

  const welcomeChannel = await resolveWelcomeChannelForMember(current);
  const botId = String(current.client?.user?.id || "");
  if (welcomeChannel && (await joinWelcomeAlreadySent(welcomeChannel, current, botId))) {
    await clearJoinAnnouncePending(current);
    return { ok: true, announced: false, already: true, roles: rolesOk };
  }

  await clearJoinAnnouncePending(current);
  if (current.client) {
    await activateWelcomeContextForGuild(current.guild.id, current.id).catch(() => {});
  }
  const out: any = await dispatchPublicJoinAnnouncements(current).catch((err?) => {
    global.logger?.warn?.("[JOIN RECOVER] welcome dispatch:", current.id, err?.message || err);
    return { ok: false };
  });

  if (opts.sendDm) {
    await sendDmWelcome(current).catch(() => {});
  }

  return {
    ok: Boolean(out?.ok),
    announced: Boolean(out?.announced),
    already: Boolean(out?.already),
    welcomeFailed: Boolean(out?.welcomeFailed),
    roles: rolesOk,
  };
}

async function runDeferredJoinAnnouncements(member?) {
  if (!member?.guild?.id || String(member.guild.id) !== String(IDs.guilds?.main || "")) return;
  const guildId = String(member.guild.id);
  const userId = String(member.id);
  if (!(await shouldSendPublicMemberAnnouncement(member).catch(() => false))) {
    await markJoinAnnouncePending(member);
    return;
  }
  const welcomeChannel = await resolveWelcomeChannelForMember(member);
  const botId = String(member.client?.user?.id || "");
  if (welcomeChannel && (await joinWelcomeAlreadySent(welcomeChannel, member, botId))) {
    await clearJoinAnnouncePending(member);
    return;
  }
  /* Non richiedere pending=true: se il flag non era stato settato al join, il welcome restava bloccato. */
  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $unset: { "profile.joinAnnouncePending": "" } },
  ).catch(() => null);
  await dispatchPublicJoinAnnouncements(member);
}

export = { markJoinAnnouncePending, clearJoinAnnouncePending, recoverJoinAnnouncementsOnStartup, processMissedJoinMember, runDeferredJoinAnnouncements };
