/** Classifiche utenti: nome e avatar delle persone (dal server o da Discord). */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { getRankCardThemeFromDoc, resolveRankCardWallpaper } = require("../../Community/utils/Render/rankCardTheme") as typeof import("../../Community/utils/Render/rankCardTheme");
const { userAvatarUrlStatic, userAvatarUrlDynamic, guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic, guildMemberDisplayAvatarUrlForSite } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { stabilizeDiscordCdnAvatarUrl, animatedDiscordCdnAvatarUrl } = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");
const { fetchWebsiteGuildMember, readCachedWebsiteMember } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

/* siteApiW6: ETag/304 on users/leaderboard poll */
function replyUsers(req?, res?, payload?, cacheControl?, extraHeaders?) {
  return sendJsonWithEtag(req, res, payload, {
    cacheControl,
    etag: weakEtagFromJson(payload),
    extraHeaders,
  });
}
const PROFILE_MEMBER_SOFT_TIMEOUT_MS = 400;
const LIST_MEMBER_WARM_MS = 180;

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

function pickMembersFromGuild(guild?) {
  const n = Number(guild?.memberCount ?? guild?.approximateMemberCount);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

export = { replyUsers, PROFILE_MEMBER_SOFT_TIMEOUT_MS, siteSafeRankCard, siteSafeResolvedWallpaper, siteMemberAvatarUrl, resolveIdentitiesForList, resolveMembersApprox, publicDisplayNameFromMemberOrUser, resolveMemberForProfileFast, resolveCustomProfileOwnerMember, identityFromCacheOnly, fetchUserIdentity, pickMembersFromGuild };
