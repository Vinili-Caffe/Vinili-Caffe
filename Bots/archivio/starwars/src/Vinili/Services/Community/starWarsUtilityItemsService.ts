/**
 * Utility SW: inventario, attivazione buff, Bacta heal, helper per voti/minigame/shop.
 * Bacta + Sconto mercato nero vivono nell'arsenale fazione; Festival/Hutt restano personali.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const {
  UTILITY_ITEM_IDS,
  UTILITY_ITEM_LABELS,
  UTILITY_ITEM_BLURBS,
  BUFF_DURATION_MS,
  isUtilityItemId,
  isFactionUtilityItemId,
  publicUtilityCatalog,
} = require("../../Utils/Eventi/starWarsUtilityItemsCatalog") as typeof import("../../Utils/Eventi/starWarsUtilityItemsCatalog");
const { ROOT, publicWallet, getStarWarsWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { formatUtilityMention } = require("../../Utils/Eventi/starWarsUtilityEmojis") as typeof import("../../Utils/Eventi/starWarsUtilityEmojis");

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function readRawSw(doc?) {
  return doc?.profile?.events?.starwars || {};
}

function normalizeArmy(raw?) {
  const out = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [k, v] of Object.entries(raw)) {
    const id = normalizeId(k);
    const n = safeInt(v);
    if (id && n > 0) out[id] = n;
  }
  return out;
}

function normalizeUtilityItems(rawItems?) {
  const out = {};
  const src = rawItems && typeof rawItems === "object" ? rawItems : {};
  for (const id of UTILITY_ITEM_IDS) {
    const n = safeInt(src[id]);
    if (n > 0) out[id] = n;
  }
  return out;
}

function normalizeBuffs(rawBuffs?, now = Date.now()) {
  const out = {};
  const src = rawBuffs && typeof rawBuffs === "object" ? rawBuffs : {};
  for (const id of ["festival_ancestors", "riciclaggio_hutt", "sconto_mercato_nero"]) {
    const row = src[id];
    if (!row || typeof row !== "object") continue;
    const exp = Date.parse(String(row.expiresAt || ""));
    if (!Number.isFinite(exp) || exp <= now) continue;
    out[id] = {
      active: true,
      activatedAt: row.activatedAt ? String(row.activatedAt) : null,
      expiresAt: new Date(exp).toISOString(),
      label: UTILITY_ITEM_LABELS[id],
      blurb: UTILITY_ITEM_BLURBS[id],
    };
  }
  return out;
}

function isBuffActiveOnWallet(walletOrRaw?, buffId?, now = Date.now()) {
  const buffs = walletOrRaw?.buffs || walletOrRaw?.profile?.events?.starwars?.buffs || walletOrRaw;
  const row = buffs && typeof buffs === "object" ? buffs[buffId] : null;
  if (!row) return false;
  const exp = Date.parse(String(row.expiresAt || ""));
  return Number.isFinite(exp) && exp > now;
}

async function loadRawWalletDoc(guildId?, userId?) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u }).select(ROOT).lean().catch(() => null);
}

/**
 * Bacta: +5% ceil su ogni unità dell'arsenale (tipicamente banca fazione).
 */
function computeBactaHeal(army?) {
  const before = normalizeArmy(army);
  const after = { ...before };
  const healed = {};
  let totalHealed = 0;
  for (const [unitId, qty] of Object.entries(before)) {
    const gain = Math.max(1, Math.ceil(qty * 0.05));
    after[unitId] = qty + gain;
    healed[unitId] = gain;
    totalHealed += gain;
  }
  return { before, after, healed, totalHealed, hadArmy: Object.keys(before).length > 0 };
}

