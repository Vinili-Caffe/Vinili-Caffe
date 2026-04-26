const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const IDs = require("../Config/ids");
const {
  mergeRankCardTheme,
  DEFAULT_RANK_CARD_THEME,
  listRankCardWallpapers,
  getRankCardThemeFromDoc,
} = require("../Render/rankCardTheme");
const { getUserRanks, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService");
const renderRankCanvas = require("../Render/rankCanvas");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

const VIP_PLUS_ROLE_ID = String(IDs?.roles?.["VIP+"] || "1495472189347074119").trim();
const DOUBLE_BOOSTER_ROLE_ID = String(IDs?.roles?.DoubleBooster || "1494996567214788818").trim();

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

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

function resolvePreferredAvatarUrl(member) {
  return userAvatarUrlDynamic(member, { size: 256 }) || "";
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
  const multiplier = await getResolvedWeeklyExpMultiplier(resolved.guild, resolved.userId, null).catch(() => 1);
  const permissions = getRankCardPermissions(resolved.member);

  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    username: String(resolved.member?.user?.username || "").trim(),
    displayName: String(resolved.member?.user?.username || "Utente").trim() || "Utente",
    avatarUrl: resolvePreferredAvatarUrl(resolved.member),
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

async function getRankCardPreview(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const { stats, weeklyRank, allTimeRank } = await getUserRanks(resolved.guild.id, resolved.userId);
  const multiplier = await getResolvedWeeklyExpMultiplier(resolved.guild, resolved.userId, null).catch(() => 1);
  const permissions = getRankCardPermissions(resolved.member);
  const theme = mergeRankCardTheme(payload?.theme || {});
  if (!permissions.canUseCustomWallpaper) {
    theme.wallpaperUrl = "";
  }

  const avatarUrl = resolvePreferredAvatarUrl(resolved.member);

  const rendered = await renderRankCanvas({
    username: String(resolved.member?.user?.username || "utente").trim() || "utente",
    avatarUrl,
    level: Number(stats?.level || 0),
    totalExp: Number(stats?.totalExp || 0),
    currentLevelExp: Number(stats?.currentLevelExp || 0),
    nextLevelExp: Number(stats?.nextLevelExp || 0),
    progressPercent: Number(stats?.progressPercent || 0),
    weeklyRank: weeklyRank || null,
    allTimeRank: allTimeRank || null,
    weeklyExp: Number(stats?.weeklyExp || 0),
    multiplier: Number(multiplier || 1),
    hideLeaderboardRanks: false,
    theme,
  }).catch(() => null);

  if (!rendered?.buffer) {
    return { ok: false, status: 500, error: "preview_failed", message: "Impossibile generare anteprima rank card." };
  }

  return {
    ok: true,
    status: 200,
    image: rendered.buffer,
    mimeType: String(rendered.mimeType || "image/png"),
  };
}

async function getPublicRankCardPreview(client, payload) {
  const userId = String(payload?.userId || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 400, error: "invalid_user_id", message: "Parametro userId non valido." };
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "guild_missing", message: "Guild principale non configurata." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }
  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  if (!member) {
    return { ok: false, status: 404, error: "member_not_found", message: "Utente non trovato nel server." };
  }

  const { stats, weeklyRank, allTimeRank } = await getUserRanks(guildId, userId);
  const multiplier = await getResolvedWeeklyExpMultiplier(guild, userId, null).catch(() => 1);
  const doc = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.rankCard")
    .lean()
    .catch(() => null);
  const theme = getRankCardThemeFromDoc(doc);
  const avatarUrl = resolvePreferredAvatarUrl(member);
  const rendered = await renderRankCanvas({
    username: String(member?.user?.username || "utente").trim() || "utente",
    avatarUrl,
    level: Number(stats?.level || 0),
    totalExp: Number(stats?.totalExp || 0),
    currentLevelExp: Number(stats?.currentLevelExp || 0),
    nextLevelExp: Number(stats?.nextLevelExp || 0),
    progressPercent: Number(stats?.progressPercent || 0),
    weeklyRank: weeklyRank || null,
    allTimeRank: allTimeRank || null,
    weeklyExp: Number(stats?.weeklyExp || 0),
    multiplier: Number(multiplier || 1),
    hideLeaderboardRanks: false,
    theme,
  }).catch(() => null);
  if (!rendered?.buffer) {
    return { ok: false, status: 500, error: "preview_failed", message: "Impossibile generare rank card." };
  }
  return {
    ok: true,
    status: 200,
    image: rendered.buffer,
    mimeType: String(rendered.mimeType || "image/png"),
  };
}

module.exports = {
  getRankCardCustomization,
  updateRankCardCustomization,
  getRankCardPreview,
  getPublicRankCardPreview,
};