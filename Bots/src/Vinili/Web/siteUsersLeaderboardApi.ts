const { PermissionsBitField, OverwriteType, Routes } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { ActivityUserProfile, CustomRole } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");
const { getLevelInfo, getGlobalMultiplier, getGuildExpSettings, getRoleMultiplier, getResolvedWeeklyExpMultiplier } = require("../Services/Community/expService") as typeof import("../Services/Community/expService");
const {
  computeLeaderboardRows,
  computeWeeklyExpFromProfileDoc,
  getRomeDayKey,
} = require("../Prefix/Level/classifica") as typeof import("../Prefix/Level/classifica");
const { findCustomVoiceByOwner, findCustomVoiceByRole } = require("../Utils/Interaction/customRoleUtils") as typeof import("../Utils/Interaction/customRoleUtils");
const { getRankCardThemeFromDoc, resolveRankCardWallpaper } = require("../Utils/Render/rankCardTheme") as typeof import("../Utils/Render/rankCardTheme");
const {
  userAvatarUrlStatic,
  userAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
  guildMemberDisplayAvatarUrlForSite,
} = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const { stabilizeDiscordCdnAvatarUrl, animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");
const { discordRoleIconUrl } = require("../Utils/Discord/discordRoleIconUrl") as typeof import("../Utils/Discord/discordRoleIconUrl");
const { getEffectiveJoinedAt } = require("../Services/Community/effectiveMemberJoinService") as typeof import("../Services/Community/effectiveMemberJoinService");
const { isLitePerf, resolveSitePerfTier } = require("./sitePerfHints") as typeof import("./sitePerfHints");
const {
  fetchWebsiteGuildMember,
  readCachedWebsiteMember,
} = require("../Utils/Web/websiteGuildMemberFetch") as typeof import("../Utils/Web/websiteGuildMemberFetch");
const { listBirthdaysForMonth } = require("../Services/Community/profileStore") as typeof import("../Services/Community/profileStore");
const { getRomeDateParts } = require("../Services/Community/birthdayService") as typeof import("../Services/Community/birthdayService");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

/* siteApiW6: ETag/304 on users/leaderboard poll */
function replyUsers(req?, res?, payload?, cacheControl?, extraHeaders?) {
  return sendJsonWithEtag(req, res, payload, {
    cacheControl,
    etag: weakEtagFromJson(payload),
    extraHeaders,
  });
}

const LIST_CACHE_TTL_MS = 90_000;
/* siteUsersSwr1: servi stale fino a 10m mentre rebuild in background (come site-roles) */
const LIST_STALE_KEEP_MS = 10 * 60 * 1000;
const PROFILE_CACHE_TTL_MS = 90_000;
const PROFILE_STALE_KEEP_MS = 10 * 60 * 1000;
const BIRTHDAYS_CACHE_TTL_MS = 120_000;
const IT_MONTH_NAMES = [
  "",
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];
const PROFILE_CACHE_VER = 11;
const PROFILE_MEMBER_SOFT_TIMEOUT_MS = 400;
const LIST_MEMBER_WARM_MS = 180;
const listCache = new Map();
/* siteUsersW2: singleflight on listCache miss — stampede → one Mongo/Discord build */
const listCacheInflight = new Map();

function stripDataUrl(value?) {
  const s = String(value || "").trim();
  if (!s || /^data:/i.test(s)) return "";
  return s;
}

function siteSafeRankCard(doc?) {
  const theme: any = getRankCardThemeFromDoc(doc) || {};
  return {
    ...theme,
    wallpaperUrl: stripDataUrl(theme.wallpaperUrl),
  };
}

function siteSafeResolvedWallpaper(doc?) {
  return stripDataUrl(resolveRankCardWallpaper(doc?.profile?.rankCard || {}));
}

function siteMemberAvatarUrl(member?, size = 128) {
  const live =
    guildMemberDisplayAvatarUrlForSite(member, { size, preferAnimated: true }) ||
    guildMemberDisplayAvatarUrlStatic(member, { size }) ||
    guildMemberDisplayAvatarUrlDynamic(member, { size }) ||
    "";
  return animatedDiscordCdnAvatarUrl(live, { size }) || stabilizeDiscordCdnAvatarUrl(live, { size }) || "";
}

function identityLooksIncomplete(identity?, userId?) {
  const id = String(userId || "").trim();
  if (!id || !identity) return true;
  const dn = String(identity.displayName || "").trim();
  const un = String(identity.username || "").trim();
  if (!dn || dn === id || un === id) return true;
  const av = String(identity.avatarUrl || "");
  if (!String(identity.avatar || "").trim() && /\/embed\/avatars\//.test(av)) return true;
  return false;
}

function listMemberWarmBudgetMs(userIds?) {
  const n = Array.isArray(userIds) ? userIds.length : 0;
  return Math.min(650, Math.max(LIST_MEMBER_WARM_MS, 140 + n * 45));
}

async function resolveIdentitiesForList(client?, guild?, userIds?, lite?, softOnly?) {
  const ids = [
    ...new Set(
      (Array.isArray(userIds) ? userIds : [])
        .map((x?) => String(x || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!ids.length) return new Map();
  /* siteUsersW2: lite/mid = cache-first + soft warm; hard Discord hydrate deferred */
  const soft = Boolean(lite || softOnly);
  const warmMs = soft ? Math.min(160, listMemberWarmBudgetMs(ids)) : listMemberWarmBudgetMs(ids);
  await warmGuildMembersSoft(guild, ids, warmMs);
  const entries = await Promise.all(
    ids.map(async (uid?) => [
      uid,
      soft
        ? identityFromCacheOnly(client, guild, uid)
        : await fetchUserIdentity(client, guild, uid, { skipUserFetch: Boolean(lite) }),
    ]),
  );
  const map = new Map((entries as any));
  const missing = ids.filter((uid?) => identityLooksIncomplete(map.get(uid), uid));
  if (!missing.length) return map;
  if (soft) {
    setImmediate(() => {
      warmGuildMembers(guild, missing)
        .then(() =>
          Promise.all(
            missing.map((uid?) => fetchUserIdentity(client, guild, uid, { skipUserFetch: false })),
          ),
        )
        .catch(() => {});
    });
    return map;
  }
  await warmGuildMembers(guild, missing).catch(() => {});
  await Promise.all(
    missing.map(async (uid?) => {
      map.set(uid, await fetchUserIdentity(client, guild, uid, { skipUserFetch: false }));
    }),
  );
  return map;
}

function cacheLookup(key?, staleKeepMs?) {
  const row = listCache.get(key);
  if (!row || row.payload == null) return { hit: null, stale: false };
  const now = Date.now();
  if (row.expiresAt > now) return { hit: row.payload, stale: false };
  const at = Number(row.at) > 0 ? Number(row.at) : Number(row.expiresAt) || 0;
  const keep = Number.isFinite(staleKeepMs) && staleKeepMs > 0 ? staleKeepMs : LIST_STALE_KEEP_MS;
  if (at > 0 && now - at < keep) return { hit: row.payload, stale: true };
  return { hit: null, stale: false };
}

function cacheGet(key?) {
  const { hit, stale } = cacheLookup(key, LIST_STALE_KEEP_MS);
  return hit && !stale ? hit : null;
}

function cacheSet(key?, payload?, ttlMs?) {
  const ttl = Number(ttlMs);
  const now = Date.now();
  listCache.set(key, {
    payload,
    at: now,
    expiresAt: now + (Number.isFinite(ttl) && ttl > 0 ? ttl : LIST_CACHE_TTL_MS),
  });
}

function startCacheBuild(key?, builder?, ttlMs?) {
  let inflight = listCacheInflight.get(key);
  if (inflight) return inflight;
  inflight = Promise.resolve()
    .then(() => builder())
    .then((payload?) => {
      cacheSet(key, payload, ttlMs);
      return payload;
    })
    .finally(() => {
      listCacheInflight.delete(key);
    });
  listCacheInflight.set(key, inflight);
  return inflight;
}

/** siteUsersSwr1: se stale, ritorna subito e refresh in background (force=await rebuild) */
async function cacheGetOrBuild(key?, builder?, ttlMs?, opts?) {
  const staleKeep =
    Number(opts?.staleKeepMs) > 0 ? Number(opts.staleKeepMs) : LIST_STALE_KEEP_MS;
  const force = Boolean(opts?.force);
  const { hit, stale } = cacheLookup(key, staleKeep);
  if (hit && !stale) return hit;
  const inflight = startCacheBuild(key, builder, ttlMs);
  if (hit && stale && !force) {
    inflight.catch((err?) => {
      global.logger?.warn?.("[WEBHOOK] site-users swr refresh:", key, err?.message || err);
    });
    return hit;
  }
  return inflight;
}

function cacheLookupMeta(key?, staleKeepMs?) {
  return cacheLookup(key, staleKeepMs);
}

function parseIntSafe(v?, min?, max?, def?) {
  const n = parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function nInt(v?) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "object" && v !== null && typeof v.toString === "function") {
    const x = Number(String(v.toString()).trim().replace(/[.,\s]/g, ""));
    return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
  }
  const x = Number(String(v).trim().replace(/[.,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

/* membersApproxFix1: guild.memberCount spesso assente sul client site-api → REST with_counts + cache */
const membersApproxMem = { guildId: "", at: 0, n: null };
const MEMBERS_APPROX_TTL_MS = 300_000;

async function resolveMembersApprox(client?, guild?, guildId?) {
  const gid = String(guildId || guild?.id || "").trim();
  if (!gid) return null;
  const now = Date.now();
  if (
    membersApproxMem.guildId === gid &&
    now - membersApproxMem.at < MEMBERS_APPROX_TTL_MS &&
    Number.isFinite(Number(membersApproxMem.n)) &&
    Number(membersApproxMem.n) > 0
  ) {
    return Math.floor(Number(membersApproxMem.n));
  }
  const pick = (raw?) => {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  };
  let n = pick(guild?.memberCount) || pick(guild?.approximateMemberCount);
  if (n) {
    membersApproxMem.guildId = gid;
    membersApproxMem.at = now;
    membersApproxMem.n = n;
    return n;
  }
  try {
    const rest = client?.rest || client?._rest;
    if (rest) {
      const raw = await rest.get(Routes.guild(gid), {
        query: new URLSearchParams({ with_counts: "true" }),
      });
      n = pick(raw?.approximate_member_count) || pick(raw?.member_count);
      if (n) {
        membersApproxMem.guildId = gid;
        membersApproxMem.at = now;
        membersApproxMem.n = n;
        return n;
      }
    }
  } catch (eFetch) {
    global.logger?.warn?.("[site-users] membersApprox with_counts:", eFetch?.message || eFetch);
  }
  try {
    const cachedGuild = client?.guilds?.cache?.get?.(gid);
    n = pick(cachedGuild?.memberCount) || pick(cachedGuild?.approximateMemberCount);
    if (n) {
      membersApproxMem.guildId = gid;
      membersApproxMem.at = now;
      membersApproxMem.n = n;
      return n;
    }
  } catch (eCache) {}
  return null;
}

function parseBoard(raw?) {
  const b = String(raw || "level").trim().toLowerCase();
  if (b === "profile") return "profile";
  if (b === "birthdays") return "birthdays";
  if (b === "weekly" || b === "messages" || b === "voice" || b === "minigames" || b === "minigame") {
    return b === "minigame" ? "minigames" : b;
  }
  return "level";
}

function parseCalendarMonth(raw?, fallback?) {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  return fallback;
}

function parseCalendarYear(raw?, fallback?) {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (Number.isFinite(n) && n >= 1970 && n <= 2100) return n;
  return fallback;
}

function computeAgeFromBirthYear(day?, month?, birthYear?, romeToday?) {
  const y = Number(birthYear);
  if (!Number.isFinite(y) || y < 1900) return null;
  let age = Number(romeToday.year) - y;
  if (romeToday.month < month || (romeToday.month === month && romeToday.day < day)) age -= 1;
  return age >= 0 ? age : null;
}

function formatPublicBirthdayLabel(day?, month?, birthYear?, showAge?) {
  const d = Number(day);
  const m = Number(month);
  if (!d || !m || m < 1 || m > 12) return "";
  const monthName = IT_MONTH_NAMES[m] || String(m);
  const canShowYear = showAge !== false && Number.isFinite(Number(birthYear)) && Number(birthYear) >= 1900;
  return canShowYear ? `${d} ${monthName} ${Number(birthYear)}` : `${d} ${monthName}`;
}

function buildPublicBirthdayPayload(birthdayRaw?, romeToday?) {
  const day = Number(birthdayRaw?.day || 0);
  const month = Number(birthdayRaw?.month || 0);
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;
  const showAge = birthdayRaw?.showAge !== false;
  const birthYear =
    showAge && Number.isFinite(Number(birthdayRaw?.birthYear)) && Number(birthdayRaw.birthYear) >= 1900
      ? Number(birthdayRaw.birthYear)
      : null;
  const isToday = romeToday.month === month && romeToday.day === day;
  const age = birthYear != null ? computeAgeFromBirthYear(day, month, birthYear, romeToday) : null;
  return {
    day,
    month,
    birthYear,
    showAge,
    isToday,
    age: showAge && age != null ? age : null,
    label: formatPublicBirthdayLabel(day, month, birthYear, showAge),
    shortLabel: `${day} ${(IT_MONTH_NAMES[month] || "").slice(0, 3)}`,
  };
}

function accountUsernameFromUser(user?) {
  if (!user) return "";
  return String(user.username || "").trim();
}

function isUsablePublicDisplayName(name?) {
  const s = String(name || "")
    .replace(/^\u0F04/u, "")
    .replace(/^༄/u, "")
    .trim();
  if (!s || s.length < 2) return false;
  if (/^[\u0F00-\u0FFF\uFE00-\uFEFF\u200D\s]+$/u.test(s)) return false;
  return true;
}

function publicDisplayNameFromMemberOrUser(member?, user?) {
  const m = member || null;
  const u = user || m?.user || null;
  const nick = String(m?.nickname || "").trim();
  if (nick && isUsablePublicDisplayName(nick)) return nick;
  const memberDn = String(m?.displayName || "").trim();
  if (memberDn && isUsablePublicDisplayName(memberDn)) return memberDn;
  const global = String(u?.globalName || "").trim();
  if (global && isUsablePublicDisplayName(global)) return global;
  return accountUsernameFromUser(u);
}

async function fetchDiscordUserForIdentity(client?, guild?, userId?) {
  const id = String(userId || "").trim();
  if (!id) return null;
  let u = client.users.cache.get(id) || null;
  if (!u && client.users?.fetch) {
    u = await Promise.race([
      client.users.fetch(id, { force: false }).catch(() => null),
      new Promise((resolve?) => setTimeout(() => resolve(null), PROFILE_MEMBER_SOFT_TIMEOUT_MS)),
    ]);
  }
  if (!u) {
    const m = guild?.members?.cache?.get?.(id) || readCachedWebsiteMember(id) || null;
    if (m?.user) u = m.user;
  }
  return u;
}

async function resolveMemberForProfileFast(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return null;
  const cached = readCachedWebsiteMember(uid) || guild.members?.cache?.get?.(uid) || null;
  if (cached) return cached;
  return fetchWebsiteGuildMember(guild, uid, {
    timeoutMs: PROFILE_MEMBER_SOFT_TIMEOUT_MS,
    retry: false,
  }).catch(() => null);
}

async function resolveCustomProfileOwnerMember(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return null;
  const cached = readCachedWebsiteMember(uid) || guild.members?.cache?.get?.(uid) || null;
  if (cached) return cached;
  return guild.members.fetch({ user: uid, force: false }).catch(() => null);
}

function boardQuery(board?, guildId?) {
  const g = { guildId, "profile.totals.exp.totalExp": { $gt: 0 } };
  if (board === "level") return g;
  if (board === "weekly") return { ...g, "profile.totals.exp.weeklyExp": { $gt: 0 } };
  if (board === "messages") return { ...g, "profile.totals.messagesTotal": { $gt: 0 } };
  if (board === "voice") return { ...g, "profile.totals.voiceTotalSeconds": { $gt: 0 } };
  if (board === "minigames") {
    return { guildId, "profile.totals.exp.minigame.totalExp": { $gt: 0 } };
  }
  return g;
}

function boardSort(board?) {
  if (board === "level") return { "profile.totals.exp.totalExp": -1 };
  if (board === "weekly") return { "profile.totals.exp.weeklyExp": -1 };
  if (board === "messages") return { "profile.totals.messagesTotal": -1 };
  if (board === "voice") return { "profile.totals.voiceTotalSeconds": -1 };
  if (board === "minigames") return { "profile.totals.exp.minigame.totalExp": -1 };
  return { "profile.totals.exp.totalExp": -1 };
}

function boardSelect() {
  return "userId profile.totals";
}

function numericSortExpr(board?) {
  const sanitizeToLong = (fieldPath?) => ({
    $convert: {
      input: {
        $replaceAll: {
          input: {
            $replaceAll: {
              input: {
                $replaceAll: {
                  input: { $toString: fieldPath },
                  find: ".",
                  replacement: "",
                },
              },
              find: ",",
              replacement: "",
            },
          },
          find: " ",
          replacement: "",
        },
      },
      to: "long",
      onError: 0,
      onNull: 0,
    },
  });
  if (board === "messages") {
    return sanitizeToLong("$profile.totals.messagesTotal");
  }
  if (board === "voice") {
    return sanitizeToLong("$profile.totals.voiceTotalSeconds");
  }
  return null;
}

async function warmGuildMembers(guild?, userIds?) {
  if (!guild?.members?.fetch) return;
  const ids = [
    ...new Set((Array.isArray(userIds) ? userIds : []).map((x?) => String(x || "").trim()).filter(Boolean)),
  ];
  if (!ids.length) return;
  const missing = ids.filter((id?) => !guild.members.cache.has(id));
  if (!missing.length) return;
  try {
    await guild.members.fetch({ user: missing.length === 1 ? missing[0] : missing });
  } catch {
    await Promise.all(missing.map((id?) => guild.members.fetch({ user: id, force: false }).catch(() => null)));
  }
}

async function warmGuildMembersSoft(guild?, userIds?, budgetMs?) {
  const ms = Math.max(50, Number(budgetMs) || LIST_MEMBER_WARM_MS);
  await Promise.race([
    warmGuildMembers(guild, userIds).catch(() => {}),
    new Promise((resolve?) => setTimeout(resolve, ms)),
  ]);
}

function identityFromCacheOnly(client?, guild?, userId?) {
  const id = String(userId || "").trim();
  const out = {
    displayName: "",
    username: "",
    avatar: "",
    memberAvatar: "",
    avatarUrl: "",
    discriminator: "0",
  };
  if (!id) return out;
  const member = guild?.members?.cache?.get?.(id) || readCachedWebsiteMember(id) || null;
  const u = member?.user || client?.users?.cache?.get?.(id) || null;
  if (!u && !member) {
    out.username = id;
    out.displayName = id;
    try {
      const idx = Number((BigInt(id) >> 22n) % 6n);
      out.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      out.avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }
    return out;
  }
  out.username = accountUsernameFromUser(u || member?.user);
  out.displayName = publicDisplayNameFromMemberOrUser(member, u) || out.username;
  const userObj = u || member?.user;
  out.avatar = userObj?.avatar ? String(userObj.avatar) : "";
  out.memberAvatar = member?.avatar ? String(member.avatar) : "";
  out.discriminator = String(userObj?.discriminator || "0");
  const rawAvatarUrl =
    (member && siteMemberAvatarUrl(member, 256)) ||
    userAvatarUrlStatic(userObj, { size: 256 }) ||
    userAvatarUrlDynamic(userObj, { size: 256 }) ||
    "";
  out.avatarUrl =
    animatedDiscordCdnAvatarUrl(rawAvatarUrl, { size: 256 }) ||
    stabilizeDiscordCdnAvatarUrl(rawAvatarUrl, { size: 256 });
  return out;
}

async function fetchUserIdentity(client?, guild?, userId?, opts?) {
  const out = {
    displayName: "",
    username: "",
    avatar: "",
    memberAvatar: "",
    avatarUrl: "",
    discriminator: "0",
  };
  if (!userId) return out;
  const id = String(userId || "").trim();
  const preloaded = opts && Object.prototype.hasOwnProperty.call(opts, "member");
  let member = preloaded
    ? opts.member || null
    : guild?.members?.cache?.get(id) || readCachedWebsiteMember(id) || null;
  if (!member && guild && !preloaded) {
    member = await resolveMemberForProfileFast(guild, id);
  }
  const skipUserFetch = Boolean(opts && opts.skipUserFetch);
  const u =
    member?.user ||
    (skipUserFetch
      ? client?.users?.cache?.get?.(id) || null
      : await fetchDiscordUserForIdentity(client, guild, id));
  if (!u && !member) {
    out.username = "";
    out.displayName = "Utente";
    try {
      const idx = Number((BigInt(id) >> 22n) % 6n);
      out.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      out.avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }
    return out;
  }
  out.username = accountUsernameFromUser(u || member?.user);
  out.displayName = publicDisplayNameFromMemberOrUser(member, u) || out.username;
  const userObj = u || member?.user;
  out.avatar = userObj?.avatar ? String(userObj.avatar) : "";
  out.memberAvatar = member?.avatar ? String(member.avatar) : "";
  out.discriminator = String(userObj?.discriminator || "0");
  const rawAvatarUrl =
    (member && siteMemberAvatarUrl(member, 256)) ||
    userAvatarUrlStatic(userObj, { size: 256 }) ||
    userAvatarUrlDynamic(userObj, { size: 256 }) ||
    "";
  out.avatarUrl =
    animatedDiscordCdnAvatarUrl(rawAvatarUrl, { size: 256 }) ||
    stabilizeDiscordCdnAvatarUrl(rawAvatarUrl, { size: 256 });
  if (!out.avatarUrl && userObj?.id) {
    const h = userObj.avatar;
    if (h) {
      const ext = String(h).startsWith("a_") ? "gif" : "png";
      out.avatarUrl = `https://cdn.discordapp.com/avatars/${userObj.id}/${h}.${ext}?size=256`;
    } else {
      let idx = 0;
      if (/^\d{5,22}$/.test(String(userObj.id)))
        try {
          idx = Number((BigInt(userObj.id) >> 22n) % 6n);
        } catch {
          idx = 0;
        }
      out.avatarUrl = `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    }
  }
  return out;
}

function roleHexPair(role?) {
  if (!role) return { color: "", color2: "", colorMode: "solid" };
  const primary =
    String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
      ? String(role.hexColor || "").trim().toLowerCase()
      : "";
  let color2 = "";
  let tertiary = 0;
  let secondaryInt = 0;
  let primaryInt = 0;
  try {
    primaryInt = Number(role.colors?.primaryColor ?? 0) || 0;
    secondaryInt = Number(role.colors?.secondaryColor ?? 0) || 0;
    tertiary = Number(role.colors?.tertiaryColor ?? 0) || 0;
    if (secondaryInt > 0) {
      color2 = `#${secondaryInt.toString(16).padStart(6, "0")}`.toLowerCase();
    }
  } catch (_) {
      }
    const HOLO_P = 11127295;
  const HOLO_S = 16759788;
  const HOLO_T = 16761760;
  let colorMode = "solid";
  if (primaryInt === HOLO_P && secondaryInt === HOLO_S && tertiary === HOLO_T) {
    colorMode = "holo";
  } else if (secondaryInt > 0) {
    colorMode = "gradient";
  }
  return { color: primary, color2, colorMode };
}

function snowflakeCreatedAtIso(id?) {
  try {
    const sid = String(id || "").trim();
    if (!/^\d{17,22}$/.test(sid)) return "";
    const ms = Number((BigInt(sid) >> 22n) + 1420070400000n);
    if (!Number.isFinite(ms) || ms < 1_420_070_400_000) return "";
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function entityCreatedAtIso(entity?) {
  if (entity?.createdAt) {
    try {
      const d = new Date(entity.createdAt);
      if (Number.isFinite(d.getTime())) return d.toISOString();
    } catch {
          }
  }
  return snowflakeCreatedAtIso(entity?.id);
}

function countVoiceSharedOverwrites(voice?, ownerSid?, botSid?) {
  let count = 0;
  const sharedIds = [];
  if (!voice?.permissionOverwrites?.cache) return { count: 0, sharedIds };
  const V = PermissionsBitField.Flags.ViewChannel;
  const C = PermissionsBitField.Flags.Connect;
  const M = PermissionsBitField.Flags.ManageChannels;
  voice.permissionOverwrites.cache.forEach((overwrite?) => {
    if (overwrite.type !== OverwriteType.Member) return;
    const sid = String(overwrite.id || "");
    if (!sid || sid === ownerSid || (botSid && sid === botSid)) return;
    const allow = overwrite.allow;
    if (!allow?.has?.(V) || !allow?.has?.(C)) return;
    if (allow.has(M)) return;
    sharedIds.push(sid);
    count += 1;
  });
  return { count, sharedIds };
}

const customRoleMembersHydrateAt = new Map();
const customRoleMembersHydrateInflight = new Map();
const CUSTOM_ROLE_MEMBERS_HYDRATE_TTL_MS = 10 * 60 * 1000;

function isSiteApiRestGuild(guild?) {
  return Boolean(guild?.client?._isSiteApiRestClient || (guild?.client?._rest && !guild?.client?.ws));
}

async function hydrateCustomRoleMembersForSiteApi(guild?, roleIds?) {
  if (!isSiteApiRestGuild(guild) || typeof guild?.members?.fetch !== "function") return false;
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return false;
  let needs = false;
  for (const rid of ids) {
    const role = guild.roles.cache.get(rid);
    if (!role) continue;
    if (Number(role.members?.size || 0) <= 1) {
      needs = true;
      break;
    }
  }
  if (!needs) return false;
  const gid = String(guild.id || "");
  const last = Number(customRoleMembersHydrateAt.get(gid) || 0);
  if (last && Date.now() - last < CUSTOM_ROLE_MEMBERS_HYDRATE_TTL_MS) return true;
  let inflight = customRoleMembersHydrateInflight.get(gid);
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => guild.members.fetch())
      .then(() => {
        customRoleMembersHydrateAt.set(gid, Date.now());
        return true;
      })
      .catch(() => false)
      .finally(() => {
        customRoleMembersHydrateInflight.delete(gid);
      });
    customRoleMembersHydrateInflight.set(gid, inflight);
  }
  return inflight;
}

async function buildCustomProfileData(guild?, userId?, opts?) {
  const lite = Boolean(opts && opts.lite);
  const ultraLite = Boolean(opts && opts.ultraLite);
  if (!guild || !userId) return null;
  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId) }).lean().catch(() => null);
  if (!doc || (!doc.roleId && !doc.secondaryRoleId && !doc.customVocChannelId)) return null;
  const ownerSid = String(userId || "").trim();
  const botSid = String(guild.members?.me?.id || guild.client?.user?.id || "").trim();
  const ownerMember = await resolveCustomProfileOwnerMember(guild, ownerSid);
  if (!ownerMember || ownerMember.user?.bot) return null;

    if (ultraLite) {
    const role = doc.roleId ? guild.roles.cache.get(String(doc.roleId)) || null : null;
    const secondaryRole = doc.secondaryRoleId
      ? guild.roles.cache.get(String(doc.secondaryRoleId)) || null
      : null;
    const channelId = String(doc.customVocChannelId || "").trim();
    const voice = channelId ? guild.channels.cache.get(channelId) || null : null;
    const primaryColors = roleHexPair(role);
    const secondaryColors = roleHexPair(secondaryRole);
    const voiceShared = countVoiceSharedOverwrites(voice, ownerSid, botSid);
    let roleMemberCount = Number(role?.members?.size) || 0;
    let secondaryMemberCount = Number(secondaryRole?.members?.size) || 0;
    try {
      const { getFreshMemberIdSnapshot } = require("../Utils/Discord/threadRoleMembers") as typeof import("../Utils/Discord/threadRoleMembers");
      const snap = getFreshMemberIdSnapshot(guild.id);
      if (snap?.byRole) {
        if (role?.id) {
          const ids = snap.byRole.get(String(role.id));
          if (Array.isArray(ids) && ids.length) {
            roleMemberCount = Math.max(roleMemberCount, ids.filter((id?) => id !== ownerSid).length);
          }
        }
        if (secondaryRole?.id) {
          const ids = snap.byRole.get(String(secondaryRole.id));
          if (Array.isArray(ids) && ids.length) {
            secondaryMemberCount = Math.max(
              secondaryMemberCount,
              ids.filter((id?) => id !== ownerSid).length,
            );
          }
        }
      }
    } catch {
          }
        if (role?.members?.size) {
      let shared = 0;
      for (const m of role.members.values()) {
        if (m?.user?.bot) continue;
        if (String(m.id) === ownerSid) continue;
        shared += 1;
      }
      roleMemberCount = Math.max(roleMemberCount, shared);
    }
    if (secondaryRole?.members?.size) {
      let shared = 0;
      for (const m of secondaryRole.members.values()) {
        if (m?.user?.bot) continue;
        if (String(m.id) === ownerSid) continue;
        shared += 1;
      }
      secondaryMemberCount = Math.max(secondaryMemberCount, shared);
    }
    return {
      expiresAt: doc?.expiresAt ? new Date(doc.expiresAt).toISOString() : "",
      role: role
        ? {
            id: String(role.id),
            name: String(role.name || "Ruolo personalizzato"),
            color: primaryColors.color,
            color2: primaryColors.color2,
            colorMode: primaryColors.colorMode || "solid",
            emoji: String(role.unicodeEmoji || "").trim(),
            ...(() => {
              const ic = discordRoleIconUrl(role, { size: 128 });
              return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
            })(),
            createdAt: entityCreatedAtIso(role),
            memberCount: roleMemberCount,
            sharedMembers: [],
          }
        : doc.roleId
          ? {
              id: String(doc.roleId),
              name: "Ruolo personalizzato",
              color: "",
              color2: "",
              colorMode: "solid",
              emoji: "",
              iconUrl: "",
              createdAt: snowflakeCreatedAtIso(doc.roleId),
              memberCount: 0,
              sharedMembers: [],
            }
          : null,
      secondaryRole: secondaryRole
        ? {
            id: String(secondaryRole.id),
            name: String(secondaryRole.name || "Ruolo personalizzato secondario"),
            color: secondaryColors.color,
            color2: secondaryColors.color2,
            colorMode: secondaryColors.colorMode || "solid",
            emoji: String(secondaryRole.unicodeEmoji || "").trim(),
            ...(() => {
              const ic = discordRoleIconUrl(secondaryRole, { size: 128 });
              return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
            })(),
            createdAt: entityCreatedAtIso(secondaryRole),
            memberCount: secondaryMemberCount,
            sharedMembers: [],
          }
        : null,
      voice: voice
        ? {
            id: String(voice.id || ""),
            name: String(voice.name || "Canale vocale privato"),
            emoji: String(doc?.customVocEmoji || "").trim(),
            createdAt: entityCreatedAtIso(voice),
            memberCount: voiceShared.count,
            sharedMembers: [],
          }
        : channelId
          ? {
              id: channelId,
              name: "Canale vocale privato",
              emoji: String(doc?.customVocEmoji || "").trim(),
              createdAt: snowflakeCreatedAtIso(channelId),
              memberCount: 0,
              sharedMembers: [],
            }
          : null,
    };
  }

  const role =
    doc.roleId
      ? guild.roles.cache.get(String(doc.roleId)) || (await guild.roles.fetch(String(doc.roleId)).catch(() => null))
      : null;
  const secondaryRole =
    doc.secondaryRoleId
      ? guild.roles.cache.get(String(doc.secondaryRoleId)) || (await guild.roles.fetch(String(doc.secondaryRoleId)).catch(() => null))
      : null;
  const channelId = String(doc.customVocChannelId || "").trim();
  const storedVoice = channelId
    ? guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))
    : null;
  const voice =
    storedVoice ||
    findCustomVoiceByOwner(guild, userId) ||
    (role ? findCustomVoiceByRole(guild, role.id) : null) ||
    (secondaryRole ? findCustomVoiceByRole(guild, secondaryRole.id) : null);

  if (voice?.id && String(doc.customVocChannelId || "") !== String(voice.id)) {
    await CustomRole.updateOne(
      { guildId: guild.id, userId: String(userId) },
      { $set: { customVocChannelId: String(voice.id) } },
    ).catch(() => null);
  }

    await hydrateCustomRoleMembersForSiteApi(guild, [
    role?.id || doc.roleId,
    secondaryRole?.id || doc.secondaryRoleId,
  ]);

  let roleMembers = role?.members ? Array.from(role.members.values()).filter((m?: any) => !m.user?.bot) : [];
  if (role && roleMembers.length === 0) {
        const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot && ownerMember.roles?.cache?.has?.(role.id)) {
      roleMembers = [ownerMember];
    }
  }
    try {
    const { getFreshMemberIdSnapshot } = require("../Utils/Discord/threadRoleMembers") as typeof import("../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && role?.id) {
      const ids = snap.byRole.get(String(role.id)) || [];
      if (Array.isArray(ids) && ids.length) {
        const have = new Set(roleMembers.map((m?: any) => String(m.id)));
        const missing = ids.filter((id?) => id && !have.has(String(id))).slice(0, lite ? 12 : 40);
        for (const id of missing) {
          const m = guild.members.cache.get(String(id));
          if (m && !m.user?.bot && m.roles?.cache?.has?.(role.id)) roleMembers.push(m);
        }
        const stillMissing = missing.filter((id?) => !guild.members.cache.has(String(id))).slice(0, lite ? 8 : 16);
        if (stillMissing.length) {
          await Promise.all(
            stillMissing.map((id?) => guild.members.fetch({ user: String(id), force: false }).catch(() => null)),
          );
          for (const id of stillMissing) {
            const m = guild.members.cache.get(String(id));
            if (
              m &&
              !m.user?.bot &&
              m.roles?.cache?.has?.(role.id) &&
              !roleMembers.some((x?: any) => String(x.id) === String(id))
            ) {
              roleMembers.push(m);
            }
          }
        }
      }
    }
  } catch {
      }
  const mapSharedMember = (member?, isOwner?) => ({
    id: String(member.id || member.user?.id || ""),
    username: String(member.user?.username || "").trim(),
    displayName: String(member.displayName || member.user?.globalName || member.user?.username || "Utente").trim(),
    avatarUrl: siteMemberAvatarUrl(member, 128),
    isOwner: Boolean(isOwner),
  });
  const sortSharedMembers = (a?, b?) => {
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return String(a.displayName || a.username || "").localeCompare(String(b.displayName || b.username || ""), "it");
  };
  const roleSharedMembers = roleMembers
    .map((member?: any) => mapSharedMember(member, String(member.id || member.user?.id || "") === ownerSid))
    .filter((member?) => member.id)
    .sort(sortSharedMembers)
    .slice(0, 60);
  if (ownerSid && role && !roleSharedMembers.some((m?) => m.id === ownerSid)) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      roleSharedMembers.unshift(mapSharedMember(ownerMember, true));
    } else {
      roleSharedMembers.unshift({ id: ownerSid, username: "", displayName: "Tu", avatarUrl: "", isOwner: true });
    }
  }
      let roleSharedCount = roleSharedMembers.filter((m?) => !m.isOwner).length;
  if (role?.members?.size) {
    let fromCache = 0;
    for (const m of role.members.values()) {
      if (m?.user?.bot) continue;
      if (String(m.id) === ownerSid) continue;
      fromCache += 1;
    }
    roleSharedCount = Math.max(roleSharedCount, fromCache);
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../Utils/Discord/threadRoleMembers") as typeof import("../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && role?.id) {
      const ids = snap.byRole.get(String(role.id)) || [];
      const fromSnap = ids.filter((id?) => id && String(id) !== ownerSid).length;
      roleSharedCount = Math.max(roleSharedCount, fromSnap);
    }
  } catch {
      }
  let secondaryRoleMembers = secondaryRole?.members
    ? Array.from(secondaryRole.members.values()).filter((m?: any) => !m.user?.bot)
    : [];
  if (secondaryRole && secondaryRoleMembers.length === 0) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot && ownerMember.roles?.cache?.has?.(secondaryRole.id)) {
      secondaryRoleMembers = [ownerMember];
    }
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../Utils/Discord/threadRoleMembers") as typeof import("../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && secondaryRole?.id) {
      const ids = snap.byRole.get(String(secondaryRole.id)) || [];
      if (Array.isArray(ids) && ids.length) {
        const have = new Set(secondaryRoleMembers.map((m?: any) => String(m.id)));
        const missing = ids.filter((id?) => id && !have.has(String(id))).slice(0, lite ? 12 : 40);
        for (const id of missing) {
          const m = guild.members.cache.get(String(id));
          if (m && !m.user?.bot && m.roles?.cache?.has?.(secondaryRole.id)) secondaryRoleMembers.push(m);
        }
        const stillMissing = missing.filter((id?) => !guild.members.cache.has(String(id))).slice(0, lite ? 8 : 16);
        if (stillMissing.length) {
          await Promise.all(
            stillMissing.map((id?) => guild.members.fetch({ user: String(id), force: false }).catch(() => null)),
          );
          for (const id of stillMissing) {
            const m = guild.members.cache.get(String(id));
            if (
              m &&
              !m.user?.bot &&
              m.roles?.cache?.has?.(secondaryRole.id) &&
              !secondaryRoleMembers.some((x?: any) => String(x.id) === String(id))
            ) {
              secondaryRoleMembers.push(m);
            }
          }
        }
      }
    }
  } catch {
      }
  const secondaryRoleSharedMembers = secondaryRoleMembers
    .map((member?: any) => mapSharedMember(member, String(member.id || member.user?.id || "") === ownerSid))
    .filter((member?) => member.id)
    .sort(sortSharedMembers)
    .slice(0, 60);
  if (ownerSid && secondaryRole && !secondaryRoleSharedMembers.some((m?) => m.id === ownerSid)) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      secondaryRoleSharedMembers.unshift(mapSharedMember(ownerMember, true));
    } else {
      secondaryRoleSharedMembers.unshift({ id: ownerSid, username: "", displayName: "Tu", avatarUrl: "", isOwner: true });
    }
  }
  const secondaryRoleSharedCountResolved = secondaryRoleSharedMembers.filter((m?) => !m.isOwner).length;
  let secondaryRoleSharedCount = secondaryRoleSharedCountResolved;
  if (secondaryRole?.members?.size) {
    let fromCache = 0;
    for (const m of secondaryRole.members.values()) {
      if (m?.user?.bot) continue;
      if (String(m.id) === ownerSid) continue;
      fromCache += 1;
    }
    secondaryRoleSharedCount = Math.max(secondaryRoleSharedCount, fromCache);
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../Utils/Discord/threadRoleMembers") as typeof import("../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && secondaryRole?.id) {
      const ids = snap.byRole.get(String(secondaryRole.id)) || [];
      const fromSnap = ids.filter((id?) => id && String(id) !== ownerSid).length;
      secondaryRoleSharedCount = Math.max(secondaryRoleSharedCount, fromSnap);
    }
  } catch {
      }
    const voiceSharedMeta = countVoiceSharedOverwrites(voice, ownerSid, botSid);
  let voiceSharedCount = voiceSharedMeta.count;
  const voiceSharedMembers = [];
  if (voice?.permissionOverwrites?.cache) {
    const sharedIds = voiceSharedMeta.sharedIds;
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      voiceSharedMembers.push(mapSharedMember(ownerMember, true));
    } else if (ownerSid) {
      voiceSharedMembers.push({
        id: ownerSid,
        username: "",
        displayName: "Tu",
        avatarUrl: "",
        isOwner: true,
      });
    }
    const sharedSlice = sharedIds.slice(0, lite ? 12 : 59);
    if (!lite) {
      const missing = sharedSlice.filter((sid?) => !guild.members.cache.has(sid)).slice(0, 16);
      if (missing.length) {
        await Promise.all(
          missing.map((sid?) => guild.members.fetch({ user: sid, force: false }).catch(() => null)),
        );
      }
    } else {
      const missing = sharedSlice.filter((sid?) => !guild.members.cache.has(sid)).slice(0, 8);
      if (missing.length) {
        await Promise.all(
          missing.map((sid?) => guild.members.fetch({ user: sid, force: false }).catch(() => null)),
        );
      }
    }
    for (const sid of sharedSlice) {
      const member = guild.members.cache.get(sid);
      if (!member || member.user?.bot) continue;
      voiceSharedMembers.push(mapSharedMember(member, false));
    }
    voiceSharedMembers.sort(sortSharedMembers);
  }

  const primaryColors = roleHexPair(role);
  const secondaryColors = roleHexPair(secondaryRole);

  return {
    expiresAt: doc?.expiresAt ? new Date(doc.expiresAt).toISOString() : "",
    role: role
      ? {
          id: String(role.id),
          name: String(role.name || "Ruolo personalizzato"),
          color: primaryColors.color,
          color2: primaryColors.color2,
          colorMode: primaryColors.colorMode || "solid",
          emoji: String(role.unicodeEmoji || "").trim(),
          ...(() => {
            const ic = discordRoleIconUrl(role, { size: 128 });
            return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
          })(),
          createdAt: entityCreatedAtIso(role),
          memberCount: roleSharedCount,
          sharedMembers: roleSharedMembers,
        }
      : null,
    secondaryRole: secondaryRole
      ? {
          id: String(secondaryRole.id),
          name: String(secondaryRole.name || "Ruolo personalizzato secondario"),
          color: secondaryColors.color,
          color2: secondaryColors.color2,
          colorMode: secondaryColors.colorMode || "solid",
          emoji: String(secondaryRole.unicodeEmoji || "").trim(),
          ...(() => {
            const ic = discordRoleIconUrl(secondaryRole, { size: 128 });
            return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
          })(),
          createdAt: entityCreatedAtIso(secondaryRole),
          memberCount: secondaryRoleSharedCount,
          sharedMembers: secondaryRoleSharedMembers,
        }
      : null,
    voice: voice
      ? {
          id: String(voice.id || ""),
          name: String(voice.name || "Canale vocale privato"),
          emoji: String(doc?.customVocEmoji || "").trim(),
          createdAt: entityCreatedAtIso(voice),
          memberCount: voiceSharedCount,
          sharedMembers: voiceSharedMembers,
        }
      : null,
  };
}

