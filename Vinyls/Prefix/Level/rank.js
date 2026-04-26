const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getUserRanks, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService");
const renderRankCanvas = require("../../Utils/Render/rankCanvas");
const { getRankCardThemeFromDoc } = require("../../Utils/Render/rankCardTheme");
const IDs = require("../../Utils/Config/ids");
const { userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");

function resolvePreferredAvatarUrl(member, user) {
  return userAvatarUrlDynamic(member || user, { size: 256 }) || "";
}

module.exports = {
  name: "rank",
  aliases: ["r"],
  allowEmptyArgs: true,
  async execute(message, args = []) {
    if (!message.guild) return;
    await message.channel.sendTyping();

    const tokens=Array.isArray(args)?args.map((arg) => String(arg||"").trim()).filter(Boolean):[];
    const wantsEmbed = tokens.some((token) => token.toLowerCase() === "embed");
    const cleanArgs = tokens.filter((token) => token.toLowerCase() !== "embed");

    const targetFromMention = message.mentions?.users?.first() || null;
    const raw = cleanArgs[0] ? String(cleanArgs[0]) : "";
    const id = raw.replace(/[<@!>]/g, "");
    const targetFromId=/^\d{16,20}$/.test(id)?await message.client.users.fetch(id).catch(() => null):null;
    const targetUser = targetFromMention || targetFromId || message.author;

    const messageGuildId = String(message.guild.id).trim();
    const mainGuildId = String(message.client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    /** Stesso contesto del sito (siteRankCardApi): exp, classifiche, rankCard e moltiplicatore sulla guild principale se il membro c'e'. */
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
      username: targetUser.username,
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
    const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Le statistiche di ${targetUser.tag} .ᐟ ✧`)
    .setImage(`attachment://rank-${targetUser.id}.${cardExt}`)
    .setDescription(
      [
        `<:VC_EXP:1482534670896730143> Hai accumulato un totale di **${stats.totalExp} EXP**.`,
        `<a:VC_Rocket:1468544312475123753> **Moltiplicatore:** ${multiplier}x`,
        `<:VC_StarPurple:1330195026688344156> **General Top:** ${allTimeText}`,
        `<:VC_StarBlue:1330194918043418674> **Weekly Top:** ${weeklyText}`,
      ].join("\n"),
    )
    .addFields(
      { name: "<a:VC_StarPink:1330194976440848500> **Livello:**", value: `**${stats.level}**`, inline: true },
      { name: "<:VC_EXP:1482534670896730143> **Weekly EXP:**", value: `**${stats.weeklyExp}**`, inline: true },
      { name: "<a:VC_Rocket:1468544312475123753> **Moltiplicatore:**", value: `**${Number(multiplier || 1).toFixed(1)}x**`, inline: true },
    )
    .setFooter({ text: `Ti mancano ${stats.remainingToNext} exp per il prossimo livello` });
    const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId("r_multiplier_info")
        .setLabel("Info Moltiplicatori")
        .setEmoji("<a:VC_HeartsPink:1468685897389052008>")
        .setStyle(ButtonStyle.Secondary),
    );

    if (!wantsEmbed) {
      await safeMessageReply(message, {
        files: [file],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await safeMessageReply(message, {
      embeds: [embed],
      files: [file],
      components: [row],
      allowedMentions: { repliedUser: false },
    });
  },
};