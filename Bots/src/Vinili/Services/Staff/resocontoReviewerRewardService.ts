const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  getResocontoReviewerUserIdsForSegment,
  getResocontoSegmentsForReviewerUserId,
  memberIsResocontoReviewerForSegment,
  memberIsExcludedFromResocontoReviewerReward,
} = require("../../Utils/Staff/resocontoAccess") as typeof import("../../Utils/Staff/resocontoAccess");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");

function weeklyResocontoService() {
  return require("./weeklyStaffResocontoService");
}

const COMPITO_SETTIMANALE_REASON = "Compito settimanale completato.";
const COMPITO_CLAIMS_BOT_STATE_KEY = "resocontoCompitoClaimsV1";

const ROLE_ID_TO_RESOCONTO_SEGMENT = {
  [String(IDs.roles?.Helper || "")]: "helper",
  [String(IDs.roles?.Mod || "")]: "mod",
  [String(IDs.roles?.SeniorModerator || "")]: "senior_moderator",
  [String(IDs.roles?.Director || "")]: "director",
};

const RESOCONTO_SEGMENTS = ["pm", "helper", "mod", "senior_moderator", "director"];

function buildGlobalCompitoClaimId(weekKey?, segment?, userId?) {
  return `${String(weekKey || "").trim()}:${String(segment || "").trim()}:${String(userId || "").trim()}`;
}

async function hasGlobalCompitoClaim(weekKey?, segment?, userId?) {
  const wk = String(weekKey || "").trim();
  const uid = String(userId || "").trim();
  if (!wk || !uid) return false;
  const state = await getBotState(COMPITO_CLAIMS_BOT_STATE_KEY, { claims: {} });
  const claims = state?.claims && typeof state.claims === "object" ? state.claims : {};
  const exact = buildGlobalCompitoClaimId(wk, segment, uid);
  if (claims[exact]) return true;
    const needle = `:${uid}`;
  return Object.keys(claims).some((key?) => key.startsWith(`${wk}:`) && key.endsWith(needle));
}

async function rememberGlobalCompitoClaim(weekKey?, segment?, userId?) {
  const id = buildGlobalCompitoClaimId(weekKey, segment, userId);
  if (!id || id.includes("::") || id.startsWith(":") || id.endsWith(":")) return false;
  const state = await getBotState(COMPITO_CLAIMS_BOT_STATE_KEY, { claims: {} });
  const claims = { ...(state?.claims && typeof state.claims === "object" ? state.claims : {}) };
  if (claims[id]) return false;
  claims[id] = { at: Date.now() };
  const keys = Object.keys(claims);
  if (keys.length > 80) {
    const sorted = keys
      .map((key?) => ({ key, at: Number(claims[key]?.at || 0) }))
      .sort((a?, b?) => a.at - b.at);
    for (const row of sorted.slice(0, Math.max(0, keys.length - 80))) {
      delete claims[row.key];
    }
  }
  await setBotState(COMPITO_CLAIMS_BOT_STATE_KEY, { claims });
  return true;
}

function resolveSegmentFromPayload(payload: Record<string, any> = {}) {
  const kind = String(payload?.kind || "");
  if (kind === "p") return "pm";
  if (kind === "s") {
    return ROLE_ID_TO_RESOCONTO_SEGMENT[String(payload?.roleId || "")] || null;
  }
  return null;
}

function buildCompitoAutoKey(weekKey?, segment?, userId?) {
  return `resoconto_reviewer_task:${String(weekKey || "")}:${String(segment || "")}:${String(userId || "")}`;
}

function parseResocontoReviewerTaskKey(keyStr?) {
  const m = /^resoconto_reviewer_task:([^:]+):([^:]+):(\d{17,20})$/.exec(String(keyStr || ""));
  if (!m) return null;
  return { weekKey: m[1], segment: m[2], userId: m[3] };
}

function hasCompitoAutoEntryForWeekSegment(staff?, weekKey?, segment?, userId?) {
  const wk = String(weekKey || "");
  const seg = String(segment || "");
  const uid = String(userId || "");
  if (!wk || !seg || !uid) return false;
  return (Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : []).some((entry?) => {
    const parsed = parseResocontoReviewerTaskKey(String(entry?.key || ""));
    if (!parsed) return false;
    return (
      parsed.weekKey === wk &&
      parsed.segment === seg &&
      parsed.userId === uid &&
      String(entry?.reason || "") === COMPITO_SETTIMANALE_REASON
    );
  });
}

