/**
 * Wallet evento Star Wars su ActivityUserProfile.profile.events.starwars
 * Fase 0: credits/exp/pei/casse/avvento claim. Economia/fazioni dopo.
 */
"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../../Utils/DB/validateWriteIds");
const { addPremiumCredits } = require("./premiumCreditsService") as typeof import("./premiumCreditsService");
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const {
  ADVENT_EVENT_KEY,
  CRATE_LABELS,
  getAdventDay,
  listAdventDays,
} = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { adventSlotForRomeDate } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
const { openCrateLoot } = require("../../Utils/Eventi/starWarsCrateLoot") as typeof import("../../Utils/Eventi/starWarsCrateLoot");

const ROOT = "profile.events.starwars";
const CRATE_IDS = Object.freeze(Object.keys(CRATE_LABELS));

function normalizeId(v?) {
  return String(v || "").trim();
}

function safeInt(v?, fallback = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function emptyCrates() {
  const out: Record<string, any> = {};
  for (const id of CRATE_IDS) out[id] = 0;
  return out;
}

function normalizeCrates(raw?) {
  const out = emptyCrates();
  if (!raw || typeof raw !== "object") return out;
  for (const id of CRATE_IDS) out[id] = safeInt(raw[id]);
  return out;
}

function normalizeClaimed(raw?) {
  const out: Record<string, any> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const day = Math.floor(Number(k));
    if (!Number.isFinite(day) || day < 1 || day > 25) continue;
    const at = v == null ? null : String(v);
    if (at) out[String(day)] = at;
  }
  return out;
}

function readSlice(doc?) {
  return doc?.profile?.events?.starwars && typeof doc.profile.events.starwars === "object"
    ? doc.profile.events.starwars
    : null;
}

function publicWallet(raw?, eventKey?) {
  const key = normalizeId(raw?.eventKey) || eventKey || ADVENT_EVENT_KEY;
  if (raw && normalizeId(raw.eventKey) && normalizeId(raw.eventKey) !== key) {
    return blankWallet(key);
  }
  return {
    eventKey: key,
    factionId: raw?.factionId ? String(raw.factionId) : null,
    epoch: raw?.epoch ? String(raw.epoch) : null,
    pgLevel: Math.max(1, safeInt(raw?.pgLevel, 1)),
    exp: safeInt(raw?.exp),
    credits: safeInt(raw?.credits),
    pei: Number(raw?.pei) || 0,
    crates: normalizeCrates(raw?.crates),
    items: raw?.items && typeof raw.items === "object" ? { ...raw.items } : {},
    deckPG: Array.isArray(raw?.deckPG) ? raw.deckPG.slice(0, 200) : [],
    deckReliquie: Array.isArray(raw?.deckReliquie) ? raw.deckReliquie.slice(0, 200) : [],
    advent: {
      claimed: normalizeClaimed(raw?.advent?.claimed),
    },
    updatedAt: raw?.updatedAt ? String(raw.updatedAt) : null,
  };
}

function blankWallet(eventKey?) {
  return {
    eventKey: eventKey || ADVENT_EVENT_KEY,
    factionId: null,
    epoch: null,
    pgLevel: 1,
    exp: 0,
    credits: 0,
    pei: 0,
    crates: emptyCrates(),
    items: {},
    deckPG: [],
    deckReliquie: [],
    advent: { claimed: {} },
    updatedAt: null,
  };
}

async function getStarWarsWallet(guildId?, userId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return blankWallet(key);
  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(ROOT)
    .lean()
    .catch(() => null);
  return publicWallet(readSlice(doc), key);
}

/**
 * Claim avvento atomico.
 * @returns {{ ok, status?, error?, message?, wallet?, granted?, day? }}
 */
