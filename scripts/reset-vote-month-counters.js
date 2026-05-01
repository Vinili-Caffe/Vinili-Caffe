/**
 * Azzera i contatori voti mensili (Top.gg + Discadia) e imposta voteCountMonthKey (Europe/Rome).
 *
 * Uso (solo lettura, stampa conteggi):
 *   node scripts/reset-vote-month-counters.js
 *
 * Esecuzione reale su tutti i profili del main guild con dati voti:
 *   node scripts/reset-vote-month-counters.js --apply
 *
 * Solo un utente:
 *   node scripts/reset-vote-month-counters.js --apply --user-id=DISCORD_USER_ID
 *
 * Mese esplicito (default = mese Rome corrente):
 *   node scripts/reset-vote-month-counters.js --apply --month-key=2026-02
 *
 * DB remoto:
 *   node scripts/reset-vote-month-counters.js --apply --mongo-url="mongodb+srv://..."
 */
const path = require("path");
const mongoose = require("mongoose");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const BOT_ROOT = path.join(WORKSPACE_ROOT, "Vinyls");

const { loadEnvFiles } = require(path.join(WORKSPACE_ROOT, "shared", "runtime", "fsRuntime"));
const { getMongoUrl } = require(path.join(WORKSPACE_ROOT, "shared", "config", "env"));

loadEnvFiles(BOT_ROOT);

const IDs = require(path.join(BOT_ROOT, "Utils", "Config", "ids"));
const config = require(path.join(BOT_ROOT, "config.json"));
const { voteCountMonthKeyRome } = require(path.join(BOT_ROOT, "Utils", "romeVoteMonthKey"));

const ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";

function parseArgs(argv) {
  const raw = argv.slice(2);
  const flags = new Set(raw.filter((a) => !String(a).includes("=")));
  const findValue = (prefix) => {
    const hit = raw.find((arg) => String(arg || "").startsWith(`${prefix}=`));
    return hit ? String(hit.slice(prefix.length + 1)).trim() : "";
  };
  return {
    apply: flags.has("--apply"),
    mongoUrl: findValue("--mongo-url"),
    userId: findValue("--user-id"),
    guildId: findValue("--guild-id"),
    monthKey: findValue("--month-key"),
    limit: Math.min(5000, Math.max(1, Number(findValue("--limit")) || 0)),
    verbose: flags.has("--verbose"),
  };
}

function resolveMongoUrl(args) {
  if (args.mongoUrl) return args.mongoUrl;
  return getMongoUrl(config);
}

function buildFilter(guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const base = {
    guildId: gid,
    $or: [
      { [`${ROOT}.voteCountTopgg`]: { $gte: 1 } },
      { [`${ROOT}.voteCountDiscadia`]: { $gte: 1 } },
      { [`${ROOT}.voteCount`]: { $gte: 1 } },
      { [`${ROOT}.voteCountMonthKey`]: { $type: "string", $nin: ["", null] } },
    ],
  };
  if (uid) base.userId = uid;
  return base;
}

function buildUpdate(monthKey) {
  const mk = String(monthKey || "").trim();
  if (!/^\d{4}-\d{2}$/.test(mk)) throw new Error(`month-key non valido: ${mk}`);
  return {
    $set: {
      [`${ROOT}.voteCountMonthKey`]: mk,
      [`${ROOT}.voteCountTopgg`]: 0,
      [`${ROOT}.voteCountDiscadia`]: 0,
    },
    $unset: {
      [`${ROOT}.voteCount`]: "",
    },
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const mongoUrl = resolveMongoUrl(args);
  if (!mongoUrl) {
    console.error("Manca l'URL Mongo (config/env o --mongo-url=...).");
    process.exit(1);
  }
  const guildId = String(args.guildId || IDs.guilds?.main || "").trim();
  if (!guildId) {
    console.error("Manca guild-id (ids.js main o --guild-id=...).");
    process.exit(1);
  }
  const monthKey = String(args.monthKey || voteCountMonthKeyRome(new Date())).trim();
  const filter = buildFilter(guildId, args.userId);
  const update = buildUpdate(monthKey);

  await mongoose.connect(mongoUrl);
  const col = mongoose.connection.collection("activityuserprofiles");

  const total = await col.countDocuments(filter);
  console.log(
    args.apply ? "[APPLY]" : "[DRY-RUN]",
    "guildId=",
    guildId,
    args.userId ? `userId=${args.userId}` : "(tutti gli utenti con dati voti)",
    "monthKey=",
    monthKey,
    "documenti che matchano:",
    total,
  );

  if (args.verbose && total > 0) {
    const sample = await col
      .find(filter, { projection: { userId: 1, [ROOT.replace(/\./g, "\u0000")]: 0 } })
      .limit(8)
      .toArray();
    const proj = { userId: 1 };
    proj[ROOT] = 1;
    const rows = await col.find(filter, { projection: proj }).limit(8).toArray();
    for (const r of rows) {
      console.log("  sample", r.userId, JSON.stringify(r.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || {}));
    }
  }

  if (!args.apply) {
    console.log("Nessuna modifica (aggiungi --apply per eseguire updateMany).");
    await mongoose.disconnect().catch(() => {});
    return;
  }

  const res = await col.updateMany(filter, update);
  console.log("updateMany matched:", res.matchedCount, "modified:", res.modifiedCount);
  await mongoose.disconnect().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});