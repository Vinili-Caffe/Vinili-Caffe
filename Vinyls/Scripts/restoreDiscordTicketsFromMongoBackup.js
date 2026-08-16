#!/usr/bin/env node
/**
 * Ripristina SOLO l'array `tickets` di guildfeaturebuckets dal dump Mongo,
 * senza toccare sitewebtickets / altri dati live.
 *
 *   node Vinyls/Scripts/restoreDiscordTicketsFromMongoBackup.js --backup /opt/bot/deploy/backups/mongo-20260815-000001 --apply
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

function loadEnv() {
  for (const p of ["/opt/bot/.env", path.resolve(__dirname, "../../.env")]) {
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
  for (const p of ["/opt/bot/deploy/.env.mongo"]) {
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
  }
}

function argValue(name) {
  const i = process.argv.indexOf(name);
  if (i < 0 || i + 1 >= process.argv.length) return "";
  return String(process.argv[i + 1] || "").trim();
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")}\n${r.stderr || r.stdout || "failed"}`);
  }
  return r.stdout;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const backupRoot = argValue("--backup") || "/opt/bot/deploy/backups/mongo-20260815-000001";
  const bsonPath = path.join(backupRoot, "test", "guildfeaturebuckets.bson");
  const metaPath = path.join(backupRoot, "test", "guildfeaturebuckets.metadata.json");
  if (!fs.existsSync(bsonPath)) throw new Error(`missing ${bsonPath}`);

  const user = process.env.MONGO_INITDB_ROOT_USERNAME;
  const pass = process.env.MONGO_INITDB_ROOT_PASSWORD;
  if (!user || !pass) throw new Error("missing mongo root creds in deploy/.env.mongo");

  const tmpDb = "vc_ticket_restore_tmp";
  const remoteDir = `/tmp/vc-ticket-restore-${Date.now()}`;

  sh("docker", ["exec", "vc-mongodb", "mkdir", "-p", remoteDir]);
  sh("docker", ["cp", bsonPath, `vc-mongodb:${remoteDir}/guildfeaturebuckets.bson`]);
  if (fs.existsSync(metaPath)) {
    sh("docker", ["cp", metaPath, `vc-mongodb:${remoteDir}/guildfeaturebuckets.metadata.json`]);
  }

  sh("docker", [
    "exec",
    "vc-mongodb",
    "mongorestore",
    "-u",
    user,
    "-p",
    pass,
    "--authenticationDatabase",
    "admin",
    "--drop",
    `--db=${tmpDb}`,
    `--collection=guildfeaturebuckets`,
    `${remoteDir}/guildfeaturebuckets.bson`,
  ]);

  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) throw new Error("missing MONGO_URL_LOCAL");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;

  const live = await db.collection("guildfeaturebuckets").findOne(
    { guildId: "1329080093599076474" },
    { projection: { _id: 1, guildId: 1, tickets: 1 } },
  );
  const restored = await db.client.db(tmpDb).collection("guildfeaturebuckets").findOne(
    { guildId: "1329080093599076474" },
    { projection: { guildId: 1, tickets: 1 } },
  );

  const liveCount = Array.isArray(live?.tickets) ? live.tickets.length : 0;
  const restoreCount = Array.isArray(restored?.tickets) ? restored.tickets.length : 0;
  const openRestore = (restored?.tickets || []).filter(
    (t) => t.open === true || t.open === 1 || t.open === "1" || t.open === "true",
  ).length;

  console.log(
    JSON.stringify(
      {
        apply,
        backupRoot,
        liveTicketCount: liveCount,
        backupTicketCount: restoreCount,
        backupOpenCount: openRestore,
        liveGuildFound: Boolean(live),
        backupGuildFound: Boolean(restored),
      },
      null,
      2,
    ),
  );

  if (!restored || !restoreCount) {
    throw new Error("backup tickets array empty/missing — abort");
  }

  if (!apply) {
    console.log("Dry-run OK. Passa --apply per scrivere i ticket Discord sul live.");
  } else {
    // Chiudi in DB i ticket che nel backup erano aperti: i canali sono stati cancellati per errore.
    const tickets = (restored.tickets || []).map((t) => {
      const open = t.open === true || t.open === 1 || t.open === "1" || t.open === "true";
      if (!open) return t;
      return {
        ...t,
        open: false,
        closedAt: t.closedAt || new Date(),
        closedBy: t.closedBy || "system_restore",
        closeReason: t.closeReason || "Ripristino dopo purge errato (canale eliminato)",
      };
    });

    const res = await db.collection("guildfeaturebuckets").updateOne(
      { guildId: "1329080093599076474" },
      { $set: { tickets } },
    );
    const after = await db.collection("guildfeaturebuckets").findOne(
      { guildId: "1329080093599076474" },
      { projection: { tickets: 1 } },
    );
    console.log(
      JSON.stringify(
        {
          matched: res.matchedCount,
          modified: res.modifiedCount,
          restoredTicketCount: Array.isArray(after?.tickets) ? after.tickets.length : 0,
          note: "Ticket web NON ripristinati (restano cancellati come richiesto).",
        },
        null,
        2,
      ),
    );
  }

  await db.client.db(tmpDb).dropDatabase().catch(() => null);
  sh("docker", ["exec", "vc-mongodb", "rm", "-rf", remoteDir]);
  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
