/**
 * Allinea totalExp al level corrente su ExpUser.
 *
 * Caso tipico: level modificato manualmente nel DB ma totalExp rimasto vecchio.
 * Questo script porta totalExp almeno alla soglia minima del level attuale,
 * così il prossimo level-up parte dal valore corretto.
 *
 * Uso:
 *   node scripts/sync-totalexp-from-level.js
 *   node scripts/sync-totalexp-from-level.js --guild=1329080093599076474
 *   node scripts/sync-totalexp-from-level.js --user=123456789012345678
 *   node scripts/sync-totalexp-from-level.js --dry-run
 *   node scripts/sync-totalexp-from-level.js --atlas
 *   node scripts/sync-totalexp-from-level.js --exact   // imposta totalExp esatto della soglia livello
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const IDs = require("../Vinyls/Utils/Config/ids");
const { ExpUser } = require("../Vinyls/Schemas/Community/communitySchemas");
const { getTotalExpForLevel, getLevelInfo } = require("../Vinyls/Services/Community/expService");
const { isValidGuildUserId } = require("../Vinyls/Utils/DB/validateWriteIds");

const DEFAULT_GUILD_ID = IDs.guilds?.main || "1329080093599076474";

function getArg(name, fallback = "") {
  const hit = process.argv.find((a) => String(a).startsWith(`--${name}=`));
  if (!hit) return fallback;
  return String(hit.split("=").slice(1).join("=")).trim();
}

function resolveMongoUrl() {
  if (process.argv.includes("--atlas")) return process.env.MONGO_URL || process.env.MONGODB_URI;
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI
  );
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const exact = process.argv.includes("--exact");
  const guildId = String(getArg("guild", String(DEFAULT_GUILD_ID)));
  const userId = String(getArg("user", ""));

  const mongoUrl = resolveMongoUrl();
  if (!mongoUrl) throw new Error("Mongo URL mancante");

  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 5000, connectTimeoutMS: 5000 });

  const query = { guildId: String(guildId) };
  if (userId) query.userId = String(userId);

  const rows = await ExpUser.find(query).select("guildId userId level totalExp").lean().catch(() => []);
  let scanned = 0;
  let updated = 0;
  let skippedInvalid = 0;
  let skippedAlreadyAligned = 0;
  const ops = [];

  for (const row of rows) {
    scanned += 1;
    const gid = String(row?.guildId || "");
    const uid = String(row?.userId || "");
    if (!isValidGuildUserId(gid, uid)) {
      skippedInvalid += 1;
      continue;
    }

    const level = Math.max(0, Math.floor(Number(row?.level || 0)));
    const oldTotal = Math.max(0, Math.floor(Number(row?.totalExp || 0)));
    const minExp = Math.max(0, Number(getTotalExpForLevel(level) || 0));
    const nextTotal = exact ? minExp : Math.max(oldTotal, minExp);
    const nextLevel = getLevelInfo(nextTotal).level;

    if (nextTotal === oldTotal && nextLevel === level) {
      skippedAlreadyAligned += 1;
      continue;
    }

    updated += 1;
    if (!dryRun) {
      ops.push({
        updateOne: {
          filter: { guildId: gid, userId: uid },
          update: { $set: { totalExp: nextTotal, level: nextLevel } },
        },
      });
    }
  }

  if (!dryRun && ops.length) {
    await ExpUser.bulkWrite(ops, { ordered: false }).catch(() => null);
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        exact,
        guildId,
        userId: userId || null,
        scanned,
        updated,
        skippedInvalid,
        skippedAlreadyAligned,
      },
      null,
      2,
    ),
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});