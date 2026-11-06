// @ts-nocheck
/* Wallet crediti evento Star Wars per i comandi economia Discord. */
"use strict";

const path = require("path") as typeof import("path");
const viniliRoot = path.resolve(__dirname, "../../../../../../src/Vinili");
const { ActivityUserProfile } = require(path.join(viniliRoot, "Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(path.join(viniliRoot, "../shared/db/validateWriteIds"));

const CURRENCY_CREDITI = "crediti";
const CREDITI_EMOJI = "<a:VC_crediti:1567852561543733338>";
const ROOT = "profile.events.starwars";

function normalizeId(v?) {
  return String(v || "").trim();
}

function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function eventKey(client?) {
  try {
    const {
      resolveStarWarsEventConfig,
    } = require("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventConfig") as typeof import("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
    const cfg = resolveStarWarsEventConfig(client);
    return String(cfg?.eventKey || "starwars_2026").trim() || "starwars_2026";
  } catch (_) {
    return "starwars_2026";
  }
}

/** Wallet SW sempre sul main (anche se il comando arriva dal server test). */
function walletGuildId(client?, fallbackGuildId?) {
  try {
    const IDs = require(path.join(viniliRoot, "Config/ids"));
    const fromCfg = normalizeId(client?.config?.mainGuildId);
    if (fromCfg) return fromCfg;
    const main = normalizeId(IDs.guilds?.main);
    if (main) return main;
  } catch (_) {}
  return normalizeId(fallbackGuildId);
}

function formatCreditsDiscord(amount?) {
  const n = safeInt(amount);
  return `${CREDITI_EMOJI} **${n.toLocaleString("it-IT")}**`;
}

function formatCreditsPlain(amount?) {
  const n = safeInt(amount);
  const label = n === 1 ? "Credito" : "Crediti";
  return `${n.toLocaleString("it-IT")} ${label}`;
}

function formatCreditsShort(amount?) {
  return `${safeInt(amount).toLocaleString("it-IT")} Crediti`;
}

async function getCreditsBalance(guildId?, userId?, client?) {
  const g = walletGuildId(client, guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return 0;
  try {
    const {
      getStarWarsWallet,
    } = require("../../../../../starwars/src/Vinili/Services/Community/starWarsEventWalletService") as typeof import("../../../../../starwars/src/Vinili/Services/Community/starWarsEventWalletService");
    const wallet = await getStarWarsWallet(g, u, eventKey(client));
    return safeInt(wallet?.credits);
  } catch (_) {
    return 0;
  }
}

async function addCredits({ client = null, guildId, userId, amount, reason = "economy" }) {
  const g = walletGuildId(client, guildId);
  const u = normalizeId(userId);
  const amt = safeInt(amount);
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input" };
  try {
    const {
      grantStarWarsReward,
    } = require("../../../../../starwars/src/Vinili/Services/Community/starWarsRewardsService") as typeof import("../../../../../starwars/src/Vinili/Services/Community/starWarsRewardsService");
    const out = await grantStarWarsReward(client, {
      guildId: g,
      userId: u,
      reason: String(reason || "economy").slice(0, 120),
      grant: { credits: amt },
      minigameCreditBuff: false,
    });
    if (!out?.ok) {
      return {
        ok: false,
        code: out?.error === "not_sorted" ? "not_sorted" : out?.error || "save_failed",
        message: out?.message || "Impossibile accreditare i crediti.",
      };
    }
    const balance = safeInt(out?.wallet?.credits);
    return {
      ok: true,
      currency: CURRENCY_CREDITI,
      amount: amt,
      balance,
      state: { crediti: { balance } },
    };
  } catch (err) {
    return { ok: false, code: "save_failed", message: err?.message || "save_failed" };
  }
}

async function spendCredits({ client = null, guildId, userId, amount, reason = "economy" }) {
  const g = walletGuildId(client, guildId);
  const u = normalizeId(userId);
  const amt = safeInt(amount);
  if (!isValidGuildUserId(g, u) || amt < 1) return { ok: false, code: "bad_input" };

  const before = await getCreditsBalance(g, u, client);
  if (before < amt) {
    return { ok: false, code: "insufficient_funds", balance: before, currency: CURRENCY_CREDITI };
  }

  const key = eventKey(client);
  const nowIso = new Date().toISOString();
  const peiGain = amt / 100000;
  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u, [`${ROOT}.credits`]: { $gte: amt } },
    {
      $inc: {
        [`${ROOT}.credits`]: -amt,
        [`${ROOT}.creditsVolume`]: amt,
        ...(peiGain > 0 ? { [`${ROOT}.pei`]: peiGain } : {}),
      },
      $set: { [`${ROOT}.updatedAt`]: nowIso, [`${ROOT}.eventKey`]: key },
    },
    { new: true },
  ).catch(() => null);

  if (!updated) {
    const bal = await getCreditsBalance(g, u, client);
    return { ok: false, code: bal >= amt ? "save_failed" : "insufficient_funds", balance: bal, currency: CURRENCY_CREDITI };
  }

  const credits = safeInt(updated?.profile?.events?.starwars?.credits);
  return {
    ok: true,
    currency: CURRENCY_CREDITI,
    amount: amt,
    balance: credits,
    reason: String(reason || "").slice(0, 160),
    state: { crediti: { balance: credits } },
  };
}

export = {
  CREDITI_EMOJI,
  CURRENCY_CREDITI,
  ROOT,
  addCredits,
  eventKey,
  formatCreditsDiscord,
  formatCreditsPlain,
  formatCreditsShort,
  getCreditsBalance,
  spendCredits,
  walletGuildId,
};
