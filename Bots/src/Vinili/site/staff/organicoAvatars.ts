/** Organico staff: avatar nello storico (correzione di quelli scaduti). */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { resolveWebUserIdentitiesBatch, resolveWebUserIdentity, safeDisplayLabel, isSnowflakeLabel, FALLBACK_LABEL } = require("../../site/http/siteWebUserIdentity") as typeof import("../../site/http/siteWebUserIdentity");
const { sitePreferredAvatarUrl, normalizeDiscordCdnAvatarUrl, remoteImageUrlLoads } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

const organicoCache = new Map();

/* organicoAvatarHeal1: a_*.png → a_*.gif + size=128 */
function normalizeHistoryAvatarUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw || /\/embed\/avatars\//i.test(raw)) return "";
  if (!/^https:\/\/cdn\.discordapp\.com\/(?:avatars|guilds)\//i.test(raw)) {
    return /^https:\/\//i.test(raw) ? raw.slice(0, 512) : "";
  }
  return (
    normalizeDiscordCdnAvatarUrl(raw, { size: 128, preferAnimated: true }) || raw
  ).slice(0, 512);
}

function hasRealDiscordAvatarUrl(url?) {
  const s = normalizeHistoryAvatarUrl(url);
  if (!s || /\/embed\/avatars\//i.test(s)) return false;
  return /^https:\/\/cdn\.discordapp\.com\/(?:avatars\/\d+\/|guilds\/\d+\/users\/\d+\/avatars\/)/i.test(s);
}

function isEmbedDiscordAvatarUrl(url?) {
  return /cdn\.discordapp\.com\/embed\/avatars\//i.test(String(url || "").trim());
}

function pickHistoryAvatarUrl(snapAvatar?, identityAvatar?, userId?) {
  const idAv = normalizeHistoryAvatarUrl(identityAvatar);
  if (hasRealDiscordAvatarUrl(idAv)) return idAv;
  /* organicoAvatarGlobal1: NON ripescare snap Mongo (spesso hash 404).
     L’identity batch ha già scelto live/snap/vuoto. */
  return "";
}

/**
 * organicoAvatarOutSync1 + FastPaint1: avatar live pagina-1, budget corto.
 * skipGuildMember: fuori server members.fetch timeout ~6–9s.
 */
async function syncHealRecentHistoryAvatars(client?, guild?, items?, opts: Record<string, any> = {}) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length || !client) return 0;
  const cap = Math.max(1, Number(opts.cap) || 8);
  const budgetMs = Math.max(500, Number(opts.budgetMs) || 2_200);
  const need = [];
  const seen = new Set();
  for (const item of list) {
    const uid = String(item?.userId || "").trim();
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    if (hasRealDiscordAvatarUrl(item?.avatarUrl)) continue;
    need.push(uid);
    if (need.length >= cap) break;
  }
  if (!need.length) return 0;

  const healed = new Map();
  const t0 = Date.now();
  let n = 0;
  const chunkSize = 4;

  for (let i = 0; i < need.length; i += chunkSize) {
    if (Date.now() - t0 > budgetMs) break;
    const chunk = need.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid?) => {
        let id = null;
        const cachedMember = guild?.members?.cache?.get?.(uid);
        if (cachedMember) {
          const av = normalizeHistoryAvatarUrl(
            sitePreferredAvatarUrl(cachedMember, {
              size: 128,
              preferAnimated: true,
              allowDefault: false,
            }) || "",
          );
          id = {
            userId: uid,
            displayName: safeDisplayLabel(
              cachedMember.displayName || cachedMember.user?.username,
              uid,
              "",
            ),
            username: String(cachedMember.user?.username || "").trim(),
            avatarUrl: hasRealDiscordAvatarUrl(av) ? av : "",
          };
        }
        if (!id || !hasRealDiscordAvatarUrl(id.avatarUrl)) {
          /* prima cache (veloce), poi force solo se manca avatar */
          id = await resolveWebUserIdentity(client, guild, uid, {
            preferFreshUser: false,
            skipGuildMember: true,
          }).catch(() => null);
          if (!id || !hasRealDiscordAvatarUrl(id.avatarUrl)) {
            id = await resolveWebUserIdentity(client, guild, uid, {
              preferFreshUser: true,
              skipGuildMember: true,
            }).catch(() => null);
          }
        }
        if (!id) return;
        let finalAv = normalizeHistoryAvatarUrl(id.avatarUrl || "");
        if (!hasRealDiscordAvatarUrl(finalAv)) finalAv = "";
        for (const item of list) {
          if (String(item?.userId || "") !== uid) continue;
          if (hasRealDiscordAvatarUrl(item.avatarUrl)) continue;
          item.avatarUrl = finalAv;
        }
        healed.set(uid, { ...id, avatarUrl: finalAv });
        if (finalAv) n += 1;
      }),
    );
  }

  if (healed.size) {
    void persistHistoryIdentitySnapshots(guild?.id, healed).catch(() => null);
  }
  return n;
}

