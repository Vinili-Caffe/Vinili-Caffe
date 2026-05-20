const { EmbedBuilder } = require("discord.js");
const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice");
const { Shoukaku, Connectors, LoadType, Constants, Utils } = require("shoukaku");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const fs = require("fs");
const path = require("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");

const MUSIC_LOGS = String(process.env.MUSIC_LOGS || "0").trim() === "1";
/** Percentuale inviata a Lavalink v4 al join (0–100; Shoukaku default player `volume` = 100 = pieno). */
const MUSIC_DEFAULT_LAVALINK_VOLUME = 20;

/**
 * Lavalink v4: il volume globale del player è in percentuale 0–100 (100 = 100%).
 * La vecchia mappa `percentuale × 10` mandava 10% → 100 (già al massimo) e oltre clip/distorsione.
 * @param {number} percent0to100
 */
function lavalinkGlobalVolumeFromUserPercent(percent0to100) {
  const n = Math.round(Number(percent0to100));
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(0, n));
}

/**
 * `MUSIC_DEFAULT_VOLUME`: percentuale 0–100. Valori >100 interpretati come legacy scala 0–1000 (es. 250 → 25).
 */
function resolveDefaultJoinGlobalVolume() {
  const raw = Number(process.env.MUSIC_DEFAULT_VOLUME);
  if (!Number.isFinite(raw) || raw < 0) return lavalinkGlobalVolumeFromUserPercent(MUSIC_DEFAULT_LAVALINK_VOLUME);
  let v = Math.floor(raw);
  if (v > 100) v = Math.min(100, Math.max(0, Math.round(v / 10)));
  return lavalinkGlobalVolumeFromUserPercent(v);
}
const _musicIdleRawMs = Number(process.env.MUSIC_INACTIVITY_IDLE_MS || 180_000);
const MUSIC_INACTIVITY_MS = Math.max(
  60_000,
  Number.isFinite(_musicIdleRawMs) && _musicIdleRawMs > 0 ? _musicIdleRawMs : 180_000,
);

/**
 * `youtube` (default): testo → ytsearch + ytmsearch.
 * `spotify`: testo = prima spsearch, poi fallback yt/ytm se Spotify non restituisce nulla; **link** YouTube ancora rifiutati.
 * `spotify_first`: stesso ordine di ricerca testo di `spotify`; consente anche **link** YouTube (modalità meno restrittiva).
 * L’audio effettivo dipende dai `providers` Lavalink (lavasrc).
 */
function getMusicSearchMode() {
  const m = String(process.env.MUSIC_SEARCH_MODE || "").trim().toLowerCase();
  if (m === "spotify") return "spotify";
  if (m === "spotify_first") return "spotify_first";
  return "youtube";
}

function isYoutubeLikeUrl(query) {
  const lower = String(query || "").trim().toLowerCase();
  if (!lower.startsWith("http://") && !lower.startsWith("https://")) return false;
  return (
    lower.includes("youtube.com") ||
    lower.includes("youtu.be") ||
    lower.includes("music.youtube.com")
  );
}

/** @type {Map<string, { tracks: unknown[], textChannelId: string | null, nowPlaying: string | null, musicSessionOwnerId?: string | null, currentRequesterUserId?: string | null, currentRequesterUserTag?: string | null, repeatOne?: boolean, repeatEncoded?: string | null, repeatQueue?: boolean, repeatQueueSnapshot?: { encoded: string, label: string }[] | null, history?: { encoded: string, label: string }[] }>} */
const guildQueues = new Map();
/** @type {Set<string>} */
const endListeners = new Set();
/** Evita doppio avanzamento coda sullo stesso brano (end duplicati). */
const lastMusicEndHandledByGuild = new Map();
/** @type {Map<string, number>} guildId -> timestamp (ms) inizio stato “inattivo” */
const musicIdleSince = new Map();
const MUSIC_QUEUE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "musicQueueSnapshot.json");
const MUSIC_QUEUE_SNAPSHOT_INTERVAL_MS = 15000;

function logMusic(...args) {
  if (!MUSIC_LOGS) return;
  global.logger?.info?.("[MUSIC]", ...args);
}

function serializeQueueTrack(track) {
  if (!track) return null;
  const encoded = typeof track?.encoded === "string" ? track.encoded : null;
  if (!encoded) return null;
  const vcRequestedByUserId = track?.vcRequestedByUserId ? String(track.vcRequestedByUserId) : null;
  const vcRequestedByUserTag = track?.vcRequestedByUserTag ? String(track.vcRequestedByUserTag) : null;
  return {
    encoded,
    ...(vcRequestedByUserId ? { vcRequestedByUserId } : {}),
    ...(vcRequestedByUserTag ? { vcRequestedByUserTag } : {}),
  };
}

function serializeEncodedLabelRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row) => {
      const encoded = typeof row?.encoded === "string" ? row.encoded : null;
      if (!encoded) return null;
      const label = row?.label ? String(row.label) : "Traccia";
      return { encoded, label };
    })
    .filter(Boolean);
}

function serializeSessionSnapshot(session) {
  if (!session || typeof session !== "object") return null;
  const tracks = Array.isArray(session.tracks) ? session.tracks.map(serializeQueueTrack).filter(Boolean) : [];
  const history = serializeEncodedLabelRows(Array.isArray(session.history) ? session.history : []);
  const repeatQueueSnapshot = serializeEncodedLabelRows(
    Array.isArray(session.repeatQueueSnapshot) ? session.repeatQueueSnapshot : [],
  );
  const out = {
    tracks,
    textChannelId: session?.textChannelId ? String(session.textChannelId) : null,
    nowPlaying: session?.nowPlaying ? String(session.nowPlaying) : null,
    musicSessionOwnerId: session?.musicSessionOwnerId ? String(session.musicSessionOwnerId) : null,
    currentRequesterUserId: session?.currentRequesterUserId ? String(session.currentRequesterUserId) : null,
    currentRequesterUserTag: session?.currentRequesterUserTag ? String(session.currentRequesterUserTag) : null,
    repeatOne: Boolean(session?.repeatOne),
    repeatEncoded: session?.repeatEncoded ? String(session.repeatEncoded) : null,
    repeatQueue: Boolean(session?.repeatQueue),
    repeatQueueSnapshot,
    history,
    voiceChannelId: session?.voiceChannelId ? String(session.voiceChannelId) : null,
    playingEncoded: session?.playingEncoded ? String(session.playingEncoded) : null,
  };
  const hasResumeHint = Boolean(out.playingEncoded && out.voiceChannelId);
  if (
    !out.tracks.length &&
    !out.nowPlaying &&
    !out.repeatQueue &&
    !out.repeatOne &&
    !out.history.length &&
    !out.repeatQueueSnapshot.length &&
    !hasResumeHint
  ) {
    return null;
  }
  return out;
}

function restoreSessionSnapshotRow(row) {
  if (!row || typeof row !== "object") return null;
  const tracks = Array.isArray(row.tracks)
    ? row.tracks
        .map((t) => {
          const encoded = typeof t?.encoded === "string" ? t.encoded : null;
          if (!encoded) return null;
          return {
            encoded,
            ...(t?.vcRequestedByUserId ? { vcRequestedByUserId: String(t.vcRequestedByUserId) } : {}),
            ...(t?.vcRequestedByUserTag ? { vcRequestedByUserTag: String(t.vcRequestedByUserTag) } : {}),
          };
        })
        .filter(Boolean)
    : [];
  const history = serializeEncodedLabelRows(Array.isArray(row.history) ? row.history : []);
  const repeatQueueSnapshot = serializeEncodedLabelRows(
    Array.isArray(row.repeatQueueSnapshot) ? row.repeatQueueSnapshot : [],
  );
  return {
    tracks,
    textChannelId: row?.textChannelId ? String(row.textChannelId) : null,
    nowPlaying: row?.nowPlaying ? String(row.nowPlaying) : null,
    musicSessionOwnerId: row?.musicSessionOwnerId ? String(row.musicSessionOwnerId) : null,
    currentRequesterUserId: row?.currentRequesterUserId ? String(row.currentRequesterUserId) : null,
    currentRequesterUserTag: row?.currentRequesterUserTag ? String(row.currentRequesterUserTag) : null,
    repeatOne: Boolean(row?.repeatOne),
    repeatEncoded: row?.repeatEncoded ? String(row.repeatEncoded) : null,
    repeatQueue: Boolean(row?.repeatQueue),
    repeatQueueSnapshot: repeatQueueSnapshot.length ? repeatQueueSnapshot : null,
    history,
    voiceChannelId: row?.voiceChannelId ? String(row.voiceChannelId) : null,
    playingEncoded: row?.playingEncoded ? String(row.playingEncoded) : null,
  };
}

function mergeSessionSnapshotFromLivePlayer(client, guildId, session) {
  const gid = String(guildId || "").trim();
  const base = session && typeof session === "object" ? { ...session } : {};
  if (!client?.shoukaku || !gid) return base;
  const player = client.shoukaku.players?.get(gid);
  const conn = client.shoukaku.connections?.get(gid);
  if (typeof player?.track === "string" && player.track.length) {
    base.playingEncoded = player.track;
  }
  if (conn?.channelId) {
    base.voiceChannelId = String(conn.channelId);
  }
  return base;
}

function getGuildMusicVoiceChannelId(guildId) {
  const session = guildQueues.get(String(guildId || "").trim());
  const vc = session?.voiceChannelId;
  return vc ? String(vc) : null;
}

function resolveGuildMusicVoiceChannelId(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const conn = client?.shoukaku?.connections?.get(gid);
  if (conn?.channelId) return String(conn.channelId);
  const guild = client?.guilds?.cache?.get(gid);
  const botVc = guild?.members?.me?.voice?.channelId;
  if (botVc) return String(botVc);
  return getGuildMusicVoiceChannelId(gid);
}

function guildMusicSessionBlocksOtherVoiceChannels(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return { blocked: false, channelId: null };
  const musicVc = resolveGuildMusicVoiceChannelId(client, gid);
  if (!musicVc) return { blocked: false, channelId: null };
  const player = client?.shoukaku?.players?.get(gid);
  const session = guildQueues.get(gid);
  const active =
    Boolean(player?.track) ||
    Boolean(String(session?.nowPlaying || "").trim()) ||
    (Array.isArray(session?.tracks) && session.tracks.length > 0);
  return { blocked: active, channelId: musicVc };
}

function assertRequesterInActiveMusicVoiceChannel(client, guild, member) {
  if (!guild?.id) {
    return { ok: false, message: "Solo in server." };
  }
  const { blocked, channelId } = guildMusicSessionBlocksOtherVoiceChannels(client, guild.id);
  if (!blocked || !channelId) return { ok: true };
  const userVc = member?.voice?.channelId ? String(member.voice.channelId) : "";
  if (userVc === channelId) return { ok: true };
  const channelMention = `<#${channelId}>`;
  if (!userVc) {
    return {
      ok: false,
      message:
        `La musica è attiva in ${channelMention}. Entra in quel canale vocale per usare i comandi musica.`,
    };
  }
  return {
    ok: false,
    message:
      `La musica è attiva in ${channelMention}. Non puoi usare questo comando da un altro canale vocale.`,
  };
}

