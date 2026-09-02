const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi");
const {
  getTicketSettingsForGuild,
  saveTicketSettings,
  TICKET_TYPES,
} = require("../../MultiGuild/core/tenantTicketSettings");
const {
  buildTicketTranscriptViewUrl,
  buildTicketTranscriptApiUrl,
  transcriptViewExpired,
} = require("../Ticket/ticketTranscriptSecure");
const { listGuildPickerData } = require("./siteDashboardPartnershipApi");

const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_channel: "Canale non valido.",
  invalid_role: "Ruolo non valido.",
  bot_missing: "Il bot non è presente in questo server.",
};

function reasonToMessage(reason) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function fail(status, error, message) {
  return { ok: false, status, error, message };
}

function serializeTicketSettings(config) {
  const cfg = config || {};
  const types = {};
  for (const type of TICKET_TYPES) {
    const entry = cfg.types?.[type] || {};
    types[type] = {
      enabled: entry.enabled !== false,
      staffRoleIds: Array.isArray(entry.staffRoleIds) ? entry.staffRoleIds : [],
      label: entry.label || type,
    };
  }
  return {
    enabled: cfg.enabled === true,
    panelChannelId: cfg.panelChannelId || null,
    logChannelId: cfg.logChannelId || null,
    memberRoleId: cfg.memberRoleId || null,
    staffRoleId: cfg.staffRoleId || null,
    highStaffRoleId: cfg.highStaffRoleId || null,
    blacklistRoleId: cfg.blacklistRoleId || null,
    categoryName: cfg.categoryName || "Tickets",
    ticketCategoryId: cfg.overflowCategoryId || null,
    types,
    maxOpenTicketsPerUser: Number(cfg.maxOpenTicketsPerUser) || 1,
    language: cfg.language || "server",
    allowUserClose: cfg.allowUserClose === true,
    closeConfirmation: cfg.closeConfirmation === true,
    ratingEnabled: cfg.ratingEnabled !== false,
    anonymiseDashboardResponses: cfg.anonymiseDashboardResponses === true,
    threadMode: cfg.threadMode === true,
    transcriptChannelId: cfg.transcriptChannelId || cfg.logChannelId || null,
    overflowCategoryId: cfg.overflowCategoryId || null,
    storeTranscripts: cfg.storeTranscripts !== false,
    hideCloseButton: cfg.hideCloseButton === true,
    hideCloseReasonButton: cfg.hideCloseReasonButton === true,
    hideClaimButton: cfg.hideClaimButton === true,
    openCommandEnabled: cfg.openCommandEnabled !== false,
    contextMenuEnabled: cfg.contextMenuEnabled === true,
    claimedStaffCanView: cfg.claimedStaffCanView !== false,
    claimedStaffCanType: cfg.claimedStaffCanType === true,
    panelSwitchBehavior: cfg.panelSwitchBehavior || "auto_unclaim",
    autoCloseEnabled: cfg.autoCloseEnabled !== false,
    autoCloseOnUserLeave: cfg.autoCloseOnUserLeave !== false,
    autoCloseSinceOpenMs: (() => {
      const n = Number(cfg.autoCloseSinceOpenMs);
      return Number.isFinite(n) ? Math.max(0, n) : 24 * 60 * 60 * 1000;
    })(),
    autoCloseSinceLastMessageMs: (() => {
      const n = Number(cfg.autoCloseSinceLastMessageMs);
      return Number.isFinite(n) ? Math.max(0, n) : 2 * 60 * 60 * 1000;
    })(),
    ticketPerms: {
      addReactions: cfg.ticketPerms?.addReactions !== false,
      sendTtsMessages: cfg.ticketPerms?.sendTtsMessages === true,
      embedLinks: cfg.ticketPerms?.embedLinks !== false,
      attachFiles: cfg.ticketPerms?.attachFiles !== false,
      useExternalEmojis: cfg.ticketPerms?.useExternalEmojis !== false,
      useExternalStickers: cfg.ticketPerms?.useExternalStickers !== false,
      sendVoiceMessages: cfg.ticketPerms?.sendVoiceMessages === true,
    },
  };
}

