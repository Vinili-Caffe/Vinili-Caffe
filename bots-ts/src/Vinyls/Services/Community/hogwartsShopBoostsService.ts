const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getShopItemById, SHOP_CATEGORIES } = require("../../Utils/Web/hogwartsShopCatalog") as typeof import("../../Utils/Web/hogwartsShopCatalog");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { housePointPeriodKey, resolvePeriodBounds } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const MINIGAME_EXP_PER_WIN_ESTIMATE = 100;
const PET_HOUSE_POINTS_MULTIPLIER = Object.freeze({ "tabby-cat-pet": 2, "snowy-owl-pet": 3, "moon-toad-pet": 4, "mini-phoenix-pet": 5 });
const BROOM_ROB_SUCCESS_BONUS = Object.freeze({ "school-sweeper-broom": 18, "comet-copper-broom": 32, "stormchaser-broom": 50, "aurora-3000-broom": 60 });
const ROB_SUCCESS_CAP = 95;
const SHOP_DURABLE_BOOST_MAX_USES = 750;
const SHOP_BOOST_USAGE_FIELDS = Object.freeze({
  [SHOP_CATEGORIES.PET]: "minigame",
  [SHOP_CATEGORIES.WAND]: "duel",
  [SHOP_CATEGORIES.BROOM]: "rob",
});

function isHogwartsShopBoostActive(client?, nowMs = Date.now()) {
  const eventCfg = resolveHogwartsEventConfig(client);
  if (!eventCfg?.enabled) return false;
  const now = Number(nowMs || Date.now());
  const start = Number(eventCfg.sortingStartMs ?? eventCfg.startMs);
  const end = Number(eventCfg.endMs);
  return Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end;
}

function normalizeShopInventory(raw?) {
  const items = raw?.items && typeof raw.items === "object" ? raw.items : {};
  const out = { wand: null, broom: null, pet: null };
  for (const category of Object.keys(out)) {
    const row = items[category] && typeof items[category] === "object" ? items[category] : null;
    if (!row?.id) continue;
    const item = getShopItemById(row.id);
    if (!item || item.category !== category) continue;
    out[category] = { ...item, purchasedAt: row.purchasedAt || null };
  }
  return out;
}

function resolveShopBoostUsageField(category?) {
  return SHOP_BOOST_USAGE_FIELDS[String(category || "").trim()] || "";
}

function shopBoostUsageIncPath(periodKey?, field?) {
  return `profile.events.hogwarts.shopBoostUsage.byPeriod.${String(periodKey || "").trim()}.${String(field || "").trim()}`;
}

function isoWeekMondayMsFromKey(weekKey?) {
  const m = String(weekKey || "").trim().match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (!Number.isFinite(year) || !Number.isFinite(week) || week < 1) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayNr = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayNr);
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  const ms = monday.getTime();
  return Number.isFinite(ms) ? ms : null;
}

function readMinigameExpInPeriodWindow(minigameTotals?, periodStartMs?, nowMs = Date.now()) {
  const start = Number(periodStartMs);
  const now = Number(nowMs);
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return 0;
  const mg = minigameTotals && typeof minigameTotals === "object" ? minigameTotals : {};
  let sum = 0;
  for (const [key, expRaw] of [
    [String(mg.weeklyKey || ""), Number(mg.weeklyExp) || 0],
    [String(mg.prevWeekKey || ""), Number(mg.prevWeekExp) || 0],
  ]) {
    if (!key || (expRaw as any) <= 0) continue;
    const weekStart = isoWeekMondayMsFromKey(key);
    if (!Number.isFinite(weekStart)) continue;
    const weekEnd = weekStart + 7 * 24 * 60 * 60 * 1000 - 1;
    if (weekEnd < start || weekStart > now || weekStart < start) continue;
    sum += Math.max(0, Math.floor((expRaw as any)));
  }
  return sum;
}

function estimateMinigameWinsFromExp(totalExp?) {
  const exp = Math.max(0, Math.floor(Number(totalExp) || 0));
  if (exp <= 0) return 0;
  return Math.min(SHOP_DURABLE_BOOST_MAX_USES, Math.ceil(exp / MINIGAME_EXP_PER_WIN_ESTIMATE));
}

