"use strict";

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const { Client, GatewayIntentBits, ChannelType } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
const IDs = require(path.join(ROOT, "Utils", "Config", "ids"));
const {
  SiteWebTicket,
  SiteWebTicketMessage,
  WEB_TICKET_STATUS,
  nextWebTicketNumber,
} = require(path.join(ROOT, "Schemas", "Web", "siteWebTicketSchemas"));
const Ticket = require(path.join(ROOT, "Schemas", "Ticket", "ticketSchema"));
const { GuildFeatureBucket } = require(path.join(ROOT, "Schemas", "Guild", "guildFeatureBucketSchema"));
const { fetchAllMessages, resolveExistingTranscriptHtmlPath } = require(path.join(ROOT, "Utils", "Ticket", "transcriptUtils"));
const { hasStaffTicketRole } = require(path.join(ROOT, "Utils", "Ticket", "ticketStaffPanelBuild"));
const { userAvatarUrlDynamic } = require(path.join(ROOT, "Utils", "Discord", "guildDiscordIdentity"));
const { buildMongoUrl } = require(path.join(ROOT, "Utils", "Database", "mongoConnect"));
const { isChannelInTicketCategory, isTicketChannelName } = require(path.join(ROOT, "Utils", "Ticket", "ticketCategoryUtils"));

const IMPORT_MSG_DELAY_MS = 120;
const DISCORD_FETCH_TIMEOUT_MS = 25_000;

