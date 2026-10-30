const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");

const DEFAULT_HISTORY_DAYS = 3;
const MAX_HISTORY_DAYS = 30;
const SNOWFLAKE_RE = /^\d{16,20}$/;

function clampHistoryDays(rawDays?) {
  const n = Number.parseInt(String(rawDays ?? "").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HISTORY_DAYS;
  return Math.min(MAX_HISTORY_DAYS, n);
}

function formatHistoryDaysLabel(days?) {
  const n = clampHistoryDays(days);
  return n === 1 ? "1 giorno" : `${n} giorni`;
}

function isValidHistoryDaysToken(token?) {
  const n = Number.parseInt(String(token || "").trim(), 10);
  return Number.isFinite(n) && n >= 1 && n <= MAX_HISTORY_DAYS;
}

function parseHistoryArgs(args = []) {
  const tokens = (Array.isArray(args) ? args : [])
    .map((token?) => String(token || "").trim())
    .filter(Boolean);
  const guildId = tokens.find((token?) => SNOWFLAKE_RE.test(token)) || null;
  const daysToken = tokens.find((token?) => isValidHistoryDaysToken(token)) || null;
  const invalidId =
    tokens.find(
      (token?) => /^\d+$/.test(token) && !SNOWFLAKE_RE.test(token) && !isValidHistoryDaysToken(token),
    ) || null;
  return {
    guildId,
    days: daysToken ? clampHistoryDays(daysToken) : DEFAULT_HISTORY_DAYS,
    invalidId,
  };
}

async function listRecentPartnerGuildIds(guildId?, days = DEFAULT_HISTORY_DAYS) {
  const gid = String(guildId || "").trim();
  const safeDays = clampHistoryDays(days);
  if (!gid) return { ids: [], days: safeDays };

  const since = new Date(Date.now() - safeDays * 24 * 60 * 60 * 1000);
  const rows = await ActivityUserProfile.aggregate([
    { $match: { guildId: gid } },
    { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "staff.partnerActions.action": { $regex: /^create$/i },
        "staff.partnerActions.date": { $gte: since },
      },
    },
    {
      $project: {
        partnerGuildId: "$staff.partnerActions.partnerGuildId",
        date: "$staff.partnerActions.date",
      },
    },
    { $sort: { date: -1 } },
  ]).catch(() => []);

  const seen = new Set();
  const ids = [];
  for (const row of rows) {
    const id = String(row?.partnerGuildId || "").trim();
    if (!/^\d{17,22}$/.test(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }

  return { ids, days: safeDays };
}

const MAX_HISTORY_RANGE_DAYS = 3650;
const DEFAULT_HISTORY_LIST_LIMIT = 250;
const DEFAULT_HISTORY_PAGE_SIZE = 10;
const MAX_HISTORY_PAGE_SIZE = 50;

function resolveHistoryRangeDays(raw?) {
  if (raw == null) return null;
  const token = String(raw).trim().toLowerCase();
  if (!token || token === "all" || token === "0" || token === "tutti") return null;
  const n = Number.parseInt(token, 10);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(MAX_HISTORY_RANGE_DAYS, n);
}

function resolveHistoryPage(raw?) {
  const n = Number.parseInt(String(raw ?? "1"), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(10_000, n);
}

function resolveHistoryPageSize(raw?) {
  const n = Number.parseInt(String(raw ?? DEFAULT_HISTORY_PAGE_SIZE), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_HISTORY_PAGE_SIZE;
  return Math.min(MAX_HISTORY_PAGE_SIZE, n);
}

function resolvePartnerHistoryGroupKey(action?) {
  const guildIdRaw = String(action?.partnerGuildId || "").trim();
  const guildId = /^\d{17,22}$/.test(guildIdRaw) ? guildIdRaw : null;
  const invite = String(action?.invite || "").trim() || null;
  const nameRaw = String(action?.partner || "").trim();
    const guildName =
    nameRaw && !/^(server\s+sconosciuto|partner)$/i.test(nameRaw) ? nameRaw : null;

  if (guildId) {
    return { key: `gid:${guildId}`, guildId, invite, guildName };
  }

  let inviteKey = null;
  if (invite) {
    const m =
      invite.match(/discord(?:app)?\.com\/invite\/([a-zA-Z0-9-]+)/i) ||
      invite.match(/discord\.gg\/([a-zA-Z0-9-]+)/i) ||
      invite.match(/\b([a-zA-Z0-9-]{6,32})\b/);
    inviteKey = m?.[1] ? String(m[1]).toLowerCase() : invite.toLowerCase();
  }
  if (inviteKey) {
    return { key: `inv:${inviteKey}`, guildId: null, invite, guildName };
  }
  if (guildName) {
    return { key: `name:${guildName.toLowerCase()}`, guildId: null, invite: null, guildName };
  }
  return null;
}

async function listPartnerGuildHistory(guildId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const days = resolveHistoryRangeDays(options?.days);
  const pageSize = resolveHistoryPageSize(
    options?.pageSize != null ? options.pageSize : options?.limit ?? DEFAULT_HISTORY_PAGE_SIZE,
  );
  const requestedPage = resolveHistoryPage(options?.page);
  const empty = {
    days,
    entries: [],
    uniqueServers: 0,
    totalPartnerships: 0,
    page: 1,
    pageSize,
    totalPages: 1,
  };
  if (!gid) return empty;

  const since = days != null ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const dateMatch = since ? { "staff.partnerActions.date": { $gte: since } } : {};

    const rawActions = await ActivityUserProfile.aggregate([
    { $match: { guildId: gid } },
    { $unwind: { path: "$staff.partnerActions", preserveNullAndEmptyArrays: false } },
    {
      $match: {
        "staff.partnerActions.action": { $regex: /^create$/i },
        ...dateMatch,
      },
    },
    {
      $project: {
        _id: 0,
        partnerGuildId: "$staff.partnerActions.partnerGuildId",
        partner: "$staff.partnerActions.partner",
        invite: "$staff.partnerActions.invite",
        date: "$staff.partnerActions.date",
      },
    },
    { $sort: { date: -1 } },
  ]).catch(() => []);

  const groups = new Map();
  let totalPartnerships = 0;
  for (const row of Array.isArray(rawActions) ? rawActions : []) {
    const grouped = resolvePartnerHistoryGroupKey(row);
    if (!grouped) continue;
    totalPartnerships += 1;
    const when = row?.date != null ? new Date(row.date) : null;
    const whenMs = when && !Number.isNaN(when.getTime()) ? when.getTime() : null;
    const prev = groups.get(grouped.key);
    if (!prev) {
      groups.set(grouped.key, {
        guildId: grouped.guildId,
        invite: grouped.invite,
        guildName: grouped.guildName,
        count: 1,
        lastAtMs: whenMs,
        firstAtMs: whenMs,
      });
      continue;
    }
    prev.count += 1;
    if (!prev.guildId && grouped.guildId) prev.guildId = grouped.guildId;
    if (!prev.invite && grouped.invite) prev.invite = grouped.invite;
    if (!prev.guildName && grouped.guildName) prev.guildName = grouped.guildName;
    if (whenMs != null) {
      if (prev.lastAtMs == null || whenMs > prev.lastAtMs) prev.lastAtMs = whenMs;
      if (prev.firstAtMs == null || whenMs < prev.firstAtMs) prev.firstAtMs = whenMs;
    }
  }

  const allEntries = Array.from(groups.values())
    .map((row?) => ({
      guildId: row.guildId || null,
      count: Math.max(0, Math.floor(Number(row.count) || 0)),
      lastAt: row.lastAtMs != null ? new Date(row.lastAtMs).toISOString() : null,
      firstAt: row.firstAtMs != null ? new Date(row.firstAtMs).toISOString() : null,
      guildName: row.guildName || null,
      invite: row.invite || null,
    }))
    .sort((a?, b?) => {
      const tb = b.lastAt ? Date.parse(b.lastAt) : 0;
      const ta = a.lastAt ? Date.parse(a.lastAt) : 0;
      if (tb !== ta) return tb - ta;
      return b.count - a.count;
    });

  const uniqueServers = allEntries.length;
  const totalPages = Math.max(1, Math.ceil(Math.max(uniqueServers, 1) / pageSize) || 1);
  const page = Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;
  const entries = uniqueServers === 0 ? [] : allEntries.slice(start, start + pageSize);

  return {
    days,
    entries,
    uniqueServers,
    totalPartnerships: Math.max(0, Math.floor(totalPartnerships)),
    page: uniqueServers === 0 ? 1 : page,
    pageSize,
    totalPages: uniqueServers === 0 ? 1 : totalPages,
  };
}

export = {
  DEFAULT_HISTORY_DAYS,
  MAX_HISTORY_DAYS,
  MAX_HISTORY_RANGE_DAYS,
  DEFAULT_HISTORY_LIST_LIMIT,
  DEFAULT_HISTORY_PAGE_SIZE,
  MAX_HISTORY_PAGE_SIZE,
  clampHistoryDays,
  formatHistoryDaysLabel,
  parseHistoryArgs,
  resolveHistoryRangeDays,
  resolveHistoryPage,
  resolveHistoryPageSize,
  listRecentPartnerGuildIds,
  listPartnerGuildHistory,
};
