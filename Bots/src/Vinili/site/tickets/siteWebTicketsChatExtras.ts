/** Ticket dal sito, chat: presenza, letto, sta scrivendo, emoji, menzioni, anteprima dei link e allegati. */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteWebTicket, SiteWebTicketMessage } = require("../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { sanitizeDiscordChannelName } = require("../utils/discordDisplayName") as typeof import("../utils/discordDisplayName");
const { setWebTicketPagePresence, clearWebTicketPagePresence } = require("./webTicketPagePresence") as typeof import("./webTicketPagePresence");
const { setTyping: setChatTyping, clearTyping: clearChatTyping } = require("../http/siteChatTyping") as typeof import("../http/siteChatTyping");
const { knownBotDisplayName, displayNameForMember, avatarForMember, scrubStoredTicketAvatarUrl, normalizeCategory, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { cleanStaffRoleDisplayName, listAddedUsers, ticketHasAddedUser } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { resolveTicketMentionScope, memberCanViewChannelId, memberMentionRow, listGuildMentionChannels } = require("./ticketMentions") as typeof import("./ticketMentions");
const { UPLOAD_ROOT, verifyTicketFileAccessToken, parseDiscordContentUrl, isPublicImageUrl } = require("./ticketMedia") as typeof import("./ticketMedia");
const { listGuildEmojisCached } = require("./ticketReactions") as typeof import("./ticketReactions");
const { markTicketMessagesRead } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { emitTicketEvent } = require("./ticketNotify") as typeof import("./ticketNotify");
const { resolveMemberOrStaff, loadTicketForActor } = require("./ticketCommands") as typeof import("./ticketCommands");
const { canClaimTicket } = require("../../MultiGuild/tickets/discord/ticketStaffRuntime") as typeof import("../../MultiGuild/tickets/discord/ticketStaffRuntime");

async function handleSiteWebTicketsPresencePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const clear = req.body?.clear === true || req.body?.active === false;
  if (clear) {
    clearWebTicketPagePresence(actor.userId);
    return res.status(200).json({ ok: true, cleared: true });
  }
  const ticketId = String(req.body?.ticketId || req.body?.selectedId || "").trim();
  const inbox =
    req.body?.inbox === true ||
    req.body?.staffInbox === true ||
    String(req.body?.view || "").trim().toLowerCase() === "staff";
  setWebTicketPagePresence(actor.userId, { ticketId, inbox });
  if (ticketId && mongoose.isValidObjectId(ticketId)) {
    const access = await loadTicketForActor(ticketId, actor).catch(() => null);
    if (access?.ok) {
      const recent = await SiteWebTicketMessage.find({ ticketId: access.ticket._id })
        .sort({ createdAt: -1 })
        .limit(80)
        .lean()
        .catch(() => []);
      const marked = await markTicketMessagesRead(access.ticket._id, actor.userId, recent || []);
      if (marked.messageIds.length) {
        emitTicketEvent({
          type: "web_ticket_receipts",
          ticketId: String(access.ticket._id),
          readerId: String(actor.userId),
          messageIds: marked.messageIds,
          at: marked.at,
        });
      }
    }
  }
  return res.status(200).json({ ok: true, ticketId: ticketId || null, inbox: Boolean(inbox) });
}

async function handleSiteWebTicketsReadPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const ticketId = String(req.params?.ticketId || req.body?.ticketId || "").trim();
  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ ok: false, error: "bad_id", message: "Ticket non valido." });
  }
  const loaded = await loadTicketForActor(ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const rawIds = Array.isArray(req.body?.messageIds) ? req.body.messageIds : [];
  const wantIds = [
    ...new Set(rawIds.map((id?) => String(id || "").trim()).filter((id?) => mongoose.isValidObjectId(id))),
  ].slice(0, 120);
  const q: Record<string, any> = { ticketId: loaded.ticket._id };
  if (wantIds.length) q._id = { $in: wantIds };
  const docs = await SiteWebTicketMessage.find(q)
    .sort({ createdAt: -1 })
    .limit(wantIds.length ? wantIds.length : 120)
    .lean()
    .catch(() => []);
  const marked = await markTicketMessagesRead(loaded.ticket._id, actor.userId, docs || []);
  if (marked.messageIds.length) {
    emitTicketEvent({
      type: "web_ticket_receipts",
      ticketId: String(loaded.ticket._id),
      readerId: String(actor.userId),
      messageIds: marked.messageIds,
      at: marked.at,
    });
  }
  return res.status(200).json({
    ok: true,
    ticketId: String(loaded.ticket._id),
    messageIds: marked.messageIds,
    at: marked.at,
  });
}

