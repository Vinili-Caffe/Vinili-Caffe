/**
 * Ranghi fazione: assegnazione manuale dal Marshal (tier 4, max 1) o High Staff.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { ROOT, getStarWarsWallet, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const {
  RANK_MAX_TIER,
  clampTier,
  normalizeFactionId,
  publicRank,
  permissionsForTier,
  resolveTierFromName,
  rankLabel,
} = require("../../Utils/Eventi/starWarsFactionRanksCatalog") as typeof import("../../Utils/Eventi/starWarsFactionRanksCatalog");

function normalizeId(v?) {
  return String(v || "").trim();
}

function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fb;
}

async function findMarshalUserId(guildId?, factionId?, eventKey?) {
  const g = normalizeId(guildId);
  const fid = normalizeFactionId(factionId);
  if (!g || !fid) return null;
  const doc = await ActivityUserProfile.findOne({
    guildId: g,
    [`${ROOT}.factionId`]: fid,
    [`${ROOT}.factionRankTier`]: RANK_MAX_TIER,
  })
    .select({ userId: 1 })
    .lean()
    .catch(() => null);
  return doc?.userId ? String(doc.userId) : null;
}

async function countAtTier(guildId?, factionId?, tier?) {
  const g = normalizeId(guildId);
  const fid = normalizeFactionId(factionId);
  const t = clampTier(tier, 1);
  if (!g || !fid) return 0;
  return ActivityUserProfile.countDocuments({
    guildId: g,
    [`${ROOT}.factionId`]: fid,
    [`${ROOT}.factionRankTier`]: t,
  }).catch(() => 0);
}

function rankFromWallet(wallet?) {
  if (!wallet?.factionId) return null;
  return publicRank(wallet.factionId, wallet.factionRankTier || 1, wallet.epoch);
}

async function getUserFactionRank(guildId?, userId?, eventKey = "") {
  const wallet = await getStarWarsWallet(guildId, userId, eventKey);
  return { wallet, rank: rankFromWallet(wallet) };
}

async function setUserFactionRankTier(
  guildId?,
  userId?,
  tier?,
  { eventKey = "", factionId = null } = {},
) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const t = clampTier(tier, 1);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };

  const nowIso = new Date().toISOString();
  const filter: Record<string, any> = { guildId: g, userId: u };
  if (factionId) filter[`${ROOT}.factionId`] = normalizeFactionId(factionId);

  const updated = await ActivityUserProfile.findOneAndUpdate(
    filter,
    {
      $set: {
        [`${ROOT}.factionRankTier`]: t,
        [`${ROOT}.eventKey`]: key,
        [`${ROOT}.updatedAt`]: nowIso,
      },
    },
    { new: true },
  ).catch(() => null);

  if (!updated) return { ok: false, error: "not_found" };
  const wallet = publicWallet(updated.profile?.events?.starwars, key);
  return { ok: true, wallet, rank: rankFromWallet(wallet) };
}

/**
 * High Staff: forza un tier (gestisce unico marshal).
 */
async function staffSetFactionRank(client?, { guildId, targetUserId, tierOrName }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const target = normalizeId(targetUserId);
  const wallet = await getStarWarsWallet(g, target, eventKey);
  if (!wallet.factionId) {
    return { ok: false, status: 403, error: "no_faction", message: "L'utente non è smistato." };
  }
  let tier = resolveTierFromName(wallet.factionId, tierOrName);
  if (tier == null) tier = clampTier(tierOrName, 0);
  if (!tier || tier < 1 || tier > RANK_MAX_TIER) {
    return { ok: false, status: 400, error: "bad_tier", message: "Rango non valido (1–4 o nome)." };
  }

  if (tier === RANK_MAX_TIER) {
    const current = await findMarshalUserId(g, wallet.factionId, eventKey);
    if (current && current !== target) {
      await setUserFactionRankTier(g, current, RANK_MAX_TIER - 1, {
        eventKey,
        factionId: wallet.factionId,
      });
    }
  }

  const out = await setUserFactionRankTier(g, target, tier, {
    eventKey,
    factionId: wallet.factionId,
  });
  if (!out.ok) return { ok: false, status: 500, error: out.error, message: "Salvataggio fallito." };
  return {
    ok: true,
    status: 200,
    wallet: out.wallet,
    rank: out.rank,
    message: `Rango impostato: **${out.rank.label}**.`,
  };
}

/**
 * Marshal: promuove di 1 (max tier 3). Per dare il 4° usa transferMarshal.
 */
