
const {
  WEB_TICKET_CATEGORIES,
  WEB_TICKET_STATUS,
  SiteWebTicket,
  SiteWebTicketMessage,
  nextWebTicketNumber,
} = require("../../features/tickets/data/siteWebTicketSchemas") as typeof import("../../features/tickets/data/siteWebTicketSchemas");
const { sendJsonWithEtag } = require("../http/siteHttpEtag") as typeof import("../http/siteHttpEtag");
const { CATEGORY_LABELS, displayNameForMember, buildWebTicketChannelName, avatarForMember, liveTicketAvatarUrl, sanitizeText, normalizeCategory, resolveWebTicketCategories, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { resolveCommunityRoleForMember, buildStaffRoleMapForUserIds, listAccessibleTicketCategories, resolveClientGuild, ticketHasAddedUser, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { collectMentionUserIdsFromMessages, resolveTicketMentionScope, memberCanViewChannelId, listGuildMentionChannels } = require("./ticketMentions") as typeof import("./ticketMentions");
const { MAX_IMAGES, saveTicketImages } = require("./ticketMedia") as typeof import("./ticketMedia");
const { MAX_REACTION_KINDS, buildReactionNameMap } = require("./ticketReactions") as typeof import("./ticketReactions");
const { webTicketsListCache, ticketsAreImportDupSrv, dedupeTicketDocsSrv, webTicketsListEtag, webTicketsDetailEtag, rememberBotUserId, resolveMessageAuthorKind, serializeMessage, markTicketMessagesRead, staffAvgRatingMap, serializeMessagesWithReplies, resolveRateableStaffer, serializeTicket, previewFromContent } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { MAX_CONTENT, emitTicketEvent, notifyStaffNewTicket, createSystemMessage, ticketBroadcastPayload, startWebTicketSlaNotifLoop } = require("./ticketNotify") as typeof import("./ticketNotify");
const { resolveMemberOrStaff, loadTicketForActor, handleSiteWebTicketsCommandsGet, handleSiteWebTicketsCommandPost } = require("./ticketCommands") as typeof import("./ticketCommands");
const { sanitizeWebTicketMentionsToScope, sanitizeWebTicketChannelMentions, handleSiteWebTicketsPresencePost, handleSiteWebTicketsReadPost, handleSiteWebTicketsTypingPost, handleSiteWebTicketsEmojisGet, handleSiteWebTicketsMentionsGet, handleSiteWebTicketsMessagePost, handleSiteWebTicketsReactionPost, handleSiteWebTicketsMessagePatch, handleSiteWebTicketsMessageDelete, handleSiteWebTicketsResolvePost, handleSiteWebTicketsFileGet } = require("./siteWebTicketsChat") as typeof import("./siteWebTicketsChat");
const { MAX_SUBJECT, handleSiteWebTicketsClaimPost, handleSiteWebTicketsUnclaimPost, closeOpenWebTicketsForGuildUser, autoUnclaimOpenWebTicketsClaimedByUser, removeLeftUserFromOpenWebTickets, handleSiteWebTicketsClosePost, handleSiteWebTicketsMembersPost, handleSiteWebTicketsMembersRemovePost, handleSiteWebTicketsTransferPost, handleSiteWebTicketsCategoryPost, handleSiteWebTicketsRenamePost, handleSiteWebTicketsCloseRequestPost, handleSiteWebTicketsCloseRequestAcceptPost, handleSiteWebTicketsCloseRequestRejectPost, handleSiteWebTicketsRatePost } = require("./siteWebTicketsManage") as typeof import("./siteWebTicketsManage");










/* siteApiW3/W8: open web-ticket counts + short list cache + ETag */
const OPEN_WEB_TICKETS_TTL_MS = 20_000;
/* ticketSwitchFast1: list TTL 20s — switch Personali/Staff spesso entro la finestra */
const WEB_TICKETS_LIST_TTL_MS = 20_000;
let openWebTicketsCache = null;
let openWebTicketsInflight = null;
const webTicketsListInflight = new Map();

/* ticketListCacheBust1 + ticketListTotalFix1: await mark prima della cache lista */
async function markTicketDocsListHidden(hidden?, winnerByPair?) {
  if (!Array.isArray(hidden) || !hidden.length) return 0;
  try {
    webTicketsListCache.clear();
  } catch (eClear0) {}
  let marked = 0;
  try {
    for (const doc of hidden) {
      const id = doc?._id;
      if (!id) continue;
      let winnerId = null;
      if (winnerByPair && typeof winnerByPair.get === "function") {
        winnerId = winnerByPair.get(String(id)) || null;
      }
      const r = await SiteWebTicket.updateOne(
        { _id: id, listHidden: { $ne: true } },
        {
          $set: {
            listHidden: true,
            ...(winnerId ? { duplicateOf: winnerId } : {}),
          },
        },
      ).catch(() => null);
      if (r && (r.modifiedCount || r.matchedCount)) marked += 1;
    }
    if (marked) {
      try {
        webTicketsListCache.clear();
        openWebTicketsCache = null;
      } catch (eClear1) {}
    }
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] listHidden mark failed:", err?.message || err);
  }
  return marked;
}
const {
  consumeWebTicketMessageRateLimit,
  checkWebTicketUserMessageAutomod,
} = require("./webTicketMessageGuard") as typeof import("./webTicketMessageGuard");
const { sendWebTicketDiscordLog } = require("./webTicketDiscordLog") as typeof import("./webTicketDiscordLog");
const MAX_OPEN_PER_USER = 1;
const MAX_MESSAGES_FETCH = 120;

async function handleSiteWebTicketsMetaGet(client?, req?, res?) {
  const guildId = resolveGuildId(client);
  const categories = await resolveWebTicketCategories(guildId);
  return res.status(200).json({
    ok: true,
    guildId: guildId || null,
    categories,
    limits: {
      maxOpenPerUser: MAX_OPEN_PER_USER,
      maxSubject: MAX_SUBJECT,
      maxContent: MAX_CONTENT,
      maxImages: MAX_IMAGES,
      maxReactionKinds: MAX_REACTION_KINDS,
    },
  });
}

async function handleSiteWebTicketsListGet(client?, req?, res?) {
  const scope = String(req.query?.scope || "").trim().toLowerCase();
  const wantStaffScope = scope === "staff" || scope === "inbox";
  const actor = await resolveMemberOrStaff(client, req, { needStaff: wantStaffScope });
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const statusFilter = String(req.query?.status || "").trim().toLowerCase();
  const categoryFilter = normalizeCategory(req.query?.category);
  const filter: Record<string, any> = { guildId, listHidden: { $ne: true } };
  const staffCategories = listAccessibleTicketCategories(actor.member);

  const pageRaw = Math.max(1, Math.floor(Number(req.query?.page) || 1));
  const pageSize = Math.min(50, Math.max(5, Math.floor(Number(req.query?.limit) || 20)));

  if (actor.isStaff && wantStaffScope) {
    if (!staffCategories.length) {
      return res.status(200).json({
        ok: true,
        isStaff: false,
        staffAccess: false,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        count: 0,
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        tickets: [],
        categories: await resolveWebTicketCategories(guildId),
        staffCategories: [],
        error: "staff_roles_unavailable",
        message: "Ruoli staff non ancora disponibili. Riprova.",
      });
    }
    if (categoryFilter) {
      if (!staffCategories.includes(categoryFilter)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden_category",
          message: "Non hai accesso a questa categoria.",
        });
      }
      filter.category = categoryFilter;
    } else {
      filter.category = { $in: staffCategories };
    }
    if (statusFilter === "closed") filter.status = WEB_TICKET_STATUS.CLOSED;
    else if (statusFilter === "claimed") filter.status = WEB_TICKET_STATUS.CLAIMED;
    else if (statusFilter === "open") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    } else if (statusFilter === "mine") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
      filter.claimedBy = actor.userId;
    } else if (statusFilter === "unclaimed") {
      filter.status = WEB_TICKET_STATUS.OPEN;
      filter.claimedBy = null;
    } else if (statusFilter === "all" || !statusFilter) {
          } else {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    }
  } else {
    /* ticketNotifStaffOpen1: NON restituire ticket personali quando chiedono scope=staff
       (ruoli Discord non pronti su telefono → lista vuota/sbagliata + toast 403 su open). */
    if (wantStaffScope) {
      return res.status(200).json({
        ok: true,
        isStaff: false,
        staffAccess: false,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        count: 0,
        total: 0,
        page: 1,
        pageSize,
        totalPages: 1,
        tickets: [],
        categories: await resolveWebTicketCategories(guildId),
        staffCategories: [],
        error: "staff_roles_unavailable",
        message: "Accesso staff non pronto. Riprovo…",
      });
    }
    filter.$or = [{ userId: actor.userId }, { "addedUsers.id": actor.userId }];
    if (statusFilter === "closed") filter.status = WEB_TICKET_STATUS.CLOSED;
    else if (statusFilter === "open") {
      filter.status = { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] };
    }
  }

  /* ticketSwitchFast1: cache prima del countDocuments (hit senza Mongo count) */
  const listKey = [
    guildId,
    actor.userId,
    actor.isStaff ? "s" : "u",
    scope || "-",
    statusFilter || "-",
    categoryFilter || "-",
    String(pageRaw),
    String(pageSize),
    staffCategories.slice().sort().join(","),
  ].join("|");
  const nowList = Date.now();
  const listHit = webTicketsListCache.get(listKey);
  if (listHit && nowList - listHit.at < WEB_TICKETS_LIST_TTL_MS) {
    const hitPayload = { ...listHit.payload, cached: true };
    return sendJsonWithEtag(req, res, hitPayload, {
      cacheControl: "private, no-cache",
      etag: listHit.etag || webTicketsListEtag(listKey, hitPayload, listHit.at),
      extraHeaders: { "X-VC-Tickets-Cache": "hit" },
    });
  }

  const total = await SiteWebTicket.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const page = Math.min(pageRaw, totalPages);
  let listInflight = webTicketsListInflight.get(listKey);
  if (!listInflight) {
    listInflight = (async () => {
      /* fetch un po' in più: dedupe import può ridurre i risultati pagina */
      const fetchLimit = Math.min(80, pageSize * 2);
      const rowsRaw = await SiteWebTicket.find(filter)
        .sort({ lastMessageAt: -1, createdAt: -1, ticketNumber: -1 })
        .skip((page - 1) * pageSize)
        .limit(fetchLimit)
        .lean();
      const deduped = dedupeTicketDocsSrv(rowsRaw);
      const rowsKept = Array.isArray(deduped?.kept) ? deduped.kept : [];
      const rowsHidden = Array.isArray(deduped?.hidden) ? deduped.hidden : [];
      if (rowsHidden.length) {
        const winnerMap = new Map();
        for (const h of rowsHidden) {
          const win = rowsKept.find((k?) => ticketsAreImportDupSrv(k, h));
          if (win?._id) winnerMap.set(String(h._id), win._id);
        }
        await markTicketDocsListHidden(rowsHidden, winnerMap);
      }
      const rows = rowsKept.slice(0, pageSize);
      /* ticketListTotalFix1: countDocuments includeva i mirror appena nascosti su questa pagina */
      const adjTotal = Math.max(rows.length, Math.max(0, Number(total) - rowsHidden.length));
      const adjTotalPages = Math.max(1, Math.ceil(adjTotal / pageSize) || 1);
      const adjPage = Math.min(page, adjTotalPages);

      const tickets = rows.map((doc?) => {
        const perms = buildTicketPermissions(actor.member, doc, actor.userId, {
          isOwner: String(doc.userId) === String(actor.userId),
          isAdded: ticketHasAddedUser(doc, actor.userId),
        });
        return serializeTicket(doc, {
          includeStaffFields: actor.isStaff || perms.isStaffViewer,
          permissions: perms,
        });
      });
      const categories = await resolveWebTicketCategories(guildId);
      const payload = {
        ok: true,
        isStaff: actor.isStaff,
        staffAccess: Boolean(actor.isStaff && staffCategories.length),
        staffCategories,
        viewerId: actor.userId,
        viewerName: displayNameForMember(actor.member),
        viewerAvatarUrl: avatarForMember(actor.member),
        guildId,
        count: tickets.length,
        total: adjTotal,
        page: adjPage,
        pageSize,
        totalPages: adjTotalPages,
        tickets,
        categories,
      };
      const at = Date.now();
      webTicketsListCache.set(listKey, {
        at,
        payload,
        etag: webTicketsListEtag(listKey, payload, at),
      });
      if (webTicketsListCache.size > 120) {
        const cutoff = Date.now() - WEB_TICKETS_LIST_TTL_MS;
        for (const [k, v] of webTicketsListCache) {
          if (!v || v.at < cutoff) webTicketsListCache.delete(k);
        }
      }
      return payload;
    })().finally(() => {
      webTicketsListInflight.delete(listKey);
    });
    webTicketsListInflight.set(listKey, listInflight);
  }
  const payload = await listInflight;
  const cachedRow = webTicketsListCache.get(listKey);
  return sendJsonWithEtag(req, res, payload, {
    cacheControl: "private, no-cache",
    etag: cachedRow?.etag || webTicketsListEtag(listKey, payload, Date.now()),
    extraHeaders: { "X-VC-Tickets-Cache": "miss" },
  });
}

async function handleSiteWebTicketsCreatePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const category = normalizeCategory(req.body?.category);
  const openerIsStaff = Boolean(actor.isStaff);
  /* ticketPushApi1 / apiWarmSwr1: utenti devono avere push attiva (staff skip) */
  if (!openerIsStaff) {
    try {
      const { userHasActiveWebPush, isPushEnabled } = require("../http/siteWebPushService") as typeof import("../http/siteWebPushService");
      if (isPushEnabled()) {
        const hasPush = await userHasActiveWebPush(actor.userId).catch(() => false);
        if (!hasPush) {
          return res.status(403).json({
            ok: false,
            error: "push_required",
            message: "Attiva le notifiche push sul sito prima di aprire un ticket.",
          });
        }
      }
    } catch (err) {
      global.logger?.warn?.("[WEBHOOK] site-web-tickets create push check:", err?.message || err);
    }
  }
  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  {
    const pseudoTicket = { guildId, userId: actor.userId, addedUsers: [] };
    const scope = await resolveTicketMentionScope(client, pseudoTicket, { extraUserIds: [actor.userId] });
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: false,
    });
    const guild = scope.guild || (await resolveClientGuild(client, guildId));
    content = sanitizeWebTicketChannelMentions(content, actor.member, guild);
  }
  if (!category) {
    return res.status(400).json({ ok: false, error: "invalid_category", message: "Categoria non valida." });
  }
  const hasImages = Array.isArray(req.body?.images) && req.body.images.length > 0;
  if (!content && !hasImages) {
      }

  const openCount = await SiteWebTicket.countDocuments({
    guildId,
    userId: actor.userId,
    listHidden: { $ne: true },
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  });
  if (openCount >= MAX_OPEN_PER_USER) {
    return res.status(429).json({
      ok: false,
      error: "too_many_open",
      message: `Puoi avere al massimo ${MAX_OPEN_PER_USER} ticket aperti.`,
    });
  }

  if (content) {
    const rate = consumeWebTicketMessageRateLimit({
      guildId,
      userId: actor.userId,
      kind: openerIsStaff ? "staff" : "user",
    });
    if (!rate.ok) {
      return res.status(429).json({
        ok: false,
        error: rate.error || "rate_limited",
        message: rate.message,
        retryAfterMs: rate.retryAfterMs,
      });
    }
    if (!openerIsStaff) {
      const auto = checkWebTicketUserMessageAutomod({
        content,
        guildId,
        userId: actor.userId,
        ticketId: "new",
      });
      if (!auto.ok) {
        return res.status(400).json({
          ok: false,
          error: auto.error || "automod",
          message: auto.message,
        });
      }
    }
  }

  const ticketNumber = await nextWebTicketNumber(guildId);
  const authorName = displayNameForMember(actor.member);
  const authorAvatarUrl = avatarForMember(actor.member);
  const subject = buildWebTicketChannelName({ category, authorName });
  const ticket = await SiteWebTicket.create({
    guildId,
    ticketNumber,
    userId: actor.userId,
    authorName,
    authorAvatarUrl,
    category,
    subject,
    status: WEB_TICKET_STATUS.OPEN,
    lastMessageAt: new Date(),
    lastMessagePreview: previewFromContent(content, 0),
    lastAuthorKind: "user",
    messageCount: 0,
  });

  const imageUrls = await saveTicketImages(String(ticket._id), req.body?.images);
  const messagesOut = [];
  if (content || imageUrls.length) {
    const userRole = resolveCommunityRoleForMember(actor.member);
    const msg = await SiteWebTicketMessage.create({
      guildId,
      ticketId: ticket._id,
      authorId: actor.userId,
      authorName,
      authorAvatarUrl,
      authorKind: "user",
      authorRoleId: userRole?.id || null,
      authorRoleName: userRole?.name || "",
      authorRoleKey: userRole?.key || "",
      content,
      imageUrls,
    });
    ticket.messageCount = 1;
    ticket.lastMessagePreview = previewFromContent(content, imageUrls.length);
    ticket.lastMessageAt = msg.createdAt || new Date();
    const roles = await buildStaffRoleMapForUserIds(client, guildId, [actor.userId]);
    messagesOut.push(serializeMessage(msg, null, null, roles, ticket));
  } else {
    ticket.lastMessagePreview = `Ticket #${ticketNumber} · ${CATEGORY_LABELS[category] || category}`;
    ticket.lastAuthorKind = "system";
  }

  const welcome = await createSystemMessage(
    ticket,
    `Ticket #${ticketNumber} aperto · ${CATEGORY_LABELS[category] || category}. Lo staff risponderà da qui.`,
  );
  if (!content && !imageUrls.length) {
    ticket.messageCount = Math.max(1, Number(ticket.messageCount) || 0);
  }
  await ticket.save();

  void notifyStaffNewTicket(client, guildId, ticket);
  void sendWebTicketDiscordLog(client, "opened", ticket, {
    guildId,
    actorId: actor.userId,
    actorName: authorName,
  });

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: true });
  const serialized = serializeTicket(ticket, { permissions: perms });
  messagesOut.push(serializeMessage(welcome));
  const firstUserMsg = messagesOut[0] || null;
  emitTicketEvent({ type: "web_ticket_created", ticket: serialized, message: firstUserMsg || messagesOut[0] });
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serialized.id,
    message: serializeMessage(welcome),
    ticket: serialized,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  return res.status(201).json({ ok: true, ticket: serialized, messages: messagesOut });
}

