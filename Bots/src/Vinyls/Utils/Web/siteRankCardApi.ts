const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const {
  mergeRankCardTheme,
  DEFAULT_RANK_CARD_THEME,
  listRankCardWallpapers,
  listRankCardFonts,
  getRankCardThemeFromDoc,
} = require("../Render/rankCardTheme") as typeof import("../Render/rankCardTheme");
const { getUserRanks, getResolvedWeeklyExpMultiplier } = require("../../Services/Community/expService") as typeof import("../../Services/Community/expService");
const renderRankCanvas = require("../Render/rankCanvas");
const { guildMemberDisplayAvatarUrlForSite, memberDisplayName } = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");

const VIP_PLUS_ROLE_ID = String(IDs?.roles?.["VIP+"] || "1544830868575625276").trim();
const DOUBLE_BOOSTER_ROLE_ID = String(IDs?.roles?.DoubleBooster || "1544830850552823849").trim();

/* rankCardSpeed1: GIF ffmpeg ~1s/req — cache memoria + singleflight sul pubblico */
const PUBLIC_RANK_CACHE_TTL_MS = 120_000;
const PUBLIC_RANK_CACHE_MAX = 100;
const publicRankCardCache = new Map();
const publicRankCardInFlight = new Map();

function publicRankCacheKey(userId?) {
  return String(userId || "").trim();
}

function getCachedPublicRankCard(userId?) {
  const key = publicRankCacheKey(userId);
  if (!key) return null;
  const hit = publicRankCardCache.get(key);
  if (!hit) return null;
  if (Date.now() > Number(hit.expiresAt || 0)) {
    publicRankCardCache.delete(key);
    return null;
  }
  publicRankCardCache.delete(key);
  publicRankCardCache.set(key, hit);
  return hit;
}

function setCachedPublicRankCard(userId?, image?, mimeType?) {
  const key = publicRankCacheKey(userId);
  if (!key || !image) return;
  publicRankCardCache.set(key, {
    expiresAt: Date.now() + PUBLIC_RANK_CACHE_TTL_MS,
    image,
    mimeType: String(mimeType || "image/png"),
  });
  while (publicRankCardCache.size > PUBLIC_RANK_CACHE_MAX) {
    const oldest = publicRankCardCache.keys().next().value;
    publicRankCardCache.delete(oldest);
  }
}

function invalidatePublicRankCardCache(userId?) {
  const key = publicRankCacheKey(userId);
  if (key) publicRankCardCache.delete(key);
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function getRankCardPermissions(member?) {
  const hasRole = (roleId?) => Boolean(roleId && member?.roles?.cache?.has(roleId));
  const roleBadges = [];
  if (hasRole(DOUBLE_BOOSTER_ROLE_ID)) roleBadges.push("Double Booster");
  if (hasRole(VIP_PLUS_ROLE_ID)) roleBadges.push("VIP+");
  return {
    canUseCustomWallpaper: roleBadges.length > 0,
    wallpaperCustomRoles: ["Double Booster", "VIP+"],
    activeWallpaperRoles: roleBadges,
  };
}

function resolvePreferredAvatarUrl(member?) {
  const live = guildMemberDisplayAvatarUrlForSite(member, { size: 256, preferAnimated: true }) || "";
  return animatedDiscordCdnAvatarUrl(live, { size: 256 }) || live;
}

async function getServerAvatarOnly(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  const member = resolved.member;
  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    username: String(member?.user?.username || "").trim(),
    displayName: memberDisplayName(member, member?.user),
    memberAvatar: String(member?.avatar || "").trim() || "",
    avatarUrl: resolvePreferredAvatarUrl(member),
  };
}

const MAX_RANK_CARD_API_WALLPAPER_BYTES = 350000;

function compactRankCardThemeForApi(theme?) {
  const next = theme && typeof theme === "object" ? { ...theme } : {};
  const wallpaperUrl = String(next.wallpaperUrl || "").trim();
  if (wallpaperUrl.length > MAX_RANK_CARD_API_WALLPAPER_BYTES) {
    next.wallpaperUrl = "";
    next.wallpaperUrlOmitted = true;
  }
  return next;
}

/* rankWpOmitted1: la GET omette gli sfondi custom grandi (wallpaperUrlOmitted). Se il sito rimanda il tema
   senza sfondo ma con il flag, anteprima e salvataggio usano quello già salvato invece di cancellarlo. */
async function restoreOmittedWallpaper(resolved?, rawTheme?, theme?) {
  if (theme.wallpaperUrl || !rawTheme || rawTheme.wallpaperUrlOmitted !== true) return;
  const doc = await ActivityUserProfile.findOne({ guildId: resolved.guild.id, userId: resolved.userId })
    .select("profile.rankCard.wallpaperUrl")
    .lean()
    .catch(() => null);
  const stored = mergeRankCardTheme(doc?.profile?.rankCard || {}).wallpaperUrl;
  if (stored) theme.wallpaperUrl = stored;
}

