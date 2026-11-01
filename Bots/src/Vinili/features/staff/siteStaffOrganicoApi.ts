const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { identityFromMember, stripDiscordDecorations } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { buildRoster } = require("./siteStaffManageApi") as typeof import("./siteStaffManageApi");
const {
  safeDisplayLabel,
  isSnowflakeLabel,
  FALLBACK_LABEL,
} = require("../../Web/siteWebUserIdentity") as typeof import("../../Web/siteWebUserIdentity");
const {
  userAvatarUrlDynamic,
  sitePreferredAvatarUrl,
} = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { sendJsonWithEtag, weakEtagFromJson } = require("../../Web/siteHttpEtag") as typeof import("../../Web/siteHttpEtag");
const { organicoCache, normalizeHistoryAvatarUrl, hasRealDiscordAvatarUrl, isEmbedDiscordAvatarUrl, pickHistoryAvatarUrl, organicoCacheKey } = require("./organicoAvatars") as typeof import("./organicoAvatars");
const { classifyPexDepexKind, rosterMembersById, buildPexDepexHistory, historyIdentityIncomplete, warmMissingHistoryIdentities } = require("./organicoHistory") as typeof import("./organicoHistory");

const ORGANICO_CACHE_TTL_MS = 120_000;
/* apiWarmSwr1: serve stale while revalidate */
const ORGANICO_STALE_KEEP_MS = 10 * 60 * 1000;
/* siteApiW3: singleflight on organico cache miss */
const organicoInflight = new Map();

function readOrganicoCache(filterUserId?) {
  const key = organicoCacheKey(filterUserId);
  const entry = organicoCache.get(key);
  if (!entry) return null;
  const now = Date.now();
  if (now <= entry.exp) return { ...entry, fresh: true };
  if (now <= entry.staleUntil) return { ...entry, fresh: false };
  organicoCache.delete(key);
  return null;
}

function writeOrganicoCache(filterUserId?, payload?) {
  if (organicoCache.size > 32) {
    const first = organicoCache.keys().next().value;
    if (first) organicoCache.delete(first);
  }
  const now = Date.now();
  /* siteApiW6: store etag with organico cache */
  organicoCache.set(organicoCacheKey(filterUserId), {
    exp: now + ORGANICO_CACHE_TTL_MS,
    staleUntil: now + ORGANICO_STALE_KEEP_MS,
    payload,
    etag: weakEtagFromJson(payload),
  });
}

async function warmSiteStaffOrganicoCache(client?) {
  const cacheKey = "roster:all";
  const cached = readOrganicoCache(cacheKey);
  if (cached?.fresh) return cached.payload;
  try {
    const roster = await buildRoster(client);
    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    const lightPayload = {
      ok: true,
      rosterOnly: true,
      viewer: null,
      counts: roster.counts,
      sections: roster.sections,
      staffDelMese: roster.staffDelMese || (guild ? buildStaffDelMeseBlock(guild) : null),
      staffDelSettimana: roster.staffDelSettimana || (guild ? buildStaffDelSettimanaBlock(guild) : null),
      pexHistory: [],
      historyStats: null,
      historyFilterUserId: null,
    };
    writeOrganicoCache(cacheKey, lightPayload);
    return lightPayload;
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-staff-organico warm:", err?.message || err);
    return null;
  }
}

