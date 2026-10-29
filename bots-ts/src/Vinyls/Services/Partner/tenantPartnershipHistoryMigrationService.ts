const crypto = require("node:crypto") as typeof import("node:crypto");
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  getPartnershipConfigSync,
  refreshPartnershipConfigCache,
} = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const {
  extractPartnershipLogIdFromMessage,
  isThankYouPartnershipMessage,
  extractManagerIdFromPartnershipText,
  collectPartnershipMessageText,
  extractPartnerNamesFromMessage,
  extractPmUserIdFromThankYouEmbedAuthor,
} = require("../../Utils/Partner/partnershipLogMessageUtils") as typeof import("../../Utils/Partner/partnershipLogMessageUtils");
const { extractInviteCode, extractInviteCodeFromUrl } = require("../../Utils/Partner/partnershipMessageUtils") as typeof import("../../Utils/Partner/partnershipMessageUtils");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { initPartnerManagerFieldsIfMissing } = require("../../Utils/Staff/staffPmUtils") as typeof import("../../Utils/Staff/staffPmUtils");
const BotState = require("../../Schemas/BotState/botStateSchema");

const QUEUE_STATE_KEY_LARGE = "tenantPartnershipHistoryMigrationQueue.v1";
const QUEUE_STATE_KEY_SMALL = "tenantPartnershipHistoryMigrationQueue.small.v1";
const QUEUE_LANES = Object.freeze({
  small: QUEUE_STATE_KEY_SMALL,
  large: QUEUE_STATE_KEY_LARGE,
});
const SMALL_QUEUE_MAX_MESSAGES = 1200;
const GLOBAL_PARTNERSHIP_LOG_SEQ_KEY = "globalPartnershipLogSeq.v1";
const FETCH_BATCH = 100;
const FETCH_DELAY_MS_LARGE = 350;
const FETCH_DELAY_MS_SMALL = 120;
const WORKER_TICK_MS = 2500;
const HEARTBEAT_STALE_MS = 90_000;
const MAX_JOB_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_UNDOABLE_JOB_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const workerId = `mig-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
let clientRef = null;
let tickTimer = null;
const processingByLane = { small: false, large: false };

function wait(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function normalizeLane(lane?) {
  return String(lane || "").trim().toLowerCase() === "small" ? "small" : "large";
}

function queueStateKeyForLane(lane?) {
  return QUEUE_LANES[normalizeLane(lane)];
}

function emptyQueueState() {
  return { version: 1, activeJobId: null, workerId: null, heartbeatAt: null, jobs: [] };
}

async function loadQueueState(lane = "large") {
  if (!isMongoReady()) return emptyQueueState();
  const raw = await getBotState(queueStateKeyForLane(lane), null).catch(() => null);
  if (!raw || typeof raw !== "object") return emptyQueueState();
  return {
    version: 1,
    activeJobId: raw.activeJobId || null,
    workerId: raw.workerId || null,
    heartbeatAt: raw.heartbeatAt || null,
    jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
  };
}

async function saveQueueState(lane?, state?) {
  if (!isMongoReady()) return false;
  const payload = {
    version: 1,
    activeJobId: state.activeJobId || null,
    workerId: state.workerId || null,
    heartbeatAt: state.heartbeatAt || null,
    jobs: Array.isArray(state.jobs) ? state.jobs : [],
    updatedAt: Date.now(),
  };
  await setBotState(queueStateKeyForLane(lane), payload);
  return true;
}

function jobMaxAgeMs(job?) {
  if (job?.status === "completed" && (Number(job?.result?.imported || 0) > 0 || Number(job?.result?.claimedForUndo || 0) > 0) && !job?.result?.undoneAt) {
    return MAX_UNDOABLE_JOB_AGE_MS;
  }
  return MAX_JOB_AGE_MS;
}

function pruneOldJobs(state?) {
  const now = Date.now();
  state.jobs = (state.jobs || []).filter((job?) => {
    if (!job) return false;
    if (job.status === "queued" || job.status === "running") return true;
    const finished = Number(job.finishedAt || job.createdAt || 0);
    return now - finished < jobMaxAgeMs(job);
  });
}

function publicJobView(job?, queueState?, lane = null) {
  if (!job) return null;
  const jobLane = normalizeLane(lane || job.lane || "large");
  const queuedAhead = (queueState?.jobs || []).filter(
    (j?) => j && j.status === "queued" && Number(j.createdAt || 0) < Number(job.createdAt || 0),
  ).length;
  const runningAhead =
    queueState?.activeJobId &&
    queueState.activeJobId !== job.id &&
    (queueState.jobs || []).some((j?) => j && j.id === queueState.activeJobId && j.status === "running")
      ? 1
      : 0;
  const queuePosition = job.status === "queued" ? queuedAhead + runningAhead + 1 : job.status === "running" ? 0 : null;
  const imported = Math.max(0, Math.floor(Number(job.result?.imported || 0)));
  const claimedForUndo = Math.max(0, Math.floor(Number(job.result?.claimedForUndo || 0)));
  const canUndo =
    job.status === "completed" &&
    (imported > 0 || claimedForUndo > 0) &&
    job.result?.tagged === true &&
    !job.result?.undoneAt;
  return {
    id: job.id,
    guildId: job.guildId,
    status: job.status,
    mode: job.mode,
    lane: jobLane,
    channelId: job.channelId || null,
    logsChannelId: job.logsChannelId || null,
    roleId: job.roleId || null,
    createdAt: job.createdAt || null,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    progress: job.progress || null,
    result: job.result || null,
    error: job.error || null,
    queuePosition,
    canUndo,
  };
}

function findLatestJobForGuildInState(state?, guildId?) {
  const gid = String(guildId || "").trim();
  const jobs = (state.jobs || [])
    .filter((j?) => j && String(j.guildId) === gid)
    .sort((a?, b?) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
  return jobs[0] || null;
}

async function findLatestJobForGuild(guildId?) {
  const gid = String(guildId || "").trim();
  const [smallState, largeState] = await Promise.all([loadQueueState("small"), loadQueueState("large")]);
  pruneOldJobs(smallState);
  pruneOldJobs(largeState);
  const smallJob = findLatestJobForGuildInState(smallState, gid);
  const largeJob = findLatestJobForGuildInState(largeState, gid);
  if (!smallJob) return { job: largeJob, state: largeState, lane: "large" };
  if (!largeJob) return { job: smallJob, state: smallState, lane: "small" };
  if (Number(smallJob.createdAt || 0) >= Number(largeJob.createdAt || 0)) {
    return { job: smallJob, state: smallState, lane: "small" };
  }
  return { job: largeJob, state: largeState, lane: "large" };
}

async function guildHasActiveOrQueuedJob(guildId?) {
  const gid = String(guildId || "").trim();
  const [smallState, largeState] = await Promise.all([loadQueueState("small"), loadQueueState("large")]);
  const check = (state?) =>
    (state.jobs || []).some(
      (j?) => j && String(j.guildId) === gid && (j.status === "queued" || j.status === "running"),
    );
  return check(smallState) || check(largeState);
}

async function findJobById(jobId?) {
  const id = String(jobId || "").trim();
  if (!id) return null;
  for (const lane of ["small", "large"]) {
    const state = await loadQueueState(lane);
    const job = (state.jobs || []).find((j?) => j && j.id === id);
    if (job) return { job, state, lane };
  }
  return null;
}

async function classifyMigrationLane(guild?, channelIds?) {
  const ids = [...new Set((channelIds || []).map((id?) => String(id || "").trim()).filter(Boolean))];
  let total = 0;
  for (const channelId of ids) {
    const channel =
      guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId).catch(() => null));
    if (!channel?.messages?.fetch) continue;
    let before;
    while (total <= SMALL_QUEUE_MAX_MESSAGES) {
      const batch = await channel.messages.fetch({ limit: FETCH_BATCH, before }).catch(() => null);
      if (!batch?.size) break;
      const values = [...batch.values()];
      total += values.length;
      if (total > SMALL_QUEUE_MAX_MESSAGES) return "large";
      if (values.length < FETCH_BATCH) break;
      before = values[values.length - 1]?.id;
      if (!before) break;
      await wait(150);
    }
  }
  return "small";
}

async function bumpGlobalLogSeq(maxId?) {
  const n = Math.floor(Number(maxId) || 0);
  if (!isMongoReady() || n <= 0) return;
  try {
    const doc = await BotState.findOne({ key: GLOBAL_PARTNERSHIP_LOG_SEQ_KEY }).lean();
    const current = Math.floor(Number(doc?.value) || 0);
    if (n > current) {
      await BotState.findOneAndUpdate(
        { key: GLOBAL_PARTNERSHIP_LOG_SEQ_KEY },
        { $set: { value: n } },
        { upsert: true, setDefaultsOnInsert: true },
      );
    }
  } catch (err) {
    global.logger?.warn?.("[partnershipHistoryMigration] bump seq failed:", err?.message || err);
  }
}

async function fetchAllChannelMessages(channel?, onBatch?, fetchDelayMs = FETCH_DELAY_MS_LARGE) {
  const out = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: FETCH_BATCH, before }).catch(() => null);
    if (!batch?.size) break;
    const values = [...batch.values()];
    out.push(...values);
    if (typeof onBatch === "function") {
      await onBatch({ fetched: out.length, batchSize: values.length });
    }
    if (batch.size < FETCH_BATCH) break;
    before = values[values.length - 1]?.id;
    if (!before) break;
    await wait(fetchDelayMs);
  }
  return out.sort((a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
}

function isExecuteLogMessage(message?) {
  for (const embed of message?.embeds || []) {
    const title = String(embed?.title || "").toLowerCase();
    if (title.includes("partnership eseguita")) return true;
  }
  return false;
}

function isDeleteLogMessage(message?) {
  for (const embed of message?.embeds || []) {
    const title = String(embed?.title || "").toLowerCase();
    if (title.includes("partnership eliminata")) return true;
  }
  return false;
}

function extractMentionIds(text?) {
  return [...String(text || "").matchAll(/<@!?(\d{16,20})>/g)].map((m?) => m[1]);
}

function extractDiscordMessageUrlParts(text?) {
  const m = String(text || "").match(/discord(?:app)?\.com\/channels\/(\d{16,20})\/(\d{16,20})\/(\d{16,20})/i);
  if (!m) return null;
  return { guildId: m[1], channelId: m[2], messageId: m[3] };
}

function collectInviteScanText(message?) {
  const parts = [collectPartnershipMessageText(message)];
  for (const embed of message?.embeds || []) {
    if (embed?.url) parts.push(String(embed.url));
  }
  for (const row of message?.components || []) {
    for (const comp of row?.components || []) {
      if (comp?.url) parts.push(String(comp.url));
    }
  }
  return parts.filter(Boolean).join("\n");
}

function extractInviteCodeFromMessage(message?) {
  return extractInviteCodeFromUrl(collectInviteScanText(message));
}

function escapeRegExp(s?) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizePersonLookup(value?) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/\s+/g, " ");
}

function buildPartnerManagerNameIndex(guild?, pmUserIds?) {
  const byLookup = new Map();
  const add = (raw?, id?) => {
    const key = normalizePersonLookup(raw);
    if (!key || key.length < 3) return;
    if (byLookup.has(key) && byLookup.get(key) !== id) {
      byLookup.set(key, null);
      return;
    }
    if (!byLookup.has(key)) byLookup.set(key, id);
  };
  for (const id of pmUserIds || []) {
    const uid = String(id || "").trim();
    if (!uid) continue;
    const member = guild?.members?.cache?.get?.(uid);
    const user = member?.user;
    if (!user) continue;
    add(user.username, uid);
    add(user.globalName, uid);
    add(member.displayName, uid);
    add(member.nickname, uid);
  }
  for (const [key, value] of [...byLookup.entries()]) {
    if (value == null) byLookup.delete(key);
  }
  return byLookup;
}

function findPmUserIdsInText(text?, pmUserIds?, nameIndex?, excludeUserId?) {
  const exclude = String(excludeUserId || "").trim();
  const found = [];
  const push = (id?) => {
    const uid = String(id || "").trim();
    if (!uid || (exclude && uid === exclude) || !pmUserIds?.has?.(uid)) return;
    if (!found.includes(uid)) found.push(uid);
  };

  for (const id of extractMentionIds(text)) push(id);
  for (const m of String(text || "").matchAll(/\b(\d{17,20})\b/g)) push(m[1]);

  if (nameIndex && nameIndex.size) {
    const lower = String(text || "").toLowerCase();
    const keys = [...nameIndex.keys()].sort((a?, b?) => b.length - a.length);
    for (const key of keys) {
      if (!key || key.length < 3) continue;
      const re = new RegExp(`(?:^|[^a-z0-9_])${escapeRegExp(key)}(?:[^a-z0-9_]|$)`, "i");
      if (!re.test(lower)) continue;
      push(nameIndex.get(key));
    }
  }
  return found;
}

function findPmUserIdAfterBotPartnership(messages?, index?, { pmUserIds, nameIndex, managerId, windowMs = 3 * 60 * 1000 } = {}) {
  const base = messages?.[index];
  const baseTs = Number(base?.createdTimestamp || 0);
  if (!base || !baseTs || !pmUserIds?.size) return null;

  const baseBlob = collectInviteScanText(base);
  let exclude =
    String(managerId || "").trim() ||
    extractManagerIdFromPartnershipText(baseBlob) ||
    null;

  const onBase = findPmUserIdsInText(baseBlob, pmUserIds, nameIndex, exclude);
  if (onBase.length) return onBase[0];

  for (let j = index + 1; j < messages.length; j += 1) {
    const m = messages[j];
    const ts = Number(m?.createdTimestamp || 0);
    if (!ts || ts - baseTs > windowMs) break;

        if (extractInviteCodeFromMessage(m) && !isThankYouPartnershipMessage(m)) break;

    const blob = collectInviteScanText(m);
    const followManager = extractManagerIdFromPartnershipText(blob);
    if (followManager) exclude = followManager;

    const hits = findPmUserIdsInText(blob, pmUserIds, nameIndex, exclude);
    const authorId = m?.author && !m.author.bot ? String(m.author.id) : null;
    const authorIsPm = Boolean(authorId && pmUserIds.has(authorId) && authorId !== exclude);

            if (authorIsPm) {
      if (!hits.length || hits.includes(authorId)) return authorId;
      return hits[0];
    }
    if (hits.length) return hits[0];
  }
  return null;
}

function resolvePmUserIdFromMessage(message?, opts: Record<string, any> = {}) {
  const followUpPmUserId = String(opts?.followUpPmUserId || "").trim() || null;
  const pmUserIds = opts?.pmUserIds || null;
  const managerHint = String(opts?.managerId || "").trim() || null;

  if (message?.author && !message.author.bot) return String(message.author.id);

    const embedAuthorId = extractPmUserIdFromThankYouEmbedAuthor(message);
  if (embedAuthorId && (!pmUserIds?.size || pmUserIds.has(embedAuthorId))) {
    return embedAuthorId;
  }

  const blob = collectInviteScanText(message);
  const labeledManager = extractManagerIdFromPartnershipText(blob) || managerHint;
  const mentions = extractMentionIds(blob).filter((id?) => id && id !== labeledManager);

  if (pmUserIds?.size) {
    const pmMentions = mentions.filter((id?) => pmUserIds.has(id));
    if (pmMentions.length) return pmMentions[0];
  } else if (mentions.length) {
    return mentions[0];
  }

  if (followUpPmUserId && followUpPmUserId !== labeledManager) {
    if (!pmUserIds?.size || pmUserIds.has(followUpPmUserId)) return followUpPmUserId;
  }
  return null;
}

function parseExecuteLogEvent(message?) {
  if (!isExecuteLogMessage(message)) return null;
  const blob = collectPartnershipMessageText(message);
  const globalLogId = extractPartnershipLogIdFromMessage(message);
  const mentions = extractMentionIds(blob);
    const managerId = extractManagerIdFromPartnershipText(blob) || (mentions.length > 1 ? mentions[1] : null);
  let pmUserId = mentions[0] || null;
  if (managerId && pmUserId && pmUserId === managerId && mentions.length > 1) {
    pmUserId = mentions.find((id?) => id !== managerId) || pmUserId;
  }
  const link = extractDiscordMessageUrlParts(blob);
  const inviteCode = extractInviteCodeFromUrl(blob) || extractInviteCode(blob);
  return {
    source: "log",
    messageId: message.id,
    channelId: message.channelId || message.channel?.id || null,
    date: message.createdAt || new Date(message.createdTimestamp || Date.now()),
    globalLogId,
    pmUserId,
    managerId,
    publishChannelId: link?.channelId || null,
    publishMessageId: link?.messageId || null,
    inviteCode,
    partner: null,
    partnerGuildId: null,
    invite: inviteCode ? `https://discord.gg/${inviteCode}` : null,
    partnerMessageIds: link?.messageId ? [link.messageId] : [],
  };
}

