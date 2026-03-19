#!/usr/bin/env node
/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const OneTimeReminder = require("../Vinyls/Schemas/Reminders/oneTimeReminderSchema");
const OneTimeReminderUser = require("../Vinyls/Schemas/Reminders/oneTimeReminderUserSchema");

function parseArgs(argv) {
  const flags = new Set(argv.slice(2));
  return {
    yes: flags.has("--yes"),
    force: flags.has("--force"),
    dryRun: flags.has("--dry-run"),
  };
}

function byCreatedAtAsc(a, b) {
  return new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
}

async function run() {
  const { yes, force, dryRun } = parseArgs(process.argv);
  if (!yes && !dryRun) {
    console.error("Uso: node scripts/migrate-one-time-reminders-to-user-docs.js --yes [--force] [--dry-run]");
    process.exit(1);
  }

  const mongoUrl = process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("MONGO_URL/MONGODB_URI non impostata.");
    process.exit(1);
  }

  await mongoose.connect(mongoUrl);
  console.log("[migrate-reminders] connected");

  const rows = await OneTimeReminder.find({})
    .select("key userId message sendAt sentAt createdAt")
    .lean();
  console.log("[migrate-reminders] legacy rows:", rows.length);

  const perUser = new Map();
  for (const row of rows) {
    const userId = String(row?.userId || "").trim();
    const key = String(row?.key || "").trim();
    if (!userId || !key) continue;
    if (!perUser.has(userId)) perUser.set(userId, []);
    perUser.get(userId).push({
      key,
      message: String(row?.message || ""),
      sendAt: row?.sendAt ? new Date(row.sendAt) : new Date(),
      sentAt: row?.sentAt ? new Date(row.sentAt) : null,
      createdAt: row?.createdAt ? new Date(row.createdAt) : new Date(),
    });
  }

  let upserts = 0;
  let skipped = 0;
  for (const [userId, entriesRaw] of perUser.entries()) {
    const entries = entriesRaw.sort(byCreatedAtAsc);
    if (!entries.length) {
      skipped += 1;
      continue;
    }
    if (dryRun) {
      upserts += 1;
      continue;
    }
    if (!force) {
      const existing = await OneTimeReminderUser.exists({ userId }).catch(() => null);
      if (existing) {
        skipped += 1;
        continue;
      }
    }
    await OneTimeReminderUser.findOneAndUpdate(
      { userId },
      {
        $set: { entries },
        $setOnInsert: { userId },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    upserts += 1;
  }

  console.log(
    "[migrate-reminders] users:",
    perUser.size,
    "| upserted:",
    upserts,
    "| skipped:",
    skipped,
    "| dryRun:",
    dryRun,
  );
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("[migrate-reminders] failed:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});