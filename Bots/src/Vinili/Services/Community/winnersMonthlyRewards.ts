/** Vincitori attività: premi del mese (top attività e top votanti). */
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");
const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { previousMonthKeyRome } = require("./winnersTime") as typeof import("./winnersTime");
const { WEEKLY_WINNERS_EXCLUDED_ROLE_IDS, resolveTopThreeUsers } = require("./winnersRows") as typeof import("./winnersRows");
const { MONTHLY_MEMBER_ROLE_ID } = require("./winnersRoles") as typeof import("./winnersRoles");

const TROPHY_LABELS = ["<:VC_Podio1:1482694399283433582>", "<:VC_Podio2:1482694424411635712>", "<:VC_Podio3:1482694450806259744>"];
const MONTHLY_VOTER_ROLE_RANK_1 = IDs.roles.VIPplus || IDs.roles["VIP+"];
const MONTHLY_VOTER_ROLE_RANK_2 = IDs.roles.VIP;
const MONTHLY_VOTER_ROLE_RANK_3 = IDs.roles.Donator;
const MONTHLY_VOTER_REWARD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_VOTER_REWARD_PATH = "profile.totals.exp.monthlyVoteTopReward";
const MONTHLY_TOP_REWARD_ROLE_RANK_2 = IDs.roles.VIPplus || IDs.roles["VIP+"];
const MONTHLY_TOP_REWARD_ROLE_RANK_3 = IDs.roles.VIP;
const MONTHLY_TOP_REWARD_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MONTHLY_TOP_REWARD_PATH = "profile.totals.exp.monthlyTopReward";
const MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED = Object.freeze({ year: 2026, month: 6 });

async function resolvePreviousMonthTopVoters(client?, guild?) {
  const monthKey = previousMonthKeyRome(new Date());
  const docs = await ActivityUserProfile.find({
    guildId: guild.id,
    $or: [
      {
        "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountMonthKey": monthKey,
        $or: [
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountTopgg": { $gt: 0 } },
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.voteCountDiscadia": { $gt: 0 } },
        ],
      },
      {
        "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountMonthKey": monthKey,
        $or: [
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountTopgg": { $gt: 0 } },
          { "profile.totals.exp.bumpVoteRewards.discadia_vote.prevVoteCountDiscadia": { $gt: 0 } },
        ],
      },
    ],
  })
    .select("userId profile.totals.exp.bumpVoteRewards.discadia_vote")
    .lean()
    .catch(() => []);
  const sorted = docs
    .map((doc?) => {
      const vote = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {};
      const activeMatches = String(vote.voteCountMonthKey || "") === monthKey;
      const snapshotMatches = String(vote.prevVoteCountMonthKey || "") === monthKey;
      const total = activeMatches
        ? Math.max(0, Number(vote.voteCountTopgg || 0)) + Math.max(0, Number(vote.voteCountDiscadia || 0))
        : snapshotMatches
          ? Math.max(0, Number(vote.prevVoteCountTopgg || 0)) + Math.max(0, Number(vote.prevVoteCountDiscadia || 0))
          : 0;
      return { ...doc, _voteTotal: total };
    })
    .filter((doc?) => Number(doc?._voteTotal || 0) > 0)
    .sort((a?, b?) => Number(b._voteTotal || 0) - Number(a._voteTotal || 0))
    .slice(0, 200);
  return resolveTopThreeUsers(
    client,
    guild,
    sorted,
    (doc?) => Number(doc?._voteTotal || 0),
    3,
    WEEKLY_WINNERS_EXCLUDED_ROLE_IDS,
  );
}

function monthlyVoterRewardRoleByRank(rankIndex?) {
  if (rankIndex === 0) return MONTHLY_VOTER_ROLE_RANK_1;
  if (rankIndex === 1) return MONTHLY_VOTER_ROLE_RANK_2;
  if (rankIndex === 2) return MONTHLY_VOTER_ROLE_RANK_3;
  return null;
}

