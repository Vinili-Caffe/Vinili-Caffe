/**
 * One-shot: +150 punti casa a Tassorosso (boost torre mancato).
 * Run on server: node /tmp/_tmp_credit_hufflepuff_tower_boost.js
 */
const path = require("path");
const fs = require("fs");
const botRoot = process.env.VC_BOT_ROOT || "/opt/bot/Vinyls";
const repoRoot = path.resolve(botRoot, "..");
process.chdir(botRoot);
module.paths.unshift(path.join(repoRoot, "node_modules"));
module.paths.unshift(path.join(botRoot, "node_modules"));

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]]) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
loadEnvFile(path.join(repoRoot, ".env"));
loadEnvFile(path.join(botRoot, ".env"));

const mongoose = require("mongoose");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require(path.join(botRoot, "Schemas/Community/communitySchemas"));
const { housePointPeriodKey } = require(path.join(botRoot, "Utils/Web/hogwartsHousePointPeriods"));
const IDs = require(path.join(botRoot, "Utils/Config/ids"));

const HOUSE = "hufflepuff";
const POINTS = 150;
const GAME = "hogwartsObservationTower";
const OWNER = "__event__";
const TARGET_TOTAL = 300; // base 150 + boost ×2

async function main() {
  const mongo = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!mongo) throw new Error("Missing MONGO_URI");
  await mongoose.connect(mongo);
  const guildId = String(IDs.guilds?.main || process.env.VC_GUILD_ID || "").trim();
  if (!guildId) throw new Error("Missing guild id");

  let eventKey = "hogwarts";
  try {
    const cfg = require(path.join(botRoot, "config.json"));
    eventKey = String(cfg?.hogwartsEvent?.eventKey || eventKey).trim() || eventKey;
  } catch (_) {}

  const now = new Date();
  const periodKey = String(housePointPeriodKey(now.getTime())?.key || "").trim();

  const before = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
    guildId,
    userId: OWNER,
    dedupeKey: eventKey,
  })
    .select("rawWebhook.totals rawWebhook.total")
    .lean();
  const current = Math.max(0, Math.floor(Number(before?.rawWebhook?.totals?.[HOUSE]) || 0));
  const need = Math.max(0, TARGET_TOTAL - current);
  if (need <= 0) {
    console.log(JSON.stringify({ ok: true, skipped: true, current, target: TARGET_TOTAL }, null, 2));
    await mongoose.disconnect();
    return;
  }
  const credit = need;
  const inc = {
    [`rawWebhook.byGame.${GAME}`]: credit,
    "rawWebhook.total": credit,
    [`rawWebhook.totals.${HOUSE}`]: credit,
  };
  if (periodKey) inc[`rawWebhook.byPeriod.${periodKey}.${HOUSE}`] = credit;

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
      guildId,
      userId: OWNER,
      dedupeKey: eventKey,
    },
    {
      $setOnInsert: {
        docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
        guildId,
        userId: OWNER,
        dedupeKey: eventKey,
        createdBy: "manual_tower_boost_backfill",
        status: "active",
      },
      $set: {
        planKey: "hogwarts_house_points",
        "rawWebhook.eventKey": eventKey,
        "rawWebhook.updatedAt": now,
      },
      $inc: inc,
    },
    { upsert: true, new: true },
  ).lean();

  console.log(
    JSON.stringify(
      {
        ok: true,
        guildId,
        eventKey,
        periodKey,
        credited: credit,
        house: HOUSE,
        before: current,
        after: updated?.rawWebhook?.totals?.[HOUSE] ?? null,
        totalAfter: updated?.rawWebhook?.total ?? null,
        target: TARGET_TOTAL,
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exit(1);
});