function parseThankYouEvent(message?, resolveOpts?) {
  if (!isThankYouPartnershipMessage(message)) return null;
  const blob = collectPartnershipMessageText(message);
  const managerId = extractManagerIdFromPartnershipText(blob) || resolveOpts?.managerId || null;
  const names = extractPartnerNamesFromMessage(message);
  const inviteCode = extractInviteCodeFromUrl(blob) || extractInviteCodeFromMessage(message);
  const pmUserId = resolvePmUserIdFromMessage(message, {
    ...(resolveOpts || {}),
    managerId,
  });
  return {
    source: "thankyou",
    messageId: message.id,
    channelId: message.channelId || message.channel?.id || null,
    date: message.createdAt || new Date(message.createdTimestamp || Date.now()),
    globalLogId: null,
    pmUserId,
    managerId,
    publishChannelId: message.channelId || message.channel?.id || null,
    publishMessageId: message.id,
    inviteCode,
    partner: names[0] || null,
    partnerGuildId: null,
    invite: inviteCode ? `https://discord.gg/${inviteCode}` : null,
    partnerMessageIds: [message.id],
  };
}

function parsePublishInviteEvent(message?, nearbyThankYou?, resolveOpts?) {
  const blob = collectInviteScanText(message);
  const inviteCode = extractInviteCodeFromMessage(message);
  if (!inviteCode) return null;

  const managerId =
    extractManagerIdFromPartnershipText(blob) ||
    (nearbyThankYou ? extractManagerIdFromPartnershipText(collectPartnershipMessageText(nearbyThankYou)) : null) ||
    resolveOpts?.managerId ||
    null;
  const pmUserId = resolvePmUserIdFromMessage(message, {
    ...(resolveOpts || {}),
    managerId,
  });
  const partnerMessageIds = [message.id];
  if (nearbyThankYou?.id) partnerMessageIds.push(nearbyThankYou.id);
  const names = nearbyThankYou ? extractPartnerNamesFromMessage(nearbyThankYou) : [];

  return {
    source: "publish",
    messageId: message.id,
    channelId: message.channelId || message.channel?.id || null,
    date: message.createdAt || new Date(message.createdTimestamp || Date.now()),
    globalLogId: null,
    pmUserId,
    managerId,
    publishChannelId: message.channelId || message.channel?.id || null,
    publishMessageId: message.id,
    inviteCode,
    partner: names[0] || null,
    partnerGuildId: null,
    invite: `https://discord.gg/${inviteCode}`,
    partnerMessageIds,
  };
}