async function cleanupExpiredMonthlyVoterRewards(guild?) {
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_VOTER_REWARD_PATH} ${MONTHLY_TOP_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyVoteTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByTopReward = hasActiveMonthlyTopRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByTopReward) {
      const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      if (member?.roles?.cache?.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      { $unset: { [MONTHLY_VOTER_REWARD_PATH]: "" } },
    ).catch(() => null);
  }
}

async function assignMonthlyVoterRewards(guild?, ranking?) {
  const now = Date.now();
  for (let i = 0; i < Math.min(3, Array.isArray(ranking) ? ranking.length : 0); i += 1) {
    const row = ranking[i];
    const userId = String(row?.userId || "");
    const roleId = String(monthlyVoterRewardRoleByRank(i) || "");
    if (!userId || !roleId) continue;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) continue;
    const existing = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
      .select(MONTHLY_VOTER_REWARD_PATH)
      .lean()
      .catch(() => null);
    const existingReward = existing?.profile?.totals?.exp?.monthlyVoteTopReward || null;
    const existingRoleId = String(existingReward?.roleId || "");
    const existingHadRoleBefore = Boolean(existingReward?.hadRoleBefore);
    if (existingRoleId && existingRoleId !== roleId && !existingHadRoleBefore && member.roles.cache.has(existingRoleId)) {
      await member.roles.remove(existingRoleId).catch(() => null);
    }
    const hadRoleBefore = member.roles.cache.has(roleId);
    if (!hadRoleBefore) {
      await member.roles.add(roleId).catch(() => null);
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      {
        $set: {
          [`${MONTHLY_VOTER_REWARD_PATH}.rank`]: i + 1,
          [`${MONTHLY_VOTER_REWARD_PATH}.roleId`]: roleId,
          [`${MONTHLY_VOTER_REWARD_PATH}.awardedAt`]: new Date(now),
          [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: new Date(now + MONTHLY_VOTER_REWARD_DURATION_MS),
          [`${MONTHLY_VOTER_REWARD_PATH}.hadRoleBefore`]: hadRoleBefore,
          [`${MONTHLY_VOTER_REWARD_PATH}.monthKey`]: voteCountMonthKeyRome(new Date(now)),
        },
      },
    ).catch(() => null);
  }
}

function rankedMonthOrdinal(year?, month?) {
  return Number(year) * 12 + Number(month);
}

function usesNewMonthlyTopActivityRewards(rankedYear?, rankedMonth?) {
  const y = Number(rankedYear);
  const m = Number(rankedMonth);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return true;
  return rankedMonthOrdinal(y, m) >= rankedMonthOrdinal(
    MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED.year,
    MONTHLY_TOP_NEW_REWARDS_FIRST_RANKED.month,
  );
}

function monthlyTopVipPlusMention() {
  const roleId = String(MONTHLY_TOP_REWARD_ROLE_RANK_2 || "");
  return roleId ? `<@&${roleId}>` : "**VIP+**";
}

function monthlyPrizeTicketRef() {
  return siteTicketsPageDiscordRef("HIGH STAFF");
}

function buildMonthlyTopPrizeEmbedLines(displayTopCombined?, rankedYear?, rankedMonth?) {
  const t0 = TROPHY_LABELS[0] || "<:VC_Podio1:1482694399283433582>";
  const t1 = TROPHY_LABELS[1] || "<:VC_Podio2:1482694424411635712>";
  const t2 = TROPHY_LABELS[2] || "<:VC_Podio3:1482694450806259744>";
  const arrow = "<a:VC_Arrow:1482706699365257397>";
  const first = displayTopCombined[0];
  const second = displayTopCombined[1];
  const third = displayTopCombined[2];
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    const vipPlus = monthlyTopVipPlusMention();
    return [
      first?.userId
        ? `${t0} <@${first.userId}> ${arrow} <@&${MONTHLY_MEMBER_ROLE_ID}> + **Nitro Boost**`
        : `${t0} Nessun vincitore`,
      second?.userId
        ? `${t1} <@${second.userId}> ${arrow} **Decorazione a scelta (max 15,99€)**`
        : `${t1} Nessun vincitore`,
      third?.userId
        ? `${t2} <@${third.userId}> ${arrow} ${vipPlus} **per 30 giorni**`
        : `${t2} Nessun vincitore`,
    ];
  }
  return [
    first?.userId
      ? `${t0} <@${first.userId}> ${arrow} <@&${MONTHLY_MEMBER_ROLE_ID}> + **Nitro Boost**`
      : `${t0} Nessun vincitore`,
    second?.userId
      ? `${t1} <@${second.userId}> ${arrow} **VIP+ (30 giorni) + Decorazione a scelta (max 15,99€)**`
      : `${t1} Nessun vincitore`,
    third?.userId
      ? `${t2} <@${third.userId}> ${arrow} **VIP (30 giorni) + Nitro Basic**`
      : `${t2} Nessun vincitore`,
  ];
}