function coerceOpen(value) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  if (value === false || value === 0 || value === "false" || value === "0" || value == null) return false;
  return Boolean(value);
}

function serializeTicketRow(ticket, guildId, options = {}) {
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

async function computeTicketOverview(guildId) {
  const gid = String(guildId || "").trim();
  const rows = await Ticket.find({ guildId: gid }).lean().catch(() => []);
  const list = Array.isArray(rows) ? rows : [];
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  let open = 0;
  let claimed = 0;
  let closed24h = 0;
  const recentOpen = [];
  for (const t of list) {
    const isOpen = coerceOpen(t.open);
    if (isOpen) {
      open += 1;
      if (t.claimedBy) claimed += 1;
      recentOpen.push(t);
    } else {
      const closedMs = t.closedAt ? new Date(t.closedAt).getTime() : 0;
      if (closedMs && closedMs >= dayAgo) closed24h += 1;
    }
  }
  recentOpen.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  let anonymise = false;
  try {
    anonymise = (await getTicketSettingsForGuild(gid))?.anonymiseDashboardResponses === true;
  } catch (_) {
    anonymise = false;
  }
  return {
    open,
    claimed,
    unclaimed: Math.max(0, open - claimed),
    closed24h,
    total: list.length,
    recentOpen: recentOpen.slice(0, 8).map((t) => serializeTicketRow(t, gid, { anonymise })),
  };
}

function scoreTicketCategoryName(name, fancyName) {
  const n = String(name || "");
  const nl = n.toLowerCase();
  const fancy = String(fancyName || "");
  if (!n) return 0;
  if (fancy && n === fancy) return 100;
  if (fancy && nl === fancy.toLowerCase()) return 95;
    if (nl === "tickets") return 15;
  if (nl.includes("tickets")) return 80 + Math.min(10, Math.floor(n.length / 8));
  if (nl.includes("ticket")) return 40;
  return 0;
}

function resolveCategoryNameLive(pickers, settings, fancyFallback) {
  const categories = Array.isArray(pickers?.categories) ? pickers.categories : [];
  const fancy = String(fancyFallback || "").trim();
  const mode = String(settings?.overflowCategoryId || settings?.ticketCategoryId || "").trim();
  if (/^\d{16,20}$/.test(mode)) {
    const hit = categories.find((c) => String(c.id) === mode);
    if (hit?.name) return String(hit.name);
  }
  const pref = String(settings?.categoryName || "").trim();
  if (pref && pref !== "Tickets" && pref.toLowerCase() !== "tickets") {
    const exact = categories.find((c) => String(c.name || "") === pref);
    if (exact?.name) return String(exact.name);
  }
  let best = null;
  let bestScore = 0;
  for (const c of categories) {
    const score = scoreTicketCategoryName(c?.name, fancy);
    if (score > bestScore) {
      bestScore = score;
      best = String(c.name || "");
    }
  }
  if (best) return best;
  if (fancy) return fancy;
  return pref || "Tickets";
}

function getFancyTicketCategoryFallback() {
  try {
    const { TICKETS_CATEGORY_NAME } = require("../Ticket/ticketCategoryUtils");
    return String(TICKETS_CATEGORY_NAME || "").trim() || "Tickets";
  } catch (_) {
    return "Tickets";
  }
}

function enrichTicketSettingsCategoryNames(serialized, pickers) {
  const out = serialized && typeof serialized === "object" ? serialized : {};
  const fancyFallback = getFancyTicketCategoryFallback();
  out.defaultDiscordCategoryName = fancyFallback;
  out.categoryNameLive = resolveCategoryNameLive(pickers, out, fancyFallback);
  if (out.overflowCategoryId === "__custom__" || !out.overflowCategoryId) {
        if (out.categoryNameLive) out.categoryName = out.categoryNameLive;
  }
  return out;
}

async function getDashboardTickets(client, accessToken, guildId) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const [settings, overview, pickers] = await Promise.all([
    getTicketSettingsForGuild(gid),
    computeTicketOverview(gid),
    listGuildPickerData(client, gid).catch(() => ({ textChannels: [], roles: [], categories: [] })),
  ]);
  const serialized = enrichTicketSettingsCategoryNames(serializeTicketSettings(settings), pickers);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    settings: serialized,
    overview,
    pickers,
  };
}