function readShopBoostUsageRow(rawUsage?, eventKey?, periodKey?, field?) {
  const storedEventKey = String(rawUsage?.eventKey || "").trim();
  const key = String(periodKey || "").trim();
  const usageField = String(field || "").trim();
  if (!storedEventKey || storedEventKey !== String(eventKey || "").trim() || !key || !usageField) {
    return { used: 0, remaining: SHOP_DURABLE_BOOST_MAX_USES, exhausted: false };
  }
  const used = Math.max(0, Math.floor(Number(rawUsage?.byPeriod?.[key]?.[usageField]) || 0));
  const remaining = Math.max(0, SHOP_DURABLE_BOOST_MAX_USES - used);
  return { used, remaining, exhausted: used >= SHOP_DURABLE_BOOST_MAX_USES };
}

function readShopBoostUsedForPeriod(rawUsage?, periodKey?, field?) {
  const key = String(periodKey || "").trim();
  const usageField = String(field || "").trim();
  if (!key || !usageField) return 0;
  return Math.max(0, Math.floor(Number(rawUsage?.byPeriod?.[key]?.[usageField]) || 0));
}

function isShopBoostAcademicPeriodRollover(lastBackfillPeriod?, periodKey?) {
  const prev = String(lastBackfillPeriod || "").trim();
  const next = String(periodKey || "").trim();
  return Boolean(prev && next && prev !== next);
}

function resolveRolloverBoostUsed(rawUsage?, periodKey?, prevPeriodKey?, field?, winsRecorded?, currentUsed?, backfillSeedWins = 0) {
  const wins = Math.max(0, Math.floor(Number(winsRecorded) || 0));
  const used = Math.max(0, Math.floor(Number(currentUsed) || 0));
  if (used <= 0) return 0;
  const prevKey = String(prevPeriodKey || "").trim();
  const seedWins = Math.max(0, Math.floor(Number(backfillSeedWins) || 0));
  if (prevKey && prevKey !== periodKey && used === readShopBoostUsedForPeriod(rawUsage, prevKey, field)) {
    return wins;
  }
  if (seedWins > 0 && used === seedWins && wins < used) {
    return wins;
  }
  return used;
}

async function resetShopBoostUsageForEvent(guildId?, userId?, eventKey?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const ek = String(eventKey || "").trim();
  if (!gid || !uid || !ek) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $set: { "profile.events.hogwarts.shopBoostUsage": { eventKey: ek, byPeriod: {} } } },
  ).catch(() => null);
}

