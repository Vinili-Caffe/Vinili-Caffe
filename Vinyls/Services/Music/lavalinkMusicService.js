const { Shoukaku, Connectors, LoadType, Constants } = require("shoukaku");

const MUSIC_LOGS = String(process.env.MUSIC_LOGS || "0").trim() === "1";

/** @type {Map<string, { tracks: unknown[], textChannelId: string | null, nowPlaying: string | null }>} */
const guildQueues = new Map();
/** @type {Set<string>} */
const endListeners = new Set();

function logMusic(...args) {
  if (!MUSIC_LOGS) return;
  global.logger?.info?.("[MUSIC]", ...args);
}

function parseLavalinkHost() {
  const raw = (process.env.LAVALINK_HOST || "127.0.0.1:2333").trim().replace(/^https?:\/\//i, "");
  const lastColon = raw.lastIndexOf(":");
  const host = lastColon > 0 ? raw.slice(0, lastColon) : raw;
  const port = lastColon > 0 ? raw.slice(lastColon + 1) : "2333";
  return { host, port, url: `${host}:${port}` };
}

function getShardIdForGuild(guild) {
  if (guild?.shardId != null && Number.isFinite(guild.shardId)) return guild.shardId;
  return 0;
}

/**
 * @param {import("shoukaku").LavalinkResponse | undefined} res
 * @returns {import("shoukaku").Track[]}
 */
function tracksFromResolve(res) {
  if (!res) return [];
  if (res.loadType === LoadType.TRACK) return [res.data];
  if (res.loadType === LoadType.SEARCH) return Array.isArray(res.data) ? res.data : [];
  if (res.loadType === LoadType.PLAYLIST) {
    const pl = res.data;
    return Array.isArray(pl?.tracks) ? pl.tracks : [];
  }
  if (res.loadType === LoadType.EMPTY || res.loadType === LoadType.ERROR) return [];
  return [];
}

function describeTrack(t) {
  const info = t?.info;
  if (!info) return "Traccia sconosciuta";
  return `${info.title || "Senza titolo"} — ${info.author || "?"}`;
}

function getSession(guildId) {
  let s = guildQueues.get(guildId);
  if (!s) {
    s = { tracks: [], textChannelId: null, nowPlaying: null };
    guildQueues.set(guildId, s);
  }
  return s;
}

function isLavalinkUsable(client) {
  const sh = client?.shoukaku;
  if (!sh?.nodes?.size) return false;
  const node = sh.nodes.get(process.env.LAVALINK_NODE_NAME || "main") || sh.nodes.values().next().value;
  if (!node) return false;
  return node.state === Constants.State.CONNECTED;
}

/**
 * @param {import("shoukaku").Player} player
 * @param {string} guildId
 */
function attachEndHandler(client, player, guildId) {
  if (endListeners.has(guildId)) return;
  endListeners.add(guildId);
  player.on("end", async (ev) => {
    if (ev.reason === "replaced") return;
    const session = guildQueues.get(guildId);
    const next = session?.tracks?.shift();
    if (!next) {
      if (session) session.nowPlaying = null;
      try {
        await client.shoukaku.leaveVoiceChannel(guildId);
      } catch (_) {}
      guildQueues.delete(guildId);
      endListeners.delete(guildId);
      return;
    }
    if (session) session.nowPlaying = describeTrack(next);
    try {
      await player.playTrack({ track: { encoded: next.encoded } });
    } catch (err) {
      global.logger?.warn?.("[MUSIC] play next failed:", err?.message || err);
      try {
        await client.shoukaku.leaveVoiceChannel(guildId);
      } catch (_) {}
      guildQueues.delete(guildId);
      endListeners.delete(guildId);
    }
  });
}

/**
 * @param {import("discord.js").Client} client
 */
function initLavalinkMusicIfEnabled(client) {
  if (client._shoukakuInitDone) return;
  if (String(process.env.MUSIC_ENABLED || "1").trim() === "0") {
    logMusic("disabilitato (MUSIC_ENABLED=0)");
    return;
  }
  client._shoukakuInitDone = true;
  const { url } = parseLavalinkHost();
  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const secure = String(process.env.LAVALINK_SECURE || "").trim() === "1";
  const nodes = [
    {
      name: process.env.LAVALINK_NODE_NAME || "main",
      url,
      auth: password,
      secure,
    },
  ];
  try {
    const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), nodes, {
      moveOnDisconnect: false,
      resume: true,
      resumeByLibrary: true,
      resumeTimeout: 60,
      reconnectTries: 60,
      reconnectInterval: 7,
      restTimeout: 120,
      voiceConnectionTimeout: 30,
    });
    client.shoukaku = shoukaku;
    shoukaku.on("error", (name, err) => {
      global.logger?.warn?.(`[MUSIC] Shoukaku node ${name}:`, err?.message || err);
    });
    shoukaku.on("ready", (name) => {
      global.logger?.info?.(`[MUSIC] Lavalink collegato (nodo ${name})`);
    });
  } catch (err) {
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err);
  }
}

/**
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @param {string} query
 */
