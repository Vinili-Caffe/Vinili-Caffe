/**
 * Conta i membri per stato (online / inattivo / non disturbare) senza la cache presenze di discord.js
 * (che è spenta per la memoria): tiene solo id → stato di chi NON è offline, letto dagli eventi grezzi
 * del gateway. Ogni 5 minuti salva i totali per server in BotState, così li leggono anche gli altri
 * processi (API del sito, worker dei contatori). Offline = membri totali − (online + inattivi + dnd).
 */
const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");

type Status = "online" | "idle" | "dnd";
type PresenceTotals = { online: number; idle: number; dnd: number; at: number };

const STATE_KEY = "mg_presence_counts_v1";
const FLUSH_MS = 5 * 60_000;
/* dati più vecchi di così non si usano (processo del bot fermo) */
const MAX_AGE_MS = 20 * 60_000;

const byGuild = new Map<string, Map<string, Status>>();
let installed = false;

function setStatus(guildId: string, userId: string, status: unknown) {
  if (!guildId || !userId) return;
  let m = byGuild.get(guildId);
  if (status === "online" || status === "idle" || status === "dnd") {
    if (!m) byGuild.set(guildId, (m = new Map()));
    m.set(userId, status);
  } else if (m) {
    m.delete(userId);
  }
}

function onRaw(pkt?) {
  const t = pkt?.t;
  const d = pkt?.d;
  if (!t || !d) return;
  if (t === "GUILD_CREATE") {
    const gid = String(d.id || "");
    if (!gid) return;
    const m = new Map<string, Status>();
    for (const p of Array.isArray(d.presences) ? d.presences : []) {
      const s = p?.status;
      const uid = String(p?.user?.id || "");
      if (uid && (s === "online" || s === "idle" || s === "dnd")) m.set(uid, s);
    }
    byGuild.set(gid, m);
  } else if (t === "PRESENCE_UPDATE") {
    setStatus(String(d.guild_id || ""), String(d.user?.id || ""), d.status);
  } else if (t === "GUILD_MEMBER_REMOVE") {
    setStatus(String(d.guild_id || ""), String(d.user?.id || ""), "offline");
  } else if (t === "GUILD_DELETE" && !d.unavailable) {
    byGuild.delete(String(d.id || ""));
  }
}

function totals(): Record<string, PresenceTotals> {
  const at = Date.now();
  const out: Record<string, PresenceTotals> = {};
  for (const [gid, m] of byGuild) {
    const t = { online: 0, idle: 0, dnd: 0, at };
    for (const s of m.values()) t[s]++;
    out[gid] = t;
  }
  return out;
}

async function flush() {
  if (!byGuild.size) return;
  await setBotState(STATE_KEY, totals()).catch(() => null);
}

/** Da chiamare appena creato il client col gateway (prima del login, per avere i GUILD_CREATE). */
function installPresenceCounts(client?) {
  if (installed || !client?.on) return;
  installed = true;
  client.on("raw", onRaw);
  const timer = setInterval(() => void flush(), FLUSH_MS);
  timer.unref?.();
  /* primo salvataggio poco dopo l'avvio, quando i server sono arrivati */
  const first = setTimeout(() => void flush(), 90_000);
  first.unref?.();
}

/** Totali di un server: dal processo del bot se è questo, altrimenti dall'ultimo salvataggio. */
async function getPresenceTotals(guildId: string): Promise<PresenceTotals | null> {
  const gid = String(guildId || "");
  const local = byGuild.get(gid);
  if (installed && local) {
    const t = { online: 0, idle: 0, dnd: 0, at: Date.now() };
    for (const s of local.values()) t[s]++;
    return t;
  }
  const saved: any = await getBotState(STATE_KEY, {}).catch(() => null);
  const row = saved && typeof saved === "object" ? saved[gid] : null;
  if (!row || Date.now() - Number(row.at || 0) > MAX_AGE_MS) return null;
  return { online: Number(row.online) || 0, idle: Number(row.idle) || 0, dnd: Number(row.dnd) || 0, at: Number(row.at) };
}

export = { installPresenceCounts, getPresenceTotals };