function pctBar(value?, pageMax?) {
  const v = Math.max(0, Number(value) || 0);
  const m = Math.max(1, Number(pageMax) || 1);
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

function firstQueryString(val?) {
  if (val == null) return "";
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return String(val).trim();
}

function parseSearchUserId(raw?) {
  const s = firstQueryString(raw).replace(/\D/g, "");
  if (!/^\d{17,20}$/.test(s)) return "";
  return s;
}

function siteRomeDayOverridesFromDoc(doc?, board?, romeDateKey?) {
  if (!doc || (board !== "messages" && board !== "voice")) return {};
  const totals = doc?.profile?.totals || {};
  const dateKey = String(romeDateKey || "").trim();
  const dailyMap = totals?.daily && typeof totals.daily === "object" ? totals.daily : {};
  const hasDayRow = Object.prototype.hasOwnProperty.call(dailyMap, dateKey);
  const dayRow = hasDayRow ? dailyMap[dateKey] || {} : {};
  const dayText = nInt(dayRow?.textCount);
  const dayVoice = nInt(dayRow?.voiceSeconds);
  const fallbackMessagesDaily =
    String(totals?.messagesDailyKey || "").trim() === dateKey ? nInt(totals?.messagesDaily) : 0;
  const fallbackVoiceDaily =
    String(totals?.voiceDailyKey || "").trim() === dateKey ? nInt(totals?.voiceDailySeconds) : 0;
  let liveVoiceSeconds = 0;
  const startedAt = totals?.sessionStartedAt ? new Date(totals.sessionStartedAt).getTime() : NaN;
  if (Number.isFinite(startedAt)) {
    liveVoiceSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  }
  if (board === "messages") {
    return { messagesDaily: Math.max(hasDayRow ? dayText : 0, fallbackMessagesDaily) };
  }
  return {
    voiceDailySeconds: Math.max(hasDayRow ? dayVoice : 0, fallbackVoiceDaily) + liveVoiceSeconds,
  };
}

function sortHourlyBreakdownForBoard(breakdown?, board?) {
  const base = Array.isArray(breakdown) ? breakdown : [];
  if (board === "weekly") return base.slice();
  if (board === "messages") {
    return base.filter((r?) => nInt(r?.textCount) > 0).sort((a?, b?) => nInt(b.textCount) - nInt(a.textCount));
  }
  if (board === "voice") {
    return base.filter((r?) => nInt(r?.voiceSeconds) > 0).sort((a?, b?) => nInt(b.voiceSeconds) - nInt(a.voiceSeconds));
  }
  return base.slice();
}

const SEARCH_SELECT =
  "userId profile.totals.exp profile.totals.hourly profile.totals.daily profile.totals.messagesTotal profile.totals.messagesWeekly profile.totals.messagesDaily profile.totals.messagesDailyKey profile.totals.voiceTotalSeconds profile.totals.voiceWeeklySeconds profile.totals.voiceDailySeconds profile.totals.voiceDailyKey profile.totals.sessionStartedAt profile.rankCard profile.birthday profile.events.halloween.candy";

function buildWeeklyMultiplierSources(member?, settings?, fallbackGlobalExpMultiplier?) {
  const sources = [];
  const globalBase = Number(settings?.baseMultiplier);
  const globalEvent = Number(settings?.eventMultiplier);
  const effectiveGlobal =
    Number.isFinite(globalBase) && globalBase > 0
      ? globalBase * (Number.isFinite(globalEvent) && globalEvent > 0 ? globalEvent : 1)
      : Number(fallbackGlobalExpMultiplier) > 0
        ? Number(fallbackGlobalExpMultiplier)
        : 1;
  const map = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : new Map();
  const veteranoRoleId = String(IDs.roles?.Veterano || "").trim();

  sources.push({
    key: "base",
    label: "Base",
    type: "base",
    multiplier: Number(Math.max(1, effectiveGlobal).toFixed(2)),
    contribution: Number(Math.max(1, effectiveGlobal).toFixed(2)),
    active: true,
  });

  const roleSources = [];
  let chosenRoleId = "";
  let chosenRoleMultiplier = 1;
  let chosenRoleSpecific = false;
  let veteranoMulti = 1;
  let veteranoPresent = false;

  if (member?.roles?.cache && map.size) {
    for (const [roleId, value] of map.entries()) {
      if (!member.roles.cache.has(roleId)) continue;
      const parsed = Math.max(1, Number(value) || 1);
      if (parsed <= 1) continue;
      const roleObj = member.roles.cache.get(roleId);
      const id = String(roleId || "");
      const isVeterano = Boolean(veteranoRoleId && id === veteranoRoleId);
      if (isVeterano) {
        veteranoPresent = true;
        veteranoMulti = Math.max(veteranoMulti, parsed);
      } else if (parsed > chosenRoleMultiplier || !chosenRoleSpecific) {
        chosenRoleId = id;
        chosenRoleMultiplier = parsed;
        chosenRoleSpecific = true;
      }
      roleSources.push({
        key: "role:" + id,
        label: String(roleObj?.name || "Ruolo bonus"),
        type: "role",
        multiplier: Number(parsed.toFixed(2)),
        contribution: Number((parsed - 1).toFixed(2)),
        color:
          String(roleObj?.hexColor || "").trim() && String(roleObj?.hexColor || "").trim() !== "#000000"
            ? String(roleObj.hexColor || "").trim()
            : "",
        roleId: id,
        position: Number(roleObj?.position || 0),
        isVeterano,
        active: false,
      });
    }
  }

  if (!chosenRoleSpecific && veteranoPresent && veteranoMulti > 1) {
    chosenRoleId = veteranoRoleId;
    chosenRoleMultiplier = veteranoMulti;
  }

  roleSources
    .sort((a?, b?) => {
      if (b.multiplier !== a.multiplier) return b.multiplier - a.multiplier;
      return Number(b.position || 0) - Number(a.position || 0);
    })
    .forEach((row?) => {
      const active = Boolean(chosenRoleId && String(row.roleId) === String(chosenRoleId));
      sources.push({
        key: row.key,
        label: row.label,
        type: row.type,
        multiplier: row.multiplier,
        contribution: row.contribution,
        color: row.color,
        active,
        ...(active && chosenRoleMultiplier > 1 ? { applied: true } : {}),
      });
    });

  return sources;
}

async function getCachedWeeklyHourlySorted(guild?) {
  if (!guild) return [];
  const cacheKey = `v1:${guild.id}:weekly-hourly-sorted`;
  const cached = cacheGet(cacheKey);
  if (Array.isArray(cached)) return cached;
  return cacheGetOrBuild(cacheKey, async () => {
    const breakdown = await computeLeaderboardRows(guild, "weekly", 8000).catch(() => []);
    return sortHourlyBreakdownForBoard(breakdown, "weekly");
  });
}

function peekCachedWeeklyHourlySorted(guild?) {
  if (!guild) return [];
  const cached = cacheGet(`v1:${guild.id}:weekly-hourly-sorted`);
  return Array.isArray(cached) ? cached : [];
}

async function computeUserSearchRankMeta({
  guild,
  guildId,
  board,
  doc,
  searchId,
  weeklySorted,
  romeDayKey,
  weeklyHourlyExp,
  profileFast,
}) {
  let pageMaxSecondary = 1;
  let hourlySingular = null;
  let searchRank = 1;
  const useHourlyBoard = Boolean(guild) && board === "weekly";
  if (useHourlyBoard) {
    const sorted = Array.isArray(weeklySorted) ? weeklySorted : [];
    const expFromDoc = weeklyHourlyExp != null ? nInt(weeklyHourlyExp) : null;
    if (sorted.length) {
      const idx = sorted.findIndex((r?) => String(r.userId) === searchId);
      const agg = idx >= 0 ? sorted[idx] : null;
      searchRank = idx >= 0 ? idx + 1 : 0;
      const exp = expFromDoc != null ? expFromDoc : nInt(agg?.exp ?? 0);
      pageMaxSecondary = Math.max(1, exp);
      hourlySingular = { weeklyExp: exp };
    } else if (expFromDoc != null && expFromDoc > 0) {
      hourlySingular = { weeklyExp: expFromDoc };
      pageMaxSecondary = Math.max(1, expFromDoc);
      searchRank = 0;
    } else {
      searchRank = 0;
      pageMaxSecondary = 1;
      hourlySingular = { weeklyExp: 0 };
    }
  } else if (board === "weekly") {
    const we = nInt(doc.profile?.totals?.exp?.weeklyExp);
    pageMaxSecondary = Math.max(1, we);
    const higher = await ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.weeklyExp": { $gt: we },
    }).catch(() => 0);
    searchRank = higher + 1;
  } else if (board === "messages") {
    const mt = nInt(doc.profile?.totals?.messagesTotal);
    pageMaxSecondary = Math.max(1, mt);
    if (profileFast) {
      const higher = mt > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.totalExp": { $gt: 0 },
            "profile.totals.messagesTotal": { $gt: mt },
          }).catch(() => 0)
        : 0;
      searchRank = mt > 0 ? higher + 1 : 0;
    } else {
      const higherAgg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
        { $addFields: { __sortVal: numericSortExpr("messages") } },
        { $match: { __sortVal: { $gt: mt } } },
        { $count: "n" },
      ]).catch(() => []);
      const higher = nInt(higherAgg?.[0]?.n);
      searchRank = higher + 1;
    }
  } else if (board === "voice") {
    const vs = nInt(doc.profile?.totals?.voiceTotalSeconds);
    pageMaxSecondary = Math.max(1, vs);
    if (profileFast) {
      const higher = vs > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.totalExp": { $gt: 0 },
            "profile.totals.voiceTotalSeconds": { $gt: vs },
          }).catch(() => 0)
        : 0;
      searchRank = vs > 0 ? higher + 1 : 0;
    } else {
      const higherAgg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
        { $addFields: { __sortVal: numericSortExpr("voice") } },
        { $match: { __sortVal: { $gt: vs } } },
        { $count: "n" },
      ]).catch(() => []);
      const higher = nInt(higherAgg?.[0]?.n);
      searchRank = higher + 1;
    }
  } else if (board === "minigames") {
    const mt = nInt(doc.profile?.totals?.exp?.minigame?.totalExp);
    pageMaxSecondary = Math.max(1, mt);
    const higher =
      mt > 0
        ? await ActivityUserProfile.countDocuments({
            guildId,
            "profile.totals.exp.minigame.totalExp": { $gt: mt },
          }).catch(() => 0)
        : 0;
    searchRank = mt > 0 ? higher + 1 : 0;
  } else if (board === "level") {
    const te = nInt(doc.profile?.totals?.exp?.totalExp);
    const higher = await ActivityUserProfile.countDocuments({
      guildId,
      "profile.totals.exp.totalExp": { $gt: te },
    }).catch(() => 0);
    searchRank = higher + 1;
  }
  let overrides: any =
    useHourlyBoard && hourlySingular && board === "weekly" ? { weeklyExp: hourlySingular.weeklyExp } : null;
  let dayOvr: Record<string, any> = {};
  if (guild && (board === "messages" || board === "voice")) {
    dayOvr = siteRomeDayOverridesFromDoc(doc, board, romeDayKey);
  }
  overrides = { ...(overrides || {}), ...dayOvr };
  return { searchRank, pageMaxSecondary, overrides };
}

