/**
 * Emoji custom di tutti i server in cui c'è il bot: un bot può usarle in qualsiasi server, quindi il
 * picker della dashboard le mostra tutte, divise per server. Il processo del bot (gateway) le legge
 * via REST ogni 30 minuti e le salva in BotState; l'API del sito le legge da lì.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");

const STATE_KEY = "mg_all_guild_emojis_v1";
const REFRESH_MS = 30 * 60_000;
const READ_CACHE_MS = 5 * 60_000;
/* tetto per non appesantire la dashboard */
const MAX_TOTAL = 4000;

type SnapEmoji = { id: string; name: string; animated: boolean };
type SnapGuild = { id: string; name: string; emojis: SnapEmoji[] };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function writeSnapshot(client?) {
  const rest = client?.rest || client?._rest;
  const guilds = [...(client?.guilds?.cache?.values?.() || [])];
  if (!rest || !guilds.length) return;
  const out: SnapGuild[] = [];
  for (const g of guilds) {
    const list: any = await rest.get(Routes.guildEmojis(String(g.id))).catch(() => null);
    if (Array.isArray(list)) {
      /* solo quelle che il bot può davvero usare: disponibili e senza ruoli richiesti */
      const emojis = list
        .filter((e?) => e?.id && e.available !== false && !(Array.isArray(e.roles) && e.roles.length))
        .map((e?) => ({ id: String(e.id), name: String(e.name || "emoji"), animated: e.animated === true }));
      if (emojis.length) out.push({ id: String(g.id), name: String(g.name || "Server"), emojis });
    }
    await sleep(250);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  await setBotState(STATE_KEY, { at: Date.now(), guilds: out }).catch(() => null);
}

let started = false;
/** Solo nel processo col gateway. */
function startAllGuildEmojisSnapshot(client?) {
  if (started || !client) return;
  started = true;
  const run = () => void writeSnapshot(client).catch(() => null);
  const first = setTimeout(run, 2 * 60_000);
  first.unref?.();
  const timer = setInterval(run, REFRESH_MS);
  timer.unref?.();
}

let cache: { at: number; guilds: SnapGuild[] } | null = null;
/** Emoji degli altri server (non quello indicato), col nome del server, per i picker. */
async function getOtherGuildEmojis(excludeGuildId: string) {
  if (!cache || Date.now() - cache.at > READ_CACHE_MS) {
    const d: any = await getBotState(STATE_KEY, null).catch(() => null);
    cache = { at: Date.now(), guilds: Array.isArray(d?.guilds) ? d.guilds : [] };
  }
  const out: Array<SnapEmoji & { url: string; guildId: string; guildName: string }> = [];
  for (const g of cache.guilds) {
    if (String(g.id) === String(excludeGuildId)) continue;
    for (const e of g.emojis) {
      if (out.length >= MAX_TOTAL) return out;
      out.push({ ...e, url: `https://cdn.discordapp.com/emojis/${e.id}.${e.animated ? "gif" : "png"}?size=48`, guildId: g.id, guildName: g.name });
    }
  }
  return out;
}

export = { startAllGuildEmojisSnapshot, getOtherGuildEmojis };
