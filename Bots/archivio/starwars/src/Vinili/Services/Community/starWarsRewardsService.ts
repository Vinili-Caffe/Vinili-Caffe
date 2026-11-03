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
const { getStarWarsWallet, publicWallet, ROOT } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
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
 * @param {object} grant { credits?, exp?, pei?, crateId?, crateQty?, troops? }
 */
async function grantStarWarsReward(client, { guildId, userId, grant, reason = "" }) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };

  const gnt = grant && typeof grant === "object" ? grant : {};
  const nowIso = new Date().toISOString();
  const $inc: Record<string, any> = {};
  const $set = {
    [`${ROOT}.eventKey`]: eventKey,
    [`${ROOT}.updatedAt`]: nowIso,
  };

  const credits = safeInt(gnt.credits);
  const exp = safeInt(gnt.exp);
  let pei = Number(gnt.pei);
  if (!Number.isFinite(pei)) pei = 0;
  pei += peiFromExp(exp) + peiFromCreditsMoved(credits);

  if (credits) $inc[`${ROOT}.credits`] = credits;
  if (exp) $inc[`${ROOT}.exp`] = exp;
  if (pei) $inc[`${ROOT}.pei`] = pei;

  const crateId = normalizeId(gnt.crateId);
  const crateQty = Math.max(1, safeInt(gnt.crateQty, 1));
  if (crateId && CRATE_LABELS[crateId]) {
    $inc[`${ROOT}.crates.${crateId}`] = crateQty;
  }

  if (gnt.troops && typeof gnt.troops === "object") {
    for (const [k, v] of Object.entries(gnt.troops)) {
      const n = safeInt(v);
      if (n) $inc[`${ROOT}.pendingTroops.${k}`] = n;
    }
  }

  if (!Object.keys($inc).length) {
    return { ok: true, wallet: await getStarWarsWallet(g, u, eventKey), granted: {} };
  }

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    { $inc, $set, $setOnInsert: { guildId: g, userId: u }, $push: {
      [`${ROOT}.rewardLog`]: {
        $each: [{ at: nowIso, reason: String(reason || "").slice(0, 80), ...gnt }],
        $slice: -40,
      },
    } },
    { upsert: true, new: true },
  ).catch(() => null);

  if (!updated) return { ok: false, error: "persist_failed" };
  return {
    ok: true,
    wallet: publicWallet(updated?.profile?.events?.starwars, eventKey),
    granted: { credits, exp, pei, crateId: crateId || null, crateQty: crateId ? crateQty : 0, troops: gnt.troops || null },
  };
}

async function addStarWarsVoteReward(client, { guildId, userId }) {
  /* PDF: 1 voto = 2500 crediti + 10 exp (+ 0.2 PEI via grant) */
  return grantStarWarsReward(client, {
    guildId,
    userId,
    reason: "vote",
    grant: { credits: 2500, exp: 10, pei: 0.2 },
  });
}

export = {
  peiFromExp,
  peiFromCreditsMoved,
  peiFromVotes,
  grantStarWarsReward,
  addStarWarsVoteReward,
};