async function buildBirthdaysMonthPayload(client?, guildId?, month?, year?) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const romeToday = getRomeDateParts();
  const rows = await listBirthdaysForMonth(guildId, month);
  const entries = [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId) continue;
    const member = guild?.members?.cache?.get?.(userId) || readCachedWebsiteMember(userId) || null;
    const identity = await fetchUserIdentity(client, guild, userId, {
      member,
      skipUserFetch: Boolean(member),
    });
    const displayName = String(identity?.displayName || identity?.username || userId).trim() || userId;
    entries.push({
      userId,
      day: row.day,
      month: row.month,
      birthYear: row.showAge ? row.birthYear : null,
      showAge: row.showAge !== false,
      isToday: row.month === romeToday.month && row.day === romeToday.day,
      displayName,
      profileUrl: `/user/?id=${encodeURIComponent(userId)}`,
      label: formatPublicBirthdayLabel(row.day, row.month, row.birthYear, row.showAge),
    });
  }
  entries.sort((a?, b?) => {
    if (a.day !== b.day) return a.day - b.day;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "it", { sensitivity: "base" });
  });
  return {
    ok: true,
    board: "birthdays",
    month,
    year,
    monthLabel: IT_MONTH_NAMES[month] || String(month),
    todayDay: romeToday.month === month ? romeToday.day : null,
    total: entries.length,
    entries,
  };
}

