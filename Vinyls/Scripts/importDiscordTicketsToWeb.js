#!/usr/bin/env node
/**
 * Importa tutti i ticket Discord (guildfeaturebuckets.tickets) nei ticket web.
 *
 *   node Vinyls/Scripts/importDiscordTicketsToWeb.js --apply
 */
"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const p of ["/opt/bot/.env", path.resolve(__dirname, "../../.env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

function chunkText(text, size = 1900) {
  const s = String(text || "");
  if (!s) return [];
  const out = [];
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

/** Header prodotto da createTranscript: [locale date] author.tag: content */
const TRANSCRIPT_MSG_RE = /^\[([^\]]+)\]\s+([^:]+):\s?(.*)$/;

/** Evita che `https://cdn...` venga letto come autore "https". */
function isFakeUrlSchemeAuthor(tag) {
  return /^(https?|ftp|ftps|mailto|www)$/i.test(String(tag || "").trim());
}

function reconstructUrlFromFakeAuthor(tag, rest) {
  const scheme = String(tag || "").trim();
  const body = String(rest || "");
  if (/^\/\//.test(body)) return `${scheme}:${body}`;
  if (/^https?:\/\//i.test(body)) return body;
  return `${scheme}:${body}`;
}

function parseTranscriptDate(raw, fallback) {
  const s = String(raw || "").trim();
  if (!s) return fallback;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d;
  // it-IT tipico: 15/08/2026, 21:58:22
  const it = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (it) {
    const dd = new Date(
      Number(it[3]),
      Number(it[2]) - 1,
      Number(it[1]),
      Number(it[4]),
      Number(it[5]),
      Number(it[6]),
    );
    if (!Number.isNaN(dd.getTime())) return dd;
  }
  return fallback;
}

function authorBase(tag) {
  return String(tag || "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function foldLeetName(s) {
  return authorBase(s)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function namesLooselyEqual(a, b) {
  const na = authorBase(a);
  const nb = authorBase(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = foldLeetName(na);
  const fb = foldLeetName(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

function classifyTranscriptAuthor(tag, ticketUserTag, ticketAuthorName) {
  const base = authorBase(tag);
  if (/^(vinili|caff[eèé]|coffee|partners?)$/i.test(base)) return "bot";
  const candidates = [ticketUserTag, ticketAuthorName].map((x) => String(x || "").trim()).filter(Boolean);
  for (const c of candidates) {
    if (tag === c || namesLooselyEqual(tag, c)) return "user";
  }
  // Altri partecipanti del canale (partner aggiunti, amici, ecc.): utente, non staff.
  // Lo staff senza snowflake resta senza badge generico lato web (meglio che clienti falsi-staff).
  return "user";
}

/**
 * Spezza il transcript plain Discord in messaggi singoli (chat-like).
 */
function parseDiscordTranscript(transcript, opts = {}) {
  const maxMessages = Math.max(1, Number(opts.maxMessages) || 250);
  const ticketUserTag = opts.ticketUserTag || "";
  const ticketAuthorName = opts.ticketAuthorName || "";
  const ticketUserId = String(opts.ticketUserId || "").trim() || "unknown";
  const fallbackAt = opts.fallbackAt instanceof Date ? opts.fallbackAt : new Date();
  const text = String(transcript || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!text) return [];

  const lines = text.split("\n");
  const parsed = [];
  let cur = null;

  function flush() {
    if (!cur) return;
    const content = String(cur.content || "").trim();
    if (content) {
      parsed.push({
        authorTag: cur.authorTag,
        authorKind: cur.authorKind,
        createdAt: cur.createdAt,
        content,
      });
    }
    cur = null;
  }

  for (const line of lines) {
    if (/^Transcript del canale:/i.test(line.trim())) continue;
    const m = line.match(TRANSCRIPT_MSG_RE);
    if (m) {
      const authorTag = String(m[2] || "").trim().slice(0, 80) || "Utente";
      // `[date] https://cdn...` → non è un messaggio nuovo, è un URL
      if (isFakeUrlSchemeAuthor(authorTag)) {
        const urlLine = reconstructUrlFromFakeAuthor(authorTag, m[3] || "");
        if (cur) {
          cur.content += (cur.content ? "\n" : "") + urlLine;
        } else {
          cur = {
            authorTag: String(ticketUserTag || ticketAuthorName || "Utente").slice(0, 80),
            authorKind: "user",
            createdAt: parseTranscriptDate(m[1], fallbackAt),
            content: urlLine,
          };
        }
        continue;
      }
      flush();
      const kind = classifyTranscriptAuthor(authorTag, ticketUserTag, ticketAuthorName);
      cur = {
        authorTag,
        authorKind: kind,
        createdAt: parseTranscriptDate(m[1], fallbackAt),
        content: String(m[3] || ""),
      };
      continue;
    }
    if (cur) {
      cur.content += (cur.content ? "\n" : "") + line;
    }
  }
  flush();

  if (parsed.length <= maxMessages) return parsed;

  const kept = parsed.slice(0, maxMessages);
  const omitted = parsed.length - maxMessages;
  kept.push({
    authorTag: "Sistema",
    authorKind: "system",
    createdAt: kept[kept.length - 1]?.createdAt || fallbackAt,
    content: `…altre ${omitted} messaggi del transcript Discord omessi (troppo lunghi).`,
  });
  return kept;
}

function messagesFromParsedTranscript(parsed, ctx) {
  const {
    guildId,
    ticketId,
    ticketUserId,
    createdAt,
    botIdentity,
  } = ctx;
  const botId = String(botIdentity?.id || "1329118940110127204");
  const botAvatar = String(botIdentity?.avatarUrl || "").trim();
  const out = [];
  let i = 0;
  for (const p of parsed) {
    if (isUselessTranscriptContent(p.content)) continue;
    const chunks = chunkText(p.content, 1900);
    if (!chunks.length) continue;
    const kind = p.authorKind === "system" ? "system" : p.authorKind;
    let authorId = "unknown";
    let authorName = String(p.authorTag || "Utente").slice(0, 80);
    let authorAvatarUrl = "";
    if (kind === "system") {
      authorId = "system";
      authorName = "Sistema";
    } else if (kind === "bot") {
      authorId = botId;
      authorName = String(botIdentity?.name || authorName || "Vinili").slice(0, 80);
      authorAvatarUrl = botAvatar;
    } else if (kind === "user") {
      authorId = String(ticketUserId || "unknown");
    } else {
      authorId = `discord:${authorBase(p.authorTag) || "staff"}`.slice(0, 64);
    }
    for (let c = 0; c < chunks.length; c += 1) {
      const at = new Date(
        (p.createdAt instanceof Date && !Number.isNaN(p.createdAt.getTime())
          ? p.createdAt.getTime()
          : createdAt.getTime()) +
          i * 1000 +
          c,
      );
      out.push({
        guildId,
        ticketId,
        authorId,
        authorName: chunks.length > 1 ? `${authorName} (${c + 1}/${chunks.length})`.slice(0, 80) : authorName,
        authorAvatarUrl,
        authorKind: kind,
        content: chunks[c],
        imageUrls: [],
        createdAt: at,
        updatedAt: at,
      });
    }
    i += 1;
  }
  return out;
}

function mapCategory(ticketType) {
  const t = String(ticketType || "").trim().toLowerCase();
  if (t === "partnership" || t === "partner") return "partnership";
  if (t === "high" || t === "highstaff" || t === "high-staff" || t === "high_staff") return "high";
  if (t === "perks" || t === "perk") return "perks";
  if (t === "supporto" || t === "support") return "supporto";
  return "supporto";
}

function isOpenFlag(v) {
  return v === true || v === 1 || v === "1" || v === "true";
}

function preview(text, max = 180) {
  let s = String(text || "")
    .replace(/\\n/gi, " ")
    .replace(/\[Embed\s+\d+\]/gi, " ")
    .replace(/\[Embed\s+(?:image|thumb)\]\s*\S+/gi, " ")
    .replace(/\[Attachment\]\s*\S+/gi, " ")
    .replace(/\[Sticker\][^\n]*/gi, " ")
    .replace(/\b(?:Title|Titolo|Description|Descrizione|Author|Autore|Footer|Fields?|Campo)\s*:\s*/gi, " ")
    .replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/g, " ")
    .replace(/<\s*(\d{15,22})\s*>/g, " ")
    .replace(/\*Nessun contenuto messaggio\*/gi, " ")
    .replace(/^\*?Nessun contenuto messaggio\*?$/gim, " ")
    .replace(/:\w+:/g, " ")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s || /^…altre \d+ messaggi/i.test(s)) return "";
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

function isUselessTranscriptContent(content) {
  const s = String(content || "").trim();
  if (!s) return true;
  return /^\*?Nessun contenuto messaggio\*?$/i.test(s);
}

function subjectFromTicket(t, category, num) {
  const { buildTicketChannelName } = require("../Utils/Ticket/ticketNamingRuntime");
  const { getTicketPanelConfig } = require("../Utils/Ticket/ticketPanelConfig");
  const authorName =
    String(t.userTag || "").trim().slice(0, 80) || `Utente ${String(t.userId || "").slice(-4) || num}`;
  const panelKey = category === "high" ? "highstaff" : category;
  const panel = getTicketPanelConfig(panelKey) || getTicketPanelConfig("supporto") || {
    emoji: "🎫",
    name: category || "supporto",
  };
  return buildTicketChannelName(panel, authorName, authorName);
}

async function fetchBotIdentity() {
  const fallback = {
    id: "1329118940110127204",
    name: "Vinili",
    avatarUrl:
      "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128",
  };
  const token =
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.DISCORD_TOKEN ||
    process.env.TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.DISCORD_BOT_TOKEN ||
    "";
  if (!token) return fallback;
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) return fallback;
    const u = await res.json();
    const id = String(u.id || fallback.id);
    const name = String(u.global_name || u.username || fallback.name).slice(0, 80);
    let avatarUrl = fallback.avatarUrl;
    if (u.avatar) {
      const ext = String(u.avatar).startsWith("a_") ? "gif" : "png";
      avatarUrl = `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.${ext}?size=128`;
    }
    return { id, name, avatarUrl };
  } catch {
    return fallback;
  }
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const guildId = "1329080093599076474";
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) throw new Error("missing mongo");

  const botIdentity = await fetchBotIdentity();
  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);
  const {
    SiteWebTicket,
    SiteWebTicketMessage,
    SiteWebTicketCounter,
    WEB_TICKET_STATUS,
  } = require("../Schemas/Web/siteWebTicketSchemas");

  const db = mongoose.connection.db;
  const bucket = await db.collection("guildfeaturebuckets").findOne(
    { guildId },
    { projection: { tickets: 1, ticketCounter: 1 } },
  );
  const discordTickets = Array.isArray(bucket?.tickets) ? bucket.tickets : [];
  const existingWeb = await SiteWebTicket.countDocuments({ guildId });

  console.log(
    JSON.stringify(
      {
        apply,
        discordCount: discordTickets.length,
        existingWebTickets: existingWeb,
      },
      null,
      2,
    ),
  );

  if (!discordTickets.length) {
    console.log("Nessun ticket Discord da importare.");
    await mongoose.disconnect();
    return;
  }
  if (!apply) {
    console.log("Dry-run. Passa --apply per scrivere su sitewebtickets.");
    await mongoose.disconnect();
    return;
  }

  if (existingWeb > 0) {
    await SiteWebTicketMessage.deleteMany({ guildId });
    await SiteWebTicket.deleteMany({ guildId });
  }

  let imported = 0;
  let messagesCreated = 0;
  let maxNum = 0;
  for (const t of discordTickets) {
    const n = Math.floor(Number(t.ticketNumber) || 0);
    if (n > maxNum) maxNum = n;
  }
  let fallbackSeq = Math.max(1, maxNum + 1);
  const claimedInImport = new Set();

  // Import in batch per non esplodere la memoria con transcript lunghi.
  const BATCH = 50;
  for (let offset = 0; offset < discordTickets.length; offset += BATCH) {
    const slice = discordTickets.slice(offset, offset + BATCH);
    const ticketDocs = [];
    const messagePlans = [];

    for (const t of slice) {
      let num = Math.floor(Number(t.ticketNumber) || 0);
      if (!(num > 0) || claimedInImport.has(num)) {
        while (claimedInImport.has(fallbackSeq)) fallbackSeq += 1;
        num = fallbackSeq;
        fallbackSeq += 1;
      }
      claimedInImport.add(num);
      if (num > maxNum) maxNum = num;

      const category = mapCategory(t.ticketType || t.panelId);
      const open = isOpenFlag(t.open);
      const claimedBy = t.claimedBy != null && String(t.claimedBy).trim() ? String(t.claimedBy).trim() : null;
      let status = WEB_TICKET_STATUS.CLOSED;
      if (open && claimedBy) status = WEB_TICKET_STATUS.CLAIMED;
      else if (open) status = WEB_TICKET_STATUS.OPEN;
      // Canali Discord storici non esistono più: meglio chiusi in web archive.
      if (status !== WEB_TICKET_STATUS.CLOSED && String(t.closeReason || "").includes("Ripristino dopo purge")) {
        status = WEB_TICKET_STATUS.CLOSED;
      }
      if (status !== WEB_TICKET_STATUS.CLOSED && !open) status = WEB_TICKET_STATUS.CLOSED;

      const authorName = String(t.userTag || "").trim().slice(0, 80) || `Utente ${String(t.userId || "").slice(-4)}`;
      const createdAt = t.createdAt ? new Date(t.createdAt) : new Date();
      const closedAt = t.closedAt ? new Date(t.closedAt) : status === WEB_TICKET_STATUS.CLOSED ? createdAt : null;
      const desc = String(t.descriptionText || "").trim();
      const transcript = String(t.transcript || "").trim();
      const subject = subjectFromTicket(t, category, num);
      const lastPreview =
        preview(desc) ||
        preview(transcript) ||
        `Importato da Discord #${num}`;

      const oid = new mongoose.Types.ObjectId();
      ticketDocs.push({
        _id: oid,
        guildId,
        ticketNumber: num,
        userId: String(t.userId || "").trim(),
        authorName,
        authorAvatarUrl: "",
        category,
        subject,
        status,
        claimedBy: claimedBy,
        claimedByName: "",
        claimedAt: claimedBy ? createdAt : null,
        closedBy: t.closedBy != null ? String(t.closedBy) : status === WEB_TICKET_STATUS.CLOSED ? "system_import" : null,
        closedByName: "",
        closedAt,
        closeReason: String(t.closeReason || (status === WEB_TICKET_STATUS.CLOSED ? "Importato da ticket Discord" : "")).slice(
          0,
          500,
        ),
        lastMessageAt: closedAt || createdAt,
        lastMessagePreview: lastPreview.slice(0, 180),
        lastAuthorKind: "system",
        messageCount: 0,
        addedUsers: [],
        ratingTicketScore: (() => {
          const n = Math.floor(Number(t.ratingScore));
          return n >= 1 && n <= 5 ? n : null;
        })(),
        ratingStafferScore: null,
        ratingBy: t.ratingBy != null ? String(t.ratingBy) : null,
        ratingAt: t.ratingAt ? new Date(t.ratingAt) : null,
        createdAt,
        updatedAt: closedAt || createdAt,
      });

      const msgs = [];
      if (desc) {
        const chunks = chunkText(desc, 1900);
        for (let i = 0; i < chunks.length; i += 1) {
          const at = new Date(createdAt.getTime() + (i + 1) * 1000);
          msgs.push({
            guildId,
            ticketId: oid,
            authorId: String(t.userId || "unknown"),
            authorName,
            authorAvatarUrl: "",
            authorKind: "user",
            content: chunks.length > 1 ? `(descrizione ${i + 1}/${chunks.length})\n${chunks[i]}` : chunks[i],
            imageUrls: [],
            createdAt: at,
            updatedAt: at,
          });
        }
      }
      if (transcript) {
        const parsed = parseDiscordTranscript(transcript, {
          maxMessages: 250,
          ticketUserTag: t.userTag,
          ticketAuthorName: authorName,
          ticketUserId: t.userId,
          fallbackAt: createdAt,
        });
        const fromTx = messagesFromParsedTranscript(parsed, {
          guildId,
          ticketId: oid,
          ticketUserId: t.userId,
          createdAt,
          botIdentity,
        });
        if (fromTx.length) {
          msgs.push(...fromTx);
        } else {
          // Fallback: transcript senza header riconoscibili
          const chunks = chunkText(transcript, 1900).slice(0, 20);
          for (let i = 0; i < chunks.length; i += 1) {
            const at = new Date(createdAt.getTime() + (msgs.length + i + 1) * 1000);
            msgs.push({
              guildId,
              ticketId: oid,
              authorId: "system",
              authorName: "Sistema",
              authorAvatarUrl: "",
              authorKind: "system",
              content:
                chunks.length > 1
                  ? `Transcript ${i + 1}/${chunks.length}:\n${chunks[i]}`
                  : chunks[i],
              imageUrls: [],
              createdAt: at,
              updatedAt: at,
            });
          }
        }
      }

      // Banner sistema sempre prima della chat (timestamp = min dei messaggi − 1s).
      const earliest =
        msgs.reduce((min, m) => {
          const t0 = m.createdAt instanceof Date ? m.createdAt.getTime() : createdAt.getTime();
          return t0 < min ? t0 : min;
        }, createdAt.getTime()) - 1000;
      const importAt = new Date(earliest);
      msgs.unshift({
        guildId,
        ticketId: oid,
        authorId: "system",
        authorName: "Sistema",
        authorAvatarUrl: "",
        authorKind: "system",
        content: `Importato dal ticket Discord #${num} (canale ${String(t.channelId || "n/d")}, tipo ${category}).`,
        imageUrls: [],
        createdAt: importAt,
        updatedAt: importAt,
      });
      messagePlans.push({ oid, msgs });
    }

    await SiteWebTicket.collection.insertMany(ticketDocs, { ordered: false });
    imported += ticketDocs.length;

    const allMsgs = [];
    for (const plan of messagePlans) {
      const count = plan.msgs.length;
      allMsgs.push(...plan.msgs);
      let lastPreview = "";
      let lastAt = null;
      let lastKind = "system";
      for (let mi = plan.msgs.length - 1; mi >= 0; mi -= 1) {
        const m = plan.msgs[mi];
        if (!m || m.authorKind === "system") continue;
        if (isUselessTranscriptContent(m.content)) continue;
        const p = preview(m.content);
        if (!p) continue;
        lastPreview = p;
        lastAt = m.createdAt;
        lastKind = m.authorKind || "system";
        break;
      }
      if (!lastPreview) {
        lastPreview = preview(plan.msgs[plan.msgs.length - 1]?.content || "") || "Ticket importato";
        lastAt = plan.msgs[plan.msgs.length - 1]?.createdAt || new Date();
      }
      await SiteWebTicket.collection.updateOne(
        { _id: plan.oid },
        {
          $set: {
            messageCount: count,
            lastMessageAt: lastAt || new Date(),
            lastMessagePreview: lastPreview.slice(0, 180),
            lastAuthorKind: lastKind,
          },
        },
      );
    }
    if (allMsgs.length) {
      await SiteWebTicketMessage.collection.insertMany(allMsgs, { ordered: false });
      messagesCreated += allMsgs.length;
    }
    console.log(`batch ${offset}-${offset + slice.length - 1} ok`);
  }

  const counterId = `web_ticket:${guildId}`;
  await SiteWebTicketCounter.findByIdAndUpdate(
    counterId,
    { $set: { seq: Math.max(maxNum, Number(bucket?.ticketCounter) || 0) } },
    { upsert: true },
  );

  const webCount = await SiteWebTicket.countDocuments({ guildId });
  const msgCount = await SiteWebTicketMessage.countDocuments({ guildId });
  console.log(
    JSON.stringify(
      {
        imported,
        messagesCreated,
        webCount,
        msgCount,
        counterSeq: Math.max(maxNum, Number(bucket?.ticketCounter) || 0),
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
