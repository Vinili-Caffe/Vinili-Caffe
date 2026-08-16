#!/usr/bin/env node
/**
 * Manutenzione ticket web (Mongo):
 *   node Vinyls/Scripts/webTicketsMaintenance.js --delete-test
 *   node Vinyls/Scripts/webTicketsMaintenance.js --import-discord-closed
 *   node Vinyls/Scripts/webTicketsMaintenance.js --delete-test --import-discord-closed
 */
"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
const IDs = require(path.join(ROOT, "Utils", "Config", "ids"));
const {
  SiteWebTicket,
  SiteWebTicketMessage,
  WEB_TICKET_STATUS,
  nextWebTicketNumber,
} = require(path.join(ROOT, "Schemas", "Web", "siteWebTicketSchemas"));
const Ticket = require(path.join(ROOT, "Schemas", "Ticket", "ticketSchema"));

function argFlag(name) {
  return process.argv.includes(name);
}

function normalizeCategory(value) {
  const k = String(value || "").trim().toLowerCase();
  if (["supporto", "partnership", "high", "perks"].includes(k)) return k;
  if (k.includes("partner")) return "partnership";
  if (k.includes("high")) return "high";
  if (k.includes("perk")) return "perks";
  return "supporto";
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

async function importClosedDiscordTickets(guildId) {
  const closed = await Ticket.find({ guildId, open: false })
    .sort({ ticketNumber: 1 })
    .limit(500)
    .lean()
    .catch(() => []);
  if (!closed.length) {
    console.log("[webTicketsMaintenance] Nessun ticket Discord chiuso da importare.");
    return;
  }

  let imported = 0;
  for (const row of closed) {
    const discordKey = `discord:${String(row._id || row.channelId || row.ticketNumber)}`;
    const existing = await SiteWebTicket.findOne({ guildId, subject: discordKey }).lean();
    if (existing) continue;

    const ticketNumber = await nextWebTicketNumber(guildId);
    const category = normalizeCategory(row.ticketType);
    const subject = String(row.descriptionSubmitted || row.userTag || `Ticket Discord #${row.ticketNumber}`).slice(0, 120);
    const ticket = await SiteWebTicket.create({
      guildId,
      ticketNumber,
      userId: String(row.userId || "0"),
      authorName: String(row.userTag || "Utente Discord").replace(/#\d+$/, "").slice(0, 80) || "Utente Discord",
      authorAvatarUrl: "",
      category,
      subject: subject || `Discord #${row.ticketNumber}`,
      status: WEB_TICKET_STATUS.CLOSED,
      claimedBy: row.claimedBy ? String(row.claimedBy) : null,
      claimedByName: "",
      closedBy: row.closedBy ? String(row.closedBy) : null,
      closedByName: "",
      closedAt: row.closedAt ? new Date(row.closedAt) : row.updatedAt ? new Date(row.updatedAt) : new Date(),
      closeReason: "Import transcript Discord",
      lastMessageAt: row.closedAt ? new Date(row.closedAt) : new Date(),
      lastMessagePreview: "Transcript Discord importato",
      lastAuthorKind: "system",
      messageCount: 1,
    });

    await SiteWebTicketMessage.create({
      guildId,
      ticketId: ticket._id,
      authorId: "system",
      authorName: "Sistema",
      authorAvatarUrl: "",
      authorKind: "system",
      content: `Ticket Discord #${row.ticketNumber} importato (${category}). Canale: ${row.channelId || "n/d"}.`,
      imageUrls: [],
    });
    imported += 1;
  }
  console.log(`[webTicketsMaintenance] Importati ${imported} ticket Discord chiusi.`);
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || "";
  if (!mongoUri) {
    console.error("MONGO_URI/MONGODB_URI mancante.");
    process.exit(1);
  }
  const guildId = String(IDs.guilds?.main || process.env.GUILD_ID || "").trim();
  if (!guildId) {
    console.error("Guild ID non configurato.");
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  try {
    if (argFlag("--delete-test")) await deleteTestTickets(guildId);
    if (argFlag("--import-discord-closed")) await importClosedDiscordTickets(guildId);
    if (!argFlag("--delete-test") && !argFlag("--import-discord-closed")) {
      console.log("Usa --delete-test e/o --import-discord-closed");
    }
  } finally {
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