async function buildProfileSearchPayload(client?, guildId?, searchId?) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const doc = await ActivityUserProfile.findOne({ guildId, userId: searchId }).select(SEARCH_SELECT).lean().catch(() => null);
  if (!doc) {
    return {
      ok: true,
      search: true,
      notFound: true,
      board: "profile",
      page: 1,
      perPage: 1,
      total: 0,
      totalPages: 1,
      profile: null,
      rows: {},
    };
  }

  const boards = ["level", "weekly", "messages", "voice", "minigames"];
  const romeDayKey = getRomeDayKey(new Date());
  const weeklySortedPeek = peekCachedWeeklyHourlySorted(guild);
  const weeklyHourlyExp = computeWeeklyExpFromProfileDoc(doc);

      const memberCached =
    (guild && (readCachedWebsiteMember(searchId) || guild.members?.cache?.get?.(searchId))) || null;
  const memberFetchPromise =
    !memberCached && guild
      ? resolveMemberForProfileFast(guild, searchId)
      : null;

  const [member, customProfile, globalExpMultiplierRaw, guildExpSettings] = await Promise.all([
    memberCached
      ? Promise.resolve(memberCached)
      : memberFetchPromise
        ? Promise.race([
            memberFetchPromise,
            new Promise((resolve?) => setTimeout(() => resolve(null), PROFILE_MEMBER_SOFT_TIMEOUT_MS)),
          ])
        : Promise.resolve(null),
    buildCustomProfileData(guild, searchId, { lite: true }),
    getGlobalMultiplier(guildId).catch(() => 1),
    getGuildExpSettings(guildId).catch(() => null),
  ]);

  if (!member && guild) {
        fetchWebsiteGuildMember(guild, searchId, { timeoutMs: 10_000, retry: false })
      .then((m?) => {
        if (!m) return;
        try {
          listCache.delete(`profile:v${PROFILE_CACHE_VER}:${guildId}:${searchId}`);
        } catch {
                  }
      })
      .catch(() => null);
  }

  let globalExpMultiplier = Number(globalExpMultiplierRaw);
  if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;

  const [identity, expMultiplierResolved, ...rankMetas] = await Promise.all([
        fetchUserIdentity(client, guild, searchId, {
      member,
      skipUserFetch: !member,
    }),
    guild && searchId
      ? Promise.race([
          getResolvedWeeklyExpMultiplier(guild, searchId, guildExpSettings).catch(() => null),
          new Promise((resolve?) => setTimeout(() => resolve(null), PROFILE_MEMBER_SOFT_TIMEOUT_MS)),
        ])
      : null,
    ...boards.map((board?) =>
      computeUserSearchRankMeta({
        guild,
        guildId,
        board,
        doc,
        searchId,
        weeklySorted: weeklySortedPeek,
        romeDayKey,
        weeklyHourlyExp: board === "weekly" ? weeklyHourlyExp : undefined,
        profileFast: true,
      }),
    ),
  ]);

  const rows: Record<string, any> = {};
  await Promise.all(
    boards.map(async (board?, i?) => {
      const meta = rankMetas[i];
      rows[board] = await buildRowFromDoc(
        client,
        guild,
        board,
        doc,
        meta.searchRank,
        meta.pageMaxSecondary,
        globalExpMultiplier,
        meta.overrides,
        board === "weekly" ? expMultiplierResolved : null,
        identity,
      );
    }),
  );

  const levelRow = rows.level || {};
  const profileRoles = member?.roles?.cache
    ? [...member.roles.cache.values()]
        .filter((role?) => String(role?.id || "") && String(role.id) !== String(guild?.id || ""))
        .sort((a?, b?) => Number(b?.position || 0) - Number(a?.position || 0))
        .map((role?) => {
          const ic = discordRoleIconUrl(role, { size: 64 });
          return {
            id: String(role.id),
            name: String(role.name || "Ruolo"),
            color:
              String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
                ? String(role.hexColor || "").trim()
                : "",
            emoji: String(role.unicodeEmoji || "").trim(),
            iconUrl: ic.iconUrl,
            iconAnimated: ic.iconAnimated,
          };
        })
    : [];
  const profileAvatarUrl =
    (member && siteMemberAvatarUrl(member, 256)) || String(levelRow.avatarUrl || "").trim();
  const weeklyMultiplierSources = buildWeeklyMultiplierSources(member, guildExpSettings, globalExpMultiplier);
  const effectiveJoined = null;
  const romeToday = getRomeDateParts();
  const publicBirthday = buildPublicBirthdayPayload(doc?.profile?.birthday, romeToday);
  let halloweenCandy = null;
  try {
    const { buildHalloweenCandyProfileSection } = require("../Services/Community/halloweenCandyService") as typeof import("../Services/Community/halloweenCandyService");
    let forceCandyPreview = false;
    try {
      const { memberIsHighStaffEligible } = require("../Utils/Staff/staffRoleHierarchy") as typeof import("../Utils/Staff/staffRoleHierarchy");
      forceCandyPreview = Boolean(member && memberIsHighStaffEligible(member));
    } catch {
      forceCandyPreview = false;
    }
    halloweenCandy = buildHalloweenCandyProfileSection(doc?.profile?.events?.halloween?.candy, client, "", {
      forceVisible: forceCandyPreview,
      guildId: guildId || guild?.id || "",
    });
  } catch {
    halloweenCandy = null;
  }

  return {
    ok: true,
    search: true,
    notFound: false,
    board: "profile",
    page: 1,
    perPage: 1,
    total: 1,
    totalPages: 1,
        _memberResolved: Boolean(member),
    profile: {
      userId: String(levelRow.userId || searchId),
      username: String(levelRow.username || "").trim(),
      displayName: String(
        publicDisplayNameFromMemberOrUser(member, member?.user) ||
          levelRow.displayName ||
          levelRow.username ||
          ""
      ).trim(),
      avatarUrl: String(profileAvatarUrl || "").trim(),
      joinedAt: effectiveJoined
        ? effectiveJoined.toISOString()
        : member?.joinedAt
          ? new Date(member.joinedAt).toISOString()
          : "",
      rankCard: siteSafeRankCard(doc),
      rankCardResolvedWallpaper: siteSafeResolvedWallpaper(doc),
      roles: profileRoles,
      ...(customProfile ? { customProfile } : {}),
      ...(publicBirthday ? { birthday: publicBirthday } : {}),
      ...(Array.isArray(weeklyMultiplierSources) ? { weeklyMultiplierSources } : {}),
      ...(Number.isFinite(Number(expMultiplierResolved)) ? { expMultiplierResolved: Number(expMultiplierResolved) } : {}),
      ...(halloweenCandy ? { halloweenCandy } : {}),
    },
    rows,
  };
}