function assertMusicCommandAllowed(client, guild, member, requesterUserId) {
  const vcGate = assertRequesterInActiveMusicVoiceChannel(client, guild, member);
  if (!vcGate.ok) return vcGate;
  return assertMusicSessionOwnerOrAllowLegacy(guild?.id, requesterUserId);
}

function guildHasMusicVoiceResumeHint(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return false;
  const session = guildQueues.get(gid);
  if (!session) return false;
  const vc = String(session.voiceChannelId || "").trim();
  if (!vc) return false;
  if (String(session.playingEncoded || "").trim()) return true;
  if (session.nowPlaying || (Array.isArray(session.tracks) && session.tracks.length > 0)) return true;
  return false;
}

function persistMusicQueueSnapshotNow(client) {
  try {
    const sessions = {};
    for (const [guildId, session] of guildQueues.entries()) {
      const gid = String(guildId || "").trim();
      if (!gid) continue;
      const merged = mergeSessionSnapshotFromLivePlayer(client, gid, session);
      const serialized = serializeSessionSnapshot(merged);
      if (!serialized) continue;
      sessions[gid] = serialized;
    }
    writeSnapshotWithMeta({
      filePath: MUSIC_QUEUE_SNAPSHOT_PATH,
      walPath: `${MUSIC_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "vinyls_music_queue",
      version: 1,
      payload: { sessions },
    });
  } catch (err) {
    global.logger?.warn?.("[MUSIC] queue snapshot persist failed:", err?.message || err);
  }
}

function scheduleMusicPlaybackResume(client) {
  if (!client || client._musicPlaybackResumeScheduled) return;
  client._musicPlaybackResumeScheduled = true;
  const run = async () => {
    let tries = 0;
    while (tries < 45 && !isLavalinkUsable(client)) {
      await new Promise((r) => setTimeout(r, 1000));
      tries += 1;
    }
    if (!isLavalinkUsable(client)) {
      global.logger?.warn?.("[MUSIC] playback resume skipped: Lavalink node not ready");
      return;
    }
    await resumeRestoredMusicSessions(client).catch((err) => {
      global.logger?.warn?.("[MUSIC] playback resume failed:", err?.message || err);
    });
  };
  setImmediate(() => void run());
}

async function resumeRestoredMusicSessions(client) {
  const sh = client?.shoukaku;
  if (!sh) return;
  for (const [guildId, session] of [...guildQueues.entries()]) {
    const gid = String(guildId || "").trim();
    if (!gid || !session) continue;
    const encoded = String(session.playingEncoded || "").trim();
    const vcId = String(session.voiceChannelId || "").trim();
    if (!encoded || !vcId || !/^\d{17,22}$/.test(vcId)) continue;
    if (sh.players?.get(gid)?.track) continue;
    if (sh.connections?.get(gid)?.channelId) continue;

    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) continue;

    const voiceChannel =
      guild.channels.cache.get(vcId) || (await guild.channels.fetch(vcId).catch(() => null));
    if (!voiceChannel?.isVoiceBased?.()) {
      session.voiceChannelId = null;
      session.playingEncoded = null;
      persistMusicQueueSnapshotNow(client);
      continue;
    }

    const me = guild.members.me;
    if (!voiceChannel.permissionsFor?.(me)?.has?.(["Connect", "Speak", "ViewChannel"])) {
      global.logger?.warn?.("[MUSIC] resume: missing voice permissions", gid);
      continue;
    }
    if (guildHasBlockingNativeVoiceConnection(gid)) {
      global.logger?.warn?.("[MUSIC] resume: blocked by native voice session", gid);
      continue;
    }

    try {
      const { purgeTtsVoicePersistence } = require("../TTS/ttsService");
      await purgeTtsVoicePersistence(gid, client).catch(() => {});
      let player = sh.players.get(gid);
      if (!player) {
        player = await sh.joinVoiceChannel({
          guildId: gid,
          shardId: getShardIdForGuild(guild),
          channelId: voiceChannel.id,
          deaf: true,
        });
      }
      attachEndHandler(client, player, gid);
      await player.setGlobalVolume(resolveDefaultJoinGlobalVolume());
      await playEncodedFromStart(player, encoded);
      persistMusicQueueSnapshotNow(client);
      global.logger?.info?.(`[MUSIC] resumed session in guild ${gid}`);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] resume join/play failed", gid, err?.message || err);
    }
  }
}

function restoreMusicQueueSnapshot() {
  try {
    const raw = readSnapshotWithMeta({
      filePath: MUSIC_QUEUE_SNAPSHOT_PATH,
      walPath: `${MUSIC_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "vinyls_music_queue",
      version: 1,
      fallback: { sessions: {} },
    });
    const sessions = raw?.sessions && typeof raw.sessions === "object" ? raw.sessions : {};
    for (const [guildId, row] of Object.entries(sessions)) {
      const gid = String(guildId || "").trim();
      if (!gid) continue;
      const restored = restoreSessionSnapshotRow(row);
      if (!restored) continue;
      guildQueues.set(gid, restored);
    }
  } catch (err) {
    global.logger?.warn?.("[MUSIC] queue snapshot restore failed:", err?.message || err);
  }
}

function startMusicQueueSnapshotLoop(client) {
  if (client._musicQueueSnapshotTimer) return;
  armShutdownCheckpoint();
  if (!client._musicQueueSnapshotFlushRegistered) {
    client._musicQueueSnapshotFlushRegistered = true;
    registerShutdownFlush("vinyls_music_queue", () => persistMusicQueueSnapshotNow(client));
  }
  client._musicQueueSnapshotTimer = setInterval(() => {
    persistMusicQueueSnapshotNow(client);
  }, MUSIC_QUEUE_SNAPSHOT_INTERVAL_MS);
  client._musicQueueSnapshotTimer.unref?.();
}

/**
 * Sostituisce la traccia partendo da 0 ms: senza `position`, Lavalink può riusare il minutaggio del brano precedente (es. +previous).
 * @param {import("shoukaku").Player} player
 * @param {string} encoded
 */
async function playEncodedFromStart(player, encoded) {
  const enc = String(encoded || "").trim();
  if (!enc || typeof player?.playTrack !== "function") {
    throw new Error("playEncodedFromStart: argomenti non validi");
  }
  await player.playTrack({ track: { encoded: enc }, position: 0 });
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

/** Secondi: handshake voce Discord ↔ Lavalink (Shoukaku `voiceConnectionTimeout`). Env `SHOUKAKU_VOICE_CONNECTION_TIMEOUT`. */
function getShoukakuVoiceConnectionTimeoutSeconds() {
  const n = Number(process.env.SHOUKAKU_VOICE_CONNECTION_TIMEOUT);
  if (Number.isFinite(n) && n >= 15 && n <= 300) return Math.floor(n);
  return 60;
}

function musicJoinVoiceChannelErrorMessage(err) {
  const m = String(err?.message || err || "");
  if (/not established|voice connection/i.test(m)) {
    return (
      "Connessione musica non pronta in tempo. Se il bot era in **TTS** nello stesso server, la musica (Lavalink) non può condividere quella sessione: usa prima il **leave** del TTS, poi `+play`. " +
      "Altrimenti verifica permessi nel canale vocale, firewall/UDP dal server **Lavalink** verso Discord, e opzionalmente `SHOUKAKU_VOICE_CONNECTION_TIMEOUT` (secondi) nel .env."
    );
  }
  return `Entrata in vocale fallita: ${m || "errore sconosciuto"}`;
}

/** True se c’è una VoiceConnection @discordjs/voice (es. TTS): Shoukaku non può joinare senza conflitto. */
function guildHasBlockingNativeVoiceConnection(guildId) {
  const gid = String(guildId || "");
  if (!gid) return false;
  const conn = getVoiceConnection(gid);
  if (!conn) return false;
  return conn.state?.status !== VoiceConnectionStatus.Destroyed;
}

function normalizeLavalinkLoadType(res) {
  const raw = res?.loadType;
  if (raw == null) return "";
  const s = String(raw).trim().toLowerCase();
  if (s === String(LoadType.TRACK).toLowerCase() || s === "track") return "track";
  if (s === String(LoadType.SEARCH).toLowerCase() || s === "search") return "search";
  if (s === String(LoadType.PLAYLIST).toLowerCase() || s === "playlist") return "playlist";
  if (s === String(LoadType.EMPTY).toLowerCase() || s === "empty") return "empty";
  if (s === String(LoadType.ERROR).toLowerCase() || s === "error") return "error";
  return s;
}

/**
 * @param {import("shoukaku").LavalinkResponse | undefined} res
 * @returns {import("shoukaku").Track[]}
 */
function tracksFromResolve(res) {
  if (!res) return [];
  const lt = normalizeLavalinkLoadType(res);
  const d = res.data;
  if (lt === "track") return d ? [d] : [];
  if (lt === "search") {
    if (Array.isArray(d)) return d;
    if (d && Array.isArray(d.tracks)) return d.tracks;
    return [];
  }
  if (lt === "playlist") {
    return Array.isArray(d?.tracks) ? d.tracks : [];
  }
  if (lt === "empty" || lt === "error") return [];
  if (Array.isArray(d) && d.length && d[0]?.encoded != null) return d;
  if (d && typeof d === "object" && d.encoded != null && d.info) return [d];
  if (d && typeof d === "object" && Array.isArray(d.tracks) && d.tracks.length && d.tracks[0]?.encoded != null) {
    return d.tracks;
  }
  return [];
}

function lavalinkErrorHint(res) {
  if (!res || normalizeLavalinkLoadType(res) !== "error" || res.data == null) return null;
  const d = res.data;
  if (typeof d === "string") return d;
  if (typeof d === "object") {
    return d.message || d.exception || d.cause || null;
  }
  return null;
}

function isPlainTextMusicQuery(q) {
  const t = String(q || "").trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return false;
  if (/^spotify:/i.test(t)) return false;
  if (/^[a-z0-9]+search:/i.test(t)) return false;
  return true;
}

const OPEN_SPOTIFY_PATH_RE =
  /^https?:\/\/open\.spotify\.com\/(?:intl-[a-z]{2,}(?:-[a-z]+)?\/)?(playlist|album|track)\/([a-zA-Z0-9]+)\/?(?:[?#].*)?$/i;

function normalizeOpenSpotifyHttpUrl(raw) {
  const s = String(raw || "").trim();
  const m = s.match(OPEN_SPOTIFY_PATH_RE);
  if (!m) return null;
  return `https://open.spotify.com/${m[1].toLowerCase()}/${m[2]}`;
}

function openSpotifyHttpsToSpotifyUri(query) {
  const canon = normalizeOpenSpotifyHttpUrl(query) || String(query || "").trim();
  const m = canon.match(/^https:\/\/open\.spotify\.com\/(playlist|album|track)\/([a-zA-Z0-9]+)$/i);
  if (!m) return null;
  return `spotify:${m[1].toLowerCase()}:${m[2]}`;
}

/** Link Spotify musica: track / album / playlist. Esclusi show ed episode (podcast). */
function isSpotifyPodcastOnlyInput(query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^spotify:(show|episode):/i.test(q)) return true;
  const lower = q.toLowerCase();
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(show|episode)\//i.test(lower);
}

/** Link musica Spotify (web o URI) che Lavalink risolve via LavaSrc, non come stream HTTP. */
function isOpenSpotifyMusicUrlInput(query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^spotify:(playlist|album|track):/i.test(q)) return true;
  const lower = q.toLowerCase();
  if (!lower.includes("open.spotify.com")) return false;
  return /\/(?:intl-[a-z]{2,}(?:-[a-z]+)?\/)?(playlist|album|track)\//i.test(lower);
}

function isLikelySpotifyPodcastTrack(t) {
  const u = String(t?.info?.uri || "").toLowerCase();
  if (u.includes("/episode/") || u.includes("spotify:episode:")) return true;
  const ident = String(t?.info?.identifier || "").toLowerCase().trim();
  if (ident.startsWith("spotify:episode:")) return true;
  return false;
}

/**
 * @param {import("shoukaku").Track[]} tracks
 * @returns {import("shoukaku").Track[]}
 */
function filterOutSpotifyPodcastTracks(tracks) {
  if (!Array.isArray(tracks) || !tracks.length) return [];
  return tracks.filter((t) => !isLikelySpotifyPodcastTrack(t));
}

/**
 * @param {string} userQuery
 * @returns {string[]}
 */
function buildResolveAttempts(userQuery) {
  const raw = String(userQuery || "").trim();
  if (!raw) return [];
  const mode = getMusicSearchMode();
  const primary = normalizeLavalinkResolveQuery(raw);
  const attempts = [primary];
  const spotifyUriAlt = openSpotifyHttpsToSpotifyUri(raw);
  if (spotifyUriAlt && !attempts.includes(spotifyUriAlt)) attempts.push(spotifyUriAlt);
  if (!isPlainTextMusicQuery(raw)) return [...new Set(attempts)];
  if (mode === "youtube") {
    const ytm = `ytmsearch:${raw}`;
    if (!attempts.includes(ytm)) attempts.push(ytm);
  }
  const simplified = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
  if (simplified && simplified !== raw) {
    const alt = normalizeLavalinkResolveQuery(simplified);
    if (!attempts.includes(alt)) attempts.push(alt);
  }
  if (mode === "spotify" || mode === "spotify_first") {
    const extra = [`ytmsearch:${raw}`, `ytsearch:${raw}`];
    if (simplified && simplified !== raw) {
      extra.push(`ytmsearch:${simplified}`, `ytsearch:${simplified}`);
    }
    for (const x of extra) {
      if (!attempts.includes(x)) attempts.push(x);
    }
  }
  return [...new Set(attempts)];
}

/**
 * @param {import("shoukaku").Node} node
 * @param {string} userQuery
 */
async function resolvePlayableTracks(node, userQuery) {
  const attempts = buildResolveAttempts(userQuery);
  let lastResolved = null;
  for (const identifier of attempts) {
    try {
      lastResolved = await node.rest.resolve(identifier);
    } catch (err) {
      logMusic("resolve attempt:", identifier, err?.message || err);
      continue;
    }
    logMusic("resolve ok", { loadType: lastResolved?.loadType, identifier: identifier.slice(0, 80) });
    let tracks = tracksFromResolve(lastResolved);
    if (
      isPlainTextMusicQuery(userQuery) &&
      normalizeLavalinkLoadType(lastResolved) === "search" &&
      tracks.length > 1
    ) {
      tracks = [tracks[0]];
    }
    if (tracks.length) {
      const musicOnly = filterOutSpotifyPodcastTracks(tracks);
      if (musicOnly.length) return { tracks: musicOnly, resolved: lastResolved };
    }
  }
  return { tracks: [], resolved: lastResolved };
}

function describeTrack(t) {
  const info = t?.info;
  if (!info) return "Traccia sconosciuta";
  return `${info.title || "Senza titolo"} — ${info.author || "?"}`;
}

/** Solo encoded + info: niente pluginInfo LavaSrc (evita auto-loop playlist Spotify). */
function trackForManualQueue(track) {
  if (!track) return null;
  const encoded =
    typeof track.encoded === "string"
      ? track.encoded
      : typeof track === "string"
        ? track
        : null;
  if (!encoded) return null;
  const out = { encoded };
  if (track.info && typeof track.info === "object") out.info = track.info;
  if (track.vcRequestedByUserId) out.vcRequestedByUserId = String(track.vcRequestedByUserId);
  if (track.vcRequestedByUserTag) out.vcRequestedByUserTag = String(track.vcRequestedByUserTag);
  return out;
}

function tagTracksWithRequester(tracks, requesterUser) {
  const uid = requesterUser?.id ? String(requesterUser.id) : "";
  const tag = requesterUser
    ? String(requesterUser.globalName || requesterUser.username || "").trim()
    : "";
  return tracks
    .map((t) => {
      const base = trackForManualQueue(t);
      if (!base) return null;
      return {
        ...base,
        vcRequestedByUserId: uid || base.vcRequestedByUserId || null,
        vcRequestedByUserTag: tag || base.vcRequestedByUserTag || null,
      };
    })
    .filter(Boolean);
}

function shiftNextQueueTrack(session, skipEncoded = null) {
  const list = session?.tracks;
  if (!Array.isArray(list)) return null;
  const skip = skipEncoded ? String(skipEncoded) : "";
  while (list.length) {
    const raw = list.shift();
    const row = trackForManualQueue(raw);
    if (!row?.encoded) continue;
    if (skip && row.encoded === skip) continue;
    return row;
  }
  return null;
}

function isNaturalTrackEndReason(reasonRaw) {
  const r = String(reasonRaw || "").toLowerCase();
  return r === "finished" || r === "ended" || r === "finish" || r === "end";
}

function setSessionCurrentRequesterFromUser(session, requesterUser) {
  if (!session) return;
  const uid = requesterUser?.id ? String(requesterUser.id) : "";
  const tag = requesterUser
    ? String(requesterUser.globalName || requesterUser.username || "").trim()
    : "";
  session.currentRequesterUserId = uid || null;
  session.currentRequesterUserTag = tag || null;
}

function clearSessionCurrentRequester(session) {
  if (!session) return;
  session.currentRequesterUserId = null;
  session.currentRequesterUserTag = null;
}

function encodedFromEvTrack(rawT) {
  if (typeof rawT === "string") return rawT;
  if (rawT?.encoded && typeof rawT.encoded === "string") return rawT.encoded;
  return null;
}

function encodedFromPlayerTrack(track) {
  if (typeof track === "string") return track;
  if (track?.encoded && typeof track.encoded === "string") return track.encoded;
  return null;
}

function isMusicPlayingNow(player, session) {
  const enc = encodedFromPlayerTrack(player?.track);
  const label = String(session?.nowPlaying || "").trim();
  return Boolean(enc && label);
}

function buildRepeatQueueSnapshot(session, player) {
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) return [];
  const label = String(session?.nowPlaying || "").trim() || "Traccia";
  const out = [{ encoded: enc, label }];
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  for (const t of pending) {
    if (t?.encoded) {
      out.push({ encoded: t.encoded, label: describeTrack(t) });
    }
  }
  return out;
}

function syncRepeatQueueSnapshotAfterShuffle(session) {
  if (!session?.repeatQueue || !Array.isArray(session.repeatQueueSnapshot) || session.repeatQueueSnapshot.length < 1) {
    return;
  }
  const head = session.repeatQueueSnapshot[0];
  session.repeatQueueSnapshot = [
    head,
    ...session.tracks.map((t) => ({
      encoded: t.encoded,
      label: describeTrack(t),
    })),
  ];
}

function formatSkippedTrackDisplay(label) {
  const s = String(label || "").trim();
  if (!s) return "Traccia sconosciuta";
  return s.replace(/\s*—\s*/g, " di ");
}

function safeEmbedBoldFragment(s) {
  return String(s || "")
    .replace(/\*/g, "")
    .replace(/_/g, "")
    .trim() || "Traccia";
}

const MUSIC_SPOTIFY_URL_LOOKUP = String(process.env.MUSIC_SPOTIFY_URL_LOOKUP || "1").trim() === "1";

function safeDiscordLinkLabel(s) {
  let t = String(s || "").trim();
  t = t.replace(/\*\*/g, "");
  t = t.replace(/[\[\]()]/g, "");
  return t.trim() || "Traccia";
}

function extractOpenSpotifyTrackUrl(uri) {
  const u = String(uri || "").trim();
  const m = u.match(/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(track\/[a-zA-Z0-9]+)/);
  if (m) return `https://open.spotify.com/${m[1]}`;
  return null;
}

function spotifySchemeToTrackHttps(uri) {
  const m = String(uri || "").trim().match(/^spotify:track:([a-zA-Z0-9]+)/i);
  if (m) return `https://open.spotify.com/track/${m[1]}`;
  return null;
}

function spotifyIsrcSearchUrl(t) {
  const raw = String(t?.info?.isrc || "").trim().replace(/\s+/g, "");
  if (!raw) return null;
  const compact = raw.replace(/-/g, "").toUpperCase();
  if (!/^[A-Z0-9]{12}$/.test(compact)) return null;
  const hyphenated = `${compact.slice(0, 2)}-${compact.slice(2, 5)}-${compact.slice(5, 7)}-${compact.slice(7)}`;
  return `https://open.spotify.com/search/isrc%3A${encodeURIComponent(hyphenated)}`;
}

/** URL pagina traccia Spotify (o null). */
function spotifyDirectUrlFromTrack(t) {
  if (!t?.info) return null;
  const uri = String(t.info.uri || "").trim();
  let u = extractOpenSpotifyTrackUrl(uri);
  if (u) return u;
  u = spotifySchemeToTrackHttps(uri);
  if (u) return u;
  const src = String(t.info.sourceName || "").toLowerCase();
  const id = String(t.info.identifier || "").trim();
  if (src.includes("spotify") && /^[a-zA-Z0-9]{21,22}$/.test(id)) {
    return `https://open.spotify.com/track/${id}`;
  }
  return null;
}

/**
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track | undefined | null} track
 */
async function trySpotifyDirectUrlViaSearch(node, track) {
  if (!MUSIC_SPOTIFY_URL_LOOKUP || !node?.rest || !track?.info) return null;
  const title = String(track.info.title || "").trim();
  const author = String(track.info.author || "").trim();
  const q = [title, author].filter(Boolean).join(" ").trim();
  if (q.length < 2) return null;
  const ident = `spsearch:${q.slice(0, 280)}`;
  try {
    const res = await node.rest.resolve(ident);
    const list = tracksFromResolve(res);
    const hit = list[0];
    if (!hit) return null;
    return spotifyDirectUrlFromTrack(hit);
  } catch (err) {
    logMusic("spsearch:", err?.message || err);
    return null;
  }
}

/**
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track | undefined | null} track
 */
async function resolveSpotifyWebUrl(node, track) {
  const direct = spotifyDirectUrlFromTrack(track);
  if (direct) return direct;
  const fromSearch = await trySpotifyDirectUrlViaSearch(node, track);
  if (fromSearch) return fromSearch;
  return spotifyIsrcSearchUrl(track);
}

function formatTrackTitleMarkdownLink(trackLabel, spotifyUrl) {
  const safe = safeDiscordLinkLabel(trackLabel);
  if (spotifyUrl) return `[**${safe}**](${spotifyUrl})`;
  return `**${safe}**`;
}

function resolveSpotifyWebUrlSync(track) {
  if (!track?.info) return null;
  return spotifyDirectUrlFromTrack(track) || spotifyIsrcSearchUrl(track);
}

function splitNowPlayingLabel(label) {
  const s = String(label || "").trim();
  if (!s) return { title: "Traccia", author: "" };
  const em = s.split(/\s*—\s*/);
  if (em.length >= 2) {
    return { title: em[0].trim(), author: em.slice(1).join(" — ").trim() };
  }
  const hy = s.split(/\s+-\s+/);
  if (hy.length >= 2) {
    return { title: hy[0].trim(), author: hy.slice(1).join(" - ").trim() };
  }
  return { title: s, author: "" };
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 * @returns {Promise<{ ok: true, rows: { queueIndex: number, dur: string, title: string, author: string, url: string | null }[] } | { ok: false, message: string }>}
 */
async function fetchGuildQueueEntryRows(client, guild) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  const rows = [];
  let queueIndex = 1;

  function pushRowFromTrack(trackObj) {
    const info = trackObj?.info;
    const title = String(info?.title || "Senza titolo").trim();
    const author = String(info?.author || "?").trim();
    const ms = Number(info?.length || 0);
    const dur = formatTrackDurationMs(ms);
    const url = resolveSpotifyWebUrlSync(trackObj);
    rows.push({ queueIndex, dur, title, author, url });
    queueIndex += 1;
  }

  if (player?.track) {
    if (node?.rest?.decode) {
      try {
        const decoded = await node.rest.decode(encodedFromPlayerTrack(player.track));
        pushRowFromTrack(decoded);
      } catch (err) {
        logMusic("queue decode current:", err?.message || err);
        const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
        const { title, author } = splitNowPlayingLabel(label);
        rows.push({
          queueIndex,
          dur: "—",
          title: title || label,
          author: author || "?",
          url: null,
        });
        queueIndex += 1;
      }
    } else {
      const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        queueIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      queueIndex += 1;
    }
  }

  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    if (!tr?.info) {
      rows.push({
        queueIndex,
        dur: "—",
        title: "Traccia",
        author: "?",
        url: null,
      });
      queueIndex += 1;
      continue;
    }
    pushRowFromTrack(tr);
  }

  if (!rows.length) {
    return { ok: false, message: "La coda è vuota e non c'è nulla in riproduzione." };
  }
  return { ok: true, rows };
}

function formatTrackDurationMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const totalSec = Math.floor(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Posizione riproduzione (anche 0 ms → 00:00). */
function formatPlaybackPositionClock(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return "00:00";
  const totalSec = Math.floor(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatEstimatedUntilPlayMs(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "00:00";
  const totalSec = Math.ceil(n / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Solo brani in coda (non il corrente), con orario stimato di inizio rispetto a ora.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 * @returns {Promise<{ ok: true, rows: { upcomingIndex: number, etaClock: string, title: string, author: string, url: string | null }[] } | { ok: false, message: string }>}
 */
async function fetchGuildUpcomingQueueRows(client, guild) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  if (!pending.length) {
    if (player?.track) {
      return { ok: false, message: "Non ci sono altri brani in coda." };
    }
    return { ok: false, message: "La coda è vuota." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  let offsetMs = 0;
  if (player?.track && node?.rest?.decode) {
    try {
      const cur = await node.rest.decode(encodedFromPlayerTrack(player.track));
      const len = Number(cur?.info?.length);
      if (Number.isFinite(len) && len > 0) {
        const pos = Number(player.position) || 0;
        offsetMs = Math.max(0, len - pos);
      }
    } catch (err) {
      logMusic("upcoming decode current:", err?.message || err);
    }
  }

  const rows = [];
  let cumulative = offsetMs;
  let upcomingIndex = 1;
  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    const etaClock = formatEstimatedUntilPlayMs(cumulative);
    if (!tr?.info) {
      rows.push({
        upcomingIndex,
        etaClock,
        title: "Traccia",
        author: "?",
        url: null,
      });
    } else {
      const title = String(tr.info.title || "Senza titolo").trim();
      const author = String(tr.info.author || "?").trim();
      const url = resolveSpotifyWebUrlSync(tr);
      rows.push({ upcomingIndex, etaClock, title, author, url });
      cumulative += Number(tr.info.length || 0);
    }
    upcomingIndex += 1;
  }
  return { ok: true, rows };
}

/**
 * Cronologia sessione (già riprodotte) + brano attuale + coda.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 * @returns {Promise<{ ok: true, rows: { listIndex: number, dur: string, title: string, author: string, url: string | null }[] } | { ok: false, message: string }>}
 */
async function fetchGuildRequestedSessionRows(client, guild) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  const history = Array.isArray(session?.history) ? session.history : [];
  if (!player?.track && !pending.length && !history.length) {
    return {
      ok: false,
      message:
        "Nessuna traccia in questa sessione (nessuna cronologia, niente in riproduzione e coda vuota). Avvia un brano con +play.",
    };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);

  const rows = [];
  let listIndex = 1;

  function pushRowFromDecoded(tr) {
    const info = tr?.info;
    if (!info) return;
    const title = String(info.title || "Senza titolo").trim();
    const author = String(info.author || "?").trim();
    const ms = Number(info.length || 0);
    const dur = formatTrackDurationMs(ms);
    const url = resolveSpotifyWebUrlSync(tr);
    rows.push({ listIndex, dur, title, author, url });
    listIndex += 1;
  }

  for (const h of history) {
    let tr = null;
    const enc = typeof h?.encoded === "string" ? h.encoded : null;
    if (enc && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(enc);
      } catch (err) {
        logMusic("requested history decode:", err?.message || err);
      }
    }
    if (tr?.info) {
      pushRowFromDecoded(tr);
    } else {
      const label = String(h?.label || "").trim() || "Traccia";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        listIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      listIndex += 1;
    }
  }

  if (player?.track) {
    const enc = encodedFromPlayerTrack(player.track);
    let tr = null;
    if (enc && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(enc);
      } catch (err) {
        logMusic("requested current decode:", err?.message || err);
      }
    }
    if (tr?.info) {
      pushRowFromDecoded(tr);
    } else {
      const label = String(session?.nowPlaying || "").trim() || "In riproduzione";
      const { title, author } = splitNowPlayingLabel(label);
      rows.push({
        listIndex,
        dur: "—",
        title: title || label,
        author: author || "?",
        url: null,
      });
      listIndex += 1;
    }
  }

  for (const t of pending) {
    let tr = t;
    if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
      try {
        tr = await node.rest.decode(tr.encoded);
      } catch (_) {
        tr = null;
      }
    }
    if (!tr?.info) {
      rows.push({
        listIndex,
        dur: "—",
        title: "Traccia",
        author: "?",
        url: null,
      });
      listIndex += 1;
      continue;
    }
    pushRowFromDecoded(tr);
  }

  return { ok: true, rows };
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 */
async function fetchGuildNextUpDetails(client, guild) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  const pending = Array.isArray(session?.tracks) ? session.tracks : [];
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  if (!pending.length) {
    return { ok: false, message: "Non c'è un brano successivo in coda." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);
  const first = pending[0];
  let tr = first;
  if ((!tr?.info || !String(tr.info.title || "").trim()) && tr?.encoded && node?.rest?.decode) {
    try {
      tr = await node.rest.decode(tr.encoded);
    } catch (_) {
      tr = first;
    }
  }
  if (!tr?.info) {
    return { ok: false, message: "Impossibile leggere il prossimo brano." };
  }

  let remainingCurrent = 0;
  const enc = encodedFromPlayerTrack(player.track);
  if (enc && node?.rest?.decode) {
    try {
      const cur = await node.rest.decode(enc);
      const len = Number(cur?.info?.length);
      if (Number.isFinite(len) && len > 0) {
        const pos = Number(player.position) || 0;
        remainingCurrent = Math.max(0, len - pos);
      }
    } catch (err) {
      logMusic("next up decode current:", err?.message || err);
    }
  }

  const estimatedMs = remainingCurrent;
  const lengthMs = Number(tr.info.length || 0);
  const label = describeTrack(tr);
  const url = node ? await resolveSpotifyWebUrl(node, tr) : null;
  const safeLabel = safeDiscordLinkLabel(label);
  const trackFieldValue = (url ? `[${safeLabel}](${url})` : `**${safeLabel}**`).slice(0, 1024);

  const art = String(tr.info.artworkUrl || "").trim();
  const thumbnailUrl = art.startsWith("http://") || art.startsWith("https://") ? art : null;

  return {
    ok: true,
    trackFieldValue,
    estimatedUntil: formatEstimatedUntilPlayMs(estimatedMs),
    length: formatTrackDurationMs(lengthMs),
    positionInQueue: 2,
    thumbnailUrl,
    requesterUserId: first.vcRequestedByUserId || null,
    requesterDisplayTag: first.vcRequestedByUserTag || null,
  };
}

function renderPlaybackProgressBar(positionMs, lengthMs, width = 14) {
  const w = Math.max(4, Math.min(32, Math.floor(Number(width)) || 14));
  const len = Number(lengthMs);
  const pos = Number(positionMs);
  if (!Number.isFinite(len) || len <= 0 || !Number.isFinite(pos) || pos < 0) {
    return "░".repeat(w);
  }
  const frac = Math.min(1, Math.max(0, pos / len));
  const filled = Math.round(frac * w);
  return `${"█".repeat(filled)}${"░".repeat(w - filled)}`;
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 */
async function fetchGuildNowPlayingDetails(client, guild) {
  if (!guild?.id) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const sh = client.shoukaku;
  const player = sh?.players?.get(guildId);
  const session = guildQueues.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const node =
    sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    (sh?.nodes?.size ? sh.nodes.values().next().value : null);
  const positionMs = Number(player.position) || 0;
  const paused = Boolean(player.paused);
  let tr = null;
  if (node?.rest?.decode) {
    try {
      tr = await node.rest.decode(encodedFromPlayerTrack(player.track));
    } catch (err) {
      logMusic("now playing decode:", err?.message || err);
    }
  }
  if (!tr?.info) {
    const label = String(session?.nowPlaying || "").trim();
    if (!label) {
      return { ok: false, message: "Dettagli sul brano in riproduzione non disponibili." };
    }
    const safe = safeDiscordLinkLabel(label);
    return {
      ok: true,
      trackFieldValue: `**${safe}**`.slice(0, 1024),
      progressBar: renderPlaybackProgressBar(positionMs, 0, 14),
      positionClock: formatPlaybackPositionClock(positionMs),
      lengthClock: "—",
      thumbnailUrl: null,
      positionInQueue: 1,
      requesterUserId: session?.currentRequesterUserId || null,
      requesterDisplayTag: session?.currentRequesterUserTag || null,
      paused,
    };
  }
  const lengthMs = Number(tr.info.length || 0);
  const label = describeTrack(tr);
  const url = node ? await resolveSpotifyWebUrl(node, tr) : null;
  const safeLabel = safeDiscordLinkLabel(label);
  const trackFieldValue = (url ? `[${safeLabel}](${url})` : `**${safeLabel}**`).slice(0, 1024);
  const art = String(tr.info.artworkUrl || "").trim();
  const thumbnailUrl = art.startsWith("http://") || art.startsWith("https://") ? art : null;
  return {
    ok: true,
    trackFieldValue,
    progressBar: renderPlaybackProgressBar(positionMs, lengthMs, 14),
    positionClock: formatPlaybackPositionClock(positionMs),
    lengthClock: formatTrackDurationMs(lengthMs),
    thumbnailUrl,
    positionInQueue: 1,
    requesterUserId: session?.currentRequesterUserId || null,
    requesterDisplayTag: session?.currentRequesterUserTag || null,
    paused,
  };
}

/**
 * Testo libero: prefisso Lavalink (`ytsearch:`, `spsearch:`, …). URL passano così come sono.
 * @param {string} raw
 */
function normalizeLavalinkResolveQuery(raw) {
  const q = String(raw || "").trim();
  if (!q) return q;
  const lower = q.toLowerCase();
  if (lower.startsWith("http://") || lower.startsWith("https://")) return q;
  if (/^spotify:/i.test(q)) return q;
  if (/^[a-z0-9]+search:/i.test(q)) return q;
  const envPrefix = String(process.env.MUSIC_SEARCH_PREFIX || "").trim();
  const mode = getMusicSearchMode();
  const fallback =
    mode === "spotify" || mode === "spotify_first" ? "spsearch:" : "ytsearch:";
  const prefix = envPrefix || fallback;
  const p = prefix.endsWith(":") ? prefix : `${prefix}:`;
  return `${p}${q}`;
}

function getSession(guildId) {
  let s = guildQueues.get(guildId);
  if (!s) {
    s = {
      tracks: [],
      textChannelId: null,
      nowPlaying: null,
      voiceChannelId: null,
      playingEncoded: null,
      musicSessionOwnerId: null,
      currentRequesterUserId: null,
      currentRequesterUserTag: null,
      repeatOne: false,
      repeatEncoded: null,
      repeatQueue: false,
      repeatQueueSnapshot: null,
      history: [],
    };
    guildQueues.set(guildId, s);
    return s;
  }
  if (typeof s.repeatOne !== "boolean") s.repeatOne = false;
  if (s.repeatEncoded === undefined) s.repeatEncoded = null;
  if (typeof s.repeatQueue !== "boolean") s.repeatQueue = false;
  if (s.repeatQueueSnapshot === undefined) s.repeatQueueSnapshot = null;
  if (!Array.isArray(s.history)) s.history = [];
  if (s.currentRequesterUserId === undefined) s.currentRequesterUserId = null;
  if (s.currentRequesterUserTag === undefined) s.currentRequesterUserTag = null;
  if (s.musicSessionOwnerId === undefined) s.musicSessionOwnerId = null;
  if (s.voiceChannelId === undefined) s.voiceChannelId = null;
  if (s.playingEncoded === undefined) s.playingEncoded = null;
  return s;
}

/**
 * Comandi “DJ”: chi ha avviato la sessione (`musicSessionOwnerId`) o ha richiesto il brano attuale (`currentRequesterUserId`).
 * Se `musicSessionOwnerId` è assente (sessioni legacy), non bloccare.
 * @param {string} guildId
 * @param {string | null | undefined} requesterUserId
 */
function assertMusicSessionOwnerOrAllowLegacy(guildId, requesterUserId) {
  const session = guildQueues.get(guildId);
  const ownerRaw = session?.musicSessionOwnerId;
  const owner = ownerRaw != null && String(ownerRaw).trim() ? String(ownerRaw).trim() : "";
  const uid = String(requesterUserId || "").trim();
  if (!uid) return { ok: false, message: "Utente non disponibile." };
  if (!owner) return { ok: true };
  if (uid === owner) return { ok: true };
  const curReqRaw = session?.currentRequesterUserId;
  const curReq =
    curReqRaw != null && String(curReqRaw).trim() ? String(curReqRaw).trim() : "";
  if (curReq && uid === curReq) return { ok: true };
  return {
    ok: false,
    message:
      "Solo chi ha avviato la sessione musica o richiesto il **brano in riproduzione** può usare questo comando.",
  };
}

function isLavalinkUsable(client) {
  const sh = client?.shoukaku;
  if (!sh?.nodes?.size) return false;
  const node = sh.nodes.get(process.env.LAVALINK_NODE_NAME || "main") || sh.nodes.values().next().value;
  if (!node) return false;
  return node.state === Constants.State.CONNECTED;
}

/**
 * @param {import("discord.js").Client} client
 * @param {string | null | undefined} textChannelId
 * @param {string | null | undefined} guildId
 */
async function sendMusicQueueEndedEmbed(client, textChannelId, guildId) {
  const cid = String(textChannelId || "").trim();
  const gid = String(guildId || "").trim();
  if (!cid || !client) return;
  try {
    const ch = client.channels.cache.get(cid) || (await client.channels.fetch(cid).catch(() => null));
    if (!ch?.isTextBased?.() || ch.isDMBased?.()) return;
    const guild =
      gid ? client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null)) : ch.guild || null;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription("Coda finita — nessun altro brano in attesa.");
    const payload = applyDefaultFooterToEmbeds({ embeds: [embed] }, guild || ch.guild);
    await ch.send(payload).catch(() => {});
  } catch (_) {}
}

async function sendMusicKickedFromVoiceEmbed(client, textChannelId, guildId) {
  const cid = String(textChannelId || "").trim();
  const gid = String(guildId || "").trim();
  if (!cid || !client) return;
  try {
    const ch = client.channels.cache.get(cid) || (await client.channels.fetch(cid).catch(() => null));
    if (!ch?.isTextBased?.() || ch.isDMBased?.()) return;
    const guild =
      gid ? client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null)) : ch.guild || null;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription("Sono stato rimosso dal canale vocale 🙁");
    const payload = applyDefaultFooterToEmbeds({ embeds: [embed] }, guild || ch.guild);
    await ch.send(payload).catch(() => {});
  } catch (_) {}
}

