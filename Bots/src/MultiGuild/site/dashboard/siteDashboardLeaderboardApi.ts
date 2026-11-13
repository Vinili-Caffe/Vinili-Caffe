const {
  getPartnershipConfigSync,
  refreshPartnershipConfigCache,
} = require("../../../Vinili/Partner/core/tenantPartnershipSettings") as typeof import("../../../Vinili/Partner/core/tenantPartnershipSettings");
const {
  fetchLeaderboardRows,
  findRankEntry,
  normalizeCategory,
  normalizePeriod,
} = require("../../../Vinili/Partner/services/tenantLeaderboardService") as typeof import("../../../Vinili/Partner/services/tenantLeaderboardService");
const { guildIconUrl, userAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { getBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");

const DEFAULT_PER_PAGE = 12;
const MAX_PER_PAGE = 24;

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function parsePage(raw?) {
  const n = parseInt(String(raw || "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(500, n);
}

function parsePerPage(raw?) {
  const n = parseInt(String(raw || String(DEFAULT_PER_PAGE)), 10);
  if (!Number.isFinite(n)) return DEFAULT_PER_PAGE;
  return Math.min(MAX_PER_PAGE, Math.max(6, n));
}

function resolveInviteUrlSync(guildId?, managedByGuildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const cfg = getPartnershipConfigSync(gid);
  const fromCfg = String(cfg?.invite?.url || "").trim();
  if (fromCfg) return fromCfg;
  const managed = managedByGuildId && managedByGuildId.get ? managedByGuildId.get(gid) : null;
  if (managed?.url) return String(managed.url).trim();
  return null;
}

async function buildManagedInviteIndex() {
  const map = new Map();
  try {
    const raw = await getBotState("multiGuildManagedInvites", null);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return map;
    for (const [gid, row] of Object.entries(raw)) {
      if (row && typeof row === "object" && row.url) {
        map.set(String(gid), row);
      }
    }
  } catch {
  }
  return map;
}

function enrichGuildRowSync(client?, row?, rank?, selfGuildId?, managedByGuildId?) {
  const guildId = String(row.guildId || "").trim();
  const guild = client?.guilds?.cache?.get(guildId) || null;
  let iconUrl = null;
  try {
    iconUrl = guild ? guildIconUrl(guild, { size: 128 }) : null;
  } catch {
    iconUrl = null;
  }
  return {
    rank,
    guildId,
    name: String(guild?.name || guildId).trim() || guildId,
    iconUrl,
    inviteUrl: resolveInviteUrlSync(guildId, managedByGuildId),
    score: Math.max(0, Number(row.score) || 0),
    isSelf: Boolean(selfGuildId && guildId === selfGuildId),
  };
}

async function enrichPartnerRow(client?, guild?, row?, rank?, selfUserId?, membersById = null) {
  const userId = String(row.userId || "").trim();
  let member =
    (membersById && membersById.get && membersById.get(userId)) ||
    guild?.members?.cache?.get(userId) ||
    null;
  let user = member?.user || client?.users?.cache?.get(userId) || null;
  if (!user && client?.users?.fetch) {
    user = await client.users.fetch(userId).catch(() => null);
  }
  if (!user && member?.user) user = member.user;
  const username = String(user?.username || "").trim() || userId;
  const displayName = String(member?.displayName || user?.globalName || username).trim() || username;
  let avatarUrl = null;
  try {
    avatarUrl = userAvatarUrlDynamic(member || user, { size: 128 }) || null;
  } catch {
    avatarUrl = null;
  }
  return {
    rank,
    userId,
    username,
    displayName,
    avatarUrl,
    score: Math.max(0, Number(row.score) || 0),
    isSelf: Boolean(selfUserId && userId === selfUserId),
  };
}

async function resolveGuildMembersForLeaderboard(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.guilds) return null;
  let guild = client.guilds.cache?.get?.(gid) || null;
  const needsHydrate =
    !guild ||
    guild.partial === true ||
    !guild.members ||
    typeof guild.members.fetch !== "function" ||
    !guild.roles ||
    typeof guild.roles.fetch !== "function";
  if (needsHydrate && typeof client.guilds.fetch === "function") {
    guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
  }
  if (!guild?.members || typeof guild.members.fetch !== "function") return null;
  return guild;
}

async function filterRowsToPartnerManagers(client?, guildId?, rows?) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return [];

  const { getPartnerManagerRoleId } = require("../../../Vinili/Partner/core/partnershipConfigResolver") as typeof import("../../../Vinili/Partner/core/partnershipConfigResolver");
  const roleId = String(getPartnerManagerRoleId(guildId) || "").trim();
  if (!roleId) return [];

  const guild = await resolveGuildMembersForLeaderboard(client, guildId);
  if (!guild) return [];

  await guild.members.fetch().catch(() => null);
  const role =
    guild.roles?.cache?.get?.(roleId) ||
    (typeof guild.roles?.fetch === "function"
      ? await guild.roles.fetch(roleId).catch(() => null)
      : null);
  if (!role) return [];

  const pmIds = new Set();
  if (role.members?.forEach) {
    role.members.forEach((m?) => {
      if (m && !m.user?.bot) pmIds.add(String(m.id));
    });
  } else if (role.members?.values) {
    for (const m of role.members.values()) {
      if (m && !m.user?.bot) pmIds.add(String(m.id));
    }
  }
  if (!pmIds.size && guild.members?.cache?.size) {
    for (const m of guild.members.cache.values()) {
      if (m && !m.user?.bot && m.roles?.cache?.has?.(roleId)) pmIds.add(String(m.id));
    }
  }

  if (!pmIds.size) return [];
  return list.filter((row?) => pmIds.has(String(row?.userId || "").trim()));
}

/**
 * Classifica partnership (server / PM / ingressi). Usata da dashboard (auth) e sito pubblico.
 */
async function buildPartnershipLeaderboard(
  client?,
  {
    category: categoryRaw,
    period: periodRaw,
    page: pageRaw,
    perPage: perPageRaw,
    partnerScopeGuildId,
    selfUserId,
    selfGuildId,
  }: Record<string, any> = {},
) {
  const category = normalizeCategory(categoryRaw || "servers");
  const period = normalizePeriod(periodRaw || "total");
  const page = parsePage(pageRaw);
  const perPage = parsePerPage(perPageRaw);
  const scopeGuildId =
    category === "partners" ? String(partnerScopeGuildId || "").trim() || null : null;

  let rows = [];
  try {
    if (category === "servers") {
      await refreshPartnershipConfigCache().catch(() => null);
    }
    rows = await fetchLeaderboardRows(category, period, scopeGuildId, client);
    if (category === "partners" && scopeGuildId) {
      rows = await filterRowsToPartnerManagers(client, scopeGuildId, rows);
    }
  } catch (err) {
    global.logger?.error?.("[LEADERBOARD] fetch failed:", err);
    return fail(500, "fetch_failed", "Impossibile caricare la classifica.");
  }

  const total = Array.isArray(rows) ? rows.length : 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage) || 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * perPage;
  const slice = (rows || []).slice(start, start + perPage);

  const guild =
    (category === "partners" && scopeGuildId
      ? await resolveGuildMembersForLeaderboard(client, scopeGuildId)
      : null) ||
    (scopeGuildId ? client.guilds.cache.get(scopeGuildId) : null) ||
    null;

  let managedByGuildId = null;
  if (category === "servers" || category === "join") {
    managedByGuildId = await buildManagedInviteIndex();
  }

  let partnersMembers = null;
  if (category === "partners" && guild) {
    try {
      const { fetchMembers } = require("../../../Vinili/Community/utils/leaderboardHelpers") as typeof import("../../../Vinili/Community/utils/leaderboardHelpers");
      const ids = slice.map((r?) => String(r.userId || "").trim()).filter(Boolean);
      if (selfUserId) ids.push(String(selfUserId));
      partnersMembers = await fetchMembers(guild, ids);
    } catch (err) {
      global.logger?.warn?.("[LEADERBOARD] fetchMembers failed:", err?.message || err);
      partnersMembers = null;
    }
  }

  const enriched = [];
  for (let i = 0; i < slice.length; i += 1) {
    const rank = start + i + 1;
    try {
      if (category === "partners") {
        enriched.push(
          await enrichPartnerRow(client, guild, slice[i], rank, selfUserId, partnersMembers),
        );
      } else {
        enriched.push(enrichGuildRowSync(client, slice[i], rank, selfGuildId, managedByGuildId));
      }
    } catch (err) {
      global.logger?.warn?.("[LEADERBOARD] enrich row failed:", err?.message || err);
      if (category === "partners") {
        const userId = String(slice[i]?.userId || "").trim();
        enriched.push({
          rank,
          userId,
          username: userId,
          displayName: userId,
          avatarUrl: null,
          score: Math.max(0, Number(slice[i]?.score) || 0),
          isSelf: Boolean(selfUserId && userId === selfUserId),
        });
      } else {
        const gid = String(slice[i]?.guildId || "").trim();
        enriched.push({
          rank,
          guildId: gid,
          name: gid,
          iconUrl: null,
          inviteUrl: null,
          score: Math.max(0, Number(slice[i]?.score) || 0),
          isSelf: Boolean(selfGuildId && gid === selfGuildId),
        });
      }
    }
  }

  let self = null;
  try {
    if (category === "partners" && selfUserId) {
      const entry = findRankEntry(rows, (r?) => String(r.userId) === String(selfUserId));
      if (entry) {
        self = await enrichPartnerRow(
          client,
          guild,
          entry.row,
          entry.rank,
          selfUserId,
          partnersMembers,
        );
      }
    } else if ((category === "servers" || category === "join") && selfGuildId) {
      const entry = findRankEntry(rows, (r?) => String(r.guildId) === String(selfGuildId));
      if (entry) {
        self = enrichGuildRowSync(client, entry.row, entry.rank, selfGuildId, managedByGuildId);
      }
    }
  } catch (err) {
    global.logger?.warn?.("[LEADERBOARD] enrich self failed:", err?.message || err);
    self = null;
  }

  return {
    ok: true,
    status: 200,
    guildId: scopeGuildId || selfGuildId || null,
    category,
    period,
    page: safePage,
    perPage,
    total,
    totalPages,
    unit: category === "join" ? "joins" : "partnerships",
    self,
    rows: enriched,
  };
}

async function getDashboardPartnershipLeaderboard(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  }

  return buildPartnershipLeaderboard(client, {
    category: query.category || query.board || "servers",
    period: query.period || "total",
    page: query.page,
    perPage: query.perPage,
    partnerScopeGuildId: access.guildId,
    selfUserId: access.userId,
    selfGuildId: access.guildId,
  });
}

/** Classifica bot pubblica (sito /classifiche scope=bots). Partner manager = guild principale. */
async function getPublicPartnershipLeaderboard(client?, query: Record<string, any> = {}, opts: Record<string, any> = {}) {
  const IDs = require("../../../Vinili/Config/ids") as typeof import("../../../Vinili/Config/ids");
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  const selfUserId = String(opts.selfUserId || query.userId || "").trim() || null;
  return buildPartnershipLeaderboard(client, {
    category: query.category || query.board || "servers",
    period: query.period || "total",
    page: query.page,
    perPage: query.perPage || 10,
    partnerScopeGuildId: mainGuildId,
    selfUserId: /^\d{15,22}$/.test(String(selfUserId || "")) ? selfUserId : null,
    selfGuildId: mainGuildId,
  });
}

export = {
  getDashboardPartnershipLeaderboard,
  getPublicPartnershipLeaderboard,
  buildPartnershipLeaderboard,
};
