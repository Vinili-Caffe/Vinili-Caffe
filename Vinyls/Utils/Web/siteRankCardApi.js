const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { mergeRankCardTheme, DEFAULT_RANK_CARD_THEME } = require("../Render/rankCardTheme");
const { getUserRanks, getGlobalMultiplier } = require("../../Services/Community/expService");

async function getRankCardCustomization(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const doc = await ActivityUserProfile.findOne({
    guildId: resolved.guild.id,
    userId: resolved.userId,
  })
    .select("profile.rankCard profile.totals.exp")
    .lean()
    .catch(() => null);

  const theme = mergeRankCardTheme(doc?.profile?.rankCard || {});
  const { stats, weeklyRank, allTimeRank } = await getUserRanks(resolved.guild.id, resolved.userId);
  const multiplier = await getGlobalMultiplier(resolved.guild.id).catch(() => 1);

  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    username: String(resolved.member?.user?.username || "").trim(),
    displayName: String(resolved.member?.user?.username || resolved.member?.displayName || "Utente").trim() || "Utente",
    avatarUrl:
      resolved.member?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
      resolved.member?.user?.displayAvatarURL?.({ extension: "png", size: 256 }) ||
      "",
    theme,
    defaults: DEFAULT_RANK_CARD_THEME,
    stats: {
      level: Number(stats?.level || 0),
      totalExp: Number(stats?.totalExp || 0),
      currentLevelExp: Number(stats?.currentLevelExp || 0),
      nextLevelExp: Number(stats?.nextLevelExp || 0),
      progressPercent: Number(stats?.progressPercent || 0),
      weeklyExp: Number(stats?.weeklyExp || 0),
      weeklyRank: weeklyRank || null,
      allTimeRank: allTimeRank || null,
      multiplier: Number(multiplier || 1),
    },
  };
}

async function updateRankCardCustomization(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const mode = String(payload?.mode || "save").trim().toLowerCase();
  if (mode === "reset") {
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: resolved.guild.id, userId: resolved.userId },
      {
        $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
        $unset: { "profile.rankCard": "" },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);
    return {
      ok: true,
      status: 200,
      theme: DEFAULT_RANK_CARD_THEME,
      message: "Personalizzazione rank card resettata.",
    };
  }

  const theme = mergeRankCardTheme(payload?.theme || {});
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: resolved.guild.id, userId: resolved.userId },
    {
      $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
      $set: { "profile.rankCard": theme },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    status: 200,
    theme,
    message: "Personalizzazione rank card salvata.",
  };
}

module.exports = {
  getRankCardCustomization,
  updateRankCardCustomization,
};