function buildStaffDelMeseBlock(guild?) {
  const roleId = String(IDs.roles?.StafferDelMese || "").trim();
  const role = roleId && guild?.roles?.cache?.get(roleId) ? guild.roles.cache.get(roleId) : null;
  const holders = [];
  if (roleId && guild?.members?.cache) {
    guild.members.cache.forEach((member?) => {
      if (!member?.roles?.cache?.has?.(roleId)) return;
      holders.push(identityFromMember(member));
    });
  }
  holders.sort((a?, b?) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"));
  return {
    roleId: roleId || null,
    roleLabel: role ? stripDiscordDecorations(role.name) || role.name : "Staffer del Mese",
    holders,
  };
}

function buildStaffDelSettimanaBlock(guild?) {
  const roleId = String(IDs.roles?.StafferDellaSettimana || "").trim();
  const role = roleId && guild?.roles?.cache?.get(roleId) ? guild.roles.cache.get(roleId) : null;
  const holders = [];
  if (roleId && guild?.members?.cache) {
    guild.members.cache.forEach((member?) => {
      if (!member?.roles?.cache?.has?.(roleId)) return;
      holders.push(identityFromMember(member));
    });
  }
  holders.sort((a?, b?) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"));
  return {
    roleId: roleId || null,
    roleLabel: role ? stripDiscordDecorations(role.name) || role.name : "Staffer della Settimana",
    holders,
  };
}

async function handleSiteStaffOrganicoGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const filterUserId = String(req.query?.userId || req.query?.target || "").trim();
    if (filterUserId && !/^\d{16,22}$/.test(filterUserId)) {
      return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
    }

        const rosterOnlyRaw = String(req.query?.rosterOnly || req.query?.light || "").trim().toLowerCase();
    const rosterOnly =
      rosterOnlyRaw === "1" || rosterOnlyRaw === "true" || rosterOnlyRaw === "yes" || rosterOnlyRaw === "roster";
    const t0 = Date.now();

    const cacheKey = rosterOnly ? `roster:${filterUserId || "all"}` : filterUserId || null;
    const cached = readOrganicoCache(cacheKey);
    const flightKey = organicoCacheKey(cacheKey);
    let inflight = organicoInflight.get(flightKey);

    if (cached?.payload && cached.fresh) {
      return sendJsonWithEtag(req, res, { ...cached.payload, cached: true }, {
        cacheControl: "private, no-cache",
        etag: cached.etag || weakEtagFromJson(cached.payload),
        extraHeaders: {
          "X-VC-Organico-Ms": String(Date.now() - t0),
          ...(rosterOnly ? { "X-VC-Organico-Mode": "roster-cache" } : {}),
        },
      });
    }

    /* apiWarmSwr1: stale → rispondi subito e rinfresca in background */
    const serveStale = Boolean(cached?.payload && !cached.fresh);

    if (!inflight) {
      inflight = (async () => {
        const guildId = String(IDs.guilds.main || "");
        const guild =
          client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        if (!guild) {
          return {
            __err: {
              status: 503,
              body: { ok: false, error: "guild_unavailable", message: "Server non disponibile." },
            },
          };
        }

        const roster = await buildRoster(client);

        if (rosterOnly) {
          const lightPayload = {
            ok: true,
            rosterOnly: true,
            viewer: identityFromMember(access.member),
            counts: roster.counts,
            sections: roster.sections,
            staffDelMese: roster.staffDelMese || buildStaffDelMeseBlock(guild),
            staffDelSettimana: roster.staffDelSettimana || buildStaffDelSettimanaBlock(guild),
            pexHistory: [],
            historyStats: null,
            historyFilterUserId: filterUserId || null,
          };
          writeOrganicoCache(cacheKey, lightPayload);
          return { payload: lightPayload, mode: "roster" };
        }

        const byId = rosterMembersById(roster);
        const historyResult = await buildPexDepexHistory(guild, client, filterUserId || null, byId);

        for (const item of historyResult.items || []) {
          const live = byId.get(String(item.userId || ""));
          item.displayName = safeDisplayLabel(item.displayName, item.userId);
          item.avatarUrl = normalizeHistoryAvatarUrl(item.avatarUrl);
          if (live) {
            if (isSnowflakeLabel(item.displayName, item.userId) || item.displayName === FALLBACK_LABEL) {
              item.displayName = safeDisplayLabel(live.displayName, item.userId);
              item.username = live.username || item.username;
            }
            const liveAvatar = normalizeHistoryAvatarUrl(live.avatarUrl || "");
            if (hasRealDiscordAvatarUrl(liveAvatar)) {
              item.avatarUrl = liveAvatar;
            } else if (
              /^https:\/\//i.test(liveAvatar) &&
              (!hasRealDiscordAvatarUrl(item.avatarUrl) || isEmbedDiscordAvatarUrl(item.avatarUrl))
            ) {
              item.avatarUrl = liveAvatar;
            } else if (!hasRealDiscordAvatarUrl(item.avatarUrl)) {
              item.avatarUrl = pickHistoryAvatarUrl(item.avatarUrl, liveAvatar, item.userId);
            }
            continue;
          }
          /* organicoAvatarHeal1: in guild → sempre avatar live (anche se snap sembra CDN) */
          try {
            const member = guild.members?.cache?.get(String(item.userId || ""));
            if (member) {
              const memberAvatar = normalizeHistoryAvatarUrl(
                sitePreferredAvatarUrl(member, { size: 128, preferAnimated: true, allowDefault: false }) ||
                  userAvatarUrlDynamic(member, { size: 128, allowDefault: false }) ||
                  "",
              );
              if (hasRealDiscordAvatarUrl(memberAvatar)) {
                item.avatarUrl = memberAvatar;
                const liveName = safeDisplayLabel(
                  member.displayName || member.user?.username,
                  item.userId,
                  "",
                );
                if (liveName) item.displayName = liveName;
                continue;
              }
            }
          } catch {
                      }
        }

        const payload = {
          ok: true,
          viewer: identityFromMember(access.member),
          counts: roster.counts,
          sections: roster.sections,
          staffDelMese: roster.staffDelMese || buildStaffDelMeseBlock(guild),
          staffDelSettimana: roster.staffDelSettimana || buildStaffDelSettimanaBlock(guild),
          pexHistory: historyResult.items,
          historyStats: historyResult.stats,
          historyFilterUserId: filterUserId || null,
        };

        writeOrganicoCache(cacheKey, payload);
        if (historyIdentityIncomplete(historyResult.items)) {
          warmMissingHistoryIdentities(client, guild, historyResult.items);
        }
        return { payload, mode: "full" };
      })().finally(() => {
        organicoInflight.delete(flightKey);
      });
      organicoInflight.set(flightKey, inflight);
    }

    if (serveStale) {
      return sendJsonWithEtag(req, res, { ...cached.payload, cached: true, stale: true }, {
        cacheControl: "private, no-cache",
        etag: cached.etag || weakEtagFromJson(cached.payload),
        extraHeaders: {
          "X-VC-Organico-Ms": String(Date.now() - t0),
          "X-VC-Organico-Mode": rosterOnly ? "roster-stale" : "stale",
        },
      });
    }

    const built = await inflight;
    if (built?.__err) {
      return res.status(built.__err.status).json(built.__err.body);
    }
    return sendJsonWithEtag(req, res, built.payload, {
      cacheControl: "private, no-cache",
      etag: weakEtagFromJson(built.payload),
      extraHeaders: {
        "X-VC-Organico-Ms": String(Date.now() - t0),
        "X-VC-Organico-Mode": built.mode === "roster" ? "roster" : "full",
      },
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-organico GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffOrganicoPost(_client?, _req?, res?) {
  return res.status(410).json({
    ok: false,
    error: "gone",
    message: "Le azioni pex/depex sono disponibili solo in Gestione staff.",
  });
}

export = {
  handleSiteStaffOrganicoGet,
  handleSiteStaffOrganicoPost,
  warmSiteStaffOrganicoCache,
  buildPexDepexHistory,
  classifyPexDepexKind,
};