async function resolveInviteMeta(inviteCode?, client = null) {
  const code = String(inviteCode || "").trim();
  if (!code) return null;
  try {
    const { fetchInviteGuildMeta } = require("../../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../../Utils/Partner/partnershipBlacklistDisplay");
    const meta = await fetchInviteGuildMeta(code, { timeoutMs: 8000, client });
    if (!meta?.guildId) return null;
    return {
      partnerGuildId: meta.guildId,
      partner: meta.guildName || null,
      invite: meta.invite || `https://discord.gg/${code}`,
    };
  } catch {
    return null;
  }
}

function eventDedupeKey(ev?) {
  if (ev.globalLogId) return `log:${ev.globalLogId}`;
  if (ev.publishMessageId) return `msg:${ev.publishMessageId}`;
  if (ev.inviteCode && ev.pmUserId) {
    return `inv:${String(ev.inviteCode).toLowerCase()}:${ev.pmUserId}:${Math.floor(Number(ev.date?.getTime?.() || ev.date || 0) / 60000)}`;
  }
  return `raw:${ev.messageId}`;
}

function findMatchingCreateAction(actions?, ev?) {
  const list = Array.isArray(actions) ? actions : [];
  for (const a of list) {
    if (!a || a.action !== "create") continue;
    if (ev.globalLogId && Number(a.globalLogId) === Number(ev.globalLogId)) return a;
    const ids = Array.isArray(a.partnerMessageIds) ? a.partnerMessageIds.map(String) : [];
    if (ev.publishMessageId && ids.includes(String(ev.publishMessageId))) return a;
    if (ev.messageId && ids.includes(String(ev.messageId))) return a;
  }
  return null;
}

