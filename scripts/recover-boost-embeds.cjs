#!/usr/bin/env node
/**
 * Recovery manuale embed boost in #supporters.
 * Uso su VPS: node scripts/recover-boost-embeds.cjs [--hours 24]
 */
const fs = require("node:fs");
const path = require("node:path");
const { Client, GatewayIntentBits, Partials } = require("discord.js");

const root = path.resolve(__dirname, "..");

function loadToken() {
  const envPath = path.join(root, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  }
  const cfgPath = path.join(root, "Vinyls", "config.json");
  let cfgToken = "";
  if (fs.existsSync(cfgPath)) {
    const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    cfgToken = String(raw?.token || "").trim();
  }
  const token = String(
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.DISCORD_TOKEN ||
    cfgToken ||
    "",
  ).trim();
  if (!token) throw new Error("Token Discord mancante (.env DISCORD_TOKEN_OFFICIAL o Vinyls/config.json)");
  return token;
}

function parseHours(argv) {
  const i = argv.indexOf("--hours");
  if (i < 0) return 48;
  const n = Number(argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? n : 48;
}

const hours = parseHours(process.argv.slice(2));
const lookbackMs = Math.max(60 * 60 * 1000, hours * 60 * 60 * 1000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

client.once("ready", async () => {
  try {
    global.logger = console;
    const extras = require(path.join(root, "Vinyls", "Events", "guildMemberUpdate.js"));
    const result = await extras.recoverUnannouncedBoostersOnStartup(client, {
      lookbackMs,
      maxRecover: 50,
    });
    console.log("[recover-boost-embeds] done:", JSON.stringify(result));
  } catch (err) {
    console.error("[recover-boost-embeds] failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    client.destroy().catch(() => null);
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  }
});

client.login(loadToken()).catch((err) => {
  console.error("[recover-boost-embeds] login failed:", err?.message || err);
  process.exit(1);
});
