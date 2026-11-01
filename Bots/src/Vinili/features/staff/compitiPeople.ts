/** Compiti staff: chi fa i compiti e cosa vede chi li guarda. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { accountUsername, userAvatarUrlDynamic, discordDefaultAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { memberIsHighStaffEligible } = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { remapRoleIdForward } = require("../../Utils/Config/emergencyRoleIdRemap") as typeof import("../../Utils/Config/emergencyRoleIdRemap");
const { parseViewAsFromReq, compitiRoleOverride } = require("../../Web/siteViewAsPreview") as typeof import("../../Web/siteViewAsPreview");
const { isAutoTask, taskById } = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { isoWeeksInMonthKey, weekKeysInRomeMonth } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { withProofTokens } = require("./compitiProofs") as typeof import("./compitiProofs");
const { LEGACY_TASK_LABELS, STATUS, emptyWeek, sanitizeWeekEntry } = require("./compitiWeeks") as typeof import("./compitiWeeks");
const { MONTHLY_SWAP_BASE, planPoolIds, lockedTaskIdsForMonth, monthCompletedWeekCount, planSwapsLeft } = require("./compitiPlan") as typeof import("./compitiPlan");

function displayTaskLabel(taskId?, status?) {
  const id = String(taskId || "").trim();
  if (!id) {
    if (status === STATUS.APPROVED) return "Compito confermato";
    if (status === STATUS.SUBMITTED) return "In revisione";
    if (status === STATUS.MISSED) return "Non completato";
    if (status === STATUS.REJECTED) return "Rifiutato";
    if (status === STATUS.SKIPPED) return "Esonero (nuovo staff)";
    return "Nessun compito";
  }
  const meta = taskById(id);
  if (meta?.label) return meta.label;
  if (LEGACY_TASK_LABELS[id]) return LEGACY_TASK_LABELS[id];
  return id;
}

function buildIdentityFromMember(member?, user?) {
  const userId = String(member?.id || user?.id || "").trim();
  const avatarUrl =
    userAvatarUrlDynamic(member, { size: 128 }) ||
    userAvatarUrlDynamic(user, { size: 128 }) ||
    discordDefaultAvatarUrl(user || { id: userId }, { size: 128 });
  return {
    userId,
    displayName:
      String(member?.displayName || user?.globalName || user?.username || "Staff").trim() || "Staff",
    username: accountUsername(user) || String(user?.username || "").trim() || "",
    avatarUrl,
  };
}

function memberHasRoleKey(member?, key?) {
  const id = remapRoleIdForward(String(IDs.roles?.[key] || "")) || String(IDs.roles?.[key] || "");
  return Boolean(id && member?.roles?.cache?.has?.(id));
}

/** Operativo: Helper/Mod/Senior/Director. Non High Staff. Solo-PM esclusi (PM+staff ok). Marker: compitiPmStaffOk1 */
function isCompitiWorkerMember(member?) {
  if (!member) return false;
  if (memberIsHighStaffEligible(member)) return false;
  return (
    memberHasRoleKey(member, "Helper") ||
    memberHasRoleKey(member, "Mod") ||
    memberHasRoleKey(member, "SeniorModerator") ||
    memberHasRoleKey(member, "Director")
  );
}

function isHighStaffViewer(member?) {
  return memberIsHighStaffEligible(member);
}

function pillForStatus(status?, hasTask?, { canRetry = false } = {}) {
  if (status === STATUS.APPROVED) return { label: "Completato", kind: "done" };
  if (status === STATUS.SKIPPED) return { label: "Esonero", kind: "done" };
  if (status === STATUS.MISSED) return { label: "Non completato", kind: "fail" };
  if (status === STATUS.REJECTED && canRetry) return { label: "Da rifare", kind: "retry" };
  if (status === STATUS.REJECTED) return { label: "Non completato", kind: "fail" };
  if (status === STATUS.SUBMITTED) return { label: "In revisione", kind: "review" };
  if (hasTask) return { label: "Da fare", kind: "todo" };
  return { label: "Da fare", kind: "todo" };
}

function publicProgress(weekKey?, userId?, entry?, lockedIds?, monthKey?, map?, deadlines = null, plan = null) {
  const e = sanitizeWeekEntry(entry || {});
  const pool = planPoolIds(plan);
  const effectiveTaskId = e.taskId;
  const auto = isAutoTask(effectiveTaskId);
  const submitOpen = deadlines ? Boolean(deadlines.submitOpen) : true;
  const canRetry = e.status === STATUS.REJECTED && submitOpen && !auto;
  const pill = pillForStatus(e.status, Boolean(effectiveTaskId), { canRetry });
  const weeksInMonth = weekKeysInRomeMonth(monthKey);
  return {
    weekKey,
    taskId: effectiveTaskId,
    assignedTaskId: effectiveTaskId,
    done: e.done,
    note: e.note,
    proofs: withProofTokens(weekKey, userId, e.proofs),
    status: e.status,
    submittedAt: e.submittedAt,
    reviewedAt: e.reviewedAt,
    autoSubmitted: Boolean(e.autoSubmitted),
    isAuto: auto,
    canRetry,
    pill,
    lockedTaskIds: lockedIds,
    monthDistinct: monthCompletedWeekCount(map, monthKey),
    monthRequired: weeksInMonth.length || isoWeeksInMonthKey(monthKey),
    monthRule: "pool_pick",
    poolTaskIds: pool,
  };
}

