#!/usr/bin/env node
/*
 * Diagnosi (SOLO LETTURA) del compito "Invitare almeno 1 utente e fargli scrivere 100 messaggi o 2 ore in vocale".
 * Mostra, per uno staffer: compito scelto questa settimana e stato, e per ogni utente che risulta invitato da lui
 * i messaggi e le ore in vocale di questa settimana (lun–dom, ora di Roma). Non scrive niente nel database.
 *
 * Uso sulla VPS:
 *   node diagnosi-inviti.cjs <ID_STAFFER>
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");

const staffId = String(process.argv[2] || "").trim();
if (!/^\d{17,20}$/.test(staffId)) {
  console.error("Uso: node diagnosi-inviti.cjs <ID_STAFFER>");
  process.exit(1);
}

for (const p of ["/opt/bot/.env", "/opt/bot/bots-ts/.env", path.join(process.cwd(), ".env")]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const uri = process.env.MONGO_URL_LOCAL || process.env.MONGODB_URI_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI;
if (!uri) {
  console.error("MONGO_URL non trovato nei file .env");
  process.exit(1);
}
const req = createRequire("/opt/bot/bots-ts/package.json");
const mongoose = req("mongoose");

function romeDayKey(d) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" });
  const p = Object.fromEntries(f.formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function weekDayKeys() {
  const today = new Date();
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Rome", weekday: "short" }).format(today);
  const dow = Math.max(0, ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd));
  const keys = [];
  for (let i = 0; i <= 6; i++) keys.push(romeDayKey(new Date(today.getTime() + (i - dow) * 86400000)));
  return keys;
}

(async () => {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  const col = mongoose.connection.db.collection("activityuserprofiles");
  const staff = await col.findOne({ userId: staffId, "profile.siteStaffCompiti": { $exists: true } }, { projection: { guildId: 1, "profile.siteStaffCompiti": 1 } });
  const guildId = staff?.guildId;
  console.log("Staffer:", staffId, "guild:", guildId || "(nessun profilo compiti)");
  const weeks = staff?.profile?.siteStaffCompiti || {};
  const lastWeeks = Object.keys(weeks).sort().slice(-2);
  for (const wk of lastWeeks) {
    const e = weeks[wk] || {};
    console.log(`  settimana ${wk}: compito=${e.taskId || "-"} stato=${e.status || "-"} auto=${Boolean(e.autoSubmitted)}`);
  }
  const keys = weekDayKeys();
  console.log("Giorni conteggiati:", keys[0], "→", keys[6]);
  const invitees = await col
    .find({ guildId, "profile.inviteTrack.inviterId": staffId }, { projection: { userId: 1, "profile.inviteTrack": 1, "profile.totals.daily": 1 } })
    .toArray();
  console.log(`Utenti che risultano invitati da lui: ${invitees.length}`);
  for (const doc of invitees) {
    const daily = doc?.profile?.totals?.daily || {};
    let text = 0;
    let voice = 0;
    for (const k of keys) {
      text += Number(daily[k]?.textCount || 0);
      voice += Number(daily[k]?.voiceSeconds || 0);
    }
    const t = doc.profile?.inviteTrack || {};
    const ok = text >= 100 || voice >= 7200;
    console.log(
      `  ${doc.userId}: attivo=${t.active !== false} entrato=${t.joinedAt ? new Date(t.joinedAt).toISOString().slice(0, 10) : "?"} codice=${t.inviteCode || "?"} → ${text} msg, ${(voice / 3600).toFixed(1)}h ${ok ? "✔ basterebbe" : ""}`,
    );
  }
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error("Errore:", err?.message || err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
