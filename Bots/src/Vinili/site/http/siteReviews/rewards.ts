const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { getLevelInfo, getTotalExpForLevel, addExpWithLevel } = require("../../../Level/services/expService") as typeof import("../../../Level/services/expService");
const { userAvatarUrlDynamic } = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const { TENANT_EMBED_COLOR } = require("../../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../../MultiGuild/utils/tenantEmbedBranding");
const { FALLBACK_REVIEW_CHANNEL_ID, REVIEW_REWARD_LEVELS } = require("./constants") as typeof import("./constants");
const { displayNameForMember, normalizeRating } = require("./helpers") as typeof import("./helpers");

function computeExpForLevelReward(currentExp?, levelsToAdd?) {
  const current = Math.max(0, Number(currentExp || 0));
  const currentLevel = getLevelInfo(current).level;
  const targetLevel = currentLevel + Math.max(0, Number(levelsToAdd || 0));
  const targetExp = getTotalExpForLevel(targetLevel);
  const finalExp = Math.max(current, targetExp);
  return {
    currentLevel,
    targetLevel,
    addedExp: Math.max(0, finalExp - current),
  };
}

async function awardServerReviewLevels(client?, guild?, member?) {
  const guildId = String(guild?.id || "").trim();
  const userId = String(member?.id || member?.user?.id || "").trim();
  if (!guildId || !userId) return null;

  const alreadyRewarded = await ActivityUserProfile.findOne({
    guildId,
    userId,
    "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt": { $ne: null },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (alreadyRewarded) return null;

  const profile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.totalExp")
    .lean()
    .catch(() => null);
  const currentExp = Number(profile?.profile?.totals?.exp?.totalExp || 0);
  const reward = computeExpForLevelReward(currentExp, REVIEW_REWARD_LEVELS);
  if (!reward.addedExp) return null;

  const expResult = await addExpWithLevel(guild, userId, reward.addedExp, false, false).catch(() => null);
  const finalLevel = Number(expResult?.levelInfo?.level || getLevelInfo(currentExp + reward.addedExp).level || reward.targetLevel);

  await ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: {
        "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedBy": String(client?.user?.id || ""),
        "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt": new Date(),
      },
    },
    { upsert: true },
  ).catch(() => null);

  return {
    addedLevels: Math.max(0, finalLevel - reward.currentLevel),
    finalLevel,
  };
}

async function announceServerReview(client?, guild?, authorMember?, review?, rewardInfo?) {
  const announceId =
    String(client?.config?.siteReviews?.channelId || "").trim() ||
    String(client?.config?.disboardReviews?.channelId || "").trim() ||
    FALLBACK_REVIEW_CHANNEL_ID;
  if (!announceId) return;
  const channel = guild.channels.cache.get(announceId) || (await guild.channels.fetch(announceId).catch(() => null));
  if (!channel || !channel.isTextBased?.()) return;

  const authorName = displayNameForMember(authorMember);
  const avatarUrl = userAvatarUrlDynamic(authorMember, { size: 256 }) || "";
  const stars = "⭐".repeat(normalizeRating(review.rating));
  const reviewsPageUrl = String(client?.config?.siteReviews?.pageUrl || "").trim();
  const reviewLink = reviewsPageUrl || "https://www.viniliecaffe.it/recensioni/";
  const bodyText = String(review.content || "").trim().slice(0, 900) || "—";

  const relativeTs = Math.floor(Date.now() / 1000);
  const rewardLine =
    rewardInfo && Number(rewardInfo.addedLevels || 0) > 0
      ? `<a:VC_StarPink:1330194976440848500> <@${authorMember.id}>, **+${rewardInfo.addedLevels} livelli** per aver lasciato una recensione sul sito.`
      : `<a:VC_StarPink:1330194976440848500> Grazie <@${authorMember.id}> per il supporto!`;

  const embed = new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle("Nuova recensione sul sito")
    .setURL(reviewLink)
    .setAuthor({ name: authorName, iconURL: avatarUrl || undefined })
    .setThumbnail(avatarUrl || "https://disboard.org/images/no-icon.png")
    .setDescription("Un membro ha pubblicato una recensione della community.")
    .addFields(
      { name: "Valutazione", value: stars, inline: true },
      { name: "Inviata", value: `<t:${relativeTs}:R>`, inline: true },
      { name: "Testo", value: bodyText.length > 1020 ? `${bodyText.slice(0, 1017)}…` : bodyText, inline: false },
      {
        name: "Link",
        value: `[Apri la pagina recensioni](<${reviewLink}>)`,
        inline: false,
      },
      {
        name: "Ricompensa",
        value: rewardLine,
        inline: false,
      },
    )
    .setFooter({
      text: "viniliecaffe.it · Feedback community",
      iconURL: userAvatarUrlDynamic(client.user, { size: 64 }) || undefined,
    })
    .setTimestamp();

  await channel.send({
    content: `<@${authorMember.id}>`,
    embeds: [embed],
    allowedMentions: { users: [authorMember.id] },
  }).catch(() => null);
}

export = { computeExpForLevelReward, awardServerReviewLevels, announceServerReview };
