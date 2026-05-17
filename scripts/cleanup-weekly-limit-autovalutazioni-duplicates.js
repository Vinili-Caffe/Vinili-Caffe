require("dotenv").config();

const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const config = require("../Vinyls/config.json");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL
  );
}

function reasonIncludes(reason, needles) {
  const normalized = String(reason || "").toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function collectMessages(entries) {
  const out = [];
  for (const entry of entries || []) {
    const channelId = String(entry?.channelId || "").trim();
    const messageId = String(entry?.messageId || "").trim();
    if (/^\d{16,20}$/.test(channelId) && /^\d{16,20}$/.test(messageId)) {
      out.push({ channelId, messageId });
    }
  }
  return out;
}

async function deleteMessages(client, messages) {
  let deleted = 0;
  for (const msgRef of messages) {
    const channel = await client.channels.fetch(msgRef.channelId).catch(() => null);
    if (!channel?.messages?.fetch) continue;
    const message = await channel.messages.fetch(msgRef.messageId).catch(() => null);
    if (await message?.delete?.().then(() => true).catch(() => false)) deleted += 1;
  }
  return deleted;
}

function cleanupKind(staff, kind) {
  const isNegative = kind === "negative";
  const reasonsKey = isNegative ? "negativeReasons" : "positiveReasons";
  const countKey = isNegative ? "negativeCount" : "positiveCount";
  const valutazioniKey = isNegative ? "negativeValutazioni" : "positiveValutazioni";
  const manualNeedles = isNegative
    ? ["limiti settimanali non rispettati"]
    : ["limiti settimanali rispettati"];
  const autoNeedles = isNegative
    ? ["limiti settimanali non raggiunti"]
    : ["limiti settimanali completati"];

  const reasons = Array.isArray(staff?.[reasonsKey]) ? staff[reasonsKey] : [];
  const hasManualEquivalent = reasons.some((reason) => reasonIncludes(reason, manualNeedles));
  if (!hasManualEquivalent) return { removed: 0, messages: [] };

  const messages = [];
  const valutazioni = Array.isArray(staff?.[valutazioniKey]) ? staff[valutazioniKey] : [];
  const autoValutazioni = Array.isArray(staff?.autoValutazioni) ? staff.autoValutazioni : [];
  const removedReasons = reasons.filter((reason) => reasonIncludes(reason, autoNeedles));
  if (!removedReasons.length) return { removed: 0, messages: [] };

  messages.push(...collectMessages(valutazioni.filter((entry) => reasonIncludes(entry?.reason, autoNeedles))));
  messages.push(...collectMessages(autoValutazioni.filter((entry) =>
    String(entry?.type || "") === kind && reasonIncludes(entry?.reason, autoNeedles)
  )));

  staff[reasonsKey] = reasons.filter((reason) => !reasonIncludes(reason, autoNeedles));
  staff[valutazioniKey] = valutazioni.filter((entry) => !reasonIncludes(entry?.reason, autoNeedles));
  staff.autoValutazioni = autoValutazioni.filter((entry) =>
    !(String(entry?.type || "") === kind && reasonIncludes(entry?.reason, autoNeedles))
  );
  staff[countKey] = Math.max(0, Number(staff[countKey] || 0) - removedReasons.length);
  staff.valutazioniCount = Math.max(0, Number(staff.valutazioniCount || 0) - removedReasons.length);

  return { removed: removedReasons.length, messages };
}

async function main() {
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || config.token;
  const mongoUrl = resolveMongoUrl();
  if (!token) throw new Error("Token Discord mancante.");
  if (!mongoUrl) throw new Error("Mongo URL mancante.");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 15000 });
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve) => client.once("ready", resolve));

  const docs = await ActivityUserProfile.find({ staff: { $exists: true } });
  let docsTouched = 0;
  let removed = 0;
  let deletedMessages = 0;

  for (const doc of docs) {
    const staff = doc.staff;
    if (!staff) continue;
    const positive = cleanupKind(staff, "positive");
    const negative = cleanupKind(staff, "negative");
    const totalRemoved = positive.removed + negative.removed;
    if (!totalRemoved) continue;
    doc.markModified("staff");
    await doc.save();
    docsTouched += 1;
    removed += totalRemoved;
    deletedMessages += await deleteMessages(client, [...positive.messages, ...negative.messages]);
  }

  client.destroy();
  await mongoose.disconnect();
  console.log(`CLEANUP_WEEKLY_LIMIT_AUTOVALUTAZIONI_DUPLICATES_OK docs=${docsTouched} removed=${removed} deletedMessages=${deletedMessages}`);
}

main().catch(async (err) => {
  console.error(err?.stack || err?.message || err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});