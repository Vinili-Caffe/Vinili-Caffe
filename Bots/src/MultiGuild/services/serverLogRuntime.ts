/**
 * Log del server configurato dalla dashboard: un canale dove il bot scrive cosa succede.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

const COLORS = { red: 0xda373c, orange: 0xe8a33d, green: 0x3ba55c, blue: 0x5865f2, grey: 0x80848e };

type LogEvent = (typeof T.LOG_EVENTS)[number];

async function sendServerLog(guild: any, event: LogEvent, embed: Record<string, any>, opts: { channelId?: string | null; isBot?: boolean } = {}) {
  if (!guild?.id) return;
  const cfg = await T.getServerLogs(guild.id);
  if (!cfg.enabled || cfg.events?.[event] === false) return;
  /* canale dell'evento, altrimenti quello generale */
  const target = (cfg.channels && cfg.channels[event]) || cfg.channelId;
  if (!target) return;
  if (opts.isBot && cfg.ignoreBots) return;
  if (opts.channelId) {
    const logChannels = new Set<string>([cfg.channelId, ...Object.values(cfg.channels || {})].filter(Boolean).map(String));
    if (cfg.ignoredChannelIds.includes(opts.channelId) || logChannels.has(opts.channelId)) return;
  }
  const rest = guild.client?.rest;
  if (!rest) return;
  await rest
    .post(Routes.channelMessages(target), {
      body: { embeds: [{ timestamp: new Date().toISOString(), ...embed }], allowed_mentions: { parse: [] } },
    })
    .catch((err?) => global.logger?.warn?.("[SERVER LOG]", guild.id, event, err?.message || err));
}

const clip = (s: unknown, n = 1000) => {
  const t = String(s ?? "");
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || "—";
};

function userLine(user?) {
  if (!user) return "Sconosciuto";
  return `<@${user.id}> · ${user.username || user.tag || ""} \`${user.id}\``;
}

function authorOf(user?) {
  if (!user) return undefined;
  let icon = "";
  try {
    icon = typeof user.displayAvatarURL === "function" ? user.displayAvatarURL({ size: 64 }) : "";
  } catch {
    icon = "";
  }
  return { name: String(user.globalName || user.username || "Utente"), ...(icon ? { icon_url: icon } : {}) };
}

export = { sendServerLog, COLORS, clip, userLine, authorOf };
