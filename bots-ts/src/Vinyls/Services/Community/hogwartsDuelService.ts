const { randomInt } = require("crypto") as typeof import("crypto");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { getShopItemById } = require("../../Utils/Web/hogwartsShopCatalog") as typeof import("../../Utils/Web/hogwartsShopCatalog");
const { applyPetHousePointsBoost, isHogwartsShopBoostActive, normalizeShopInventory, resolveDuelWandBoost } = require("./hogwartsShopBoostsService") as typeof import("./hogwartsShopBoostsService");
const { addGaleoni, formatGaleoni } = require("./gringottService") as typeof import("./gringottService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { isUserHighStaffExcludedFromHogwartsEvent } = require("../../Utils/Web/hogwartsEventParticipation") as typeof import("../../Utils/Web/hogwartsEventParticipation");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { housePointPeriodKey } = require("../../Utils/Web/hogwartsHousePointPeriods") as typeof import("../../Utils/Web/hogwartsHousePointPeriods");
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const DUEL_PROFILE_PATH = "profile.events.hogwarts.duel";
const DUEL_COOLDOWN_UNTIL_PATH = `${DUEL_PROFILE_PATH}.cooldownUntil`;
const DEFAULT_DUEL_REWARDS = Object.freeze({ cooldownMs: 30 * 60 * 1000, vsBot: { galeoni: 10, housePoints: 15 }, vsUser: { galeoni: 10, housePoints: 15 } });
const WAND_WIN_CHANCE = Object.freeze({ "willow-spark-wand": 58, "ash-moon-wand": 72, "elder-ember-wand": 86, "phoenix-legacy-wand": 100});
const HOUSE_BONUS = Object.freeze({"gryffindor": 5, "ravenclaw": 4, "hufflepuff": 4, "slytherin": 5});
const VOLDEMORT = Object.freeze({"userId": "voldemort", "displayName": "Voldemort", "houseId": "slytherin", "wand": getShopItemById("elder-ember-wand"), "power": 94, "winChance": 94, "isBot": true});
const BOT_ALIASES = new Set(["voldemort", "bot", "lord", "oscuro", "voldy", "hewhomustnotbenamed"]);

async function findExistingSort(guildId?, userId?, eventKey?) {
  return SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    dedupeKey: String(eventKey || ""),
  })
    .lean()
    .catch(() => null);
}

function computeWandWinChance(wandId?) {
  const id = String(wandId || "").trim();
  if (!id) return 42;
  return WAND_WIN_CHANCE[id] ?? 42;
}

function computeHouseBonus(houseId?) {
  const h = String(houseId || "").trim();
  return HOUSE_BONUS[h] ?? 0;
}

function readVsBotWinBounds(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const min = readPositiveInt(src.minPlayerWinChance, 20, 8, 50);
  const max = readPositiveInt(src.maxPlayerWinChance, 65, min, 85);
  return { min, max };
}

function computeVsBotWinChance(playerWinChance?, vsBotCfg: Record<string, any> = {}) {
  const { min, max } = readVsBotWinBounds(vsBotCfg);
  const shop = Math.max(1, Math.min(100, Math.floor(Number(playerWinChance) || 42)));
  const shopMin = 42;
  const shopMax = 100;
  const t = Math.max(0, Math.min(1, (shop - shopMin) / Math.max(1, shopMax - shopMin)));
    const curved = Math.pow(t, 0.82);
  return Math.round(min + curved * (max - min));
}

