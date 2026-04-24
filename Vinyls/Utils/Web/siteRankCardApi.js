const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const IDs = require("../Config/ids");
const {
  mergeRankCardTheme,
  DEFAULT_RANK_CARD_THEME,
  listRankCardWallpapers,
} = require("../Render/rankCardTheme");
const { getUserRanks, getGlobalMultiplier } = require("../../Services/Community/expService");

const VIP_PLUS_ROLE_ID = String(IDs?.roles?.["VIP+"] || "1495472189347074119").trim();
const DOUBLE_BOOSTER_ROLE_ID = String(IDs?.roles?.DoubleBooster || "1494996567214788818").trim();

function getRankCardPermissions(member) {
  const hasRole = (roleId) => Boolean(roleId && member?.roles?.cache?.has(roleId));
  const roleBadges = [];
  if (hasRole(DOUBLE_BOOSTER_ROLE_ID)) roleBadges.push("Double Booster");
  if (hasRole(VIP_PLUS_ROLE_ID)) roleBadges.push("VIP+");
  return {
    canUseCustomWallpaper: roleBadges.length > 0,
    wallpaperCustomRoles: ["Double Booster", "VIP+"],
    activeWallpaperRoles: roleBadges,
  };
}

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
  const permissions = getRankCardPermissions(resolved.member);

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
    wallpapers: listRankCardWallpapers(),
    permissions,
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
  const permissions = getRankCardPermissions(resolved.member);
  if (!permissions.canUseCustomWallpaper) {
    theme.wallpaperUrl = "";
  }
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