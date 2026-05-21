const { randomInt } = require("crypto");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { getHouseMeta, HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { getShopItemById } = require("../../Utils/Web/hogwartsShopCatalog");
const { applyPetHousePointsBoost, isHogwartsShopBoostActive, normalizeShopInventory } = require("./hogwartsShopBoostsService");
const { addGaleoni, formatGaleoni } = require("./gringottService");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const DUEL_PROFILE_PATH = "profile.events.hogwarts.duel";
const DEFAULT_DUEL_REWARDS = Object.freeze({ cooldownMs: 3 * 60 * 1000, vsBot: { galeoni: 10, housePoints: 15 }, vsUser: { galeoni: 10, housePoints: 15 } });
const HOUSE_POINT_PERIODS = [
  { key: "2026-06-01_2026-06-14", start: "2026-06-01", end: "2026-06-14" },
  { key: "2026-06-15_2026-06-28", start: "2026-06-15", end: "2026-06-28" },
  { key: "2026-06-29_2026-07-12", start: "2026-06-29", end: "2026-07-12" },
  { key: "2026-07-13_2026-07-26", start: "2026-07-13", end: "2026-07-26" },
  { key: "2026-07-27_2026-08-09", start: "2026-07-27", end: "2026-08-09" },
  { key: "2026-08-10_2026-08-31", start: "2026-08-10", end: "2026-08-31" },
];
const WAND_WIN_CHANCE = Object.freeze({ "willow-spark-wand": 58, "ash-moon-wand": 72, "elder-ember-wand": 86, "phoenix-legacy-wand": 100});
const HOUSE_BONUS = Object.freeze({"gryffindor": 5, "ravenclaw": 4, "hufflepuff": 4, "slytherin": 5});
const VOLDEMORT = Object.freeze({"userId": "voldemort", "displayName": "Voldemort", "houseId": "slytherin", "wand": getShopItemById("elder-ember-wand"), "power": 94, "winChance": 94, "isBot": true});
const BOT_ALIASES = new Set(["voldemort", "bot", "lord", "oscuro", "voldy", "hewhomustnotbenamed"]);

async function findExistingSort(guildId, userId, eventKey) {
  return SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId: String(guildId || ""),
    userId: String(userId || ""),
    dedupeKey: String(eventKey || ""),
  })
    .lean()
    .catch(() => null);
}

function computeWandWinChance(wandId) {
  const id = String(wandId || "").trim();
  if (!id) return 42;
  return WAND_WIN_CHANCE[id] ?? 42;
}

function computeHouseBonus(houseId) {
  const h = String(houseId || "").trim();
  return HOUSE_BONUS[h] ?? 0;
}