async function getRankCardCustomization(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const [doc, ranks, multiplier] = await Promise.all([
    ActivityUserProfile.findOne({
      guildId: resolved.guild.id,
      userId: resolved.userId,
    })
      .select("profile.rankCard profile.totals.exp")
      .lean()
      .catch(() => null),
    getUserRanks(resolved.guild.id, resolved.userId).catch(() => null),
    getResolvedWeeklyExpMultiplier(resolved.guild, resolved.userId, null, resolved.member).catch(() => 1),
  ]);

  const theme = mergeRankCardTheme(doc?.profile?.rankCard || {});
  const stats = ranks?.stats || {};
  const weeklyRank = ranks?.weeklyRank ?? null;
  const allTimeRank = ranks?.allTimeRank ?? null;
  const permissions = getRankCardPermissions(resolved.member);

  return {
    ok: true,
    status: 200,
    userId: resolved.userId,
    username: String(resolved.member?.user?.username || "").trim(),
    displayName: memberDisplayName(resolved.member, resolved.member?.user),
    avatarUrl: resolvePreferredAvatarUrl(resolved.member),
    theme: compactRankCardThemeForApi(theme),
    defaults: DEFAULT_RANK_CARD_THEME,
    wallpapers: listRankCardWallpapers(),
    fonts: listRankCardFonts(),
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

async function updateRankCardCustomization(client?, payload?) {
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
    invalidatePublicRankCardCache(resolved.userId);
    try {
      const { broadcastSiteRankCardChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
      broadcastSiteRankCardChanged(resolved.userId, { action: "reset" });
    } catch (_) {}
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
  } else {
    await restoreOmittedWallpaper(resolved, payload?.theme, theme);
  }
  await ActivityUserProfile.findOneAndUpdate(
    { guildId: resolved.guild.id, userId: resolved.userId },
    {
      $setOnInsert: { guildId: resolved.guild.id, userId: resolved.userId },
      $set: { "profile.rankCard": theme },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  invalidatePublicRankCardCache(resolved.userId);
  try {
    const { broadcastSiteRankCardChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
    broadcastSiteRankCardChanged(resolved.userId, { action: "save" });
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    theme: compactRankCardThemeForApi(theme),
    message: "Personalizzazione rank card salvata.",
  };
}

async function getRankCardPreview(client?, payload?) {
  const accessToken = String(payload?.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const [ranks, multiplier] = await Promise.all([
    getUserRanks(resolved.guild.id, resolved.userId).catch(() => null),
    getResolvedWeeklyExpMultiplier(resolved.guild, resolved.userId, null, resolved.member).catch(() => 1),
  ]);
  const stats = ranks?.stats || {};
  const weeklyRank = ranks?.weeklyRank ?? null;
  const allTimeRank = ranks?.allTimeRank ?? null;
  const permissions = getRankCardPermissions(resolved.member);
  const theme = mergeRankCardTheme(payload?.theme || {});
  if (!permissions.canUseCustomWallpaper) {
    theme.wallpaperUrl = "";
  } else {
    await restoreOmittedWallpaper(resolved, payload?.theme, theme);
  }

  const avatarUrl = resolvePreferredAvatarUrl(resolved.member);

  const rendered = await renderRankCanvas({
    username: memberDisplayName(resolved.member, resolved.member?.user),
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

async function buildPublicRankCardPreview(client?, userId?) {
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

  const [ranks, multiplier, doc] = await Promise.all([
    getUserRanks(guildId, userId).catch(() => null),
    getResolvedWeeklyExpMultiplier(guild, userId, null, member).catch(() => 1),
    ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.rankCard")
      .lean()
      .catch(() => null),
  ]);
  const stats = ranks?.stats || {};
  const weeklyRank = ranks?.weeklyRank ?? null;
  const allTimeRank = ranks?.allTimeRank ?? null;
  const theme = getRankCardThemeFromDoc(doc);
  const avatarUrl = resolvePreferredAvatarUrl(member);
  const rendered = await renderRankCanvas({
    username: memberDisplayName(member, member?.user),
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
  setCachedPublicRankCard(userId, rendered.buffer, rendered.mimeType);
  return {
    ok: true,
    status: 200,
    image: rendered.buffer,
    mimeType: String(rendered.mimeType || "image/png"),
    cache: "MISS",
  };
}

async function getPublicRankCardPreview(client?, payload?) {
  const userId = String(payload?.userId || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 400, error: "invalid_user_id", message: "Parametro userId non valido." };
  }
  const cached = getCachedPublicRankCard(userId);
  if (cached?.image) {
    return {
      ok: true,
      status: 200,
      image: cached.image,
      mimeType: String(cached.mimeType || "image/png"),
      cache: "HIT",
    };
  }
  const inflight = publicRankCardInFlight.get(userId);
  if (inflight) return inflight;

  const work = buildPublicRankCardPreview(client, userId).finally(() => {
    publicRankCardInFlight.delete(userId);
  });
  publicRankCardInFlight.set(userId, work);
  return work;
}

export = {
  getRankCardCustomization,
  getServerAvatarOnly,
  updateRankCardCustomization,
  getRankCardPreview,
  getPublicRankCardPreview,
  invalidatePublicRankCardCache,
};