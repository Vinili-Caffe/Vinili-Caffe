/** Compiti staff: piano del mese (estrazione dei compiti, cambi, bonus). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { TASKS_META, ALLOWED_TASK_IDS, HARD_TASKS_PER_MONTH, isHardTask, countHardTasks } = require("./siteStaffCompitiCatalog") as typeof import("./siteStaffCompitiCatalog");
const { romeMonthKey, weekKeysInRomeMonth, prevRomeMonthKey, monthKeyForWeekKey, compitiActiveMonthKey } = require("./compitiCalendar") as typeof import("./compitiCalendar");
const { STATUS, loadMap } = require("./compitiWeeks") as typeof import("./compitiWeeks");

/** 1 scambio gratis / mese compiti; bonus da Staffer della settimana restano in banca. */
const MONTHLY_SWAP_BASE = 1;

function shuffleInPlace(arr?) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function drawDistinctMonthTasks(excludeSet?, n?) {
  const all = TASKS_META.map((t?) => t.id);
  const want = Math.max(0, Math.min(Number(n) || 0, all.length));
  const picked = [];
  /* sempre esattamente HARD_TASKS_PER_MONTH compiti difficili nel pool, il resto facili/medi */
  const take = (ids?, limit?) => {
    for (const id of ids) {
      if (picked.length >= limit) break;
      if (!picked.includes(id)) picked.push(id);
    }
  };
  const fresh = (hard?) => shuffleInPlace(all.filter((id?) => isHardTask(id) === hard && !excludeSet.has(id)));
  const any = (hard?) => shuffleInPlace(all.filter((id?) => isHardTask(id) === hard));
  const hardWant = Math.min(HARD_TASKS_PER_MONTH, want);
  take(fresh(true), hardWant);
  take(any(true), hardWant);
  take(fresh(false), want);
  take(any(false), want);
  return picked.slice(0, want);
}

function sanitizePlanEntry(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const byWeekSrc = src.byWeek && typeof src.byWeek === "object" && !Array.isArray(src.byWeek) ? src.byWeek : {};
  const byWeek: Record<string, any> = {};
  for (const [wk, tid] of Object.entries(byWeekSrc)) {
    if (!/^\d{4}-W\d{2}$/.test(wk)) continue;
    const id = String(tid || "").trim();
    if (!ALLOWED_TASK_IDS.has(id)) continue;
    byWeek[wk] = id;
  }
  let taskIds = [];
  if (Array.isArray(src.taskIds)) {
    for (const tid of src.taskIds) {
      const id = String(tid || "").trim();
      if (ALLOWED_TASK_IDS.has(id) && !taskIds.includes(id)) taskIds.push(id);
    }
  }
  // Migrate old week-locked plans → selectable month pool.
  if (!taskIds.length && Object.keys(byWeek).length) {
    for (const tid of Object.values(byWeek)) {
      const id = String(tid || "").trim();
      if (ALLOWED_TASK_IDS.has(id) && !taskIds.includes(id)) taskIds.push(id);
    }
  }
  return {
    assignedAt: Number(src.assignedAt) || 0,
    taskIds,
    byWeek,
    swapUsedCount: Math.max(0, Math.min(99, Math.floor(Number(src.swapUsedCount) || 0))),
  };
}

function sanitizePlanMap(raw?) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const out: Record<string, any> = {};
  for (const [mk, v] of Object.entries(src)) {
    if (!/^\d{4}-\d{2}$/.test(mk)) continue;
    out[mk] = sanitizePlanEntry(v);
  }
  return out;
}