function buildFighterFromProfile({ userId, displayName, username, houseId, wand }) {
  const wandId = wand?.id || "";
  const base = computeWandWinChance(wandId);
  const bonus = computeHouseBonus(houseId);
  const winChance = Math.min(100, base + bonus);
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

async function loadDuelFighter(client, guildId, userId, displayName, username = "") {
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
  return {
    ok: true,
    fighter: buildFighterFromProfile({
      userId,
      displayName,
      username: username || displayName,
      houseId,
      wand: inventory.wand,
    }),
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

function isBotDuelToken(raw) {
  const t = String(raw || "").trim().toLowerCase();
  return BOT_ALIASES.has(t);
}

/**
 * @returns {{ winnerId: string, loserId: string, draw: boolean, leftRoll: number, rightRoll: number, leftPower: number, rightPower: number, spellLine: string }}
 */
function resolveDuelOutcome(left, right, seed = "") {
  const lPow = Math.max(1, Math.min(100, Math.floor(Number(left?.power) || 1)));
  const rPow = Math.max(1, Math.min(100, Math.floor(Number(right?.power) || 1)));
  const jitter = (String(seed || "").length ? hashSeed(seed) % 17 : randomInt(0, 17)) - 8;
  const leftRoll = randomInt(1, 36) + lPow + (jitter > 0 ? 1 : 0);
  const rightRoll = randomInt(1, 36) + rPow;
  let winnerId = "";
  let draw = false;
  if (leftRoll === rightRoll) {
    draw = true;
  } else if (leftRoll > rightRoll) {
    winnerId = String(left.userId || "");
  } else {
    winnerId = String(right.userId || "");
  }
  const spellLine = pickSpellLine(left, right, winnerId, draw);
  return {
    winnerId,
    loserId: draw ? "" : winnerId === String(left.userId) ? String(right.userId) : String(left.userId),
    draw,
    leftRoll,
    rightRoll,
    leftPower: lPow,
    rightPower: rPow,
    spellLine,
    winnerSide: draw ? "draw" : winnerId === String(left.userId) ? "left" : "right",
  };
}

function hashSeed(source) {
  let h = 2166136261;
  const text = String(source || "");
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h >>> 0);
}

function pickFrom(arr, seed) {
  const a = Array.isArray(arr) ? arr : [];
  if (!a.length) return "";
  return a[seed % a.length];
}

function duelPublicName(fighter) {
  return String(fighter?.username || fighter?.displayName || "Mago").trim() || "Mago";
}

function pickSpellLine(left, right, winnerId, draw) {
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

function formatFighterStatsLine(fighter) {
  const wand = fighter.wandName || "Nessuna bacchetta acquistata";
  return `🏠 ${fighter.houseLabel} · 🪄 ${wand} · ⚡ **${fighter.winChance}%** prob. successo`;
}

function readPositiveInt(value, fallback, min = 0, max = 100000) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function resolveDuelRewards(client) {
  const event = client?.config?.hogwartsEvent && typeof client.config.hogwartsEvent === "object" ? client.config.hogwartsEvent : {};
  const raw = event.duel && typeof event.duel === "object" ? event.duel : {};
  const vsBot = raw.vsBot && typeof raw.vsBot === "object" ? raw.vsBot : {};
  const vsUser = raw.vsUser && typeof raw.vsUser === "object" ? raw.vsUser : {};
  return {
    cooldownMs: readPositiveInt(raw.cooldownMs, DEFAULT_DUEL_REWARDS.cooldownMs, 0, 24 * 60 * 60 * 1000),
    vsBot: {
      galeoni: readPositiveInt(vsBot.galeoni, DEFAULT_DUEL_REWARDS.vsBot.galeoni, 0, 500),
      housePoints: readPositiveInt(vsBot.housePoints, DEFAULT_DUEL_REWARDS.vsBot.housePoints, 0, 500),
    },
    vsUser: {
      galeoni: readPositiveInt(vsUser.galeoni, DEFAULT_DUEL_REWARDS.vsUser.galeoni, 0, 500),
      housePoints: readPositiveInt(vsUser.housePoints, DEFAULT_DUEL_REWARDS.vsUser.housePoints, 0, 500),
    },
  };
}

function dateOnlyMs(value, endOfDay = false) {
  const s = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms = new Date(`${s}T${endOfDay ? "23:59:59.999" : "00:00:00"}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function housePointPeriodKey(nowMs = Date.now()) {
  const now = Number(nowMs || Date.now());
  for (const period of HOUSE_POINT_PERIODS) {
    const start = dateOnlyMs(period.start, false);
    const end = dateOnlyMs(period.end, true);
    if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return period.key;
  }
  return "";
}

function normalizeHouseId(value) {
  const h = String(value || "").trim().toLowerCase();
  return HOUSES.includes(h) ? h : "";
}

async function awardDuelHousePoints(client, guildId, userId, basePoints, gameKey) {
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
  const periodKey = housePointPeriodKey(now.getTime());
  const gk = String(gameKey || "hogwartsDuel").trim();
  const inc = {
    [`rawWebhook.byGame.${gk}`]: points,
    "rawWebhook.total": points,
    [`rawWebhook.totals.${houseId}`]: points,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${houseId}`] = points;
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

function formatDuelRewardLine(rewards) {
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

/**
 * @returns {Promise<{ awarded: boolean, galeoni: number, housePoints: number, houseLabel: string, petMultiplier: number, cooldownMs: number, message: string }|null>}
 */
async function settleDuelVictoryRewards(client, { guildId, winnerId, vsBot = false, dedupeKey = "" }) {
  const gid = String(guildId || "").trim();
  const uid = String(winnerId || "").trim();
  if (!isValidGuildUserId(gid, uid) || String(uid) === VOLDEMORT.userId) return null;
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

module.exports = { BOT_ALIASES, VOLDEMORT, buildFighterFromProfile, computeHouseBonus, computeWandWinChance, formatDuelRewardLine, formatFighterStatsLine, getVoldemortFighter, isBotDuelToken, loadDuelFighter, resolveDuelOutcome, resolveDuelRewards, settleDuelVictoryRewards };