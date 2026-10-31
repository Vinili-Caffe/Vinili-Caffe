const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { STAFF_LADDER_KEYS_HIGH_TO_LOW, staffLadderRoleIds } = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { identityFromMember, stripDiscordDecorations } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { buildRoster } = require("./siteStaffManageApi") as typeof import("./siteStaffManageApi");
const { isHiddenManualStaffCareerReason } = require("../../Utils/Staff/staffTrackHistory") as typeof import("../../Utils/Staff/staffTrackHistory");
const {
  resolveWebUserIdentitiesBatch,
  resolveWebUserIdentity,
  identityFallback,
  safeDisplayLabel,
  isSnowflakeLabel,
  FALLBACK_LABEL,
} = require("../../Web/siteWebUserIdentity") as typeof import("../../Web/siteWebUserIdentity");
const {
  userAvatarUrlDynamic,
  sitePreferredAvatarUrl,
  normalizeDiscordCdnAvatarUrl,
  remoteImageUrlLoads,
} = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { sendJsonWithEtag, weakEtagFromJson } = require("../../Web/siteHttpEtag") as typeof import("../../Web/siteHttpEtag");
const { remapKnownRoleSnowflake } = require("../../Utils/Config/emergencyRoleIdRemap") as typeof import("../../Utils/Config/emergencyRoleIdRemap");

const PM_ROLE_ID = String(IDs.roles?.PartnerManager || "").trim();
const LADDER_IDS = staffLadderRoleIds();
const ORGANICO_CACHE_TTL_MS = 120_000;
/* apiWarmSwr1: serve stale while revalidate */
const ORGANICO_STALE_KEEP_MS = 10 * 60 * 1000;
const organicoCache = new Map();
/* siteApiW3: singleflight on organico cache miss */
const organicoInflight = new Map();

function defaultAvatarForUserId(userId?, size = 128) {
  const uid = String(userId || "").trim();
  let index = 0;
  if (/^\d{16,22}$/.test(uid)) {
    try {
      index = Number((BigInt(uid) >> 22n) % 6n);
    } catch {
      index = 0;
    }
  }
  return `https://cdn.discordapp.com/embed/avatars/${index}.png?size=${size}`;
}

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

async function ensureGuildRolesCached(guild?) {
  if (!guild?.roles?.cache) return;
  const sampleIds = LADDER_IDS.slice(0, 3).concat([PM_ROLE_ID]).filter(Boolean);
  const missing = sampleIds.some((id?) => !guild.roles.cache.has(id));
  if (missing || guild.roles.cache.size < 8) {
    await guild.roles.fetch().catch(() => null);
  }
}

function humanizeRoleKey(key?) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function roleNameFromRemapFile(roleId?) {
  const id = String(roleId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return "";
  try {
    const raw = require("../../Data/roleIdRemap.emergency.json");
    const rows = Array.isArray(raw?.recreated) ? raw.recreated : [];
    for (const row of rows) {
      const oldId = String(row?.oldId || "").trim();
      const newId = String(row?.newId || "").trim();
      if (oldId !== id && newId !== id) continue;
      const name = stripDiscordDecorations(String(row?.name || "").trim());
      if (name) return name;
    }
  } catch (_) {
    /* optional */
  }
  return "";
}

function roleNameFromId(guild?, roleIdOrName?) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if (!/^\d{16,22}$/.test(raw)) {
    return stripDiscordDecorations(raw) || raw;
  }
  /* organicoRoleRemap1: ID pre-disaster → ID live prima di risolvere il nome */
  const remapped = remapKnownRoleSnowflake(raw) || raw;
  const live =
    guild?.roles?.cache?.get(remapped)?.name || guild?.roles?.cache?.get(raw)?.name;
  if (live) return stripDiscordDecorations(live) || live;
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    if (String(val) === remapped || String(val) === raw) {
      const label = humanizeRoleKey(key);
      return label || raw;
    }
  }
  const fromFile = roleNameFromRemapFile(raw) || roleNameFromRemapFile(remapped);
  if (fromFile) return fromFile;
  return remapped !== raw ? remapped : raw;
}