async function handleSiteWebTicketsDetailGet(client?, req?, res?) {
  let actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  rememberBotUserId(client);
  let loaded = await loadTicketForActor(req.params?.ticketId, actor);
  /* ticketNotifStaffOpen1: 403 da ruoli non pronti → hard refresh staff e ritenta */
  if (!loaded.ok && Number(loaded.status) === 403 && !actor.isStaff) {
    const actor2 = await resolveMemberOrStaff(client, req, { needStaff: true });
    if (actor2.ok && actor2.isStaff) {
      actor = actor2;
      loaded = await loadTicketForActor(req.params?.ticketId, actor);
    }
  }
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const messages = await SiteWebTicketMessage.find({ ticketId: loaded.ticket._id })
    .sort({ createdAt: 1 })
    .limit(MAX_MESSAGES_FETCH)
    .lean();
  const marked = await markTicketMessagesRead(loaded.ticket._id, actor.userId, messages);
  if (marked.messageIds.length) {
    emitTicketEvent({
      type: "web_ticket_receipts",
      ticketId: String(loaded.ticket._id),
      readerId: String(actor.userId),
      messageIds: marked.messageIds,
      at: marked.at,
    });
  }
  const nameMap = buildReactionNameMap(loaded.ticket, messages);
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  const staffIds = messages
    .filter((m?) => resolveMessageAuthorKind(m, loaded.ticket) === "staff")
    .map((m?) => String(m.authorId || "").trim())
    .filter((id?) => /^\d{5,32}$/.test(id));
  const authorIds = messages
    .map((m?) => String(m.authorId || "").trim())
    .filter((id?) => id && id !== "bot" && id !== "system");
  const mentionedIds = collectMentionUserIdsFromMessages(messages);
  const roleLookupIds = [
    ...new Set([...authorIds, ...mentionedIds, String(loaded.ticket.userId || "").trim()].filter(Boolean)),
  ].slice(0, 16);
  const nameHints: Record<string, any> = {};
  for (const m of messages) {
    const id = String(m?.authorId || "").trim();
    if (!id.startsWith("discord:")) continue;
    const nm = String(m?.authorName || "").trim();
    if (nm) nameHints[id] = nm;
    else nameHints[id] = id.slice(8);
  }
  /* ticketDetailFast1: ruoli Discord con timeout — non bloccare open ticket su telefono */
  const staffRolesPromise = Promise.race([
    buildStaffRoleMapForUserIds(client, loaded.ticket.guildId, roleLookupIds, { nameHints }),
    new Promise((resolve?) => setTimeout(() => resolve({}), 2200)),
  ]);
  const [staffRatings, staffRoles, rateableStaffer] = await Promise.all([
    staffAvgRatingMap(loaded.ticket.guildId, staffIds),
    staffRolesPromise,
    String(loaded.ticket.status) === WEB_TICKET_STATUS.CLOSED
      ? resolveRateableStaffer(loaded.ticket)
      : Promise.resolve(null),
  ]);
  const staffRolesOut: Record<string, any> = {};
  for (const [uid, bucket] of Object.entries(staffRoles || {})) {
    if (!bucket) continue;
    const role = bucket.staff || bucket.community || null;
    if (!role) continue;
    staffRolesOut[uid] = { id: role.id, name: role.name, key: role.key || null };
  }
  const guild =
    client?.guilds?.cache?.get?.(String(loaded.ticket.guildId || "")) ||
    actor.member?.guild ||
    null;
  const ticketOut = serializeTicket(loaded.ticket, {
    includeStaffFields: actor.isStaff || loaded.isOwner || loaded.isAdded,
    permissions: perms,
    rateableStaffer,
  });
  ticketOut.authorAvatarUrl = liveTicketAvatarUrl(
    guild,
    ticketOut.userId || loaded.ticket.userId,
    loaded.ticket.authorAvatarUrl,
  );
  const messagesOut = serializeMessagesWithReplies(
    messages,
    nameMap,
    staffRatings,
    staffRoles,
    loaded.ticket,
  ).map((m?) => {
    if (!m) return m;
    m.authorAvatarUrl = liveTicketAvatarUrl(guild, m.authorId, m.authorAvatarUrl || "");
    return m;
  });
  const payload = {
    ok: true,
    isStaff: actor.isStaff,
    staffCategories: listAccessibleTicketCategories(actor.member),
    viewerId: actor.userId,
    guildId: String(loaded.ticket.guildId || resolveGuildId(client) || ""),
    ticket: ticketOut,
    messages: messagesOut,
    staffRoles: staffRolesOut,
  };
  /* siteApiW8: ETag/304 on ticket detail poll */
  return sendJsonWithEtag(req, res, payload, {
    cacheControl: "private, no-cache",
    etag: webTicketsDetailEtag(loaded.ticket, messages),
  });
}

