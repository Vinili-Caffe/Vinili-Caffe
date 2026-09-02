// Copyright (c) 2024–2026 Vinili & Caffè. Tutti i diritti riservati.
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const BANDS = [
  {
    id: "mattina",
    label: "Mattina",
    start: 7,
    end: 13,
    hint: "Caffè, messaggi e chiacchiere leggere",
  },
  {
    id: "pomeriggio",
    label: "Pomeriggio",
    start: 14,
    end: 18,
    hint: "Dopo scuola e dopo lavoro: il server si anima",
  },
  {
    id: "sera",
    label: "Sera",
    start: 20,
    end: 24,
    hint: "Vocal, serate e il momento più vivo",
  },
  {
    id: "notte",
    label: "Notte",
    start: 0,
    end: 7,
    hint: "Chi resta sveglio trova sempre compagnia",
  },
];

function emptyPulse() {
  return {
    memberPulse: {
      messages7d: 0,
      voiceSeconds7d: 0,
      activeMembers7d: 0,
      onlineNow: null,
    },
    communityHours: {
      slots: [],
      blurb: "C’è sempre qualcuno in giro: chat di giorno, vocal di sera.",
    },
  };
}

function romeHourKey(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  const hour = String(map.hour === "24" ? "00" : map.hour || "00").padStart(2, "0");
  return `${map.year}-${map.month}-${map.day}T${hour}`;
}

function lastHourKeys(hours) {
  const n = Math.max(1, Math.min(24 * 21, Number(hours || 24)));
  const keys = [];
  const now = Date.now();
  for (let i = 0; i < n; i += 1) keys.push(romeHourKey(new Date(now - i * 3600000)));
  return keys;
}

function hourOfKey(hourKey) {
  const m = String(hourKey || "").match(/T(\d{2})$/);
  if (!m) return -1;
  const h = Number(m[1]);
  return Number.isFinite(h) ? h : -1;
}

function tryRequireMongoose() {
  const candidates = [path.join(ROOT, "..", "node_modules", "mongoose"), "mongoose"];
  for (const p of candidates) {
    try {
      return require(p);
    } catch {
          }
  }
  return null;
}

function mongoUrl() {
  return String(
    process.env.MONGO_URL ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL_LOCAL ||
      process.env.MONGODB_URI_LOCAL ||
      "",
  ).trim();
}

function bandScore(hourScores, band) {
  let sum = 0;
  for (let h = band.start; h < band.end; h += 1) sum += Number(hourScores[h] || 0);
  return sum;
}

function formatRange(band) {
  const a = String(band.start).padStart(2, "0");
  const endLabel = band.end === 24 ? 24 : band.end % 24;
  const b = String(endLabel).padStart(2, "0");
  return `${a}–${b}`;
}

function pickSlots(hourScores) {
  const scored = BANDS.map((band) => {
    const score = bandScore(hourScores, band);
    return { ...band, score, range: formatRange(band) };
  });
  const max = Math.max(...scored.map((row) => row.score), 1);
  const byId = Object.fromEntries(scored.map((row) => [row.id, row]));
  const picked = ["mattina", "pomeriggio", "sera", "notte"]
    .map((id) => byId[id])
    .filter(Boolean);
  return picked.map((row) => ({
    id: row.id,
    label: row.label,
    range: row.range,
    hint: row.hint,
    pct: Math.max(row.id === "mattina" ? 42 : 36, Math.round((row.score / max) * 100)),
    hottest: row.score === max && row.score > 0,
  }));
}

function blurbFor(slots) {
  const top = slots.find((s) => s.hottest) || slots[0];
  if (!top) return "C’è sempre qualcuno in giro: chat di giorno, vocal di sera.";
  if (top.id === "sera") return "Il cuore della community batte la sera: chat, vocal e serate.";
  if (top.id === "pomeriggio") return "Il pomeriggio è il momento clou: c’è sempre qualcuno con cui parlare.";
  if (top.id === "mattina") return "Si inizia presto: già al mattino c’è chi scrive e chi sta in vocale.";
  if (top.id === "notte") return "Anche a notte fonda trovi compagnia: il server non si spegne.";
  return "C’è vita a ogni ora: queste sono le fasce in cui ci trovi di più.";
}

function addHourBlock(block, weekUsers, hourScores, inWeek) {
  const users = block?.users && typeof block.users === "object" && !Array.isArray(block.users) ? block.users : {};
  let text = 0;
  let voice = 0;
  for (const [uidRaw, pack] of Object.entries(users)) {
    const uid = String(uidRaw || "").trim();
    const p = pack && typeof pack === "object" ? pack : {};
    const t = Math.max(0, Number(p.text || 0));
    const v = Math.max(0, Number(p.voice || 0));
    if (!t && !v) continue;
    text += t;
    voice += v;
    if (inWeek && uid) weekUsers.add(uid);
  }
  return { text, voice };
}

export async function fetchCommunityPulse(guildId) {
  const gid = String(guildId || "").trim();
  const url = mongoUrl();
  if (!gid || !url) return emptyPulse();
  const mongoose = tryRequireMongoose();
  if (!mongoose) return emptyPulse();
  const owned = mongoose.connection.readyState !== 1;
  try {
    if (owned) await mongoose.connect(url, { serverSelectionTimeoutMS: 8000 });
    const db = mongoose.connection.db;
    if (!db) return emptyPulse();
    const doc = await db.collection("activityguildhourlys").findOne(
      { guildId: gid },
      { projection: { hours: 1 } },
    );
    const hours = doc?.hours && typeof doc.hours === "object" ? doc.hours : {};
    const weekKeys = new Set(lastHourKeys(24 * 7));
    const lookKeys = lastHourKeys(24 * 14);
    const weekUsers = new Set();
    const hourScores = Array.from({ length: 24 }, () => 0);
    let messages7d = 0;
    let voiceSeconds7d = 0;
    for (const hk of lookKeys) {
      const block = hours[hk];
      if (!block) continue;
      const inWeek = weekKeys.has(hk);
      const { text, voice } = addHourBlock(block, weekUsers, hourScores, inWeek);
      const hod = hourOfKey(hk);
      if (hod >= 0 && hod < 24) hourScores[hod] += text + voice / 20;
      if (inWeek) {
        messages7d += text;
        voiceSeconds7d += voice;
      }
    }
    const slots = pickSlots(hourScores);
    return {
      memberPulse: {
        messages7d: Math.max(0, Math.floor(messages7d)),
        voiceSeconds7d: Math.max(0, Math.floor(voiceSeconds7d)),
        activeMembers7d: weekUsers.size,
        onlineNow: null,
      },
      communityHours: {
        slots,
        blurb: blurbFor(slots),
      },
    };
  } catch (err) {
    console.warn("[build-site] Community pulse Mongo:", err?.message || err);
    return emptyPulse();
  } finally {
    if (owned && mongoose.connection.readyState === 1) {
      await mongoose.disconnect().catch(() => null);
    }
  }
}