async function ensureShopBoostMinigameBackfill(client?, guildId?, userId?) {
  if (!isHogwartsShopBoostActive(client)) return { ok: false, reason: "inactive" };
  const period = housePointPeriodKey();
  const periodKey = String(period?.key || "").trim();
  const periodStartMs = resolvePeriodBounds(period)?.startMs ?? null;
  if (!periodKey || !Number.isFinite(periodStartMs)) return { ok: false, reason: "no_period" };
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { ok: false, reason: "bad_ids" };
  const eventKey = String(resolveHogwartsEventConfig(client)?.eventKey || "hogwarts").trim();
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.events.hogwarts.shop profile.events.hogwarts.shopBoostUsage profile.totals.exp.minigame")
    .lean()
    .catch(() => null);
  const inventory = normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop);
  if (petHousePointsMultiplier(inventory[SHOP_CATEGORIES.PET]) <= 1) return { ok: false, reason: "no_pet_boost" };
  let rawUsage = doc?.profile?.events?.hogwarts?.shopBoostUsage;
  const storedEventKey = String(rawUsage?.eventKey || "").trim();
  if (storedEventKey && storedEventKey !== eventKey) {
    await resetShopBoostUsageForEvent(gid, uid, eventKey);
    rawUsage = null;
  }
  const field = resolveShopBoostUsageField(SHOP_CATEGORIES.PET);
  const currentUsed = readShopBoostUsageRow(rawUsage, eventKey, periodKey, field).used;
  const winsRecorded = Math.max(0, Math.floor(Number(rawUsage?.byPeriod?.[periodKey]?.minigameWins) || 0));
  const pet = inventory[SHOP_CATEGORIES.PET];
  const petPurchasedMs = pet?.purchasedAt ? new Date(pet.purchasedAt).getTime() : NaN;
  const expStartMs = Number.isFinite(petPurchasedMs) ? Math.max(periodStartMs, petPurchasedMs) : periodStartMs;
  const periodExp = readMinigameExpInPeriodWindow(doc?.profile?.totals?.exp?.minigame, expStartMs);
  const estimatedWins = estimateMinigameWinsFromExp(periodExp);
  const lastBackfillPeriod = String(rawUsage?.backfill?.minigamePeriodKey || "").trim();
  const periodRollover = isShopBoostAcademicPeriodRollover(lastBackfillPeriod, periodKey);
  const minigamePrevPeriod = String(rawUsage?.backfill?.minigamePrevPeriod || "").trim();
  const backfillSeedWins = estimateMinigameWinsFromExp(Number(rawUsage?.backfill?.minigameExp) || 0);
  const carriedFromPrevPeriod = (
    !periodRollover &&
    minigamePrevPeriod &&
    minigamePrevPeriod !== periodKey &&
    currentUsed > 0 &&
    (
      currentUsed === readShopBoostUsedForPeriod(rawUsage, minigamePrevPeriod, field) ||
      (backfillSeedWins > 0 && currentUsed === backfillSeedWins && winsRecorded < currentUsed)
    )
  );
  let targetUsed = currentUsed;
  if (periodRollover || carriedFromPrevPeriod) {
    targetUsed = Math.min(
      SHOP_DURABLE_BOOST_MAX_USES,
      resolveRolloverBoostUsed(
        rawUsage,
        periodKey,
        periodRollover ? lastBackfillPeriod : minigamePrevPeriod,
        field,
        winsRecorded,
        currentUsed,
        backfillSeedWins,
      ),
    );
  } else if (!lastBackfillPeriod && currentUsed === 0 && estimatedWins > 0) {
    targetUsed = Math.min(SHOP_DURABLE_BOOST_MAX_USES, Math.max(winsRecorded, estimatedWins));
  }
  const backfillMetaPatch = {
    "profile.events.hogwarts.shopBoostUsage.backfill.minigamePeriodKey": periodKey,
    "profile.events.hogwarts.shopBoostUsage.backfill.minigameAt": new Date(),
    "profile.events.hogwarts.shopBoostUsage.backfill.minigameExp": periodExp,
    "profile.events.hogwarts.shopBoostUsage.backfill.minigamePrevPeriod": lastBackfillPeriod || null,
  };
  if (targetUsed === currentUsed) {
    if (periodRollover || carriedFromPrevPeriod) {
      await ActivityUserProfile.updateOne(
        { guildId: gid, userId: uid },
        { $set: { "profile.events.hogwarts.shopBoostUsage.eventKey": eventKey, ...backfillMetaPatch } },
        { upsert: true },
      ).catch(() => null);
    }
    return { ok: true, reason: "unchanged", used: currentUsed };
  }
  const incPath = shopBoostUsageIncPath(periodKey, field);
  const patch = {
    "profile.events.hogwarts.shopBoostUsage.eventKey": eventKey,
    [incPath]: targetUsed,
    ...backfillMetaPatch,
  };
  await ActivityUserProfile.updateOne({ guildId: gid, userId: uid }, { $set: patch }, { upsert: true }).catch(() => null);
  return { ok: true, used: targetUsed, estimatedWins, winsRecorded, periodExp, periodRollover, carriedFromPrevPeriod };
}

async function recordHogwartsMinigameHousePointWin(guildId?, userId?, eventKey?) {
  const period = housePointPeriodKey();
  const periodKey = String(period?.key || "").trim();
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const ek = String(eventKey || "hogwarts").trim();
  if (!periodKey || !gid || !uid) return;
  const winsPath = `profile.events.hogwarts.shopBoostUsage.byPeriod.${periodKey}.minigameWins`;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: { "profile.events.hogwarts.shopBoostUsage.eventKey": ek },
      $inc: { [winsPath]: 1 },
    },
    { upsert: true },
  ).catch(() => null);
}

let shopBoostMinigameBackfillStarted = false;