function parseResocontoMessageMeta(message?) {
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

function isResocontoMessageHandled(message?) {
  const rowCount = Array.isArray(message?.components) ? message.components.length : 0;
  if (rowCount > 0) return false;
  const content = String(message?.content || "");
  return content.includes("Azione confermata da") || content.includes("Azione negata da");
}

function parseReviewerFromHandledMessage(message?) {
  const content = String(message?.content || "");
  const match = content.match(/Azione (?:confermata|negata) da <@(\d{17,20})>/i);
  return match ? String(match[1]) : null;
}

const RESOCONTO_MESSAGE_SCAN_PAGE = 100;
const RESOCONTO_MESSAGE_SCAN_MAX = 1200;
const COMPITO_CHECK_DEBOUNCE_MS = 6_000;
let compitoCheckTimer = null;
let compitoCheckRunning = false;
let recoveryRunning = false;

async function collectResocontoSegmentStats(channel?, sinceMs?) {
  const stats = Object.fromEntries(
    RESOCONTO_SEGMENTS.map((segment?) => [segment, { total: 0, handled: 0, handlers: [] }]),
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

async function collectResocontoSegmentStatsFromSite(guildId?, weekKey?, { excludeUserId = null } = {}) {
  const stats = Object.fromEntries(
    RESOCONTO_SEGMENTS.map((segment?) => [segment, { total: 0, handled: 0, handlers: [] }]),
  );
  const gid = String(guildId || "").trim();
  const wk = String(weekKey || "").trim();
  if (!gid || !wk) return stats;

  try {
    const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    const docs = await SiteDocument.find({
      docType: SITE_DOCUMENT_TYPE.STAFF_WORKFLOW,
      guildId: gid,
      workflowQueue: "resoconti",
      workflowWeekKey: wk,
    })
      .select("userId status workflowDecidedBy workflowKind workflowRoleId")
      .lean()
      .catch(() => []);

    const exclude = String(excludeUserId || "").trim();
    for (const doc of Array.isArray(docs) ? docs : []) {
      const subjectId = String(doc?.userId || "").trim();
      if (exclude && subjectId && subjectId === exclude) continue;

      const kind = String(doc?.workflowKind || "").trim().toLowerCase();
      let segment = null;
      if (kind === "p") segment = "pm";
      else if (kind === "s") {
        segment = ROLE_ID_TO_RESOCONTO_SEGMENT[String(doc?.workflowRoleId || "")] || null;
      }
      if (!segment || !stats[segment]) continue;

      stats[segment].total += 1;
      const status = String(doc?.status || "").trim().toLowerCase();
      if (status === "pending") continue;
      stats[segment].handled += 1;
      const reviewerId = String(doc?.workflowDecidedBy || "").trim();
      if (/^\d{16,22}$/.test(reviewerId)) stats[segment].handlers.push(reviewerId);
    }
  } catch (err) {
    global.logger?.warn?.(
      "[RESOCONTO REVIEWER REWARD] Site stats failed:",
      err?.message || err,
    );
  }

  return stats;
}

function mergeResocontoSegmentStats(primary?, fallback?) {
  const out = Object.fromEntries(
    RESOCONTO_SEGMENTS.map((segment?) => [segment, { total: 0, handled: 0, handlers: [] }]),
  );
  for (const segment of RESOCONTO_SEGMENTS) {
    const a = primary?.[segment] || { total: 0, handled: 0, handlers: [] };
    const b = fallback?.[segment] || { total: 0, handled: 0, handlers: [] };
        const use = Number(a.total || 0) >= Number(b.total || 0) ? a : b;
    out[segment] = {
      total: Number(use.total || 0),
      handled: Number(use.handled || 0),
      handlers: Array.isArray(use.handlers) ? [...use.handlers] : [],
    };
  }
  return out;
}

async function collectResocontoSegmentStatsForCompito(guild?, channel?, weekKey?) {
  const since = weeklyResocontoService().getResocontoCycleMessagesSince();
  const sinceMs = since?.getTime?.() || 0;
  const discordStats = channel?.messages?.fetch
    ? await collectResocontoSegmentStats(channel, sinceMs)
    : Object.fromEntries(
        RESOCONTO_SEGMENTS.map((segment?) => [segment, { total: 0, handled: 0, handlers: [] }]),
      );
  const siteStats = await collectResocontoSegmentStatsFromSite(guild?.id, weekKey);
  return mergeResocontoSegmentStats(siteStats, discordStats);
}

function findAutoValutazioneEntry(staff?, keyStr?) {
  if (!Array.isArray(staff?.autoValutazioni)) return null;
  return staff.autoValutazioni.find((entry?) => String(entry?.key || "") === String(keyStr || "")) || null;
}

async function reviewerAlreadyHasCompitoForWeekSegment(guild?, staff?, weekKey?, segment?, userId?) {
  const wk = String(weekKey || "");
  const seg = String(segment || "");
  const uid = String(userId || "");

  if (weeklyResocontoService().staffHasResocontoCompitoClaim(staff, wk, seg, uid)) {
    return true;
  }

  if (hasCompitoAutoEntryForWeekSegment(staff, wk, seg, uid)) {
    const key = buildCompitoAutoKey(wk, seg, uid);
    const entry = findAutoValutazioneEntry(staff, key);
    if (!entry) return true;
        if (entry.spentByTrade) return true;

    const claim = await weeklyResocontoService().classifyResocontoReviewerAutoEntry(
      guild,
      entry,
      COMPITO_SETTIMANALE_REASON,
    );
    if (claim === "active" || claim === "spent") {
      return true;
    }
        return false;
  }

  const reasons = Array.isArray(staff?.positiveReasons) ? staff.positiveReasons : [];
  const logs = Array.isArray(staff?.positiveValutazioni) ? staff.positiveValutazioni : [];
  const autoRows = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];

  for (let index = 0; index < reasons.length; index += 1) {
    if (String(reasons[index] || "") !== COMPITO_SETTIMANALE_REASON) continue;
    const log = logs[index];
    if (!log?.messageId) continue;
            const logReason = String(log?.reason || "").trim();
    if (logReason && logReason !== COMPITO_SETTIMANALE_REASON) continue;
    const linked = autoRows.find((row?) => String(row?.messageId || "") === String(log.messageId));
    const parsed = linked ? parseResocontoReviewerTaskKey(String(linked.key || "")) : null;
    if (parsed?.weekKey === wk && parsed.segment === seg && parsed.userId === uid) {
      return true;
    }
        if (!parsed && logReason === COMPITO_SETTIMANALE_REASON) {
      const logMs = log?.createdAt ? new Date(log.createdAt).getTime() : 0;
      if (logMs > 0) {
        const logWeekKey = weeklyResocontoService().getResocontoCycleWeekKey(new Date(logMs));
        if (logWeekKey === wk) return true;
      }
    }
  }

  if (await channelHasActiveCompitoForWeekSegment(guild, staff, wk, seg, uid)) {
    return true;
  }

  return false;
}

async function channelHasActiveCompitoForWeekSegment(guild?, staff?, weekKey?, segment?, userId?) {
  const { isDiscordStaffChannelPostsEnabled } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
  if (!isDiscordStaffChannelPostsEnabled()) return false;
  const wk = String(weekKey || "");
  const seg = String(segment || "");
  const uid = String(userId || "");
  if (!guild || !wk || !seg || !uid) return false;

  const channelId = String(IDs.channels?.valutazioniStaff || "");
  if (!channelId) return false;
  const channel = await getGuildChannelCached(guild, channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return false;

  const { collectActiveCompitoMessagesFromChannel } = require("./compitoChannelScan") as typeof import("./compitoChannelScan");
  const byUser = await collectActiveCompitoMessagesFromChannel(channel, 0);
  const entries = byUser.get(uid) || [];
  if (!entries.length) return false;

  for (const row of entries) {
    const rowWeekKey = weeklyResocontoService().getResocontoCycleWeekKey(new Date(row.createdAt || Date.now()));
            if (rowWeekKey === wk) return true;
  }

  return false;
}

async function grantCompitoSettimanaleIfEligible(guild?, reviewerUserId?, segment?, weekKey?, opts: Record<string, any> = {}) {
  const { verifiedHandler = false } = opts;
  const uid = String(reviewerUserId || "").trim();
  const seg = String(segment || "").trim();
  const wk = String(weekKey || "").trim();
  if (!guild || !uid || !seg || !wk) return { ok: false, skipped: "invalid_args" };
  if (!verifiedHandler && !memberIsResocontoReviewerForSegment({ id: uid }, seg)) {
    return { ok: false, skipped: "not_assigned_reviewer" };
  }

    if (await hasGlobalCompitoClaim(wk, seg, uid)) {
    return { ok: true, skipped: "global_compito_claim" };
  }

  const member = await getGuildMemberCached(guild, uid).catch(() => null);
  if (!member?.user) return { ok: false, skipped: "member_not_found" };
  if (memberIsExcludedFromResocontoReviewerReward(member)) {
    return { ok: false, skipped: "excluded_high_role" };
  }

  const { ensureStaffProfileDoc, getStaffDoc } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
  const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
  const profileDoc = await ensureStaffProfileDoc(
    await getStaffDoc(guild.id, uid),
    guild.id,
    uid,
  );
  const staff = ensureStaff(profileDoc);
  if (await reviewerAlreadyHasCompitoForWeekSegment(guild, staff, wk, seg, uid)) {
    await rememberGlobalCompitoClaim(wk, seg, uid);
    if (weeklyResocontoService().rememberResocontoCompitoClaim(staff, wk, seg, uid)) {
      profileDoc.markModified("staff");
      await profileDoc.save().catch(() => null);
    }
    return { ok: true, skipped: "already_rewarded_this_week" };
  }

  const result = await weeklyResocontoService().ensureWeeklyLimitAutoValutazione({
    guild,
    member,
    key: buildCompitoAutoKey(wk, seg, uid),
    type: "positive",
    reason: COMPITO_SETTIMANALE_REASON,
    force: false,
  });
      if (result?.created || result?.skipped === "exists" || result?.skipped === "spent_by_trade" || result?.skipped === "compito_claim") {
    await rememberGlobalCompitoClaim(wk, seg, uid);
    const freshDoc = await ensureStaffProfileDoc(await getStaffDoc(guild.id, uid), guild.id, uid);
    const freshStaff = ensureStaff(freshDoc);
    if (weeklyResocontoService().rememberResocontoCompitoClaim(freshStaff, wk, seg, uid)) {
      freshDoc.markModified("staff");
      await freshDoc.save().catch(() => null);
    }
  }
  return result;
}

async function reviewerIsEligibleForCompito(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return false;
  const member = await getGuildMemberCached(guild, uid).catch(() => null);
  if (!member?.user) return false;
  return !memberIsExcludedFromResocontoReviewerReward(member);
}

async function resolveCompitoRecipientForSegment(guild?, segment?, segmentStats?) {
  const assignedIds = new Set(
    getResocontoReviewerUserIdsForSegment(segment).map((id?) => String(id)),
  );
  const handlers = Array.isArray(segmentStats?.handlers)
    ? segmentStats.handlers.map((id?) => String(id || "").trim()).filter(Boolean)
    : [];

  const counts = new Map();
  for (const id of handlers) {
    if (!assignedIds.has(id)) continue;
    counts.set(id, (counts.get(id) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a?, b?) => b[1] - a[1]);
  for (const [topId] of sorted) {
    if (await reviewerIsEligibleForCompito(guild, topId)) return topId;
  }

  return null;
}

async function reviewerCompletedAllAssignedSegments(guild?, reviewerId?, scanStats?, weekKey = null) {
  const uid = String(reviewerId || "").trim();
  if (!uid || !scanStats) return false;
  const segments = getResocontoSegmentsForReviewerUserId(uid);
  if (!segments.length) return false;

    let stats = scanStats;
  try {
    const wk = String(weekKey || weeklyResocontoService().getResocontoCycleWeekKey() || "").trim();
    if (wk && guild?.id) {
      const siteExcl = await collectResocontoSegmentStatsFromSite(guild.id, wk, { excludeUserId: uid });
      const siteHasRows = RESOCONTO_SEGMENTS.some((s?) => Number(siteExcl[s]?.total || 0) > 0);
      if (siteHasRows) stats = siteExcl;
    }
  } catch (_) {}

  let anyActive = false;
  for (const seg of segments) {
    const st = stats[seg];
    if (!st || Number(st.total || 0) < 1) continue;
    anyActive = true;
    if (Number(st.handled || 0) < Number(st.total || 0)) return false;
    const recipient = await resolveCompitoRecipientForSegment(guild, seg, st);
    if (String(recipient || "") !== uid) return false;
  }
  return anyActive;
}

async function maybeGrantCompitoSettimanaleForSegment(
  guild?,
  channel?,
  segment?,
  weekKey?,
  { stats = null } = {},
) {
  const seg = String(segment || "").trim();
  if (!guild || !seg) return { ok: false, skipped: "invalid_args" };

  let scanStats = stats;
  if (!scanStats) {
    scanStats = await collectResocontoSegmentStatsForCompito(guild, channel, weekKey);
  }
  let segmentStats = scanStats?.[seg] || null;
  if (!segmentStats || segmentStats.total < 1) {
    return { ok: false, skipped: "no_resoconti" };
  }
  if (segmentStats.handled < segmentStats.total) {
    return { ok: false, skipped: "incomplete" };
  }

  const reviewerId = await resolveCompitoRecipientForSegment(guild, seg, segmentStats);
  if (!reviewerId) {
    return { ok: false, skipped: "no_eligible_handler" };
  }

    if (!(await reviewerCompletedAllAssignedSegments(guild, reviewerId, scanStats, weekKey))) {
    return { ok: false, skipped: "assigned_segments_incomplete" };
  }

  const result = await grantCompitoSettimanaleIfEligible(guild, reviewerId, seg, weekKey, {
    verifiedHandler: true,
  });
  if (!result?.created && result?.skipped && result.skipped !== "already_rewarded_this_week") {
    const level = result.skipped === "global_compito_claim" ? "info" : "warn";
    global.logger?.[level]?.(
      `[RESOCONTO REVIEWER REWARD] Compito non assegnato (${seg} → ${reviewerId}): ${result.skipped}`,
    );
  }
  return result?.created ? { ...result, reviewerId } : result;
}

function scheduleDebouncedCompitoSegmentChecks(guild?, channel = null) {
  if (!guild) return;
  if (compitoCheckTimer) return;

  compitoCheckTimer = setTimeout(() => {
    compitoCheckTimer = null;
    runDebouncedCompitoSegmentChecks(guild, channel).catch((err?) => {
      global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] Debounced check failed:", err?.message || err);
    });
  }, COMPITO_CHECK_DEBOUNCE_MS);
  compitoCheckTimer.unref?.();
}

async function runDebouncedCompitoSegmentChecks(guild?, channel = null) {
  if (compitoCheckRunning) return;
  compitoCheckRunning = true;
  try {
    const weekKey = weeklyResocontoService().getResocontoCycleWeekKey();
    const scanStats = await collectResocontoSegmentStatsForCompito(guild, channel, weekKey);
    const activeSegments = RESOCONTO_SEGMENTS.filter((segment?) => (scanStats[segment]?.total || 0) > 0);
    const granted = [];

    for (const segment of activeSegments) {
      const result = await maybeGrantCompitoSettimanaleForSegment(guild, channel, segment, weekKey, {
        stats: scanStats,
      });
      if (result?.created) granted.push(`${segment}:${result.reviewerId || "?"}`);
    }

    if (granted.length) {
      global.logger?.info?.(
        `[RESOCONTO REVIEWER REWARD] Compito settimanale → ${granted.join(", ")}`,
      );
    }
  } finally {
    compitoCheckRunning = false;
  }
}

async function onResocontoOutcomeRecorded(guild?, channel?, reviewerUserId?, payload?) {
  try {
    const segment = resolveSegmentFromPayload(payload);
        if (!segment || !guild) return;
    scheduleDebouncedCompitoSegmentChecks(guild, channel || null);
  } catch (err) {
    global.logger?.warn?.("[RESOCONTO REVIEWER REWARD] onOutcome failed:", err?.message || err);
  }
}

async function reconcileResocontoReviewerRewardAutoValutazioni() {
  return { ok: true, relinked: 0, skipped: "reconcile_disabled" };
}

function startResocontoReviewerRewardRecoveryLoop(client?) {
      void client;
}

export = {
  onResocontoOutcomeRecorded,
  reconcileResocontoReviewerRewardAutoValutazioni,
  startResocontoReviewerRewardRecoveryLoop,
};