async function claimAdventDay(client, { guildId, userId, day, staffPreview = false }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const dayNum = Math.floor(Number(day));
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;

  if (!isValidGuildUserId(g, u)) {
    return { ok: false, status: 400, error: "bad_ids", message: "Utente non valido." };
  }
  const slot = getAdventDay(dayNum);
  if (!slot) {
    return { ok: false, status: 400, error: "bad_day", message: "Giorno avvento non valido (1–25)." };
  }

  const todaySlot = adventSlotForRomeDate(new Date());
  if (!staffPreview) {
    if (todaySlot == null) {
      return {
        ok: false,
        status: 403,
        error: "advent_closed",
        message: "L'avvento è disponibile solo a dicembre 2026.",
      };
    }
    if (dayNum > todaySlot) {
      return {
        ok: false,
        status: 403,
        error: "too_early",
        message: "Questo giorno non è ancora sbloccato.",
      };
    }
  }

  const rewardKey = `advent_${eventKey}_${dayNum}`;
  const claimedPath = `${ROOT}.advent.claimed.${dayNum}`;
  const nowIso = new Date().toISOString();

  const inc: Record<string, any> = {};
  const granted = [];
  let premiumCreditGrant = 0;
  for (const part of slot.rewards) {
    if (part.type === "crate") {
      const id = String(part.crateId || "").trim();
      const qty = Math.max(1, safeInt(part.qty, 1));
      if (!CRATE_LABELS[id]) continue;
      const path = `${ROOT}.crates.${id}`;
      inc[path] = (inc[path] || 0) + qty;
      granted.push({ type: "crate", crateId: id, qty, label: CRATE_LABELS[id] });
    } else if (part.type === "premium_credits") {
      const amount = safeInt(part.amount);
      if (amount > 0) {
        premiumCreditGrant += amount;
        granted.push({ type: "premium_credits", amount });
      }
    }
  }

  const setFields = {
    [`${ROOT}.eventKey`]: eventKey,
    [claimedPath]: nowIso,
    [`${ROOT}.updatedAt`]: nowIso,
  };

  const update: Record<string, any> = {
    $set: setFields,
    $addToSet: { [`${ROOT}.rewardKeys`]: rewardKey },
    $setOnInsert: { guildId: g, userId: u },
  };
  if (Object.keys(inc).length) update.$inc = inc;

  /* Mixed starwars: non castare `rewardKeys: { $ne }` in query (CastError path rewardKeys).
     Idempotenza = claimed.<day> assente. Update via collection: no cast Mongoose su $addToSet Mixed. */
  let updated = null;
  try {
    const raw = await ActivityUserProfile.collection.findOneAndUpdate(
      {
        guildId: g,
        userId: u,
        [claimedPath]: { $exists: false },
      },
      update,
      { upsert: true, returnDocument: "after" },
    );
    updated = raw && typeof raw === "object" && "value" in raw ? raw.value : raw;
  } catch (err) {
    if (err && (err.code === 11000 || String(err.message || "").includes("E11000"))) {
      updated = null;
    } else {
      throw err;
    }
  }

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    if (current.advent.claimed[String(dayNum)]) {
      return {
        ok: false,
        status: 409,
        error: "already_claimed",
        message: "Hai già ritirato questo giorno.",
        wallet: current,
        day: dayNum,
      };
    }
    return { ok: false, status: 500, error: "persist_failed", message: "Salvataggio non riuscito." };
  }

  if (premiumCreditGrant > 0) {
    const creditRes: any = await addPremiumCredits(u, premiumCreditGrant).catch(() => ({ ok: false }));
    if (!creditRes?.ok) {
      global.logger?.warn?.("[starWars] advent premium credits failed", {
        userId: u,
        day: dayNum,
        amount: premiumCreditGrant,
        error: creditRes?.error,
      });
    }
  }

  return {
    ok: true,
    status: 200,
    day: dayNum,
    label: slot.label,
    granted,
    wallet: publicWallet(readSlice(updated), eventKey),
  };
}

function adventPublicCatalog() {
  return listAdventDays().map((d?) => ({
    day: d.day,
    label: d.label,
    rewards: d.rewards.map((r?) => ({ ...r })),
  }));
}

