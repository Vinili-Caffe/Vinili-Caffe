/**
 * Reward helper evento SW → wallet (casse/crediti/exp/PEI/truppe pending).
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { CRATE_LABELS, ADVENT_EVENT_KEY } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { hasStarWarsFaction } = require("../../Utils/Eventi/starWarsRuntimeGate") as typeof import("../../Utils/Eventi/starWarsRuntimeGate");
const {
  getStarWarsWallet,
  publicWallet,
  ROOT,
  creditFactionBankUnits,
} = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

/**
 * Wallet SW / sito vivono sempre sul main ufficiale.
 * I minigame possono spawnare sul test (force-live): non usare message.guildId per i grant.
 */
function walletGuildId(client?, fallbackGuildId?) {
  try {
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
  } catch (_) {}
  try {
    const IDs = require(__eventCoreVinili("Config/ids"));
    const main = normalizeId(IDs.guilds?.main);
    if (main) return main;
  } catch (_) {}
  return normalizeId(fallbackGuildId);
}

function notifyEventoWalletLive(userId?, reason = "") {
  const uid = normalizeId(userId);
  if (!/^\d{17,22}$/.test(uid)) return;
  try {
    const { broadcastSiteEventoWalletChanged } = require(__eventCoreVinili(
      "site/suggestions/siteSuggestionsBroadcast",
    ));
    broadcastSiteEventoWalletChanged(uid, { reason: String(reason || "").slice(0, 80) });
  } catch (_) {}
}

/** PEI: 50k exp = 500 PEI → 100 exp = 1 PEI; 10M crediti = 100 PEI → 100k crediti = 1 PEI; 1 voto = 0.2 PEI */
function peiFromExp(exp?) {
  return (safeInt(exp) / 100) * 1; // 100 exp → 1 PEI? PDF: 50000 exp = 500 PEI → 100 exp = 1 PEI
}
function peiFromCreditsMoved(credits?) {
  return safeInt(credits) / 100000; // 10_000_000 = 100 PEI
}
function peiFromVotes(votes?) {
  return safeInt(votes) * 0.2;
}

/**
 * @param {object} grant { credits?, exp?, pei?, votes?, creditsVolume?, crateId?, crateQty?, troops? }
 * PEI: 50k exp → 500; 10M crediti (volume guadagnati/spesi/banca) → 100; 1 voto → 0,2
 */