function actionAlreadyExists(actions?, ev?) {
  return Boolean(findMatchingCreateAction(actions, ev));
}

async function persistImportedEvent(guildId?, ev?, opts: Record<string, any> = {}) {
  const pmUserId = String(ev.pmUserId || "").trim();
  if (!/^\d{16,20}$/.test(pmUserId)) return { ok: false, reason: "missing_pm" };

  const staffDoc = await getOrCreateStaffDoc(guildId, pmUserId);
  if (!staffDoc) return { ok: false, reason: "staff_doc" };
  const s = ensureStaff(staffDoc);
  initPartnerManagerFieldsIfMissing(s);
  if (!Array.isArray(s.partnerActions)) s.partnerActions = [];

  const migrationJobId = String(opts.migrationJobId || "").trim() || null;
  const existing = findMatchingCreateAction(s.partnerActions, ev);
  if (existing) {
        if (migrationJobId && !String(existing.migrationJobId || "").trim()) {
      existing.migrationJobId = migrationJobId;
      staffDoc.markModified("staff");
      await staffDoc.save();
      return { ok: true, duplicate: true, claimedForUndo: true };
    }
    return { ok: true, duplicate: true };
  }

  if (ev.managerId) s.managerId = String(ev.managerId);
  s.partnerActions.push({
    action: "create",
    partner: ev.partner || undefined,
    invite: ev.invite || (ev.inviteCode ? `https://discord.gg/${ev.inviteCode}` : undefined),
    partnerGuildId: ev.partnerGuildId || undefined,
    managerId: ev.managerId || null,
    partnershipChannelId: ev.publishChannelId || ev.channelId || null,
    partnerMessageIds: Array.isArray(ev.partnerMessageIds) ? ev.partnerMessageIds.map(String) : [],
    globalLogId: ev.globalLogId || null,
    migrationJobId,
    date: ev.date instanceof Date ? ev.date : new Date(ev.date || Date.now()),
  });
  const createCount = s.partnerActions.filter((a?) => a && a.action === "create").length;
  s.partnerCount = Math.max(Number(s.partnerCount) || 0, createCount);
  staffDoc.markModified("staff");
  await staffDoc.save();
  return { ok: true, duplicate: false };
}

async function updateJobProgress(jobId?, patch?) {
  const found = await findJobById(jobId);
  if (!found) return;
  const { job, state, lane } = found;
  job.progress = { ...(job.progress || {}), ...(patch || {}), updatedAt: Date.now() };
  if (state.activeJobId === jobId) {
    state.heartbeatAt = Date.now();
    state.workerId = workerId;
  }
  await saveQueueState(lane, state);
}

