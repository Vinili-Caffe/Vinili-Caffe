const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getUserRanks, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService");
const renderRankCanvas = require("../../Utils/Render/rankCanvas");
const { getRankCardThemeFromDoc } = require("../../Utils/Render/rankCardTheme");
const IDs = require("../../Utils/Config/ids");
const { guildMemberDisplayAvatarUrlDynamic, memberDisplayName } = require("../../Utils/Discord/guildDiscordIdentity");

function resolvePreferredAvatarUrl(member, user) {
  return guildMemberDisplayAvatarUrlDynamic(member || user, { size: 256 }) || "";
}

module.exports = {
  name: "rank",
  aliases: ["r"],
  allowEmptyArgs: true,
  async execute(message, args = []) {
    if (!message.guild) return;
    await message.channel.sendTyping();

    const targetFromMention = message.mentions?.users?.first() || null;
    const raw = Array.isArray(args) && args[0] ? String(args[0]) : "";
    const id = raw.replace(/[<@!>]/g, "");
    const targetFromId=/^\d{16,20}$/.test(id)?await message.client.users.fetch(id).catch(() => null):null;
    const targetUser = targetFromMention || targetFromId || message.author;

    const messageGuildId = String(message.guild.id).trim();
    const mainGuildId = String(message.client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    /** Stesso contesto del sito (siteRankCardApi): exp, classifiche, rankCard e moltiplicatore sulla guild principale se il membro C'è'. */
    let statsGuild = message.guild;
    let statsGuildId = messageGuildId;
    if (mainGuildId && mainGuildId !== messageGuildId) {
      const mainG =
        message.client.guilds.cache.get(mainGuildId) ||
        (await message.client.guilds.fetch(mainGuildId).catch(() => null));
      if (mainG) {
        const mainMember =
          mainG.members.cache.get(targetUser.id) ||
          (await mainG.members.fetch(targetUser.id).catch(() => null));
        if (mainMember) {
          statsGuild = mainG;
          statsGuildId = mainGuildId;
        }
      }
    }

    const targetMember =
      statsGuild.members.cache.get(targetUser.id) ||
      (await statsGuild.members.fetch(targetUser.id).catch(() => null)) ||
      message.guild.members.cache.get(targetUser.id) ||
      (await message.guild.members.fetch(targetUser.id).catch(() => null));

    const { stats, weeklyRank, allTimeRank } = await getUserRanks(statsGuildId, targetUser.id);
    const multiplier = await getResolvedWeeklyExpMultiplier(statsGuild, targetUser.id, null).catch(() => 1);
    const weeklyText = weeklyRank ? `#${weeklyRank}` : "Fuori dalla classifica";
    const allTimeText = allTimeRank ? `#${allTimeRank}` : "Fuori dalla classifica";

    /** Sito e comando devono leggere la stessa personalizzazione: preferisci sempre la guild principale. */
    const themeGuildCandidates = [];
    if (mainGuildId) themeGuildCandidates.push(mainGuildId);
    if (statsGuildId && !themeGuildCandidates.includes(statsGuildId)) themeGuildCandidates.push(statsGuildId);
    if (messageGuildId && !themeGuildCandidates.includes(messageGuildId)) themeGuildCandidates.push(messageGuildId);

    let rankDoc = null;
    for (const gid of themeGuildCandidates) {
      const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: targetUser.id })
        .select("profile.rankCard")
        .lean()
        .catch(() => null);
      if (!doc?.profile?.rankCard) continue;
      rankDoc = doc;
      break;
    }
    const rankCardTheme = getRankCardThemeFromDoc(rankDoc);

    const avatarUrl = resolvePreferredAvatarUrl(targetMember, targetUser);
    const card = await renderRankCanvas({
      username: memberDisplayName(targetMember, targetUser),
      avatarUrl,
      level: stats.level,
      totalExp: stats.totalExp,
      currentLevelExp: stats.currentLevelExp,
      nextLevelExp: stats.nextLevelExp,
      progressPercent: stats.progressPercent,
      weeklyRank,
      allTimeRank,
      weeklyExp: stats.weeklyExp,
      multiplier,
      hideLeaderboardRanks: false,
      theme: rankCardTheme,
    });
    const cardBuffer = card?.buffer || null;
    const cardExt = String(card?.extension || "png").toLowerCase() === "gif" ? "gif" : "png";
    if (!cardBuffer) {
      await safeMessageReply(message, {
        content: "Non sono riuscito a generare la rank card in questo momento.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const file = new AttachmentBuilder(cardBuffer, { name: `rank-${targetUser.id}.${cardExt}` });
    await safeMessageReply(message, {
      files: [file],
      allowedMentions: { repliedUser: false },
    });
  },
};