function argFlag(name) {
  return process.argv.includes(name);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeCategory(value) {
  const k = String(value || "").trim().toLowerCase();
  if (["supporto", "partnership", "high", "highstaff", "perks"].includes(k)) return k === "highstaff" ? "high" : k;
  if (k.includes("partner")) return "partnership";
  if (k.includes("high")) return "high";
  if (k.includes("perk")) return "perks";
  return "supporto";
}

function looksLikeMessageContent(text) {
  const s = String(text || "").trim();
  if (!s) return false;
  if (s.length > 44) return true;
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length >= 5) return true;
  if (/[.!?…]/.test(s) && words.length >= 3) return true;
  if (/^(c'?è|e\s|ho\s|mi\s|il\s|la\s|lo\s|un\s|una\s|dei\s|della\s|per\s|con\s|sono\s|abbiamo\s)/i.test(s)) return true;
  return false;
}

function isDeniedImportChannelName(name) {
  const raw = String(name || "").trim();
  const n = raw.toLowerCase();
  if (!n) return true;
  const deny = [
    /\blogs?\b/,
    /utente-discord/,
    /partnership.*log/,
    /^supporto[\s—–\-_]+logs?\b/,
    /^supporto[\s—–\-_]+utente\b/,
    /^supporto-logs?\b/,
    /^supporto-utente\b/,
  ];
  if (deny.some((re) => re.test(n))) return true;
  if (n === "supporto logs" || n === "supporto log" || n === "supporto utente-discord") return true;
  return false;
}

function isImportableDiscordChannel(ch) {
  const raw = String(ch?.name || "").trim();
  if (!raw || isDeniedImportChannelName(raw)) return false;
  if (raw.includes("᲼") || raw.includes("︲") || raw.startsWith("༄")) return true;
  const n = raw.toLowerCase();
  for (const marker of ["partnership", "supporto", "highstaff", "high", "perks"]) {
    if (n.startsWith(`${marker}-`) && n.length > marker.length + 2) return true;
    if (n.startsWith(`${marker} `) && n.length > marker.length + 2) return true;
  }
  return false;
}

function cleanImportAuthorName(raw) {
  return String(raw || "")
    .trim()
    .replace(/#\d+$/, "")
    .replace(/[\s—–\-]+/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function resolveImportAuthorName(row, messageRows, guild) {
  const tag = cleanImportAuthorName(row.userTag);
  if (tag && tag !== "Utente Discord" && !looksLikeMessageContent(tag)) return tag;
  const openerId = String(row.userId || "").trim();
  if (openerId && /^\d{5,32}$/.test(openerId) && guild?.members?.cache) {
    const member = guild.members.cache.get(openerId);
    if (member) {
      const dn = cleanImportAuthorName(
        member.displayName || member.user?.globalName || member.user?.username || "",
      );
      if (dn && !looksLikeMessageContent(dn)) return dn;
    }
  }
  const openerMsg = messageRows.find(
    (m) => m.authorKind === "user" && String(m.authorId || "") === openerId && m.authorName,
  );
  if (openerMsg?.authorName) {
    const nm = cleanImportAuthorName(openerMsg.authorName);
    if (nm && !looksLikeMessageContent(nm)) return nm;
  }
  const firstUser = messageRows.find((m) => m.authorKind === "user" && m.authorName);
  if (firstUser?.authorName) {
    const nm = cleanImportAuthorName(firstUser.authorName);
    if (nm && !looksLikeMessageContent(nm)) return nm;
  }
  return tag || "Utente";
}

function discordImportKeyForRow(row) {
  const id = String(row?._id || row?.channelId || row?.ticketNumber || "").trim();
  if (String(row?.channelId || "").trim()) return `discord:ch:${String(row.channelId).trim()}`;
  return `discord:${id}`;
}

function coerceTicketOpen(value) {
  if (value === true || value === 1 || value === "true" || value === "1") return true;
  return false;
}

function parseTranscriptTimestamp(raw) {
  const s = String(raw || "").trim();
  if (!s) return new Date();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  return parseItalianTranscriptDate(s) || new Date();
}

function parseTranscriptBlocks(transcript) {
  const text = String(transcript || "").trim();
  if (!text) return [];
  const re = /^\[([^\]]+)\]\s+([^:]+):\s*([\s\S]*)$/;
  const out = [];
  for (const block of text.split(/\n\n+/)) {
    const trimmed = block.trim();
    if (!trimmed || /^Transcript (del canale|of):/i.test(trimmed)) continue;
    const m = trimmed.match(re);
    if (!m) continue;
    out.push({
      createdAt: parseTranscriptTimestamp(m[1]),
      authorTag: m[2].trim(),
      content: m[3].trim(),
    });
  }
  if (out.length) return out;
  for (const line of text.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || /^Transcript (del canale|of):/i.test(trimmed)) continue;
    const m = trimmed.match(re);
    if (!m) continue;
    out.push({
      createdAt: parseTranscriptTimestamp(m[1]),
      authorTag: m[2].trim(),
      content: m[3].trim(),
    });
  }
  return out;
}

async function loadBucketTicketTranscriptFields(guildId, row) {
  const gid = String(guildId || row?.guildId || "").trim();
  if (!gid || !row) return null;
  const channelId = String(row.channelId || "").trim();
  const ticketNumber = row.ticketNumber != null ? Number(row.ticketNumber) : NaN;
  const filter = { guildId: gid };
  const elemMatch = {};
  if (channelId) {
    filter["tickets.channelId"] = channelId;
    elemMatch.channelId = channelId;
  } else if (!Number.isNaN(ticketNumber)) {
    filter["tickets.ticketNumber"] = ticketNumber;
    elemMatch.ticketNumber = ticketNumber;
  } else {
    return null;
  }
  try {
    const bucket = await GuildFeatureBucket.collection.findOne(filter, {
      projection: { tickets: { $elemMatch: elemMatch } },
    });
    const ticket = bucket?.tickets?.[0];
    if (!ticket || typeof ticket !== "object") return null;
    return {
      transcript: ticket.transcript,
      transcriptHtmlPath: ticket.transcriptHtmlPath,
      transcriptHtmlInline: ticket.transcriptHtmlInline,
      hasTranscript: ticket.hasTranscript,
      descriptionText: ticket.descriptionText,
    };
  } catch {
    return null;
  }
}

function getLegacyTicketModel() {
  if (mongoose.models.LegacyTicketDoc) return mongoose.models.LegacyTicketDoc;
  const schema = new mongoose.Schema(
    {
      ticketNumber: Number,
      guildId: String,
      userId: String,
      channelId: String,
      ticketType: String,
      userTag: String,
      open: Boolean,
      claimedBy: String,
      createdAt: Date,
      closedAt: Date,
      closeReason: String,
      closedBy: String,
      transcript: String,
      transcriptHtmlPath: String,
      hasTranscript: Boolean,
      ratingScore: Number,
    },
    { collection: "tickets", strict: false },
  );
  return mongoose.model("LegacyTicketDoc", schema);
}

async function enrichDiscordRow(row, guildId) {
  if (!row) return row;
  const gid = String(guildId || row.guildId || "").trim();
  let merged = { ...row };
  const bucketFields = await loadBucketTicketTranscriptFields(gid, row);
  if (bucketFields) merged = { ...merged, ...bucketFields };

  const or = [];
  if (row.channelId) or.push({ channelId: String(row.channelId) });
  if (row.ticketNumber != null && !Number.isNaN(Number(row.ticketNumber))) {
    or.push({ ticketNumber: Number(row.ticketNumber) });
  }
  if (!or.length || !gid) return merged;
  try {
    const Legacy = getLegacyTicketModel();
    const full = await Legacy.findOne({ guildId: gid, $or: or })
      .select("transcript transcriptHtmlPath hasTranscript channelId ticketNumber userId userTag ticketType")
      .lean();
    if (full) merged = { ...merged, ...full };
  } catch {
      }
  return merged;
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTranscriptHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/\n{3,}/g, "\n\n"),
  ).trim();
}

function parseItalianTranscriptDate(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, dd, mm, yyyy, hh, min, sec] = m;
  const d = new Date(
    Number(yyyy),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(sec || 0),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function rowsFromTranscriptHtml(filePath, openerId, openerTag) {
  let html = "";
  try {
    html = fs.readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const parts = html.split(/<article\s+class="msg">/i);
  const rows = [];
  for (let i = 1; i < parts.length; i += 1) {
    const chunk = parts[i];
    const author = decodeHtmlEntities((chunk.match(/<span class="author">([^<]*)</i) || [])[1] || "Utente").trim();
    const timeStr = decodeHtmlEntities((chunk.match(/<span class="time">([^<]*)</i) || [])[1] || "").trim();
    const bodyMatch = chunk.match(/<div class="meta">[\s\S]*?<\/div>\s*([\s\S]*?)(?:<\/article>|$)/i);
    const content = stripTranscriptHtml(bodyMatch ? bodyMatch[1] : chunk).slice(0, 8000);
    if (!content || /^nessun contenuto messaggio$/i.test(content)) continue;
    const authorName = author.replace(/#\d+$/, "").slice(0, 80);
    rows.push({
      authorId: importAuthorIdFromTag(authorName, openerId),
      authorName,
      authorAvatarUrl: "",
      authorKind: authorKindFromTranscriptTag(authorName, openerTag, openerId),
      content,
      imageUrls: [],
      createdAt: parseItalianTranscriptDate(timeStr) || new Date(),
    });
  }
  return rows;
}

async function resolveMessageRowsForImport(row, discord, guildId, guild, category, openerId, openerTag) {
  const enriched = await enrichDiscordRow(row, guildId);
  const channelMessages = await fetchChannelMessages(discord, guildId, enriched.channelId);
  if (channelMessages.length) {
    return rowsFromDiscordMessages(channelMessages, guild, category, openerId);
  }
  if (String(enriched.transcript || "").trim()) {
    return rowsFromTranscript(enriched.transcript, openerId, openerTag);
  }
  const htmlPath = resolveExistingTranscriptHtmlPath(enriched);
  if (htmlPath) {
    return rowsFromTranscriptHtml(htmlPath, openerId, openerTag);
  }
  return [];
}

function buildMessageContentFromDiscord(msg) {
  let content = String(msg.content || "").trim();
  if (msg.embeds?.length) {
    for (const embed of msg.embeds) {
      if (embed.title) content += `${content ? "\n" : ""}**${embed.title}**`;
      if (embed.description) content += `${content ? "\n" : ""}${embed.description}`;
      for (const field of embed.fields || []) {
        content += `${content ? "\n" : ""}${field.name}: ${field.value}`;
      }
      if (embed.image?.url) content += `${content ? "\n" : ""}[Immagine] ${embed.image.url}`;
    }
  }
  if (msg.stickers?.size) {
    for (const sticker of msg.stickers.values()) {
      content += `${content ? "\n" : ""}[Sticker] ${sticker.name || "sticker"}`;
    }
  }
  const imageUrls = [];
  if (msg.attachments?.size) {
    for (const att of msg.attachments.values()) {
      const url = String(att.url || "").trim();
      if (!url) continue;
      const ct = String(att.contentType || "").toLowerCase();
      if (ct.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(url)) {
        imageUrls.push(url);
      } else {
        content += `${content ? "\n" : ""}[Allegato] ${url}`;
      }
    }
  }
  return {
    content: content.slice(0, 8000) || (imageUrls.length ? "(allegato)" : ""),
    imageUrls: imageUrls.slice(0, 8),
  };
}

function authorKindForDiscordMessage(msg, member, ticketType, openerId) {
  if (msg.author?.bot) return "bot";
  const authorId = String(msg.author?.id || "");
  if (authorId && authorId === String(openerId || "")) return "user";
  if (member && hasStaffTicketRole(member, ticketType)) return "staff";
  return "user";
}

function authorKindFromTranscriptTag(authorTag, openerTag, openerId) {
  const tag = String(authorTag || "").trim();
  if (/bot/i.test(tag)) return "bot";
  if (openerTag && tag === openerTag) return "user";
  if (openerId && tag.includes(String(openerId))) return "user";
  return "staff";
}

function importAuthorIdFromTag(authorTag, openerId) {
  const tag = String(authorTag || "").trim();
  if (openerId && tag.includes(String(openerId))) return String(openerId);
  const slug = tag.replace(/[^a-zA-Z0-9]+/g, "_").slice(0, 40) || "unknown";
  return `import:${slug}`;
}

async function findExistingImport(guildId, importKey) {
  return SiteWebTicket.findOne({
    guildId,
    $or: [{ discordImportKey: importKey }, { subject: importKey }],
  })
    .lean()
    .catch(() => null);
}

async function deleteTestTickets(guildId) {
  const rows = await SiteWebTicket.find({ guildId }).select("_id ticketNumber subject userId").lean();
  const toDelete = rows.filter((t) => {
    const sub = String(t.subject || "").trim().toLowerCase();
    if (/^test\b/.test(sub) || sub === "test" || sub === "aa") return true;
    if (Number(t.ticketNumber) <= 5) return true;
    return false;
  });
  if (!toDelete.length) {
    console.log("[webTicketsMaintenance] Nessun ticket di test da eliminare.");
    return;
  }
  const ids = toDelete.map((t) => t._id);
  await SiteWebTicketMessage.deleteMany({ ticketId: { $in: ids } });
  await SiteWebTicket.deleteMany({ _id: { $in: ids } });
  console.log(
    `[webTicketsMaintenance] Eliminati ${toDelete.length} ticket di test:`,
    toDelete.map((t) => `#${t.ticketNumber}`).join(", "),
  );
}

async function resolveDiscordClient() {
  const vinylsConfig = require(path.join(ROOT, "config.json"));
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    vinylsConfig?.token ||
    "";
  if (!token) {
    throw new Error("Token Discord mancante (DISCORD_TOKEN / config.json).");
  }
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });
  await client.login(token);
  return client;
}

async function fetchChannelMessages(client, guildId, channelId) {
  if (!channelId) return [];
  const guild = client.guilds.cache.get(String(guildId)) || (await client.guilds.fetch(String(guildId)).catch(() => null));
  if (!guild) return [];
  const channel =
    guild.channels.cache.get(String(channelId)) || (await guild.channels.fetch(String(channelId)).catch(() => null));
  if (!channel?.messages?.fetch) return [];
  return Promise.race([
    fetchAllMessages(channel, 2500),
    sleep(DISCORD_FETCH_TIMEOUT_MS).then(() => []),
  ]);
}

async function insertImportedMessages(ticket, rows, guild, ticketType, openerId, dryRun) {
  if (!rows.length) return 0;
  if (dryRun) return rows.length;
  await SiteWebTicketMessage.deleteMany({ ticketId: ticket._id }).catch(() => null);
  let inserted = 0;
  let lastPreview = "";
  let lastKind = "system";
  let lastAt = ticket.createdAt || new Date();
  for (const row of rows) {
    await SiteWebTicketMessage.create({
      guildId: ticket.guildId,
      ticketId: ticket._id,
      authorId: row.authorId,
      authorName: row.authorName,
      authorAvatarUrl: row.authorAvatarUrl || "",
      authorKind: row.authorKind,
      content: row.content,
      imageUrls: row.imageUrls || [],
      createdAt: row.createdAt,
      updatedAt: row.createdAt,
    });
    inserted += 1;
    if (row.content) {
      lastPreview = row.content.slice(0, 180);
      lastKind = row.authorKind;
      lastAt = row.createdAt;
    }
  }
  await SiteWebTicket.updateOne(
    { _id: ticket._id },
    {
      $set: {
        messageCount: inserted,
        lastMessageAt: lastAt,
        lastMessagePreview: lastPreview || "Import Discord",
        lastAuthorKind: lastKind,
      },
    },
  ).catch(() => null);
  return inserted;
}

function rowsFromDiscordMessages(messages, guild, ticketType, openerId) {
  const rows = [];
  for (const msg of messages) {
    const { content, imageUrls } = buildMessageContentFromDiscord(msg);
    if (!content && !imageUrls.length) continue;
    const member = msg.member || guild?.members?.cache?.get(msg.author?.id);
    rows.push({
      authorId: String(msg.author?.id || "unknown"),
      authorName: String(msg.member?.displayName || msg.author?.globalName || msg.author?.username || "Utente").slice(0, 80),
      authorAvatarUrl: userAvatarUrlDynamic(msg.author, { size: 64 }) || "",
      authorKind: authorKindForDiscordMessage(msg, member, ticketType, openerId),
      content,
      imageUrls,
      createdAt: new Date(msg.createdTimestamp || Date.now()),
    });
  }
  return rows;
}

function rowsFromTranscript(transcript, openerId, openerTag) {
  const blocks = parseTranscriptBlocks(transcript);
  return blocks.map((b) => ({
    authorId: importAuthorIdFromTag(b.authorTag, openerId),
    authorName: String(b.authorTag || "Utente").replace(/#\d+$/, "").slice(0, 80),
    authorAvatarUrl: "",
    authorKind: authorKindFromTranscriptTag(b.authorTag, openerTag, openerId),
    content: String(b.content || "").slice(0, 8000),
    imageUrls: [],
    createdAt: Number.isNaN(b.createdAt?.getTime?.()) ? new Date() : b.createdAt,
  }));
}

function resolveTicketStatus(row) {
  if (!coerceTicketOpen(row.open)) return WEB_TICKET_STATUS.CLOSED;
  if (row.claimedBy) return WEB_TICKET_STATUS.CLAIMED;
  return WEB_TICKET_STATUS.OPEN;
}

function resolveSubject(row, messageRows, authorName) {
  const name = cleanImportAuthorName(authorName || row.userTag);
  if (name && name !== "Utente Discord" && !looksLikeMessageContent(name)) return name.slice(0, 120);
  const desc = String(row.descriptionText || "").trim();
  if (desc && !looksLikeMessageContent(desc)) return desc.slice(0, 120);
  const tag = cleanImportAuthorName(row.userTag);
  if (tag && tag !== "Utente Discord") return tag.slice(0, 120);
  return `Ticket ${row.ticketNumber || "?"}`.slice(0, 120);
}

async function collectDiscordTicketRows(guildId, discord) {
  const rowsRaw = await Ticket.find({ guildId }).lean().catch(() => []);
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []).sort(
    (a, b) => Number(a.ticketNumber || 0) - Number(b.ticketNumber || 0),
  );
  const byChannel = new Map();
  for (const row of rows) {
    if (row?.channelId) byChannel.set(String(row.channelId), row);
  }

  const guild =
    discord?.guilds?.cache?.get(String(guildId)) ||
    (discord ? await discord.guilds.fetch(String(guildId)).catch(() => null) : null);
  if (!guild?.channels?.cache) return rows;
  await guild.channels.fetch().catch(() => null);

  for (const ch of guild.channels.cache.values()) {
    if (Number(ch?.type) !== 0 && ch?.type !== ChannelType.GuildText) continue;
    if (!isChannelInTicketCategory(ch) && !isTicketChannelName(ch.name)) continue;
    if (!isImportableDiscordChannel(ch)) continue;
    const cid = String(ch.id);
    if (byChannel.has(cid)) continue;
    const overwrites = ch.permissionOverwrites?.cache;
    let openerId = "";
    if (overwrites?.size) {
      for (const ow of overwrites.values()) {
        if (ow.type !== 1) continue;
        const id = String(ow.id || "");
        if (!id) continue;
        openerId = id;
        break;
      }
    }
    const orphan = {
      _id: `channel:${cid}`,
      guildId: String(guildId),
      channelId: cid,
      ticketNumber: null,
      userId: openerId || "0",
      userTag: "Utente Discord",
      ticketType: "supporto",
      open: true,
      descriptionText: `Ticket aperto su Discord (${ch.name || cid})`,
      createdAt: ch.createdAt || new Date(),
    };
    rows.push(orphan);
    byChannel.set(cid, orphan);
  }

  return rows.sort((a, b) => Number(a.ticketNumber || 0) - Number(b.ticketNumber || 0));
}

async function importDiscordTickets(
  guildId,
  { dryRun = false, client = null, reimportMessages = false, reimportThinOnly = false } = {},
) {
  let ownClient = false;
  let discord = client;
  if (!discord) {
    discord = await resolveDiscordClient();
    ownClient = true;
  }

  const rows = await collectDiscordTicketRows(guildId, discord);
  if (!rows.length) {
    console.log("[webTicketsMaintenance] Nessun ticket Discord da importare.");
    if (ownClient) await discord.destroy().catch(() => null);
    return;
  }

  const guild =
    discord.guilds.cache.get(String(guildId)) || (await discord.guilds.fetch(String(guildId)).catch(() => null));

  let imported = 0;
  let skipped = 0;
  let messagesTotal = 0;

  try {
    for (const row of rows) {
      const importKey = discordImportKeyForRow(row);
      const existing = await findExistingImport(guildId, importKey);
      const existingMsgCount = existing
        ? await SiteWebTicketMessage.countDocuments({ ticketId: existing._id }).catch(() => 0)
        : 0;
      const thinTicket = existing && existingMsgCount <= 1;
      if (existing && existingMsgCount > 1 && !reimportMessages) {
        skipped += 1;
        continue;
      }
      if (reimportThinOnly && existing && !thinTicket && !reimportMessages) {
        skipped += 1;
        continue;
      }

      const category = normalizeCategory(row.ticketType);
      const openerId = String(row.userId || "0");
      const openerTag = String(row.userTag || "").trim();
      let messageRows = await resolveMessageRowsForImport(
        row,
        discord,
        guildId,
        guild,
        category,
        openerId,
        openerTag,
      );

      const authorName = resolveImportAuthorName(row, messageRows, guild);
      const subject = resolveSubject(row, messageRows, authorName);
      const status = resolveTicketStatus(row);
      const ticketPayload = {
        guildId,
        userId: openerId,
        authorName,
        authorAvatarUrl: "",
        category,
        subject,
        status,
        discordImportKey: importKey,
        claimedBy: row.claimedBy ? String(row.claimedBy) : null,
        claimedByName: "",
        claimedAt: row.claimedAt ? new Date(row.claimedAt) : row.claimedBy ? new Date(row.updatedAt || row.createdAt || Date.now()) : null,
        closedBy: row.closedBy ? String(row.closedBy) : null,
        closedByName: "",
        closedAt: row.closedAt ? new Date(row.closedAt) : !coerceTicketOpen(row.open) ? new Date(row.updatedAt || Date.now()) : null,
        closeReason: String(row.closeReason || "").slice(0, 500) || (status === WEB_TICKET_STATUS.CLOSED ? "Import da Discord" : ""),
        ratingTicketScore: row.ratingScore != null ? Number(row.ratingScore) : null,
        ratingAt: row.ratingScore != null ? new Date(row.closedAt || row.updatedAt || Date.now()) : null,
        messageCount: 0,
        lastMessageAt: row.closedAt ? new Date(row.closedAt) : row.createdAt ? new Date(row.createdAt) : new Date(),
        lastMessagePreview: "",
        lastAuthorKind: "system",
        createdAt: row.createdAt ? new Date(row.createdAt) : undefined,
      };

      let ticket = existing;
      if (!ticket) {
        if (dryRun) {
          console.log(`[dry-run] import #${row.ticketNumber} (${status}) msgs=${messageRows.length}`);
          imported += 1;
          messagesTotal += messageRows.length;
          await sleep(IMPORT_MSG_DELAY_MS);
          continue;
        }
        ticketPayload.ticketNumber = await nextWebTicketNumber(guildId);
        ticket = await SiteWebTicket.create(ticketPayload);
        imported += 1;
      } else if (!dryRun) {
        await SiteWebTicket.updateOne({ _id: ticket._id }, { $set: ticketPayload }).catch(() => null);
        imported += 1;
      }

      if (!messageRows.length) {
        messageRows = [
          {
            authorId: "system",
            authorName: "Sistema",
            authorAvatarUrl: "",
            authorKind: "system",
            content: `Ticket Discord #${row.ticketNumber} importato (${category}). Canale: ${row.channelId || "n/d"}.`,
            imageUrls: [],
            createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
          },
        ];
      }

      const n = await insertImportedMessages(ticket, messageRows, guild, category, openerId, dryRun);
      messagesTotal += n;
      console.log(
        `[webTicketsMaintenance] ${dryRun ? "[dry-run] " : ""}#${row.ticketNumber} → web #${ticket?.ticketNumber || "?"} (${status}, ${n} msg)`,
      );
      await sleep(IMPORT_MSG_DELAY_MS);
    }
  } finally {
    if (ownClient) await discord.destroy().catch(() => null);
  }

  console.log(
    `[webTicketsMaintenance] Import completato: ${imported} ticket, ${skipped} già completi, ${messagesTotal} messaggi${dryRun ? " (dry-run)" : ""}.`,
  );
}

function isBadWebTicketRecord(ticket) {
  const sub = String(ticket?.subject || "").toLowerCase();
  const auth = String(ticket?.authorName || "").toLowerCase();
  const key = String(ticket?.discordImportKey || "").toLowerCase();
  const patterns = [/\blogs?\b/, /utente-discord/, /partnership.*log/, /^supporto[\s\-—–]+logs?/];
  if (patterns.some((re) => re.test(sub) || re.test(auth))) return true;
  if (looksLikeMessageContent(ticket?.subject) || looksLikeMessageContent(ticket?.authorName)) return true;
  if (key.includes("logs") || key.includes("utente-discord")) return true;
  return false;
}

async function purgeBadImports(guildId, { dryRun = false } = {}) {
  const rows = await SiteWebTicket.find({ guildId }).select("_id ticketNumber subject authorName discordImportKey").lean();
  const bad = rows.filter(isBadWebTicketRecord);
  if (!bad.length) {
    console.log("[webTicketsMaintenance] Nessun ticket import errato da rimuovere.");
    return;
  }
  console.log(
    `[webTicketsMaintenance] ${dryRun ? "[dry-run] " : ""}Rimozione ${bad.length} ticket errati:`,
    bad.map((t) => `#${t.ticketNumber}`).join(", "),
  );
  if (dryRun) return;
  const ids = bad.map((t) => t._id);
  await SiteWebTicketMessage.deleteMany({ ticketId: { $in: ids } });
  await SiteWebTicket.deleteMany({ _id: { $in: ids } });
}

async function repairImportNames(guildId, { dryRun = false, client = null, fast = false } = {}) {
  let ownClient = false;
  let discord = client;
  if (!fast && !discord) {
    discord = await resolveDiscordClient();
    ownClient = true;
  }
  const guild =
    !fast && discord
      ? discord.guilds.cache.get(String(guildId)) ||
        (await discord.guilds.fetch(String(guildId)).catch(() => null))
      : null;

  const discordRows = await Ticket.find({ guildId }).lean().catch(() => []);
  const byChannel = new Map();
  const byNumber = new Map();
  for (const row of discordRows) {
    if (row?.channelId) byChannel.set(String(row.channelId), row);
    if (row?.ticketNumber != null) byNumber.set(Number(row.ticketNumber), row);
  }

  const webRows = await SiteWebTicket.find({ guildId }).lean();
  let fixed = 0;
  try {
    for (const t of webRows) {
      let discordRow = null;
      const key = String(t.discordImportKey || "");
      const chMatch = key.match(/^discord:ch:(\d+)$/);
      if (chMatch) discordRow = byChannel.get(chMatch[1]) || null;
      if (!discordRow && /discord:(\d+)/.test(key)) {
        discordRow = byNumber.get(Number(key.replace(/^discord:/, ""))) || null;
      }
      if (!discordRow && t.ticketNumber && byNumber.has(Number(t.ticketNumber))) {
        discordRow = byNumber.get(Number(t.ticketNumber));
      }

      let messageRows = [];
      if (!fast && discordRow?.channelId) {
        const msgs = await fetchChannelMessages(discord, guildId, discordRow.channelId);
        if (msgs.length) {
          messageRows = rowsFromDiscordMessages(msgs, guild, normalizeCategory(discordRow.ticketType), String(discordRow.userId || t.userId || "0"));
        }
      }
      if (!messageRows.length) {
        const stored = await SiteWebTicketMessage.find({ ticketId: t._id })
          .sort({ createdAt: 1 })
          .limit(40)
          .lean()
          .catch(() => []);
        messageRows = stored.map((m) => ({
          authorId: String(m.authorId || ""),
          authorName: String(m.authorName || ""),
          authorKind: String(m.authorKind || "user"),
          content: String(m.content || ""),
        }));
      }

      const row = discordRow || {
        userId: t.userId,
        userTag: t.authorName,
        ticketNumber: t.ticketNumber,
        descriptionText: "",
      };
      const authorName = resolveImportAuthorName(row, messageRows, guild);
      const subject = resolveSubject(row, messageRows, authorName);
      const sameAuth = String(t.authorName || "") === authorName;
      const sameSub = String(t.subject || "") === subject;
      if (sameAuth && sameSub) continue;

      fixed += 1;
      console.log(
        `[webTicketsMaintenance] ${dryRun ? "[dry-run] " : ""}#${t.ticketNumber}: "${t.subject}" → "${subject}" (${authorName})`,
      );
      if (!dryRun) {
        await SiteWebTicket.updateOne({ _id: t._id }, { $set: { authorName, subject } }).catch(() => null);
      }
    }
  } finally {
    if (ownClient) await discord.destroy().catch(() => null);
  }
  console.log(`[webTicketsMaintenance] Nomi riparati: ${fixed}${dryRun ? " (dry-run)" : ""}.`);
}

async function main() {
  const mongoUri = buildMongoUrl() || "";
  if (!mongoUri) {
    console.error("MONGO_URL_LOCAL / MONGO_URL mancante.");
    process.exit(1);
  }
  console.log("[webTicketsMaintenance] Mongo:", mongoUri.includes("127.0.0.1") || mongoUri.includes("localhost") ? "LOCAL" : "REMOTE");
  const guildId = String(IDs.guilds?.main || process.env.GUILD_ID || "").trim();
  if (!guildId) {
    console.error("Guild ID non configurato.");
    process.exit(1);
  }

  const dryRun = argFlag("--dry-run");
  const reimportMessages = argFlag("--reimport-messages");
  const reimportThinOnly = argFlag("--reimport-messages-thin");
  const importAll =
    argFlag("--import-discord-all") ||
    argFlag("--import-discord-closed") ||
    reimportMessages ||
    reimportThinOnly;
  const repairNames = argFlag("--repair-import-names") || argFlag("--repair-import-names-fast");
  const repairFast = argFlag("--repair-import-names-fast");
  const purgeBad = argFlag("--purge-bad-imports");

  await mongoose.connect(mongoUri);
  try {
    if (argFlag("--delete-test")) await deleteTestTickets(guildId);
    if (purgeBad) await purgeBadImports(guildId, { dryRun });
    if (repairNames) await repairImportNames(guildId, { dryRun, fast: repairFast });
    if (importAll) {
      await importDiscordTickets(guildId, { dryRun, reimportMessages, reimportThinOnly });
    }
    if (!argFlag("--delete-test") && !importAll && !repairNames && !purgeBad) {
      console.log(
        "Usa --delete-test, --purge-bad-imports, --repair-import-names, --reimport-messages-thin e/o --import-discord-all",
      );
    }
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