function buildFighterFromProfile({ userId, displayName, username, houseId, wand, wandBoostPenalty = 0 }) {
  const wandId = String(wand?.id || "").trim();
  const base = computeWandWinChance(wandId);
  const bonus = computeHouseBonus(houseId);
  const penalty = Math.max(0, Math.floor(Number(wandBoostPenalty) || 0));
  const winChance = Math.max(1, Math.min(100, base + bonus - penalty));
  const meta = getHouseMeta(houseId);
  const uname = String(username || displayName || "Mago").trim() || "Mago";
  return {
    userId: String(userId || ""),
    displayName: String(displayName || uname).trim() || uname,
    username: uname,
    houseId: String(houseId || "").trim(),
    houseLabel: meta?.label || houseId || "—",
    housePrimary: meta?.primary || "#1a472a",
    houseAccent: meta?.accent || "#c9a227",
    wand: wand ? { ...wand } : null,
    wandName: wand?.name || "Bacchetta prestata",
    wandAccent: wand?.accent || "#c9a227",
    winChance,
    power: winChance,
    isBot: false,
  };
}

async function loadDuelFighter(client?, guildId?, userId?, displayName?, username = "") {
  const cfg = resolveHogwartsEventConfig(client);
  const sorting = await findExistingSort(guildId, userId, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  if (!houseId) {
    return { ok: false, code: "not_sorted", message: "Completa lo **smistamento** sull'evento Hogwarts prima di duellare." };
  }
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId || ""), userId: String(userId || "") })
    .select("profile.events.hogwarts.shop")
    .lean()
    .catch(() => null);
  const inventory = normalizeShopInventory(doc?.profile?.events?.hogwarts?.shop);
  if (!inventory.wand?.id) {
    return {
      ok: false,
      code: "no_wand",
      message: "Acquista una **bacchetta** nello shop dell'evento Hogwarts prima di duellare.",
    };
  }
  const wandBoost = await resolveDuelWandBoost(client, guildId, userId, inventory.wand);
  const fighter = buildFighterFromProfile({
    userId,
    displayName,
    username: username || displayName,
    houseId,
    wand: inventory.wand,
        wandBoostPenalty: wandBoost.boostExhausted ? 8 : 0,
  });
  if (wandBoost.boostExhausted) fighter.wandBoostExhausted = true;
  if (Number.isFinite(wandBoost.boostUsesRemaining)) fighter.wandBoostUsesRemaining = wandBoost.boostUsesRemaining;
  return {
    ok: true,
    fighter,
  };
}

function getVoldemortFighter() {
  const meta = getHouseMeta(VOLDEMORT.houseId);
  return {
    ...VOLDEMORT,
    username: "Voldemort",
    houseLabel: meta?.label || "Serpeverde",
    housePrimary: meta?.primary || "#1A472A",
    houseAccent: meta?.accent || "#AAAAAA",
    wandName: VOLDEMORT.wand?.name || "Bacchetta oscura",
    wandAccent: VOLDEMORT.wand?.accent || "#8b0000",
  };
}

function isBotDuelToken(raw?) {
  const t = String(raw || "").trim().toLowerCase();
  return BOT_ALIASES.has(t);
}

function resolveDuelOutcome(left?, right?, seed = "") {
  const lPow = Math.max(1, Math.min(100, Math.floor(Number(left?.power) || 1)));
  const rPow = Math.max(1, Math.min(100, Math.floor(Number(right?.power) || 1)));
  const seedText = String(seed || "");
  const jitter = (seedText.length ? hashSeed(seedText) % 17 : randomInt(0, 17)) - 8;
  let leftRoll = randomInt(1, 36) + lPow + (jitter > 0 ? 1 : 0);
  let rightRoll = randomInt(1, 36) + rPow;
  let winnerId = "";
  if (leftRoll === rightRoll) {
    const totalPow = lPow + rPow;
    const tieBreak = seedText.length
      ? (hashSeed(`${seedText}:tie:${leftRoll}`) % totalPow)
      : randomInt(0, totalPow);
    const leftWinsTie = tieBreak < lPow;
    winnerId = leftWinsTie ? String(left.userId || "") : String(right.userId || "");
        if (leftWinsTie) leftRoll += 1;
    else rightRoll += 1;
  } else if (leftRoll > rightRoll) {
    winnerId = String(left.userId || "");
  } else {
    winnerId = String(right.userId || "");
  }
  const spellLine = pickSpellLine(left, right, winnerId, false);
  return {
    winnerId,
    loserId: winnerId === String(left.userId) ? String(right.userId) : String(left.userId),
    draw: false,
    leftRoll,
    rightRoll,
    leftPower: lPow,
    rightPower: rPow,
    spellLine,
    winnerSide: winnerId === String(left.userId) ? "left" : "right",
  };
}

