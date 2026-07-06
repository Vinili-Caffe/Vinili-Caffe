const IDs = require("../../Utils/Config/ids");
const {
  getResocontoReviewerUserIdsForSegment,
  memberIsResocontoReviewerForSegment,
  memberIsExcludedFromResocontoReviewerReward,
} = require("../../Utils/Staff/resocontoAccess");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");

function weeklyResocontoService() {
  return require("./weeklyStaffResocontoService");
}

const COMPITO_SETTIMANALE_REASON = "Compito settimanale completato.";

const ROLE_ID_TO_RESOCONTO_SEGMENT = {
  [String(IDs.roles?.Helper || "")]: "helper",
  [String(IDs.roles?.Mod || "")]: "mod",
  [String(IDs.roles?.SeniorModerator || "")]: "senior_moderator",
  [String(IDs.roles?.Director || "")]: "director",
  [String(IDs.roles?.Admin || "")]: "admin",
};

const RESOCONTO_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director", "admin"];

function resolveSegmentFromPayload(payload = {}) {
  const kind = String(payload?.kind || "");
  if (kind === "p") return "pm";
  if (kind === "s") {
    return ROLE_ID_TO_RESOCONTO_SEGMENT[String(payload?.roleId || "")] || null;
  }
  return null;
}

function parseResocontoMessageMeta(message) {
  const content = String(message?.content || "");
  if (!content) return null;

  if (content.includes("**Partner Manager:**")) {
    const mention = content.match(/<@!?(\d{17,20})>/);
    return mention ? { segment: "pm", targetUserId: mention[1] } : null;
  }

  if (content.includes("**Staffer:**")) {
    const staffer = content.match(/Staffer:.*?<@!?(\d{17,20})>/is);
    const role = content.match(/Ruolo:.*?<@&(\d{17,20})>/is);
    if (staffer && role) {
      const segment = ROLE_ID_TO_RESOCONTO_SEGMENT[String(role[1])] || null;
      if (segment) return { segment, targetUserId: staffer[1] };
    }
  }
  return null;
}

function isResocontoMessageHandled(message) {
  const rowCount = Array.isArray(message?.components) ? message.components.length : 0;
  if (rowCount > 0) return false;
  const content = String(message?.content || "");
  return content.includes("Azione confermata da") || content.includes("Azione negata da");
}

function parseReviewerFromHandledMessage(message) {
  const content = String(message?.content || "");
  const match = content.match(/Azione (?:confermata|negata) da <@(\d{17,20})>/i);
  return match ? String(match[1]) : null;
}

const RESOCONTO_MESSAGE_SCAN_PAGE = 100;
const RESOCONTO_MESSAGE_SCAN_MAX = 2500;