function buildMonthlyTopWinnerAnnounceLines(awarded?, rankedYear?, rankedMonth?) {
  const ticketRef = monthlyPrizeTicketRef();
  const winnerTotal = Number(awarded?.topMonthlyWinner?.value || 0);
  const winnerMention = awarded?.topMonthlyWinner?.userId ? `<@${awarded.topMonthlyWinner.userId}>` : "Nessun vincitore";
  const secondTotal = Number(awarded?.monthlyTopSecond?.value || 0);
  const secondMention = awarded?.monthlyTopSecond?.userId ? `<@${awarded.monthlyTopSecond.userId}>` : null;
  const thirdTotal = Number(awarded?.monthlyTopThird?.value || 0);
  const thirdMention = awarded?.monthlyTopThird?.userId ? `<@${awarded.monthlyTopThird.userId}>` : null;
  let secondLine = "";
  let thirdLine = "";
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    const vipPlus = monthlyTopVipPlusMention();
    secondLine = secondMention
      ? `\n<:VC_Podio2:1482694424411635712> Con un totale di **${secondTotal} EXP**, ${secondMention} ottiene il secondo posto e riceve una **decorazione a scelta (max 15,99€)** riscattabile tramite ${ticketRef}.`
      : "";
    thirdLine = thirdMention
      ? `\n<:VC_Podio3:1482694450806259744> Con un totale di **${thirdTotal} EXP**, ${thirdMention} ottiene il terzo posto e riceve ${vipPlus} **per 30 giorni**.`
      : "";
  } else {
    secondLine = secondMention
      ? `\n<:VC_Podio2:1482694424411635712> Con un totale di **${secondTotal} EXP**, ${secondMention} ottiene il secondo posto e riceve **VIP+ per 30 giorni** e una **decorazione a scelta (max 15,99€)** riscattabile tramite ${ticketRef}.`
      : "";
    thirdLine = thirdMention
      ? `\n<:VC_Podio3:1482694450806259744> Con un totale di **${thirdTotal} EXP**, ${thirdMention} ottiene il terzo posto e riceve **VIP per 30 giorni** e un **Nitro Basic** riscattabile tramite ${ticketRef}.`
      : "";
  }
  return { winnerTotal, winnerMention, secondLine, thirdLine };
}

function monthlyTopRewardRoleByRank(rankIndex?, rankedYear?, rankedMonth?) {
  if (usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth)) {
    if (rankIndex === 2) return MONTHLY_TOP_REWARD_ROLE_RANK_2;
    return null;
  }
  if (rankIndex === 1) return MONTHLY_TOP_REWARD_ROLE_RANK_2;
  if (rankIndex === 2) return MONTHLY_TOP_REWARD_ROLE_RANK_3;
  return null;
}

function hasActiveMonthlyTopRewardOnRole(profile?, roleId?, now = Date.now()) {
  const role = String(roleId || "");
  if (!role) return false;
  const reward = profile?.profile?.totals?.exp?.monthlyTopReward || null;
  if (String(reward?.roleId || "") !== role) return false;
  const expiresAt = Number(new Date(reward?.expiresAt || 0).getTime() || 0);
  return expiresAt > now;
}

function hasActiveMonthlyVoterRewardOnRole(profile?, roleId?, now = Date.now()) {
  const role = String(roleId || "");
  if (!role) return false;
  const reward = profile?.profile?.totals?.exp?.monthlyVoteTopReward || null;
  if (String(reward?.roleId || "") !== role) return false;
  const expiresAt = Number(new Date(reward?.expiresAt || 0).getTime() || 0);
  return expiresAt > now;
}