async function promoteFactionMember(client?, { guildId, actorUserId, targetUserId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const actor = await getStarWarsWallet(g, actorUserId, eventKey);
  const target = await getStarWarsWallet(g, targetUserId, eventKey);
  if (!actor.factionId || !permissionsForTier(actor.factionRankTier).manageRanks) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo il rango massimo può promuovere." };
  }
  if (!target.factionId || normalizeFactionId(target.factionId) !== normalizeFactionId(actor.factionId)) {
    return { ok: false, status: 403, error: "wrong_faction", message: "L'utente non è nella tua fazione." };
  }
  if (normalizeId(actorUserId) === normalizeId(targetUserId)) {
    return { ok: false, status: 400, error: "self", message: "Non puoi promuovere te stesso." };
  }
  const cur = clampTier(target.factionRankTier, 1);
  if (cur >= RANK_MAX_TIER - 1) {
    return {
      ok: false,
      status: 409,
      error: "at_cap",
      message: `Già al massimo promuovibile. Per il rango massimo usa \`+nomina @utente\`.`,
    };
  }
  const next = cur + 1;
  const out = await setUserFactionRankTier(g, targetUserId, next, {
    eventKey,
    factionId: actor.factionId,
  });
  if (!out.ok) return { ok: false, status: 500, error: out.error, message: "Salvataggio fallito." };
  return {
    ok: true,
    status: 200,
    wallet: out.wallet,
    rank: out.rank,
    message: `Promosso a **${out.rank.label}**.`,
  };
}

async function demoteFactionMember(client?, { guildId, actorUserId, targetUserId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const actor = await getStarWarsWallet(g, actorUserId, eventKey);
  const target = await getStarWarsWallet(g, targetUserId, eventKey);
  if (!actor.factionId || !permissionsForTier(actor.factionRankTier).manageRanks) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo il rango massimo può declassare." };
  }
  if (!target.factionId || normalizeFactionId(target.factionId) !== normalizeFactionId(actor.factionId)) {
    return { ok: false, status: 403, error: "wrong_faction", message: "L'utente non è nella tua fazione." };
  }
  if (normalizeId(actorUserId) === normalizeId(targetUserId)) {
    return { ok: false, status: 400, error: "self", message: "Non puoi declassare te stesso." };
  }
  const cur = clampTier(target.factionRankTier, 1);
  if (cur >= RANK_MAX_TIER) {
    return { ok: false, status: 409, error: "is_marshal", message: "Non puoi declassare il rango massimo così." };
  }
  if (cur <= 1) {
    return { ok: false, status: 409, error: "at_floor", message: "È già al rango più basso." };
  }
  const out = await setUserFactionRankTier(g, targetUserId, cur - 1, {
    eventKey,
    factionId: actor.factionId,
  });
  if (!out.ok) return { ok: false, status: 500, error: out.error, message: "Salvataggio fallito." };
  return {
    ok: true,
    status: 200,
    wallet: out.wallet,
    rank: out.rank,
    message: `Declassato a **${out.rank.label}**.`,
  };
}

/** Marshal cede il rango massimo a un membro della fazione (diventa tier 3). */
async function transferMarshal(client?, { guildId, actorUserId, targetUserId }) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const actorId = normalizeId(actorUserId);
  const targetId = normalizeId(targetUserId);
  const actor = await getStarWarsWallet(g, actorId, eventKey);
  const target = await getStarWarsWallet(g, targetId, eventKey);
  if (!actor.factionId || !permissionsForTier(actor.factionRankTier).manageRanks) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo il rango massimo può nominare il successore." };
  }
  if (!target.factionId || normalizeFactionId(target.factionId) !== normalizeFactionId(actor.factionId)) {
    return { ok: false, status: 403, error: "wrong_faction", message: "L'utente non è nella tua fazione." };
  }
  if (actorId === targetId) {
    return { ok: false, status: 400, error: "self", message: "Sei già al rango massimo." };
  }

  await setUserFactionRankTier(g, actorId, RANK_MAX_TIER - 1, {
    eventKey,
    factionId: actor.factionId,
  });
  const out = await setUserFactionRankTier(g, targetId, RANK_MAX_TIER, {
    eventKey,
    factionId: actor.factionId,
  });
  if (!out.ok) return { ok: false, status: 500, error: out.error, message: "Salvataggio fallito." };
  return {
    ok: true,
    status: 200,
    wallet: out.wallet,
    rank: out.rank,
    message: `Nominato **${out.rank.label}**. Tu scendi a **${rankLabel(actor.factionId, RANK_MAX_TIER - 1)}**.`,
  };
}

export = {
  findMarshalUserId,
  countAtTier,
  rankFromWallet,
  getUserFactionRank,
  setUserFactionRankTier,
  staffSetFactionRank,
  promoteFactionMember,
  demoteFactionMember,
  transferMarshal,
  permissionsForTier,
  publicRank,
};