async function buildRowFromDoc(
  client?,
  guild?,
  board?,
  d?,
  rank?,
  pageMaxSecondary?,
  globalExpMultiplier?,
  overrides?,
  weeklyEffectiveMultiplier?,
  identityPreload?,
) {
  const ov = overrides && typeof overrides === "object" ? overrides : null;
  const userId = String(d.userId || "");
  const id = identityPreload || (await fetchUserIdentity(client, guild, userId));
  if (board === "level") {
    const totalExp = nInt(d.profile?.totals?.exp?.totalExp);
    const li = getLevelInfo(totalExp);
    let level = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.level || 0)));
    if (level < li.level) level = li.level;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      level,
      exp: totalExp,
      currentLevelExp: Number(li.currentLevelExp || 0),
      nextLevelExp: Number(li.nextLevelExp || 0),
      remainingToNext: Number(li.remainingToNext || 0),
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
    };
  }
  if (board === "weekly") {
    const weeklyExp = ov && ov.weeklyExp != null ? nInt(ov.weeklyExp) : nInt(d.profile?.totals?.exp?.weeklyExp);
    const totalExp = nInt(d.profile?.totals?.exp?.totalExp);
    const li = getLevelInfo(totalExp);
    let level = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.level || 0)));
    if (level < li.level) level = li.level;
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      level,
      exp: totalExp,
      weeklyExp,
      weeklyBarPct: pctBar(weeklyExp, pageMaxSecondary),
      currentLevelExp: Number(li.currentLevelExp || 0),
      nextLevelExp: Number(li.nextLevelExp || 0),
      remainingToNext: Number(li.remainingToNext || 0),
      progressPercent: Math.max(0, Math.min(100, Math.round(Number(li.progressPercent || 0)))),
      expMultiplier:
        weeklyEffectiveMultiplier != null
          ? Number(weeklyEffectiveMultiplier)
          : Number(globalExpMultiplier),
    };
  }
  if (board === "messages") {
    const messagesTotal =
      ov && ov.messagesTotal != null ? nInt(ov.messagesTotal) : nInt(d.profile?.totals?.messagesTotal);
    const messagesWeekly =
      ov && ov.messagesWeekly != null ? nInt(ov.messagesWeekly) : nInt(d.profile?.totals?.messagesWeekly);
    const messagesDaily =
      ov && ov.messagesDaily != null ? nInt(ov.messagesDaily) : nInt(d.profile?.totals?.messagesDaily);
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      messagesTotal,
      messagesWeekly,
      messagesDaily,
      messagesWeeklyBarPct: pctBar(messagesTotal, pageMaxSecondary),
    };
  }
  if (board === "voice") {
    const voiceTotalSeconds =
      ov && ov.voiceTotalSeconds != null ? nInt(ov.voiceTotalSeconds) : nInt(d.profile?.totals?.voiceTotalSeconds);
    const voiceWeeklySeconds =
      ov && ov.voiceWeeklySeconds != null
        ? nInt(ov.voiceWeeklySeconds)
        : nInt(d.profile?.totals?.voiceWeeklySeconds);
    const voiceDailySeconds =
      ov && ov.voiceDailySeconds != null ? nInt(ov.voiceDailySeconds) : nInt(d.profile?.totals?.voiceDailySeconds);
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      voiceTotalSeconds,
      voiceWeeklySeconds,
      voiceDailySeconds,
      voiceWeeklyBarPct: pctBar(voiceTotalSeconds, pageMaxSecondary),
    };
  }
  if (board === "minigames") {
    const mg = d.profile?.totals?.exp?.minigame || {};
    const minigameTotalExp =
      ov && ov.minigameTotalExp != null ? nInt(ov.minigameTotalExp) : nInt(mg.totalExp);
    const minigameWeeklyExp =
      ov && ov.minigameWeeklyExp != null ? nInt(ov.minigameWeeklyExp) : nInt(mg.weeklyExp);
    const currentStreak =
      ov && ov.currentStreak != null ? nInt(ov.currentStreak) : nInt(mg.currentStreak);
    const bestStreak = ov && ov.bestStreak != null ? nInt(ov.bestStreak) : nInt(mg.bestStreak);
    return {
      rank,
      userId,
      username: id.username,
      displayName: id.displayName,
      discriminator: id.discriminator,
      avatar: id.avatar,
      memberAvatar: id.memberAvatar || "",
      avatarUrl: id.avatarUrl,
      minigameTotalExp,
      minigameWeeklyExp,
      currentStreak,
      bestStreak,
      minigameBarPct: pctBar(minigameTotalExp, pageMaxSecondary),
    };
  }
  return { rank, userId, username: id.username, displayName: id.displayName };
}

