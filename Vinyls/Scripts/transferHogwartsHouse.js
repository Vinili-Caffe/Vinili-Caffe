#!/usr/bin/env node
/**
 * Trasferisce uno smistato in un'altra casata: tiene galeoni/inventario/progressi,
 * sposta i suoi punti Coppa e ripubblica l'annuncio di smistamento nella nuova sala.
 *
 *   node Vinyls/Scripts/transferHogwartsHouse.js --user 778934882671656972 --house tassorosso
 */
"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.resolve(__dirname, "../../.env")];
  for (const p of candidates) {
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

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return "";
  return String(process.argv[idx + 1] || "").trim();
}

async function main() {
  loadEnv();
  const userId = argValue("--user");
  const house = argValue("--house") || argValue("--to");
  if (!userId || !house) {
    throw new Error("Uso: node Vinyls/Scripts/transferHogwartsHouse.js --user <id> --house tassorosso");
  }

  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.TOKEN ||
    process.env.VINYLS_TOKEN;
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!token) throw new Error("missing bot token");
  if (!mongoUrl) throw new Error("missing mongo");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);

  const { Client } = require("discord.js");
  const vinylsConfig = require("../config.json");
  const IDs = require("../Utils/Config/ids");
  const { transferSortedMemberToHouse } = require("../Services/Community/hogwartsHouseAdminService");

  const client = new Client({ intents: [] });
  client.token = token;
  client.rest.setToken(token);
  client.config = vinylsConfig;

  const guildId = String(client.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) throw new Error("missing main guild id");

  const guild = await client.guilds.fetch(guildId);
  const result = await transferSortedMemberToHouse(client, guild, userId, house, {
    announce: true,
    force: process.argv.includes("--force"),
  });
  console.log(JSON.stringify(result, null, 2));
  if (!result?.ok) process.exitCode = 1;

  await mongoose.disconnect().catch(() => null);
  client.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
