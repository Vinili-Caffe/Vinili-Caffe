const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
const VINYLS = path.join(ROOT, "Vinyls");

require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function getMongoUrl() {
  if (process.env.MONGO_URL) return process.env.MONGO_URL;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const configPath = path.join(VINYLS, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.mongoURL) return config.mongoURL;
    }
  } catch (_) {}
  return null;
}

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.TOKEN || "";
}

let IDs = { guilds: { main: "" }, channels: { pause: "" } };
try {
  IDs = require(path.join(VINYLS, "Utils", "Config", "ids"));
} catch (_) {
  IDs.guilds = IDs.guilds || { main: "1329080093599076474" };
  IDs.channels = IDs.channels || { pause: "1442569255315832945" };
}

function parsePauseMessage(content, components) {
  if (!content || typeof content !== "string") return null;
  const dataRichiestaMatch = content.match(/Data richiesta:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const dataRitornoMatch = content.match(/Data ritorno:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const motivoIdx = content.indexOf("Motivo:");
  let motivazione = "";
  if (motivoIdx !== -1) {
    motivazione = content.slice(motivoIdx + 7).trim().slice(0, 800);
  }
  if (!dataRichiestaMatch || !dataRitornoMatch) return null;
  let userId = null;
  let oldPauseId = null;
  if (components && components.length > 0) {
    const row = components[0];
    const firstButton = row?.components?.[0];
    const customId = firstButton?.customId || "";
    const match = customId.match(/^pause_accept:(\d{17,20}):(.+)$/);
    if (match) {
      userId = match[1];
      oldPauseId = match[2];
    }
  }
  if (!userId) return null;
  return {
    dataRichiesta: dataRichiestaMatch[1].trim(),
    dataRitorno: dataRitornoMatch[1].trim(),
    motivazione: motivazione || "—",
    userId,
    oldPauseId,
  };
}

function isPauseRequestMessage(content, components) {
  if (!content || !content.includes("ha richiesto una pausa")) return false;
  if (!components?.length) return false;
  const row = components[0];
  const first = row?.components?.[0];
  return first?.customId?.startsWith?.("pause_accept:") ?? false;
}

function buildPauseRequestButtonsRow(userId, pauseId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`pause_accept:${userId}:${pauseId}`)
      .setLabel("Accetta")
      .setEmoji("<:vegacheckmark:1443666279058772028>")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pause_reject:${userId}:${pauseId}`)
      .setLabel("Rifiuta")
      .setEmoji("<:vegax:1443934876440068179>")
      .setStyle(ButtonStyle.Danger),
  );
}

async function run() {
  const mongoUrl = getMongoUrl();
  const token = getDiscordToken();
  if (!mongoUrl) {
    console.error("MongoDB: imposta MONGO_URL o MONGODB_URI");
    process.exit(1);
  }
  if (!token) {
    console.error("Discord: imposta DISCORD_TOKEN o TOKEN");
    process.exit(1);
  }

  const limit = parseInt(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] || "100", 10) || 100;

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000, connectTimeoutMS: 10000 });
  console.log("Connesso a MongoDB.");

  const Staff = require(path.join(VINYLS, "Schemas", "Staff", "staffSchema"));
  const guildId = String(IDs.guilds?.main ?? "").trim();
  const pauseChannelId = String(IDs.channels?.pause ?? "").trim();
  if (!guildId || !pauseChannelId) {
    console.error("Config: guild main o canale pause non impostati nello script.");
    await mongoose.disconnect();
    process.exit(1);
  }

  const existingByMessageId = new Set();
  const docs = await Staff.find(
    { guildId, "pauses.requestMessageId": { $exists: true, $ne: null, $ne: "" } },
    { "pauses.requestMessageId": 1 },
  ).lean();
  for (const doc of docs || []) {
    const pauses = Array.isArray(doc.pauses) ? doc.pauses : [];
    for (const p of pauses) {
      if (p.requestMessageId) existingByMessageId.add(String(p.requestMessageId));
    }
  }
  console.log(`In DB ci sono già ${existingByMessageId.size} pause collegate a un messaggio.`);

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 15000);
  });
  console.log("Bot connesso a Discord.");

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.error("Guild non trovata.");
    client.destroy();
    await mongoose.disconnect();
    process.exit(1);
  }
  const channel = await guild.channels.fetch(pauseChannelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    console.error("Canale pause non trovato o non testo.");
    client.destroy();
    await mongoose.disconnect();
    process.exit(1);
  }

  const messages = await channel.messages.fetch({ limit });
  let created = 0;
  let skipped = 0;
  let errors = 0;

  for (const [, msg] of messages) {
    if (!msg.author?.bot) continue;
    if (!isPauseRequestMessage(msg.content, msg.components)) continue;
    if (existingByMessageId.has(msg.id)) {
      skipped++;
      continue;
    }
    const parsed = parsePauseMessage(msg.content, msg.components);
    if (!parsed) {
      console.warn(`[skip] Messaggio ${msg.id}: parsing fallito`);
      skipped++;
      continue;
    }
    const g = String(guildId).trim();
    const u = String(parsed.userId).trim();
    let stafferDoc = await Staff.findOne({ guildId: g, userId: u });
    if (!stafferDoc) stafferDoc = new Staff({ guildId: g, userId: u });
    if (!Array.isArray(stafferDoc.pauses)) stafferDoc.pauses = [];
    stafferDoc.pauses.push({
      dataRichiesta: parsed.dataRichiesta,
      dataRitorno: parsed.dataRitorno,
      motivazione: parsed.motivazione,
      status: "pending",
      requestChannelId: channel.id,
      requestMessageId: msg.id,
      createdAt: msg.createdAt ? new Date(msg.createdAt) : new Date(),
    });
    stafferDoc.markModified("pauses");
    try {
      await stafferDoc.save();
    } catch (err) {
      console.error(`[err] Messaggio ${msg.id} save:`, err?.message || err);
      errors++;
      continue;
    }
    const newPause = stafferDoc.pauses[stafferDoc.pauses.length - 1];
    const newPauseId = String(newPause?._id ?? "");
    if (!newPauseId) {
      errors++;
      continue;
    }
    try {
      await msg.edit({
        components: [buildPauseRequestButtonsRow(parsed.userId, newPauseId)],
      });
    } catch (editErr) {
      console.warn(`[warn] Messaggio ${msg.id} edit pulsanti:`, editErr?.message || editErr);
    }
    existingByMessageId.add(msg.id);
    created++;
    console.log(`[ok] Messaggio ${msg.id} → pause creata per userId ${parsed.userId}, _id ${newPauseId}`);
  }

  console.log(`\nFine: ${created} pause create, ${skipped} saltate (già in DB o non richieste), ${errors} errori.`);
  client.destroy();
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});