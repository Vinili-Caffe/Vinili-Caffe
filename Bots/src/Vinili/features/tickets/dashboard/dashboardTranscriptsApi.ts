/** Dashboard dei server: elenco delle trascrizioni dei ticket chiusi e apertura di una trascrizione. */
const Ticket = require("../../../Schemas/Ticket/ticketSchema");
const { verifyDashboardGuildAccess } = require("../../dashboard/siteDashboardApi") as typeof import("../../dashboard/siteDashboardApi");
const { getTicketSettingsForGuild, TICKET_TYPES } = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
const { buildTicketTranscriptViewUrl, buildTicketTranscriptApiUrl, transcriptViewExpired } = require("../transcript/ticketTranscriptSecure") as typeof import("../transcript/ticketTranscriptSecure");

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function coerceOpen(value?) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
}

function serializeTicketRow(ticket?, guildId?, options: Record<string, any> = {}) {
  const open = coerceOpen(ticket.open);
  const token = String(ticket.transcriptViewToken || "").trim();
  const transcriptExpired = token ? transcriptViewExpired(ticket) : true;
  const transcriptUrl =
    token && !transcriptExpired ? buildTicketTranscriptViewUrl(token) : null;
  const anonymise = options.anonymise === true;
  const uid = anonymise ? null : String(ticket.userId || "");
  const claimedBy = anonymise ? null : ticket.claimedBy ? String(ticket.claimedBy) : null;
  const usernames = options.usernames && typeof options.usernames === "object" ? options.usernames : {};
  const snapshot = String(ticket.userTag || "").trim();
  const username =
    anonymise
      ? null
      : (snapshot && snapshot !== uid ? snapshot : null) || (uid && usernames[uid]) || null;
  const claimedByUsername =
    anonymise || !claimedBy ? null : usernames[claimedBy] || null;
  return {
    id: String(ticket._id || ""),
    ticketNumber: ticket.ticketNumber != null ? Number(ticket.ticketNumber) : null,
    guildId: String(ticket.guildId || guildId || ""),
    userId: uid,
    username,
    channelId: String(ticket.channelId || ""),
    ticketType: String(ticket.ticketType || "supporto"),
    panelId: ticket.panelId ? String(ticket.panelId) : null,
    panelTitle: options.panelTitle || null,
    open,
    claimedBy,
    claimedByUsername,
    createdAt: ticket.createdAt || null,
    closedAt: ticket.closedAt || null,
    closeReason: ticket.closeReason ? String(ticket.closeReason) : null,
    closedBy: anonymise ? null : ticket.closedBy ? String(ticket.closedBy) : null,
    descriptionSubmitted: ticket.descriptionSubmitted === true,
    lastMessageAt: options.lastMessageAt || null,
    lastMessagePreview: options.lastMessagePreview || null,
    awaitingResponse: options.awaitingResponse === true,
    transcriptUrl,
    transcriptExpired: Boolean(token && transcriptExpired),
    channelUrl: ticket.channelId
      ? `https://discord.com/channels/${guildId}/${ticket.channelId}`
      : null,
    anonymised: anonymise,
  };
}

function ticketHasStoredTranscript(ticket?) {
  if (ticket?.hasTranscript === true) return true;
  if (ticket?.hasTranscript === false) return false;
  return Boolean(
    String(ticket?.transcriptHtmlPath || "").trim() ||
      String(ticket?.transcriptViewToken || "").trim() ||
      String(ticket?.transcript || "").trim() ||
      ticket?._hasTranscriptBody === true,
  );
}

function normalizeSnowflakeQuery(raw?) {
  const s = String(raw || "").trim();
  return /^\d{16,22}$/.test(s) ? s : "";
}

const USER_LABEL_CACHE = new Map();
const USER_LABEL_TTL_MS = 15 * 60 * 1000;
const SLIM_TX_CACHE = new Map();
const SLIM_TX_TTL_MS = 25_000;

function readCachedUserLabel(id?) {
  const hit = USER_LABEL_CACHE.get(String(id));
  if (!hit) return null;
  if (Date.now() - hit.at > USER_LABEL_TTL_MS) {
    USER_LABEL_CACHE.delete(String(id));
    return null;
  }
  return hit.label;
}

function writeCachedUserLabel(id?, label?) {
  const s = String(label || "").trim();
  if (!s) return;
    if (s === String(id)) return;
  USER_LABEL_CACHE.set(String(id), { at: Date.now(), label: s });
}