async function sendMusicInactivityLeaveEmbed(client, textChannelId, guildId) {
  const cid = String(textChannelId || "").trim();
  const gid = String(guildId || "").trim();
  if (!cid || !client) return;
  try {
    const ch = client.channels.cache.get(cid) || (await client.channels.fetch(cid).catch(() => null));
    if (!ch?.isTextBased?.() || ch.isDMBased?.()) return;
    const guild =
      gid ? client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null)) : ch.guild || null;
    const mins = Math.max(1, Math.round(MUSIC_INACTIVITY_MS / 60_000));
    const minLabel = mins === 1 ? "1 minuto" : `${mins} minuti`;
    const embed = new EmbedBuilder()
      .setColor(0xed4245)
      .setDescription(
        `Non è in riproduzione alcun brano oppure non c'è nessuno nel canale vocale da ${minLabel}: esco 👋`,
      );
    const payload = applyDefaultFooterToEmbeds({ embeds: [embed] }, guild || ch.guild);
    await ch.send(payload).catch(() => {});
  } catch (_) {}
}

/**
 * Canale vocale vuoto: non far uscire subito il bot se c’è una sessione Lavalink musica (timer 3 min).
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 */
function shouldDeferTtsLeaveForMusicEmptyVc(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client?.shoukaku) return false;
  return Boolean(client.shoukaku.connections.get(gid)?.channelId);
}

