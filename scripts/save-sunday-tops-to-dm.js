/**
 * Legge due canali e inoltra in DM le "top" inviate domenica.
 *
 * Default:
 * - canali: 1481660281032675510, 1470183921236049940
 * - destinatario DM: primo ID in Vinyls/config.json developers[]
 * - giorno: ultima domenica (timezone Europe/Rome)
 *
 * Uso:
 *   node scripts/save-sunday-tops-to-dm.js                 (dry-run)
 *   node scripts/save-sunday-tops-to-dm.js --fix
 *   node scripts/save-sunday-tops-to-dm.js --fix --to=2955... --date=2026-03-15
 *   node scripts/save-sunday-tops-to-dm.js --fix --channels=ID1,ID2
 */
const path = require("path");
const fs = require("fs");
const { Client, GatewayIntentBits } = require("discord.js");

const ROOT = path.resolve(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function getDiscordToken() {
  return process.env.DISCORD_TOKEN_OFFICIAL || process.env.DISCORD_TOKEN || process.env.TOKEN || "";
}

function getDefaultDmTargetUserId() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "Vinyls", "config.json"), "utf8"));
    const dev = Array.isArray(cfg?.developers) ? String(cfg.developers[0] || "").trim() : "";
    if (dev) return dev;
  } catch (_) {}
  return "";
}

function parseArgs(argv) {
  const out = {
    dryRun: true,
    toUserId: getDefaultDmTargetUserId(),
    channels: ["1481660281032675510", "1470183921236049940"],
    date: null, // YYYY-MM-DD in Rome, must be Sunday
    limitPerChannel: 5000,
  };
  for (const raw of argv) {
    const a = String(raw || "").trim();
    if (!a) continue;
    if (a === "--fix") out.dryRun = false;
    if (a === "--dry-run") out.dryRun = true;
    if (a.startsWith("--to=")) out.toUserId = String(a.split("=").slice(1).join("=").trim());
    if (a.startsWith("--channels=")) {
      const list = String(a.split("=").slice(1).join("=").trim())
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (list.length) out.channels = list;
    }
    if (a.startsWith("--date=")) out.date = String(a.split("=").slice(1).join("=").trim()) || null;
    if (a.startsWith("--limit=")) out.limitPerChannel = Math.max(1, Math.min(200000, Number(a.split("=").slice(1).join("=").trim()) || 5000));
  }
  return out;
}

const TIME_ZONE = "Europe/Rome";

function romeDateParts(date) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const parts = fmt.formatToParts(date).reduce((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    y: Number(parts.year || 0),
    m: Number(parts.month || 1),
    d: Number(parts.day || 1),
    w: weekdayMap[String(parts.weekday || "Sun")] ?? 0,
  };
}