async function patchDashboardTickets(client, accessToken, guildId, body) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(src, "enabled")) patch.enabled = src.enabled === true;
  if (Object.prototype.hasOwnProperty.call(src, "ticketCategoryId") && !Object.prototype.hasOwnProperty.call(src, "overflowCategoryId")) {
    src.overflowCategoryId = src.ticketCategoryId;
  }
  const prevSettings = await getTicketSettingsForGuild(gid).catch(() => null);
  for (const key of [
    "panelChannelId",
    "logChannelId",
    "memberRoleId",
    "staffRoleId",
    "highStaffRoleId",
    "blacklistRoleId",
    "categoryName",
    "maxOpenTicketsPerUser",
    "language",
    "allowUserClose",
    "closeConfirmation",
    "ratingEnabled",
    "anonymiseDashboardResponses",
    "threadMode",
    "transcriptChannelId",
    "overflowCategoryId",
    "ticketCategoryId",
    "storeTranscripts",
    "hideCloseButton",
    "hideCloseReasonButton",
    "hideClaimButton",
    "openCommandEnabled",
    "contextMenuEnabled",
    "claimedStaffCanView",
    "claimedStaffCanType",
    "panelSwitchBehavior",
    "autoCloseEnabled",
    "autoCloseOnUserLeave",
    "autoCloseSinceOpenMs",
    "autoCloseSinceLastMessageMs",
    "autoCloseSinceOpen",
    "autoCloseSinceLastMessage",
    "ticketPerms",
  ]) {
    if (Object.prototype.hasOwnProperty.call(src, key)) patch[key] = src[key];
  }
  if (src.types && typeof src.types === "object") {
    patch.types = {};
    for (const type of TICKET_TYPES) {
      if (!Object.prototype.hasOwnProperty.call(src.types, type)) continue;
      const entry = src.types[type] || {};
      patch.types[type] = {
        enabled: entry.enabled !== false,
        staffRoleIds: Array.isArray(entry.staffRoleIds) ? entry.staffRoleIds : undefined,
        label: entry.label,
      };
    }
  }
  const saved = await saveTicketSettings(gid, patch);
  if (!saved.ok) {
    return fail(400, saved.reason || "save_failed", reasonToMessage(saved.reason));
  }
  try {
    const { syncCustomTicketCategoryName } = require("../Ticket/ticketOpenRuntime");
    await syncCustomTicketCategoryName(client, gid, prevSettings, saved.config);
  } catch (err) {
    global.logger?.warn?.("[dashboard tickets] category sync:", err?.message || err);
  }
  let permsSync = null;
  if (Object.prototype.hasOwnProperty.call(patch, "ticketPerms")) {
    try {
      const { syncOpenTicketOpenerPermissions } = require("../Ticket/ticketGuildOptions");
      permsSync = await syncOpenTicketOpenerPermissions(client, gid);
    } catch (err) {
      global.logger?.warn?.("[dashboard tickets] open perms sync:", err?.message || err);
    }
  }
  const [overview, pickers] = await Promise.all([
    computeTicketOverview(gid),
    listGuildPickerData(client, gid).catch(() => ({ textChannels: [], roles: [], categories: [] })),
  ]);
  return {
    ok: true,
    status: 200,
    guildId: gid,
    settings: enrichTicketSettingsCategoryNames(serializeTicketSettings(saved.config), pickers),
    overview,
    pickers,
    permsSync,
  };
}

