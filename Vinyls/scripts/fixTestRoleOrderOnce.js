#!/usr/bin/env node
/**
 * Reorder test-guild roles to match main (relative order).
 * Does not delete roles. Only moves roles below the bot's highest role.
 *
 *   node fixTestRoleOrderOnce.js
 *   node fixTestRoleOrderOnce.js --apply
 */
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const ROOT = path.resolve(__dirname, "..");
  loadEnv(path.join(ROOT, "..", ".env"));
  loadEnv(path.join(ROOT, ".env"));
  const apply = process.argv.includes("--apply");

  const { Client, GatewayIntentBits } = require(path.join(ROOT, "..", "node_modules", "discord.js"));
  const IDs = require(path.join(ROOT, "Utils/Config/ids"));

  const c = new Client({ intents: [GatewayIntentBits.Guilds] });
  await c.login(process.env.DISCORD_TOKEN_OFFICIAL);
  const main = await c.guilds.fetch(IDs.guilds.main);
  const test = await c.guilds.fetch(IDs.guilds.test);
  await Promise.all([main.roles.fetch(), test.roles.fetch()]);
  const me = await test.members.fetchMe();
  const botHighest = me.roles.highest;

  const editable = [...test.roles.cache.values()].filter((r) => {
    if (r.id === test.id) return false;
    if (r.managed) return false;
    if (r.id === botHighest.id) return false;
    try {
      return botHighest.comparePositionTo(r) > 0;
    } catch {
      return false;
    }
  });

  const testByName = new Map();
  for (const r of editable) {
    if (!testByName.has(r.name)) testByName.set(r.name, r);
  }

  const mainAsc = [...main.roles.cache.values()]
    .filter((r) => r.id !== main.id && !r.managed)
    .sort((a, b) => a.position - b.position);

  const desiredAsc = [];
  const seen = new Set();
  for (const src of mainAsc) {
    const dest = testByName.get(src.name);
    if (!dest || seen.has(dest.id)) continue;
    desiredAsc.push(dest);
    seen.add(dest.id);
  }
  const extras = editable.filter((r) => !seen.has(r.id)).sort((a, b) => a.position - b.position);
  const finalAsc = [...extras, ...desiredAsc];

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY",
        editable: editable.length,
        fromMain: desiredAsc.length,
        extras: extras.length,
        bot: { name: botHighest.name, pos: botHighest.position },
        aboveBot: [...test.roles.cache.values()]
          .filter((r) => r.id !== test.id && botHighest.comparePositionTo(r) <= 0)
          .map((r) => ({ name: r.name, pos: r.position, managed: r.managed })),
        previewTop: finalAsc
          .slice(-12)
          .reverse()
          .map((r) => r.name),
        previewBottom: finalAsc.slice(0, 8).map((r) => r.name),
      },
      null,
      2,
    ),
  );

  if (!apply) {
    await c.destroy();
    return;
  }

  const positions = finalAsc.map((r, idx) => ({ role: r.id, position: idx + 1 }));
  try {
    await test.roles.setPositions(positions);
    console.log("setPositions_ok", positions.length);
  } catch (e) {
    console.log("setPositions_bulk_fail", e.message || e);
    for (let i = finalAsc.length - 1; i >= 0; i -= 1) {
      const role = finalAsc[i];
      const targetPos = i + 1;
      try {
        if (role.position !== targetPos) {
          await role.setPosition(targetPos, { reason: "fixTestRoleOrderOnce" });
          await sleep(250);
        }
      } catch (err) {
        console.log("fail", role.name, err.message || err);
      }
    }
  }

  await test.roles.fetch();
  const top = [...test.roles.cache.values()]
    .filter((r) => r.id !== test.id)
    .sort((a, b) => b.position - a.position)
    .slice(0, 15)
    .map((r) => ({ name: r.name, pos: r.position }));
  const bottom = [...test.roles.cache.values()]
    .filter((r) => r.id !== test.id)
    .sort((a, b) => a.position - b.position)
    .slice(0, 10)
    .map((r) => ({ name: r.name, pos: r.position }));

  const mainOrder = mainAsc.map((r) => r.name);
  const testPos = Object.fromEntries([...test.roles.cache.values()].map((r) => [r.name, r.position]));
  let inv = 0;
  for (let i = 0; i < mainOrder.length; i += 1) {
    for (let j = i + 1; j < mainOrder.length; j += 1) {
      const a = mainOrder[i];
      const b = mainOrder[j];
      if (testPos[a] == null || testPos[b] == null) continue;
      if (testPos[a] > testPos[b]) inv += 1;
    }
  }
  console.log(JSON.stringify({ top, bottom, inversions: inv }, null, 2));
  await c.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