async function grantStarWarsReward(
  client?,
  {
    guildId,
    userId,
    grant,
    reason = "",
    minigameCreditBuff = false,
  }: {
    guildId?: string | null;
    userId?: string | null;
    grant?: any;
    reason?: string;
    minigameCreditBuff?: boolean;
  } = {},
) {
  const g = walletGuildId(client, guildId);
  const u = normalizeId(userId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };

  const sortedWallet = await getStarWarsWallet(g, u, eventKey);
  if (!hasStarWarsFaction(sortedWallet)) {
    return {
      ok: false,
      error: "not_sorted",
      message: "Devi prima smistarti.",
      wallet: sortedWallet,
    };
  }

  let gnt = grant && typeof grant === "object" ? { ...grant } : {};
  let huttApplied = false;
  if (minigameCreditBuff && safeInt(gnt.credits) > 0) {
    try {
      const { applyRiciclaggioHuttToCredits } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
      const hutt = await applyRiciclaggioHuttToCredits(g, u, gnt.credits);
      if (hutt.buffApplied) {
        gnt.credits = hutt.credits;
        huttApplied = true;
      }
    } catch (_) {}
  }
  const nowIso = new Date().toISOString();
  const $inc: Record<string, any> = {};
  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.updatedAt`]: nowIso,
  };

  const credits = safeInt(gnt.credits);
  const exp = safeInt(gnt.exp);
  const votes = Math.max(0, safeInt(gnt.votes));
  const creditsVolumeExtra = Math.max(0, safeInt(gnt.creditsVolume));
  /* Volume crediti per PEI: guadagnati + eventuali movimenti espliciti (spese/banca). */
  const creditsVolume = Math.max(0, credits) + creditsVolumeExtra;
  let pei = Number(gnt.pei);
  if (!Number.isFinite(pei)) pei = 0;
  pei += peiFromExp(exp) + peiFromCreditsMoved(creditsVolume) + peiFromVotes(votes);

  if (credits) $inc[`${ROOT}.credits`] = credits;
  if (exp) $inc[`${ROOT}.exp`] = exp;
  if (votes) $inc[`${ROOT}.votes`] = votes;
  if (creditsVolume) $inc[`${ROOT}.creditsVolume`] = creditsVolume;
  if (pei) $inc[`${ROOT}.pei`] = pei;

  const crateId = normalizeId(gnt.crateId);
  const crateQty = Math.max(1, safeInt(gnt.crateQty, 1));
  if (crateId && CRATE_LABELS[crateId]) {
    $inc[`${ROOT}.crates.${crateId}`] = crateQty;
  }

  if (gnt.troops && typeof gnt.troops === "object") {
    try {
      const { materializeTroopGrants, isTroopTierKey } = require("../../Utils/Eventi/starWarsEconomyCatalog") as typeof import("../../Utils/Eventi/starWarsEconomyCatalog");
      const { resolveFeatureStateNow, EPOCHS } = require("../../Utils/Eventi/starWarsEventCalendar") as typeof import("../../Utils/Eventi/starWarsEventCalendar");
      const current = await getStarWarsWallet(g, u, eventKey);
      const factionId = current.factionId || null;
      const epoch = current.epoch || resolveFeatureStateNow(new Date()).epoch || EPOCHS.CLONE_WARS;
      if (factionId) {
        const { units } = materializeTroopGrants(gnt.troops, { epoch, factionId });
        /* Solo banca fazione — niente army personale. */
        gnt._resolvedTroops = units;
      } else {
        for (const [k, v] of Object.entries(gnt.troops)) {
          const n = safeInt(v);
          if (n && isTroopTierKey(k)) $inc[`${ROOT}.pendingTroops.${k}`] = n;
        }
      }
    } catch (_) {
      for (const [k, v] of Object.entries(gnt.troops)) {
        const n = safeInt(v);
        if (n) $inc[`${ROOT}.pendingTroops.${k}`] = n;
      }
    }
  }

  const hasResolvedTroops =
    gnt._resolvedTroops && typeof gnt._resolvedTroops === "object" && Object.keys(gnt._resolvedTroops).length > 0;

  if (!Object.keys($inc).length && !hasResolvedTroops) {
    return { ok: true, wallet: await getStarWarsWallet(g, u, eventKey), granted: {} };
  }

  const updateOps: Record<string, any> = {
    $set,
    $setOnInsert: { guildId: g, userId: u },
    $push: {
      [`${ROOT}.rewardLog`]: {
        $each: [{ at: nowIso, reason: String(reason || "").slice(0, 80), ...gnt }],
        $slice: -40,
      },
    },
  };
  if (Object.keys($inc).length) updateOps.$inc = $inc;

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    updateOps,
    { upsert: true, new: true },
  ).catch(() => null);

  if (!updated) return { ok: false, error: "persist_failed" };

  if (hasResolvedTroops) {
    const fid = publicWallet(updated?.profile?.events?.starwars, eventKey)?.factionId;
    if (fid) await creditFactionBankUnits(eventKey, fid, gnt._resolvedTroops);
  }

  let wallet = publicWallet(updated?.profile?.events?.starwars, eventKey);
  try {
    const { attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
    wallet = await attachFactionArsenalToWallet(wallet, eventKey);
  } catch (_) {}
  let levelUp = null;
  /* Solo EXP evento (non EXP profilo) fa salire i livelli SW. */
  if (exp > 0) {
    try {
      const { applyStarWarsLevelProgress } = require("./starWarsLevelService") as typeof import("./starWarsLevelService");
      const prog = await applyStarWarsLevelProgress(client, { guildId: g, userId: u });
      if (prog?.ok) {
        if (prog.wallet) {
          wallet = prog.wallet;
          try {
            const { attachFactionArsenalToWallet } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
            wallet = await attachFactionArsenalToWallet(wallet, eventKey);
          } catch (_) {}
        }
        if (Array.isArray(prog.leveled) && prog.leveled.length) {
          levelUp = { from: prog.prevLevel, to: prog.level, title: prog.title, milestones: prog.leveled };
        }
      }
    } catch (_) {}
  }

  notifyEventoWalletLive(u, reason);

  return {
    ok: true,
    wallet,
    levelUp,
    granted: {
      credits,
      exp,
      pei,
      votes,
      creditsVolume,
      crateId: crateId || null,
      crateQty: crateId ? crateQty : 0,
      troops: gnt.troops || null,
      huttApplied,
    },
  };
}

/** PEI + volume per crediti spesi o versati in banca (senza cambiare saldo se già applicato altrove). */
async function grantStarWarsCreditsVolumePei(
  client?,
  { guildId, userId, amount, reason = "credits_volume" }: {
    guildId?: string | null;
    userId?: string | null;
    amount?: number;
    reason?: string;
  } = {},
) {
  const vol = Math.max(0, safeInt(amount));
  if (!vol) return { ok: true, skipped: true };
  return grantStarWarsReward(client, {
    guildId,
    userId,
    reason,
    grant: { creditsVolume: vol },
  });
}

/** Regola globale vittoria minigame SW: +5 crediti personali +10 banca fazione. */
const GLOBAL_WIN_PERSONAL_CREDITS = 5;
const GLOBAL_WIN_FACTION_BANK_CREDITS = 10;

async function grantStarWarsGlobalMinigameWinBonus(
  client?,
  { guildId, userId }: { guildId?: string | null; userId?: string | null } = {},
) {
  const g = walletGuildId(client, guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };

  const personal = await grantStarWarsReward(client, {
    guildId: g,
    userId: u,
    reason: "minigame_global_win",
    grant: { credits: GLOBAL_WIN_PERSONAL_CREDITS },
    minigameCreditBuff: true,
  });

  let factionId = "";
  let bank = null;
  try {
    const wallet = await getStarWarsWallet(g, u);
    factionId = normalizeId(wallet?.factionId).toLowerCase();
  } catch (_) {}
  if (factionId) {
    try {
      const { addFactionBankCredits } = require("./starWarsEconomyService") as typeof import("./starWarsEconomyService");
      bank = await addFactionBankCredits(client, factionId, GLOBAL_WIN_FACTION_BANK_CREDITS, {
        guildId: g,
        userId: u,
      });
    } catch (_) {}
  }

  return {
    ok: Boolean(personal?.ok),
    credits: GLOBAL_WIN_PERSONAL_CREDITS,
    bankCredits: GLOBAL_WIN_FACTION_BANK_CREDITS,
    factionId: factionId || null,
    bank,
    error: personal?.ok ? null : personal?.error || "grant_failed",
  };
}

/** Premi specifici del minigame + regola globale 5/10. */
async function grantStarWarsMinigameWinReward(client?, opts: Record<string, any> = {}) {
  const out = await grantStarWarsReward(client, { ...opts, minigameCreditBuff: true });
  const side = await grantStarWarsGlobalMinigameWinBonus(client, {
    guildId: opts?.guildId,
    userId: opts?.userId,
  }).catch(() => null);
  return { ...out, sideWin: side };
}

async function addStarWarsVoteReward(client, { guildId, userId }) {
  /* Smistato: 1 voto = 2500 crediti + 100 exp evento + 0,2 PEI voto (+×2 se Festival Ancestors) */
  let grant = { credits: 2500, exp: 100, votes: 1 };
  try {
    const { applyFestivalAncestorsToVoteGrant } = require("./starWarsUtilityItemsService") as typeof import("./starWarsUtilityItemsService");
    const fest = await applyFestivalAncestorsToVoteGrant(guildId, userId, grant);
    grant = fest.grant;
  } catch (_) {}
  return grantStarWarsReward(client, {
    guildId,
    userId,
    reason: "vote",
    grant,
  });
}

export = {
  peiFromExp,
  peiFromCreditsMoved,
  peiFromVotes,
  walletGuildId,
  GLOBAL_WIN_PERSONAL_CREDITS,
  GLOBAL_WIN_FACTION_BANK_CREDITS,
  grantStarWarsReward,
  grantStarWarsCreditsVolumePei,
  grantStarWarsGlobalMinigameWinBonus,
  grantStarWarsMinigameWinReward,
  addStarWarsVoteReward,
};
