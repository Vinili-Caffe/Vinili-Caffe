#!/usr/bin/env node
/**
 * Backfill partner names for actions stored as "Server Sconosciuto".
 * Uses bot-token HTTP with hard timeouts (no hanging REST queue).
 */
const fs = require("fs");
const envPath = "/opt/bot/.env";
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
process.chdir("/opt/bot");

const axios = require("axios");
const mongoose = require("mongoose");
const { extractInviteCode } = require("../Utils/Partner/partnershipBlacklistDisplay");

const uri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL;
const token = String(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
const DELAY_MS = Math.max(2000, Number(process.env.PARTNER_NAME_BACKFILL_DELAY_MS) || 4000);
const LIMIT = Math.max(1, Number(process.env.PARTNER_NAME_BACKFILL_LIMIT) || 80);

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isPlaceholderName(name) {
  const n = String(name || "").trim();
  return !n || /^server\s+sconosciuto$/i.test(n) || /^partner$/i.test(n);
}

async function fetchInvite(code) {
  const res = await axios.get(`https://discord.com/api/v10/invites/${encodeURIComponent(code)}?with_counts=true`, {
    timeout: 8000,
    headers: {
      Accept: "application/json",
      Authorization: `Bot ${token}`,
    },
    validateStatus: () => true,
  });
  if (res.status === 429) {
    const retry = Math.max(5, Math.min(120, Number(res.headers?.["retry-after"]) || 20));
    return { rateLimited: true, retryAfter: retry };
  }
  if (res.status !== 200 || !res.data?.guild?.id) {
    return { missing: true, status: res.status };
  }
  return {
    guildId: String(res.data.guild.id),
    guildName: String(res.data.guild.name || "").trim() || null,
  };
}

(async () => {
  if (!token) throw new Error("missing DISCORD_TOKEN");
  console.log("start", new Date().toISOString(), { LIMIT, DELAY_MS });
  await mongoose.connect(uri);
  const aup = mongoose.connection.db.collection("activityuserprofiles");

  const docs = await aup
    .find({ "staff.partnerActions.0": { $exists: true } })
    .project({ guildId: 1, userId: 1, "staff.partnerActions": 1 })
    .toArray();

  let scanned = 0;
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  const cache = new Map();

  outer: for (const doc of docs) {
    const actions = Array.isArray(doc.staff?.partnerActions) ? doc.staff.partnerActions : [];
    let dirty = false;
    for (const action of actions) {
      if (!action || String(action.action || "").toLowerCase() !== "create") continue;
      if (!isPlaceholderName(action.partner)) continue;
      const invite = String(action.invite || "").trim();
      const code =
        (invite.match(/discord(?:app)?\.com\/invite\/([a-zA-Z0-9-]+)/i) ||
          invite.match(/discord\.gg\/([a-zA-Z0-9-]+)/i) ||
          [])[1] || null;
      if (!code) {
        skipped += 1;
        continue;
      }
      if (scanned >= LIMIT) break outer;
      scanned += 1;

      let meta = cache.get(code.toLowerCase());
      if (meta === undefined) {
        let attempt = 0;
        for (;;) {
          attempt += 1;
          const result = await fetchInvite(code);
          if (result.rateLimited) {
            console.log("429", code, "wait", result.retryAfter, "s");
            await wait(result.retryAfter * 1000);
            if (attempt >= 5) {
              meta = null;
              failed += 1;
              break;
            }
            continue;
          }
          if (result.missing || !result.guildName) {
            console.log("miss", code, result.status || "");
            meta = null;
            failed += 1;
          } else {
            meta = { guildId: result.guildId, guildName: result.guildName };
            console.log("ok", code, "->", meta.guildName);
          }
          break;
        }
        cache.set(code.toLowerCase(), meta);
        await wait(DELAY_MS);
      }

      if (!meta?.guildName) {
        skipped += 1;
        continue;
      }
      action.partner = meta.guildName;
      if (!action.partnerGuildId) action.partnerGuildId = meta.guildId;
      dirty = true;
      updated += 1;
    }
    if (dirty) {
      await aup.updateOne({ _id: doc._id }, { $set: { "staff.partnerActions": actions } });
    }
  }

  console.log("done", { scanned, updated, failed, skipped, cached: cache.size });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