function discordUserDisplayLabel(user?, id?) {
  const label = String(user?.globalName || user?.username || "").trim();
  if (!label || label === String(id || "")) return "";
  return label;
}

async function resolveDiscordUserLabels(client?, userIds?, options: Record<string, any> = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1500;
  const ids = [...new Set((userIds || []).map((id?) => String(id || "").trim()).filter(Boolean))];
  const out: Record<string, any> = {};
  const missing = [];
  for (const id of ids) {
    const cachedUser = client?.users?.cache?.get(id);
    if (cachedUser) {
      const label = discordUserDisplayLabel(cachedUser, id);
      if (label) {
        out[(id as any)] = label;
        writeCachedUserLabel(id, label);
      }
      continue;
    }
    const mem = readCachedUserLabel(id);
    if (mem) {
      out[(id as any)] = mem;
      continue;
    }
    missing.push(id);
  }
  if (!missing.length) return out;

  let settled = false;
  const fetchPromise = Promise.all(
    missing.map(async (id?) => {
      try {
        const user = await client.users.fetch(id).catch(() => null);
        if (!user) return;
        const label = discordUserDisplayLabel(user, id);
        if (!label) return;
                        writeCachedUserLabel(id, label);
        if (!settled) out[id] = label;
      } catch (_) {}
    }),
  );
  await Promise.race([
    fetchPromise,
    new Promise((resolve?) => setTimeout(resolve, Math.max(0, timeoutMs))),
  ]);
  settled = true;
  return out;
}

async function findGuildUserIdsMatchingUsername(client?, guildId?, usernameQuery?) {
  const q = String(usernameQuery || "").trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const guild =
    client?.guilds?.cache?.get(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch(() => null));
  if (!guild) return [];
  let found = null;
  try {
    found = await guild.members.fetch({ query: q, limit: 25 }).catch(() => null);
  } catch (_) {
    found = null;
  }
  const hits = [];
  const source = found && typeof found.values === "function" ? found.values() : [];
  for (const member of source) {
    const u = member?.user;
    const labels = [u?.username, u?.globalName, member?.displayName, u?.tag]
      .map((x?) => String(x || "").toLowerCase())
      .filter(Boolean);
    if (labels.some((label?) => label.includes(q))) hits.push(String(member.id));
  }
  return [...new Set(hits)];
}

async function loadSlimClosedTicketsForGuild(guildId?, options: Record<string, any> = {}) {
  const { GuildFeatureBucket } = require("../../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../../Schemas/Guild/guildFeatureBucketSchema");
  const gid = String(guildId || "").trim();
  if (!gid) return [];
  const bypassCache = options.bypassCache === true;
  if (!bypassCache) {
    const hit = SLIM_TX_CACHE.get(gid);
    if (hit && Date.now() - hit.at < SLIM_TX_TTL_MS) return hit.rows;
  }

  const doc = await GuildFeatureBucket.findOne({ guildId: gid })
    .select({
      "tickets._id": 1,
      "tickets.ticketNumber": 1,
      "tickets.guildId": 1,
      "tickets.userId": 1,
      "tickets.userTag": 1,
      "tickets.channelId": 1,
      "tickets.ticketType": 1,
      "tickets.panelId": 1,
      "tickets.open": 1,
      "tickets.claimedBy": 1,
      "tickets.createdAt": 1,
      "tickets.closedAt": 1,
      "tickets.closeReason": 1,
      "tickets.closedBy": 1,
      "tickets.ratingScore": 1,
      "tickets.transcriptHtmlPath": 1,
      "tickets.transcriptViewToken": 1,
      "tickets.hasTranscript": 1,
    })
    .lean()
    .catch(() => null);

  const all = Array.isArray(doc?.tickets) ? doc.tickets : [];
  const rows = all.filter((t?) => {
    const open = t?.open;
    return !(open === true || open === 1 || open === "1" || open === "true");
  });
  SLIM_TX_CACHE.set(gid, { at: Date.now(), rows });
  return rows;
}

function invalidateSlimClosedTicketsCache(guildId?) {
  const gid = String(guildId || "").trim();
  if (gid) SLIM_TX_CACHE.delete(gid);
}