async function markJob(jobId?, status?, extra: Record<string, any> = {}) {
  const found = await findJobById(jobId);
  if (!found) return null;
  const { job, state, lane } = found;
  job.status = status;
  Object.assign(job, extra);
  if (status === "running") {
    state.activeJobId = jobId;
    state.workerId = workerId;
    state.heartbeatAt = Date.now();
    job.startedAt = job.startedAt || Date.now();
  }
  if (status === "completed" || status === "failed") {
    job.finishedAt = Date.now();
    if (state.activeJobId === jobId) {
      state.activeJobId = null;
      state.workerId = null;
      state.heartbeatAt = null;
    }
  }
  pruneOldJobs(state);
  await saveQueueState(lane, state);
  return { state, lane, job };
}

async function resolvePartnerManagerUserIds(guild?, roleId?) {
  const rid = String(roleId || "").trim();
  if (!rid || !guild) return new Set();
  try {
        if (guild.members?.cache?.size < (guild.memberCount || 0) * 0.5) {
      await guild.members.fetch().catch(() => null);
    }
  } catch {
      }
  const out = new Set();
  const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (role?.members?.size) {
    for (const id of role.members.keys()) out.add(String(id));
  }
  for (const member of guild.members.cache.values()) {
    if (member?.roles?.cache?.has?.(rid)) out.add(String(member.id));
  }
  return out;
}

