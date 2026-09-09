"use strict";

const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { resolveWelcomeBadge } = require("../Community/pronounWelcomeUtils");

const CACHE_TTL_MS = 60_000;
const cache = new Map();

function cacheKey(userId) {
  return String(userId || "").trim();
}

function readCache(userId) {
  const key = cacheKey(userId);
  const hit = cache.get(key);
  if (!hit || Number(hit.exp || 0) <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return hit.payload;
}

function writeCache(userId, payload) {
  const key = cacheKey(userId);
  if (!key) return;
  cache.set(key, { exp: Date.now() + CACHE_TTL_MS, payload });
  if (cache.size > 400) {
    const first = cache.keys().next().value;
    if (first) cache.delete(first);
  }
}

/**
 * GET /webhooks/site-welcome-pronouns
 * Auth: Bearer Discord OAuth token (identify).
 *
 * Pronoun source:
 * 1) Discord user `pronouns` field if OAuth/@me ever returns it
 * 2) else guild pronoun roles (he/him, she/her, they/them, ask me)
 */
async function getWelcomePronouns(client, { accessToken } = {}) {
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

  const { member, userId, discordUser } = resolved;
  const cached = readCache(userId);
  if (cached) return { ...cached, cached: true };

  const discordPronouns = String(
    discordUser?.pronouns || discordUser?.user?.pronouns || member?.user?.pronouns || "",
  ).trim();

  const badge = resolveWelcomeBadge(member, { discordPronouns });
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

module.exports = {
  getWelcomePronouns,
};