async function enrichedWallet(guildId?, userId?, eventKey?) {
  let wallet = await getStarWarsWallet(guildId, userId, eventKey);
  try {
    const { attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    wallet = await attachFactionArsenalToWallet(wallet, eventKey);
  } catch (_) {}
  return wallet;
}

async function useStarWarsUtilityItem(
  client?,
  { guildId, userId, itemId }: { guildId?: string | null; userId?: string | null; itemId?: string | null } = {},
) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const iid = normalizeId(itemId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u) || !isUtilityItemId(iid)) {
    return { ok: false, status: 400, error: "bad_item", message: "Oggetto non valido." };
  }

  if (iid === "bacta") {
    return {
      ok: false,
      status: 409,
      error: "bacta_attack_only",
      message: "Il Bacta si usa solo in attacco quando schieri le truppe della fazione.",
      wallet: await enrichedWallet(g, u, eventKey),
    };
  }

  const now = Date.now();
  const nowIso = new Date().toISOString();

  /* Sconto: stock + buff sulla banca fazione. */
  if (isFactionUtilityItemId(iid) && iid === "sconto_mercato_nero") {
    const wallet = await getStarWarsWallet(g, u, eventKey);
    if (!wallet.factionId) {
      return {
        ok: false,
        status: 403,
        error: "no_faction",
        message: "Devi prima fare lo smistamento.",
        wallet: await enrichedWallet(g, u, eventKey),
      };
    }
    const { getFactionBank, saveFactionBank, attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    const bank = await getFactionBank(eventKey, wallet.factionId);
    const qty = safeInt(bank.items?.sconto_mercato_nero);
    if (qty < 1) {
      return {
        ok: false,
        status: 409,
        error: "no_item",
        message: "La fazione non ha questo oggetto.",
        wallet: await attachFactionArsenalToWallet(wallet, eventKey),
      };
    }
    if (isBuffActiveOnWallet({ buffs: bank.buffs }, iid, now)) {
      return {
        ok: false,
        status: 409,
        error: "buff_active",
        message: "Lo sconto della fazione è già attivo.",
        wallet: await attachFactionArsenalToWallet(wallet, eventKey),
      };
    }
    const expiresAt = new Date(now + BUFF_DURATION_MS).toISOString();
    const items = { ...(bank.items || {}) };
    const left = qty - 1;
    if (left > 0) items.sconto_mercato_nero = left;
    else delete items.sconto_mercato_nero;
    bank.items = items;
    bank.buffs = {
      ...(bank.buffs || {}),
      [iid]: { active: true, activatedAt: nowIso, expiresAt },
    };
    await saveFactionBank(eventKey, wallet.factionId, bank);
    return {
      ok: true,
      status: 200,
      itemId: iid,
      label: UTILITY_ITEM_LABELS[iid],
      effect: "buff_activated",
      expiresAt,
      message: `${formatUtilityMention(iid)} attivo per la fazione per 24 ore.`,
      wallet: await attachFactionArsenalToWallet(wallet, eventKey),
    };
  }

  const doc = await loadRawWalletDoc(g, u);
  const sw = readRawSw(doc);
  const qty = safeInt(sw?.items?.[iid]);
  if (qty < 1) {
    return {
      ok: false,
      status: 409,
      error: "no_item",
      message: "Non hai questo oggetto.",
      wallet: await enrichedWallet(g, u, eventKey),
    };
  }

  /* Buff 24h personali: blocca se già attivo */
  if (isBuffActiveOnWallet(sw, iid, now)) {
    return {
      ok: false,
      status: 409,
      error: "buff_active",
      message: "Questo buff è già attivo.",
      wallet: await enrichedWallet(g, u, eventKey),
    };
  }

  const expiresAt = new Date(now + BUFF_DURATION_MS).toISOString();
  const itemPath = `${ROOT}.items.${iid}`;
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [itemPath]: { $gte: 1 } },
    {
      $inc: { [itemPath]: -1 },
      $set: {
        [`${ROOT}.eventKey`]: eventKey,
        [`${ROOT}.updatedAt`]: nowIso,
        [`${ROOT}.buffs.${iid}`]: {
          active: true,
          activatedAt: nowIso,
          expiresAt,
        },
      },
    },
    { new: true },
  ).catch(() => null);

  if (!updated) {
    return { ok: false, status: 409, error: "no_item", message: "Non hai questo oggetto." };
  }

  return {
    ok: true,
    status: 200,
    itemId: iid,
    label: UTILITY_ITEM_LABELS[iid],
    effect: "buff_activated",
    expiresAt,
    message: `${formatUtilityMention(iid)} attivo per 24 ore.`,
    wallet: await enrichedWallet(g, u, eventKey),
  };
}

async function hasActiveBuff(guildId?, userId?, buffId?) {
  const bid = normalizeId(buffId);
  if (bid === "sconto_mercato_nero") {
    try {
      const wallet = await getStarWarsWallet(guildId, userId, ADVENT_EVENT_KEY);
      if (!wallet.factionId) return false;
      const eventKey = wallet.eventKey || ADVENT_EVENT_KEY;
      const { getFactionBank } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
      const bank = await getFactionBank(eventKey, wallet.factionId);
      return isBuffActiveOnWallet({ buffs: bank.buffs }, bid);
    } catch (_) {
      return false;
    }
  }
  const doc = await loadRawWalletDoc(guildId, userId);
  return isBuffActiveOnWallet(readRawSw(doc), bid);
}

/** Festival Ancestors: ×2 crediti+exp voto se buff attivo. */
async function applyFestivalAncestorsToVoteGrant(guildId?, userId?, grant?) {
  const gnt = grant && typeof grant === "object" ? { ...grant } : {};
  const active = await hasActiveBuff(guildId, userId, "festival_ancestors");
  if (!active) return { grant: gnt, buffApplied: false };
  if (gnt.credits) gnt.credits = safeInt(gnt.credits) * 2;
  if (gnt.exp) gnt.exp = safeInt(gnt.exp) * 2;
  return { grant: gnt, buffApplied: true };
}

/** Riciclaggio Hutt: +10% crediti minigame (ceil) se buff attivo. */
async function applyRiciclaggioHuttToCredits(guildId?, userId?, credits?) {
  const base = safeInt(credits);
  if (base <= 0) return { credits: base, buffApplied: false };
  const active = await hasActiveBuff(guildId, userId, "riciclaggio_hutt");
  if (!active) return { credits: base, buffApplied: false };
  const boosted = Math.ceil(base * 1.1);
  return { credits: boosted, buffApplied: true, bonus: boosted - base };
}

/** Sconto mercato nero: moltiplicatore costo shop (0.8 se buff fazione attivo). */
async function shopDiscountMultiplier(guildId?, userId?) {
  const active = await hasActiveBuff(guildId, userId, "sconto_mercato_nero");
  return active ? 0.8 : 1;
}

export = {
  UTILITY_ITEM_IDS,
  UTILITY_ITEM_LABELS,
  UTILITY_ITEM_BLURBS,
  normalizeArmy,
  normalizeUtilityItems,
  normalizeBuffs,
  isBuffActiveOnWallet,
  computeBactaHeal,
  useStarWarsUtilityItem,
  hasActiveBuff,
  applyFestivalAncestorsToVoteGrant,
  applyRiciclaggioHuttToCredits,
  shopDiscountMultiplier,
  publicUtilityCatalog,
};
