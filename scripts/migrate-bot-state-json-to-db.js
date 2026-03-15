/**
 * One-time migration: read JSON files that used to hold bot state and upsert into BotState collection.
 * Run from DiscordBot-1 root: node scripts/migrate-bot-state-json-to-db.js
 * Uses MONGO_URL or MONGODB_URI or Vinyls/config.json mongoURL.
 */
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");

const ROOT = path.resolve(__dirname, "..");
const VINYLS = path.join(ROOT, "Vinyls");

const FILES = [
  {
    file: path.join(VINYLS, "lastResocontoRun.json"),
    key: "lastResocontoRun",
    normalize: (data) => (data && typeof data.lastRunAt === "number" ? data : null),
  },
  {
    file: path.join(ROOT, "Vinyls", "Data", "applicationCooldowns.json"),
    key: "applicationCooldowns",
    normalize: (data) => (data && typeof data === "object" && !Array.isArray(data) ? data : {}),
  },
  {
    file: path.join(ROOT, "Vinyls", "Data", "applicationCounters.json"),
    key: "applicationCounters",
    normalize: (data) => {
      if (!data || typeof data !== "object" || Array.isArray(data)) return null;
      return {
        helper: Number.isFinite(Number(data.helper)) ? Math.floor(Number(data.helper)) : 0,
        partnermanager: Number.isFinite(Number(data.partnermanager)) ? Math.floor(Number(data.partnermanager)) : 0,
      };
    },
  },
  {
    file: path.join(ROOT, "Vinyls", "Data", "applicationDrafts.json"),
    key: "applicationDrafts",
    normalize: (data) => (data && typeof data === "object" && !Array.isArray(data) ? data : {}),
  },
  {
    file: path.join(VINYLS, "Utils", "Config", "helpNewUntil.json"),
    key: "helpNewUntil",
    normalize: (data) => (data && typeof data === "object" && !Array.isArray(data) ? data : {}),
  },
  {
    file: path.join(VINYLS, "Data", "weeklyDmReminderState.json"),
    key: "weeklyDmReminderState",
    normalize: (data) => (data && typeof data === "object" && !Array.isArray(data) ? data : {}),
  },
];

function getMongoUrl() {
  if (process.env.MONGO_URL) return process.env.MONGO_URL;
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  try {
    const configPath = path.join(VINYLS, "config.json");
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (config.mongoURL) return config.mongoURL;
    }
  } catch (_) {}
  return null;
}

async function run() {
  const mongoUrl = getMongoUrl();
  if (!mongoUrl) {
    console.error("No MongoDB URL. Set MONGO_URL or MONGODB_URI or mongoURL in Vinyls/config.json");
    process.exit(1);
  }

  mongoose.set("strictQuery", false);
  await mongoose.connect(mongoUrl, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  console.log("Connected to MongoDB.");

  const BotState = require(path.join(VINYLS, "Schemas", "BotState", "botStateSchema"));

  let migrated = 0;
  let skipped = 0;
  for (const { file, key, normalize } of FILES) {
    if (!fs.existsSync(file)) {
      console.log(`[skip] ${key}: file not found (${path.relative(ROOT, file)})`);
      skipped++;
      continue;
    }
    let raw;
    try {
      raw = fs.readFileSync(file, "utf8");
    } catch (err) {
      console.error(`[error] ${key}: read failed`, err?.message || err);
      continue;
    }
    let data;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`[error] ${key}: invalid JSON`, err?.message || err);
      continue;
    }
    const value = normalize(data);
    if (value === null && key !== "lastResocontoRun") {
      console.log(`[skip] ${key}: empty or invalid content`);
      skipped++;
      continue;
    }
    if (key === "lastResocontoRun" && value === null) {
      console.log(`[skip] ${key}: no lastRunAt`);
      skipped++;
      continue;
    }
    try {
      await BotState.findOneAndUpdate(
        { key },
        { $set: { value: value ?? {} } },
        { upsert: true },
      );
      console.log(`[ok] ${key} <- ${path.relative(ROOT, file)}`);
      migrated++;
    } catch (err) {
      console.error(`[error] ${key}: db write failed`, err?.message || err);
    }
  }

  console.log(`Done. Migrated: ${migrated}, skipped: ${skipped}.`);
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});