async function runMigrationJob(client?, job?) {
  const guildId = String(job.guildId || "").trim();
  const lane = normalizeLane(job.lane || "large");
  const fetchDelayMs = lane === "small" ? FETCH_DELAY_MS_SMALL : FETCH_DELAY_MS_LARGE;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    await markJob(job.id, "failed", { error: "Server non trovato o bot non presente." });
    return;
  }

  await refreshPartnershipConfigCache().catch(() => {});
  const cfg = getPartnershipConfigSync(guildId) || {};
  const channelId = String(job.channelId || cfg.partnershipsChannelId || "").trim();
  const logsChannelId = String(job.logsChannelId || cfg.logsChannelId || "").trim();
  const roleId = String(job.roleId || cfg.partnerManagerRoleId || "").trim();

  if (!channelId && !logsChannelId) {
    await markJob(job.id, "failed", { error: "Serve almeno un canale partnership o log da scansionare." });
    return;
  }
  if (!roleId) {
    await markJob(job.id, "failed", {
      error: "Serve il ruolo Partner Manager: solo chi ha quel ruolo riceve i dati importati.",
    });
    return;
  }

    const pmUserIds = await resolvePartnerManagerUserIds(guild, roleId);
  if (!pmUserIds.size) {
    await markJob(job.id, "failed", {
      error: "Nessun membro ha il ruolo Partner Manager configurato: niente da importare.",
    });
    return;
  }
  const pmNameIndex = buildPartnerManagerNameIndex(guild, pmUserIds);

  const me = guild.members.me || (await guild.members.fetchMe().catch(() => null));
  const canRead = (ch?) => {
    if (!ch || !me) return false;
    const perms = ch.permissionsFor?.(me);
    return Boolean(perms?.has?.(PermissionFlagsBits.ViewChannel) && perms?.has?.(PermissionFlagsBits.ReadMessageHistory));
  };

  await updateJobProgress(job.id, {
    phase: "fetching",
    percent: 2,
    message: "Lettura cronologia canali…",
    messagesScanned: 0,
    eventsFound: 0,
    eventsImported: 0,
    eventsSkipped: 0,
    queuePosition: 0,
  });

  const publishChannel = channelId
    ? guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId))
    : null;
  const logsChannel = logsChannelId
    ? guild.channels.cache.get(logsChannelId) || (await getGuildChannelCached(guild, logsChannelId))
    : null;

  if (channelId && !canRead(publishChannel)) {
    await markJob(job.id, "failed", { error: "Il bot non può leggere la cronologia del canale partnership." });
    return;
  }
  if (logsChannelId && !canRead(logsChannel)) {
    await markJob(job.id, "failed", { error: "Il bot non può leggere la cronologia del canale log." });
    return;
  }

  let messagesScanned = 0;
  const onBatch = async ({ fetched }) => {
    messagesScanned = fetched;
    const pct = Math.min(45, 5 + Math.floor(fetched / 50));
    await updateJobProgress(job.id, {
      phase: "fetching",
      percent: pct,
      message: `Messaggi letti: ${fetched}…`,
      messagesScanned: fetched,
      queuePosition: 0,
    });
  };

  const logMessages = logsChannel ? await fetchAllChannelMessages(logsChannel, onBatch, fetchDelayMs) : [];
  const publishMessages = publishChannel
    ? await fetchAllChannelMessages(
        publishChannel,
        async (info?) => {
          await onBatch({ fetched: logMessages.length + info.fetched });
        },
        fetchDelayMs,
      )
    : [];

  messagesScanned = logMessages.length + publishMessages.length;
  await updateJobProgress(job.id, {
    phase: "parsing",
    percent: 48,
    message: "Analisi messaggi e ruolo Partner Manager…",
    messagesScanned,
    queuePosition: 0,
  });

  const deletedLogIds = new Set();
  for (const msg of logMessages) {
    if (!isDeleteLogMessage(msg)) continue;
    const id = extractPartnershipLogIdFromMessage(msg);
    if (id) deletedLogIds.add(id);
  }

  const eventsByKey = new Map();
  for (const msg of logMessages) {
    const ev = parseExecuteLogEvent(msg);
    if (!ev?.pmUserId) continue;
    if (ev.globalLogId && deletedLogIds.has(ev.globalLogId)) continue;
    eventsByKey.set(eventDedupeKey(ev), ev);
  }

  for (let i = 0; i < publishMessages.length; i += 1) {
    const msg = publishMessages[i];
    const thankYou = isThankYouPartnershipMessage(msg) ? msg : null;
    const next = publishMessages[i + 1];
    const pairedThankYou =
      thankYou ||
      (next && isThankYouPartnershipMessage(next) && Number(next.createdTimestamp) - Number(msg.createdTimestamp) < 120000
        ? next
        : null);

    const managerHint =
      extractManagerIdFromPartnershipText(collectInviteScanText(msg)) ||
      (pairedThankYou
        ? extractManagerIdFromPartnershipText(collectPartnershipMessageText(pairedThankYou))
        : null);

            const followUpPmUserId =
      msg?.author?.bot
        ? findPmUserIdAfterBotPartnership(publishMessages, i, {
            pmUserIds,
            nameIndex: pmNameIndex,
            managerId: managerHint,
          })
        : null;

    const resolveOpts = {
      followUpPmUserId,
      pmUserIds,
      managerId: managerHint,
    };

    if (thankYou) {
      const ev = parseThankYouEvent(msg, resolveOpts);
      if (ev?.pmUserId) {
                const clash = [...eventsByKey.values()].some(
          (e?) => e.publishMessageId && ev.partnerMessageIds.includes(e.publishMessageId),
        );
        const key = eventDedupeKey(ev);
        if (!clash && !eventsByKey.has(key)) eventsByKey.set(key, ev);
      }
      continue;
    }

    const ev = parsePublishInviteEvent(msg, pairedThankYou, resolveOpts);
    if (!ev?.pmUserId || !ev?.inviteCode) continue;
    const key = eventDedupeKey(ev);
    if (!eventsByKey.has(key)) eventsByKey.set(key, ev);
  }

  const allEvents = [...eventsByKey.values()];
  let skippedNotPm = 0;
  const events = allEvents
    .filter((ev?) => {
      const uid = String(ev?.pmUserId || "").trim();
      if (pmUserIds.has(uid)) return true;
      skippedNotPm += 1;
      return false;
    })
    .sort((a?, b?) => Number(a.date?.getTime?.() || a.date || 0) - Number(b.date?.getTime?.() || b.date || 0));

  await updateJobProgress(job.id, {
    phase: "importing",
    percent: 55,
    message: `Importazione di ${events.length} partnership (solo ruolo PM)…`,
    messagesScanned,
    eventsFound: events.length,
    eventsSkippedNotPm: skippedNotPm,
    eventsImported: 0,
    eventsSkipped: 0,
    queuePosition: 0,
  });

  let imported = 0;
  let skipped = 0;
  let duplicates = 0;
  let claimedForUndo = 0;
  let maxLogId = 0;
  const inviteCache = new Map();

  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (ev.inviteCode && !ev.partnerGuildId) {
      const cacheKey = String(ev.inviteCode).toLowerCase();
      if (!inviteCache.has(cacheKey)) {
        inviteCache.set(cacheKey, await resolveInviteMeta(ev.inviteCode, clientRef));
        await wait(200);
      }
      const meta = inviteCache.get(cacheKey);
      if (meta) {
        ev.partnerGuildId = meta.partnerGuildId;
        if (!ev.partner) ev.partner = meta.partner;
        if (!ev.invite) ev.invite = meta.invite;
      }
    }

    try {
      const res = await persistImportedEvent(guildId, ev, { migrationJobId: job.id });
      if (!res.ok) skipped += 1;
      else if (res.claimedForUndo) {
        duplicates += 1;
        claimedForUndo += 1;
      } else if (res.duplicate) duplicates += 1;
      else imported += 1;
      if (ev.globalLogId) maxLogId = Math.max(maxLogId, Number(ev.globalLogId) || 0);
    } catch (err) {
      skipped += 1;
      global.logger?.warn?.("[partnershipHistoryMigration] persist failed:", err?.message || err);
    }

    if (i % 5 === 0 || i === events.length - 1) {
      const pct = events.length ? 55 + Math.floor((40 * (i + 1)) / events.length) : 95;
      await updateJobProgress(job.id, {
        phase: "importing",
        percent: pct,
        message: `Importate ${imported}/${events.length} (saltate ${skipped}, già presenti ${duplicates})…`,
        messagesScanned,
        eventsFound: events.length,
        eventsImported: imported,
        eventsSkipped: skipped,
        eventsDuplicates: duplicates,
        queuePosition: 0,
      });
    }
  }

  await bumpGlobalLogSeq(maxLogId);

  const result = {
    messagesScanned,
    eventsFound: events.length,
    eventsDetected: allEvents.length,
    imported,
    skipped,
    skippedNotPm,
    duplicates,
    claimedForUndo,
    deletedIgnored: deletedLogIds.size,
    pmRoleMembers: pmUserIds.size,
    channelId: channelId || null,
    logsChannelId: logsChannelId || null,
    roleId: roleId || null,
    tagged: true,
    migrationJobId: job.id,
    lane,
    undoneAt: null,
    removedOnUndo: 0,
  };

  await markJob(job.id, "completed", {
    error: null,
    result,
    progress: {
      phase: "done",
      percent: 100,
      message: `Completata: ${imported} importate, ${duplicates} già presenti, ${skipped} saltate` +
        (claimedForUndo ? ` (${claimedForUndo} agganciate per annulla)` : "") +
        (skippedNotPm ? `, ${skippedNotPm} fuori ruolo PM` : "") +
        ".",
      messagesScanned,
      eventsFound: events.length,
      eventsImported: imported,
      eventsSkipped: skipped,
      eventsSkippedNotPm: skippedNotPm,
      eventsDuplicates: duplicates,
      eventsClaimedForUndo: claimedForUndo,
      queuePosition: 0,
      updatedAt: Date.now(),
    },
  });
}

function lockIsStale(state?) {
  const hb = Number(state.heartbeatAt || 0);
  if (!state.activeJobId) return true;
  if (!hb) return true;
  return Date.now() - hb > HEARTBEAT_STALE_MS;
}

