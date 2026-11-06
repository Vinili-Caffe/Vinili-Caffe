/**
 * Ranghi fazione: assegnazione solo dal rango massimo (tier 4, max 1) via sito.
 * Bootstrap: primo smistato della fazione (se nessuno ha il 4) oppure claim se vacante.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { getGuildMemberCached } = require(__eventCoreVinili("../shared/discord/interactionEntityCache"));
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
  ranksCatalogForFaction,
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
async function staffSetFactionRank(
  client?,
  {
    guildId,
    targetUserId,
    tierOrName,
  }: { guildId?: string | null; targetUserId?: string | null; tierOrName?: string | number | null } = {},
) {
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
      return {
        ok: false,
        status: 409,
        error: "marshal_locked",
        message: "Il rango massimo è già assegnato e non è trasferibile.",
      };
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
async function promoteFactionMember(
  client?,
  {
    guildId,
    actorUserId,
    targetUserId,
  }: { guildId?: string | null; actorUserId?: string | null; targetUserId?: string | null } = {},
) {
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
      message: "Già al massimo promuovibile.",
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

async function demoteFactionMember(
  client?,
  {
    guildId,
    actorUserId,
    targetUserId,
  }: { guildId?: string | null; actorUserId?: string | null; targetUserId?: string | null } = {},
) {
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

/**
 * Se la fazione non ha un rango massimo, promuove questo utente a tier 4.
 * Chiamato dopo lo smistamento.
 */
async function maybeBootstrapMarshal(guildId?, userId?, factionId?, eventKey = "") {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const fid = normalizeFactionId(factionId);
  const key = normalizeId(eventKey) || ADVENT_EVENT_KEY;
  if (!g || !u || !fid) return { ok: false, bootstrapped: false };
  const current = await findMarshalUserId(g, fid, key);
  if (current) return { ok: true, bootstrapped: false, marshalUserId: current };
  const out = await setUserFactionRankTier(g, u, RANK_MAX_TIER, { eventKey: key, factionId: fid });
  return { ok: Boolean(out.ok), bootstrapped: Boolean(out.ok), marshalUserId: u, rank: out.rank || null };
}

/** Membro reclama il comando se nessuno ha il rango massimo. */
async function claimMarshalIfVacant(
  client?,
  { guildId, actorUserId }: { guildId?: string | null; actorUserId?: string | null } = {},
) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const actorId = normalizeId(actorUserId);
  const actor = await getStarWarsWallet(g, actorId, eventKey);
  if (!actor.factionId) {
    return { ok: false, status: 403, error: "no_faction", message: "Devi prima fare lo smistamento." };
  }
  const current = await findMarshalUserId(g, actor.factionId, eventKey);
  if (current) {
    if (current === actorId) {
      return { ok: false, status: 409, error: "already", message: "Hai già il rango massimo." };
    }
    return { ok: false, status: 409, error: "occupied", message: "Il comando è già assegnato." };
  }
  const out = await setUserFactionRankTier(g, actorId, RANK_MAX_TIER, {
    eventKey,
    factionId: actor.factionId,
  });
  if (!out.ok) return { ok: false, status: 500, error: out.error, message: "Salvataggio fallito." };
  return {
    ok: true,
    status: 200,
    wallet: out.wallet,
    rank: out.rank,
    message: `Hai assunto il comando: **${out.rank.label}**.`,
  };
}

async function listFactionRankRoster(
  client?,
  { guildId, actorUserId }: { guildId?: string | null; actorUserId?: string | null } = {},
) {
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  const g = normalizeId(guildId);
  const actorId = normalizeId(actorUserId);
  const actor = await getStarWarsWallet(g, actorId, eventKey);
  if (!actor.factionId) {
    return { ok: false, status: 403, error: "no_faction", message: "Devi prima fare lo smistamento." };
  }
  const fid = normalizeFactionId(actor.factionId);
  const marshalId = await findMarshalUserId(g, fid, eventKey);
  const canManageRanks = Boolean(permissionsForTier(actor.factionRankTier).manageRanks);
  const canClaimMarshal = !marshalId;

  const docs = await ActivityUserProfile.find({
    guildId: g,
    [`${ROOT}.factionId`]: fid,
  })
    .select({ userId: 1, [`${ROOT}.factionRankTier`]: 1, [`${ROOT}.factionId`]: 1 })
    .lean()
    .catch(() => []);

  const guild = client?.guilds?.cache?.get(g) || null;
  const members = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const uid = normalizeId(doc?.userId);
    if (!uid) continue;
    const tier = clampTier(doc?.profile?.events?.starwars?.factionRankTier, 1);
    const rank = publicRank(fid, tier, actor.epoch);
    let displayName = uid;
    let avatarUrl = null;
    if (guild) {
      const member = await getGuildMemberCached(guild, uid).catch(() => null);
      if (member) {
        displayName = String(member.displayName || member.user?.globalName || member.user?.username || uid);
        try {
          avatarUrl = member.displayAvatarURL?.({ size: 64 }) || member.user?.displayAvatarURL?.({ size: 64 }) || null;
        } catch {
          avatarUrl = null;
        }
      }
    }
    members.push({
      userId: uid,
      displayName,
      avatarUrl,
      tier: rank.tier,
      rank,
      isSelf: uid === actorId,
      isMarshal: tier >= RANK_MAX_TIER,
    });
  }
  members.sort((a, b) => b.tier - a.tier || String(a.displayName).localeCompare(String(b.displayName), "it"));

  return {
    ok: true,
    status: 200,
    factionId: fid,
    marshalUserId: marshalId,
    canManageRanks,
    canClaimMarshal,
    ranksCatalog: ranksCatalogForFaction(fid),
    members,
    selfRank: publicRank(fid, actor.factionRankTier || 1, actor.epoch),
  };
}

/** Marshal cede il rango massimo a un membro della fazione (diventa tier 3). */
async function transferMarshal(
  client?,
  {
    guildId,
    actorUserId,
    targetUserId,
  }: { guildId?: string | null; actorUserId?: string | null; targetUserId?: string | null } = {},
) {
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
  maybeBootstrapMarshal,
  claimMarshalIfVacant,
  listFactionRankRoster,
  permissionsForTier,
  publicRank,
};