async function enrichOpenTicketChannelActivity(client, guildId, tickets, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1800;
  const staffRoleIds = new Set(
    (options.staffRoleIds || []).map((id) => String(id || "").trim()).filter(Boolean),
  );
  const botId = String(client?.user?.id || "").trim();
  const out = new Map();
  const list = Array.isArray(tickets) ? tickets : [];
  if (!list.length || !client?.guilds) return out;

  const guild =
    client.guilds.cache?.get(String(guildId)) ||
    (await client.guilds.fetch(String(guildId)).catch(() => null));
  if (!guild) return out;

  let settled = false;
  const run = Promise.all(
    list.map(async (ticket) => {
      const channelId = String(ticket.channelId || "").trim();
      if (!channelId) return;
      try {
        const channel =
          guild.channels.cache?.get(channelId) ||
          (await guild.channels.fetch(channelId).catch(() => null));
        if (!channel?.messages?.fetch || settled) return;
        const fetched = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        const last = fetched?.first?.() || (fetched && [...fetched.values()][0]) || null;
        if (!last || settled) return;
        const authorId = String(last.author?.id || "").trim();
        const openerId = String(ticket.userId || "").trim();
        let authorIsStaff = false;
        if (authorId && authorId !== openerId && authorId !== botId) {
          try {
            const member =
              guild.members.cache?.get(authorId) ||
              (await guild.members.fetch(authorId).catch(() => null));
            if (member?.roles?.cache) {
              for (const roleId of member.roles.cache.keys()) {
                if (staffRoleIds.has(String(roleId))) {
                  authorIsStaff = true;
                  break;
                }
              }
            }
          } catch (_) {}
        }
        const awaitingResponse =
          Boolean(authorId) &&
          authorId === openerId &&
          authorId !== botId;
        const preview = String(last.cleanContent || last.content || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 80);
        out.set(String(ticket._id || channelId), {
          lastMessageAt: last.createdAt ? new Date(last.createdAt).toISOString() : null,
          lastMessagePreview: preview || (last.attachments?.size ? "[allegato]" : null),
          awaitingResponse: awaitingResponse && !authorIsStaff,
        });
      } catch (_) {}
    }),
  );
  await Promise.race([
    run,
    new Promise((resolve) => setTimeout(resolve, Math.max(0, timeoutMs))),
  ]);
  settled = true;
  return out;
}

