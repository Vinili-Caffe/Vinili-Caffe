const { Routes } = require("discord.js") as typeof import("discord.js");
const Ticket = require("../data/guildFeatureBucketTicketModel");
const { verifyDashboardGuildAccess } = require("../../site/dashboard/siteDashboardApi") as typeof import("../../site/dashboard/siteDashboardApi");
const {
  getTicketSettingsForGuild,
  saveTicketSettings,
  TICKET_TYPES,
} = require("../tenant/tenantTicketSettings") as typeof import("../tenant/tenantTicketSettings");
const { listGuildPickerData } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const { fail, coerceOpen, serializeTicketRow, normalizeSnowflakeQuery, resolveDiscordUserLabels, findGuildUserIdsMatchingUsername, invalidateSlimClosedTicketsCache, firstQueryValue, listDashboardTranscripts, getDashboardTranscriptHtml } = require("./dashboardTranscriptsApi") as typeof import("./dashboardTranscriptsApi");


const REASON_MESSAGES = {
  invalid_guild: "Server non valido.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_channel: "Canale non valido.",
  invalid_role: "Ruolo non valido.",
  bot_missing: "Il bot non è presente in questo server.",
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

function serializeTicketSettings(config?) {
  const cfg = config || {};
  const types: Record<string, any> = {};
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

/*
 * Ticket rimasti "aperti" nel database ma col canale Discord ormai cancellato (es. eliminato a bot spento):
 * contavano come aperti in dashboard per sempre. Se Discord risponde "canale inesistente" (10003) li chiude.
 * Errori temporanei o permessi mancanti: non si tocca niente. Al massimo un controllo ogni 5 minuti per server.
 */
const ORPHAN_CHECK_MS = 5 * 60 * 1000;
const orphanCheckedAt = new Map<string, number>();

async function closeOrphanOpenTickets(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return 0;
  const last = orphanCheckedAt.get(gid) || 0;
  if (Date.now() - last < ORPHAN_CHECK_MS) return 0;
  orphanCheckedAt.set(gid, Date.now());
  const guild = client?.guilds?.cache?.get?.(gid);
  if (!guild) return 0;
  /*
   * Si chiede sempre a Discord (REST), mai alla memoria: site-api non riceve gli eventi del gateway e
   * la sua lista canali è quella dell'avvio, quindi un canale cancellato dopo restava "esistente".
   */
  const rest = typeof client?.rest?.get === "function" ? client.rest : client?._rest;
  if (typeof rest?.get !== "function") return 0;
  const rows = await Ticket.find({ guildId: gid, open: true }, { _id: 1, channelId: 1 }).lean().catch(() => []);
  let closed = 0;
  for (const t of Array.isArray(rows) ? rows : []) {
    const channelId = String(t?.channelId || "").trim();
    if (!/^\d{17,22}$/.test(channelId)) continue;
    let gone = false;
    try {
      const raw = await rest.get(Routes.channel(channelId));
      /* il canale c'è ma sta in un altro server: non è un ticket aperto qui */
      gone = !raw || String(raw.guild_id || "") !== gid;
    } catch (err) {
      /* 10003 = canale cancellato; altri errori (permessi, rete) = non si tocca */
      gone = Number(err?.code) === 10003;
    }
    if (!gone) continue;
    try {
      guild.channels?.cache?.delete?.(channelId);
    } catch (_) {}
    const done = await Ticket.findOneAndUpdate(
      { _id: t._id, open: true },
      { $set: { open: false, closedAt: new Date(), closedBy: null, closeReason: "Canale Discord non più esistente" } },
      { new: true },
    ).catch(() => null);
    if (done) closed += 1;
  }
  if (closed) {
    invalidateSlimClosedTicketsCache(gid);
    global.logger?.info?.(`[dashboard tickets] chiusi ${closed} ticket senza canale (guild ${gid})`);
  }
  return closed;
}

async function computeTicketOverview(guildId?) {
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
  recentOpen.sort((a?, b?) => {
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
    recentOpen: recentOpen.slice(0, 8).map((t?) => serializeTicketRow(t, gid, { anonymise })),
  };
}

function scoreTicketCategoryName(name?, fancyName?) {
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

function resolveCategoryNameLive(pickers?, settings?, fancyFallback?) {
  const categories = Array.isArray(pickers?.categories) ? pickers.categories : [];
  const fancy = String(fancyFallback || "").trim();
  const mode = String(settings?.overflowCategoryId || settings?.ticketCategoryId || "").trim();
  if (/^\d{16,20}$/.test(mode)) {
    const hit = categories.find((c?) => String(c.id) === mode);
    if (hit?.name) return String(hit.name);
  }
  const pref = String(settings?.categoryName || "").trim();
  if (pref && pref !== "Tickets" && pref.toLowerCase() !== "tickets") {
    const exact = categories.find((c?) => String(c.name || "") === pref);
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
    const { TICKETS_CATEGORY_NAME } = require("../discord/ticketCategoryUtils") as typeof import("../discord/ticketCategoryUtils");
    return String(TICKETS_CATEGORY_NAME || "").trim() || "Tickets";
  } catch (_) {
    return "Tickets";
  }
}

function enrichTicketSettingsCategoryNames(serialized?, pickers?) {
  const out = serialized && typeof serialized === "object" ? serialized : {};
  const fancyFallback = getFancyTicketCategoryFallback();
  out.defaultDiscordCategoryName = fancyFallback;
  out.categoryNameLive = resolveCategoryNameLive(pickers, out, fancyFallback);
  if (out.overflowCategoryId === "__custom__" || !out.overflowCategoryId) {
        if (out.categoryNameLive) out.categoryName = out.categoryNameLive;
  }
  return out;
}

async function getDashboardTickets(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  await closeOrphanOpenTickets(client, gid).catch(() => 0);
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

async function patchDashboardTickets(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const src = body && typeof body === "object" ? body : {};
  const patch: Record<string, any> = {};
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
    const { syncCustomTicketCategoryName } = require("../discord/ticketOpenRuntime") as typeof import("../discord/ticketOpenRuntime");
    await syncCustomTicketCategoryName(client, gid, prevSettings, saved.config);
  } catch (err) {
    global.logger?.warn?.("[dashboard tickets] category sync:", err?.message || err);
  }
  let permsSync = null;
  if (Object.prototype.hasOwnProperty.call(patch, "ticketPerms")) {
    try {
      const { syncOpenTicketOpenerPermissions } = require("../discord/ticketGuildOptions") as typeof import("../discord/ticketGuildOptions");
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

async function enrichOpenTicketChannelActivity(client?, guildId?, tickets?, options: Record<string, any> = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 1800;
  const staffRoleIds = new Set(
    (options.staffRoleIds || []).map((id?) => String(id || "").trim()).filter(Boolean),
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
    list.map(async (ticket?) => {
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
    new Promise((resolve?) => setTimeout(resolve, Math.max(0, timeoutMs))),
  ]);
  settled = true;
  return out;
}

async function listDashboardTickets(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
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

  await closeOrphanOpenTickets(client, gid).catch(() => 0);
  const filter: Record<string, any> = { guildId: gid };
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
        const { getGuildPanels } = require("../tenant/tenantTicketPanels") as typeof import("../tenant/tenantTicketPanels");
        return await getGuildPanels(gid);
      } catch (_) {
        return { singles: [] };
      }
    })(),
  ]);

  let list = Array.isArray(rows) ? rows : [];

  if (panelId) {
    list = list.filter((t?) => String(t.panelId || "") === panelId);
  }
  if (ticketIdRaw) {
    const asNum = Number.parseInt(ticketIdRaw.replace(/^#/, ""), 10);
    list = list.filter((t?) => {
      if (String(t._id || "") === ticketIdRaw) return true;
      if (Number.isFinite(asNum) && Number(t.ticketNumber) === asNum) return true;
      return false;
    });
  }
  if (userId) list = list.filter((t?) => String(t.userId || "") === userId);
  if (claimedBy) list = list.filter((t?) => String(t.claimedBy || "") === claimedBy);
  if (usernameUserIds) {
    const allow = new Set(usernameUserIds);
    const q = usernameQ.toLowerCase();
    list = list.filter((t?) => {
      if (allow.has(String(t.userId || ""))) return true;
      return String(t.userTag || "")
        .toLowerCase()
        .includes(q);
    });
  } else if (usernameQ.length >= 2) {
    const q = usernameQ.toLowerCase();
    list = list.filter((t?) => String(t.userTag || "").toLowerCase().includes(q));
  }
  if (mineOrUnclaimed && viewerId) {
    list = list.filter((t?) => {
      const c = String(t.claimedBy || "").trim();
      return !c || c === viewerId;
    });
  }

  const anonymise = settings?.anonymiseDashboardResponses === true;
  const panelById = new Map((panelsBucket?.singles || []).map((p?) => [String(p.id), p]));

    list.sort((a?, b?) => {
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
    ...TICKET_TYPES.flatMap((t?) => settings?.types?.[t]?.staffRoleIds || []),
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
      .map((t?, idx?) => ({ t, idx, act: activity.get(String(t._id || t.channelId || "")) }))
      .sort((a?, b?) => {
        const ca = String(a.t.claimedBy || "").trim() ? 1 : 0;
        const cb = String(b.t.claimedBy || "").trim() ? 1 : 0;
        if (ca !== cb) return ca - cb;
        const aa = a.act?.awaitingResponse ? 0 : 1;
        const ba = b.act?.awaitingResponse ? 0 : 1;
        if (aa !== ba) return aa - ba;
        return a.idx - b.idx;
      })
      .map((row?) => row.t);
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
    panels: (panelsBucket?.singles || []).map((p?) => ({
      id: p.id,
      title: p.title,
      ticketType: p.ticketType,
    })),
    types: TICKET_TYPES.slice(),
    tickets: slice.map((t?) => {
      const act = activity.get(String(t._id || t.channelId || "")) || {};
      const panel: any = t.panelId ? panelById.get(String(t.panelId)) : null;
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

/**
 * "Segna chiuso" dalla dashboard: chiude il ticket solo nel database (nessuna azione su Discord).
 * Per i ticket rimasti aperti senza un canale vero (cancellato, spostato, di un altro server).
 */
async function forceCloseDashboardTicket(client?, accessToken?, guildId?, ticketId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) {
    return fail(access.status || 403, access.error || "forbidden", access.message || "Accesso negato.");
  }
  const gid = String(guildId || "").trim();
  const tid = String(ticketId || "").trim();
  if (!tid) return fail(400, "invalid_ticket", "Ticket non valido.");
  const done = await Ticket.findOneAndUpdate(
    { _id: tid, guildId: gid, open: true },
    {
      $set: {
        open: false,
        closedAt: new Date(),
        closedBy: String(access.userId || "").trim() || null,
        closeReason: "Segnato chiuso dalla dashboard",
      },
    },
    { new: true },
  ).catch(() => null);
  if (!done) return fail(404, "not_found", "Ticket non trovato o già chiuso.");
  invalidateSlimClosedTicketsCache(gid);
  global.logger?.info?.(`[dashboard tickets] segnato chiuso ${tid} (guild ${gid}) da ${String(access.userId || "?")}`);
  return { ok: true, status: 200, overview: await computeTicketOverview(gid) };
}

export = {
  forceCloseDashboardTicket,
  getDashboardTickets,
  patchDashboardTickets,
  listDashboardTickets,
  listDashboardTranscripts,
  getDashboardTranscriptHtml,
  invalidateSlimClosedTicketsCache,
};