/**
 * Assegna fazione una sola volta (smistamento).
 * @returns {{ ok, status?, error?, message?, wallet?, factionId? }}
 */
async function setStarWarsFaction(client, { guildId, userId, factionId, epoch = "clone_wars", scores = null }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const fid = normalizeId(factionId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u) || !fid) {
    return { ok: false, status: 400, error: "bad_ids", message: "Dati non validi." };
  }

  const nowIso = new Date().toISOString();
  const factionPath = `${ROOT}.factionId`;
  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [factionPath]: fid,
    [`${ROOT}.epoch`]: String(epoch || "clone_wars"),
    [`${ROOT}.sortedAt`]: nowIso,
    [`${ROOT}.updatedAt`]: nowIso,
  };
  if (scores && typeof scores === "object") $set[`${ROOT}.sortScores`] = scores;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: g,
      userId: u,
      $or: [{ [factionPath]: { $exists: false } }, { [factionPath]: null }, { [factionPath]: "" }],
    },
    {
      $set,
      $setOnInsert: { guildId: g, userId: u },
    },
    { upsert: true, new: true },
  ).catch(() => null);

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    if (current.factionId) {
      return {
        ok: false,
        status: 409,
        error: "already_sorted",
        message: "Sei già stato smistato.",
        wallet: current,
        factionId: current.factionId,
      };
    }
    return { ok: false, status: 500, error: "persist_failed", message: "Salvataggio non riuscito." };
  }

  return {
    ok: true,
    status: 200,
    factionId: fid,
    wallet: publicWallet(readSlice(updated), eventKey),
  };
}

/**
 * Apri 1 cassa dall'inventario → crediti/exp evento (o truppe pending).
 */
async function openStarWarsCrate(client, { guildId, userId, crateId }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cid = normalizeId(crateId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u) || !CRATE_LABELS[cid]) {
    return { ok: false, status: 400, error: "bad_crate", message: "Cassa non valida." };
  }

  const loot = openCrateLoot(cid);
  if (!loot.ok) {
    return { ok: false, status: 400, error: loot.error || "loot_failed", message: "Loot non disponibile." };
  }

  const cratePath = `${ROOT}.crates.${cid}`;
  const nowIso = new Date().toISOString();
  const $inc = { [cratePath]: -1 };
  if (loot.credits) $inc[`${ROOT}.credits`] = loot.credits;
  if (loot.exp) $inc[`${ROOT}.exp`] = loot.exp;

  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.updatedAt`]: nowIso,
  };
  if (loot.troops && typeof loot.troops === "object") {
    for (const [tier, qty] of Object.entries(loot.troops)) {
      $inc[`${ROOT}.pendingTroops.${tier}`] = safeInt(qty);
    }
  }

  const updated = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: g,
      userId: u,
      [cratePath]: { $gte: 1 },
    },
    { $inc, $set, $setOnInsert: { guildId: g, userId: u } },
    { upsert: false, new: true },
  ).catch(() => null);

  if (!updated) {
    const current = await getStarWarsWallet(g, u, eventKey);
    return {
      ok: false,
      status: 409,
      error: "no_crate",
      message: "Non hai questa cassa.",
      wallet: current,
    };
  }

  return {
    ok: true,
    status: 200,
    crateId: cid,
    loot: {
      resolvedCrate: loot.resolvedCrate,
      credits: loot.credits || 0,
      exp: loot.exp || 0,
      troops: loot.troops || null,
      note: loot.note || null,
    },
    wallet: publicWallet(readSlice(updated), eventKey),
  };
}

export = {
  ROOT,
  CRATE_IDS,
  CRATE_LABELS,
  blankWallet,
  publicWallet,
  getStarWarsWallet,
  claimAdventDay,
  setStarWarsFaction,
  openStarWarsCrate,
  adventPublicCatalog,
  getAdventDay,
};