async function listDashboardTickets(client, accessToken, guildId, query = {}) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const viewerId = String(access.userId || "").trim();
  const status = String(firstQueryValue(query.status) || "open").trim().toLowerCase();
  const type = String(firstQueryValue(query.type) || firstQueryValue(query.panel) || "")
    .trim()
    .toLowerCase();
  const panelId = String(firstQueryValue(query.panelId) || "").trim();
  const ticketIdRaw = String(
    firstQueryValue(query.ticketId) || firstQueryValue(query.ticketNumber) || "",
  ).trim();
  const userId = normalizeSnowflakeQuery(firstQueryValue(query.userId));
  const claimedBy = normalizeSnowflakeQuery(
    firstQueryValue(query.claimedBy) || firstQueryValue(query.claimedById),
  );
  const usernameQ = String(firstQueryValue(query.username) || "").trim();
  const mineOrUnclaimed =
    firstQueryValue(query.mineOrUnclaimed) === true ||
    firstQueryValue(query.mineOrUnclaimed) === "1" ||
    firstQueryValue(query.mineOrUnclaimed) === "true" ||
    firstQueryValue(query.onlyMineOrUnclaimed) === "1" ||
    firstQueryValue(query.onlyMineOrUnclaimed) === "true";
  const sort = String(firstQueryValue(query.sort) || "priority").trim().toLowerCase();
  const limitRaw = Number.parseInt(String(firstQueryValue(query.limit) || "30"), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, limitRaw)) : 30;
  const offsetRaw = Number.parseInt(
    String(firstQueryValue(query.offset) || firstQueryValue(query.cursor) || "0"),
    10,
  );
  const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

  const filter = { guildId: gid };
  if (status === "open") filter.open = true;
  else if (status === "closed") filter.open = false;
  if (type && TICKET_TYPES.includes(type)) filter.ticketType = type;

  const usernamePromise =
    usernameQ.length >= 2
      ? findGuildUserIdsMatchingUsername(client, gid, usernameQ)
      : Promise.resolve(null);

  const listProjection = {
    _id: 1,
    ticketNumber: 1,
    guildId: 1,
    userId: 1,
    userTag: 1,
    channelId: 1,
    ticketType: 1,
    panelId: 1,
    open: 1,
    claimedBy: 1,
    createdAt: 1,
    closedAt: 1,
    closeReason: 1,
    closedBy: 1,
    descriptionSubmitted: 1,
    transcriptViewToken: 1,
    transcriptViewExpiresAt: 1,
  };

  const [rows, settings, usernameUserIds, panelsBucket] = await Promise.all([
        Ticket.find(filter, listProjection).lean().catch(() => []),
    getTicketSettingsForGuild(gid).catch(() => null),
    usernamePromise,
    (async () => {
      try {
        const { getGuildPanels } = require("../../MultiGuild/core/tenantTicketPanels");
        return await getGuildPanels(gid);
      } catch (_) {
        return { singles: [] };
      }
    })(),
  ]);

  let list = Array.isArray(rows) ? rows : [];

  if (panelId) {
    list = list.filter((t) => String(t.panelId || "") === panelId);
  }
  if (ticketIdRaw) {
    const asNum = Number.parseInt(ticketIdRaw.replace(/^#/, ""), 10);
    list = list.filter((t) => {
      if (String(t._id || "") === ticketIdRaw) return true;
      if (Number.isFinite(asNum) && Number(t.ticketNumber) === asNum) return true;
      return false;
    });
  }
  if (userId) list = list.filter((t) => String(t.userId || "") === userId);
  if (claimedBy) list = list.filter((t) => String(t.claimedBy || "") === claimedBy);
  if (usernameUserIds) {
    const allow = new Set(usernameUserIds);
    const q = usernameQ.toLowerCase();
    list = list.filter((t) => {
      if (allow.has(String(t.userId || ""))) return true;
      return String(t.userTag || "")
        .toLowerCase()
        .includes(q);
    });
  } else if (usernameQ.length >= 2) {
    const q = usernameQ.toLowerCase();
    list = list.filter((t) => String(t.userTag || "").toLowerCase().includes(q));
  }
  if (mineOrUnclaimed && viewerId) {
    list = list.filter((t) => {
      const c = String(t.claimedBy || "").trim();
      return !c || c === viewerId;
    });
  }

  const anonymise = settings?.anonymiseDashboardResponses === true;
  const panelById = new Map((panelsBucket?.singles || []).map((p) => [String(p.id), p]));

    list.sort((a, b) => {
    if (status === "closed") {
      const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
      const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
      return tb - ta;
    }
    if (sort === "oldest") {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    }
    if (sort === "claimed") {
      const ca = String(a.claimedBy || "").trim() ? 1 : 0;
      const cb = String(b.claimedBy || "").trim() ? 1 : 0;
      if (ca !== cb) return ca - cb;
    }
    if (sort === "unclaimed" || sort === "priority") {
      const ca = String(a.claimedBy || "").trim() ? 1 : 0;
      const cb = String(b.claimedBy || "").trim() ? 1 : 0;
      if (ca !== cb) return ca - cb;
    }
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const total = list.length;
  let slice = list.slice(offset, offset + limit);

  const staffRoleIds = [
    settings?.staffRoleId,
    settings?.highStaffRoleId,
    ...TICKET_TYPES.flatMap((t) => settings?.types?.[t]?.staffRoleIds || []),
  ].filter(Boolean);

  const needUserIds = [];
  for (const t of slice) {
    if (t.userId) needUserIds.push(t.userId);
    if (t.claimedBy) needUserIds.push(t.claimedBy);
  }
  const usernames = anonymise
    ? {}
    : await resolveDiscordUserLabels(client, needUserIds, { timeoutMs: 1200 });

  const activity =
    status === "closed"
      ? new Map()
      : await enrichOpenTicketChannelActivity(client, gid, slice, {
          staffRoleIds,
          timeoutMs: 1800,
        });

  if (sort === "priority") {
    slice = slice
      .map((t, idx) => ({ t, idx, act: activity.get(String(t._id || t.channelId || "")) }))
      .sort((a, b) => {
        const ca = String(a.t.claimedBy || "").trim() ? 1 : 0;
        const cb = String(b.t.claimedBy || "").trim() ? 1 : 0;
        if (ca !== cb) return ca - cb;
        const aa = a.act?.awaitingResponse ? 0 : 1;
        const ba = b.act?.awaitingResponse ? 0 : 1;
        if (aa !== ba) return aa - ba;
        return a.idx - b.idx;
      })
      .map((row) => row.t);
  }

  return {
    ok: true,
    status: 200,
    guildId: gid,
    viewerId: viewerId || null,
    statusFilter: status === "closed" ? "closed" : status === "all" ? "all" : "open",
    typeFilter: type && TICKET_TYPES.includes(type) ? type : null,
    sort,
    total,
    offset,
    limit,
    nextOffset: offset + limit < total ? offset + limit : null,
    panels: (panelsBucket?.singles || []).map((p) => ({
      id: p.id,
      title: p.title,
      ticketType: p.ticketType,
    })),
    types: TICKET_TYPES.slice(),
    tickets: slice.map((t) => {
      const act = activity.get(String(t._id || t.channelId || "")) || {};
      const panel = t.panelId ? panelById.get(String(t.panelId)) : null;
      const panelTitle =
        (panel && panel.title) ||
        String(t.ticketType || "supporto").toUpperCase();
      return serializeTicketRow(t, gid, {
        anonymise,
        usernames,
        panelTitle,
        lastMessageAt: act.lastMessageAt || null,
        lastMessagePreview: act.lastMessagePreview || null,
        awaitingResponse: act.awaitingResponse === true,
      });
    }),
  };
}

function ticketHasStoredTranscript(ticket) {
  if (ticket?.hasTranscript === true) return true;
  if (ticket?.hasTranscript === false) return false;
  return Boolean(
    String(ticket?.transcriptHtmlPath || "").trim() ||
      String(ticket?.transcriptViewToken || "").trim() ||
      String(ticket?.transcript || "").trim() ||
      ticket?._hasTranscriptBody === true,
  );
}

function normalizeSnowflakeQuery(raw) {
  const s = String(raw || "").trim();
  return /^\d{16,22}$/.test(s) ? s : "";
}

const USER_LABEL_CACHE = new Map();
const USER_LABEL_TTL_MS = 15 * 60 * 1000;
const SLIM_TX_CACHE = new Map();
const SLIM_TX_TTL_MS = 25_000;

function readCachedUserLabel(id) {
  const hit = USER_LABEL_CACHE.get(String(id));
  if (!hit) return null;
  if (Date.now() - hit.at > USER_LABEL_TTL_MS) {
    USER_LABEL_CACHE.delete(String(id));
    return null;
  }
  return hit.label;
}

function writeCachedUserLabel(id, label) {
  const s = String(label || "").trim();
  if (!s) return;
    if (s === String(id)) return;
  USER_LABEL_CACHE.set(String(id), { at: Date.now(), label: s });
}

function discordUserDisplayLabel(user, id) {
  const label = String(user?.globalName || user?.username || "").trim();
  if (!label || label === String(id || "")) return "";
  return label;
}

async function resolveDiscordUserLabels(client, userIds, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1500;
  const ids = [...new Set((userIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const out = {};
  const missing = [];
  for (const id of ids) {
    const cachedUser = client?.users?.cache?.get(id);
    if (cachedUser) {
      const label = discordUserDisplayLabel(cachedUser, id);
      if (label) {
        out[id] = label;
        writeCachedUserLabel(id, label);
      }
      continue;
    }
    const mem = readCachedUserLabel(id);
    if (mem) {
      out[id] = mem;
      continue;
    }
    missing.push(id);
  }
  if (!missing.length) return out;

  let settled = false;
  const fetchPromise = Promise.all(
    missing.map(async (id) => {
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
    new Promise((resolve) => setTimeout(resolve, Math.max(0, timeoutMs))),
  ]);
  settled = true;
  return out;
}

async function findGuildUserIdsMatchingUsername(client, guildId, usernameQuery) {
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
      .map((x) => String(x || "").toLowerCase())
      .filter(Boolean);
    if (labels.some((label) => label.includes(q))) hits.push(String(member.id));
  }
  return [...new Set(hits)];
}

async function loadSlimClosedTicketsForGuild(guildId, options = {}) {
  const { GuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");
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
  const rows = all.filter((t) => {
    const open = t?.open;
    return !(open === true || open === 1 || open === "1" || open === "true");
  });
  SLIM_TX_CACHE.set(gid, { at: Date.now(), rows });
  return rows;
}

function invalidateSlimClosedTicketsCache(guildId) {
  const gid = String(guildId || "").trim();
  if (gid) SLIM_TX_CACHE.delete(gid);
}

function serializeTranscriptRow(ticket, guildId, options = {}) {
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

function firstQueryValue(raw) {
  if (Array.isArray(raw)) return raw.length ? raw[0] : "";
  return raw;
}

function normalizeTranscriptPanelFilter(query = {}) {
  const raw = firstQueryValue(query.ticketType ?? query.panel ?? query.type ?? "");
  const panel = String(raw || "")
    .trim()
    .toLowerCase();
  return panel && TICKET_TYPES.includes(panel) ? panel : "";
}

async function listDashboardTranscripts(client, accessToken, guildId, query = {}) {
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

  let list = (Array.isArray(rows) ? rows : []).filter((t) => {
    if (t?.hasTranscript === false) return false;
    if (ticketHasStoredTranscript(t)) return true;
        return t?.hasTranscript == null;
  });

  if (ticketIdRaw) {
    const asNum = Number.parseInt(ticketIdRaw.replace(/^#/, ""), 10);
    list = list.filter((t) => {
      if (String(t._id || "") === ticketIdRaw) return true;
      if (Number.isFinite(asNum) && Number(t.ticketNumber) === asNum) return true;
      return false;
    });
  }
  if (userId) list = list.filter((t) => String(t.userId || "") === userId);
  if (usernameUserIds) {
    const allow = new Set(usernameUserIds);
    const q = usernameQ.toLowerCase();
    list = list.filter((t) => {
      if (allow.has(String(t.userId || ""))) return true;
      const tag = String(t.userTag || "").toLowerCase();
      return Boolean(tag && tag.includes(q));
    });
  } else if (usernameQ.length >= 2) {
    const q = usernameQ.toLowerCase();
    list = list.filter((t) => String(t.userTag || "").toLowerCase().includes(q));
  }
  if (closedBy) list = list.filter((t) => String(t.closedBy || "") === closedBy);
  if (claimedBy) list = list.filter((t) => String(t.claimedBy || "") === claimedBy);
  if (panel) {
    list = list.filter((t) => String(t.ticketType || "").trim().toLowerCase() === panel);
  }
  if (ratingRaw === "none" || ratingRaw === "unrated") {
    list = list.filter((t) => t.ratingScore == null || t.ratingScore === "");
  } else if (ratingRaw && /^\d+$/.test(ratingRaw)) {
    const score = Number(ratingRaw);
    list = list.filter((t) => Number(t.ratingScore) === score);
  }
  if (closeReasonQ) {
    list = list.filter((t) => String(t.closeReason || "").toLowerCase().includes(closeReasonQ));
  }

  list.sort((a, b) => {
    const ta = a.closedAt ? new Date(a.closedAt).getTime() : 0;
    const tb = b.closedAt ? new Date(b.closedAt).getTime() : 0;
    return tb - ta;
  });

  const total = list.length;
  const slice = list.slice(offset, offset + limit);
  const anonymise = settings?.anonymiseDashboardResponses === true;
  const sliceUserIds = slice.map((t) => t.userId).filter(Boolean);
  const needFetch = sliceUserIds.filter((id) => {
    if (anonymise) return false;
    const row = slice.find((t) => String(t.userId) === String(id));
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
    transcripts: slice.map((t) => serializeTranscriptRow(t, gid, { anonymise, usernames })),
  };
}

async function getDashboardTranscriptHtml(client, accessToken, guildId, ticketId) {
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

  const fs = require("fs");
  const { upgradeLegacyTranscriptHtml, resolveExistingTranscriptHtmlPath } = require("../Ticket/transcriptUtils");
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

module.exports = {
  getDashboardTickets,
  patchDashboardTickets,
  listDashboardTickets,
  listDashboardTranscripts,
  getDashboardTranscriptHtml,
  invalidateSlimClosedTicketsCache,
};
