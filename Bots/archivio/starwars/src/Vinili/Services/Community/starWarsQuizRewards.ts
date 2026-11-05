/**
 * Premi vittoria minigame Star Wars (quiz + memory/findBot/hangman/…):
 * 50 exp (minigame) + 5.000 crediti a vittoria;
 * cassa Alpha ogni 10 vittorie cumulative (non streak).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { ADVENT_EVENT_KEY, CRATE_LABELS } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const { ROOT } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");

const QUIZ_CORRECT_PATH = `${ROOT}.quizCorrectTotal`;
const DEFAULT_CREDITS = 5000;
const DEFAULT_CRATE_EVERY = 10;
const DEFAULT_CRATE_ID = "alpha";

function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function normalizeId(v?) {
  return String(v || "").trim();
}

/**
 * Incrementa il totale vittorie minigame SW (cumulativo) e assegna crediti + eventuale cassa Alpha.
 * L'exp profilo (50) resta sul flusso minigame standard (rewardExp).
 */
async function grantStarWarsQuizWinRewards(
  client?,
  { guildId, userId, cfg = null }: { guildId?: string | null; userId?: string | null; cfg?: any } = {},
) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids" };

  const quizCfg = cfg?.starWarsQuiz && typeof cfg.starWarsQuiz === "object" ? cfg.starWarsQuiz : {};
  const credits = Math.max(0, safeInt(quizCfg.rewardCredits ?? DEFAULT_CREDITS, DEFAULT_CREDITS));
  const crateEvery = Math.max(1, safeInt(quizCfg.crateEvery ?? DEFAULT_CRATE_EVERY, DEFAULT_CRATE_EVERY));
  const crateId = normalizeId(quizCfg.crateId || DEFAULT_CRATE_ID);
  if (!CRATE_LABELS[crateId]) {
    return { ok: false, error: "bad_crate" };
  }

  const eventCfg = resolveStarWarsEventConfig(client);
  const eventKey = eventCfg.eventKey || ADVENT_EVENT_KEY;
  const nowIso = new Date().toISOString();

  const updated = await ActivityUserProfile.findOneAndUpdate(
    { guildId: g, userId: u },
    {
      $inc: { [QUIZ_CORRECT_PATH]: 1 },
      $set: {
        [`${ROOT}.eventKey`]: eventKey,
        [`${ROOT}.updatedAt`]: nowIso,
      },
      $setOnInsert: { guildId: g, userId: u },
    },
    { upsert: true, new: true },
  )
    .select(QUIZ_CORRECT_PATH)
    .lean()
    .catch(() => null);

  const quizCorrectTotal = safeInt(updated?.profile?.events?.starwars?.quizCorrectTotal);
  const grantsCrate = quizCorrectTotal > 0 && quizCorrectTotal % crateEvery === 0;

  const eventExp = Math.max(0, safeInt(quizCfg.rewardExp ?? 50, 50));
  const grant: Record<string, any> = { credits, exp: eventExp };
  if (grantsCrate) {
    grant.crateId = crateId;
    grant.crateQty = 1;
  }

  const { grantStarWarsMinigameWinReward } = require("./starWarsRewardsService") as typeof import("./starWarsRewardsService");
  const out = await grantStarWarsMinigameWinReward(client, {
    guildId: g,
    userId: u,
    reason: grantsCrate ? "starwars_quiz_crate" : "starwars_quiz",
    grant,
  });

  return {
    ok: Boolean(out?.ok),
    credits,
    sideCredits: out?.sideWin?.credits || 0,
    bankCredits: out?.sideWin?.bankCredits || 0,
    crateId: grantsCrate ? crateId : null,
    crateQty: grantsCrate ? 1 : 0,
    quizCorrectTotal,
    crateEvery,
    untilNextCrate: grantsCrate ? crateEvery : crateEvery - (quizCorrectTotal % crateEvery),
    error: out?.ok ? null : out?.error || "grant_failed",
  };
}

export = {
  DEFAULT_CREDITS,
  DEFAULT_CRATE_EVERY,
  DEFAULT_CRATE_ID,
  grantStarWarsQuizWinRewards,
};