/** organicoAvatarFast1 + OutSync1: HEAD 404 + fetch live in background */
function warmHealHistoryAvatarUrls(client?, guild?, items?) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length || !client) return;
  void (async () => {
    const byUid = new Map();
    for (const item of list) {
      const uid = String(item?.userId || "").trim();
      if (!uid || byUid.has(uid)) continue;
      const url = normalizeHistoryAvatarUrl(item?.avatarUrl);
      if (!hasRealDiscordAvatarUrl(url)) {
        byUid.set(uid, { url: "", need: true });
        continue;
      }
      byUid.set(uid, { url, need: false });
    }
    const toCheck = [...byUid.entries()].filter(([, v]) => v.url);
    const healed = new Map();
    const t0 = Date.now();
    const budgetMs = 90_000;
    for (let i = 0; i < toCheck.length; i += 6) {
      if (Date.now() - t0 > budgetMs) break;
      const chunk = toCheck.slice(i, i + 6);
      await Promise.all(
        chunk.map(async ([uid, meta]) => {
          const ok = await remoteImageUrlLoads(meta.url).catch(() => false);
          if (ok) return;
          meta.need = true;
        }),
      );
    }
    const needFetch = [...byUid.entries()].filter(([, v]) => v.need).map(([uid]) => uid);
    if (!needFetch.length) return;
    const cache = await resolveWebUserIdentitiesBatch(client, guild, needFetch, {
      cap: 80,
      budgetMs: 60_000,
      batchSize: 3,
      paceMs: 80,
      preferFreshUser: true,
      /* organicoAvatarOutSync1: fuori server — no members.fetch timeout */
      skipGuildMember: true,
    }).catch(() => null);
    if (!cache?.size) return;
    for (const [uid, id] of cache.entries()) {
      const av = normalizeHistoryAvatarUrl(id?.avatarUrl || "");
      if (hasRealDiscordAvatarUrl(av)) healed.set(uid, { ...id, avatarUrl: av });
      else if (id && (id.username || id.displayName)) {
        healed.set(uid, { ...id, avatarUrl: "" });
      }
    }
    if (healed.size) {
      await persistHistoryIdentitySnapshots(guild?.id, healed).catch(() => null);
      try {
        organicoCache.delete(organicoCacheKey(null));
      } catch (_) {}
    }
  })();
}

function organicoCacheKey(filterUserId?) {
  return `${String(IDs.guilds.main || "")}:${String(filterUserId || "all")}`;
}

async function persistHistoryIdentitySnapshots(guildId?, identityCache?) {
  const gid = String(guildId || "").trim();
  if (!gid || !identityCache?.size) return;
  const entries = [...identityCache.entries()].filter(([uid, id]) => {
    const name = String(id?.displayName || "").trim();
    return uid && name && name !== FALLBACK_LABEL && !isSnowflakeLabel(name, uid);
  });
  if (!entries.length) return;

  for (const [uid, id] of entries) {
    try {
      const doc = await ActivityUserProfile.findOne(
        { guildId: gid, userId: uid },
        { "staff.rolesHistory": 1, staffRolesHistoryRetention: 1 },
      );
      if (!doc) continue;
      let changed = false;
      const stamp = (rows?) => {
        if (!Array.isArray(rows)) return;
        for (const row of rows) {
          if (!row) continue;
          const curName = String(row.displayName || "").trim();
          if (!curName || isSnowflakeLabel(curName, uid) || curName === FALLBACK_LABEL) {
            row.displayName = String(id.displayName).slice(0, 128);
            changed = true;
          }
          if (!String(row.username || "").trim() && id.username) {
            row.username = String(id.username).slice(0, 64);
            changed = true;
          }
          if (!String(row.avatarUrl || "").trim() && /^https:\/\//i.test(String(id.avatarUrl || ""))) {
            row.avatarUrl = String(id.avatarUrl).slice(0, 512);
            changed = true;
          }
          /* organicoLiveAvatar1: sovrascrivi embed/vuoto con avatar CDN reale */
          if (
            hasRealDiscordAvatarUrl(id.avatarUrl) &&
            (!hasRealDiscordAvatarUrl(row.avatarUrl) || isEmbedDiscordAvatarUrl(row.avatarUrl))
          ) {
            row.avatarUrl = String(id.avatarUrl).slice(0, 512);
            changed = true;
          }
        }
      };
      stamp(doc.staff?.rolesHistory);
      stamp(doc.staffRolesHistoryRetention);
      if (!changed) continue;
      if (doc.staff) doc.markModified("staff");
      doc.markModified("staffRolesHistoryRetention");
      await doc.save().catch(() => null);
    } catch {
          }
  }
}

export = { organicoCache, normalizeHistoryAvatarUrl, hasRealDiscordAvatarUrl, isEmbedDiscordAvatarUrl, pickHistoryAvatarUrl, syncHealRecentHistoryAvatars, warmHealHistoryAvatarUrls, organicoCacheKey, persistHistoryIdentitySnapshots };