async function handleSiteWebTicketsTypingPost(client?, req?, res?) {
  const actor: any = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const ticketId = String(req.params?.ticketId || req.body?.ticketId || "").trim();
  if (!mongoose.isValidObjectId(ticketId)) {
    return res.status(400).json({ ok: false, error: "bad_id", message: "Ticket non valido." });
  }
  const access = await loadTicketForActor(ticketId, actor);
  if (!access.ok) {
    return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
  }
  const stop = req.body?.stop === true || req.body?.clear === true;
  if (stop) {
    clearChatTyping({
      kind: "ticket",
      id: ticketId,
      userId: actor.userId,
      eventType: "web_ticket_typing",
      extra: { ticketId },
    });
    return res.status(200).json({ ok: true, stopped: true });
  }
  const userName =
    String(
      actor.member?.displayName ||
        actor.member?.user?.globalName ||
        actor.member?.user?.username ||
        actor.displayName ||
        "Utente",
    ).trim() || "Utente";
  setChatTyping({
    kind: "ticket",
    id: ticketId,
    userId: actor.userId,
    userName,
    eventType: "web_ticket_typing",
    extra: { ticketId },
  });
  return res.status(200).json({ ok: true });
}

async function handleSiteWebTicketsEmojisGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }
  const force = String(req.query?.fresh || "") === "1" || String(req.query?.force || "") === "1";
  const emojis = await listGuildEmojisCached(client, guildId, { force });
  res.setHeader("Cache-Control", "private, max-age=60");
  return res.status(200).json({
    ok: true,
    guildId,
    count: emojis.length,
    emojis,
  });
}

