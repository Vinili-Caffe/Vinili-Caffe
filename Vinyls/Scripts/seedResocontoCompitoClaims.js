/*!
 * One-shot: blocca Compito helper (e revisori assegnati) per la weekKey corrente.
 * Uso: node Vinyls/Scripts/seedResocontoCompitoClaims.js
 */
const path = require("path");
const fs = require("fs");

function loadEnv() {
  const envPath = path.resolve(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim().replace(/\r/g, "");
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

async function main() {
  loadEnv();
  const mongo = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!mongo) throw new Error("Missing MONGO_URL");
  const mongoose = require("mongoose");
  await mongoose.connect(mongo, { maxPoolSize: 2, serverSelectionTimeoutMS: 12000 });

  const { getResocontoCycleWeekKey } = require("../Services/Staff/weeklyStaffResocontoService");
  const { getResocontoReviewerUserIdsForSegment } = require("../Utils/Staff/resocontoAccess");
  const { getBotState, setBotState } = require("../Utils/BotState/botStateStore");

  const weekKey = getResocontoCycleWeekKey();
  const segments = ["pm", "helper", "mod", "senior_moderator", "director"];
  const state = await getBotState("resocontoCompitoClaimsV1", { claims: {} });
  const claims = { ...(state?.claims || {}) };
  let added = 0;
  for (const segment of segments) {
    for (const userId of getResocontoReviewerUserIdsForSegment(segment)) {
      const id = `${weekKey}:${segment}:${userId}`;
      if (claims[id]) continue;
      claims[id] = { at: Date.now(), seeded: true };
      added += 1;
      console.log("seed", id);
    }
  }
  await setBotState("resocontoCompitoClaimsV1", { claims });
  console.log("weekKey", weekKey, "added", added, "total", Object.keys(claims).length);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