async function revokeMonthlyRewardHolder(guild?, row?, rewardPath?, nowMs = Date.now()) {
  const userId = String(row?.userId || "");
  const reward =
    rewardPath === MONTHLY_TOP_REWARD_PATH
      ? row?.profile?.totals?.exp?.monthlyTopReward
      : row?.profile?.totals?.exp?.monthlyVoteTopReward;
  const roleId = String(reward?.roleId || "");
  const hadRoleBefore = Boolean(reward?.hadRoleBefore);
  if (!userId || !roleId) return false;

  const keepByOtherReward =
    rewardPath === MONTHLY_TOP_REWARD_PATH
      ? hasActiveMonthlyVoterRewardOnRole(row, roleId, nowMs)
      : hasActiveMonthlyTopRewardOnRole(row, roleId, nowMs);
  if (keepByOtherReward) return false;

  if (!hadRoleBefore) {
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (member?.roles?.cache?.has(roleId)) {
      await member.roles.remove(roleId).catch(() => null);
    }
  }
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId },
    { $unset: { [rewardPath]: "" } },
  ).catch(() => null);
  return true;
}

function collectMonthlyTopKeeperUserIds(ranking?, rankedYear?, rankedMonth?) {
  const keep = new Set();
  const rankIndexes = usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth) ? [2] : [1, 2];
  for (const i of rankIndexes) {
    const userId = String(ranking?.[i]?.userId || "").trim();
    if (userId) keep.add(userId);
  }
  return keep;
}

function collectMonthlyVoterKeeperUserIds(ranking?) {
  const keep = new Set();
  for (let i = 0; i < Math.min(3, Array.isArray(ranking) ? ranking.length : 0); i += 1) {
    const userId = String(ranking?.[i]?.userId || "").trim();
    if (userId) keep.add(userId);
  }
  return keep;
}

async function revokeActiveMonthlyTopRewardsExcept(guild?, ranking?, rankedYear?, rankedMonth?) {
  const nowMs = Date.now();
  const keepUserIds = collectMonthlyTopKeeperUserIds(ranking, rankedYear, rankedMonth);
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: { $gt: new Date() },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    if (!userId || keepUserIds.has(userId)) continue;
    await revokeMonthlyRewardHolder(guild, row, MONTHLY_TOP_REWARD_PATH, nowMs);
  }
}

async function revokeActiveMonthlyVoterRewardsExcept(guild?, ranking?) {
  const nowMs = Date.now();
  const keepUserIds = collectMonthlyVoterKeeperUserIds(ranking);
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_VOTER_REWARD_PATH}.expiresAt`]: { $gt: new Date() },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    if (!userId || keepUserIds.has(userId)) continue;
    await revokeMonthlyRewardHolder(guild, row, MONTHLY_VOTER_REWARD_PATH, nowMs);
  }
}

async function reconcileDuplicateActiveMonthlyRewardRoles(guild?) {
  const nowMs = Date.now();
  for (const rewardPath of [MONTHLY_TOP_REWARD_PATH, MONTHLY_VOTER_REWARD_PATH]) {
    const rows = await ActivityUserProfile.find({
      guildId: guild.id,
      [`${rewardPath}.expiresAt`]: { $gt: new Date() },
    })
      .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
      .lean()
      .catch(() => []);
    const byRole = new Map();
    for (const row of rows) {
      const reward =
        rewardPath === MONTHLY_TOP_REWARD_PATH
          ? row?.profile?.totals?.exp?.monthlyTopReward
          : row?.profile?.totals?.exp?.monthlyVoteTopReward;
      const roleId = String(reward?.roleId || "");
      if (!roleId) continue;
      const awardedAt = Number(new Date(reward?.awardedAt || 0).getTime() || 0);
      if (!byRole.has(roleId)) byRole.set(roleId, []);
      byRole.get(roleId).push({ row, awardedAt });
    }
    for (const holders of byRole.values()) {
      if (holders.length <= 1) continue;
      holders.sort((a?, b?) => b.awardedAt - a.awardedAt);
      for (let i = 1; i < holders.length; i += 1) {
        await revokeMonthlyRewardHolder(guild, holders[i].row, rewardPath, nowMs);
      }
    }
  }
}

async function cleanupExpiredMonthlyTopRewards(guild?) {
  const now = new Date();
  const nowMs = Date.now();
  const rows = await ActivityUserProfile.find({
    guildId: guild.id,
    [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: { $lte: now },
  })
    .select(`userId ${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
    .lean()
    .catch(() => []);
  for (const row of rows) {
    const userId = String(row?.userId || "");
    const reward = row?.profile?.totals?.exp?.monthlyTopReward || null;
    const roleId = String(reward?.roleId || "");
    const hadRoleBefore = Boolean(reward?.hadRoleBefore);
    const keepByVoterReward = hasActiveMonthlyVoterRewardOnRole(row, roleId, nowMs);
    if (userId && roleId && !hadRoleBefore && !keepByVoterReward) {
      const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
      if (member?.roles?.cache?.has(roleId)) {
        await member.roles.remove(roleId).catch(() => null);
      }
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      { $unset: { [MONTHLY_TOP_REWARD_PATH]: "" } },
    ).catch(() => null);
  }
}

