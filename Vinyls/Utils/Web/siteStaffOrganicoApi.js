const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { STAFF_LADDER_KEYS_HIGH_TO_LOW, staffLadderRoleIds } = require("../Staff/staffRoleHierarchy");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { identityFromMember, stripDiscordDecorations } = require("./siteStaffRosterCache");
const { buildRoster } = require("./siteStaffManageApi");
const { isHiddenManualStaffCareerReason } = require("../Staff/staffTrackHistory");
const {
  resolveWebUserIdentitiesBatch,
  identityFallback,
  safeDisplayLabel,
  isSnowflakeLabel,
  FALLBACK_LABEL,
} = require("./siteWebUserIdentity");
const { userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

const PM_ROLE_ID = String(IDs.roles?.PartnerManager || "").trim();
const LADDER_IDS = staffLadderRoleIds();
const ORGANICO_CACHE_TTL_MS = 45_000;
const organicoCache = new Map();

function defaultAvatarForUserId(userId, size = 128) {
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

function hasRealDiscordAvatarUrl(url) {
  return /^https:\/\/cdn\.discordapp\.com\/avatars\//i.test(String(url || "").trim());
}

function isEmbedDiscordAvatarUrl(url) {
  return /cdn\.discordapp\.com\/embed\/avatars\//i.test(String(url || "").trim());
}

function pickHistoryAvatarUrl(snapAvatar, identityAvatar, userId) {
  const snap = String(snapAvatar || "").trim();
  const idAv = String(identityAvatar || "").trim();
  if (hasRealDiscordAvatarUrl(snap)) return snap;
  if (hasRealDiscordAvatarUrl(idAv)) return idAv;
  if (/^https:\/\//i.test(snap) && !isEmbedDiscordAvatarUrl(snap)) return snap;
  if (/^https:\/\//i.test(idAv) && !isEmbedDiscordAvatarUrl(idAv)) return idAv;
  return defaultAvatarForUserId(userId, 128);
}

function organicoCacheKey(filterUserId) {
  return `${String(IDs.guilds.main || "")}:${String(filterUserId || "all")}`;
}

function readOrganicoCache(filterUserId) {
  const entry = organicoCache.get(organicoCacheKey(filterUserId));
  if (!entry || Date.now() > entry.exp) {
    organicoCache.delete(organicoCacheKey(filterUserId));
    return null;
  }
  return entry.payload;
}

function writeOrganicoCache(filterUserId, payload) {
  if (organicoCache.size > 32) {
    const first = organicoCache.keys().next().value;
    if (first) organicoCache.delete(first);
  }
  organicoCache.set(organicoCacheKey(filterUserId), {
    exp: Date.now() + ORGANICO_CACHE_TTL_MS,
    payload,
  });
}

async function ensureGuildRolesCached(guild) {
  if (!guild?.roles?.cache) return;
  const sampleIds = LADDER_IDS.slice(0, 3).concat([PM_ROLE_ID]).filter(Boolean);
  const missing = sampleIds.some((id) => !guild.roles.cache.has(id));
  if (missing || guild.roles.cache.size < 8) {
    await guild.roles.fetch().catch(() => null);
  }
}

function humanizeRoleKey(key) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function roleNameFromId(guild, roleIdOrName) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if (!/^\d{16,22}$/.test(raw)) {
    return stripDiscordDecorations(raw) || raw;
  }
  const live = guild?.roles?.cache?.get(raw)?.name;
  if (live) return stripDiscordDecorations(live) || live;
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    if (String(val) === raw) {
      const label = humanizeRoleKey(key);
      return label || raw;
    }
  }
  return raw;
}

function resolveRoleIdForWeight(guild, roleIdOrName) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw) return "";
  if (/^\d{16,22}$/.test(raw)) return raw;
  const normalized = stripDiscordDecorations(raw).toLowerCase();
  if (guild?.roles?.cache) {
    for (const role of guild.roles.cache.values()) {
      const name = stripDiscordDecorations(role.name || "").toLowerCase();
      if (name === normalized) return role.id;
    }
  }
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    const id = String(val || "").trim();
    if (!id) continue;
    const label = humanizeRoleKey(key).toLowerCase();
    const keyNorm = String(key).toLowerCase();
    if (label === normalized || keyNorm === normalized.replace(/\s+/g, "")) return id;
  }
  if (normalized) {
    for (const key of STAFF_LADDER_KEYS_HIGH_TO_LOW) {
      const label = humanizeRoleKey(key).toLowerCase();
      const id = String(roles[key] || "").trim();
      if (!id || !label) continue;
      const re = new RegExp(`(?:^|\\s|༄|☕|🎠|🥢)${label}(?:\\s|$)`, "i");
      if (re.test(normalized) || normalized.endsWith(label)) return id;
    }
    if (guild?.roles?.cache) {
      for (const role of guild.roles.cache.values()) {
        const name = stripDiscordDecorations(role.name || "").toLowerCase();
        if (!name) continue;
        if (normalized.endsWith(name) || name.endsWith(normalized)) return role.id;
      }
    }
  }
  return raw;
}