async function syncShopBoostMinigameUsageBackfillOnStartup(client?) {
  if (shopBoostMinigameBackfillStarted) return { ok: false, reason: "already_running" };
  shopBoostMinigameBackfillStarted = true;
  const guildId = String(IDs.guilds?.main || "").trim();
  if (!guildId || !client) return { ok: false, reason: "no_guild" };
  const docs = await ActivityUserProfile.find({
    guildId,
    "profile.events.hogwarts.shop.items.pet.id": { $exists: true, $ne: "" },
  })
    .select("userId")
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const result = await ensureShopBoostMinigameBackfill(client, guildId, doc.userId).catch(() => null);
    if (result?.ok && result.reason !== "unchanged") updated += 1;
  }
  return { ok: true, profiles: docs.length, updated };
}

async function getShopDurableBoostUsage(client?, guildId?, userId?, category = null) {
  if (!category || category === SHOP_CATEGORIES.PET) {
    await ensureShopBoostMinigameBackfill(client, guildId, userId).catch(() => null);
  }
  const period = housePointPeriodKey();
  const eventKey = String(resolveHogwartsEventConfig(client)?.eventKey || "hogwarts").trim();
  const periodKey = String(period?.key || "").trim();
  const periodLabel = String(period?.label || "").trim();
  const doc = await ActivityUserProfile.findOne({
    guildId: String(guildId || ""),
    userId: String(userId || ""),
  })
    .select("profile.events.hogwarts.shopBoostUsage")
    .lean()
    .catch(() => null);
  const rawUsage = doc?.profile?.events?.hogwarts?.shopBoostUsage;
  const buildCategory = (cat?) => {
    const field = resolveShopBoostUsageField(cat);
    const row = readShopBoostUsageRow(rawUsage, eventKey, periodKey, field);
    return { ...row, max: SHOP_DURABLE_BOOST_MAX_USES, field };
  };
  if (category) return { ...buildCategory(category), periodKey, periodLabel, eventKey, maxUses: SHOP_DURABLE_BOOST_MAX_USES };
  return {
    eventKey,
    periodKey,
    periodLabel,
    maxUses: SHOP_DURABLE_BOOST_MAX_USES,
    categories: {
      pet: buildCategory(SHOP_CATEGORIES.PET),
      wand: buildCategory(SHOP_CATEGORIES.WAND),
      broom: buildCategory(SHOP_CATEGORIES.BROOM),
    },
  };
}

async function tryConsumeShopDurableBoostUse(client?, guildId?, userId?, category?) {
  if (!isHogwartsShopBoostActive(client)) {
    return { ok: false, reason: "inactive", used: 0, remaining: 0, exhausted: false };
  }
  const field = resolveShopBoostUsageField(category);
  if (!field) return { ok: false, reason: "bad_category", used: 0, remaining: 0, exhausted: false };
  const period = housePointPeriodKey();
  const periodKey = String(period?.key || "").trim();
  if (!periodKey) {
    return { ok: false, reason: "no_period", used: 0, remaining: 0, exhausted: true, periodKey: "", periodLabel: "" };
  }
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const eventKey = String(resolveHogwartsEventConfig(client)?.eventKey || "hogwarts").trim();
  const incPath = shopBoostUsageIncPath(periodKey, field);
  const existing = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select("profile.events.hogwarts.shopBoostUsage")
    .lean()
    .catch(() => null);
  const storedEventKey = String(existing?.profile?.events?.hogwarts?.shopBoostUsage?.eventKey || "").trim();
  if (storedEventKey && storedEventKey !== eventKey) {
    await resetShopBoostUsageForEvent(gid, uid, eventKey);
  }
  const doc = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: gid,
      userId: uid,
      $or: [
        { [incPath]: { $exists: false } },
        { [incPath]: { $lt: SHOP_DURABLE_BOOST_MAX_USES } },
      ],
    },
    {
      $set: { "profile.events.hogwarts.shopBoostUsage.eventKey": eventKey },
      $inc: { [incPath]: 1 },
    },
    { new: true },
  ).catch(() => null);
  if (!doc) {
    const used = readShopBoostUsageRow(existing?.profile?.events?.hogwarts?.shopBoostUsage, eventKey, periodKey, field).used;
    return {
      ok: false,
      exhausted: true,
      used,
      remaining: 0,
      periodKey,
      periodLabel: period?.label || "",
      maxUses: SHOP_DURABLE_BOOST_MAX_USES,
    };
  }
  const used = Math.max(0, Math.floor(Number(doc?.profile?.events?.hogwarts?.shopBoostUsage?.byPeriod?.[periodKey]?.[field]) || 0));
  return {
    ok: true,
    exhausted: false,
    used,
    remaining: Math.max(0, SHOP_DURABLE_BOOST_MAX_USES - used),
    periodKey,
    periodLabel: period?.label || "",
    maxUses: SHOP_DURABLE_BOOST_MAX_USES,
  };
}