async function playFromInteraction(interaction, query) {
  const client = interaction.client;
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) {
    return { ok: false, message: "Usa questo comando in un server." };
  }
  if (!isLavalinkUsable(client)) {
    const sh = client?.shoukaku;
    const node =
      sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
      (sh?.nodes?.size ? sh.nodes.values().next().value : undefined);
    const state = node?.state;
    global.logger?.warn?.("[MUSIC] play bloccato: nodo Shoukaku non CONNECTED", {
      nodes: sh?.nodes?.size ?? 0,
      state: state != null ? String(state) : "no-node",
    });
    return {
      ok: false,
      message:
        "Musica non disponibile: il bot non ha il **WebSocket** verso Lavalink (non basta che la porta risponda). Riavvia **dopo** che Lavalink è su, oppure usa `wait-for-lavalink.js` che ora avvia i bot solo dopo il primo check OK. Controlla `LAVALINK_HOST`, `LAVALINK_PASSWORD` (= `application.yml`) e `LAVALINK_SECURE` se usi TLS.",
    };
  }
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel || voiceChannel.isVoiceBased?.() === false) {
    return { ok: false, message: "Entra in un canale vocale per riprodurre musica." };
  }

  const shoukaku = client.shoukaku;
  const guildId = guild.id;
  const existingConn = shoukaku.connections.get(guildId);
  if (existingConn?.channelId && existingConn.channelId !== voiceChannel.id) {
    await shoukaku.leaveVoiceChannel(guildId).catch(() => {});
    endListeners.delete(guildId);
  }

  const node =
    shoukaku.nodes.get(process.env.LAVALINK_NODE_NAME || "main") ||
    shoukaku.getIdealNode() ||
    shoukaku.nodes.values().next().value;
  if (!node?.rest) {
    return { ok: false, message: "Nessun nodo Lavalink disponibile." };
  }

  let resolved;
  try {
    resolved = await node.rest.resolve(query.trim());
  } catch (err) {
    global.logger?.warn?.("[MUSIC] resolve:", err?.message || err);
    return {
      ok: false,
      message: `Ricerca fallita: ${err?.message || "errore Lavalink"}`,
    };
  }

  const tracks = tracksFromResolve(resolved);
  if (!tracks.length) {
    return { ok: false, message: "Nessun risultato per questa ricerca o URL." };
  }

  const session = getSession(guildId);
  session.textChannelId = interaction.channelId || null;

  let player = shoukaku.players.get(guildId);
  if (!player) {
    player = await shoukaku.joinVoiceChannel({
      guildId,
      shardId: getShardIdForGuild(guild),
      channelId: voiceChannel.id,
      deaf: true,
    });
    attachEndHandler(client, player, guildId);
    await player.setGlobalVolume(
      Math.min(1000, Math.max(0, Number(process.env.MUSIC_DEFAULT_VOLUME ?? 1000))),
    );
  }

  const playing = Boolean(player.track);
  if (playing) {
    session.tracks.push(...tracks);
    return {
      ok: true,
      message: `Aggiunte **${tracks.length}** traccia/e in coda. Posizione: **${session.tracks.length}** — ${describeTrack(tracks[0])}`,
    };
  }

  const [first, ...rest] = tracks;
  session.tracks.push(...rest);
  session.nowPlaying = describeTrack(first);
  try {
    await player.playTrack({ track: { encoded: first.encoded } });
  } catch (err) {
    global.logger?.warn?.("[MUSIC] playTrack:", err?.message || err);
    session.tracks.length = 0;
    await shoukaku.leaveVoiceChannel(guildId).catch(() => {});
    return { ok: false, message: `Riproduzione fallita: ${err?.message || "errore"}` };
  }
  return {
    ok: true,
    message: `In riproduzione: **${describeTrack(first)}**${rest.length ? ` (+${rest.length} in coda)` : ""}`,
  };
}

async function skipGuild(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  try {
    await player.stopTrack();
  } catch (err) {
    return { ok: false, message: err?.message || "Skip fallito." };
  }
  return { ok: true, message: "Traccia saltata." };
}

async function stopGuild(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const guildId = guild.id;
  guildQueues.delete(guildId);
  endListeners.delete(guildId);
  try {
    await client.shoukaku?.leaveVoiceChannel(guildId);
  } catch (_) {}
  return { ok: true, message: "Musica fermata e coda svuotata." };
}

function formatQueue(interaction) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  const session = guildQueues.get(guild.id);
  const lines = [];
  if (player?.track && session?.nowPlaying) {
    lines.push(`**In riproduzione:** ${session.nowPlaying}`);
  } else if (player?.track) {
    lines.push("**In riproduzione** (dettagli non disponibili)");
  } else {
    lines.push("Nessuna traccia attiva.");
  }
  if (session?.tracks?.length) {
    session.tracks.slice(0, 15).forEach((t, i) => {
      lines.push(`${i + 1}. ${describeTrack(t)}`);
    });
    if (session.tracks.length > 15) {
      lines.push(`… e altre ${session.tracks.length - 15}.`);
    }
  } else {
    lines.push("Coda vuota.");
  }
  return { ok: true, message: lines.join("\n") };
}

function nowPlayingStatus(interaction) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  const session = guildQueues.get(guild.id);
  if (!player?.track || !session?.nowPlaying) {
    return { ok: true, message: "Non in riproduzione." };
  }
  return { ok: true, message: `**In riproduzione:** ${session.nowPlaying}` };
}

async function pauseToggle(interaction, pause) {
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  if (!player) return { ok: false, message: "Il bot non è in un canale vocale." };
  try {
    await player.setPaused(pause);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore pausa." };
  }
  return { ok: true, message: pause ? "In pausa." : "Ripresa." };
}

module.exports = {
  initLavalinkMusicIfEnabled,
  isLavalinkUsable,
  playFromInteraction,
  skipGuild,
  stopGuild,
  formatQueue,
  pauseToggle,
  nowPlayingStatus,
};