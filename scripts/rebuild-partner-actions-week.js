require("dotenv").config();

const axios = require("axios");
const mongoose = require("mongoose");
const { Client, GatewayIntentBits } = require("discord.js");
const config = require("../Vinyls/config.json");
const IDs = require("../Vinyls/Utils/Config/ids");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");
const { getPartnerLeaderboardWeekBoundsUtc } = require("../Vinyls/Services/Staff/weeklyStaffResocontoService");
const { countPartnerCreateActions } = require("../Vinyls/Utils/Staff/partnerPointsDisplayUtils");

const PARTNERSHIP_CHANNEL_ID = String(process.env.PARTNER_REBUILD_CHANNEL_ID || IDs.channels?.partnerships || "1442569193470824448").trim();
const GUILD_ID = String(process.env.PARTNER_REBUILD_GUILD_ID || IDs.guilds?.main || config.mainGuildId || "").trim();

function parseArgs(argv) {
  const out = { username: "", userId: "", apply: false };
  for (const raw of argv) {
    const arg = String(raw || "").trim();
    if (arg === "--apply") out.apply = true;
    else if (arg.startsWith("--username=")) out.username = arg.slice("--username=".length).trim();
    else if (arg.startsWith("--user-id=")) out.userId = arg.slice("--user-id=".length).trim();
    else if (arg === "--username" || arg === "-u") continue;
    else if (!out.username && !arg.startsWith("-")) out.username = arg;
  }
  if (!out.username && process.env.PARTNER_REBUILD_USERNAME) out.username = String(process.env.PARTNER_REBUILD_USERNAME).trim();
  if (!out.userId && process.env.PARTNER_REBUILD_USER_ID) out.userId = String(process.env.PARTNER_REBUILD_USER_ID).trim();
  return out;
}

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    config.mongoURL
  );
}

function extractInviteCode(text) {
  if (!text) return null;
  const patterns = [/discord\.gg\/([a-zA-Z0-9_-]+)/i, /discord\.com\/invite\/([a-zA-Z0-9_-]+)/i, /discordapp\.com\/invite\/([a-zA-Z0-9_-]+)/i];
  for (const pattern of patterns) {
    const match = String(text).match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function extractManagerId(text) {
  const match = String(text || "").match(/Manager:\s*<@!?(\d{16,20})>/i);
  return match?.[1] ? String(match[1]).trim() : "";
}

function isPartnerThankYouEmbed(message) {
  const embed = message?.embeds?.[0];
  if (!embed) return false;
  const title = String(embed.title || "");
  return /PARTNER EFFETTUATA/i.test(title);
}

function isPartnerContentMessage(message) {
  const content = String(message?.content || "");
  if (!content.trim()) return false;
  return /discord\.gg\/|discord(?:app)?\.com\/invite\//i.test(content) && /Manager:/i.test(content);
}

function authorMatchesMember(embedAuthor, member) {
  const authorName = String(embedAuthor?.name || "").trim().toLowerCase();
  if (!authorName || !member) return false;
  const candidates = [
    member.user?.username,
    member.user?.globalName,
    member.displayName,
    member.nickname,
  ]
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
  return candidates.includes(authorName);
}

async function resolveInviteGuildId(inviteCode, cache) {
  const code = String(inviteCode || "").trim().toLowerCase();
  if (!code) return "";
  if (cache.has(code)) return cache.get(code);
  let guildId = "";
  try {
    const res = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=false`, {
      timeout: 12000,
      headers: { Accept: "application/json" },
    });
    guildId = String(res?.data?.guild?.id || "").trim();
  } catch (_) {}
  cache.set(code, guildId);
  return guildId;
}

async function fetchChannelMessagesSince(channel, sinceMs, botId) {
  const collected = [];
  let before = undefined;
  let stop = false;
  for (let batchNo = 0; batchNo < 200 && !stop; batchNo += 1) {
    const options = { limit: 100 };
    if (before) options.before = before;
    const batch = await channel.messages.fetch(options).catch(() => null);
    if (!batch?.size) break;
    const arr = Array.from(batch.values());
    for (const msg of arr) {
      if (Number(msg.createdTimestamp || 0) < sinceMs) {
        stop = true;
        break;
      }
      if (String(msg.author?.id || "") === botId) collected.push(msg);
    }
    const oldest = batch.last();
    if (!oldest?.id) break;
    if (Number(oldest.createdTimestamp || 0) < sinceMs) break;
    before = oldest.id;
    if (batch.size < 100) break;
  }
  collected.sort((a, b) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0));
  return collected;
}

function collectContentIdsBeforeThankYou(messages, thankYouIndex, botId, gapMs) {
  const ids = [];
  const thankYouTs = Number(messages[thankYouIndex]?.createdTimestamp || 0);
  for (let i = thankYouIndex - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const ts = Number(msg?.createdTimestamp || 0);
    if (thankYouTs - ts > gapMs) break;
    if (isPartnerThankYouEmbed(msg)) break;
    if (String(msg.author?.id || "") !== botId) break;
    if (isPartnerContentMessage(msg)) ids.unshift(String(msg.id));
  }
  return ids;
}

async function scanPartnersFromChannel(channel, member, botId, weekStartMs, weekEndExclusiveMs) {
  const messages = await fetchChannelMessagesSince(channel, weekStartMs, botId);
  const partnerships = [];
  for (let i = 0; i < messages.length; i += 1) {
    const msg = messages[i];
    const ts = Number(msg.createdTimestamp || 0);
    if (ts >= weekEndExclusiveMs) continue;
    if (!isPartnerThankYouEmbed(msg)) continue;
    if (!authorMatchesMember(msg.embeds[0]?.author, member)) continue;
    const contentIds = collectContentIdsBeforeThankYou(messages, i, botId, 3 * 60 * 1000);
    const contentText = contentIds
      .map((id) => messages.find((m) => String(m.id) === id))
      .filter(Boolean)
      .map((m) => String(m.content || ""))
      .join("\n");
    const inviteCode = extractInviteCode(contentText);
    const managerId = extractManagerId(contentText);
    const partnerName = String(msg.embeds[0]?.footer?.text || "Server Sconosciuto").trim() || "Server Sconosciuto";
    const partnerMessageIds = contentIds.concat([String(msg.id)]);
    partnerships.push({
      action: "create",
      partner: partnerName,
      invite: inviteCode ? `https://discord.gg/${inviteCode}` : "",
      inviteCode,
      managerId: managerId || String(member.id),
      partnershipChannelId: PARTNERSHIP_CHANNEL_ID,
      partnerMessageIds,
      date: new Date(ts),
    });
  }
  return partnerships;
}