function planPoolIds(plan?) {
  const ids = Array.isArray(plan?.taskIds) ? plan.taskIds.map((x?) => String(x || "").trim()) : [];
  const out = [];
  for (const id of ids) {
    if (ALLOWED_TASK_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  if (out.length) return out;
  const byWeek = plan?.byWeek && typeof plan.byWeek === "object" ? plan.byWeek : {};
  for (const tid of Object.values(byWeek)) {
    const id = String(tid || "").trim();
    if (ALLOWED_TASK_IDS.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

function collectPrevMonthTaskIds(planMap?, weekMap?, prevMk?) {
  const set = new Set();
  const plan = planMap?.[prevMk];
  for (const tid of planPoolIds(plan)) set.add(tid);
  for (const [wk, entry] of Object.entries(weekMap || {})) {
    if (!entry?.taskId || !ALLOWED_TASK_IDS.has(entry.taskId)) continue;
    if (monthKeyForWeekKey(wk) === prevMk) set.add(entry.taskId);
  }
  return set;
}

/** Locked = task del pool già usati in altre settimane del mese (entry reali). */
function lockedTaskIdsForMonth(map?, monthKey?, currentWeekKey = "", plan = null) {
  const locked = new Set();
  const cur = String(currentWeekKey || "");
  const pool = new Set(planPoolIds(plan));
  for (const [wk, entry] of Object.entries(map || {})) {
    if (!entry?.taskId || !ALLOWED_TASK_IDS.has(entry.taskId)) continue;
    if (monthKeyForWeekKey(wk) !== monthKey) continue;
    if (wk === cur) continue;
    const st = entry.status;
    // Current-week-style open states on other weeks still consume the task id.
    if (pool.size && !pool.has(entry.taskId)) continue;
    if (
      st === STATUS.APPROVED ||
      st === STATUS.MISSED ||
      st === STATUS.SUBMITTED ||
      st === STATUS.REJECTED ||
      st === STATUS.DRAFT
    ) {
      if (entry.taskId) locked.add(entry.taskId);
    }
  }
  return [...locked];
}

function monthCompletedWeekCount(map?, monthKey?) {
  const weeks = weekKeysInRomeMonth(monthKey);
  let n = 0;
  for (const wk of weeks) {
    const st = map?.[wk]?.status;
    if (st === STATUS.APPROVED || st === STATUS.MISSED || st === STATUS.SKIPPED) n += 1;
  }
  return n;
}

function planSwapsLeft(plan?, bonus = 0) {
  const used = Math.max(0, Math.floor(Number(plan?.swapUsedCount) || 0));
  const baseLeft = Math.max(0, MONTHLY_SWAP_BASE - used);
  const bonusLeft = Math.max(0, Math.floor(Number(bonus) || 0));
  return baseLeft + bonusLeft;
}

/** Sostituto per `replaceTaskId`, dello stesso tipo: difficile → difficile, facile/medio → facile/medio
 *  (così nel pool resta sempre esattamente un difficile). `wantHard` forza il tipo. */
function pickRandomPoolReplacement(poolIds?, preferExclude = null, replaceTaskId = "", wantHard = null) {
  const pool = new Set((poolIds || []).map((x?) => String(x || "").trim()).filter(Boolean));
  const extra = preferExclude instanceof Set ? preferExclude : new Set();
  const hard = typeof wantHard === "boolean" ? wantHard : isHardTask(replaceTaskId);
  const allowed = TASKS_META.map((t?) => t.id).filter((id?) => !pool.has(id) && isHardTask(id) === hard);
  let candidates = allowed.filter((id?) => !extra.has(id));
  if (!candidates.length) candidates = allowed;
  if (!candidates.length) return "";
  return candidates[Math.floor(Math.random() * candidates.length)] || "";
}

/** Pool estratti prima della regola: porta i difficili a esattamente HARD_TASKS_PER_MONTH,
 *  cambiando solo compiti non ancora usati in una settimana del mese. */
function balanceHardTasks(poolIds?, weekMap?, monthKey?, preferExclude = null) {
  const used = new Set();
  for (const [wk, entry] of Object.entries(weekMap || {})) {
    if (entry?.taskId && monthKeyForWeekKey(wk) === monthKey) used.add(entry.taskId);
  }
  let pool = [...poolIds];
  const swap = (id?, wantHard?) => {
    const replacement = pickRandomPoolReplacement(pool, preferExclude, id, wantHard);
    if (replacement) pool = pool.map((x?) => (x === id ? replacement : x));
  };
  /* troppi: tiene prima quelli già usati, gli altri diventano facili/medi */
  let hardKept = pool.filter((id?) => isHardTask(id) && used.has(id)).length;
  for (const id of [...pool]) {
    if (!isHardTask(id) || used.has(id)) continue;
    if (hardKept < HARD_TASKS_PER_MONTH) hardKept += 1;
    else swap(id, false);
  }
  /* nessuno: l'ultimo facile/medio non ancora usato diventa difficile */
  while (countHardTasks(pool) < HARD_TASKS_PER_MONTH) {
    const free = [...pool].reverse().find((id?) => !isHardTask(id) && !used.has(id));
    if (!free) break;
    const before = pool;
    swap(free, true);
    if (pool === before) break;
  }
  /* niente cambiato → stesso array, così chi chiama non risalva */
  return pool.every((id?, i?) => id === poolIds[i]) ? poolIds : pool;
}

async function loadPlanMap(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select("profile.siteStaffCompitiPlan")
    .lean()
    .catch(() => null);
  return sanitizePlanMap(doc?.profile?.siteStaffCompitiPlan || {});
}

async function savePlanMap(guildId?, userId?, plans?) {
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: { "profile.siteStaffCompitiPlan": plans },
    },
    { upsert: true },
  ).catch(() => null);
}

async function loadSwapBonus(guildId?, userId?, monthKey = "") {
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select(
      "profile.siteStaffCompitiSwapBonus profile.siteStaffCompitiSwapBonusWeek profile.siteStaffCompitiSwapBonusMonth",
    )
    .lean()
    .catch(() => null);
  const bonus = Math.max(0, Math.floor(Number(doc?.profile?.siteStaffCompitiSwapBonus) || 0));
  const weekKey = String(doc?.profile?.siteStaffCompitiSwapBonusWeek || "").trim();
  const storedMonth = String(doc?.profile?.siteStaffCompitiSwapBonusMonth || "").trim();
  /* stafferMonthBridge1: legacy senza month → mese della weekKey (o mese compiti attivo). */
  const effectiveMonth =
    (/^\d{4}-\d{2}$/.test(storedMonth) && storedMonth) ||
    monthKeyForWeekKey(weekKey) ||
    "";
  const active = String(monthKey || compitiActiveMonthKey(weekKey) || "").trim();
  if (active && effectiveMonth && effectiveMonth !== active) {
    return { bonus: 0, weekKey, monthKey: effectiveMonth, expired: true };
  }
  return {
    bonus,
    weekKey,
    monthKey: effectiveMonth || active,
    expired: false,
  };
}

async function saveSwapBonusState(guildId?, userId?, { bonus, weekKey = "", monthKey = "" }: any = {}) {
  const set = {
    "profile.siteStaffCompitiSwapBonus": Math.max(0, Math.floor(Number(bonus) || 0)),
  };
  if (weekKey) set["profile.siteStaffCompitiSwapBonusWeek"] = String(weekKey);
  if (monthKey) set["profile.siteStaffCompitiSwapBonusMonth"] = String(monthKey);
  await ActivityUserProfile.updateOne(
    { guildId: String(guildId || ""), userId: String(userId || "") },
    {
      $setOnInsert: { guildId: String(guildId || ""), userId: String(userId || "") },
      $set: set,
    },
    { upsert: true },
  ).catch(() => null);
}

/** +1 scambio compiti Staffer della settimana: solo mese della weekKey (1× weekKey). */
async function grantCompitiSwapBonus(guildId?, userId?, amount = 1, { weekKey = "", monthKey = "" } = {}) {
  const add = Math.max(0, Math.floor(Number(amount) || 0));
  if (!add || !guildId || !userId) return { ok: false, swapBonus: 0, granted: 0 };
  const wk = String(weekKey || "").trim();
  const mk =
    String(monthKey || "").trim() ||
    monthKeyForWeekKey(wk) ||
    compitiActiveMonthKey(wk);
  const cur = await loadSwapBonus(guildId, userId, mk);
  if (wk && cur.weekKey === wk && Number(cur.bonus || 0) > 0 && !cur.expired) {
    return { ok: true, swapBonus: cur.bonus, granted: 0, skipped: true, monthKey: mk };
  }
  /* compitiSwapSchema1: se week match ma bonus 0 (strict drop storico) → ri-grant. */
  const next =
    cur.expired || !Number(cur.bonus || 0)
      ? add
      : wk && cur.weekKey === wk
        ? Math.max(Number(cur.bonus || 0), add)
        : Number(cur.bonus || 0) + add;
  await saveSwapBonusState(guildId, userId, { bonus: next, weekKey: wk || cur.weekKey, monthKey: mk });
  const granted = Math.max(0, next - Math.max(0, Number(cur.expired ? 0 : cur.bonus) || 0));
  return { ok: true, swapBonus: next, granted: granted || (next > 0 ? add : 0), monthKey: mk };
}

/** Se ha ancora il ruolo Staffer della settimana, assicura il +1 swap del week corrente. */
async function ensureStafferCompitiSwapBonus(client?, guildId?, userId?, monthKey = "") {
  try {
    const roleId = String(IDs.roles?.StafferDellaSettimana || "").trim();
    if (!roleId || !guildId || !userId) {
      return loadSwapBonus(guildId, userId, monthKey);
    }
    const guild =
      client?.guilds?.cache?.get?.(guildId) ||
      (await client?.guilds?.fetch?.(guildId).catch(() => null));
    const member =
      guild?.members?.cache?.get?.(userId) ||
      (await guild?.members?.fetch?.(userId).catch(() => null));
    if (!member?.roles?.cache?.has?.(roleId)) {
      return loadSwapBonus(guildId, userId, monthKey);
    }
    const {
      getStaffWeekKeyNow,
      resolveStafferBonusMonthKey,
    } = require("../../Staff/utils/stafferDellaSettimanaWeekKey") as typeof import("../../Staff/utils/stafferDellaSettimanaWeekKey");
    const weekKey = getStaffWeekKeyNow();
    const mk = resolveStafferBonusMonthKey({ weekKey, monthKey });
    await grantCompitiSwapBonus(guildId, userId, 1, { weekKey, monthKey: mk });
    return loadSwapBonus(guildId, userId, monthKey || mk);
  } catch (_) {
    return loadSwapBonus(guildId, userId, monthKey);
  }
}

/**
 * Nuovo staff pexato (Member→staff) nella settimana Mon–Sun Rome corrente:
 * niente miss/VN compiti fino al lunedì successivo.
 */
async function isNewStaffCompitiGrace({ guildId, userId, member = null, now = new Date() }: any = {}) {
  try {
    const {
      getCurrentResocontoPexWeekWindowUtc,
      wasFirstStaffPromotionFromMemberInWindow,
      resolveStaffRole,
    } = require("../../Staff/services/weeklyStaffResocontoService") as typeof import("../../Staff/services/weeklyStaffResocontoService");
    const { getStaffDoc } = require("../../Staff/utils/valutazionePanelActions") as typeof import("../../Staff/utils/valutazionePanelActions");
    const { ensureStaff } = require("../../Staff/utils/staffDocUtils") as typeof import("../../Staff/utils/staffDocUtils");
    const staffRoleId = member ? resolveStaffRole(member) : null;
    if (!staffRoleId) return false;
    const window = getCurrentResocontoPexWeekWindowUtc(now);
    const profileDoc = await getStaffDoc(guildId, userId);
    if (!profileDoc) return false;
    const staffDoc = ensureStaff(profileDoc);
    return wasFirstStaffPromotionFromMemberInWindow(
      staffDoc,
      staffRoleId,
      window.windowStart,
      window.windowEndExclusive,
    );
  } catch (_) {
    return false;
  }
}

async function ensureMonthPlanForUser(guildId?, userId?, { monthKey = "", weekKey = "", force = false } = {}) {
  const mk = monthKey || romeMonthKey();
  const weekKeys = weekKeysInRomeMonth(mk);
  if (!weekKeys.length) return null;

  const plans = await loadPlanMap(guildId, userId);
  const existing = plans[mk];
  const existingPool = planPoolIds(existing);
  if (existingPool.length >= weekKeys.length && !force) {
    let pool = existingPool;
    if (countHardTasks(pool) !== HARD_TASKS_PER_MONTH) {
      const weekMap = await loadMap(guildId, userId);
      pool = balanceHardTasks(pool, weekMap, mk, collectPrevMonthTaskIds(plans, weekMap, prevRomeMonthKey(mk)));
    }
    // Persist migrated taskIds if we only had byWeek (o se è cambiato il numero di difficili).
    if (
      pool !== existingPool ||
      !Array.isArray(existing.taskIds) ||
      !existing.taskIds.length ||
      Object.keys(existing.byWeek || {}).length
    ) {
      existing.taskIds = pool;
      existing.byWeek = {};
      plans[mk] = existing;
      await savePlanMap(guildId, userId, plans);
    }
    return existing;
  }

  const weekMap = await loadMap(guildId, userId);
  const exclude = collectPrevMonthTaskIds(plans, weekMap, prevRomeMonthKey(mk));
  const drawn = drawDistinctMonthTasks(exclude, weekKeys.length);
  const plan = { assignedAt: Date.now(), taskIds: drawn, byWeek: {}, swapUsedCount: 0 };
  plans[mk] = plan;
  await savePlanMap(guildId, userId, plans);
  return plan;
}

export = { MONTHLY_SWAP_BASE, sanitizePlanEntry, planPoolIds, collectPrevMonthTaskIds, lockedTaskIdsForMonth, monthCompletedWeekCount, planSwapsLeft, pickRandomPoolReplacement, loadPlanMap, savePlanMap, loadSwapBonus, saveSwapBonusState, grantCompitiSwapBonus, ensureStafferCompitiSwapBonus, isNewStaffCompitiGrace, ensureMonthPlanForUser };