function getRomeOffsetMs(utcDate) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "shortOffset", hour: "2-digit" });
  const zoneName = fmt.formatToParts(utcDate).find((p) => p.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(y, m, d, hh, mm, ss) {
  const baseUtcMs = Date.UTC(y, m - 1, d, hh, mm, ss);
  const off1 = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - off1;
  const off2 = getRomeOffsetMs(new Date(utcMs));
  if (off2 !== off1) utcMs = baseUtcMs - off2;
  return new Date(utcMs);
}

function getMostRecentSundayRomeBounds() {
  const now = new Date();
  const p = romeDateParts(now);
  const daysSinceSunday = p.w; // Sun=0..Sat=6
  const y = p.y;
  const m = p.m;
  const d = p.d - daysSinceSunday;
  const start = createUtcFromRomeLocal(y, m, d, 0, 0, 0);
  const end = createUtcFromRomeLocal(y, m, d + 1, 0, 0, 0);
  return { start, end, label: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` };
}

function getSundayBoundsFromRomeDate(yyyyMmDd) {
  const m = String(yyyyMmDd || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  const start = createUtcFromRomeLocal(y, mo, d, 0, 0, 0);
  const end = createUtcFromRomeLocal(y, mo, d + 1, 0, 0, 0);
  return { start, end, label: `${m[1]}-${m[2]}-${m[3]}` };
}

function looksLikeTopMessage(msg) {
  if (!msg) return false;
  if (msg.author?.bot) return true; // tops in canale quasi sempre dal bot
  const content = String(msg.content || "").toLowerCase();
  if (content.includes("top") || content.includes("classifica")) return true;
  const embeds = Array.isArray(msg.embeds) ? msg.embeds : [];
  return embeds.some((e) => String(e?.title || "").toLowerCase().includes("top") || String(e?.title || "").toLowerCase().includes("classifica"));
}

async function fetchMessagesInRange(channel, start, end, limit) {
  const out = [];
  let before = null;
  while (out.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before: before ?? undefined }).catch(() => null);
    if (!batch || batch.size === 0) break;
    for (const [, m] of batch) {
      const t = m.createdAt ? m.createdAt.getTime() : 0;
      if (t >= end.getTime()) continue;
      if (t < start.getTime()) return out;
      out.push(m);
      if (out.length >= limit) break;
    }
    const last = batch.last();
    if (!last) break;
    before = last.id;
  }
  return out;
}

async function main() {
  const { dryRun, toUserId, channels, date, limitPerChannel } = parseArgs(process.argv.slice(2));
  const token = getDiscordToken();
  if (!token) throw new Error("Discord: imposta DISCORD_TOKEN_OFFICIAL (o DISCORD_TOKEN/TOKEN) nel .env.");
  if (!toUserId) throw new Error("Destinatario DM mancante. Passa --to=<userId> o imposta Vinyls/config.json developers[].");

  const bounds = date ? getSundayBoundsFromRomeDate(date) : getMostRecentSundayRomeBounds();
  if (!bounds) throw new Error("Data non valida. Usa --date=YYYY-MM-DD (domenica, timezone Rome).");

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  await client.login(token);
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    setTimeout(() => reject(new Error("Login timeout")), 25000);
  });

  try {
    const user = await client.users.fetch(String(toUserId)).catch(() => null);
    if (!user?.send) throw new Error("Impossibile aprire DM col destinatario.");

    console.log(`[tops->dm] sunday=${bounds.label} start=${bounds.start.toISOString()} end=${bounds.end.toISOString()} dryRun=${dryRun}`);

    const collected = [];
    for (const channelId of channels) {
      const ch = await client.channels.fetch(String(channelId)).catch(() => null);
      if (!ch?.isTextBased?.()) {
        console.warn(`[tops->dm] skip channel ${channelId}: non testuale/non trovato`);
        continue;
      }
      const msgs = await fetchMessagesInRange(ch, bounds.start, bounds.end, limitPerChannel);
      const tops = msgs.filter(looksLikeTopMessage);
      console.log(`[tops->dm] channel ${channelId}: fetched=${msgs.length} tops=${tops.length}`);
      for (const m of tops) collected.push({ channelId: String(channelId), msg: m });
    }

    collected.sort((a, b) => (a.msg.createdAt?.getTime?.() || 0) - (b.msg.createdAt?.getTime?.() || 0));
    console.log(`[tops->dm] total tops to forward: ${collected.length}`);

    if (dryRun) return;

    await user.send({ content: `Salvataggio TOP di domenica ${bounds.label} (da canali: ${channels.join(", ")}) — messaggi: ${collected.length}` }).catch(() => {});

    for (const item of collected) {
      const m = item.msg;
      const header = `#${item.channelId} • ${m.createdAt ? m.createdAt.toISOString() : ""} • msg:${m.id}`;
      const content = String(m.content || "").trim();
      const embeds = Array.isArray(m.embeds) ? m.embeds : [];
      const files = [];
      for (const [, att] of (m.attachments || new Map()).entries()) {
        if (att?.url) files.push(att.url);
      }
      await user.send({
        content: [header, content].filter(Boolean).join("\n").slice(0, 1900) || header,
        embeds: embeds.slice(0, 10),
        files: files.slice(0, 10),
      }).catch(() => {});
      await new Promise((r) => {
        const t = setTimeout(r, 600);
        t.unref?.();
      });
    }
  } finally {
    client.destroy();
  }
}

main().catch((err) => {
  console.error(err?.stack || err?.message || err);
  process.exit(1);
});