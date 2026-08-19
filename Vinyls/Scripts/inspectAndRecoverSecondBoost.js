/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  for (const p of ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
    break;
  }
}

async function main() {
  loadEnv();
  const mongoose = require("mongoose");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (mongoUrl) await mongoose.connect(mongoUrl);

  const { Client, GatewayIntentBits } = require("discord.js");
  const IDs = require("../Utils/Config/ids");
  const { recoverMissingBoostEmbedsForUser } = require("../Events/guildMemberUpdate");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  await client.login(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL);
  await new Promise((r) => client.once("ready", r));

  const guild = await client.guilds.fetch(IDs.guilds.main);
  const chIds = [IDs.channels.supporters, guild.systemChannelId, guild.publicUpdatesChannelId].filter(Boolean);
  const lookbackMs = 8 * 60 * 60 * 1000;
  const minTs = Date.now() - lookbackMs;
  const singleEmbedUsers = new Set();
  const doubleEmbedUsers = new Set();
  const nativeDouble = new Map();

  for (const id of chIds) {
    const ch = await guild.channels.fetch(String(id)).catch(() => null);
    if (!ch?.isTextBased?.()) continue;
    console.log("CHANNEL", id, ch.name);
    const msgs = await ch.messages.fetch({ limit: 40 });
    for (const m of msgs.values()) {
      if (Number(m.createdTimestamp || 0) < minTs) continue;
      const content = String(m.content || "");
      const desc = String(m.embeds?.[0]?.description || "");
      const text = `${content}\n${desc}`;

      const plain = content.replace(/\*/g, " ").replace(/\s+/g, " ");
      if (/ha\s+appena\s+potenziato\s+il\s+server|just\s+boosted\s+the\s+server/i.test(plain) || (Number(m.type) >= 8 && Number(m.type) <= 11)) {
        const slots =
          /\b2\s+volte\b|\bdue\s+volte\b|\btwice\b/i.test(plain)
            ? 2
            : Number((plain.match(/\b(\d{1,2})\s+volte\b/i) || plain.match(/\b(\d{1,2})\s+times\b/i) || (/^\d{1,2}$/.test(plain) ? [plain, plain] : []))[1] || 1);
        let uid = m.mentions?.users?.first()?.id || null;
        if (!uid) {
          const mm = content.match(/<@!?(\d{5,30})>/);
          uid = mm ? mm[1] : null;
        }
        // Discord system boost messages often use message.author as the booster.
        if (!uid && m.author && !m.author.bot) uid = m.author.id;
        console.log("NATIVE", new Date(m.createdTimestamp).toISOString(), "slots=", slots, "uid=", uid, content.slice(0, 100));
        if (uid && slots >= 2) nativeDouble.set(String(uid), Number(m.createdTimestamp));
      }

      if (String(m.author?.id) === String(client.user.id) && /GRAZIE|boost/i.test(text)) {
        const um = content.match(/<@!?(\d{5,30})>/);
        const uid = um ? um[1] : null;
        if (!uid) continue;
        if (/DOPPIO\s+BOOST/i.test(desc)) doubleEmbedUsers.add(uid);
        else if (/PER IL BOOST/i.test(desc)) singleEmbedUsers.add(uid);
        console.log("BOT EMBED", new Date(m.createdTimestamp).toISOString(), uid, /DOPPIO/i.test(desc) ? "DOUBLE" : "SINGLE");
      }
    }
  }

  const needSecond = new Set();
  for (const uid of singleEmbedUsers) {
    if (!doubleEmbedUsers.has(uid)) needSecond.add(uid);
  }
  for (const uid of nativeDouble.keys()) needSecond.add(uid);

  console.log("needSecond", [...needSecond]);
  for (const uid of needSecond) {
    if (doubleEmbedUsers.has(uid)) {
      console.log("skip already has double", uid);
      continue;
    }
    const startedAt = nativeDouble.get(uid) || Date.now() - 60 * 60 * 1000;
    const result = await recoverMissingBoostEmbedsForUser(guild, uid, {
      knownNativeSlots: 2,
      expectedSlots: 2,
      startedAt: startedAt - 2000,
      nativeLookbackMs: lookbackMs,
      allowSecondRecovery: true,
      maxSend: 1,
    });
    console.log("recover", uid, result);
  }

  await client.destroy();
  if (mongoose.connection?.readyState) await mongoose.disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