function buildPublicPlan(monthKey?, plan?, map?, currentWeekKey?, swapBonus = 0) {
  const pool = planPoolIds(plan);
  const tasks = pool.map((taskId?) => {
    const meta = taskById(taskId);
    return {
      id: taskId,
      label: meta?.label || taskId,
      auto: Boolean(meta?.auto),
      difficulty: meta?.difficulty || "medio",
    };
  });
  const used = Math.max(0, Math.floor(Number(plan?.swapUsedCount) || 0));
  const bonus = Math.max(0, Math.floor(Number(swapBonus) || 0));
  return {
    monthKey,
    assignedAt: Number(plan?.assignedAt) || 0,
    taskIds: pool,
    tasks,
    weekKey: currentWeekKey,
    weeksInMonth: weekKeysInRomeMonth(monthKey).length,
    swapUsedCount: used,
    swapBonus: bonus,
    swapsLeft: planSwapsLeft(plan, bonus),
    swapBase: MONTHLY_SWAP_BASE,
    /** Mese compiti = mese del giovedì ISO: pool fisso, niente re-roll all'1 calendario. */
    monthBridgeNote:
      "Il pool resta quello del mese compiti (giovedì ISO). L'ultima settimana a cavallo non si ri-tira all'1.",
  };
}

function buildMonthEntries(monthKey?, userId?, map?, plan?, deadlines?, currentWeekKey?) {
  const weeks = weekKeysInRomeMonth(monthKey);
  const cur = String(currentWeekKey || "");
  return weeks.map((wk?) => {
    const entry = sanitizeWeekEntry(map?.[wk] || emptyWeek());
    const locked = lockedTaskIdsForMonth(map, monthKey, wk, plan).filter((id?) => id !== entry.taskId);
    const progress = publicProgress(wk, userId, entry, locked, monthKey, map, deadlines, plan);
    const meta = taskById(progress.taskId);
    const isCurrent = wk === cur;
    const isFuture = Boolean(cur && wk > cur);
    return {
      weekKey: wk,
      isCurrent,
      isFuture,
      taskId: progress.taskId,
      label: displayTaskLabel(progress.taskId, progress.status),
      auto: Boolean(meta?.auto),
      status: progress.status,
      pill: progress.pill,
      note: progress.note,
      proofs: progress.proofs,
      autoSubmitted: progress.autoSubmitted,
      submittedAt: progress.submittedAt,
      reviewedAt: progress.reviewedAt,
      canRetry: progress.canRetry,
      isAuto: progress.isAuto,
    };
  });
}

const workerMembersCache = new Map();
 // guildId -> { at, members }

const COMPITI_WORKER_RANK_KEYS = Object.freeze([
  "Director",
  "SeniorModerator",
  "Mod",
  "Helper",
]);

function compitiWorkerRank(member?) {
  for (let i = 0; i < COMPITI_WORKER_RANK_KEYS.length; i++) {
    if (memberHasRoleKey(member, COMPITI_WORKER_RANK_KEYS[i])) return i;
  }
  return COMPITI_WORKER_RANK_KEYS.length + 1;
}

function scanWorkerMembers(guild?) {
  const out = [];
  if (!guild?.members?.cache) return out;
  for (const member of guild.members.cache.values()) {
    if (member.user?.bot) continue;
    if (!isCompitiWorkerMember(member)) continue;
    out.push(member);
  }
  out.sort((a?, b?) => {
    const ra = compitiWorkerRank(a);
    const rb = compitiWorkerRank(b);
    if (ra !== rb) return ra - rb;
    return String(a.displayName || a.user?.username || "").localeCompare(
      String(b.displayName || b.user?.username || ""),
      "it",
      { sensitivity: "base" },
    );
  });
  return out;
}

async function listWorkerMembers(client?, guildId?, { force = false } = {}) {
  const cached = workerMembersCache.get(guildId);
  // compitiStaffListFull1: partial Discord cache often has only a few workers —
  // never trust a warm short list without a prior full fetch.
  if (
    !force &&
    cached &&
    cached.fetchedFull &&
    Date.now() - cached.at < 90_000 &&
    Array.isArray(cached.members) &&
    cached.members.length > 0
  ) {
    return cached.members;
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return cached?.members || [];

  let out = scanWorkerMembers(guild);
  let fetchedFull = Boolean(cached?.fetchedFull);
  const needFull =
    force ||
    !fetchedFull ||
    out.length < 3 ||
    guild.members.cache.size < 80;
  if (needFull) {
    try {
      await guild.members.fetch({ withPresences: false });
      fetchedFull = true;
    } catch (_) {}
    out = scanWorkerMembers(guild);
  }
  workerMembersCache.set(guildId, { at: Date.now(), members: out, fetchedFull });
  return out;
}

function resolveCompitiRoles(viewer?, req?) {
  let highStaff = isHighStaffViewer(viewer);
  let workerSelf = isCompitiWorkerMember(viewer);
  let viewAs = null;
  /* Prefer header override (Founder already validated in assert); works even on shimmed member. */
  const preset = parseViewAsFromReq(req);
  const over = preset ? compitiRoleOverride(preset) : null;
  if (over) {
    viewAs = preset;
    if (over.deny) {
      return { highStaff: false, workerSelf: false, viewAs, deny: true };
    }
    highStaff = Boolean(over.highStaff);
    workerSelf = Boolean(over.workerSelf);
  }
  return { highStaff, workerSelf, viewAs, deny: false };
}

/* apiWarmSwr2: full guild.members.fetch per workers list (cold staff compiti) */
async function warmSiteStaffCompitiWorkersCache(client?) {
  try {
    const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    if (!guildId) return null;
    return await listWorkerMembers(client, guildId, { force: true });
  } catch (err) {
    global.logger?.warn?.("[site-staff-compiti] warm workers:", err?.message || err);
    return null;
  }
}

export = { buildIdentityFromMember, publicProgress, buildPublicPlan, buildMonthEntries, workerMembersCache, scanWorkerMembers, listWorkerMembers, resolveCompitiRoles, warmSiteStaffCompitiWorkersCache };
