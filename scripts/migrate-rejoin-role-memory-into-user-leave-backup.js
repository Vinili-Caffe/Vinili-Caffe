/**
 * Copia `rejoinrolememories` → `userleavebackups.rejoinTrackedRoleIds` (merge se il backup esiste).
 *
 *   node scripts/migrate-rejoin-role-memory-into-user-leave-backup.js
 *   node scripts/migrate-rejoin-role-memory-into-user-leave-backup.js --apply
 *   node scripts/migrate-rejoin-role-memory-into-user-leave-backup.js --apply --drop-old-collection
 */
const path = require("path");
const mongoose = require("mongoose");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getMongoUrl } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const config = require(path.join(BOT_ROOT, "config.json"));

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 7;

function parseArgs(argv) {
  const raw = argv.slice(2);
  const flags = new Set(raw.filter((a) => !String(a).includes("=")));
  const findValue = (prefix) => {
    const hit = raw.find((arg) => String(arg || "").startsWith(`${prefix}=`));
    return hit ? String(hit.slice(prefix.length + 1)).trim() : "";
  };
  return {
    apply: flags.has("--apply"),
    dropOld: flags.has("--drop-old-collection"),
    mongoUrl: findValue("--mongo-url"),
  };
}

function uniqStrings(arr) {
  return Array.from(
    new Set((Array.isArray(arr) ? arr : []).map((id) => String(id || "").trim()).filter(Boolean)),
  );
}

async function main() {
  const args = parseArgs(process.argv);
  const mongoUrl = args.mongoUrl || getMongoUrl(config);
  if (!mongoUrl) {
    console.error("Manca l'URL Mongo (config/env o --mongo-url=...).");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  const memCol = mongoose.connection.collection("rejoinrolememories");
  const backupCol = mongoose.connection.collection("userleavebackups");

  const memories = await memCol.find({}).toArray();
  console.log(args.apply ? "[APPLY]" : "[DRY-RUN]", "documenti in rejoinrolememories:", memories.length);

  const expiry = new Date(Date.now() + DEFAULT_RETENTION_DAYS * DAY_MS);

  for (const m of memories) {
    const guildId = String(m.guildId || "").trim();
    const userId = String(m.userId || "").trim();
    const fromMem = uniqStrings(m.roleIds);
    if (!guildId || !userId || fromMem.length === 0) continue;

    const existing = await backupCol.findOne({ guildId, userId });
    const merged = uniqStrings([...(Array.isArray(existing?.rejoinTrackedRoleIds) ? existing.rejoinTrackedRoleIds : []), ...fromMem]);

    if (!args.apply) {
      console.log("  would merge", guildId, userId, "roles", merged.length);
      continue;
    }

    if (existing) {
      await backupCol.updateOne({ guildId, userId }, { $set: { rejoinTrackedRoleIds: merged } });
    } else {
      await backupCol.insertOne({
        guildId,
        userId,
        backupDoc: null,
        restoreRoleIds: [],
        rejoinTrackedRoleIds: fromMem,
        leftAt: new Date(),
        expiresAt: expiry,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  if (args.apply && args.dropOld && memories.length > 0) {
    const r = await memCol.drop().catch((e) => ({ error: e }));
    if (r?.error) console.error("drop rejoinrolememories:", r.error.message || r.error);
    else console.log("drop rejoinrolememories: ok");
  }

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});