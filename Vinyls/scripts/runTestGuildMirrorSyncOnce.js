#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function loadEnv(p) {
  try {
    for (const line of fs.readFileSync(p, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t[0] === "#" || !t.includes("=")) continue;
      const i = t.indexOf("=");
      let v = t.slice(i + 1).trim();
      if ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[t.slice(0, i).trim()]) process.env[t.slice(0, i).trim()] = v;
    }
  } catch (_) {}
}

async function main() {
  const ROOT = path.resolve(__dirname, "..");
  loadEnv(path.join(ROOT, "..", ".env"));
  const { Client, GatewayIntentBits, Partials } = require(path.join(ROOT, "..", "node_modules", "discord.js"));
  const mongoose = require(path.join(ROOT, "..", "node_modules", "mongoose"));
  await mongoose.connect(process.env.MONGO_URL, { serverSelectionTimeoutMS: 12000 });
  const c = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    partials: [Partials.GuildMember],
  });
  await c.login(process.env.DISCORD_TOKEN_OFFICIAL);
  const { runTestGuildMirrorSync } = require("../Services/Partner/testGuildMirrorSyncService");
  const out = await runTestGuildMirrorSync(c, { force: true });
  console.log(JSON.stringify(out, null, 2));
  const {
    loadMaps,
    remapChannelIdForGuild,
    getTestGuildId,
  } = require("../Utils/Config/testGuildMirrorRemap");
  const maps = loadMaps();
  const IDs = require("../Utils/Config/ids");
  const testId = getTestGuildId();
  const mainPart = IDs.channels?.partnerships;
  const mapped = remapChannelIdForGuild(testId, mainPart);
  console.log(
    JSON.stringify({
      roleRemap: Object.keys(maps.roleRemap).length,
      channelRemap: Object.keys(maps.channelRemap).length,
      mainPartnerships: mainPart,
      testMappedPartnerships: mapped,
      remapped: mapped !== mainPart,
    }),
  );
  const { resolvePartnershipConfigSync } = require("../Utils/Partner/partnershipConfigResolver");
  const cfg = resolvePartnershipConfigSync(testId);
  console.log(
    JSON.stringify({
      testPartnershipsChannelId: cfg?.partnershipsChannelId,
      testLogs: cfg?.logsChannelId,
      testPmRole: cfg?.partnerManagerRoleId,
    }),
  );
  await c.destroy();
  await mongoose.disconnect();
  if (!out?.ok) process.exit(2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
