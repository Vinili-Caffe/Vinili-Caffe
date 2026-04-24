const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getUserRanks, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService");
const renderRankCanvas = require("../../Utils/Render/rankCanvas");
const { getRankCardThemeFromDoc } = require("../../Utils/Render/rankCardTheme");
const IDs = require("../../Utils/Config/ids");

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

    const targetMember =
      message.guild.members.cache.get(targetUser.id) ||
      (await message.guild.members.fetch(targetUser.id).catch(() => null));

    const{stats,weeklyRank,allTimeRank}=await getUserRanks(message.guild.id,targetUser.id,);
    const multiplier = await getResolvedWeeklyExpMultiplier(message.guild, targetUser.id, null).catch(() => 1);
    const weeklyText = weeklyRank ? `#${weeklyRank}` : "Fuori dalla classifica";
    const allTimeText = allTimeRank ? `#${allTimeRank}` : "Fuori dalla classifica";
    const themeGuildId = String(message.client?.config?.mainGuildId || IDs.guilds?.main || message.guild.id).trim();
    const rankDoc = await ActivityUserProfile.findOne({ guildId: themeGuildId, userId: targetUser.id })
      .select("profile.rankCard")
      .lean()
      .catch(() => null);
    const rankCardTheme = getRankCardThemeFromDoc(rankDoc);

    const avatarUrl =
      targetMember?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
      targetUser.displayAvatarURL({ extension: "png", size: 256 });
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
    const file=new AttachmentBuilder(card,{name:`rank-${targetUser.id}.png`});
    const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`Le statistiche di ${targetUser.tag} .ᐟ ✧`)
    .setImage(`attachment://rank-${targetUser.id}.png`)
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