function serializeTranscriptRow(ticket?, guildId?, options: Record<string, any> = {}) {
  const base = serializeTicketRow(ticket, guildId, options);
  const uid = String(base.userId || "");
  let snapshot = String(ticket.userTag || "").trim();
  if (snapshot && uid && snapshot === uid) snapshot = "";
  const username =
    options.anonymise === true
      ? null
      : snapshot || (uid && options.usernames?.[uid]) || null;
  return {
    ...base,
    username,
    ratingScore:
      ticket.ratingScore != null && Number.isFinite(Number(ticket.ratingScore))
        ? Number(ticket.ratingScore)
        : null,
    hasTranscript: ticketHasStoredTranscript(ticket) || ticket?.hasTranscript == null,
    canOpenTranscript: ticketHasStoredTranscript(ticket) || ticket?.hasTranscript == null,
  };
}

function firstQueryValue(raw?) {
  if (Array.isArray(raw)) return raw.length ? raw[0] : "";
  return raw;
}

function normalizeTranscriptPanelFilter(query: Record<string, any> = {}) {
  const raw = firstQueryValue(query.ticketType ?? query.panel ?? query.type ?? "");
  const panel = String(raw || "")
    .trim()
    .toLowerCase();
  return panel && TICKET_TYPES.includes(panel) ? panel : "";
}