async function resolveTargetMember(guild, args) {
  if (/^\d{16,20}$/.test(String(args.userId || ""))) {
    const member = await guild.members.fetch(String(args.userId)).catch(() => null);
    if (member) return member;
    throw new Error(`Utente ${args.userId} non trovato nel server.`);
  }
  const query = String(args.username || "").trim();
  if (!query) throw new Error("Specifica --username= oppure --user-id=.");
  const fetched = await guild.members.fetch({ query, limit: 20 }).catch(() => null);
  const list = fetched ? Array.from(fetched.values()) : [];
  const exact = list.filter((m) => {
    const u = String(m.user?.username || "").toLowerCase();
    const g = String(m.user?.globalName || "").toLowerCase();
    const q = query.toLowerCase();
    return u === q || g === q;
  });
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`Username ambiguo "${query}": ${exact.map((m) => m.id).join(", ")}`);
  if (list.length === 1) return list[0];
  throw new Error(`Impossibile risolvere "${query}". Prova --user-id=`);
}

function isCreateInWeek(action, weekStartMs, weekEndExclusiveMs) {
  if (String(action?.action || "").toLowerCase() !== "create") return false;
  const when = action?.date ? new Date(action.date) : null;
  const ms = when && !Number.isNaN(when.getTime()) ? when.getTime() : NaN;
  if (!Number.isFinite(ms)) return false;
  return ms >= weekStartMs && ms < weekEndExclusiveMs;
}