async function collectResocontoSegmentStats(channel, sinceMs) {
  const stats = Object.fromEntries(
    RESOCONTO_SEGMENTS.map((segment) => [segment, { total: 0, handled: 0, handlers: [] }]),
  );
  if (!channel?.messages?.fetch) return stats;

  let before = null;
  let scanned = 0;
  while (scanned < RESOCONTO_MESSAGE_SCAN_MAX) {
    const batch = await channel.messages
      .fetch({
        limit: RESOCONTO_MESSAGE_SCAN_PAGE,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!batch?.size) break;

    for (const message of batch.values()) {
      scanned += 1;
      const created = message.createdTimestamp || 0;
      if (sinceMs && created && created < sinceMs) continue;
      const meta = parseResocontoMessageMeta(message);
      if (!meta?.segment || !stats[meta.segment]) continue;
      stats[meta.segment].total += 1;
      if (!isResocontoMessageHandled(message)) continue;
      stats[meta.segment].handled += 1;
      const reviewerId = parseReviewerFromHandledMessage(message);
      if (reviewerId) stats[meta.segment].handlers.push(reviewerId);
    }

    const oldest = batch.last();
    if (sinceMs && oldest && Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest?.id || null;
    if (!before || batch.size < RESOCONTO_MESSAGE_SCAN_PAGE) break;
  }

  return stats;
}

async function resolveEligibleReviewerHandlers(guild, segment, handlerIds) {
  const assigned = new Set(getResocontoReviewerUserIdsForSegment(segment));
  const unique = [...new Set((handlerIds || []).map(String).filter((id) => assigned.has(id)))];
  const eligible = [];
  for (const id of unique) {
    const member = await getGuildMemberCached(guild, id).catch(() => null);
    if (!member?.user) continue;
    if (memberIsExcludedFromResocontoReviewerReward(member)) continue;
    eligible.push(id);
  }
  return eligible;
}

async function grantCompitoSettimanaleIfEligible(guild, reviewerUserId, segment, weekKey, { force = false } = {}) {
  const uid = String(reviewerUserId || "").trim();
  const seg = String(segment || "").trim();
  const wk = String(weekKey || "").trim();
  if (!guild || !uid || !seg || !wk) return { ok: false, skipped: "invalid_args" };
  if (!memberIsResocontoReviewerForSegment({ id: uid }, seg)) {
    return { ok: false, skipped: "not_assigned_reviewer" };
  }

  const member = await getGuildMemberCached(guild, uid).catch(() => null);
  if (!member?.user) return { ok: false, skipped: "member_not_found" };
  if (memberIsExcludedFromResocontoReviewerReward(member)) {
    return { ok: false, skipped: "excluded_high_role" };
  }

  return weeklyResocontoService().ensureWeeklyLimitAutoValutazione({
    guild,
    member,
    key: `resoconto_reviewer_task:${wk}:${seg}:${uid}`,
    type: "positive",
    reason: COMPITO_SETTIMANALE_REASON,
    force,
  });
}

async function maybeGrantCompitoSettimanaleForSegment(
  guild,
  channel,
  segment,
  weekKey,
  { force = false, stats = null } = {},
) {
  const seg = String(segment || "").trim();
  if (!guild || !channel || !seg) return { ok: false, skipped: "invalid_args" };

  let segmentStats = stats?.[seg] || null;
  if (!segmentStats) {
    const since = weeklyResocontoService().getResocontoCycleMessagesSince();
    const sinceMs = since?.getTime?.() || 0;
    const collected = await collectResocontoSegmentStats(channel, sinceMs);
    segmentStats = collected[seg];
  }
  if (!segmentStats || segmentStats.total < 1) {
    return { ok: false, skipped: "no_resoconti" };
  }
  if (segmentStats.handled < segmentStats.total) {
    return { ok: false, skipped: "incomplete" };
  }

  const eligibleHandlers = await resolveEligibleReviewerHandlers(guild, seg, segmentStats.handlers);
  if (eligibleHandlers.length !== 1) {
    return { ok: false, skipped: eligibleHandlers.length ? "multiple_reviewers" : "no_eligible_reviewer" };
  }

  const reviewerId = eligibleHandlers[0];

  return grantCompitoSettimanaleIfEligible(guild, reviewerId, seg, weekKey, { force });
}

async function onResocontoOutcomeRecorded(guild, channel, reviewerUserId, payload) {
  try {
    const segment = resolveSegmentFromPayload(payload);
    if (!segment || !guild || !channel) return;
    const reviewerId = String(reviewerUserId || "").trim();
    if (!reviewerId) return;
    const actorMember = await getGuildMemberCached(guild, reviewerId).catch(() => null);
    if (!actorMember || !memberIsResocontoReviewerForSegment(actorMember, segment)) return;
    if (memberIsExcludedFromResocontoReviewerReward(actorMember)) return;

    const weekKey = weeklyResocontoService().getResocontoCycleWeekKey();
    const result = await maybeGrantCompitoSettimanaleForSegment(guild, channel, segment, weekKey);
    if (result?.created) {
      global.logger?.info?.(
        `[RESOCONTO REVIEWER REWARD] Compito settimanale → ${reviewerId} (${segment})`,
      );
    }
  } catch (err) {
    global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] onOutcome failed:", err?.message || err);
  }
}

async function reconcileResocontoReviewerRewardAutoValutazioni(client) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, skipped: "no_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, skipped: "guild_unavailable" };

  const weekKey = weeklyResocontoService().getResocontoCycleWeekKey();
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
  const { getResocontoReviewerUserIdsForSegment } = require("../../Utils/Staff/resocontoAccess");
  const reviewerIds = new Set(
    RESOCONTO_SEGMENTS.flatMap((segment) => getResocontoReviewerUserIdsForSegment(segment).map(String)),
  );
  if (!reviewerIds.size) return { ok: true, relinked: 0, skipped: "no_reviewers" };

  const docs = await ActivityUserProfile.find(
    {
      guildId,
      userId: { $in: [...reviewerIds] },
      "staff.positiveReasons": COMPITO_SETTIMANALE_REASON,
    },
    { userId: 1, staff: 1 },
  )
    .lean()
    .catch(() => []);

  let relinked = 0;
  for (const doc of docs) {
    const member = await getGuildMemberCached(guild, doc.userId).catch(() => null);
    if (!member?.user) continue;
    for (const segment of RESOCONTO_SEGMENTS) {
      if (!memberIsResocontoReviewerForSegment(member, segment)) continue;
      const key = `resoconto_reviewer_task:${weekKey}:${segment}:${member.id}`;
      const result = await weeklyResocontoService().ensureWeeklyLimitAutoValutazione({
        guild,
        member,
        key,
        type: "positive",
        reason: COMPITO_SETTIMANALE_REASON,
        force: false,
      });
      if (result?.relinked || result?.skipped === "relinked") relinked += 1;
    }
  }
  if (relinked > 0) {
    global.logger?.info?.(`[RESOCONTO REVIEWER REWARD] Reconcile: ${relinked} auto-valutazioni relinked`);
  }
  return { ok: true, relinked };
}