function isMusicSessionQueueIdle(guildId) {
  const session = guildQueues.get(String(guildId || "").trim());
  const np = String(session?.nowPlaying || "").trim();
  const pending = Array.isArray(session?.tracks) ? session.tracks.length : 0;
  return !np && pending === 0;
}

async function tickMusicInactivity(client) {
  const sh = client.shoukaku;
  if (!sh?.connections?.size) {
    musicIdleSince.clear();
    return;
  }
  const now = Date.now();
  for (const [guildId, conn] of sh.connections) {
    const gid = String(guildId || "").trim();
    if (!gid || !conn?.channelId) continue;
    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) continue;
    const vc =
      guild.channels.cache.get(String(conn.channelId)) ||
      (await guild.channels.fetch(String(conn.channelId)).catch(() => null));
    if (!vc?.isVoiceBased?.()) continue;
    let humans = 0;
    for (const m of vc.members.values()) {
      if (!m.user?.bot) humans += 1;
    }
    const player = sh.players.get(gid);
    const queueIdle = isMusicSessionQueueIdle(gid);
    const activelyPlaying = Boolean(player?.track) && !player.paused && !queueIdle;
    const unhealthy = !activelyPlaying || humans === 0;
    if (!unhealthy) {
      musicIdleSince.delete(gid);
      continue;
    }
    if (!musicIdleSince.has(gid)) {
      musicIdleSince.set(gid, now);
      continue;
    }
    const since = musicIdleSince.get(gid) || now;
    if (now - since < MUSIC_INACTIVITY_MS) continue;
    musicIdleSince.delete(gid);
    const session = guildQueues.get(gid);
    const textChannelId = session?.textChannelId || null;
    guildQueues.delete(gid);
    endListeners.delete(gid);
    try {
      const pl = sh.players.get(gid);
      if (pl) await pl.destroy();
    } catch (_) {}
    await leaveMusicVoiceChannelMarked(client, gid);
    if (textChannelId) {
      await sendMusicInactivityLeaveEmbed(client, textChannelId, gid);
    }
    const { leaveTtsGuild } = require("../TTS/ttsService");
    await leaveTtsGuild(gid, client).catch(() => {});
  }
}

function startMusicInactivityWatcher(client) {
  if (client._musicInactivityTickTimer) return;
  client._musicInactivityTickTimer = setInterval(() => {
    void tickMusicInactivity(client).catch((e) => {
      global.logger?.warn?.("[MUSIC] inactivity tick:", e?.message || e);
    });
  }, 15_000);
  client._musicInactivityTickTimer.unref?.();
}

/**
 * Evita l’embed “kick” quando lasciamo il vocale da codice (stop, fine coda, cambio stanza, ecc.).
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 */
function markMusicVoiceLeaveIntentional(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return;
  if (!client._musicIntentionalVoiceLeaveGuildIds) client._musicIntentionalVoiceLeaveGuildIds = new Set();
  client._musicIntentionalVoiceLeaveGuildIds.add(gid);
  const t = setTimeout(() => {
    client._musicIntentionalVoiceLeaveGuildIds?.delete(gid);
  }, 5000);
  t.unref?.();
}

