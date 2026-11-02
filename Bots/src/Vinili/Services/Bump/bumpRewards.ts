/** Bump e voti: EXP di ricompensa. */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");

const DEFAULT_REWARD = {
  disboard: { baseExp: 80, fastGuess: { windowMs: 5 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
  discadia_bump: { baseExp: 0, fastGuess: { windowMs: 0, multiplier: 1 }, streak: { bonusPercentPerWin: 0, maxBonusPercent: 0 } },
  discadia_vote: { baseExp: 150, fastGuess: { windowMs: 15 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
};

function getRewardConfig(client?, source?) {
  const base = DEFAULT_REWARD[source] || { baseExp: 100, fastGuess: { windowMs: 15 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } };
  if (source === "disboard" && client?.config?.disboard?.reward) {
    return { ...base, ...client.config.disboard.reward };
  }
  if (source === "discadia_bump" && client?.config?.discadia?.reward) {
    return { ...base, ...client.config.discadia.reward };
  }
  if (source === "discadia_vote" && client?.config?.discadiaVoteReminder?.reward) {
    return { ...base, ...client.config.discadiaVoteReminder.reward };
  }
  return base;
}

async function awardBumpVoteExp(client?, guild?, userId?, source?, previousLastAt?, cooldownMs?, baseExpOverride?, fastSinceAt = null, previousLastUserId = null) {
  if (String(source || "") === "discadia_bump") return null;
  if (!guild?.id || !userId) return null;
  const now = Date.now();
  const lastSlotAt = previousLastAt ? new Date(previousLastAt).getTime() : 0;
  const fastRefAt = fastSinceAt ? new Date(fastSinceAt).getTime() : lastSlotAt;
  const cfg = getRewardConfig(client, source);
  const baseExp = Number(baseExpOverride) > 0 ? Number(baseExpOverride) : (Number(cfg?.baseExp ?? 100) || 100);
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 15 * 60 * 1000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFast = windowMs > 0 && fastRefAt > 0 && (now - fastRefAt) <= windowMs;
  const fastBonus = isFast ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  const guildId = String(guild.id);
  const sourceKey = String(source || "");
  const profile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.bumpVoteRewards")
    .lean()
    .catch(() => null);
  const rewardDoc = profile?.profile?.totals?.exp?.bumpVoteRewards?.[sourceKey] || null;
  const prevStreak = Number(rewardDoc?.currentStreak ?? 0);
  const graceMs = Math.max(0, Math.min(cooldownMs, Number(streakCfg.graceMs ?? 30 * 60 * 1000) || 0));
  const sameUserAsPrevious = previousLastUserId ? String(previousLastUserId) === String(userId) : true;
  const deltaMs = lastSlotAt > 0 ? (now - lastSlotAt) : 0;
  const earlySlackMs = Math.max(0, Math.min(cooldownMs, Number(streakCfg.earlySlackMs ?? 5 * 60 * 1000) || 0));
  const didPreviousSlot =
    sameUserAsPrevious &&
    lastSlotAt > 0 &&
    deltaMs >= Math.max(0, cooldownMs - earlySlackMs) &&
    deltaMs <= (cooldownMs + graceMs);
  const newStreak = didPreviousSlot ? prevStreak + 1 : 1;
  const bestStreak = Math.max(Number(rewardDoc?.bestStreak ?? 0), newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round((baseExp * streakBonusPercent) / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: {
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.lastActionAt`]: new Date(),
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.currentStreak`]: newStreak,
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.bestStreak`]: bestStreak,
      },
      $inc: { [`profile.totals.exp.bumpVoteRewards.${sourceKey}.totalExpAwarded`]: effectiveExp },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const member = await getGuildMemberCached(guild, userId);
  const ignoreExp = await shouldIgnoreExpForMember({ guildId, member, channelId: null });
  if (!ignoreExp) {
    await addExpWithLevel(guild, userId, effectiveExp, false, true).catch(() => {});
  }
  return { baseExp, fastBonus, streakBonus, effectiveExp, newStreak, bestStreak, isFast };
}

export = { awardBumpVoteExp };
