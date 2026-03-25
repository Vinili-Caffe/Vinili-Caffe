/**
 * Migrazione one-shot: $unset di staff.partnerCount, staff.partnerActions, staff.managerId
 * solo per gli utenti che (via API Discord) non hanno più il ruolo Partner Manager nel guild.
 *
 * Richiede: .env con MONGO_* / MONGO_URL e token bot (DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL).
 *
 * Uso (dalla root del repo):
 *   node scripts/unset-partner-fields-without-pm-role.js
 *   node scripts/unset-partner-fields-without-pm-role.js --dry-run
 *
 * Opzioni env:
 *   MIGRATION_GUILD_ID — override del guild (default: ids.guilds.main)
 */
const path = require("path");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function requireMongoose() {
  const attempts = [
    () => require("mongoose"),
    () => require(path.join(ROOT, "node_modules", "mongoose")),
    () => require(path.join(ROOT, "Vinyls", "node_modules", "mongoose")),
  ];
  for (const fn of attempts) {
    try {
      return fn();
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Mongoose non trovato. Esegui npm install nella root o in Vinyls.",
  );
}

const mongoose = requireMongoose();
const { ActivityUserProfile } = require(path.join(
  ROOT,
  "Vinyls",
  "Schemas",
  "Community",
  "communitySchemas.js",
));
const IDs = require(path.join(ROOT, "Vinyls", "Utils", "Config", "ids.js"));

const DRY_RUN = process.argv.includes("--dry-run");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

function resolveBotToken() {
  return (
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    ""
  ).trim();
}

async function fetchMemberRoles(token, guildId, userId) {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bot ${token}` },
  });
  if (res.status === 404) return null;
  if (res.status === 429) {
    const retry = Number(res.headers.get("retry-after") || 1) * 1000;
    await sleep(Math.min(15_000, Math.max(500, retry)));
    return fetchMemberRoles(token, guildId, userId);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Discord API ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data.roles) ? data.roles : [];
}

function memberHasPmRole(roleIds, pmRoleId) {
  const pm = String(pmRoleId || "");
  return roleIds.some((r) => String(r) === pm);
}

async function main() {
  const url = resolveMongoUrl();
  if (!url) {
    console.error("Nessun URL MongoDB in .env.");
    process.exit(1);
  }
  const token = resolveBotToken();
  if (!token) {
    console.error("Nessun token bot (DISCORD_TOKEN / DISCORD_TOKEN_OFFICIAL).");
    process.exit(1);
  }

  const guildId = String(
    process.env.MIGRATION_GUILD_ID || IDs.guilds?.main || "",
  ).trim();
  if (!guildId) {
    console.error("MIGRATION_GUILD_ID o ids.guilds.main mancante.");
    process.exit(1);
  }
  const pmRoleId = String(IDs.roles?.PartnerManager || "").trim();
  if (!pmRoleId) {
    console.error("IDs.roles.PartnerManager mancante.");
    process.exit(1);
  }

  await mongoose.connect(url);

  const filter = {
    guildId,
    $or: [
      { "staff.partnerCount": { $exists: true } },
      { "staff.partnerActions": { $exists: true } },
      { "staff.managerId": { $exists: true } },
    ],
  };

  const cursor = ActivityUserProfile.find(filter)
    .select({ userId: 1 })
    .lean()
    .cursor();

  let scanned = 0;
  let unset = 0;
  let skippedHasPm = 0;
  let errors = 0;

  for await (const doc of cursor) {
    const userId = String(doc?.userId || "");
    if (!userId) continue;
    scanned += 1;

    try {
      const roles = await fetchMemberRoles(token, guildId, userId);
      if (roles && memberHasPmRole(roles, pmRoleId)) {
        skippedHasPm += 1;
      } else {
        if (DRY_RUN) {
          unset += 1;
          console.log(`[dry-run] unset candidato userId=${userId}`);
        } else {
          const res = await ActivityUserProfile.updateOne(
            { guildId, userId },
            {
              $unset: {
                "staff.partnerCount": "",
                "staff.partnerActions": "",
                "staff.managerId": "",
              },
            },
          ).catch(() => ({ modifiedCount: 0 }));
          if (res?.modifiedCount) unset += 1;
        }
      }
    } catch (e) {
      errors += 1;
      console.error(`[err] userId=${userId}`, e?.message || e);
    }

    await sleep(250);
  }

  console.log(
    JSON.stringify(
      {
        guildId,
        dryRun: DRY_RUN,
        scanned,
        unset,
        skippedHasPm,
        errors,
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