function normalizeActionForDb(entry) {
  const out = {
    action: String(entry?.action || "create"),
    partner: String(entry?.partner || ""),
    invite: String(entry?.invite || ""),
    managerId: String(entry?.managerId || ""),
    partnershipChannelId: String(entry?.partnershipChannelId || PARTNERSHIP_CHANNEL_ID),
    partnerMessageIds: Array.isArray(entry?.partnerMessageIds) ? entry.partnerMessageIds.map(String) : [],
    date: entry?.date instanceof Date ? entry.date : new Date(entry?.date || Date.now()),
  };
  const pg = String(entry?.partnerGuildId || "").trim();
  if (/^\d{17,20}$/.test(pg)) out.partnerGuildId = pg;
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token =
    process.env.TOKEN ||
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.BOT_TOKEN;
  const mongoUrl = resolveMongoUrl();
  if (!token) throw new Error("TOKEN mancante nel .env");
  if (!mongoUrl) throw new Error("Mongo URL mancante nel .env");
  if (!/^\d{16,20}$/.test(GUILD_ID)) throw new Error(`Guild ID non valido: ${GUILD_ID}`);

  console.log("Mongo:", String(mongoUrl).replace(/\/\/[^@/]+@/, "//***@"));

  const weekBounds = getPartnerLeaderboardWeekBoundsUtc(new Date());
  const weekStartMs = weekBounds.weekStart.getTime();
  const weekEndExclusiveMs = weekBounds.weekEndExclusive.getTime();

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 10000 });
  console.log("Database:", mongoose.connection.db?.databaseName || "?");
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
  await client.login(token);

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const member = await resolveTargetMember(guild, args);
    const channel = await guild.channels.fetch(PARTNERSHIP_CHANNEL_ID);
    if (!channel?.isTextBased?.()) throw new Error(`Canale partnership non valido: ${PARTNERSHIP_CHANNEL_ID}`);

    const scanned = await scanPartnersFromChannel(channel, member, client.user.id, weekStartMs, weekEndExclusiveMs);
    const inviteCache = new Map();
    for (const row of scanned) {
      if (!row.inviteCode) continue;
      const guildId = await resolveInviteGuildId(row.inviteCode, inviteCache);
      if (/^\d{17,20}$/.test(guildId)) row.partnerGuildId = guildId;
      delete row.inviteCode;
    }

    const doc = await ActivityUserProfile.findOne({ guildId: GUILD_ID, userId: member.id })
      .select("staff.partnerCount staff.partnerActions staff.managerId")
      .lean();
    if (!doc) throw new Error("Documento ActivityUserProfile non trovato per l'utente.");
    const staff = doc.staff && typeof doc.staff === "object" ? doc.staff : {};
    const prevActions = Array.isArray(staff.partnerActions) ? staff.partnerActions.slice() : [];
    const prevWeekCreates = prevActions.filter((a) => isCreateInWeek(a, weekStartMs, weekEndExclusiveMs));
    const keptActions = prevActions.filter((a) => !isCreateInWeek(a, weekStartMs, weekEndExclusiveMs));
    const mergedActions = keptActions
      .concat(scanned.map(normalizeActionForDb))
      .sort((a, b) => {
      const ta = new Date(a?.date || 0).getTime();
      const tb = new Date(b?.date || 0).getTime();
      return ta - tb;
    });
    const nextPartnerCount = Math.max(Number(staff.partnerCount || 0), countPartnerCreateActions(mergedActions));
    const lastCreate = mergedActions.filter((a) => String(a?.action || "").toLowerCase() === "create").pop();

    console.log("=== REBUILD PARTNER ACTIONS (settimana corrente resoconto) ===");
    console.log(`Guild: ${GUILD_ID}`);
    console.log(`Canale: ${PARTNERSHIP_CHANNEL_ID}`);
    console.log(`Utente: ${member.user.username} (${member.id})`);
    console.log(`Settimana: ${weekBounds.weekStart.toISOString()} → ${weekBounds.weekEndExclusive.toISOString()} (exclusive end)`);
    console.log(`Partner trovate nel canale (questa settimana): ${scanned.length}`);
    console.log(`Create actions DB rimosse (settimana): ${prevWeekCreates.length}`);
    console.log(`Create actions DB dopo rebuild (totale array): ${countPartnerCreateActions(mergedActions)}`);
    console.log(`partnerCount: ${Number(staff.partnerCount || 0)} → ${nextPartnerCount}`);
    console.log("");
    scanned.forEach((row, idx) => {
      console.log(
        `${idx + 1}. ${row.date.toISOString()} | ${row.partner} | invite=${row.invite || "n/d"} | manager=${row.managerId} | msgs=${row.partnerMessageIds.join(",")}`,
      );
    });

    if (!args.apply) {
      console.log("");
      console.log("Dry-run: nessuna scrittura DB. Aggiungi --apply per salvare.");
      return;
    }

    const setDoc = {
      "staff.partnerActions": mergedActions,
      "staff.partnerCount": nextPartnerCount,
    };
    if (lastCreate?.managerId) setDoc["staff.managerId"] = String(lastCreate.managerId);

    const write = await ActivityUserProfile.updateOne(
      { guildId: GUILD_ID, userId: member.id },
      { $set: setDoc },
    );
    const verify = await ActivityUserProfile.findOne({ guildId: GUILD_ID, userId: member.id })
      .select("staff.partnerCount staff.partnerActions")
      .lean();
    const verifiedLen = Array.isArray(verify?.staff?.partnerActions) ? verify.staff.partnerActions.length : 0;
    console.log("");
    console.log(`Salvato nel DB (matched=${write.matchedCount}, modified=${write.modifiedCount}, actions verificate=${verifiedLen}).`);
    if (verifiedLen !== mergedActions.length) {
      throw new Error(`Verifica fallita: attese ${mergedActions.length} actions, trovate ${verifiedLen}`);
    }
  } finally {
    await client.destroy().catch(() => null);
    await mongoose.disconnect().catch(() => null);
  }
}

main().catch((err) => {
  console.error("[rebuild-partner-actions-week]", err?.message || err);
  process.exit(1);
});