function resolveBotDuelOutcome(left?, right?, seed = "", vsBotCfg: Record<string, any> = {}) {
  const winPct = computeVsBotWinChance(left?.winChance, vsBotCfg);
  const roll = randomInt(1, 100);
  const jitter = String(seed || "").length ? (hashSeed(seed) % 5) - 2 : randomInt(-2, 2);
  const threshold = Math.max(8, Math.min(92, winPct + jitter));
  const playerWins = roll <= threshold;
  const winnerId = playerWins ? String(left.userId || "") : String(right.userId || "");
  const spellLine = pickSpellLine(left, right, winnerId, false);
  return {
    winnerId,
    loserId: playerWins ? String(right.userId || "") : String(left.userId || ""),
    draw: false,
    leftRoll: roll,
    rightRoll: threshold,
        leftPower: winPct,
    rightPower: Math.max(1, Math.min(99, 100 - winPct)),
    spellLine,
    winnerSide: playerWins ? "left" : "right",
    vsBotWinChance: winPct,
  };
}

function hashSeed(source?) {
  let h = 2166136261;
  const text = String(source || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickFrom(arr?, seed?) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  return a[seed % a.length];
}

function duelPublicName(fighter?) {
  return String(fighter?.username || "Mago").trim() || "Mago";
}

function pickSpellLine(left?, right?, winnerId?, draw?) {
  const h = hashSeed(`${left.userId}:${right.userId}:${winnerId}:${draw}`);
  if (draw) {
    return pickFrom(
      [
        "Le bacchette vibrano in parità: nessuno cede terreno.",
        "Incantesimi speculari: il duello si conclude senza vincitori.",
        "Un lampo verde e uno rosso si annullano nel fumo.",
      ],
      h,
    );
  }
  const winnerName = winnerId === String(left.userId) ? duelPublicName(left) : duelPublicName(right);
  const loserName = winnerId === String(left.userId) ? duelPublicName(right) : duelPublicName(left);
  return pickFrom(
    [
      `${winnerName} incanta con precisione letale.`,
      `Un Expelliarmus decisivo vola verso ${loserName}.`,
      `La bacchetta di ${winnerName} traccia una scia dorata: colpo perfetto.`,
      `${winnerName} schiva e risponde con uno Stupeficium fulminante.`,
    ],
    h,
  );
}

function formatFighterStatsLine(fighter?, opts: Record<string, any> = {}) {
  const wand = fighter.wandName || "Nessuna bacchetta acquistata";
  if (opts?.vsBot && !fighter?.isBot) {
    const vs = computeVsBotWinChance(fighter.winChance, opts.vsBotCfg);
    return `🏠 ${fighter.houseLabel} · 🪄 ${wand} · ⚡ **~${vs}%** chance vs Voldemort`;
  }
  return `🏠 ${fighter.houseLabel} · 🪄 ${wand} · ⚡ **${fighter.winChance}%** potenza duello`;
}

function readPositiveInt(value?, fallback?, min = 0, max = 100000) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolveDuelRewards(client?) {
  const event = client?.config?.hogwartsEvent && typeof client.config.hogwartsEvent === "object" ? client.config.hogwartsEvent : {};
  const raw = event.duel && typeof event.duel === "object" ? event.duel : {};
  const vsBot = raw.vsBot && typeof raw.vsBot === "object" ? raw.vsBot : {};
  const vsUser = raw.vsUser && typeof raw.vsUser === "object" ? raw.vsUser : {};
  return {
    cooldownMs: readPositiveInt(raw.cooldownMs, DEFAULT_DUEL_REWARDS.cooldownMs, 0, 24 * 60 * 60 * 1000),
    vsBot: {
      galeoni: readPositiveInt(vsBot.galeoni, DEFAULT_DUEL_REWARDS.vsBot.galeoni, 0, 500),
      housePoints: readPositiveInt(vsBot.housePoints, DEFAULT_DUEL_REWARDS.vsBot.housePoints, 0, 500),
      ...readVsBotWinBounds(vsBot),
    },
    vsUser: {
      galeoni: readPositiveInt(vsUser.galeoni, DEFAULT_DUEL_REWARDS.vsUser.galeoni, 0, 500),
      housePoints: readPositiveInt(vsUser.housePoints, DEFAULT_DUEL_REWARDS.vsUser.housePoints, 0, 500),
    },
  };
}

function formatDuelCooldownDuration(ms?) {
  const total = Math.ceil(Math.max(0, Number(ms) || 0) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

function duelCooldownDenyMessage(remainingMs?, { untilMs = 0, forOther = false, otherLabel = "Quell'utente" } = {}) {
  const leftMs = Math.max(0, Math.floor(Number(remainingMs) || 0));
  const endMs = Math.max(Date.now() + 1000, Math.floor(Number(untilMs) || 0) || (Date.now() + Math.max(leftMs, 1000)));
  const live = `<t:${Math.floor(endMs / 1000)}:R>`;
  const exact = formatDuelCooldownDuration(Math.max(leftMs, endMs - Date.now()));
  if (forOther) {
    return `<a:VC_pixeltime:1482535344103620771> ${otherLabel} è in cooldown duello · disponibile ${live} (**${exact}**).`;
  }
  return `<a:VC_pixeltime:1482535344103620771> Puoi rifare un duello ${live} (**${exact}**).`;
}

function duelCooldownRemainingMs(until?) {
  if (!until) return 0;
  const t = until instanceof Date ? until.getTime() : new Date(until).getTime();
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, t - Date.now());
}

function readDuelCooldownUntilMs(doc?) {
  const raw = doc?.profile?.events?.hogwarts?.duel?.cooldownUntil;
  if (!raw) return 0;
  const t = raw instanceof Date ? raw.getTime() : new Date(raw).getTime();
  return Number.isFinite(t) && t > 0 ? t : 0;
}

async function peekDuelCooldown(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return { ok: true, remainingMs: 0, untilMs: 0 };
  const cfg = resolveDuelRewards(client);
  if (cfg.cooldownMs <= 0) return { ok: true, remainingMs: 0, untilMs: 0 };
  const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select(DUEL_COOLDOWN_UNTIL_PATH)
    .lean()
    .catch(() => null);
  const untilMs = readDuelCooldownUntilMs(doc);
  const left = Math.max(0, untilMs - Date.now());
  if (left > 0) {
    return {
      ok: false,
      code: "cooldown",
      remainingMs: left,
      untilMs,
      message: duelCooldownDenyMessage(left, { untilMs }),
    };
  }
  return { ok: true, remainingMs: 0, untilMs: 0 };
}

async function reserveDuelCooldown(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return { ok: false, message: "Utente non valido." };
  const cfg = resolveDuelRewards(client);
  if (cfg.cooldownMs <= 0) return { ok: true, until: null };
  const now = new Date();
  const until = new Date(now.getTime() + cfg.cooldownMs);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: gid,
      userId: uid,
      $or: [
        { [DUEL_COOLDOWN_UNTIL_PATH]: { $exists: false } },
        { [DUEL_COOLDOWN_UNTIL_PATH]: { $lte: now } },
        { [DUEL_COOLDOWN_UNTIL_PATH]: null },
      ],
    },
    {
      $setOnInsert: { guildId: gid, userId: uid },
      $set: { [DUEL_COOLDOWN_UNTIL_PATH]: until },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  if (doc) {
    const savedUntil = readDuelCooldownUntilMs(doc) || until.getTime();
    return { ok: true, until: new Date(savedUntil) };
  }

  const live = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
    .select(DUEL_COOLDOWN_UNTIL_PATH)
    .lean()
    .catch(() => null);
  const untilMs = readDuelCooldownUntilMs(live);
  const left = Math.max(0, untilMs - Date.now());
  if (left <= 0) {
        const retry = await ActivityUserProfile.findOneAndUpdate(
      { guildId: gid, userId: uid },
      { $set: { [DUEL_COOLDOWN_UNTIL_PATH]: until } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    if (retry) return { ok: true, until };
    return {
      ok: false,
      code: "cooldown",
      remainingMs: cfg.cooldownMs,
      untilMs: until.getTime(),
      message: duelCooldownDenyMessage(cfg.cooldownMs, { untilMs: until.getTime() }),
    };
  }
  return {
    ok: false,
    code: "cooldown",
    remainingMs: left,
    untilMs,
    message: duelCooldownDenyMessage(left, { untilMs }),
  };
}

async function clearDuelCooldown(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return { ok: false };
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    { $unset: { [DUEL_COOLDOWN_UNTIL_PATH]: "" } },
  ).catch(() => null);
  return { ok: true };
}

function normalizeHouseId(value?) {
  const h = String(value || "").trim().toLowerCase();
  return HOUSES.includes(h) ? h : "";
}

async function awardDuelHousePoints(client?, guildId?, userId?, basePoints?, gameKey?) {
  const petBoost = await applyPetHousePointsBoost(client, guildId, userId, basePoints);
  const points = petBoost.points;
  if (points <= 0) return null;
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!isValidGuildUserId(gid, uid)) return null;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim() || "hogwarts";
  const sorting = await findExistingSort(gid, uid, eventKey);
  const houseId = normalizeHouseId(sorting?.status);
  if (!houseId) return null;
  const now = new Date();
  const periodKey = String(housePointPeriodKey(now.getTime())?.key || "").trim();
  const gk = String(gameKey || "hogwartsDuel").trim();
  const inc = {
    [`rawWebhook.byGame.${gk}`]: points,
    "rawWebhook.total": points,
    [`rawWebhook.totals.${houseId}`]: points,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = points;
  const { appendMemberHousePointsInc } = require("./hogwartsMemberHousePointsService") as typeof import("./hogwartsMemberHousePointsService");
  const memberSet: Record<string, any> = {};
  appendMemberHousePointsInc(inc, memberSet, { userId: uid, houseId, periodKey, points });
  await SiteDocument.findOneAndUpdate(
    {
      docType: HOUSE_POINTS_DOC,
      guildId: gid,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: HOUSE_POINTS_DOC,
        guildId: gid,
        userId: HOUSE_POINTS_OWNER_ID,
        dedupeKey: eventKey,
        createdBy: "hogwarts_duel",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
        ...memberSet,
      },
      $inc: inc,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return {
    houseId,
    points,
    petMultiplier: petBoost.multiplier > 1 ? petBoost.multiplier : 0,
    petName: petBoost.petName || "",
  };
}

function formatDuelRewardLine(rewards?) {
  if (!rewards?.awarded) return "";
  const parts = [];
  if (rewards.galeoni > 0) parts.push(`**+${formatGaleoni(rewards.galeoni)}**`);
  if (rewards.housePoints > 0) {
    const pet = rewards.petMultiplier > 1 ? ` (×${rewards.petMultiplier} animale)` : "";
    parts.push(`**+${rewards.housePoints}** punti ${rewards.houseLabel || "casa"}${pet}`);
  }
  if (!parts.length) return "";
  return `🎁 Ricompensa: ${parts.join(" · ")}`;
}

async function settleDuelVictoryRewards(client, { guildId, winnerId, vsBot = false, dedupeKey = "" }) {
  const gid = String(guildId || "").trim();
  const uid = String(winnerId || "").trim();
  if (!isValidGuildUserId(gid, uid) || String(uid) === VOLDEMORT.userId) return null;
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
  const member = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, member)) {
    return {
      awarded: false,
      galeoni: 0,
      housePoints: 0,
      houseLabel: "",
      petMultiplier: 0,
      cooldownMs: 0,
      message: "",
    };
  }
  if (!isHogwartsShopBoostActive(client)) {
    return { awarded: false, galeoni: 0, housePoints: 0, houseLabel: "", petMultiplier: 0, cooldownMs: 0, message: "" };
  }
  const rewardsCfg = resolveDuelRewards(client);
  const tier = vsBot ? rewardsCfg.vsBot : rewardsCfg.vsUser;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = String(eventCfg?.eventKey || "").trim() || "hogwarts";
  const nowMs = Date.now();
  if (rewardsCfg.cooldownMs > 0) {
    const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select(`${DUEL_PROFILE_PATH}.lastRewardAt`)
      .lean()
      .catch(() => null);
    const last = doc?.profile?.events?.hogwarts?.duel?.lastRewardAt
      ? new Date(doc.profile.events.hogwarts.duel.lastRewardAt).getTime()
      : 0;
    if (Number.isFinite(last) && last > 0 && nowMs - last < rewardsCfg.cooldownMs) {
      const left = rewardsCfg.cooldownMs - (nowMs - last);
      const min = Math.max(1, Math.ceil(left / 60000));
      return {
        awarded: false,
        galeoni: 0,
        housePoints: 0,
        houseLabel: "",
        petMultiplier: 0,
        cooldownMs: left,
        message: `<a:VC_pixeltime:1482535344103620771> Vittoria registrata, ma la prossima ricompensa duello è tra **~${min} min**.`,
      };
    }
  }
  const gameKey = vsBot ? "hogwartsDuelBot" : "hogwartsDuelPvp";
  let galeoniPaid = 0;
  let housePoints = 0;
  let houseLabel = "";
  let petMultiplier = 0;
  if (tier.galeoni > 0) {
    const key = dedupeKey ? `duel_galeoni:${dedupeKey}` : "";
    const paid = await addGaleoni({
      guildId: gid,
      userId: uid,
      amount: tier.galeoni,
      reason: vsBot ? "Duello vinto vs Voldemort" : "Duello vinto vs mago",
      actorId: uid,
      source: "hogwarts_duel",
      eventKey,
      rewardKey: key,
    });
    if (paid?.ok) galeoniPaid = tier.galeoni;
  }
  if (tier.housePoints > 0) {
    const houseAward = await awardDuelHousePoints(client, gid, uid, tier.housePoints, gameKey);
    if (houseAward?.points) {
      housePoints = houseAward.points;
      houseLabel = getHouseMeta(houseAward.houseId)?.label || houseAward.houseId;
      petMultiplier = houseAward.petMultiplier || 0;
    }
  }
  if (galeoniPaid > 0 || housePoints > 0) {
    await ActivityUserProfile.updateOne(
      { guildId: gid, userId: uid },
      { $set: { [`${DUEL_PROFILE_PATH}.lastRewardAt`]: new Date(nowMs), [`${DUEL_PROFILE_PATH}.eventKey`]: eventKey } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch(() => null);
  }
  const awarded = galeoniPaid > 0 || housePoints > 0;
  return {
    awarded,
    galeoni: galeoniPaid,
    housePoints,
    houseLabel,
    petMultiplier,
    cooldownMs: 0,
    message: awarded ? formatDuelRewardLine({ awarded: true, galeoni: galeoniPaid, housePoints, houseLabel, petMultiplier }) : "",
  };
}

export = {
  BOT_ALIASES,
  VOLDEMORT,
  buildFighterFromProfile,
  clearDuelCooldown,
  computeHouseBonus,
  computeVsBotWinChance,
  computeWandWinChance,
  formatDuelRewardLine,
  formatFighterStatsLine,
  getVoldemortFighter,
  isBotDuelToken,
  loadDuelFighter,
  peekDuelCooldown,
  reserveDuelCooldown,
  duelCooldownDenyMessage,
  formatDuelCooldownDuration,
  resolveBotDuelOutcome,
  resolveDuelOutcome,
  resolveDuelRewards,
  settleDuelVictoryRewards,
};