function staffTrackWeight(roleIdOrName, guild) {
  const id = resolveRoleIdForWeight(guild, roleIdOrName);
  if (!id) return 0;
  if (PM_ROLE_ID && id === PM_ROLE_ID) return 1;
  const idx = LADDER_IDS.indexOf(id);
  if (idx >= 0) return STAFF_LADDER_KEYS_HIGH_TO_LOW.length - idx + 1;
  const memberId = String(IDs.roles?.Member || "").trim();
  if (memberId && id === memberId) return 0;
  return 0;
}

function classifyPexDepexKind(oldRole, newRole, guild) {
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

function formatHistoryDate(iso) {
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

async function persistHistoryIdentitySnapshots(guildId, identityCache) {
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
      const stamp = (rows) => {
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

async function resolveHistoryIdentitiesBatch(guild, client, userIds, rosterById = null, snapByUserId = null) {
  const cache = new Map();
  const needFetch = [];

  for (const raw of userIds || []) {
    const uid = String(raw || "").trim();
    if (!uid) continue;

    const roster = rosterById?.get?.(uid);
    if (roster) {
      const name = safeDisplayLabel(roster.displayName, uid, "");
      if (name) {
        cache.set(uid, {
          userId: uid,
          displayName: name,
          username: String(roster.username || "").trim(),
          avatarUrl: String(roster.avatarUrl || "").trim() || defaultAvatarForUserId(uid, 128),
        });
        continue;
      }
    }

    const snap = snapByUserId?.get?.(uid);
    if (snap) {
      const name = safeDisplayLabel(snap.displayName || snap.username, uid, "");
      if (name) {
        cache.set(uid, {
          userId: uid,
          displayName: name,
          username: String(snap.username || "").trim(),
          avatarUrl:
            (/^https:\/\//i.test(String(snap.avatarUrl || ""))
              ? String(snap.avatarUrl)
              : "") || defaultAvatarForUserId(uid, 128),
        });
        continue;
      }
    }

    try {
      const member = guild?.members?.cache?.get(uid);
      if (member) {
        const name = safeDisplayLabel(member.displayName || member.user?.username, uid, "");
        if (name) {
          const memberAvatar = String(userAvatarUrlDynamic(member, { size: 128 }) || "").trim();
          cache.set(uid, {
            userId: uid,
            displayName: name,
            username: String(member.user?.username || "").trim(),
            avatarUrl:
              (hasRealDiscordAvatarUrl(memberAvatar) ? memberAvatar : "") ||
              defaultAvatarForUserId(uid, 128),
          });
          continue;
        }
      }
    } catch {
          }

    needFetch.push(uid);
  }

      if (needFetch.length) {
    const fetched = await resolveWebUserIdentitiesBatch(client, guild, needFetch, {
      cap: 80,
      budgetMs: 5_000,
      batchSize: 4,
      paceMs: 0,
      skipGuildMember: false,
    });
    for (const [uid, id] of fetched.entries()) {
      if (!id) continue;
      const name = safeDisplayLabel(id.displayName, uid, "");
      if (!name) continue;
      cache.set(uid, {
        userId: uid,
        displayName: name,
        username: String(id.username || "").trim(),
        avatarUrl: String(id.avatarUrl || "").trim() || defaultAvatarForUserId(uid, 128),
      });
    }
  }

  for (const uid of (userIds || []).map((x) => String(x || "").trim()).filter(Boolean)) {
    if (!cache.has(uid)) cache.set(uid, identityFallback(uid));
  }
  return cache;
}

async function resolveHistoryIdentity(_guild, _client, userId, cache) {
  const uid = String(userId || "").trim();
  if (!uid) return null;
  const hit = cache.get(uid) || identityFallback(uid);
  return {
    ...hit,
    displayName: safeDisplayLabel(hit.displayName, uid),
  };
}

function mergeUserHistoryRows(doc) {
  const fromStaff = Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [];
  const fromRetention = Array.isArray(doc?.staffRolesHistoryRetention) ? doc.staffRolesHistoryRetention : [];
  return fromStaff.concat(fromRetention);
}

function rosterMembersById(roster) {
  const byId = new Map();
  for (const sec of roster?.sections || []) {
    for (const m of sec.members || []) {
      if (m?.userId) byId.set(String(m.userId), m);
    }
  }
  return byId;
}

async function buildPexDepexHistory(guild, client, filterUserId, rosterById = null) {
  await ensureGuildRolesCached(guild);
  const guildId = String(guild.id);
  const query = { guildId };
  if (filterUserId) {
    query.userId = String(filterUserId);
  } else {
    query.$or = [
      { "staff.rolesHistory.0": { $exists: true } },
      { "staffRolesHistoryRetention.0": { $exists: true } },
    ];
  }

  const docs = await ActivityUserProfile.find(query, {
    userId: 1,
    "staff.rolesHistory": 1,
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

  const userIds = (docs || []).map((doc) => String(doc?.userId || "").trim()).filter(Boolean);
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
      if (isHiddenManualStaffCareerReason(row.reason)) continue;
      const storedKind = row.kind === "pex" || row.kind === "depex" ? row.kind : null;
      const kind = storedKind || classifyPexDepexKind(row.oldRole, row.newRole, guild);
      if (!kind) continue;
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
            const snapName = safeDisplayLabel(row.displayName || row.username, uid, "");
      const liveOk =
        identity.displayName &&
        !isSnowflakeLabel(identity.displayName, uid) &&
        identity.displayName !== FALLBACK_LABEL;
      const displayName = snapName || (liveOk ? identity.displayName : identity.displayName);
      const username = String(row.username || identity.username || "").trim();
      const snapAvatar = String(row.avatarUrl || "").trim();
      const avatarUrl = pickHistoryAvatarUrl(
        snapAvatar,
        (liveOk && identity.avatarUrl) || identity.avatarUrl,
        uid,
      );
      rows.push({
        kind,
        userId: uid,
        displayName,
        username,
        avatarUrl,
        fromRole: roleNameFromId(guild, row.oldRole),
        toRole: roleNameFromId(guild, row.newRole),
        reason: stripDiscordDecorations(row.reason || "") || null,
        dateIso: iso,
        dateLabel: formatHistoryDate(iso),
        _sort: iso ? new Date(iso).getTime() : 0,
      });
    }
  }

  rows.sort((a, b) => b._sort - a._sort);
  const total = rows.length;
  const stats = {
    total,
    shown: total,
    pexCount: rows.filter((r) => r.kind === "pex").length,
    depexCount: rows.filter((r) => r.kind === "depex").length,
    skipped: rows.filter((r) => !r.kind).length,
    truncated: false,
  };

    const fetchedOnly = new Map();
  for (const [uid, id] of identityCache.entries()) {
    if (!snapByUserId.has(uid) && !rosterById?.get?.(uid)) fetchedOnly.set(uid, id);
  }
  if (fetchedOnly.size) {
    void persistHistoryIdentitySnapshots(guildId, fetchedOnly).catch(() => null);
  }

  return {
    items: rows.map(({ _sort, ...rest }) => rest),
    stats,
  };
}

function buildStaffDelMeseBlock(guild) {
  const roleId = String(IDs.roles?.StafferDelMese || "").trim();
  const role = roleId && guild?.roles?.cache?.get(roleId) ? guild.roles.cache.get(roleId) : null;
  const holders = [];
  if (roleId && guild?.members?.cache) {
    guild.members.cache.forEach((member) => {
      if (!member?.roles?.cache?.has?.(roleId)) return;
      holders.push(identityFromMember(member));
    });
  }
  holders.sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"));
  return {
    roleId: roleId || null,
    roleLabel: role ? stripDiscordDecorations(role.name) || role.name : "Staffer del Mese",
    holders,
  };
}

function historyIdentityIncomplete(items) {
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

function warmMissingHistoryIdentities(client, guild, items) {
  const missing = [
    ...new Set(
      (items || [])
        .filter((it) => {
          const name = String(it?.displayName || "").trim();
          const nameBad = !name || name === FALLBACK_LABEL || isSnowflakeLabel(name, it?.userId);
          const avBad = !hasRealDiscordAvatarUrl(it?.avatarUrl);
          return nameBad || avBad;
        })
        .map((it) => String(it?.userId || "").trim())
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
    }).catch(() => null);
    if (!cache?.size) return;
    await persistHistoryIdentitySnapshots(guild?.id, cache).catch(() => null);
  })();
}

async function handleSiteStaffOrganicoGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
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
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=20");
      res.setHeader("X-VC-Organico-Ms", String(Date.now() - t0));
      if (rosterOnly) res.setHeader("X-VC-Organico-Mode", "roster-cache");
      return res.status(200).json({ ...cached, cached: true });
    }

    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
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
        pexHistory: [],
        historyStats: null,
        historyFilterUserId: filterUserId || null,
      };
      writeOrganicoCache(cacheKey, lightPayload);
      res.setHeader("Cache-Control", "private, max-age=20");
      res.setHeader("X-VC-Organico-Ms", String(Date.now() - t0));
      res.setHeader("X-VC-Organico-Mode", "roster");
      return res.status(200).json(lightPayload);
    }

    const byId = rosterMembersById(roster);
    const historyResult = await buildPexDepexHistory(guild, client, filterUserId || null, byId);

        for (const item of historyResult.items || []) {
      const live = byId.get(String(item.userId || ""));
      item.displayName = safeDisplayLabel(item.displayName, item.userId);
      if (!live) continue;
      if (isSnowflakeLabel(item.displayName, item.userId) || item.displayName === FALLBACK_LABEL) {
        item.displayName = safeDisplayLabel(live.displayName, item.userId);
        item.username = live.username || item.username;
      }
      const liveAvatar = String(live.avatarUrl || "").trim();
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
    }

    const payload = {
      ok: true,
      viewer: identityFromMember(access.member),
      counts: roster.counts,
      sections: roster.sections,
      staffDelMese: roster.staffDelMese || buildStaffDelMeseBlock(guild),
      pexHistory: historyResult.items,
      historyStats: historyResult.stats,
      historyFilterUserId: filterUserId || null,
    };

    if (historyIdentityIncomplete(historyResult.items)) {
            warmMissingHistoryIdentities(client, guild, historyResult.items);
    } else {
      writeOrganicoCache(filterUserId || null, payload);
    }

    res.setHeader("Cache-Control", "private, max-age=20");
    res.setHeader("X-VC-Organico-Ms", String(Date.now() - t0));
    res.setHeader("X-VC-Organico-Mode", "full");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-organico GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffOrganicoPost(_client, _req, res) {
  return res.status(410).json({
    ok: false,
    error: "gone",
    message: "Le azioni pex/depex sono disponibili solo in Gestione staff.",
  });
}

module.exports = {
  handleSiteStaffOrganicoGet,
  handleSiteStaffOrganicoPost,
  buildStaffDelMeseBlock,
  buildPexDepexHistory,
  classifyPexDepexKind,
};
