/** Minigiochi: premi (exp, serie di vittorie, risposta veloce, ruoli premio, caramelle di Halloween, quiz SW). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { addExpWithLevel, shouldIgnoreExpForMember, incrementMinigameWinCounters } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { buildRewardEmbed } = require("./minigameEmbeds") as typeof import("./minigameEmbeds");
const { currentMinigameRewards } = require("./minigameEmbedShared") as typeof import("./minigameEmbedShared");
const { getChannelCached } = require("./minigameUtils") as typeof import("./minigameUtils");
const { normalizeRewardExp } = require("./minigameText") as typeof import("./minigameText");
const { sendMinigameMessage } = require("./minigameDiscord") as typeof import("./minigameDiscord");

const REWARD_CHANNEL_ID = IDs.channels.commands;

function getHighestEligibleReward(totalExp?) {
  const expValue = Number(totalExp || 0);
  let best = null;
  for (const reward of currentMinigameRewards()) {
    if (expValue >= reward.exp) best = reward;
  }
  return best;
}

async function handleExpReward(client?, member?, totalExp?) {
  if (!member?.guild) return;
  let levelsCfg: any = null;
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    levelsCfg = await LVL.getConfig(String(member.guild.id));
  } catch (_) {}
  const reward = getHighestEligibleReward(totalExp);
  if (!reward) return;
  if (member.roles.cache.has(reward.roleId)) return;

  await member.roles.add(reward.roleId).catch(() => { });

  const channelId =
    (levelsCfg?.minigameRewardChannelId && String(levelsCfg.minigameRewardChannelId)) || REWARD_CHANNEL_ID;
  const rewardChannel = await getChannelCached(client, channelId);
  if (!rewardChannel) return;

  /* messaggio premio da Livelli se seedato e draft non vuoto */
  try {
    const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
    const draft = levelsCfg?.minigameRewardDraft;
    if (levelsCfg && (levelsCfg.userSaved || levelsCfg.seedVersion > 0) && draft && !T.draftIsEmpty?.(draft)) {
      const { getNextReward } = require("./minigameEmbedShared") as typeof import("./minigameEmbedShared");
      const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
      const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
      const next = getNextReward(totalExp);
      const remaining = next ? Math.max(0, next.exp - Number(totalExp || 0)) : 0;
      const vars = {
        user: `<@${member.id}>`,
        username: accountUsername(member),
        avatar: String(guildMemberDisplayAvatarUrlDynamic(member) || ""),
        role: `<@&${reward.roleId}>`,
        roleid: String(reward.roleId),
        exp: String(reward.exp),
        total: String(Math.floor(Number(totalExp) || 0)),
        next: next
          ? `Ti mancano **${remaining}** exp per la prossima ricompensa!`
          : "Hai raggiunto la ricompensa **massima**!",
        server: String(member.guild?.name || ""),
      };
      const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId: member.id });
      const outgoing = applyDefaultFooterToEmbeds(
        {
          content: body.content,
          embeds: body.embeds,
          components: body.components,
          flags: body.flags,
          allowedMentions: body.allowed_mentions,
        },
        member.guild,
      );
      await sendMinigameMessage(rewardChannel, outgoing).catch(() => null);
      return;
    }
  } catch (_) {}

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
    const { scheduleRoyaleMinigameRoleSync } = require("../../Community/services/weeklyActivityWinnersService") as typeof import("../../Community/services/weeklyActivityWinnersService");
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
    const { scheduleRoyaleMinigameRoleSync } = require("../../Community/services/weeklyActivityWinnersService") as typeof import("../../Community/services/weeklyActivityWinnersService");
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

  let starWarsQuizReward = null;
  try {
    const { countsTowardStarWarsEventWinRewards } = require("../../Minigames/utils/starWarsMinigameHooks") as typeof import("../../Minigames/utils/starWarsMinigameHooks");
    if (countsTowardStarWarsEventWinRewards(game?.type, cfg)) {
      const { grantStarWarsQuizWinRewards } = require("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards") as typeof import("../../../../archivio/starwars/src/Vinili/Services/Community/starWarsQuizRewards");
      starWarsQuizReward = await grantStarWarsQuizWinRewards(client, {
        guildId: guild.id,
        userId,
        cfg,
      });
    }
  } catch (err) {
    warnMinigame(err);
  }

  return { effectiveExp, nextTotal, details, member, halloweenCandyDrop, starWarsQuizReward, newStreak, bestStreak };
}

function mergeStarWarsQuizRewardIntoMessage(basePayload?, award?, winnerUserId?) {
  const sw = award?.starWarsQuizReward;
  if (!sw?.ok) return basePayload || {};
  const out = { ...(basePayload || {}) };
  const embeds = Array.isArray(out.embeds) ? out.embeds.slice() : [];
  if (embeds[0] && typeof embeds[0].data?.description === "string") {
    const extras = [];
    if (sw.credits > 0) {
      extras.push(`${E.VC_crediti} **+${Number(sw.credits).toLocaleString("it-IT")}** crediti evento`);
    }
    if (sw.sideCredits > 0 || sw.bankCredits > 0) {
      extras.push(
        `${E.VC_crediti} **+${Number(sw.sideCredits || 0)}** personali · **+${Number(sw.bankCredits || 0)}** banca fazione`,
      );
    }
    if (sw.crateId && sw.crateQty > 0) {
      try {
        const { formatCrateMention } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis") as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis");
        extras.push(
          `+${formatCrateMention(sw.crateId, sw.crateQty, { open: true })} (${sw.quizCorrectTotal}ª vittoria)`,
        );
      } catch (_) {
        extras.push(`**+${sw.crateQty} Cassa Alpha** (${sw.quizCorrectTotal}ª vittoria)`);
      }
    } else if (sw.untilNextCrate > 0) {
      try {
        const { formatCrateMention } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis") as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis");
        extras.push(`${formatCrateMention("alpha")} tra **${sw.untilNextCrate}** vittorie`);
      } catch (_) {
        extras.push(`Cassa Alpha tra **${sw.untilNextCrate}** vittorie`);
      }
    }
    if (extras.length) {
      const desc = `${embeds[0].data.description}\n\n${extras.join("\n")}`;
      embeds[0] = EmbedBuilder.from(embeds[0]).setDescription(desc);
    }
  } else if (sw.credits > 0 || sw.crateId) {
    const bits = [];
    if (sw.credits > 0) bits.push(`${E.VC_crediti} +${Number(sw.credits).toLocaleString("it-IT")} crediti`);
    if (sw.crateId) {
      try {
        const { formatCrateMention } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis") as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsCrateEmojis");
        bits.push(`+${formatCrateMention(sw.crateId, 1, { open: true })}`);
      } catch (_) {
        bits.push(`+Cassa Alpha`);
      }
    }
    const line = `🌌 <@${winnerUserId}>: ${bits.join(" · ")}`;
    out.content = out.content ? `${out.content}\n${line}` : line;
  }
  out.embeds = embeds;
  return out;
}

export = {
  handleExpReward,
  computeMinigameAwardForUser,
  mergeHalloweenCandyDropIntoMessage,
  mergeStarWarsQuizRewardIntoMessage,
  awardMinigameWinToUser,
};