function resolveRoleIdForWeight(guild?, roleIdOrName?) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw) return "";
  if (/^\d{16,22}$/.test(raw)) {
    /* organicoRoleRemap1: pesa/confronta sul ruolo live, non sull'ID morto */
    return remapKnownRoleSnowflake(raw) || raw;
  }
  const normalized = stripDiscordDecorations(raw)
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return raw;
  const roles: any = IDs.roles || {};

  // organicoModDedupe1: Mod / Moderator / Moderatore = stesso gradino (non Senior).
  if (/^(mod|moderator|moderatore)$/i.test(normalized)) {
    const modId = String(roles.Mod || "").trim();
    if (modId) return modId;
  }
  if (/^(senior\s*mod(erator|eratore)?|smod)$/i.test(normalized)) {
    const smodId = String(roles.SeniorModerator || "").trim();
    if (smodId) return smodId;
  }

  if (guild?.roles?.cache) {
    for (const role of guild.roles.cache.values()) {
      const name = stripDiscordDecorations(role.name || "").toLowerCase();
      if (name && name === normalized) return role.id;
    }
  }

  const ladderLabels = STAFF_LADDER_KEYS_HIGH_TO_LOW.map((key?) => ({
    key,
    id: String(roles[key] || "").trim(),
    label: humanizeRoleKey(key).toLowerCase(),
  }))
    .filter((x?) => x.id && x.label)
    .sort((a?, b?) => b.label.length - a.label.length);

  for (const row of ladderLabels) {
    if (normalized === row.label) return row.id;
    const re = new RegExp(`(?:^|\\s)${row.label.replace(/\s+/g, "\\s+")}(?:\\s|$)`, "i");
    if (re.test(normalized)) return row.id;
  }

  for (const [key, val] of Object.entries(roles)) {
    const id = String(val || "").trim();
    if (!id) continue;
    const label = humanizeRoleKey(key).toLowerCase();
    const keyNorm = String(key).toLowerCase();
    if (label === normalized || keyNorm === normalized.replace(/\s+/g, "")) return id;
  }
  return raw;
}

function inferKindFromReason(reason?) {
  const r = String(reason || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!r) return null;
  if (/\bdepex\b|\bretrocess/.test(r)) return "depex";
  if (/\bdimission|\besce dal server|\buscita dal server/.test(r)) return "depex";
  if (/\bpex\b|\bpromoz/.test(r)) return "pex";
  if (/\bcandidatura accettata|\braccomandazione|\bprova superata/.test(r)) return "pex";
  if (/warn staff|valutazioni negative|automatico/.test(r) && /depex|retrocess|rimosso|member/.test(r)) {
    return "depex";
  }
  return null;
}