async function loadShopInventory(guildId?, userId?) {
  const doc = await ActivityUserProfile.findOne({
    guildId: String(guildId || ""),
    userId: String(userId || ""),
  })
    .select("profile.events.hogwarts.shop")
    .lean()
    .catch(() => null);
  return normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop);
}

async function assertRobberHasBroom(client?, guildId?, userId?) {
  const inventory = await loadShopInventory(guildId, userId);
  if (!inventory.broom?.id) {
    return {
      ok: false,
      code: "no_broom",
      message: "Acquista una **scopa** nello shop dell'evento Hogwarts prima di usare `+rob`.",
    };
  }
  return { ok: true, broom: inventory.broom };
}

function petHousePointsMultiplier(petItem?) {
  const id = String(petItem?.id || "").trim();
  if (!id) return 1;
  return PET_HOUSE_POINTS_MULTIPLIER[id] ?? 1;
}

function broomRobSuccessBonus(broomItem?) {
  const id = String(broomItem?.id || "").trim();
  if (!id) return 0;
  return BROOM_ROB_SUCCESS_BONUS[id] ?? 0;
}

function scaleRobFailPenalty(basePenalty?, chance?) {
  const penalty = Math.max(0, Math.floor(Number(basePenalty) || 0));
  if (penalty <= 0) return 0;
  const c = Math.max(1, Math.min(99, Math.floor(Number(chance) || 35)));
  const factor = Math.max(0.12, Math.min(1, (100 - c) / 65));
  return Math.max(5, Math.floor(penalty * factor));
}

async function applyPetHousePointsBoost(client?, guildId?, userId?, basePoints?) {
  const base = Math.max(0, Math.floor(Number(basePoints) || 0));
  if (base <= 0 || !isHogwartsShopBoostActive(client)) {
    return { points: base, multiplier: 1, petName: "", consumableMultiplier: 1, consumableLabels: [], boostUsesRemaining: null, boostExhausted: false };
  }
  const inventory = await loadShopInventory(guildId, userId);
  const pet = inventory[SHOP_CATEGORIES.PET];
  const petMultBase = petHousePointsMultiplier(pet);
  let petMult = petMultBase;
  let boostUsesRemaining = null;
  let boostExhausted = false;
  if (petMult > 1) {
    await ensureShopBoostMinigameBackfill(client, guildId, userId).catch(() => null);
    const consume = await tryConsumeShopDurableBoostUse(client, guildId, userId, SHOP_CATEGORIES.PET);
    boostUsesRemaining = consume.remaining;
    boostExhausted = Boolean(consume.exhausted);
    if (!consume.ok) petMult = 1;
  }
  const afterPet = petMult <= 1 ? base : Math.max(0, Math.floor(base * petMult));
  const { resolveHousePointsConsumableMultiplier } = require("./hogwartsConsumableBoostsService") as typeof import("./hogwartsConsumableBoostsService");
  const { resolveSortedHouseForUser } = require("./galeoniEconomyService") as typeof import("./galeoniEconomyService");
  const houseId = await resolveSortedHouseForUser(guildId, userId, client).catch(() => "");
  const consumable = await resolveHousePointsConsumableMultiplier(client, guildId, userId, houseId);
  const consumableMult = Math.max(1, Number(consumable?.multiplier) || 1);
  const points = consumableMult <= 1 ? afterPet : Math.max(0, Math.floor(afterPet * consumableMult));
  return {
    points,
    multiplier: (petMult > 1 ? petMult : 1) * consumableMult,
    petName: petMult > 1 ? pet?.name || "" : "",
    consumableMultiplier: consumableMult > 1 ? consumableMult : 1,
    consumableLabels: Array.isArray(consumable?.labels) ? consumable.labels : [],
    boostUsesRemaining,
    boostExhausted,
  };
}