/**
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 */
async function leaveMusicVoiceChannelMarked(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return;
  musicIdleSince.delete(gid);
  lastMusicEndHandledByGuild.delete(gid);
  markMusicVoiceLeaveIntentional(client, gid);
  const pl = client.shoukaku?.players?.get(gid);
  if (pl?.removeAllListeners) pl.removeAllListeners("end");
  endListeners.delete(gid);
  if (client.shoukaku) {
    await client.shoukaku.leaveVoiceChannel(gid).catch(() => {});
  }
}

/**
 * Bot uscito dal vocale senza leave “intenzionale” (es. kick / disconnessione): pulizia sessione musica + embed.
 * `intentional` sopprime solo l’embed (leave da codice), non la pulizia: altrimenti resta un player Lavalink “fantasma”.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 */
async function handleMusicBotVoiceDisconnect(client, guild) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !client) return;
  const intentional = Boolean(client._musicIntentionalVoiceLeaveGuildIds?.has(gid));
  if (intentional) {
    client._musicIntentionalVoiceLeaveGuildIds?.delete(gid);
  }
  const sh = client.shoukaku;
  const session = guildQueues.get(gid);
  const hadPlayer = Boolean(sh?.players?.get(gid));
  const hadConn = Boolean(sh?.connections?.get(gid)?.channelId);
  const hadSessionMusic = Boolean(session && (session.tracks?.length || session.nowPlaying));
  const hadResumeHint = Boolean(
    session?.voiceChannelId && String(session.playingEncoded || "").trim(),
  );
  const textChannelId = session?.textChannelId || null;
  if (hadPlayer || hadSessionMusic || hadConn || hadResumeHint) {
    guildQueues.delete(gid);
    endListeners.delete(gid);
    if (sh?.players?.get(gid)) {
      try {
        await sh.players.get(gid).destroy();
      } catch (_) {}
    }
    try {
      await sh?.leaveVoiceChannel(gid);
    } catch (_) {}
    if (textChannelId && !intentional) {
      await sendMusicKickedFromVoiceEmbed(client, textChannelId, gid);
    }
  }
  persistMusicQueueSnapshotNow(client);
  const { purgeTtsVoicePersistence } = require("../TTS/ttsService");
  await purgeTtsVoicePersistence(gid, client).catch(() => {});
  try {
    const { clearVoiceSession } = require("../Voice/voiceSessionService");
    clearVoiceSession(gid);
  } catch (_) {}
}

/**
 * Se il bot non è in vocale su Discord ma Lavalink ha ancora sessione (kick / desync), azzera tutto.
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild} guild
 */
async function destroyGhostMusicStateIfBotNotInVoice(client, guild) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !client?.shoukaku) return;
  if (guild.members?.me?.voice?.channel?.id) return;
  const sh = client.shoukaku;
  const player = sh.players?.get(gid);
  const conn = sh.connections?.get(gid);
  const session = guildQueues.get(gid);
  const stale =
    Boolean(player?.track) ||
    Boolean(conn?.channelId) ||
    Boolean(session && (session.tracks?.length || session.nowPlaying));
  if (!stale) return;
  endListeners.delete(gid);
  guildQueues.delete(gid);
  try {
    if (player) await player.destroy();
  } catch (_) {}
  try {
    await sh.leaveVoiceChannel(gid);
  } catch (_) {}
}

/**
 * @param {import("shoukaku").Player} player
 * @param {string} guildId
 */
function attachEndHandler(client, player, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !player) return;
  if (typeof player.removeAllListeners === "function") player.removeAllListeners("end");
  endListeners.add(gid);
  player.on("end", async (ev) => {
    const reasonRaw = String(ev?.reason ?? ev?.endReason ?? "").toLowerCase();
    if (reasonRaw === "replaced") return;
    const session = guildQueues.get(gid);
    if (!session) return;
    const endedEncoded = encodedFromEvTrack(ev?.track);
    const now = Date.now();
    const prevEnd = lastMusicEndHandledByGuild.get(gid);
    if (
      endedEncoded &&
      prevEnd?.encoded === endedEncoded &&
      now - Number(prevEnd?.at || 0) < 900
    ) {
      return;
    }
    lastMusicEndHandledByGuild.set(gid, { encoded: endedEncoded || "", at: now });
    const naturalEnd = isNaturalTrackEndReason(reasonRaw);
    if (!session.repeatQueue && session.repeatOne && naturalEnd) {
      const encoded = endedEncoded || session.repeatEncoded;
      if (typeof encoded === "string" && encoded.length) {
        try {
          await playEncodedFromStart(player, encoded);
          session.playingEncoded = encoded;
          return;
        } catch (err) {
          logMusic("repeat replay:", err?.message || err);
          session.repeatOne = false;
          session.repeatEncoded = null;
        }
      }
    }
    const endedLabel = String(session.nowPlaying || "").trim() || "Traccia";
    const next = shiftNextQueueTrack(session, endedEncoded);
    if (!next) {
      if (
        session.repeatQueue &&
        Array.isArray(session.repeatQueueSnapshot) &&
        session.repeatQueueSnapshot.length
      ) {
        if (typeof endedEncoded === "string" && endedEncoded.length) {
          session.history.push({ encoded: endedEncoded, label: endedLabel });
          while (session.history.length > 64) session.history.shift();
        }
        const snap = session.repeatQueueSnapshot;
        session.tracks = snap.slice(1).map((e) => ({ encoded: e.encoded }));
        const head = snap[0];
        session.nowPlaying = String(head.label || "").trim() || "Traccia sconosciuta";
        clearSessionCurrentRequester(session);
        try {
          await playEncodedFromStart(player, head.encoded);
          session.playingEncoded = head.encoded;
          return;
        } catch (err) {
          logMusic("repeat queue loop:", err?.message || err);
          session.repeatQueue = false;
          session.repeatQueueSnapshot = null;
        }
      }
      const notifyChannelId = session.textChannelId || null;
      session.nowPlaying = null;
      session.playingEncoded = null;
      clearSessionCurrentRequester(session);
      session.tracks = [];
      session.repeatOne = false;
      session.repeatEncoded = null;
      session.repeatQueue = false;
      session.repeatQueueSnapshot = null;
      musicIdleSince.set(guildId, Date.now());
      persistMusicQueueSnapshotNow(client);
      await sendMusicQueueEndedEmbed(client, notifyChannelId, guildId);
      return;
    }
    if (typeof endedEncoded === "string" && endedEncoded.length) {
      session.history.push({ encoded: endedEncoded, label: endedLabel });
      while (session.history.length > 64) session.history.shift();
    }
    session.nowPlaying = describeTrack(next);
    session.currentRequesterUserId = next?.vcRequestedByUserId || null;
    session.currentRequesterUserTag = next?.vcRequestedByUserTag || null;
    if (session.repeatOne && next?.encoded) {
      session.repeatEncoded = next.encoded;
    }
    try {
      await playEncodedFromStart(player, next.encoded);
      session.playingEncoded = next.encoded;
    } catch (err) {
      global.logger?.warn?.("[MUSIC] play next failed:", err?.message || err);
      await leaveMusicVoiceChannelMarked(client, guildId);
      guildQueues.delete(guildId);
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
    client._shoukakuInitDone = true;
    return;
  }
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
      voiceConnectionTimeout: getShoukakuVoiceConnectionTimeoutSeconds(),
    });
    /* Il connector DiscordJS registra `once("clientReady")`. Se init gira già dentro ready/clientReady,
     * l'evento è passato: i nodi non si aggiungono mai (nodes.size 0). Stessa logica di Connector#ready. */
    if (typeof client.isReady === "function" && client.isReady() && client.user?.id && shoukaku.nodes.size === 0) {
      shoukaku.id = client.user.id;
      for (const nodeOpt of nodes) {
        shoukaku.addNode(Utils.mergeDefault(Constants.NodeDefaults, { ...nodeOpt }));
      }
    }
    client.shoukaku = shoukaku;
    client._shoukakuInitDone = true;
    restoreMusicQueueSnapshot();
    shoukaku.on("error", (name, err) => {
      global.logger?.warn?.(`[MUSIC] Shoukaku node ${name}:`, err?.message || err);
    });
    shoukaku.on("ready", (name) => {
      global.logger?.info?.(`[MUSIC] Lavalink collegato (nodo ${name})`);
    });
    startMusicInactivityWatcher(client);
    startMusicQueueSnapshotLoop(client);
    scheduleMusicPlaybackResume(client);
  } catch (err) {
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  }
}

/**
 * @param {{ client: import("discord.js").Client; guild: import("discord.js").Guild; member: import("discord.js").GuildMember | import("discord.js").APIInteractionGuildMember | null; textChannelId?: string | null; requesterUser?: import("discord.js").User | null }} ctx
 * @param {string} query
 */
