"use strict";

const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { resolveWelcomeBadge } = require("../../Community/utils/pronounWelcomeUtils") as typeof import("../../Community/utils/pronounWelcomeUtils");
const { fetchWebsiteGuildMember, clearWebsiteMemberCaches } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");

const CACHE_TTL_MS = 45_000;
const cache = new Map();

function cacheKey(userId?) {
  return String(userId || "").trim();
}

function readCache(userId?) {
  const key = cacheKey(userId);
  const hit = cache.get(key);
  if (!hit || Number(hit.exp || 0) <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCache(userId?, payload?) {
  const key = cacheKey(userId);
  if (!key) return;
  cache.set(key, { exp: Date.now() + CACHE_TTL_MS, payload });
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

function roleIdsFromMember(member?) {
  try {
    const cacheLike = member?.roles?.cache;
    if (cacheLike && typeof cacheLike.keys === "function") {
      return [...cacheLike.keys()].map(String);
    }
  } catch (_) {}
  if (Array.isArray(member?.roles)) return member.roles.map(String);
  return [];
}

/**
 * GET /webhooks/site-welcome-pronouns
 * Auth: Bearer Discord OAuth token (identify).
 *
 * Pronoun source:
 * 1) Discord user `pronouns` field if OAuth/@me ever returns it
 * 2) else guild pronoun roles (he/him, she/her, they/them, ask me)
 *
 * welcomePronouns4: merge OAuth+bot role ids; guild m/f beats profile ask/any.
 */
async function getWelcomePronouns(client?, { accessToken, fresh }: any = {}) {
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) {
    return {
      ok: false,
      status: Number(resolved.status) || 401,
      error: resolved.error || "unauthorized",
      message: resolved.message || "Sessione non valida.",
      badge: resolveWelcomeBadge(null).text,
      gender: "u",
      i18nKey: "home.welcome",
      source: "fallback",
    };
  }

  const { guild, userId, discordUser } = resolved;
  let member = resolved.member;

  if (!fresh) {
    const cached = readCache(userId);
    if (cached) return { ...cached, cached: true };
  } else {
    cache.delete(cacheKey(userId));
  }

  /* welcomePronounsFetchSoft1: niente force/clear ad ogni hit — solo cache guild + soft fetch.
     Il force continuo saturava Discord e spamava member_fetch_timeout. */
  try {
    if (guild && userId) {
      const fromGuildCache = guild.members?.cache?.get?.(userId) || null;
      if (fromGuildCache) {
        member = fromGuildCache;
      } else if (fresh) {
        try {
          clearWebsiteMemberCaches(userId);
        } catch (_) {}
        const fetched = await fetchWebsiteGuildMember(guild, userId, {
          timeoutMs: 6500,
          retry: false,
          soft: true,
          force: true,
        }).catch(() => null);
        if (fetched) member = fetched;
      } else {
        const fetched = await fetchWebsiteGuildMember(guild, userId, {
          timeoutMs: 3500,
          retry: false,
          soft: true,
          force: false,
        }).catch(() => null);
        if (fetched) member = fetched;
      }
    }
  } catch (_) {}

  const discordPronouns = String(
    discordUser?.pronouns || discordUser?.user?.pronouns || member?.user?.pronouns || "",
  ).trim();

  const roleIdsResolved = roleIdsFromMember(resolved.member);
  const roleIdsFresh = roleIdsFromMember(member);
  const roleIds = [...new Set([...roleIdsFresh, ...roleIdsResolved])];

  const badge = resolveWelcomeBadge(member, {
    discordPronouns,
    roleIds,
  });
  const payload = {
    ok: true,
    status: 200,
    userId: String(userId),
    gender: badge.gender,
    badge: badge.text,
    i18nKey: badge.i18nKey,
    source: badge.source,
    pronouns: badge.pronouns,
  };
  writeCache(userId, payload);
  return payload;
}

export = {
  getWelcomePronouns,
};
