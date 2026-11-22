/**
 * Wordle sito: EXP casuale per tentativi (classic + quattro).
 * Claim atomico per giorno/modalità — login + membro del server principale.
 */
"use strict";

const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { addExpWithLevel } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");

/** Range EXP per tentativo (classic: 1–6). Più veloce = più EXP. */
const CLASSIC_RANGES: Record<number, [number, number]> = {
  1: [200, 260],
  2: [160, 210],
  3: [120, 170],
  4: [90, 130],
  5: [55, 95],
  6: [30, 60],
};

/** Quattro: tentativi totali usati (4–9). */
const QUAD_RANGES: Record<number, [number, number]> = {
  4: [420, 520],
  5: [340, 440],
  6: [260, 360],
  7: [190, 280],
  8: [120, 200],
  9: [70, 140],
};

function bearer(raw?) {
  const v = String(raw || "").trim();
  return v.toLowerCase().startsWith("bearer ") ? v.slice(7).trim() : v;
}

function rollInRange(min?, max?) {
  const a = Math.max(0, Math.floor(Number(min) || 0));
  const b = Math.max(a, Math.floor(Number(max) || 0));
  return a + Math.floor(Math.random() * (b - a + 1));
}

function classicRange(attempts?) {
  const n = Math.min(6, Math.max(1, Math.floor(Number(attempts) || 6)));
  return CLASSIC_RANGES[n] || CLASSIC_RANGES[6];
}

function quadRange(attempts?) {
  const n = Math.min(9, Math.max(4, Math.floor(Number(attempts) || 9)));
  return QUAD_RANGES[n] || QUAD_RANGES[9];
}

function previewClassic() {
  /** @type {Record<string, { min: number, max: number }>} */
  const byAttempts: Record<string, any> = {};
  for (const [k, [min, max]] of Object.entries(CLASSIC_RANGES)) {
    byAttempts[k] = { min, max };
  }
  return {
    mode: "classic",
    byAttempts,
    maxPossible: CLASSIC_RANGES[1][1],
    minPossible: CLASSIC_RANGES[6][0],
  };
}

function previewQuad() {
  /** @type {Record<string, { min: number, max: number }>} */
  const byAttempts: Record<string, any> = {};
  for (const [k, [min, max]] of Object.entries(QUAD_RANGES)) {
    byAttempts[k] = { min, max };
  }
  return {
    mode: "quad",
    byAttempts,
    maxPossible: QUAD_RANGES[4][1],
    minPossible: QUAD_RANGES[9][0],
  };
}

/**
 * @returns {Promise<{ kind: "guest"|"outsider"|"member", auth?: any }>}
 */
async function resolveWordleAuth(client?, req?) {
  const token = bearer(req?.headers?.authorization);
  if (!token) return { kind: "guest" };
  const resolved = await resolveWebsiteGuildMember(client, token).catch(() => null);
  if (resolved?.ok) return { kind: "member", auth: resolved };
  if (resolved?.error === "not_in_guild") return { kind: "outsider" };
  return { kind: "guest" };
}

async function loadClaim(guildId?, userId?, mode?, day?) {
  if (!guildId || !userId || !mode || !day) return null;
  const doc = await ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select("profile.siteWordleExpClaims")
    .lean()
    .catch(() => null);
  const bucket = doc?.profile?.siteWordleExpClaims?.[mode];
  const entry = bucket && typeof bucket === "object" ? bucket[String(day)] : null;
  return entry && typeof entry === "object" ? entry : null;
}

/**
 * Claim atomico + addExp. Solo vittoria, 1 volta/giorno/modalità.
 * @returns {{ ok: true, exp: number, already?: boolean } | { ok: false, error: string }}
 */
async function claimWordleExp(opts?) {
  const guild = opts?.guild;
  const member = opts?.member;
  const userId = String(opts?.userId || member?.id || "").trim();
  const guildId = String(guild?.id || "").trim();
  const mode = opts?.mode === "quad" ? "quad" : "classic";
  const day = String(opts?.day || "").slice(0, 12);
  const attempts = Math.floor(Number(opts?.attempts) || 0);
  const lang = String(opts?.lang || "it").slice(0, 2);
  const client = opts?.client || null;

  if (!guild || !userId || !day || attempts < 1) {
    return { ok: false, error: "bad_request" };
  }

  const [min, max] = mode === "quad" ? quadRange(attempts) : classicRange(attempts);
  const exp = rollInRange(min, max);
  if (!(exp > 0)) return { ok: false, error: "no_exp" };

  await ActivityUserProfile.updateOne(
    { guildId, userId },
    { $setOnInsert: { guildId, userId } },
    { upsert: true },
  ).catch(() => null);

  const path = `profile.siteWordleExpClaims.${mode}.${day}`;
  const claimed = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId,
      userId,
      $or: [{ [path]: null }, { [path]: { $exists: false } }],
    },
    {
      $set: {
        [path]: {
          exp,
          attempts,
          lang,
          at: new Date(),
        },
      },
    },
    { new: true },
  ).catch(() => null);

  if (!claimed) {
    const prev = await loadClaim(guildId, userId, mode, day);
    if (prev) {
      return { ok: true, exp: Number(prev.exp) || 0, already: true, attempts: Number(prev.attempts) || attempts };
    }
    return { ok: false, error: "claim_failed" };
  }

  await addExpWithLevel(guild, userId, exp, false, true, {
    source: mode === "quad" ? "site_wordle_quad" : "site_wordle",
    note: `Wordle ${mode} ${day} · ${attempts} tent.`,
  }).catch(() => null);

  try {
    if (client && member) {
      const { handleExpReward } = require("../../Minigames/services/minigameRewards") as typeof import("../../Minigames/services/minigameRewards");
      const doc = await ActivityUserProfile.findOne({ guildId, userId })
        .select("profile.totals.exp.minigame.totalExp profile.totals.exp.totalExp")
        .lean()
        .catch(() => null);
      const totalMini = Number(doc?.profile?.totals?.exp?.minigame?.totalExp || 0);
      if (totalMini > 0) await handleExpReward(client, member, totalMini).catch(() => null);
    }
  } catch (_) {}

  return { ok: true, exp, already: false, attempts };
}

function rewardMeta(opts?) {
  const kind = opts?.kind || "guest";
  const mode = opts?.mode === "quad" ? "quad" : "classic";
  const preview = mode === "quad" ? previewQuad() : previewClassic();
  const claimed = opts?.claimed || null;
  return {
    auth: kind,
    eligible: kind === "member",
    needsLogin: kind === "guest",
    needsJoin: kind === "outsider",
    claimed: Boolean(claimed),
    expAwarded: claimed ? Number(claimed.exp) || 0 : null,
    preview,
  };
}

export = {
  CLASSIC_RANGES,
  QUAD_RANGES,
  classicRange,
  quadRange,
  previewClassic,
  previewQuad,
  resolveWordleAuth,
  loadClaim,
  claimWordleExp,
  rewardMeta,
  bearer,
};