async function playMusicRequest(ctx, query) {
  const client = ctx.client;
  const guild = ctx.guild;
  const member = ctx.member;
  const textChannelId = ctx.textChannelId ?? null;
  const requesterUser = ctx.requesterUser ?? null;
  if (!guild || !member) {
    return { ok: false, message: "Usa questo comando in un server." };
  }
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    const sh = client?.shoukaku;
    const node =
      sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
      (sh?.nodes?.size ? sh.nodes.values().next().value : undefined);
    const state = node?.state;
    global.logger?.warn?.("[MUSIC] play bloccato: nodo Shoukaku non CONNECTED", {
      hasShoukaku: Boolean(sh),
      nodes: sh?.nodes?.size ?? 0,
      state: state != null ? String(state) : "no-node",
      initDone: Boolean(client._shoukakuInitDone),
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

  const guildId = guild.id;
  if (guildHasBlockingNativeVoiceConnection(guildId)) {
    return {
      ok: false,
      message:
        "Il bot ha già una sessione **TTS** in vocale: la musica non può avviarsi insieme. Fai uscire il TTS con il comando **leave** del modulo TTS, poi riprova `+play`.",
    };
  }

  await destroyGhostMusicStateIfBotNotInVoice(client, guild);

  const shoukaku = client.shoukaku;
  const musicLock = guildMusicSessionBlocksOtherVoiceChannels(client, guildId);
  if (
    musicLock.blocked &&
    musicLock.channelId &&
    String(voiceChannel.id) !== musicLock.channelId
  ) {
    const channelMention = `<#${musicLock.channelId}>`;
    return {
      ok: false,
      message:
        `La musica è attiva in ${channelMention}. Non puoi usare la musica da un altro canale vocale.`,
    };
  }

  const existingConn = shoukaku.connections.get(guildId);
  if (
    !musicLock.blocked &&
    existingConn?.channelId &&
    existingConn.channelId !== voiceChannel.id
  ) {
    await leaveMusicVoiceChannelMarked(client, guildId);
    endListeners.delete(guildId);
  }

  const node =
    shoukaku.nodes.get(process.env.LAVALINK_NODE_NAME || "main") ||
    shoukaku.getIdealNode() ||
    shoukaku.nodes.values().next().value;
  if (!node?.rest) {
    return { ok: false, message: "Nessun nodo Lavalink disponibile." };
  }

  const trimmedInput = String(query || "").trim();
  if (!trimmedInput) {
    return { ok: false, message: "Indica un titolo o un link." };
  }
  const trimmed = normalizeOpenSpotifyHttpUrl(trimmedInput) || trimmedInput;
  if (isSpotifyPodcastOnlyInput(trimmed)) {
    return {
      ok: false,
      message:
        "Su Spotify sono supportati **brani**, **album** e **playlist**; i **podcast** (link *show* / *episode*) no.",
    };
  }
  if (getMusicSearchMode() === "spotify" && isYoutubeLikeUrl(trimmed)) {
    return {
      ok: false,
      message:
        "È attiva la modalità **solo Spotify** (`MUSIC_SEARCH_MODE=spotify`): i link YouTube non sono accettati. Usa link **open.spotify.com** / **spotify:** oppure cerca per titolo.",
    };
  }

  let resolved;
  let tracks;
  try {
    ({ tracks, resolved } = await resolvePlayableTracks(node, trimmed));
  } catch (err) {
    global.logger?.warn?.("[MUSIC] resolve:", err?.message || err);
    return {
      ok: false,
      message: `Ricerca fallita: ${err?.message || "errore Lavalink"}`,
    };
  }

  if (!tracks.length) {
    const hint = lavalinkErrorHint(resolved);
    const noResultsEmbed = new EmbedBuilder()
      .setColor(0xff0000)
      .setDescription("**Nessun risultato** ⛔");
    let msg = hint
      ? `Nessun risultato. (${hint})`
      : "Nessun risultato per questa ricerca o URL.";
    if (!hint && isPlainTextMusicQuery(trimmed)) {
      msg += " Prova con **titolo e artista** o un link **open.spotify.com** / YouTube (se consentito dalla modalità).";
    }
    if (isOpenSpotifyMusicUrlInput(trimmed)) {
      const needsLavasrcHint =
        !hint || /unknown file format|file format/i.test(String(hint || ""));
      if (needsLavasrcHint) {
        msg +=
          " Per **Spotify** il nodo **Lavalink** deve avere il plugin **LavaSrc** con **clientId** e **clientSecret** in `application.yml` (altrimenti spesso nei log compare `Unknown file format`: viene scaricata la pagina web al posto dei brani). Vedi `Lavalink/README.md` e riavvia Lavalink.";
      }
    }
    return {
      ok: false,
      message: msg,
      embeds: [noResultsEmbed],
    };
  }

  const session = getSession(guildId);
  session.textChannelId = textChannelId;
  session.voiceChannelId = voiceChannel.id;
  const { purgeTtsVoicePersistence } = require("../TTS/ttsService");
  await purgeTtsVoicePersistence(guildId, client).catch(() => {});

  let player = shoukaku.players.get(guildId);
  if (!player) {
    try {
      player = await shoukaku.joinVoiceChannel({
        guildId,
        shardId: getShardIdForGuild(guild),
        channelId: voiceChannel.id,
        deaf: true,
      });
    } catch (err) {
      global.logger?.warn?.("[MUSIC] joinVoiceChannel:", err?.message || err);
      return { ok: false, message: musicJoinVoiceChannelErrorMessage(err) };
    }
    attachEndHandler(client, player, guildId);
    const volume = resolveDefaultJoinGlobalVolume();
    await player.setGlobalVolume(volume);
  }

  const playing = isMusicPlayingNow(player, session);
  if (playing) {
    const beforeLen = session.tracks.length;
    let remainingCurrent = 0;
    const encoded = player.track;
    if (encoded && typeof node.rest.decode === "function") {
      try {
        const cur = await node.rest.decode(encoded);
        const len = Number(cur?.info?.length);
        if (Number.isFinite(len) && len > 0) {
          const pos = Number(player.position) || 0;
          remainingCurrent = Math.max(0, len - pos);
        }
      } catch (err) {
        logMusic("decode current:", err?.message || err);
      }
    }
    let queuedBeforeMs = 0;
    for (let i = 0; i < beforeLen; i += 1) {
      queuedBeforeMs += Number(session.tracks[i]?.info?.length || 0);
    }
    const estimatedMs = remainingCurrent + queuedBeforeMs;
    session.tracks.push(...tagTracksWithRequester(tracks, requesterUser));
    if (session.repeatQueue && Array.isArray(session.repeatQueueSnapshot)) {
      for (const t of tracks) {
        if (t?.encoded) {
          session.repeatQueueSnapshot.push({
            encoded: t.encoded,
            label: describeTrack(t),
          });
        }
      }
    }

    const t0 = tracks[0];
    const label0 = describeTrack(t0);
    const url0 = await resolveSpotifyWebUrl(node, t0);
    const safeLabel = safeDiscordLinkLabel(label0);
    const trackFieldValue = (url0 ? `[${safeLabel}](${url0})` : `**${safeLabel}**`).slice(0, 1024);

    const queueStart = beforeLen + 1;
    const queueEnd = session.tracks.length;
    const posInQueue = tracks.length > 1 ? `${queueStart}–${queueEnd}` : String(queueStart);
    const upcomingLabel = beforeLen === 0 ? "Prossimo" : `Dopo ${beforeLen} brani`;

    const embed = new EmbedBuilder()
      .setColor(0x6f4e37)
      .setTitle("Brano aggiunto")
      .addFields(
        { name: "Traccia", value: trackFieldValue, inline: false },
        {
          name: "Tempo stimato alla riproduzione",
          value: formatEstimatedUntilPlayMs(estimatedMs),
          inline: true,
        },
        { name: "Durata della traccia", value: formatTrackDurationMs(t0?.info?.length), inline: true },
        { name: "Tra i prossimi brani", value: upcomingLabel, inline: true },
        { name: "Posizione in coda", value: posInQueue, inline: true },
      );

    const art = String(t0?.info?.artworkUrl || "").trim();
    if (art.startsWith("http://") || art.startsWith("https://")) embed.setThumbnail(art);

    if (tracks.length > 1) {
      embed.setDescription(`*+ ${tracks.length - 1} altre tracce in coda.*`);
    }

    if (requesterUser && typeof requesterUser.displayAvatarURL === "function") {
      const nome = String(requesterUser.globalName || requesterUser.username || "Utente").trim() || "Utente";
      embed.setFooter({
        text: `Richiesto da ${nome}`.slice(0, 2048),
        iconURL: requesterUser.displayAvatarURL({ size: 64 }),
      });
    }

    return {
      ok: true,
      message: `Aggiunte **${tracks.length}** traccia/e in coda — ${label0}`,
      embeds: [embed],
    };
  }

  const normalized = tagTracksWithRequester(tracks, requesterUser);
  if (!normalized.length) {
    return { ok: false, message: "Nessun brano valido da riprodurre." };
  }
  const [first, ...rest] = normalized;
  session.tracks.push(...rest);
  session.nowPlaying = describeTrack(first);
  setSessionCurrentRequesterFromUser(session, requesterUser);
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.repeatQueue = false;
  session.repeatQueueSnapshot = null;
  session.history = [];
  try {
    await playEncodedFromStart(player, first.encoded);
  } catch (err) {
    global.logger?.warn?.("[MUSIC] playTrack:", err?.message || err);
    session.tracks.length = 0;
    session.musicSessionOwnerId = null;
    await leaveMusicVoiceChannelMarked(client, guildId);
    return { ok: false, message: `Riproduzione fallita: ${err?.message || "errore"}` };
  }
  session.playingEncoded = first.encoded;
  persistMusicQueueSnapshotNow(client);
  session.musicSessionOwnerId = requesterUser?.id ? String(requesterUser.id) : null;
  const label = describeTrack(first);
  const spotifyUrl = await resolveSpotifyWebUrl(node, first);
  const linkMd = formatTrackTitleMarkdownLink(label, spotifyUrl);
  const tail = rest.length ? ` (+${rest.length} in coda)` : "";
  const embedBody = `In riproduzione: ${linkMd}${tail}`;
  return {
    ok: true,
    message: `In riproduzione: **${label}**${tail}`,
    embedBody,
  };
}

/**
 * @param {import("discord.js").Client} client
 * @param {import("discord.js").Guild | null} guild
 * @param {string | number | null | undefined} rawPercent volume utente 0–100
 * @param {string | null | undefined} requesterUserId
 */
async function setGuildMusicVolume(client, guild, rawPercent, requesterUserId) {
  const guildId = guild?.id;
  if (!guildId) return { ok: false, message: "Solo in server." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guildId);
  if (!player) {
    return { ok: false, message: "Nessun player musica attivo in questo server." };
  }
  const member =
    guild.members.cache.get(String(requesterUserId || "")) ||
    (await guild.members.fetch(String(requesterUserId || "")).catch(() => null));
  const volGate = assertMusicCommandAllowed(client, guild, member, requesterUserId);
  if (!volGate.ok) return volGate;
  const n = Number(String(rawPercent ?? "").trim().replace(",", "."));
  if (!Number.isFinite(n)) {
    return { ok: false, message: "Indica un numero da 0 a 100." };
  }
  const userVol = Math.min(100, Math.max(0, Math.round(n)));
  const lavalinkVol = lavalinkGlobalVolumeFromUserPercent(userVol);
  try {
    await player.setGlobalVolume(lavalinkVol);
  } catch (err) {
    return { ok: false, message: err?.message || "Impostazione volume fallita." };
  }
  return { ok: true, volumePercent: userVol };
}

async function skipGuild(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  const requester = interaction.user || interaction.author;
  if (!guild) return { ok: false, message: "Solo in server." };
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const gate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!gate.ok) return gate;
  const session = guildQueues.get(guildId);
  let skippedLabel = String(session?.nowPlaying || "").trim();
  if (!skippedLabel) {
    const sh = client.shoukaku;
    const node =
      sh?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
      (typeof sh?.getIdealNode === "function" ? sh.getIdealNode() : null) ||
      (sh?.nodes?.size ? sh.nodes.values().next().value : null);
    if (node?.rest?.decode && player.track) {
      try {
        const t = await node.rest.decode(player.track);
        skippedLabel = describeTrack(t);
      } catch (_) {}
    }
  }
  if (!skippedLabel) skippedLabel = "Traccia sconosciuta";
  const trackDisplay = safeEmbedBoldFragment(formatSkippedTrackDisplay(skippedLabel));
  try {
    await player.stopTrack();
  } catch (err) {
    return { ok: false, message: err?.message || "Skip fallito." };
  }
  return {
    ok: true,
    message: "Traccia saltata.",
    embedDescription: `**${trackDisplay}** è stata saltata da <@${requester.id}>`,
  };
}

async function stopGuild(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  const guildId = guild.id;
  initLavalinkMusicIfEnabled(client);
  await destroyGhostMusicStateIfBotNotInVoice(client, guild);
  const sh = client.shoukaku;
  const session = guildQueues.get(guildId);
  const player = sh?.players?.get(guildId);
  const conn = sh?.connections?.get(guildId);
  const active =
    Boolean(conn?.channelId) ||
    Boolean(player?.track) ||
    Boolean(session?.tracks?.length) ||
    Boolean(session?.nowPlaying);
  if (!active) {
    return { ok: false, message: "Non c'è musica attiva in questo server." };
  }
  if (!guild.members?.me?.voice?.channel?.id) {
    return {
      ok: false,
      message: "Il bot non è in un canale vocale: non c'è una sessione musica da fermare.",
    };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const stopGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!stopGate.ok) return stopGate;
  guildQueues.delete(guildId);
  endListeners.delete(guildId);
  if (player) {
    try {
      await player.destroy();
    } catch (_) {}
  }
  await leaveMusicVoiceChannelMarked(client, guildId);
  persistMusicQueueSnapshotNow(client);
  const { purgeTtsVoicePersistence } = require("../TTS/ttsService");
  await purgeTtsVoicePersistence(guildId, client).catch(() => {});
  try {
    const { clearVoiceSession } = require("../Voice/voiceSessionService");
    clearVoiceSession(guildId);
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
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  const player = interaction.client.shoukaku?.players?.get(guild.id);
  if (!player) return { ok: false, message: "Il bot non è in un canale vocale." };
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const ptGate = assertMusicCommandAllowed(interaction.client, guild, member, requester.id);
  if (!ptGate.ok) return ptGate;
  try {
    await player.setPaused(pause);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore pausa." };
  }
  return { ok: true, message: pause ? "In pausa." : "Ripresa." };
}

async function pauseGuildTrack(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player) {
    return { ok: false, message: "Il bot non è in un canale vocale." };
  }
  if (!player.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const pauGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!pauGate.ok) return pauGate;
  if (player.paused) {
    return { ok: false, message: "La traccia è già in pausa." };
  }
  const posMs = Number(player.position) || 0;
  const at = formatPlaybackPositionClock(posMs);
  try {
    await player.setPaused(true);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore pausa." };
  }
  return { ok: true, positionLabel: at };
}

async function resumeGuildTrack(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player) {
    return { ok: false, message: "Il bot non è in un canale vocale." };
  }
  if (!player.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const resGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!resGate.ok) return resGate;
  if (!player.paused) {
    return { ok: false, message: "La traccia non è in pausa." };
  }
  try {
    await player.setPaused(false);
  } catch (err) {
    return { ok: false, message: err?.message || "Errore ripresa." };
  }
  return { ok: true };
}