function buildSearchStats(guild?, board?, d?, topAccountUsername?, globalExpMult?, hourlySingular?, activityOverride?, membersApprox?) {
  const ao = activityOverride && typeof activityOverride === "object" ? activityOverride : null;
  let topLevel = 0;
  let topWeeklyExp = 0;
  let topMessagesTotal = 0;
  let topVoiceSeconds = 0;
  let topMinigameTotal = 0;
  if (board === "level") {
    const te = Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.totalExp || 0)));
    const li = getLevelInfo(te);
    topLevel = Math.max(Math.floor(Number(d.profile?.totals?.exp?.level || 0)), li.level);
  } else if (board === "weekly") {
    topWeeklyExp =
      hourlySingular && hourlySingular.weeklyExp != null
        ? nInt(hourlySingular.weeklyExp)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.weeklyExp || 0)));
  } else if (board === "messages") {
    topMessagesTotal =
      ao && ao.messagesTotal != null
        ? nInt(ao.messagesTotal)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.messagesTotal || 0)));
  } else if (board === "voice") {
    topVoiceSeconds =
      ao && ao.voiceSeconds != null
        ? nInt(ao.voiceSeconds)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.voiceTotalSeconds || 0)));
  } else if (board === "minigames") {
    topMinigameTotal =
      ao && ao.minigameTotalExp != null
        ? nInt(ao.minigameTotalExp)
        : Math.max(0, Math.floor(Number(d.profile?.totals?.exp?.minigame?.totalExp || 0)));
  }
  const gm =
    board === "weekly" && globalExpMult != null && Number.isFinite(Number(globalExpMult)) && Number(globalExpMult) > 0
      ? Number(globalExpMult)
      : null;
  const mem =
    membersApprox != null && Number.isFinite(Number(membersApprox)) && Number(membersApprox) > 0
      ? Math.floor(Number(membersApprox))
      : pickMembersFromGuild(guild);
  return {
    rankedUsers: 1,
    membersApprox: mem,
    topDisplayName: String(topAccountUsername || "").trim() || "—",
    topPlayerUsername: String(topAccountUsername || "").trim() || "—",
    topLevel: board === "level" ? topLevel : null,
    topWeeklyExp: board === "weekly" ? topWeeklyExp : null,
    topMessagesTotal: board === "messages" ? topMessagesTotal : null,
    topVoiceSeconds: board === "voice" ? topVoiceSeconds : null,
    topMinigameTotal: board === "minigames" ? topMinigameTotal : null,
    globalExpMultiplier: gm,
  };
}