async function assignMonthlyTopRewards(guild?, ranking?, rankedYear?, rankedMonth?) {
  const now = Date.now();
  const rankIndexes = usesNewMonthlyTopActivityRewards(rankedYear, rankedMonth) ? [2] : [1, 2];
  for (const i of rankIndexes) {
    const row = Array.isArray(ranking) ? ranking[i] : null;
    const userId = String(row?.userId || "");
    const roleId = String(monthlyTopRewardRoleByRank(i, rankedYear, rankedMonth) || "");
    if (!userId || !roleId) continue;
    const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
    if (!member) continue;
    const existing = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
      .select(`${MONTHLY_TOP_REWARD_PATH} ${MONTHLY_VOTER_REWARD_PATH}`)
      .lean()
      .catch(() => null);
    const existingReward = existing?.profile?.totals?.exp?.monthlyTopReward || null;
    const existingRoleId = String(existingReward?.roleId || "");
    const existingHadRoleBefore = Boolean(existingReward?.hadRoleBefore);
    const keepByVoterReward = hasActiveMonthlyVoterRewardOnRole(existing, existingRoleId, now);
    if (
      existingRoleId &&
      existingRoleId !== roleId &&
      !existingHadRoleBefore &&
      !keepByVoterReward &&
      member.roles.cache.has(existingRoleId)
    ) {
      await member.roles.remove(existingRoleId).catch(() => null);
    }
    const hadRoleBefore = member.roles.cache.has(roleId);
    if (!hadRoleBefore) {
      await member.roles.add(roleId).catch(() => null);
    }
    await ActivityUserProfile.updateOne(
      { guildId: guild.id, userId },
      {
        $set: {
          [`${MONTHLY_TOP_REWARD_PATH}.rank`]: i + 1,
          [`${MONTHLY_TOP_REWARD_PATH}.roleId`]: roleId,
          [`${MONTHLY_TOP_REWARD_PATH}.awardedAt`]: new Date(now),
          [`${MONTHLY_TOP_REWARD_PATH}.expiresAt`]: new Date(now + MONTHLY_TOP_REWARD_DURATION_MS),
          [`${MONTHLY_TOP_REWARD_PATH}.hadRoleBefore`]: hadRoleBefore,
          [`${MONTHLY_TOP_REWARD_PATH}.monthKey`]: voteCountMonthKeyRome(new Date(now)),
        },
      },
    ).catch(() => null);
  }
}

export = { TROPHY_LABELS, resolvePreviousMonthTopVoters, cleanupExpiredMonthlyVoterRewards, assignMonthlyVoterRewards, buildMonthlyTopPrizeEmbedLines, buildMonthlyTopWinnerAnnounceLines, revokeActiveMonthlyTopRewardsExcept, revokeActiveMonthlyVoterRewardsExcept, reconcileDuplicateActiveMonthlyRewardRoles, cleanupExpiredMonthlyTopRewards, assignMonthlyTopRewards };