function shuffleInPlace(arr) {
  if (!Array.isArray(arr) || arr.length < 2) return;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

/**
 * @param {unknown} interaction
 * @param {string} [keyword] disable | enable | queue | off | on | vuoto (toggle)
 */
async function toggleRepeatOneGuild(interaction, keyword) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const repGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!repGate.ok) return repGate;
  const session = getSession(guild.id);
  const kw = String(keyword || "").trim().toLowerCase();

  if (kw === "disable" || kw === "off") {
    session.repeatOne = false;
    session.repeatEncoded = null;
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    return { ok: true, mode: "off", explicit: true };
  }
  if (kw === "queue") {
    session.repeatOne = false;
    session.repeatEncoded = null;
    session.repeatQueue = true;
    session.repeatQueueSnapshot = buildRepeatQueueSnapshot(session, player);
    if (!session.repeatQueueSnapshot.length) {
      session.repeatQueue = false;
      session.repeatQueueSnapshot = null;
      return { ok: false, message: "Impossibile attivare la ripetizione coda per questa traccia." };
    }
    return { ok: true, mode: "queue" };
  }
  if (kw === "enable" || kw === "on") {
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    if (session.repeatOne) {
      return { ok: true, mode: "on", already: true };
    }
    const enc = encodedFromPlayerTrack(player.track);
    if (!enc) {
      return { ok: false, message: "Impossibile attivare la ripetizione per questa traccia." };
    }
    session.repeatOne = true;
    session.repeatEncoded = enc;
    return { ok: true, mode: "on" };
  }
  if (kw) {
    return {
      ok: false,
      message:
        "Usa **disable**, **enable**, **queue**, oppure nessun argomento (toggle ripetizione traccia).",
    };
  }
  if (session.repeatQueue) {
    session.repeatQueue = false;
    session.repeatQueueSnapshot = null;
    return { ok: true, mode: "off", queueOff: true };
  }
  if (session.repeatOne) {
    session.repeatOne = false;
    session.repeatEncoded = null;
    return { ok: true, mode: "off", explicit: false };
  }
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) {
    return { ok: false, message: "Impossibile attivare la ripetizione per questa traccia." };
  }
  session.repeatOne = true;
  session.repeatEncoded = enc;
  return { ok: true, mode: "on" };
}

async function previousGuildTrack(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const session = getSession(guildId);
  if (!Array.isArray(session.history) || !session.history.length) {
    return { ok: false, message: "Non c'è un brano precedente." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const prevGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!prevGate.ok) return prevGate;
  const prev = session.history.pop();
  if (!prev?.encoded) {
    return { ok: false, message: "Non c'è un brano precedente." };
  }
  const node =
    client.shoukaku?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof client.shoukaku?.getIdealNode === "function" ? client.shoukaku.getIdealNode() : null) ||
    (client.shoukaku?.nodes?.size ? client.shoukaku.nodes.values().next().value : null);
  const currentEnc = encodedFromPlayerTrack(player.track);
  const oldNowLabel = String(session.nowPlaying || "").trim() || "Traccia";
  if (currentEnc) {
    session.tracks.unshift({ encoded: currentEnc });
  }
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.repeatQueue = false;
  session.repeatQueueSnapshot = null;
  session.nowPlaying = String(prev.label || "").trim() || "Traccia sconosciuta";
  clearSessionCurrentRequester(session);
  try {
    await playEncodedFromStart(player, prev.encoded);
  } catch (err) {
    session.history.push(prev);
    if (currentEnc) session.tracks.shift();
    session.nowPlaying = oldNowLabel;
    return { ok: false, message: err?.message || "Impossibile tornare al brano precedente." };
  }
  let embedBody = `In riproduzione: **${safeDiscordLinkLabel(session.nowPlaying)}**`;
  if (node?.rest?.decode) {
    try {
      const t = await node.rest.decode(prev.encoded);
      const label = describeTrack(t);
      session.nowPlaying = label;
      const url = await resolveSpotifyWebUrl(node, t);
      embedBody = `In riproduzione: ${formatTrackTitleMarkdownLink(label, url)}`;
    } catch (_) {}
  }
  return { ok: true, message: `In riproduzione: ${session.nowPlaying}`, embedBody };
}

async function shuffleGuildQueue(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const session = guildQueues.get(guildId);
  const tracks = session?.tracks;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return { ok: false, message: "La coda è vuota: niente da mescolare." };
  }
  if (tracks.length < 2) {
    return { ok: false, message: "Servono almeno due brani in coda per mescolare." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const shufGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!shufGate.ok) return shufGate;
  shuffleInPlace(tracks);
  syncRepeatQueueSnapshotAfterShuffle(session);
  return { ok: true };
}

async function rewindGuildTrack(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const player = client.shoukaku?.players?.get(guild.id);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const rewGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!rewGate.ok) return rewGate;
  const enc = encodedFromPlayerTrack(player.track);
  if (!enc) {
    return { ok: false, message: "Impossibile riavvolgere questa traccia." };
  }
  let seekable = true;
  const node =
    client.shoukaku?.nodes?.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof client.shoukaku?.getIdealNode === "function" ? client.shoukaku.getIdealNode() : null) ||
    (client.shoukaku?.nodes?.size ? client.shoukaku.nodes.values().next().value : null);
  if (node?.rest?.decode) {
    try {
      const t = await node.rest.decode(enc);
      if (t?.info?.isSeekable === false) seekable = false;
    } catch (_) {}
  }
  if (seekable && typeof player.seekTo === "function") {
    try {
      await player.seekTo(0);
      return { ok: true };
    } catch (err) {
      logMusic("seekTo(0):", err?.message || err);
    }
  }
  try {
    await player.playTrack({ track: { encoded: enc } });
  } catch (err) {
    return { ok: false, message: err?.message || "Riavvolgimento non riuscito." };
  }
  return { ok: true };
}

async function restartQueueGuild(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  if (!player?.track) {
    return { ok: false, message: "Non c'è nulla in riproduzione." };
  }
  const session = getSession(guildId);
  const snap = buildRepeatQueueSnapshot(session, player);
  if (!snap.length) {
    return { ok: false, message: "Impossibile ricominciare la coda." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const rstGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!rstGate.ok) return rstGate;
  session.repeatOne = false;
  session.repeatEncoded = null;
  session.tracks = snap.slice(1).map((e) => ({ encoded: e.encoded }));
  session.nowPlaying = String(snap[0].label || "").trim() || "Traccia sconosciuta";
  clearSessionCurrentRequester(session);
  if (session.repeatQueue) {
    session.repeatQueueSnapshot = snap.map((e) => ({ encoded: e.encoded, label: e.label }));
  }
  try {
    await playEncodedFromStart(player, snap[0].encoded);
  } catch (err) {
    return { ok: false, message: err?.message || "Restart coda non riuscito." };
  }
  return { ok: true };
}

async function clearGuildQueue(interaction) {
  const client = interaction.client;
  const guild = interaction.guild;
  if (!guild) return { ok: false, message: "Solo in server." };
  const requester = interaction.user || interaction.author;
  if (!requester?.id) return { ok: false, message: "Utente non disponibile." };
  initLavalinkMusicIfEnabled(client);
  if (!isLavalinkUsable(client)) {
    return { ok: false, message: "Lavalink non disponibile." };
  }
  const guildId = guild.id;
  const player = client.shoukaku?.players?.get(guildId);
  const session = getSession(guildId);
  const hadPending = Array.isArray(session.tracks) && session.tracks.length > 0;
  if (!hadPending) {
    return { ok: false, message: "La coda è già vuota." };
  }
  const member = interaction.member || guild.members.cache.get(requester.id) || null;
  const clrGate = assertMusicCommandAllowed(client, guild, member, requester.id);
  if (!clrGate.ok) return clrGate;
  session.tracks.length = 0;
  if (session.repeatQueue && player?.track) {
    session.repeatQueueSnapshot = buildRepeatQueueSnapshot(session, player);
  }
  return { ok: true };
}

module.exports = {
  initLavalinkMusicIfEnabled,
  isLavalinkUsable,
  markMusicVoiceLeaveIntentional,
  fetchGuildQueueEntryRows,
  fetchGuildUpcomingQueueRows,
  fetchGuildRequestedSessionRows,
  fetchGuildNextUpDetails,
  fetchGuildNowPlayingDetails,
  playMusicRequest,
  setGuildMusicVolume,
  skipGuild,
  stopGuild,
  formatQueue,
  clearGuildQueue,
  shuffleGuildQueue,
  toggleRepeatOneGuild,
  previousGuildTrack,
  pauseToggle,
  pauseGuildTrack,
  resumeGuildTrack,
  rewindGuildTrack,
  restartQueueGuild,
  nowPlayingStatus,
  handleMusicBotVoiceDisconnect,
  shouldDeferTtsLeaveForMusicEmptyVc,
  getGuildMusicVoiceChannelId,
  guildHasMusicVoiceResumeHint,
};