async function peekRobSuccessChance(client?, guildId?, userId?, baseChance?) {
  const base = Math.max(1, Math.min(ROB_SUCCESS_CAP, Math.floor(Number(baseChance) || 35)));
  if (!isHogwartsShopBoostActive(client)) {
    return { chance: base, bonus: 0, broomName: "", boostUsesRemaining: null, boostExhausted: false };
  }
  const inventory = await loadShopInventory(guildId, userId);
  const broom = inventory[SHOP_CATEGORIES.BROOM];
  let bonus = broomRobSuccessBonus(broom);
  let boostUsesRemaining = null;
  let boostExhausted = false;
  if (bonus > 0) {
    const usage: any = await getShopDurableBoostUsage(client, guildId, userId, SHOP_CATEGORIES.BROOM);
    boostUsesRemaining = Number.isFinite(Number(usage?.remaining)) ? Number(usage.remaining) : null;
    boostExhausted = Boolean(usage?.exhausted);
    if (boostExhausted) bonus = 0;
  }
  if (bonus <= 0) {
    return { chance: base, bonus: 0, broomName: broom?.name || "", boostUsesRemaining, boostExhausted };
  }
  return {
    chance: Math.min(ROB_SUCCESS_CAP, base + bonus),
    bonus,
    broomName: broom?.name || "",
    boostUsesRemaining,
    boostExhausted,
  };
}

async function resolveRobSuccessChance(client?, guildId?, userId?, baseChance?) {
  const peeked = await peekRobSuccessChance(client, guildId, userId, baseChance);
  if (peeked.bonus <= 0) {
    return {
      chance: peeked.chance,
      bonus: 0,
      broomName: peeked.broomName || "",
      boostUsesRemaining: peeked.boostUsesRemaining,
      boostExhausted: peeked.boostExhausted,
    };
  }
  const consume = await tryConsumeShopDurableBoostUse(client, guildId, userId, SHOP_CATEGORIES.BROOM);
  const boostUsesRemaining = consume.remaining;
  const boostExhausted = Boolean(consume.exhausted);
  if (!consume.ok) {
    const base = Math.max(1, Math.min(ROB_SUCCESS_CAP, Math.floor(Number(baseChance) || 35)));
    return { chance: base, bonus: 0, broomName: "", boostUsesRemaining, boostExhausted };
  }
  return {
    chance: peeked.chance,
    bonus: peeked.bonus,
    broomName: peeked.broomName || "",
    boostUsesRemaining,
    boostExhausted,
  };
}

async function resolveDuelWandBoost(client?, guildId?, userId?, wandItem?) {
  const wandId = String(wandItem?.id || "").trim();
  if (!wandId || !isHogwartsShopBoostActive(client)) {
    return { useWandBoost: false, boostUsesRemaining: null, boostExhausted: false };
  }
  const consume = await tryConsumeShopDurableBoostUse(client, guildId, userId, SHOP_CATEGORIES.WAND);
  return {
    useWandBoost: Boolean(consume.ok),
    boostUsesRemaining: consume.remaining,
    boostExhausted: Boolean(consume.exhausted),
    periodLabel: consume.periodLabel || "",
  };
}

export = {
  BROOM_ROB_SUCCESS_BONUS,
  PET_HOUSE_POINTS_MULTIPLIER,
  ROB_SUCCESS_CAP,
  SHOP_DURABLE_BOOST_MAX_USES,
  SHOP_BOOST_USAGE_FIELDS,
  applyPetHousePointsBoost,
  assertRobberHasBroom,
  broomRobSuccessBonus,
  ensureShopBoostMinigameBackfill,
  getShopDurableBoostUsage,
  isHogwartsShopBoostActive,
  loadShopInventory,
  normalizeShopInventory,
  peekRobSuccessChance,
  petHousePointsMultiplier,
  recordHogwartsMinigameHousePointWin,
  resolveDuelWandBoost,
  resolveRobSuccessChance,
  scaleRobFailPenalty,
  syncShopBoostMinigameUsageBackfillOnStartup,
  tryConsumeShopDurableBoostUse,
  isShopBoostAcademicPeriodRollover,
  resolveRolloverBoostUsed,
  readShopBoostUsedForPeriod,
};