async function runResocontoReviewerRewardRecovery(client) {
  await reconcileResocontoReviewerRewardAutoValutazioni(client).catch((err) => {
    global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] Reconcile failed:", err?.message || err);
  });
  const { purgeDuplicateCompitoSettimanaleValutazioni } = require("./compitoSettimanaleDuplicatePurgeService");
  await purgeDuplicateCompitoSettimanaleValutazioni(client, { dryRun: false }).catch((err) => {
    global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] Compito duplicate purge failed:", err?.message || err);
  });
  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.resocontiStaff || "");
  if (!guildId || !channelId) return;

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return;
  const channel =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return;

  const weekKey = weeklyResocontoService().getResocontoCycleWeekKey();
  const since = weeklyResocontoService().getResocontoCycleMessagesSince();
  const sinceMs = since?.getTime?.() || 0;
  const scanStats = await collectResocontoSegmentStats(channel, sinceMs);
  const activeSegments = RESOCONTO_SEGMENTS.filter((segment) => (scanStats[segment]?.total || 0) > 0);
  if (!activeSegments.length) return;

  const granted = [];
  for (const segment of activeSegments) {
    const result = await maybeGrantCompitoSettimanaleForSegment(guild, channel, segment, weekKey, {
      force: false,
      stats: scanStats,
    });
    if (result?.created) granted.push(segment);
  }
  if (granted.length) {
    global.logger?.info?.(
      `[RESOCONTO REVIEWER REWARD] Recovery: compito settimanale → ${granted.join(", ")}`,
    );
  }
}

function startResocontoReviewerRewardRecoveryLoop(client) {
  setTimeout(() => {
    runResocontoReviewerRewardRecovery(client).catch((err) => {
      global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] Recovery failed:", err?.message || err);
    });
  }, 90_000).unref?.();
}

module.exports = {
  onResocontoOutcomeRecorded,
  runResocontoReviewerRewardRecovery,
  reconcileResocontoReviewerRewardAutoValutazioni,
  startResocontoReviewerRewardRecoveryLoop,
  resolveSegmentFromPayload,
  parseResocontoMessageMeta,
  collectResocontoSegmentStats,
  grantCompitoSettimanaleIfEligible,
};