async function countOpenWebTickets(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { openTickets: 0, unclaimedTickets: 0 };
  const now = Date.now();
  if (openWebTicketsCache && openWebTicketsCache.guildId === gid && openWebTicketsCache.exp > now) {
    return openWebTicketsCache.stats;
  }
  if (openWebTicketsInflight && openWebTicketsInflight.guildId === gid) {
    return openWebTicketsInflight.promise;
  }
  const promise = (async () => {
    const [openTickets, unclaimedTickets] = await Promise.all([
      SiteWebTicket.countDocuments({
        guildId: gid,
        listHidden: { $ne: true },
        status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
      }),
      SiteWebTicket.countDocuments({
        guildId: gid,
        listHidden: { $ne: true },
        status: WEB_TICKET_STATUS.OPEN,
        claimedBy: null,
      }),
    ]);
    const stats = { openTickets, unclaimedTickets };
    openWebTicketsCache = { guildId: gid, stats, exp: Date.now() + OPEN_WEB_TICKETS_TTL_MS };
    return stats;
  })().finally(() => {
    openWebTicketsInflight = null;
  });
  openWebTicketsInflight = { guildId: gid, promise };
  return promise;
}

export = {
  handleSiteWebTicketsMetaGet,
  handleSiteWebTicketsPresencePost,
  handleSiteWebTicketsReadPost,
  handleSiteWebTicketsTypingPost,
  handleSiteWebTicketsEmojisGet,
  handleSiteWebTicketsMentionsGet,
  handleSiteWebTicketsResolvePost,
  handleSiteWebTicketsCommandsGet,
  handleSiteWebTicketsListGet,
  handleSiteWebTicketsCreatePost,
  handleSiteWebTicketsDetailGet,
  handleSiteWebTicketsMessagePost,
  handleSiteWebTicketsMessagePatch,
  handleSiteWebTicketsMessageDelete,
  handleSiteWebTicketsReactionPost,
  handleSiteWebTicketsClaimPost,
  handleSiteWebTicketsUnclaimPost,
  handleSiteWebTicketsClosePost,
  closeOpenWebTicketsForGuildUser,
  autoUnclaimOpenWebTicketsClaimedByUser,
  removeLeftUserFromOpenWebTickets,
  handleSiteWebTicketsMembersPost,
  handleSiteWebTicketsMembersRemovePost,
  handleSiteWebTicketsTransferPost,
  handleSiteWebTicketsCategoryPost,
  handleSiteWebTicketsRenamePost,
  handleSiteWebTicketsCloseRequestPost,
  handleSiteWebTicketsCloseRequestAcceptPost,
  handleSiteWebTicketsCloseRequestRejectPost,
  handleSiteWebTicketsCommandPost,
  handleSiteWebTicketsRatePost,
  handleSiteWebTicketsFileGet,
  countOpenWebTickets,
  CATEGORY_LABELS,
  WEB_TICKET_CATEGORIES,
  emitTicketEvent,
  serializeTicket,
  serializeMessage,
  ticketBroadcastPayload,
  notifyStaffNewTicket,
  startWebTicketSlaNotifLoop,
  listGuildMentionChannels,
  sanitizeWebTicketMentionsToScope,
  sanitizeWebTicketChannelMentions,
  memberCanViewChannelId,
};