async function handleSiteWebTicketsMentionsGet(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const q = String(req.query?.q || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .slice(0, 40);
  const ticketId = String(req.query?.ticketId || "").trim();
  const claimEligible = String(req.query?.claimEligible || "") === "1";
  /* ticketAddUserSearch1: Aggiungi utente → cerca in guild (non solo chi è già nel ticket) */
  const guildSearch = String(req.query?.guildSearch || "") === "1";
  const byUserId = new Map();

  const putUser = (row?) => {
    if (!row?.id || byUserId.has(row.id)) return;
    byUserId.set(row.id, row);
  };

  let ticket = null;
  let canAccessTicket = false;
  let isOwner = false;
  let isAdded = false;
  let actingAsStaff = false;
  let mentionScope = null;

  if (mongoose.isValidObjectId(ticketId)) {
    ticket = await SiteWebTicket.findById(ticketId).lean().catch(() => null);
    if (ticket) {
      isOwner = String(ticket.userId) === String(actor.userId);
      isAdded = ticketHasAddedUser(ticket, actor.userId);
      canAccessTicket = Boolean(actor.isStaff || isOwner || isAdded);
      actingAsStaff = Boolean(actor.isStaff && canAccessTicket && !isOwner && !isAdded);
      if (canAccessTicket) {
        mentionScope = await resolveTicketMentionScope(client, ticket);
      }
    }
  }

    if (ticket && canAccessTicket && !claimEligible) {
    const authors = await SiteWebTicketMessage.find({ ticketId: ticket._id, authorKind: { $ne: "system" } })
      .select("authorId authorName authorAvatarUrl")
      .lean()
      .catch(() => []);
    const seed = [
      {
        id: String(ticket.userId || ""),
        name: String(ticket.authorName || "Utente").trim() || "Utente",
        avatarUrl: scrubStoredTicketAvatarUrl(ticket.authorAvatarUrl),
      },
      ticket.claimedBy
        ? {
            id: String(ticket.claimedBy),
            name: String(ticket.claimedByName || "Staff").trim() || "Staff",
            avatarUrl: scrubStoredTicketAvatarUrl(ticket.claimedByAvatarUrl),
          }
        : null,
      ...listAddedUsers(ticket),
      ...authors.map((a?) => ({
        id: String(a.authorId || ""),
        name: String(a.authorName || "Utente").trim() || "Utente",
        avatarUrl: scrubStoredTicketAvatarUrl(a.authorAvatarUrl),
      })),
    ];
    for (const s of seed) {
      if (!s?.id || !mentionScope?.allowedUserIds?.has?.(String(s.id))) continue;
      putUser({
        type: "user",
        id: s.id,
        name: s.name,
        username: null,
        avatarUrl: s.avatarUrl || "",
        markup: `<@${s.id}>`,
      });
    }
  }

    if ((claimEligible || (guildSearch && actor.isStaff)) && ticket && canAccessTicket) {
    if (claimEligible && actor.isStaff) {
      try {
        const { getCachedStaffRoster } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
        const roster = await getCachedStaffRoster(client);
        const people = Array.isArray(roster?.sections)
          ? roster.sections.flatMap((s?) => (Array.isArray(s?.members) ? s.members : []))
          : Array.isArray(roster?.people)
            ? roster.people
            : Array.isArray(roster?.staff)
              ? roster.staff
              : [];
        for (const p of people) {
          const id = String(p?.userId || p?.id || "").trim();
          if (!id) continue;
          const roleName = cleanStaffRoleDisplayName(p?.roleName || p?.roleLabel || p?.section || "");
          putUser({
            type: "user",
            id,
            name: String(p?.displayName || p?.username || p?.name || "Staff").trim() || "Staff",
            username: String(p?.username || "").trim() || null,
            avatarUrl: String(p?.avatarUrl || p?.avatar || ""),
            markup: `<@${id}>`,
            roleId: p?.roleId ? String(p.roleId) : null,
            roleName: roleName && roleName !== "Staff" ? roleName : null,
          });
        }
      } catch {
              }
    }

    try {
      const guild =
        client?.guilds?.cache?.get?.(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
        null;
      if (guild) {
        /* ticketAddUserSearch1: snowflake ID → fetch diretto (members.search non trova gli ID) */
        if (/^\d{16,22}$/.test(q)) {
          try {
            const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
            const byId =
              (await getGuildMemberCached(guild, q).catch(() => null)) ||
              guild.members?.cache?.get?.(q) ||
              (await guild.members?.fetch?.(q).catch?.(() => null)) ||
              null;
            const rowById = memberMentionRow(byId);
            if (rowById) putUser(rowById);
          } catch {
                      }
        }
        if (q && typeof guild.members?.search === "function") {
          const found = await guild.members.search({ query: q, limit: 12 }).catch(() => null);
          const list = found && typeof found.values === "function" ? [...found.values()] : [];
          for (const m of list) {
            const row = memberMentionRow(m);
            if (row) putUser(row);
          }
        }
        if (guild.members?.cache?.size) {
          for (const m of guild.members.cache.values()) {
            const row = memberMentionRow(m);
            if (!row) continue;
            if (!q) {
              if (byUserId.size < 24) putUser(row);
              continue;
            }
            const hay = `${row.name} ${row.username || ""}`.toLowerCase();
            if (hay.includes(q) || row.id.includes(q)) putUser(row);
          }
        }
      }
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions members:", err?.message || err);
    }
  }

    let roles = [];
  if (actingAsStaff && mentionScope?.allowedRoleIds?.size) {
    try {
      const { listGuildPickerData } = require("../../Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../Partner/dashboard/siteDashboardPartnershipApi");
      const pickers = await listGuildPickerData(client, guildId, { force: false });
      roles = (Array.isArray(pickers?.roles) ? pickers.roles : [])
        .filter((r?) => r && String(r.id) !== String(guildId))
        .filter((r?) => mentionScope.allowedRoleIds.has(String(r.id)))
        .filter((r?) => {
          if (!q) return true;
          const name = String(r.name || "").toLowerCase();
          return name.includes(q) || String(r.id).includes(q);
        })
        .slice(0, 20)
        .map((r?) => ({
          type: "role",
          id: String(r.id),
          name: String(r.name || "ruolo"),
          color: r.color || null,
          markup: `<@&${r.id}>`,
        }));
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions roles:", err?.message || err);
      roles = [];
    }
  }

  let users = Array.from(byUserId.values());
  if (q) {
    users = users.filter((u?) => {
      const hay = `${u.name} ${u.username || ""}`.toLowerCase();
      return hay.includes(q) || String(u.id).includes(q);
    });
  }

  if (claimEligible && ticket && canAccessTicket) {
    const cat = normalizeCategory(ticket?.category) || String(ticket?.category || "supporto");
    const openerId = String(ticket?.userId || "");
    const claimerId = String(ticket?.claimedBy || "");
    const guild =
      client?.guilds?.cache?.get?.(guildId) ||
      (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
      null;
    if (guild) {
      const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
      const filtered = [];
      for (const row of users) {
        if (filtered.length >= 20) break;
        const id = String(row.id || "");
        if (!id || id === openerId || id === claimerId) continue;
        const member = await getGuildMemberCached(guild, id).catch(() => null);
        if (!member || member.user?.bot) continue;
        if (!canClaimTicket(member, cat, guildId)) continue;
        filtered.push(row);
      }
      users = filtered;
    } else {
      users = [];
    }
  } else {
    users = users.slice(0, 20);
  }

  let channels = [];
  const kind = String(req.query?.kind || "all").trim().toLowerCase();
  const wantChannels = kind === "all" || kind === "channels";
  if (wantChannels) {
    try {
      const guild =
        client?.guilds?.cache?.get?.(guildId) ||
        (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
        null;
      const all = await listGuildMentionChannels(client, guildId);
      const visible = all.filter((row?) => memberCanViewChannelId(actor.member, guild, row.id));
      const searchRank = (row?) => {
        if (!q) return 0;
        const name = String(row.name || "").toLowerCase();
        const parent = String(row.parentName || "").toLowerCase();
        const kindLabel = String(row.channelKind || "").toLowerCase();
        if (name === q || String(row.id) === q) return 0;
        if (name.startsWith(q)) return 1;
        if (parent.startsWith(q) || kindLabel.startsWith(q)) return 2;
        if (name.includes(q) || parent.includes(q) || kindLabel.includes(q) || String(row.id).includes(q)) return 3;
        return 9;
      };
      const rows = visible
        .map((row?) => ({ ...row, _rank: searchRank(row) }))
        .filter((row?) => !q || row._rank < 9);
      rows.sort((a?, b?) => {
        if (a._rank !== b._rank) return a._rank - b._rank;
        if (a._cat !== b._cat) return a._cat - b._cat;
        if (a._parent !== b._parent) return String(a._parent || "").localeCompare(String(b._parent || ""));
        if (a._kind !== b._kind) return a._kind - b._kind;
        if (a._pos !== b._pos) return a._pos - b._pos;
        return a.name.localeCompare(b.name, "it", { sensitivity: "base" });
      });
      const limit = q ? 50 : 80;
      channels = rows.slice(0, limit).map((row?) => ({
        type: row.type,
        id: row.id,
        name: row.name,
        markup: row.markup,
        channelType: row.channelType,
        channelKind: row.channelKind,
        channelIcon: row.channelIcon,
        parentName: row.parentName,
      }));
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] mentions channels:", err?.message || err);
      channels = [];
    }
  }

  res.setHeader("Cache-Control", "private, max-age=15");
  const filter = String(req.query?.filter || "all").trim().toLowerCase();
  let outUsers = kind === "channels" ? [] : users;
  let outRoles = kind === "channels" ? [] : roles;
  if (filter === "roles") outUsers = [];
  if (filter === "users") outRoles = [];
  return res.status(200).json({
    ok: true,
    q,
    filter,
    users: outUsers,
    roles: outRoles,
    channels,
  });
}

async function handleSiteWebTicketsResolvePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const guildId = resolveGuildId(client);
  if (!guildId) {
    return res.status(503).json({ ok: false, error: "misconfigured", message: "Guild non configurata." });
  }

  const channelIds = [
    ...new Set(
      (Array.isArray(req.body?.channelIds) ? req.body.channelIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const userIds = [
    ...new Set(
      (Array.isArray(req.body?.userIds) ? req.body.userIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const roleIds = [
    ...new Set(
      (Array.isArray(req.body?.roleIds) ? req.body.roleIds : [])
        .map((id?) => String(id || "").trim())
        .filter((id?) => /^\d{5,32}$/.test(id)),
    ),
  ].slice(0, 48);
  const urls = [
    ...new Set(
      (Array.isArray(req.body?.urls) ? req.body.urls : [])
        .map((u?) => {
          let s = String(u || "").trim();
          if (/^\/\//.test(s)) s = `https:${s}`;
          return s;
        })
        .filter((u?) => /^https?:\/\//i.test(u)),
    ),
  ].slice(0, 24);

  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;

  const channels: Record<string, any> = {};
  for (const cid of channelIds) {
    if (channels[(cid as any)]) continue;
    try {
      const ch =
        guild?.channels?.cache?.get?.(cid) ||
        (await guild?.channels?.fetch?.(cid).catch?.(() => null)) ||
        null;
      if (!ch) continue;
      if (!memberCanViewChannelId(actor.member, guild, cid)) continue;
      channels[(cid as any)] = {
        id: cid,
        name: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
        type: Number(ch.type) || 0,
      };
    } catch {
          }
  }

  const users: Record<string, any> = {};
  for (const uid of userIds) {
    if (users[(uid as any)]) continue;
    try {
      const member =
        guild?.members?.cache?.get?.(uid) ||
        (await guild?.members?.fetch?.(uid).catch?.(() => null)) ||
        null;
      if (member) {
        users[(uid as any)] = {
          id: uid,
          name: displayNameForMember(member),
          avatarUrl: avatarForMember(member) || "",
        };
        continue;
      }
      const user = await client?.users?.fetch?.(uid).catch?.(() => null);
      if (!user) continue;
      let avatarUrl = "";
      try {
        avatarUrl =
          typeof user.displayAvatarURL === "function"
            ? user.displayAvatarURL({ size: 128, extension: "png" })
            : "";
      } catch {
        avatarUrl = "";
      }
      users[(uid as any)] = {
        id: uid,
        name:
          knownBotDisplayName(uid) ||
          String(user.globalName || user.displayName || user.username || "").trim() ||
          "utente",
        avatarUrl: avatarUrl || "",
      };
    } catch {
          }
  }

  const roles: Record<string, any> = {};
  for (const rid of roleIds) {
    if (roles[(rid as any)]) continue;
    try {
      const role =
        guild?.roles?.cache?.get?.(rid) ||
        (await guild?.roles?.fetch?.(rid).catch?.(() => null)) ||
        null;
      if (!role) continue;
      const name = String(role.name || "").trim();
      if (!name) continue;
      roles[(rid as any)] = {
        id: rid,
        name: name.slice(0, 80),
        color: Number(role.color) || 0,
      };
    } catch {
          }
  }

  const links: Record<string, any> = {};
  for (const rawUrl of urls) {
    if (links[(rawUrl as any)]) continue;
    if (isPublicImageUrl(rawUrl)) {
      links[(rawUrl as any)] = { kind: "image", url: rawUrl };
      continue;
    }
    const parsed = parseDiscordContentUrl(rawUrl);
    if (!parsed) continue;
    if (parsed.guildId !== guildId) {
      links[(rawUrl as any)] = {
        kind: "external",
        url: rawUrl,
        label: "Apri su Discord",
      };
      continue;
    }
    try {
      const ch =
        guild?.channels?.cache?.get?.(parsed.channelId) ||
        (await guild?.channels?.fetch?.(parsed.channelId).catch?.(() => null)) ||
        null;
      if (!ch) continue;
      if (!memberCanViewChannelId(actor.member, guild, parsed.channelId)) continue;
      if (parsed.messageId && ch.messages?.fetch) {
        const msg = await ch.messages.fetch(parsed.messageId).catch(() => null);
        if (msg) {
          const attachment = msg.attachments?.first?.() || null;
          const attUrl = attachment?.url ? String(attachment.url) : "";
          links[(rawUrl as any)] = {
            kind: "message",
            url: rawUrl,
            channelId: parsed.channelId,
            channelName: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
            messageId: parsed.messageId,
            authorName: String(msg.member?.displayName || msg.author?.globalName || msg.author?.username || "Utente"),
            content: String(msg.content || "").trim().slice(0, 800),
            imageUrl: attUrl && isPublicImageUrl(attUrl) ? attUrl : "",
          };
          continue;
        }
      }
      links[(rawUrl as any)] = {
        kind: "channel",
        url: rawUrl,
        channelId: parsed.channelId,
        channelName: sanitizeDiscordChannelName(ch.name || "canale") || "canale",
      };
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] resolve link:", err?.message || err);
    }
  }

  res.setHeader("Cache-Control", "private, max-age=30");
  return res.status(200).json({ ok: true, channels, users, roles, links });
}

async function handleSiteWebTicketsFileGet(client?, req?, res?) {
  const ticketId = String(req.params?.ticketId || "").trim();
  const fileName = String(req.params?.fileName || "").trim();
  if (!mongoose.isValidObjectId(ticketId) || !/^[a-zA-Z0-9._-]+$/.test(fileName)) {
    return res.status(400).json({ ok: false, error: "invalid_file" });
  }
  const st = String(req.query?.st || "").trim();
  let allowed = verifyTicketFileAccessToken(st, ticketId, fileName);
  if (!allowed) {
    const actor = await resolveMemberOrStaff(client, req);
    if (!actor.ok) {
      return res.status(Number(actor.status) || 401).json({
        ok: false,
        error: actor.error || "unauthorized",
        message: actor.message || "Accesso negato.",
      });
    }
    const loaded = await loadTicketForActor(ticketId, actor);
    if (!loaded.ok) {
      return res.status(Number(loaded.status) || 403).json({
        ok: false,
        error: loaded.error || "forbidden",
        message: loaded.message || "Accesso negato.",
      });
    }
    allowed = true;
  }
  if (!allowed) {
    return res.status(401).json({ ok: false, error: "unauthorized", message: "Accesso negato." });
  }
  const filePath = path.join(UPLOAD_ROOT, ticketId, fileName);
  if (!filePath.startsWith(UPLOAD_ROOT)) {
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  if (!fs.existsSync(filePath)) {
    const { redirectToCdnIfConfigured } = require("../http/siteCdnMedia") as typeof import("../http/siteCdnMedia");
    if (redirectToCdnIfConfigured(res, `uploads/web-tickets/${ticketId}/${fileName}`)) return;
    return res.status(404).json({ ok: false, error: "not_found" });
  }
  const ext = path.extname(fileName).toLowerCase();
  const type =
    ext === ".png"
      ? "image/png"
      : ext === ".webp"
        ? "image/webp"
        : ext === ".gif"
          ? "image/gif"
          : ext === ".mp4"
            ? "video/mp4"
            : ext === ".webm"
              ? "video/webm"
              : ext === ".mov"
                ? "video/quicktime"
                : "image/jpeg";
  res.setHeader("Cache-Control", "private, no-store");
  res.type(type);
  return fs.createReadStream(filePath).pipe(res);
}

export = { handleSiteWebTicketsPresencePost, handleSiteWebTicketsReadPost, handleSiteWebTicketsTypingPost, handleSiteWebTicketsEmojisGet, handleSiteWebTicketsMentionsGet, handleSiteWebTicketsResolvePost, handleSiteWebTicketsFileGet };