async function claimNextJob(lane?) {
  const laneKey = normalizeLane(lane);
  const state = await loadQueueState(laneKey);
  pruneOldJobs(state);

  if (state.activeJobId) {
    const active = (state.jobs || []).find((j?) => j && j.id === state.activeJobId);
    if (active && active.status === "running" && !lockIsStale(state)) {
      await saveQueueState(laneKey, state);
      return null;
    }
    if (active && active.status === "running" && lockIsStale(state)) {
      active.status = "queued";
      active.progress = {
        ...(active.progress || {}),
        phase: "queued",
        message: "Ripresa dopo interruzione worker…",
        updatedAt: Date.now(),
      };
      state.activeJobId = null;
      state.workerId = null;
      state.heartbeatAt = null;
    } else if (!active) {
      state.activeJobId = null;
      state.workerId = null;
      state.heartbeatAt = null;
    }
  }

  const next = (state.jobs || [])
    .filter((j?) => j && j.status === "queued")
    .sort((a?, b?) => Number(a.createdAt || 0) - Number(b.createdAt || 0))[0];
  if (!next) {
    await saveQueueState(laneKey, state);
    return null;
  }

  next.status = "running";
  next.lane = laneKey;
  next.startedAt = Date.now();
  next.progress = {
    phase: "starting",
    percent: 1,
    message: "Avvio migrazione…",
    queuePosition: 0,
    updatedAt: Date.now(),
  };
  state.activeJobId = next.id;
  state.workerId = workerId;
  state.heartbeatAt = Date.now();
  await saveQueueState(laneKey, state);
  return next;
}

async function processLaneTick(lane?) {
  const laneKey = normalizeLane(lane);
  if (processingByLane[laneKey] || !clientRef) return;
  processingByLane[laneKey] = true;
  try {
    if (!isMongoReady()) return;
    const job = await claimNextJob(laneKey);
    if (!job) return;
    global.logger?.info?.(
      `[partnershipHistoryMigration] start job=${job.id} guild=${job.guildId} lane=${laneKey} worker=${workerId}`,
    );
    await runMigrationJob(clientRef, job);
  } catch (err) {
    global.logger?.error?.(`[partnershipHistoryMigration] tick ${laneKey} failed:`, err?.message || err);
  } finally {
    processingByLane[laneKey] = false;
  }
}

async function processQueueTick() {
  await Promise.all([processLaneTick("small"), processLaneTick("large")]);
}

function startPartnershipHistoryMigrationWorker(client?) {
  const dedicated =
    String(process.env.PARTNERSHIP_MIGRATION_WORKER || "").trim() === "1";
  const external =
    String(process.env.PARTNERSHIP_MIGRATION_EXTERNAL || "").trim() === "1";

    if (external && !dedicated) return;
    if (!dedicated && (!client || client._isSiteApiRestClient)) return;

  clientRef = client || clientRef;
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    processQueueTick().catch(() => {});
  }, WORKER_TICK_MS);
  tickTimer.unref?.();
  setTimeout(() => {
    processQueueTick().catch(() => {});
  }, 4000).unref?.();
  global.logger?.info?.(
    `[partnershipHistoryMigration] worker avviato (${dedicated ? "pm2 dedicato" : "gateway"}) id=${workerId} (code small+large)`,
  );
}

async function enqueuePartnershipHistoryMigration({
  guildId,
  requestedBy,
  mode = "configured",
  channelId = null,
  logsChannelId = null,
  roleId = null,
  client = null,
}) {
  if (!isMongoReady()) {
    return { ok: false, status: 503, error: "mongo_not_ready", message: "Database non disponibile." };
  }
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }

  await refreshPartnershipConfigCache().catch(() => {});
  const cfg = getPartnershipConfigSync(gid) || {};
  const useConfigured = String(mode || "configured") !== "custom";

    const resolvedChannelId = String(
    (useConfigured ? cfg.partnershipsChannelId : channelId) ||
      channelId ||
      cfg.partnershipsChannelId ||
      "",
  ).trim();
  const resolvedLogsChannelId = String(
    (useConfigured ? cfg.logsChannelId : logsChannelId) ||
      logsChannelId ||
      cfg.logsChannelId ||
      "",
  ).trim();
  const resolvedRoleId = String(
    (useConfigured ? cfg.partnerManagerRoleId : roleId) ||
      roleId ||
      cfg.partnerManagerRoleId ||
      "",
  ).trim();

  if (!resolvedChannelId && !resolvedLogsChannelId) {
    return {
      ok: false,
      status: 400,
      error: "missing_channel",
      message: "Seleziona un canale partnership (o assicurati che sia già impostato).",
    };
  }
  if (!resolvedRoleId) {
    return {
      ok: false,
      status: 400,
      error: "missing_role",
      message: "Serve il ruolo Partner Manager: solo chi ha quel ruolo riceve i dati importati.",
    };
  }

  if (await guildHasActiveOrQueuedJob(gid)) {
    const latest = await findLatestJobForGuild(gid);
    return {
      ok: false,
      status: 409,
      error: "already_queued",
      message: "C’è già una migrazione in coda o in corso per questo server.",
      job: publicJobView(latest.job, latest.state, latest.lane),
    };
  }

  let lane = "large";
  const discordClient = client || clientRef;
  if (discordClient) {
    try {
      const guild =
        discordClient.guilds?.cache?.get(gid) ||
        (await discordClient.guilds.fetch(gid).catch(() => null));
      if (guild) {
        const role =
          guild.roles.cache.get(resolvedRoleId) ||
          (await guild.roles.fetch(resolvedRoleId).catch(() => null));
        if (!role) {
          return {
            ok: false,
            status: 400,
            error: "role_not_found",
            message: "Il ruolo Partner Manager non esiste più su questo server.",
          };
        }
        const pmUserIds = await resolvePartnerManagerUserIds(guild, resolvedRoleId);
        if (!pmUserIds.size) {
          return {
            ok: false,
            status: 400,
            error: "no_partner_managers",
            message: "Nessun membro ha il ruolo Partner Manager configurato: niente da importare.",
          };
        }
        lane = await classifyMigrationLane(guild, [resolvedChannelId, resolvedLogsChannelId]);
      }
    } catch (err) {
      global.logger?.warn?.("[partnershipHistoryMigration] classify failed:", err?.message || err);
      lane = "large";
    }
  }

  const state = await loadQueueState(lane);
  pruneOldJobs(state);

  const job = {
    id: crypto.randomBytes(8).toString("hex"),
    guildId: gid,
    requestedBy: String(requestedBy || "").trim() || null,
    mode: useConfigured ? "configured" : "custom",
    lane,
    channelId: resolvedChannelId || null,
    logsChannelId: resolvedLogsChannelId || null,
    roleId: resolvedRoleId || null,
    status: "queued",
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
    progress: {
      phase: "queued",
      percent: 0,
      message: lane === "small" ? "In coda (migrazioni rapide)…" : "In coda (migrazioni lunghe)…",
      queuePosition: null,
      updatedAt: Date.now(),
    },
    result: null,
    error: null,
  };
  state.jobs.push(job);
  await saveQueueState(lane, state);

  const refreshed = await loadQueueState(lane);
  setTimeout(() => processQueueTick().catch(() => {}), 200).unref?.();

  return {
    ok: true,
    status: 200,
    job: publicJobView(job, refreshed, lane),
    message:
      lane === "small"
        ? "Migrazione messa in coda rapida."
        : "Migrazione messa in coda (canale grande).",
  };
}