function dedupeHistoryRows(rows?) {
  const out = [];
  const seen = new Set();
  for (const r of rows || []) {
    const fromId = String(r.fromRoleId || r.fromRole || "").trim();
    const toId = String(r.toRoleId || r.toRole || "").trim();
    const bucket = Math.floor(Number(r._sort || 0) / (10 * 60 * 1000));
    const key = `${r.userId}|${r.kind}|${fromId}|${toId}|${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function staffTrackWeight(roleIdOrName?, guild?) {
  const id = resolveRoleIdForWeight(guild, roleIdOrName);
  if (!id) return 0;
  if (PM_ROLE_ID && id === PM_ROLE_ID) return 1;
  const idx = LADDER_IDS.indexOf(id);
  if (idx >= 0) return STAFF_LADDER_KEYS_HIGH_TO_LOW.length - idx + 1;
  const memberId = String(IDs.roles?.Member || "").trim();
  if (memberId && id === memberId) return 0;
  return 0;
}

function classifyPexDepexKind(oldRole?, newRole?, guild?) {
  const oldW = staffTrackWeight(oldRole, guild);
  const newW = staffTrackWeight(newRole, guild);
  const newEmpty = !String(newRole || "").trim();
  if (newW > oldW) return "pex";
  if (newW < oldW) return "depex";
  if (oldW > 0 && newEmpty) return "depex";
  if (oldW === 0 && newW > 0) return "pex";
  const oldId = resolveRoleIdForWeight(guild, oldRole);
  const newId = resolveRoleIdForWeight(guild, newRole);
  if (oldId && newId && oldId !== newId) {
    const oldIdx = LADDER_IDS.indexOf(oldId);
    const newIdx = LADDER_IDS.indexOf(newId);
    if (oldIdx >= 0 && newIdx >= 0) {
      if (newIdx < oldIdx) return "pex";
      if (newIdx > oldIdx) return "depex";
    }
    if (oldId === PM_ROLE_ID && newId !== PM_ROLE_ID) return "depex";
    if (newId === PM_ROLE_ID && oldId !== PM_ROLE_ID) return "pex";
  }
  const memberId = String(IDs.roles?.Member || "").trim();
  if (memberId && oldId && newId) {
    if (oldId === memberId && newId !== memberId && (newId === PM_ROLE_ID || LADDER_IDS.includes(newId))) return "pex";
    if (newId === memberId && oldId !== memberId && (oldId === PM_ROLE_ID || LADDER_IDS.includes(oldId))) return "depex";
  }
  return null;
}

function formatHistoryDate(iso?) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Rome",
    });
  } catch {
    return iso.slice(0, 16).replace("T", " ");
  }
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

async function resolveHistoryIdentitiesBatch(guild?, client?, userIds?, rosterById = null, snapByUserId = null) {
  const cache = new Map();
  const needFetch = [];

  for (const raw of userIds || []) {
    const uid = String(raw || "").trim();
    if (!uid) continue;

    const snap = snapByUserId?.get?.(uid);
    const snapName = snap ? safeDisplayLabel(snap.displayName || snap.username, uid, "") : "";
    const snapAvRaw = String(snap?.avatarUrl || "").trim();
    const snapAv = hasRealDiscordAvatarUrl(snapAvRaw) ? normalizeHistoryAvatarUrl(snapAvRaw) : "";

    const roster = rosterById?.get?.(uid);
    if (roster) {
      const name = safeDisplayLabel(roster.displayName, uid, "") || snapName;
      const rosterAv = normalizeHistoryAvatarUrl(roster.avatarUrl || "");
      if (name && hasRealDiscordAvatarUrl(rosterAv)) {
        cache.set(uid, {
          userId: uid,
          displayName: name,
          username: String(roster.username || snap?.username || "").trim(),
          avatarUrl: rosterAv,
        });
        continue;
      }
      if (name && !cache.has(uid)) {
        cache.set(uid, {
          userId: uid,
          displayName: name,
          username: String(roster.username || snap?.username || "").trim(),
          /* organicoAvatarOutSync1: niente snap 404 come placeholder */
          avatarUrl: "",
        });
      }
      /* organicoLiveAvatar1: roster senza CDN reale → prova membro/fetch sotto */
    }

    /* organicoLiveAvatar1: depexed ancora nel server — non fermarsi allo snap senza foto */
    try {
      const member = guild?.members?.cache?.get(uid);
      if (member) {
        const name =
          safeDisplayLabel(member.displayName || member.user?.username, uid, "") || snapName;
        if (name) {
          const memberAvatar = normalizeHistoryAvatarUrl(
            sitePreferredAvatarUrl(member, { size: 128, preferAnimated: true, allowDefault: false }) ||
              userAvatarUrlDynamic(member, { size: 128, allowDefault: false }) ||
              "",
          );
          const avatarUrl = hasRealDiscordAvatarUrl(memberAvatar) ? memberAvatar : "";
          cache.set(uid, {
            userId: uid,
            displayName: name,
            username: String(member.user?.username || snap?.username || "").trim(),
            avatarUrl,
          });
          if (hasRealDiscordAvatarUrl(memberAvatar)) continue;
        }
      }
    } catch {
          }

    if (snapName && snapAv && !cache.has(uid)) {
      cache.set(uid, {
        userId: uid,
        displayName: snapName,
        username: String(snap.username || "").trim(),
        /* organicoAvatarOutSync1: snap Mongo spesso hash 404 — nome ok, avatar solo dopo live */
        avatarUrl: "",
      });
    } else if (snapName && !cache.has(uid)) {
      cache.set(uid, {
        userId: uid,
        displayName: snapName,
        username: String(snap.username || "").trim(),
        avatarUrl: "",
      });
    }

    needFetch.push(uid);
  }

  if (needFetch.length) {
    /* organicoAvatarOutSync1: sync — fuori guild/roster senza avatar live devono stare in needLive
       (prima lo snap 404 faceva avOk=true e saltava il fetch → silhouette). */
    needFetch.sort((a?, b?) => {
      const aOk = hasRealDiscordAvatarUrl(cache.get(a)?.avatarUrl) ? 1 : 0;
      const bOk = hasRealDiscordAvatarUrl(cache.get(b)?.avatarUrl) ? 1 : 0;
      const aName = cache.get(a)?.displayName ? 1 : 0;
      const bName = cache.get(b)?.displayName ? 1 : 0;
      return aOk - bOk || aName - bName;
    });
    const needLive = needFetch.filter((uid?) => {
      const hit = cache.get(uid);
      const nameOk =
        hit?.displayName &&
        hit.displayName !== FALLBACK_LABEL &&
        !isSnowflakeLabel(hit.displayName, uid);
      /* organicoAvatarOutSync1: qui solo nomi; avatar recenti → syncHealRecent */
      return !nameOk;
    });
    const fetched = await resolveWebUserIdentitiesBatch(
      client,
      guild,
      needLive.length ? needLive : [],
      {
        cap: 32,
        budgetMs: 2_500,
        batchSize: 4,
        paceMs: 0,
        /* già controllato members.cache sopra — no fetch membro timeout */
        skipGuildMember: true,
        preferFreshUser: true,
      },
    );
    for (const uid of needFetch) {
      const id = fetched.get(uid);
      const prev = cache.get(uid);
      const snap = snapByUserId?.get?.(uid);
      const snapName = snap ? safeDisplayLabel(snap.displayName || snap.username, uid, "") : "";
      if (!id && prev) continue;
      const name =
        (id && safeDisplayLabel(id.displayName, uid, "")) ||
        (prev && safeDisplayLabel(prev.displayName, uid, "")) ||
        snapName;
      if (!name) continue;
      const fetchedAv = normalizeHistoryAvatarUrl(id?.avatarUrl || "");
      const prevAv = normalizeHistoryAvatarUrl(prev?.avatarUrl || "");
      let avatarUrl = "";
      if (hasRealDiscordAvatarUrl(fetchedAv)) {
        avatarUrl = fetchedAv;
      } else if (hasRealDiscordAvatarUrl(prevAv)) {
        avatarUrl = prevAv;
      } else {
        /* organicoAvatarOutSync1: mai ripescare snap Mongo 404 */
        avatarUrl = "";
      }
      cache.set(uid, {
        userId: uid,
        displayName: name,
        username: String(id?.username || prev?.username || snap?.username || "").trim(),
        avatarUrl,
      });
    }
  }

  for (const uid of (userIds || []).map((x?) => String(x || "").trim()).filter(Boolean)) {
    if (!cache.has(uid)) cache.set(uid, identityFallback(uid));
  }
  return cache;
}

async function resolveHistoryIdentity(_guild?, _client?, userId?, cache?) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const hit = cache.get(uid) || identityFallback(uid);
  return {
    ...hit,
    displayName: safeDisplayLabel(hit.displayName, uid),
  };
}

function mergeUserHistoryRows(doc?) {
  const fromStaff = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
  const fromRetention = Array.isArray(doc?.staffRolesHistoryRetention) ? doc.staffRolesHistoryRetention : [];
  const fromTrack = (Array.isArray(doc?.staff?.trackHistory) ? doc.staff.trackHistory : [])
    .filter((row?) => {
      const k = String(row?.kind || "").toLowerCase();
      return k === "pex" || k === "depex";
    })
    .map((row?) => ({
      kind: String(row.kind || "").toLowerCase(),
      oldRole: row.oldRole,
      newRole: row.newRole,
      reason: row.reason,
      date: row.date,
      displayName: row.displayName,
      username: row.username,
      avatarUrl: row.avatarUrl,
    }));
  return fromStaff.concat(fromRetention).concat(fromTrack);
}

function rosterMembersById(roster?) {
  const byId = new Map();
  for (const sec of roster?.sections || []) {
    for (const m of sec.members || []) {
      if (m?.userId) byId.set(String(m.userId), m);
    }
  }
  return byId;
}

async function buildPexDepexHistory(guild?, client?, filterUserId?, rosterById = null) {
  await ensureGuildRolesCached(guild);
  const guildId = String(guild.id);
  const query: Record<string, any> = { guildId };
  if (filterUserId) {
    query.userId = String(filterUserId);
  } else {
    query.$or = [
      { "staff.rolesHistory.0": { $exists: true } },
      { "staffRolesHistoryRetention.0": { $exists: true } },
      { "staff.trackHistory.0": { $exists: true } },
    ];
  }

  const docs = await ActivityUserProfile.find(query, {
    userId: 1,
    "staff.rolesHistory": 1,
    "staff.trackHistory": 1,
    staffRolesHistoryRetention: 1,
  })
    .lean()
    .catch(() => []);

    const snapByUserId = new Map();
  for (const doc of docs || []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    for (const row of mergeUserHistoryRows(doc)) {
      if (!row) continue;
      const name = safeDisplayLabel(row.displayName || row.username, uid, "");
      if (!name) continue;
      const prev = snapByUserId.get(uid);
      if (prev?.displayName && !isSnowflakeLabel(prev.displayName, uid)) {
        if (!prev.avatarUrl && /^https:\/\//i.test(String(row.avatarUrl || ""))) {
          prev.avatarUrl = String(row.avatarUrl);
        }
        continue;
      }
      snapByUserId.set(uid, {
        displayName: name,
        username: String(row.username || "").trim(),
        avatarUrl: /^https:\/\//i.test(String(row.avatarUrl || "")) ? String(row.avatarUrl) : "",
      });
    }
  }

  const userIds = (docs || []).map((doc?) => String(doc?.userId || "").trim()).filter(Boolean);
  const identityCache = await resolveHistoryIdentitiesBatch(
    guild,
    client,
    userIds,
    rosterById,
    snapByUserId,
  );
  const rows = [];

  for (const doc of docs || []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    const identity = await resolveHistoryIdentity(guild, client, uid, identityCache);
    if (!identity) continue;

    for (const row of mergeUserHistoryRows(doc)) {
      if (!row) continue;
      const reasonRaw = String(row.reason || "");
      const isAuto =
        /\bautomatico\b/i.test(reasonRaw) ||
        /\bdepex automatico\b/i.test(reasonRaw) ||
        /\b3 warn staff\b/i.test(reasonRaw);
      if (!isAuto && isHiddenManualStaffCareerReason(row.reason)) continue;
      const storedKind = row.kind === "pex" || row.kind === "depex" ? row.kind : null;
      const kind =
        storedKind ||
        classifyPexDepexKind(row.oldRole, row.newRole, guild) ||
        inferKindFromReason(row.reason);
      if (!kind) continue;
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
            const snapName = safeDisplayLabel(row.displayName || row.username, uid, "");
      const liveOk =
        identity.displayName &&
        !isSnowflakeLabel(identity.displayName, uid) &&
        identity.displayName !== FALLBACK_LABEL;
      const username = String(row.username || identity.username || "").trim();
      /* organicoRoleRemap1: evita "Utente" se c'è username/live usable */
      const displayName =
        snapName ||
        (liveOk ? identity.displayName : "") ||
        safeDisplayLabel(username, uid, "") ||
        safeDisplayLabel(identity.displayName, uid, "") ||
        FALLBACK_LABEL;
      const snapAvatar = String(row.avatarUrl || "").trim();
      /* organicoAvatarGlobal1: identity batch è la fonte avatar (no row snap 404) */
      const avatarUrl = pickHistoryAvatarUrl(snapAvatar, identity.avatarUrl, uid);
      const fromRoleId = resolveRoleIdForWeight(guild, row.oldRole);
      const toRoleId = resolveRoleIdForWeight(guild, row.newRole);
      rows.push({
        kind,
        userId: uid,
        displayName,
        username,
        avatarUrl,
        /* organicoAvatarOutSync1: snap solo per HEAD fallback in syncHeal */
        _snapAvatar: normalizeHistoryAvatarUrl(snapAvatar) || "",
        fromRoleId,
        toRoleId,
        fromRole: roleNameFromId(guild, fromRoleId || row.oldRole),
        toRole: roleNameFromId(guild, toRoleId || row.newRole),
        reason: stripDiscordDecorations(row.reason || "") || null,
        dateIso: iso,
        dateLabel: formatHistoryDate(iso),
        _sort: iso ? new Date(iso).getTime() : 0,
      });
    }
  }

  rows.sort((a?, b?) => b._sort - a._sort);
  const deduped = dedupeHistoryRows(rows);
  const total = deduped.length;
  const stats = {
    total,
    shown: total,
    pexCount: deduped.filter((r?) => r.kind === "pex").length,
    depexCount: deduped.filter((r?) => r.kind === "depex").length,
    skipped: 0,
    truncated: false,
  };

    const fetchedOnly = new Map();
  for (const [uid, id] of identityCache.entries()) {
    if (!snapByUserId.has(uid) && !rosterById?.get?.(uid)) fetchedOnly.set(uid, id);
  }
  if (fetchedOnly.size) {
    void persistHistoryIdentitySnapshots(guildId, fetchedOnly).catch(() => null);
  }

  /* organicoFastPaint1: sync corto pagina-1; resto in background */
  await syncHealRecentHistoryAvatars(client, guild, deduped, { cap: 8, budgetMs: 2_200 });
  warmHealHistoryAvatarUrls(client, guild, deduped);

  return {
    items: deduped.map(({ _sort, fromRoleId, toRoleId, _snapAvatar, ...rest }) => rest),
    stats,
  };
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

function historyIdentityIncomplete(items?) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return false;
  let bad = 0;
  for (const it of list) {
    const name = String(it?.displayName || "").trim();
    if (!name || name === FALLBACK_LABEL || isSnowflakeLabel(name, it?.userId)) bad += 1;
    else if (!hasRealDiscordAvatarUrl(it?.avatarUrl)) bad += 1;
  }
  return bad >= Math.max(3, Math.ceil(list.length * 0.12));
}

function warmMissingHistoryIdentities(client?, guild?, items?) {
  const missing = [
    ...new Set(
      (items || [])
        .filter((it?) => {
          const name = String(it?.displayName || "").trim();
          const nameBad = !name || name === FALLBACK_LABEL || isSnowflakeLabel(name, it?.userId);
          const avBad = !hasRealDiscordAvatarUrl(it?.avatarUrl);
          return nameBad || avBad;
        })
        .map((it?) => String(it?.userId || "").trim())
        .filter(Boolean),
    ),
  ];
  if (!missing.length) return;
  void (async () => {
    const cache = await resolveWebUserIdentitiesBatch(client, guild, missing, {
      cap: 500,
      budgetMs: 180_000,
      batchSize: 2,
      paceMs: 150,
      skipGuildMember: true,
      preferFreshUser: true,
    }).catch(() => null);
    if (!cache?.size) return;
    await persistHistoryIdentitySnapshots(guild?.id, cache).catch(() => null);
  })();
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
  buildStaffDelMeseBlock,
  buildPexDepexHistory,
  classifyPexDepexKind,
};
