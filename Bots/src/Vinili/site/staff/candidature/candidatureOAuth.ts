/** Candidature: chi si candida dal sito (login Discord). */
const { DISCORD_OAUTH_UA, fetchDiscordOAuthMe } = require("../../http/discordOauthMe") as typeof import("../../http/discordOauthMe");

const WEBSITE_AUTH_TIMEOUT_MS = 4500;

async function fetchDiscordMe(accessToken?) {
  const out = await fetchDiscordOAuthMe(accessToken, { timeoutMs: WEBSITE_AUTH_TIMEOUT_MS });
  if (!out.ok) {
    const err: any = new Error(out.message || out.error || "discord_unreachable");
    err.name = out.error === "discord_timeout" ? "AbortError" : "Error";
    err.oauth = out;
    throw err;
  }
  return {
    ok: true,
    status: 200,
    async json() {
      return out.me;
    },
  };
}

/**
 * @returns {Promise<{ json: object|null, status: number|null, notInGuild: boolean, unreachable: boolean }>}
 */
async function fetchOAuthGuildMemberResult(accessToken?, guildId?, timeoutMs = 2500) {
  const token = String(accessToken || "").trim();
  const gid = String(guildId || "").trim();
  if (!token || !gid) {
    return { json: null, status: null, notInGuild: false, unreachable: true };
  }
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, Math.max(600, Number(timeoutMs) || 2500));
  try {
    const res = await fetch(`https://discord.com/api/v10/users/@me/guilds/${gid}/member`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": DISCORD_OAUTH_UA,
      },
      signal: ctrl ? ctrl.signal : undefined,
    });
    if (res.status === 404) {
      return { json: null, status: 404, notInGuild: true, unreachable: false };
    }
    if (!res.ok) {
      return { json: null, status: res.status, notInGuild: false, unreachable: res.status >= 500 };
    }
    const json = await res.json().catch(() => null);
    return { json: json || null, status: res.status, notInGuild: false, unreachable: !json };
  } catch (_) {
    return { json: null, status: null, notInGuild: false, unreachable: true };
  } finally {
    clearTimeout(timer);
  }
}

function synthMemberFromOAuth(guild?, meJson?, oauthMember?) {
  const userId = String(meJson?.id || oauthMember?.user?.id || "").trim();
  if (!userId) return null;
  const roleIds = Array.isArray(oauthMember?.roles)
    ? oauthMember.roles.map(String).filter(Boolean)
    : [];
  const roleSet = new Set(roleIds);
  const username = String(meJson?.username || oauthMember?.user?.username || "user").trim() || "user";
  const displayName =
    String(oauthMember?.nick || meJson?.global_name || meJson?.globalName || username).trim() ||
    username;
  const avatarHash = String(meJson?.avatar || oauthMember?.user?.avatar || "").trim() || null;
  const memberAvatarHash = String(oauthMember?.avatar || "").trim() || null;
  const user = {
    id: userId,
    username,
    globalName: displayName,
    avatar: avatarHash,
    displayAvatarURL: (opts: Record<string, any> = {}) => {
      const size = Number(opts.size) || 128;
      if (avatarHash) {
        const animated = avatarHash.startsWith("a_");
        const ext = opts.extension || (opts.forceStatic ? "png" : animated ? "gif" : "webp");
        return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
      }
      return `https://cdn.discordapp.com/embed/avatars/0.png`;
    },
  };
  return {
    id: userId,
    guild: guild || null,
    avatar: memberAvatarHash,
    displayName,
    user,
    roles: {
      cache: {
        has: (id?) => roleSet.has(String(id || "")),
        keys: function* keys() {
          yield* roleSet.values();
        },
        get size() {
          return roleSet.size;
        },
      },
    },
    _vcFromOAuth: true,
  };
}

export = { fetchDiscordMe, fetchOAuthGuildMemberResult, synthMemberFromOAuth };