function pickMembersFromGuild(guild?) {
  const n = Number(guild?.memberCount ?? guild?.approximateMemberCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

async function handleSiteUsersLeaderboardGet(client?, req?, res?) {
  try {
    const guildId = resolveGuildId(client);
    if (!guildId) {
      return res.status(503).json({ ok: false, error: "no_guild", message: "Guild non configurata." });
    }
    const q = req.query || {};
    const perfTier = resolveSitePerfTier(req);
    const lite = isLitePerf(req);
    const board = parseBoard(q.board);
    const searchId = parseSearchUserId(q.userId ?? q.user_id ?? q.id ?? q.searchUserId ?? q.uid);

    if (board === "birthdays") {
      const romeToday = getRomeDateParts();
      const month = parseCalendarMonth(q.month, romeToday.month);
      const year = parseCalendarYear(q.year, romeToday.year);
      const birthdaysCacheKey = `birthdays:v1:${guildId}:${year}:${month}`;
      const cachedBirthdays = cacheGet(birthdaysCacheKey);
      if (cachedBirthdays) {
        return replyUsers(req, res, cachedBirthdays, "public, max-age=60");
      }
      const payload = await buildBirthdaysMonthPayload(client, guildId, month, year);
      cacheSet(birthdaysCacheKey, payload, BIRTHDAYS_CACHE_TTL_MS);
      return replyUsers(req, res, payload, "public, max-age=60");
    }

    if (searchId && board === "profile") {
      const profileCacheKey = `profile:v${PROFILE_CACHE_VER}:${guildId}:${searchId}`;
      /* leaveProfileLive1: never serve cached in-guild snapshot after leave/negative */
      const { isOnNegativeCache } = require("../Utils/Web/websiteGuildMemberFetch") as typeof import("../Utils/Web/websiteGuildMemberFetch");
      if (isOnNegativeCache(searchId)) {
        try {
          listCache.delete(profileCacheKey);
        } catch (_) {}
        const gone = {
          ok: true,
          search: true,
          notFound: true,
          leftGuild: true,
          inGuild: false,
          board: "profile",
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          profile: null,
          rows: {},
        };
        res.setHeader("Cache-Control", "no-store");
        return res.json(gone);
      }
      const profileMeta = cacheLookupMeta(profileCacheKey, PROFILE_STALE_KEEP_MS);
      if (profileMeta.hit && !profileMeta.stale) {
        return replyUsers(req, res, profileMeta.hit, "public, max-age=15");
      }
      if (profileMeta.hit && profileMeta.stale) {
        startCacheBuild(profileCacheKey, async () => {
          const rebuilt: any = await buildProfileSearchPayload(client, guildId, searchId);
          const memberResolved = Boolean(rebuilt && rebuilt._memberResolved);
          if (rebuilt && Object.prototype.hasOwnProperty.call(rebuilt, "_memberResolved")) {
            delete rebuilt._memberResolved;
          }
          if (rebuilt && !rebuilt.notFound) {
            rebuilt.inGuild = memberResolved;
            if (rebuilt.profile && typeof rebuilt.profile === "object") {
              rebuilt.profile.inGuild = memberResolved;
            }
          }
          if (!rebuilt.notFound && memberResolved) return rebuilt;
          return profileMeta.hit;
        }, PROFILE_CACHE_TTL_MS).catch((err?) => {
          global.logger?.warn?.("[WEBHOOK] site-users profile swr:", err?.message || err);
        });
        return replyUsers(req, res, profileMeta.hit, "public, max-age=5, stale-while-revalidate=120", {
          "X-VC-Users-Stale": "1",
        });
      }
      const payload: any = await buildProfileSearchPayload(client, guildId, searchId);
      const memberResolved = Boolean(payload && payload._memberResolved);
      if (payload && Object.prototype.hasOwnProperty.call(payload, "_memberResolved")) {
        delete payload._memberResolved;
      }
      if (payload && !payload.notFound) {
        payload.inGuild = memberResolved;
        if (payload.profile && typeof payload.profile === "object") {
          payload.profile.inGuild = memberResolved;
        }
      }
      if (!payload.notFound && memberResolved) {
        cacheSet(profileCacheKey, payload, PROFILE_CACHE_TTL_MS);
      }
      res.setHeader("Cache-Control", payload.notFound ? "no-store" : "public, max-age=45");
      if (payload.notFound) return res.json(payload);
      return replyUsers(req, res, payload, "public, max-age=45");
    }

    if (searchId) {
      const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
      const membersApprox = await resolveMembersApprox(client, guild, guildId);
      const doc = await ActivityUserProfile.findOne({ guildId, userId: searchId }).select(SEARCH_SELECT).lean().catch(() => null);
      if (!doc) {
        res.setHeader("Cache-Control", "no-store");
        return res.json({
          ok: true,
          search: true,
          notFound: true,
          board,
          page: 1,
          perPage: 1,
          total: 0,
          totalPages: 1,
          stats: {
            rankedUsers: 0,
            membersApprox,
            topDisplayName: "",
            topPlayerUsername: "",
            topLevel: null,
            topWeeklyExp: null,
            topMessagesTotal: null,
            topVoiceSeconds: null,
            topMinigameTotal: null,
            globalExpMultiplier: null,
          },
          rows: [],
        });
      }
      let pageMaxSecondary = 1;
      let hourlySingular = null;
      let searchRank = 1;
      const useHourlyBoard = Boolean(guild) && board === "weekly";
      if (useHourlyBoard) {
        const cap = 8000;
        const breakdown = await computeLeaderboardRows(guild, "weekly", cap).catch(() => []);
        const sorted = sortHourlyBreakdownForBoard(breakdown, "weekly");
        const idx = sorted.findIndex((r?) => String(r.userId) === searchId);
        const agg = idx >= 0 ? sorted[idx] : null;
        searchRank = idx >= 0 ? idx + 1 : 0;
        pageMaxSecondary = Math.max(1, nInt(agg?.exp ?? 0));
        hourlySingular = { weeklyExp: nInt(agg?.exp ?? 0) };
      } else if (board === "weekly") {
        const we = nInt(doc.profile?.totals?.exp?.weeklyExp);
        pageMaxSecondary = Math.max(1, we);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.weeklyExp": { $gt: we },
        }).catch(() => 0);
        searchRank = higher + 1;
      } else if (board === "messages") {
        const mt = nInt(doc.profile?.totals?.messagesTotal);
        pageMaxSecondary = Math.max(1, mt);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
          { $addFields: { __sortVal: numericSortExpr("messages") } },
          { $match: { __sortVal: { $gt: mt } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = higher + 1;
      } else if (board === "voice") {
        const vs = nInt(doc.profile?.totals?.voiceTotalSeconds);
        pageMaxSecondary = Math.max(1, vs);
        const higherAgg = await ActivityUserProfile.aggregate([
          { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
          { $addFields: { __sortVal: numericSortExpr("voice") } },
          { $match: { __sortVal: { $gt: vs } } },
          { $count: "n" },
        ]).catch(() => []);
        const higher = nInt(higherAgg?.[0]?.n);
        searchRank = higher + 1;
      } else if (board === "minigames") {
        const mt = nInt(doc.profile?.totals?.exp?.minigame?.totalExp);
        pageMaxSecondary = Math.max(1, mt);
        const higher =
          mt > 0
            ? await ActivityUserProfile.countDocuments({
                guildId,
                "profile.totals.exp.minigame.totalExp": { $gt: mt },
              }).catch(() => 0)
            : 0;
        searchRank = mt > 0 ? higher + 1 : 0;
      } else if (board === "level") {
        const te = nInt(doc.profile?.totals?.exp?.totalExp);
        const higher = await ActivityUserProfile.countDocuments({
          guildId,
          "profile.totals.exp.totalExp": { $gt: te },
        }).catch(() => 0);
        searchRank = higher + 1;
      }
      let globalExpMultiplier = 1;
      let guildExpSettings = null;
      if (board === "weekly") {
        globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
        if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
        guildExpSettings = await getGuildExpSettings(guildId).catch(() => null);
      }
      let overrides: any =
        useHourlyBoard && hourlySingular && board === "weekly"
          ? { weeklyExp: hourlySingular.weeklyExp }
          : null;
      let dayOvr: Record<string, any> = {};
      if (guild && (board === "messages" || board === "voice")) {
        const rk = getRomeDayKey(new Date());
        dayOvr = siteRomeDayOverridesFromDoc(doc, board, rk);
      }
      overrides = { ...(overrides || {}), ...dayOvr };
      const expMultiplierResolved =
        guild && searchId ? await getResolvedWeeklyExpMultiplier(guild, searchId, guildExpSettings).catch(() => null) : null;
      const weeklyEffectiveMultiplier = board === "weekly" ? expMultiplierResolved : null;
      const row = await buildRowFromDoc(client, guild, board, doc, searchRank, pageMaxSecondary, globalExpMultiplier, overrides, weeklyEffectiveMultiplier);
      const stats: any = buildSearchStats(guild, board, doc, row.username, globalExpMultiplier, hourlySingular, null, membersApprox);
      const member =
        guild?.members?.cache?.get?.(searchId) || (guild ? await guild.members.fetch({ user: searchId, force: true }).catch(() => null) : null);
      const profileAvatarUrl =
        (member && siteMemberAvatarUrl(member, 256)) || String(row.avatarUrl || "").trim();
      const profileRoles = member?.roles?.cache
        ? [...member.roles.cache.values()]
            .filter((role?) => String(role?.id || "") && String(role.id) !== String(guild?.id || ""))
            .sort((a?, b?) => Number(b?.position || 0) - Number(a?.position || 0))
            .map((role?) => {
              const ic = discordRoleIconUrl(role, { size: 64 });
              return {
                id: String(role.id),
                name: String(role.name || "Ruolo"),
                color:
                  String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
                    ? String(role.hexColor || "").trim()
                    : "",
                emoji: String(role.unicodeEmoji || "").trim(),
                iconUrl: ic.iconUrl,
                iconAnimated: ic.iconAnimated,
              };
            })
        : [];
      const weeklyMultiplierSources =
        board === "weekly" ? buildWeeklyMultiplierSources(member, guildExpSettings, globalExpMultiplier) : null;
      const customProfile = await buildCustomProfileData(guild, searchId);
      const effectiveJoined = member ? await getEffectiveJoinedAt(member).catch(() => null) : null;
      if (guild && (board === "messages" || board === "voice")) {
        stats.siteRomeCalendarDay = getRomeDayKey(new Date());
      }
      res.setHeader("Cache-Control", "no-store");
      return res.json({
        ok: true,
        search: true,
        notFound: false,
        board,
        page: 1,
        perPage: 1,
        total: 1,
        totalPages: 1,
        stats,
        profile: {
          userId: String(row.userId || searchId),
          username: String(row.username || "").trim(),
          displayName: String(
            publicDisplayNameFromMemberOrUser(member, member?.user) ||
              row.displayName ||
              row.username ||
              ""
          ).trim(),
          avatarUrl: String(profileAvatarUrl || "").trim(),
          joinedAt: effectiveJoined
            ? effectiveJoined.toISOString()
            : member?.joinedAt
              ? new Date(member.joinedAt).toISOString()
              : "",
          rankCard: siteSafeRankCard(doc),
          rankCardResolvedWallpaper: siteSafeResolvedWallpaper(doc),
          roles: profileRoles,
          ...(customProfile ? { customProfile } : {}),
          ...(Array.isArray(weeklyMultiplierSources) ? { weeklyMultiplierSources } : {}),
          ...(Number.isFinite(Number(expMultiplierResolved)) ? { expMultiplierResolved: Number(expMultiplierResolved) } : {}),
        },
        rows: [row],
      });
    }

    const page = parseIntSafe(q.page, 1, 100000, 1);
    /* ulNineAlways1: UI /user/ è 3×3 — lite non deve clampare sotto 9 */
    const perPageMax = lite ? 9 : perfTier === "mid" ? 12 : 24;
    const perPageDefault = lite ? 9 : 12;
    const perPage = parseIntSafe(q.perPage, 1, perPageMax, perPageDefault);
    /* siteUsersSwr1: cache hit prima di Discord/membersApprox */
    let guild = client.guilds.cache.get(guildId) || null;
    let hourlyBoard = Boolean(guild) && board === "weekly";
    const romeDayKey = board === "messages" || board === "voice" ? getRomeDayKey(new Date()) : "";
    /* membersApproxFix1: bump cache key — vecchi payload avevano membersApprox:null */
    let cacheKey = hourlyBoard
      ? `v5:${guildId}:${board}:hourly:p${page}:n${perPage}:perf${perfTier}`
      : `v5:${guildId}:${board}:p${page}:n${perPage}:perf${perfTier}`;
    const listCcFresh = lite ? "public, max-age=45" : "public, max-age=20";
    const listCcStale = "public, max-age=5, stale-while-revalidate=120";
    const forceRebuild = Boolean(req && req.__vcForceUsersRebuild);
    let listMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
    if (listMeta.hit && !listMeta.stale) {
      return replyUsers(req, res, listMeta.hit, lite ? "public, max-age=45" : "public, max-age=15", {
        "X-VC-Perf": perfTier,
      });
    }
    if (listMeta.hit && listMeta.stale && !forceRebuild) {
      /* refresh in bg (force) — evita loop sullo stesso stale short-circuit */
      if (!listCacheInflight.has(cacheKey)) {
        setImmediate(() => {
          warmOneUsersQuery(
            client,
            {
              board,
              page: String(page),
              perPage: String(perPage),
              ...(lite ? { perf: "lite" } : {}),
            },
            { force: true },
          ).catch(() => {});
        });
      }
      return replyUsers(req, res, listMeta.hit, listCcStale, {
        "X-VC-Perf": perfTier,
        "X-VC-Users-Stale": "1",
      });
    }

    if (!guild) {
      guild = (await client.guilds.fetch(guildId).catch(() => null)) || null;
      hourlyBoard = Boolean(guild) && board === "weekly";
      cacheKey = hourlyBoard
        ? `v5:${guildId}:${board}:hourly:p${page}:n${perPage}:perf${perfTier}`
        : `v5:${guildId}:${board}:p${page}:n${perPage}:perf${perfTier}`;
      listMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
      if (listMeta.hit && !listMeta.stale) {
        return replyUsers(req, res, listMeta.hit, lite ? "public, max-age=45" : "public, max-age=15", {
          "X-VC-Perf": perfTier,
        });
      }
      if (listMeta.hit && listMeta.stale && !forceRebuild) {
        if (!listCacheInflight.has(cacheKey)) {
          setImmediate(() => {
            warmOneUsersQuery(
              client,
              {
                board,
                page: String(page),
                perPage: String(perPage),
                ...(lite ? { perf: "lite" } : {}),
              },
              { force: true },
            ).catch(() => {});
          });
        }
        return replyUsers(req, res, listMeta.hit, listCcStale, {
          "X-VC-Perf": perfTier,
          "X-VC-Users-Stale": "1",
        });
      }
    }
    const membersApprox = await resolveMembersApprox(client, guild, guildId);

    const skip = (page - 1) * perPage;
    /* siteUsersSwr1: lista mai bloccata su hydrate Discord duro (fill in background) */
    const softIds = true;

    if (hourlyBoard) {
      /* siteUsersW2: reuse shared weekly-hourly sorted + singleflight page payload */
      const payload = await cacheGetOrBuild(cacheKey, async () => {
        const sorted = await getCachedWeeklyHourlySorted(guild);
        const total = sorted.length;
        const slice = sorted.slice(skip, skip + perPage);
        let pageMaxSecondary = 1;
        for (const agg of slice) {
          pageMaxSecondary = Math.max(pageMaxSecondary, nInt(agg.exp));
        }
        if (pageMaxSecondary < 1) pageMaxSecondary = 1;
        let globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
        if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
        const guildExpSettings = lite ? null : await getGuildExpSettings(guildId).catch(() => null);
        const userIds = slice.map((r?) => String(r.userId || "")).filter(Boolean);
        const profileDocs = userIds.length
          ? await ActivityUserProfile.find({ guildId, userId: { $in: userIds } })
              .select(SEARCH_SELECT)
              .lean()
              .catch(() => [])
          : [];
        const docMap = new Map(profileDocs.map((d?) => [String(d.userId), d]));
        const identityMap = await resolveIdentitiesForList(client, guild, userIds, lite, softIds);
        const rows = [];
        for (let i = 0; i < slice.length; i += 1) {
          const agg = slice[i];
          const d = docMap.get(String(agg.userId));
          if (!d) continue;
          const rank = skip + i + 1;
          const overrides = { weeklyExp: nInt(agg.exp) };
          const memberHint = guild?.members?.cache?.get?.(String(d.userId || "")) || null;
          const weeklyEffectiveMultiplier = await getResolvedWeeklyExpMultiplier(
            guild,
            String(d.userId || ""),
            guildExpSettings,
            memberHint,
          ).catch(() => null);
          rows.push(
            await buildRowFromDoc(
              client,
              guild,
              board,
              d,
              rank,
              pageMaxSecondary,
              globalExpMultiplier,
              overrides,
              weeklyEffectiveMultiplier,
              identityMap.get(String(d.userId || "")),
            ),
          );
        }
        const first = sorted[0];
        let topDisplayName = "";
        let topWeeklyExp = 0;
        if (first) {
          const uid = String(first.userId || "");
          if (uid) {
            const cachedId = identityFromCacheOnly(client, guild, uid);
            topDisplayName = String(cachedId.displayName || cachedId.username || "").trim();
          }
          topWeeklyExp = nInt(first.exp);
        }
        if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
          const fb = String(rows[0].displayName || rows[0].username || "").trim();
          if (fb) topDisplayName = fb;
        }
        return {
          ok: true,
          board,
          page,
          perPage,
          total,
          totalPages: Math.max(1, Math.ceil(total / perPage)),
          stats: {
            rankedUsers: total,
            membersApprox,
            topDisplayName,
            topPlayerUsername: topDisplayName,
            topLevel: null,
            topWeeklyExp,
            topMessagesTotal: null,
            topVoiceSeconds: null,
            topMinigameTotal: null,
            globalExpMultiplier,
          },
          rows,
        };
      }, LIST_CACHE_TTL_MS, { force: forceRebuild });
      const hourlyMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
      const hourlyStale = Boolean(hourlyMeta.stale) && !forceRebuild;
      return replyUsers(
        req,
        res,
        payload,
        hourlyStale ? listCcStale : listCcFresh,
        {
          "X-VC-Perf": perfTier,
          ...(hourlyStale ? { "X-VC-Users-Stale": "1" } : {}),
        },
      );
    }

    const filter = boardQuery(board, guildId);
    const sort = boardSort(board);
    const select = boardSelect();

    const payload = await cacheGetOrBuild(cacheKey, async () => {
    let total = 0;
    let docs = [];
    let topDoc = null;
    if (board === "messages" || board === "voice") {
      const sortExpr = numericSortExpr(board);
      const agg = await ActivityUserProfile.aggregate([
        { $match: { guildId, "profile.totals.exp.totalExp": { $gt: 0 } } },
        { $addFields: { __sortVal: sortExpr } },
        { $match: { __sortVal: { $gt: 0 } } },
        { $sort: { __sortVal: -1 } },
        {
          $facet: {
            total: [{ $count: "n" }],
            docs: [
              { $skip: skip },
              { $limit: perPage },
              { $project: { userId: 1, profile: 1, __sortVal: 1 } },
            ],
            top: [{ $limit: 1 }, { $project: { userId: 1, profile: 1, __sortVal: 1 } }],
          },
        },
      ]).catch(() => []);
      const row = Array.isArray(agg) && agg.length ? agg[0] : {};
      total = nInt(row?.total?.[0]?.n);
      docs = Array.isArray(row?.docs) ? row.docs : [];
      topDoc = Array.isArray(row?.top) && row.top.length ? row.top[0] : null;
    } else {
      [total, docs, topDoc] = await Promise.all([
        ActivityUserProfile.countDocuments(filter).catch(() => 0),
        ActivityUserProfile.find(filter)
          .select(select)
          .sort((sort as any))
          .skip(skip)
          .limit(perPage)
          .lean()
          .catch(() => []),
        ActivityUserProfile.findOne(filter).select(select).sort((sort as any)).lean().catch(() => null),
      ]);
    }

    let topDisplayName = "";
    let topLevel = 0;
    let topWeeklyExp = 0;
    let topMessagesTotal = 0;
    let topVoiceSeconds = 0;
    let topMinigameTotal = 0;

    if (topDoc) {
      const uid = String(topDoc.userId || "");
            if (uid) {
        const cachedId = identityFromCacheOnly(client, guild, uid);
        topDisplayName = String(cachedId.displayName || cachedId.username || "").trim();
      }
      if (board === "level") {
        const te = nInt(topDoc.profile?.totals?.exp?.totalExp);
        const li = getLevelInfo(te);
        topLevel = Math.max(nInt(topDoc.profile?.totals?.exp?.level), li.level);
      } else if (board === "weekly") {
        topWeeklyExp = nInt(topDoc.profile?.totals?.exp?.weeklyExp);
      } else if (board === "messages") {
        topMessagesTotal = nInt(topDoc.__sortVal ?? topDoc.profile?.totals?.messagesTotal);
      } else if (board === "voice") {
        topVoiceSeconds = nInt(topDoc.__sortVal ?? topDoc.profile?.totals?.voiceTotalSeconds);
      } else if (board === "minigames") {
        topMinigameTotal = nInt(topDoc.profile?.totals?.exp?.minigame?.totalExp);
      }
    }

    let pageMaxSecondary = 1;
    if (board === "weekly") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.exp?.weeklyExp));
      }
    } else if (board === "messages") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.messagesTotal));
      }
    } else if (board === "voice") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.voiceTotalSeconds));
      }
    } else if (board === "minigames") {
      for (const d of docs) {
        pageMaxSecondary = Math.max(pageMaxSecondary, nInt(d.profile?.totals?.exp?.minigame?.totalExp));
      }
    }

    let globalExpMultiplier = 1;
    let guildExpSettings = null;
    if (board === "weekly") {
      globalExpMultiplier = Number(await getGlobalMultiplier(guildId).catch(() => 1));
      if (!Number.isFinite(globalExpMultiplier) || globalExpMultiplier <= 0) globalExpMultiplier = 1;
      guildExpSettings = lite ? null : await getGuildExpSettings(guildId).catch(() => null);
    }
    const identityMap = await resolveIdentitiesForList(
      client,
      guild,
      docs.map((d?) => d.userId).concat(topDoc ? [topDoc.userId] : []),
      lite,
      softIds,
    );
    const rows = await Promise.all(
      docs.map(async (d?, i?) => {
        const dayOvr = siteRomeDayOverridesFromDoc(d, board, romeDayKey);
        const totalOvr =
          board === "messages"
            ? { messagesTotal: nInt(d.__sortVal ?? d.profile?.totals?.messagesTotal) }
            : board === "voice"
              ? { voiceTotalSeconds: nInt(d.__sortVal ?? d.profile?.totals?.voiceTotalSeconds) }
              : {};
        const memberHint =
          board === "weekly" ? guild?.members?.cache?.get?.(String(d.userId || "")) || null : null;
        const weeklyEffectiveMultiplier =
          board === "weekly"
            ? await getResolvedWeeklyExpMultiplier(
                guild,
                String(d.userId || ""),
                guildExpSettings,
                memberHint,
              ).catch(() => null)
            : null;
        return buildRowFromDoc(
          client,
          guild,
          board,
          d,
          skip + i + 1,
          pageMaxSecondary,
          globalExpMultiplier,
          { ...totalOvr, ...dayOvr },
          weeklyEffectiveMultiplier,
          identityMap.get(String(d.userId || "")),
        );
      }),
    );

    if (!String(topDisplayName || "").trim() && rows.length && skip === 0) {
      const fb = String(rows[0].displayName || rows[0].username || "").trim();
      if (fb) topDisplayName = fb;
    }

    return {
      ok: true,
      board,
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
      stats: {
        rankedUsers: total,
        membersApprox,
        topDisplayName,
        topPlayerUsername: topDisplayName,
        topLevel: board === "level" ? topLevel : null,
        topWeeklyExp: board === "weekly" ? topWeeklyExp : null,
        topMessagesTotal: board === "messages" ? topMessagesTotal : null,
        topVoiceSeconds: board === "voice" ? topVoiceSeconds : null,
        topMinigameTotal: board === "minigames" ? topMinigameTotal : null,
        globalExpMultiplier: board === "weekly" ? globalExpMultiplier : null,
        siteRomeCalendarDay: board === "messages" || board === "voice" ? romeDayKey : null,
      },
      rows,
    };
    }, LIST_CACHE_TTL_MS, { force: forceRebuild });
    const outMeta = cacheLookupMeta(cacheKey, LIST_STALE_KEEP_MS);
    const outStale = Boolean(outMeta.stale) && !forceRebuild;
    return replyUsers(req, res, payload, outStale ? listCcStale : listCcFresh, {
      "X-VC-Perf": perfTier,
      ...(outStale ? { "X-VC-Users-Stale": "1" } : {}),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-users:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function warmOneUsersQuery(client?, query?, opts?) {
  const req = {
    query: query || {},
    headers: {},
    __vcForceUsersRebuild: Boolean(opts?.force),
  };
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {
      return this;
    },
  };
  await handleSiteUsersLeaderboardGet(client, req, res);
}

/* siteApiW4 + siteUsersSwr1 + apiWarmSwr2: lite/mid/full first pages */
async function warmSiteUsersLeaderboardCache(client?) {
  const jobs = [
    { board: "level", page: "1", perPage: "9", perf: "lite" },
    { board: "weekly", page: "1", perPage: "9", perf: "lite" },
    { board: "level", page: "1", perPage: "12" },
    { board: "weekly", page: "1", perPage: "12" },
    { board: "level", page: "1", perPage: "24" },
    { board: "weekly", page: "1", perPage: "24" },
  ];
  for (const query of jobs) {
    try {
      await warmOneUsersQuery(client, query, { force: true });
    } catch (err) {
      global.logger?.warn?.("[WEBHOOK] site-users warm:", query.board, err?.message || err);
    }
  }
}

/** leaveProfileLive1: drop cached community profile for a user (after guild leave). */
function invalidateProfileCacheForUser(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  let n = 0;
  const exact = gid ? `profile:v${PROFILE_CACHE_VER}:${gid}:${uid}` : "";
  if (exact && listCache.delete(exact)) n += 1;
  const suffix = `:${uid}`;
  for (const key of listCache.keys()) {
    if (!String(key).startsWith("profile:v")) continue;
    if (exact && key === exact) continue;
    if (String(key).endsWith(suffix)) {
      listCache.delete(key);
      n += 1;
    }
  }
  return n;
}

export = {
  handleSiteUsersLeaderboardGet,
  buildCustomProfileData,
  warmSiteUsersLeaderboardCache,
  invalidateProfileCacheForUser,
};