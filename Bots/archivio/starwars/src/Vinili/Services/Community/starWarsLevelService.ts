/**
 * Level-up evento SW: legge EXP evento, aggiorna pgLevel, assegna premi milestone.
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { ActivityUserProfile } = require(__eventCoreVinili("Community/schemas/communitySchemas"));
const { isValidGuildUserId } = require(__eventCoreVinili("../shared/db/validateWriteIds"));
const { resolveStarWarsEventConfig } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");
const { ADVENT_EVENT_KEY, CRATE_LABELS } = require("../../Utils/Eventi/starWarsAdventCatalog") as typeof import("../../Utils/Eventi/starWarsAdventCatalog");
const {
  levelFromEventExp,
  milestonesBetween,
  publicLevelProgress,
  publicLevelCatalog,
  rankTitleForLevel,
  MAX_LEVEL,
} = require("../../Utils/Eventi/starWarsLevelCatalog") as typeof import("../../Utils/Eventi/starWarsLevelCatalog");
const { ROOT, publicWallet } = require("./starWarsEventWalletService") as typeof import("./starWarsEventWalletService");

function normalizeId(v?) {
  return String(v || "").trim();
}
function safeInt(v?, fb = 0) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.max(0, n) : fb;
}

function peiFromCredits(credits?) {
  return safeInt(credits) / 100000;
}

/**
 * Dopo un grant EXP: sync pgLevel + claim automatico dei milestone raggiunti.
 * Idempotente via claimedLevelMilestones.
 */
async function applyStarWarsLevelProgress(
  client?,
  { guildId, userId }: { guildId?: string | null; userId?: string | null } = {},
) {
  const g = normalizeId(guildId);
  const u = normalizeId(userId);
  const cfg = resolveStarWarsEventConfig(client);
  const eventKey = cfg.eventKey || ADVENT_EVENT_KEY;
  if (!isValidGuildUserId(g, u)) return { ok: false, error: "bad_ids", leveled: [] };

  const doc = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(ROOT)
    .lean()
    .catch(() => null);
  const sw = doc?.profile?.events?.starwars || {};
  const exp = safeInt(sw.exp);
  const prevLevel = safeInt(sw.pgLevel);
  const newLevel = levelFromEventExp(exp);
  const claimed = Array.isArray(sw.claimedLevelMilestones)
    ? sw.claimedLevelMilestones.map((x?) => safeInt(x)).filter((n?) => n > 0)
    : [];
  const claimedSet = new Set(claimed);

  if (newLevel > prevLevel) {
    await ActivityUserProfile.updateOne(
      { guildId: g, userId: u },
      {
        $max: { [`${ROOT}.pgLevel`]: newLevel },
        $set: { [`${ROOT}.eventKey`]: eventKey, [`${ROOT}.updatedAt`]: new Date().toISOString() },
      },
    ).catch(() => null);
  }

  const due = milestonesBetween(0, newLevel).filter((m?) => !claimedSet.has(m.level));
  const leveled = [];

  for (const m of due) {
    const $inc: Record<string, any> = {};
    if (m.credits) {
      $inc[`${ROOT}.credits`] = m.credits;
      $inc[`${ROOT}.creditsVolume`] = m.credits;
      $inc[`${ROOT}.pei`] = peiFromCredits(m.credits);
    }
    for (const c of m.crates || []) {
      const id = normalizeId(c.id);
      const qty = Math.max(1, safeInt(c.qty, 1));
      if (id && CRATE_LABELS[id]) $inc[`${ROOT}.crates.${id}`] = qty;
    }
    const nowIso = new Date().toISOString();
    const updated = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId: g,
        userId: u,
        [`${ROOT}.claimedLevelMilestones`]: { $ne: m.level },
      },
      {
        $addToSet: { [`${ROOT}.claimedLevelMilestones`]: m.level },
        $max: { [`${ROOT}.pgLevel`]: Math.max(newLevel, m.level) },
        $inc,
        $set: {
          [`${ROOT}.eventKey`]: eventKey,
          [`${ROOT}.updatedAt`]: nowIso,
        },
        $push: {
          [`${ROOT}.rewardLog`]: {
            $each: [
              {
                at: nowIso,
                reason: `level_${m.level}`,
                level: m.level,
                title: m.title,
                credits: m.credits,
                crates: m.crates,
              },
            ],
            $slice: -40,
          },
        },
      },
      { new: true },
    ).catch(() => null);

    if (updated) {
      leveled.push({
        level: m.level,
        title: m.title,
        credits: m.credits,
        crates: m.crates.map((c?) => ({ id: c.id, qty: c.qty })),
      });
    }
  }

  const fresh = await ActivityUserProfile.findOne({ guildId: g, userId: u })
    .select(ROOT)
    .lean()
    .catch(() => null);
  const wallet = publicWallet(fresh?.profile?.events?.starwars, eventKey);

  return {
    ok: true,
    prevLevel,
    level: safeInt(wallet?.pgLevel, newLevel),
    title: rankTitleForLevel(safeInt(wallet?.pgLevel, newLevel)),
    leveled,
    wallet,
  };
}

export = {
  MAX_LEVEL,
  applyStarWarsLevelProgress,
  publicLevelProgress,
  publicLevelCatalog,
  levelFromEventExp,
  rankTitleForLevel,
};