async function getPartnershipHistoryMigrationStatus(guildId?) {
  const [smallState, largeState] = await Promise.all([loadQueueState("small"), loadQueueState("large")]);
  pruneOldJobs(smallState);
  pruneOldJobs(largeState);
  const latest = await findLatestJobForGuild(guildId);
  const smallQueued = (smallState.jobs || []).filter((j?) => j && j.status === "queued").length;
  const largeQueued = (largeState.jobs || []).filter((j?) => j && j.status === "queued").length;
  const smallActive = (smallState.jobs || []).find((j?) => j && j.id === smallState.activeJobId) || null;
  const largeActive = (largeState.jobs || []).find((j?) => j && j.id === largeState.activeJobId) || null;
  return {
    ok: true,
    status: 200,
    job: publicJobView(latest.job, latest.state, latest.lane),
    queue: {
      oneAtATime: true,
      dualLanes: true,
      small: {
        activeGuildId: smallActive?.guildId || null,
        queuedCount: smallQueued,
      },
      large: {
        activeGuildId: largeActive?.guildId || null,
        queuedCount: largeQueued,
      },
      queuedCount: smallQueued + largeQueued,
      activeGuildId: largeActive?.guildId || smallActive?.guildId || null,
    },
  };
}

async function undoPartnershipHistoryMigration(guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!/^\d{16,20}$/.test(gid)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  if (!isMongoReady()) {
    return { ok: false, status: 503, error: "mongo_not_ready", message: "Database non disponibile." };
  }

  const latest = await findLatestJobForGuild(gid);
  const job = latest.job;
  const view = publicJobView(job, latest.state, latest.lane);
  if (!job || !view?.canUndo) {
    return {
      ok: false,
      status: 400,
      error: "nothing_to_undo",
      message:
        "Nessuna migrazione annullabile. Puoi cancellare solo i dati dell’ultima migrazione completata (non già annullata).",
      job: view,
    };
  }

  const jobId = String(job.id);
  const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
  const {
    countPartnerCreateActions,
    getPartnerServerResetMs,
  } = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");

  const docs = await ActivityUserProfile.find({
    guildId: gid,
    "staff.partnerActions.migrationJobId": jobId,
  }).catch(() => []);

  let removed = 0;
  for (const doc of docs) {
    if (!doc?.staff) continue;
    const actions = Array.isArray(doc.staff.partnerActions) ? doc.staff.partnerActions : [];
    const next = actions.filter((a?) => String(a?.migrationJobId || "") !== jobId);
    const removedHere = actions.length - next.length;
    if (!removedHere) continue;
    removed += removedHere;
    doc.staff.partnerActions = next;
    doc.staff.partnerCount = countPartnerCreateActions(next, {
      afterMs: getPartnerServerResetMs(doc.staff),
    });
    doc.markModified("staff");
    await doc.save().catch((err?) => {
      global.logger?.warn?.("[partnershipHistoryMigration] undo save failed:", err?.message || err);
    });
  }

  const found = await findJobById(jobId);
  if (found) {
    found.job.result = {
      ...(found.job.result || {}),
      undoneAt: Date.now(),
      removedOnUndo: removed,
      undoneBy: String(opts.requestedBy || "").trim() || null,
    };
    found.job.progress = {
      ...(found.job.progress || {}),
      phase: "undone",
      percent: 100,
      message: `Migrazione annullata: rimossi ${removed} record importati.`,
      updatedAt: Date.now(),
    };
    await saveQueueState(found.lane, found.state);
  }

  try {
    const { invalidateLeaderboardCache } = require("./tenantLeaderboardService") as typeof import("./tenantLeaderboardService");
    invalidateLeaderboardCache();
  } catch (_) {}

  const refreshed = await findLatestJobForGuild(gid);
  return {
    ok: true,
    status: 200,
    removed,
    job: publicJobView(refreshed.job, refreshed.state, refreshed.lane),
    message: removed
      ? `Rimossi ${removed} dati importati dall’ultima migrazione.`
      : "Nessun record trovato da rimuovere (forse già cancellati).",
  };
}

export = {
  startPartnershipHistoryMigrationWorker,
  enqueuePartnershipHistoryMigration,
  getPartnershipHistoryMigrationStatus,
  undoPartnershipHistoryMigration,
  QUEUE_STATE_KEY: QUEUE_STATE_KEY_LARGE,
  QUEUE_STATE_KEY_LARGE,
  QUEUE_STATE_KEY_SMALL,
};