async function listDashboardTranscripts(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const limitRaw = Number.parseInt(String(firstQueryValue(query.limit) || "25"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 25;
  const offsetRaw = Number.parseInt(String(firstQueryValue(query.offset) || firstQueryValue(query.cursor) || "0"), 10);
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const ticketIdRaw = String(firstQueryValue(query.ticketId) || firstQueryValue(query.ticketNumber) || "").trim();
  const userId = normalizeSnowflakeQuery(firstQueryValue(query.userId));
  const closedBy = normalizeSnowflakeQuery(firstQueryValue(query.closedBy) || firstQueryValue(query.closedById));
  const claimedBy = normalizeSnowflakeQuery(firstQueryValue(query.claimedBy) || firstQueryValue(query.claimedById));
  const panel = normalizeTranscriptPanelFilter(query);
  const ratingRaw = String(firstQueryValue(query.rating) || "")
    .trim()
    .toLowerCase();
  const closeReasonQ = String(firstQueryValue(query.closeReason) || "")
    .trim()
    .toLowerCase();
  const usernameQ = String(firstQueryValue(query.username) || "").trim();

  const usernamePromise =
    usernameQ.length >= 2
      ? findGuildUserIdsMatchingUsername(client, gid, usernameQ)
      : Promise.resolve(null);

  const [rows, settings, usernameUserIds] = await Promise.all([
    loadSlimClosedTicketsForGuild(gid),
    getTicketSettingsForGuild(gid).catch(() => null),
    usernamePromise,
  ]);

  let list = (Array.isArray(rows) ? rows : []).filter((t?) => {
    if (t?.hasTranscript === false) return false;
    if (ticketHasStoredTranscript(t)) return true;
        return t?.hasTranscript == null;
  });

  if (ticketIdRaw) {
    const asNum = Number.parseInt(ticketIdRaw.replace(/^#/, ""), 10);
    list = list.filter((t?) => {
      if (String(t._id || "") === ticketIdRaw) return true;
      if (Number.isFinite(asNum) && Number(t.ticketNumber) === asNum) return true;
      return false;
    });
  }
  if (userId) list = list.filter((t?) => String(t.userId || "") === userId);
  if (usernameUserIds) {
    const allow = new Set(usernameUserIds);
    const q = usernameQ.toLowerCase();
    list = list.filter((t?) => {
      if (allow.has(String(t.userId || ""))) return true;
      const tag = String(t.userTag || "").toLowerCase();
      return Boolean(tag && tag.includes(q));
    });
  } else if (usernameQ.length >= 2) {
    const q = usernameQ.toLowerCase();
    list = list.filter((t?) => String(t.userTag || "").toLowerCase().includes(q));
  }
  if (closedBy) list = list.filter((t?) => String(t.closedBy || "") === closedBy);
  if (claimedBy) list = list.filter((t?) => String(t.claimedBy || "") === claimedBy);
  if (panel) {
    list = list.filter((t?) => String(t.ticketType || "").trim().toLowerCase() === panel);
  }
  if (ratingRaw === "none" || ratingRaw === "unrated") {
    list = list.filter((t?) => t.ratingScore == null || t.ratingScore === "");
  } else if (ratingRaw && /^\d+$/.test(ratingRaw)) {
    const score = Number(ratingRaw);
    list = list.filter((t?) => Number(t.ratingScore) === score);
  }
  if (closeReasonQ) {
    list = list.filter((t?) => String(t.closeReason || "").toLowerCase().includes(closeReasonQ));
  }

  list.sort((a?, b?) => {
    const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return tb - ta;
  });

  const total = list.length;
  const slice = list.slice(offset, offset + limit);
  const anonymise = settings?.anonymiseDashboardResponses === true;
  const sliceUserIds = slice.map((t?) => t.userId).filter(Boolean);
  const needFetch = sliceUserIds.filter((id?) => {
    if (anonymise) return false;
    const row = slice.find((t?) => String(t.userId) === String(id));
    if (row && String(row.userTag || "").trim()) return false;
    return true;
  });
  const usernames = anonymise
    ? {}
    : await resolveDiscordUserLabels(client, needFetch, { timeoutMs: 1500 });

  return {
    ok: true,
    status: 200,
    guildId: gid,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    panels: TICKET_TYPES.slice(),
    appliedFilters: {
      ticketId: ticketIdRaw || null,
      username: usernameQ || null,
      userId: userId || null,
      closedBy: closedBy || null,
      claimedBy: claimedBy || null,
      panel: panel || null,
      ticketType: panel || null,
      rating: ratingRaw || null,
      closeReason: closeReasonQ || null,
    },
    transcripts: slice.map((t?) => serializeTranscriptRow(t, gid, { anonymise, usernames })),
  };
}

async function getDashboardTranscriptHtml(client?, accessToken?, guildId?, ticketId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const tid = String(ticketId || "").trim();
  if (!tid) return fail(400, "invalid_ticket", "Ticket non valido.");

    const tidNumRaw = tid.replace(/^#/, "");
  const tidIsTicketNumber = /^\d{1,10}$/.test(tidNumRaw);
  const asNum = tidIsTicketNumber ? Number.parseInt(tidNumRaw, 10) : NaN;

  let ticket = await Ticket.findOne({ guildId: gid, _id: tid }).lean().catch(() => null);
  if (!ticket && Number.isFinite(asNum)) {
    ticket = await Ticket.findOne({ guildId: gid, ticketNumber: asNum }).lean().catch(() => null);
  }
  if (!ticket) return fail(404, "not_found", "Transcript non trovato.");

    try {
    const full = await Ticket.findById(ticket._id);
    if (full) {
      const plain = full.toObject ? full.toObject() : { ...full };
      plain.guildId = String(plain.guildId || ticket.guildId || gid).trim();
      ticket = plain;
    }
  } catch (_) {
      }

  const fs = require("fs") as typeof import("fs");
  const { upgradeLegacyTranscriptHtml, resolveExistingTranscriptHtmlPath } = require("../transcript/transcriptUtils") as typeof import("../transcript/transcriptUtils");
  const meta = {
    ticketId: String(ticket._id || ""),
    ticketNumber: ticket.ticketNumber != null ? Number(ticket.ticketNumber) : null,
  };

  const inline = typeof ticket.transcriptHtmlInline === "string" ? ticket.transcriptHtmlInline.trim() : "";
  if (inline) {
    return {
      ok: true,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: upgradeLegacyTranscriptHtml(inline),
      ...meta,
    };
  }

  const filePath = resolveExistingTranscriptHtmlPath(ticket);
  if (filePath) {
    try {
      const body = upgradeLegacyTranscriptHtml(fs.readFileSync(filePath, "utf8"));
      return {
        ok: true,
        status: 200,
        contentType: "text/html; charset=utf-8",
        body,
        ...meta,
      };
    } catch (_) {}
  }

  const text = String(ticket.transcript || "").trim();
  if (text) {
    const safe = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return {
      ok: true,
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: upgradeLegacyTranscriptHtml(
        `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Transcript #${ticket.ticketNumber || "?"}</title><style>body{font-family:ui-monospace,monospace;background:#111;color:#eee;padding:1.5rem;white-space:pre-wrap}</style></head><body>${safe}</body></html>`,
      ),
      ...meta,
    };
  }

      const viewTok = String(ticket.transcriptViewToken || "").trim();
  const apiUrl =
    viewTok && !transcriptViewExpired(ticket) ? buildTicketTranscriptApiUrl(viewTok) : "";
  if (apiUrl) {
    return {
      ok: true,
      status: 200,
      apiUrl,
      ...meta,
    };
  }

  return fail(404, "missing_file", "File transcript non disponibile.");
}

export = { fail, coerceOpen, serializeTicketRow, normalizeSnowflakeQuery, resolveDiscordUserLabels, findGuildUserIdsMatchingUsername, invalidateSlimClosedTicketsCache, firstQueryValue, listDashboardTranscripts, getDashboardTranscriptHtml };
