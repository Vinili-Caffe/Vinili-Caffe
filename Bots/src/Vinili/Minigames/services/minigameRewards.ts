/** Minigiochi: premi (exp, serie di vittorie, risposta veloce, ruoli premio, caramelle di Halloween). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { addExpWithLevel, shouldIgnoreExpForMember, incrementMinigameWinCounters } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { EXP_REWARDS, buildRewardEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp } = require("./minigameText") as typeof import("./minigameText");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");

const REWARD_CHANNEL_ID = IDs.channels.commands;

function getHighestEligibleReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of EXP_REWARDS) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

async function handleExpReward(client?, member?, totalExp?) {
  if (!member?.guild) return;
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => { });

  const rewardChannel = await getChannelCached(client, REWARD_CHANNEL_ID);
  if (!rewardChannel) return;
  await sendMinigameMessage(rewardChannel, {
      content: `${member}`,
      embeds: [buildRewardEmbed(member, reward, totalExp)],
    })
    .catch(() => { });
}

async function computeMinigameAwardForUser({ guildId, userId, cfg, baseExp, startedAt, client = null, gameType = "" }) {
  const baseExpNorm = normalizeRewardExp(baseExp || 0);
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExpNorm * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.minigame")
    .lean()
    .catch(() => null);
  const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
  const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExpNorm * streakBonusPercent / 100);
  const effectiveExp = baseExpNorm + fastBonus + streakBonus;
  try {
    doc = await incrementMinigameWinCounters(guildId, userId, effectiveExp, newStreak, bestStreak);
  } catch (err) {
    warnMinigame(err);
  }
  if (client) {
    const { scheduleRoyaleMinigameRoleSync } = require("../../Services/Community/weeklyActivityWinnersService") as typeof import("../../Services/Community/weeklyActivityWinnersService");
    scheduleRoyaleMinigameRoleSync(client);
  }
  const nextTotal = Number(doc?.profile?.totals?.exp?.minigame?.totalExp ?? 0);
  ActivityUserProfile.updateMany(
    { guildId, userId: { $ne: userId } },
    { $set: { "profile.totals.exp.minigame.currentStreak": 0 } },
  ).catch((err?) => warnMinigame(err));
  const hasDetails = fastBonus > 0 || streakBonus > 0;
  const details = hasDetails
    ? {
      baseExp: baseExpNorm,
      fastBonus,
      streakBonus,
      newStreak,
      bestStreak,
    }
    : null;
  return { baseExp: baseExpNorm, effectiveExp, nextTotal, details, newStreak, bestStreak };
}

/**
 * Piccola chance di caramella su vittoria minigame (non TOT/caccia).
 * Stesso meccanismo unica + pass-along se collezione completa.
 */
async function maybeRollHalloweenCandyDrop(_opts?) {
  return null;
}

function mergeHalloweenCandyDropIntoMessage(basePayload?, award?, winnerUserId?) {
  const drop = award?.halloweenCandyDrop;
  if (!drop) return basePayload || {};
  const out = { ...(basePayload || {}) };
  const embeds = Array.isArray(out.embeds) ? out.embeds.slice() : [];
  const components = Array.isArray(out.components) ? out.components.slice() : [];
  if (drop.unlock?.embeds?.length) embeds.push(...drop.unlock.embeds);
  if (drop.unlock?.components?.length) components.push(...drop.unlock.components);
  out.embeds = embeds;
  if (components.length) out.components = components;
  if (drop.code === "passed_along" && drop.passedToUserId) {
    const line = `🍬 <@${winnerUserId}> ha il sacchetto pieno — la caramella passa a <@${drop.passedToUserId}>!`;
    out.content = out.content ? `${out.content}\n${line}` : line;
    const users = new Set([
      ...(out.allowedMentions?.users || []),
      String(winnerUserId || "").trim(),
      String(drop.passedToUserId),
    ].filter(Boolean));
    out.allowedMentions = { ...(out.allowedMentions || {}), users: [...users] };
  }
  return out;
}

async function awardMinigameWinToUser({
  client,
  guild,
  userId,
  cfg,
  game,
  rewardExp,
  channelId = null,
}: Record<string, any>) {
  const baseExp = normalizeRewardExp(rewardExp || 0);
  const startedAt = game?.startedAt ?? 0;
  const elapsed = typeof startedAt === "number" ? Date.now() - startedAt : Infinity;
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 30000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFastGuess = windowMs > 0 && elapsed <= windowMs;
  const fastBonus = isFastGuess ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  let doc = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
    .select("profile.totals.exp.minigame")
    .lean()
    .catch(() => null);
  const prevStreak = Number(doc?.profile?.totals?.exp?.minigame?.currentStreak ?? 0);
  const prevBest = Number(doc?.profile?.totals?.exp?.minigame?.bestStreak ?? 0);
  const newStreak = prevStreak + 1;
  const bestStreak = Math.max(prevBest, newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round(baseExp * streakBonusPercent / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  try {
    doc = await incrementMinigameWinCounters(guild.id, userId, effectiveExp, newStreak, bestStreak);
  } catch (err) {
    warnMinigame(err);
  }
  if (client) {
    const { scheduleRoyaleMinigameRoleSync } = require("../../Services/Community/weeklyActivityWinnersService") as typeof import("../../Services/Community/weeklyActivityWinnersService");
    scheduleRoyaleMinigameRoleSync(client);
  }
  const nextTotal = Number(doc?.profile?.totals?.exp?.minigame?.totalExp ?? 0);
  ActivityUserProfile.updateMany(
    { guildId: guild.id, userId: { $ne: userId } },
    { $set: { "profile.totals.exp.minigame.currentStreak": 0 } },
  ).catch((err?) => warnMinigame(err));
  const member = await getGuildMemberCached(guild, userId, { ttlMs: 20_000 }).catch(() => null);
  const ignoreExp = await shouldIgnoreExpForMember({
    guildId: guild.id,
    member,
    channelId: channelId || cfg?.channelId || null,
  });
  if (!ignoreExp) {
    try {
      await addExpWithLevel(guild, userId, effectiveExp, false, true);
    } catch (err) {
      warnMinigame(err);
    }
  }
  const hasDetails = fastBonus > 0 || streakBonus > 0;
  const details = hasDetails
    ? {
      baseExp,
      fastBonus,
      streakBonus,
      newStreak,
      bestStreak,
    }
    : null;
  const halloweenCandyDrop = await maybeRollHalloweenCandyDrop({
    client,
    guild,
    userId,
    cfg,
    game,
  });
  return { effectiveExp, nextTotal, details, member, halloweenCandyDrop };
}

export = { handleExpReward, computeMinigameAwardForUser, mergeHalloweenCandyDropIntoMessage, awardMinigameWinToUser };
