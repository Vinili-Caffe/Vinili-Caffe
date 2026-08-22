const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice");
const { Shoukaku, Connectors, LoadType, Constants, Utils } = require("shoukaku");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const { notifyBotPresenceVoiceActivity } = require("../../../shared/discord/botPresenceActivity");
const MUSIC_LOGS = String(process.env.MUSIC_LOGS || "0").trim() === "1";
const MUSIC_DEFAULT_LAVALINK_VOLUME = 20;
const YT_DLP_BIN = String(process.env.YT_DLP_BIN || "/usr/local/bin/yt-dlp").trim() || "/usr/local/bin/yt-dlp";

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

/** Titolo embed per scrobbler (es. fmbot). */
const NOW_PLAYING_EMBED_TITLE = "Now playing";

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
const lastMusicEndHandledByGuild = new Map();
/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const pendingQueueEndedTimers = new Map();
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

function resolveMainGuildIdForMusic() {
  return String(IDs?.guilds?.main || "").trim();
}

function isMainGuildMusicAdminBypass(guild, member) {
  const gid = String(guild?.id || "").trim();
  const mainId = resolveMainGuildIdForMusic();
  if (!gid || !mainId || gid !== mainId) return false;
  const perms = member?.permissions;
  if (!perms || typeof perms.has !== "function") return false;
  return perms.has(PermissionsBitField.Flags.Administrator);
}

function assertMusicCommandAllowed(client, guild, member, requesterUserId) {
  const vcGate = assertRequesterInActiveMusicVoiceChannel(client, guild, member);
  if (!vcGate.ok) return vcGate;
  if (isMainGuildMusicAdminBypass(guild, member)) return { ok: true };
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
  if (!client || client._musicPlaybackResumeScheduled || client._musicPlaybackResumeDone) return;
  client._musicPlaybackResumeScheduled = true;
  const run = async () => {
    let tries = 0;
    // Fino a ~2 min: Lavalink può partire dopo i bot (reload PM2 in parallelo).
    while (tries < 120 && !isLavalinkUsable(client)) {
      await new Promise((r) => setTimeout(r, 1000));
      tries += 1;
    }
    if (!isLavalinkUsable(client)) {
      // Consenti un nuovo tentativo al prossimo evento ready del nodo.
      client._musicPlaybackResumeScheduled = false;
      logMusic("playback resume deferred: Lavalink non ancora CONNECTED (riprovo al collegamento nodo)");
      return;
    }
    client._musicPlaybackResumeDone = true;
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
        notifyBotPresenceVoiceActivity(client);
        const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
        await startVoiceContinuousCapture({
          guildId: gid,
          voiceChannel,
          client,
          botUserId: client?.user?.id,
        }).catch((err) => {
          global.logger?.warn?.("[MUSIC] voice capture start:", err?.message || err);
        });
      }
      attachEndHandler(client, player, gid);
      await player.setGlobalVolume(resolveDefaultJoinGlobalVolume());
      await playEncodedFromStart(player, encoded);
      persistMusicQueueSnapshotNow(client);
      logMusic(`resumed session in guild ${gid}`);
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

/** Cache access token YouTube (youtube-source REST `/youtube/oauth/{refreshToken}`). */
let _ytOauthAccessCache = { token: "", expiresAtMs: 0 };

/**
 * Access token OAuth per `userData["oauth-token"]` su playTrack (sblocca client TV / age-gate).
 * @returns {Promise<string|null>}
 */
async function getYoutubeOauthAccessToken() {
  const now = Date.now();
  if (_ytOauthAccessCache.token && now < _ytOauthAccessCache.expiresAtMs - 60_000) {
    return _ytOauthAccessCache.token;
  }
  try {
    const { host, port } = parseLavalinkHost();
    const pass = String(process.env.LAVALINK_PASSWORD || "youshallnotpass").trim();
    const base = `http://${host}:${port}`;
    const ytInfo = await fetch(`${base}/youtube`, {
      headers: { Authorization: pass },
      signal: AbortSignal.timeout(8_000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const refresh = String(ytInfo?.refreshToken || "").trim();
    if (!refresh) return null;
    const tok = await fetch(`${base}/youtube/oauth/${encodeURIComponent(refresh)}`, {
      headers: { Authorization: pass },
      signal: AbortSignal.timeout(15_000),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const access = String(tok?.access_token || tok?.accessToken || "").trim();
    const expiresIn = Number(tok?.expires_in || tok?.expiresIn || 3500);
    if (!access) return null;
    _ytOauthAccessCache = {
      token: access,
      expiresAtMs: now + Math.max(120, expiresIn) * 1000,
    };
    return access;
  } catch (err) {
    logMusic("yt oauth access fail", err?.message || err);
    return null;
  }
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
  // TVHTML5 richiede access token sul play ("The page needs to be reloaded" / login).
  // Il refresh lato server da solo non basta su questo IP.
  const access = await getYoutubeOauthAccessToken().catch(() => null);
  const track = access
    ? { encoded: enc, userData: { "oauth-token": access } }
    : { encoded: enc };
  if (access) logMusic("play with yt oauth-token", enc.slice(0, 24));
  else logMusic("playTrack from start (no oauth)", enc.slice(0, 24));
  await player.playTrack({ track, position: 0 });
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

function isSpotifyPodcastOnlyInput(query) {
  const q = String(query || "").trim();
  if (!q) return false;
  if (/^spotify:(show|episode):/i.test(q)) return true;
  const lower = q.toLowerCase();
  return /open\.spotify\.com\/(?:intl-[a-z-]+\/)?(show|episode)\//i.test(lower);
}

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
  const attempts = [];
  if (isPlainTextMusicQuery(raw)) {
    attempts.push(`ytmsearch:${raw}`, `ytsearch:${raw}`, `scsearch:${raw}`);
    const simplified = raw.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    if (simplified && simplified !== raw) {
      attempts.push(`ytmsearch:${simplified}`, `ytsearch:${simplified}`, `scsearch:${simplified}`);
    }
    if (mode === "spotify" || mode === "spotify_first") {
      if (!attempts.includes(primary)) attempts.push(primary);
    }
    return [...new Set(attempts)];
  }
  attempts.push(primary);
  const spotifyUriAlt = openSpotifyHttpsToSpotifyUri(raw);
  if (spotifyUriAlt && !attempts.includes(spotifyUriAlt)) attempts.push(spotifyUriAlt);
  return [...new Set(attempts)];
}

async function fetchSpotifyOembedMeta(url) {
  const u = String(url || "").trim();
  if (!u || !/open\.spotify\.com/i.test(u)) return null;
  try {
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(u)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    const title = String(j?.title || "").trim();
    const author = String(j?.author_name || "").trim();
    if (!title) return null;
    return { title, author };
  } catch (err) {
    logMusic("spotify oembed:", err?.message || err);
    return null;
  }
}

function buildStableRemirrorAttempts(title, author, isrc) {
  const attempts = [];
  const t = String(title || "").trim();
  const a = String(author || "").trim().split(",")[0].trim();
  const isrcClean = String(isrc || "").trim().replace(/\s+/g, "");
  const q = [t, a].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  // ytmsearch prima (ytsearch spesso empty). Niente scsearch: lavaplayer SC stream 404.
  if (t && a) attempts.push(`ytmsearch:"${t}" ${a}`);
  if (t) attempts.push(`ytmsearch:"${t}"`);
  if (q) attempts.push(`ytsearch:${q}`);
  if (isrcClean) attempts.push(`ytmsearch:${isrcClean}`, `ytsearch:${isrcClean}`);
  return [...new Set(attempts.filter(Boolean))];
}

function sourceRank(sourceName) {
  const s = String(sourceName || "").toLowerCase();
  if (s === "youtube" || s === "youtubemusic") return 1;
  if (s === "soundcloud") return 2;
  if (s === "spotify") return 9;
  return 3;
}

function normalizeMusicMatchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|official|video|audio|lyrics|theme|hq|hd|4k|mv|visualizer)\b/gi, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function musicTokenSet(value) {
  return new Set(
    normalizeMusicMatchText(value)
      .split(" ")
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
}

function jaccardTokenSimilarity(a, b) {
  const A = musicTokenSet(a);
  const B = musicTokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  return inter / (A.size + B.size - inter);
}

/**
 * 0..1 score: how well a candidate title/author matches the requested track.
 * Substring alone is NOT enough — "SESSO GAY" must not match
 * "SESSO GAY BAREBACK … RIVA" just because the short title is contained.
 */
function scoreTrackMetaMatch(wanted, candidate) {
  const wantTitle = normalizeMusicMatchText(wanted?.title);
  const candTitle = normalizeMusicMatchText(candidate?.title);
  if (!wantTitle || !candTitle) return 0;

  const wantTokens = musicTokenSet(wantTitle);
  const candTokens = musicTokenSet(candTitle);
  let recall = 0;
  let precision = 0;
  if (wantTokens.size && candTokens.size) {
    let hitWant = 0;
    for (const t of wantTokens) if (candTokens.has(t)) hitWant += 1;
    recall = hitWant / wantTokens.size;
    let hitCand = 0;
    for (const t of candTokens) if (wantTokens.has(t)) hitCand += 1;
    precision = hitCand / candTokens.size;
  }

  let score = 0;
  if (wantTitle === candTitle) {
    score = 1;
  } else if (recall > 0 && precision > 0) {
    score = (2 * recall * precision) / (recall + precision);
  }

  if (candTitle.includes(wantTitle) || wantTitle.includes(candTitle)) {
    const lenRatio =
      Math.min(wantTitle.length, candTitle.length) /
      Math.max(wantTitle.length, candTitle.length);
    score = Math.max(score, 0.45 + 0.5 * lenRatio);
  }

  if (wantTokens.size && candTokens.size && candTokens.size >= wantTokens.size * 2 && precision < 0.5) {
    score = Math.min(score, 0.45);
  }

  const wantAuthor = normalizeMusicMatchText(String(wanted?.author || "").split(",")[0]);
  const candAuthor = normalizeMusicMatchText(String(candidate?.author || "").split(",")[0]);
  if (wantAuthor && candAuthor) {
    if (wantAuthor === candAuthor || candAuthor.includes(wantAuthor) || wantAuthor.includes(candAuthor)) {
      score += 0.12;
    } else if (jaccardTokenSimilarity(wantAuthor, candAuthor) >= 0.5) {
      score += 0.05;
    } else {
      score -= 0.4;
    }
  }
  return Math.max(0, Math.min(1.15, score));
}

function pickBestTrackMatch(tracks, wanted, { minScore = 0.55 } = {}) {
  if (!Array.isArray(tracks) || !tracks.length) return null;
  const want = wanted && (wanted.title || wanted.author)
    ? wanted
    : { title: String(wanted || ""), author: "" };
  let best = null;
  let bestScore = -1;
  for (const t of tracks) {
    const score = scoreTrackMetaMatch(want, t?.info || {});
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  if (bestScore < minScore) return null;
  return best;
}

/**
 * Clone mirror audio. Never fake title/uri unless the mirror really matches.
 */
function cloneTrackWithRequester(fromTrack, pick, fallbackInfo, matchScore = 0) {
  const info = fallbackInfo || fromTrack?.info || {};
  const pickInfo = { ...(pick.info || {}) };
  const preserveIdentity = Number(matchScore) >= 0.85;
  return {
    encoded: pick.encoded,
    info: {
      ...pickInfo,
      title: preserveIdentity && info.title ? info.title : pickInfo.title,
      author: preserveIdentity && info.author ? info.author : pickInfo.author,
      uri: preserveIdentity && info.uri ? info.uri : pickInfo.uri,
      artworkUrl: info.artworkUrl || pickInfo.artworkUrl,
      isrc: info.isrc || pickInfo.isrc,
    },
    pluginInfo: pick.pluginInfo,
    userData: pick.userData,
    vcRequestedByUserId: fromTrack.vcRequestedByUserId,
    vcRequestedByUserTag: fromTrack.vcRequestedByUserTag,
  };
}

const MIRROR_MATCH_MIN = 0.72;

/**
 * Candidati riproducibili (Spotify = solo metadati: serve sempre un mirror).
 * Solo mirror con titolo/artista abbastanza vicini: evita "altra canzone stesso artista".
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track} track
 * @returns {Promise<import("shoukaku").Track[]>}
 */
async function collectPlayableMirrorCandidates(node, track) {
  const info = track?.info || {};
  const src = String(info.sourceName || "").toLowerCase();
  const title = String(info.title || "").trim();
  const author = String(info.author || "").trim();
  const isrc = String(info.isrc || "").trim();
  const wanted = { title, author };
  const scored = [];
  const seen = new Set();

  function pushCand(cand, matchScore, baseBonus = 0) {
    const enc = String(cand?.encoded || "").trim();
    if (!enc || seen.has(enc)) return;
    const candSrc = String(cand?.info?.sourceName || "").toLowerCase();
    if (candSrc === "spotify") return;
    if (title && matchScore < MIRROR_MATCH_MIN) return;
    seen.add(enc);
    scored.push({
      track: cand,
      matchScore,
      sourceRank: sourceRank(candSrc),
      bonus: baseBonus,
    });
  }

  if (src && src !== "spotify") {
    pushCand(track, title ? scoreTrackMetaMatch(wanted, info) || 1 : 0, 0.05);
  }

  const attempts = buildStableRemirrorAttempts(title, author, isrc);

  async function resolveOne(identifier) {
    try {
      const resolved = await node.rest.resolve(identifier);
      const found = tracksFromResolve(resolved);
      return found
        .map((pick) => ({ pick, score: scoreTrackMetaMatch(wanted, pick?.info || {}) }))
        .filter((row) => row.pick?.encoded && row.score >= MIRROR_MATCH_MIN)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
    } catch (err) {
      logMusic("remirror:", identifier.slice(0, 50), err?.message || err);
      return [];
    }
  }

  // Due ytmsearch in parallelo bastano per l’embed veloce; il resto solo se match debole.
  const firstBatch = attempts.slice(0, 2);
  const rest = attempts.slice(2);
  const early = (await Promise.all(firstBatch.map(resolveOne))).flat();
  for (const row of early) {
    pushCand(cloneTrackWithRequester(track, row.pick, info, row.score), row.score);
  }
  if (!scored.some((row) => row.matchScore >= 0.85) && rest.length) {
    const later = (await Promise.all(rest.map(resolveOne))).flat();
    for (const row of later) {
      pushCand(cloneTrackWithRequester(track, row.pick, info, row.score), row.score);
    }
  }

  scored.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
    return b.bonus - a.bonus;
  });
  const best = Number(scored[0]?.matchScore || 0);
  // Non fare fallback a titoli "che contengono" il brano giusto ma sono un'altra canzone.
  const nearBest = scored.filter((row) => Number(row.matchScore) >= best - 0.08);
  // Tieni anche il miglior mirror non-YouTube (es. SoundCloud) se YouTube poi fallisce.
  const alt = scored.find((row) => {
    const s = String(row.track?.info?.sourceName || "").toLowerCase();
    return s && s !== "youtube" && s !== "youtubemusic" && Number(row.matchScore) >= MIRROR_MATCH_MIN;
  });
  const out = [...nearBest];
  if (alt && !out.some((row) => row.track?.encoded === alt.track?.encoded)) out.push(alt);
  // Diversifica: fino a 3 YouTube con videoId diversi (se uno fallisce AAC/login, prova il successivo).
  const ytExtra = [];
  const seenIds = new Set(
    out.map((row) => String(row.track?.info?.identifier || row.track?.encoded || "")),
  );
  for (const row of scored) {
    const s = String(row.track?.info?.sourceName || "").toLowerCase();
    if (s !== "youtube" && s !== "youtubemusic") continue;
    if (Number(row.matchScore) < MIRROR_MATCH_MIN) continue;
    const id = String(row.track?.info?.identifier || row.track?.encoded || "");
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    ytExtra.push(row);
    if (ytExtra.length >= 2) break;
  }
  for (const row of ytExtra) {
    if (!out.some((r) => r.track?.encoded === row.track?.encoded)) out.push(row);
  }
  return out.slice(0, 5).map((row) => row.track);
}

/**
 * Spotify non streamma audio: mirror su YouTube/altro.
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track} track
 */
async function remirrorToStableAudio(node, track) {
  const candidates = await collectPlayableMirrorCandidates(node, track);
  if (!candidates.length) {
    const src = String(track?.info?.sourceName || "").toLowerCase();
    // Spotify non ha audio: meglio fallire il resolve che fingere un play silenzioso.
    if (src === "spotify") return null;
    return track;
  }
  const pick = candidates[0];
  pick._mirrorCandidates = candidates;
  const from = String(track?.info?.sourceName || "").toLowerCase();
  const to = String(pick?.info?.sourceName || "").toLowerCase();
  if (pick.encoded !== track?.encoded) {
    logMusic("remirror ok", {
      from: `${from}:${track?.info?.title || ""}`.slice(0, 50),
      to: `${to}:${pick?.info?.title || ""}`.slice(0, 50),
    });
  }
  return pick;
}

function isYoutubeSourceName(sourceName) {
  const s = String(sourceName || "").toLowerCase();
  return s === "youtube" || s === "youtubemusic";
}

function youtubeWatchUrlFromTrack(track) {
  const info = track?.info || {};
  const uri = String(info.uri || "").trim();
  if (/youtube\.com\/watch|youtu\.be\//i.test(uri)) return uri;
  const id = String(info.identifier || "").trim();
  if (/^[\w-]{11}$/.test(id)) return `https://www.youtube.com/watch?v=${id}`;
  return "";
}

/**
 * YouTube innertube/SABR spesso loadfailed su IP datacenter: yt-dlp → URL stream → source http.
 * @param {string} watchUrl
 * @returns {Promise<string|null>}
 */
async function resolveYoutubeStreamUrlViaYtDlp(watchUrl) {
  const url = String(watchUrl || "").trim();
  if (!url) return null;
  try {
    const { stdout, stderr } = await execFileAsync(
      YT_DLP_BIN,
      ["-g", "-f", "ba/bestaudio/best", "--no-playlist", "--no-warnings", url],
      { timeout: 55_000, maxBuffer: 2_000_000, windowsHide: true },
    );
    const line = String(stdout || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => /^https?:\/\//i.test(l));
    if (!line) {
      logMusic("yt-dlp no url", String(stderr || "").slice(0, 180));
      return null;
    }
    return line;
  } catch (err) {
    logMusic("yt-dlp fail", err?.message || err);
    return null;
  }
}

/**
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track} track
 * @returns {Promise<import("shoukaku").Track|null>}
 */
async function remirrorYoutubeViaHttp(node, track) {
  const watch = youtubeWatchUrlFromTrack(track);
  if (!watch || typeof node?.rest?.resolve !== "function") return null;
  const streamUrl = await resolveYoutubeStreamUrlViaYtDlp(watch);
  if (!streamUrl) return null;
  try {
    const resolved = await node.rest.resolve(streamUrl);
    const found = tracksFromResolve(resolved);
    const pick = found[0];
    if (!pick?.encoded) return null;
    const out = cloneTrackWithRequester(track, pick, track?.info || {}, 1);
    // Conserva titolo/artista YouTube nell'embed (http ha URI grezzo).
    if (out?.info) {
      if (track?.info?.title) out.info.title = track.info.title;
      if (track?.info?.author) out.info.author = track.info.author;
      if (track?.info?.artworkUrl) out.info.artworkUrl = track.info.artworkUrl;
      if (track?.info?.uri) out.info.uri = track.info.uri;
      out.info.sourceName = "http";
    }
    logMusic("yt-dlp http remirror ok", String(track?.info?.identifier || "").slice(0, 12));
    return out;
  } catch (err) {
    logMusic("yt-dlp http resolve fail", err?.message || err);
    return null;
  }
}

/**
 * Prova più mirror finché lo stream resta vivo ~0.45s.
 * @param {import("shoukaku").Player} player
 * @param {object} session
 * @param {import("shoukaku").Node} node
 * @param {import("shoukaku").Track} track
 */
async function playWithMirrorFallbacks(player, session, node, track) {
  let list = Array.isArray(track?._mirrorCandidates) ? track._mirrorCandidates : null;
  if (!list?.length) list = await collectPlayableMirrorCandidates(node, track);
  list = (Array.isArray(list) ? list : []).filter((cand) => {
    const enc = String(cand?.encoded || "").trim();
    if (!enc) return false;
    const src = String(cand?.info?.sourceName || "").toLowerCase();
    return src !== "spotify";
  });
  if (!list.length) {
    const src = String(track?.info?.sourceName || "").toLowerCase();
    if (track?.encoded && src && src !== "spotify") list = [track];
  }
  // Preferisci http (yt-dlp) ai client YouTube nativi (SABR / login / "page needs reload").
  const ytSeed =
    list.find((c) => isYoutubeSourceName(c?.info?.sourceName)) ||
    (isYoutubeSourceName(track?.info?.sourceName) ? track : null);
  if (ytSeed) {
    const httpAlt = await remirrorYoutubeViaHttp(node, ytSeed).catch((err) => {
      logMusic("yt-dlp remirror err", err?.message || err);
      return null;
    });
    if (httpAlt?.encoded) {
      list = [httpAlt, ...list.filter((c) => String(c?.encoded) !== String(httpAlt.encoded))];
    }
  }
  const isYt = (cand) => isYoutubeSourceName(cand?.info?.sourceName);
  const isHttp = (cand) => String(cand?.info?.sourceName || "").toLowerCase() === "http";
  list = [
    ...list.filter(isHttp),
    ...list.filter((c) => !isHttp(c) && isYt(c)),
    ...list.filter((c) => !isHttp(c) && !isYt(c)),
  ].slice(0, 5);
  logMusic(
    "mirror try",
    list.map((c) => `${c?.info?.sourceName}:${String(c?.info?.identifier || "").slice(0, 12)}`).join(","),
  );
  for (let i = 0; i < list.length; i++) {
    const cand = list[i];
    const playGen = markFreshPlayAttempt(session);
    session.nowPlaying = describeTrack(cand);
    session.playingEncoded = cand.encoded;
    try {
      if (player.paused) await player.setPaused(false).catch(() => {});
      await playEncodedFromStart(player, cand.encoded);
    } catch (err) {
      logMusic("play mirror fail", cand?.info?.sourceName, err?.message || err);
      continue;
    }
    // Non aspettare position (playerUpdateInterval può essere 5s): basta traccia viva senza loadfailed.
    const probe = await probeMirrorPlayback(player, session, playGen, cand, 1800);
    if (probe === "interrupted") {
      return { ok: false, interrupted: true, track: cand };
    }
    if (probe === "ok") {
      return { ok: true, track: cand };
    }
    logMusic("mirror died early, next", {
      src: cand?.info?.sourceName,
      id: String(cand?.info?.identifier || "").slice(0, 16),
      left: list.length - i - 1,
      earlyPlayFailed: Boolean(session.earlyPlayFailed),
    });
  }
  return { ok: false, interrupted: false, track: null };
}

/**
 * Attende loadfailed o conferma che la traccia è ancora viva (senza richiedere position).
 * @returns {Promise<"ok"|"failed"|"interrupted">}
 */
async function probeMirrorPlayback(player, session, playGen, cand, maxMs = 1800) {
  const step = 200;
  let waited = 0;
  const wantEnc = String(cand?.encoded || "");
  while (waited < maxMs) {
    await delayMs(step);
    waited += step;
    if (Number(session.playGeneration || 0) !== playGen) return "interrupted";
    if (session.earlyPlayFailed) return "failed";
    const stillEncoded = encodedFromPlayerTrack(player.track);
    if (!stillEncoded || stillEncoded !== wantEnc) return "failed";
    // ~700ms senza loadfailed → ok (embed non aspetta 5s il playerUpdate).
    if (waited >= 700) return "ok";
  }
  if (Number(session.playGeneration || 0) !== playGen) return "interrupted";
  if (session.earlyPlayFailed) return "failed";
  const stillEncoded = encodedFromPlayerTrack(player.track);
  if (!stillEncoded || stillEncoded !== wantEnc) return "failed";
  return "ok";
}

/**
 * @param {import("shoukaku").Node} node
 * @param {string} userQuery
 * @param {{ metaHint?: { title?: string, author?: string } | null }} [options]
 */
async function resolvePlayableTracks(node, userQuery, options = {}) {
  let attempts = buildResolveAttempts(userQuery);
  const mode = getMusicSearchMode();
  const preferNonSpotify =
    (mode === "spotify" || mode === "spotify_first") && isPlainTextMusicQuery(userQuery);
  let lastResolved = null;
  const metaHint = options?.metaHint && typeof options.metaHint === "object" ? options.metaHint : null;

  if (isOpenSpotifyMusicUrlInput(userQuery)) {
    const probe = await node.rest.resolve(attempts[0]).catch(() => null);
    lastResolved = probe;
    if (!tracksFromResolve(probe).length) {
      let meta = await fetchSpotifyOembedMeta(userQuery);
      if (!meta?.title && metaHint?.title) {
        meta = {
          title: String(metaHint.title || "").trim(),
          author: String(metaHint.author || "").trim(),
        };
      }
      if (meta?.title) {
        const q = [meta.title, meta.author].filter(Boolean).join(" ").trim();
        logMusic("spotify url fallback meta", q.slice(0, 80));
        attempts = buildResolveAttempts(q);
      }
    }
  }

  for (const identifier of attempts) {
    try {
      lastResolved = await node.rest.resolve(identifier);
    } catch (err) {
      logMusic("resolve attempt:", identifier, err?.message || err);
      continue;
    }
    logMusic("resolve ok", { loadType: lastResolved?.loadType, identifier: identifier.slice(0, 80) });
    let tracks = tracksFromResolve(lastResolved);
    if (normalizeLavalinkLoadType(lastResolved) === "search" && tracks.length > 1) {
      const wanted = metaHint?.title
        ? metaHint
        : isPlainTextMusicQuery(userQuery)
          ? { title: userQuery, author: "" }
          : { title: tracks[0]?.info?.title || "", author: tracks[0]?.info?.author || "" };
      const best = pickBestTrackMatch(tracks, wanted, { minScore: 0.45 }) || tracks[0];
      tracks = [best];
    }
    if (!tracks.length) continue;
    const musicOnly = filterOutSpotifyPodcastTracks(tracks);
    if (!musicOnly.length) continue;
    const remirrored = [];
    for (const t of musicOnly) {
      const mirrored = await remirrorToStableAudio(node, t);
      if (mirrored?.encoded) remirrored.push(mirrored);
    }
    if (!remirrored.length) continue;
    const src = String(remirrored[0]?.info?.sourceName || "").toLowerCase();
    if (preferNonSpotify && src === "spotify") continue;
    if (src === "spotify") continue;
    return { tracks: remirrored, resolved: lastResolved };
  }
  return { tracks: [], resolved: lastResolved };
}

function describeTrack(t) {
  const info = t?.info;
  if (!info) return "Traccia sconosciuta";
  return `${info.title || "Senza titolo"} — ${info.author || "?"}`;
}

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
  // Conserva i mirror già risolti: altrimenti play rifà 5 search e l’embed ritarda ~1s+.
  if (Array.isArray(track._mirrorCandidates) && track._mirrorCandidates.length) {
    out._mirrorCandidates = track._mirrorCandidates;
  }
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

/** Load/decode failure or immediate stop — not a real “queue finished”. */
function isFailedStartEndReason(reasonRaw) {
  const r = String(reasonRaw || "").toLowerCase();
  return (
    r === "loadfailed" ||
    r === "load_failed" ||
    r === "cleanup" ||
    r === "replaced" ||
    r === "stopped" ||
    r === "stop"
  );
}

function markFreshPlayAttempt(session) {
  if (!session) return 0;
  // playGeneration must return a number: playWithMirrorFallbacks treats mismatch as "interrupted".
  session.playGeneration = Number(session.playGeneration || 0) + 1;
  session._freshPlayAt = Date.now();
  session._suppressQueueEndedUntil = Date.now() + 4500;
  session.earlyPlayFailed = false;
  return session.playGeneration;
}

function shouldSuppressQueueEndedEmbed(session, reasonRaw) {
  if (!session) return false;
  const until = Number(session._suppressQueueEndedUntil || 0);
  if (until && Date.now() < until) return true;
  if (isFailedStartEndReason(reasonRaw)) return true;
  const freshAt = Number(session._freshPlayAt || 0);
  if (freshAt && Date.now() - freshAt < 2800 && isNaturalTrackEndReason(reasonRaw)) {
    return true;
  }
  return false;
}

function delayMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
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
  const nodeName = String(process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main").trim() || "main";
  const node = sh.nodes.get(nodeName) || sh.nodes.values().next().value;
  if (!node) return false;
  const connected = Constants?.State?.CONNECTED;
  if (node.state === connected) return true;
  // Alcune versioni espongono lo stato come stringa.
  return String(node.state || "").toUpperCase() === "CONNECTED";
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

function cancelPendingQueueEndedEmbed(guildId) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const t = pendingQueueEndedTimers.get(gid);
  if (t) {
    clearTimeout(t);
    pendingQueueEndedTimers.delete(gid);
  }
}

function scheduleMusicQueueEndedEmbed(client, textChannelId, guildId) {
  const gid = String(guildId || "").trim();
  const cid = String(textChannelId || "").trim();
  if (!gid || !cid || !client) return;
  cancelPendingQueueEndedEmbed(gid);
  const timer = setTimeout(() => {
    pendingQueueEndedTimers.delete(gid);
    void (async () => {
      const session = guildQueues.get(gid);
      if (session?.nowPlaying || session?.playingEncoded || session?.tracks?.length) return;
      if (shouldSuppressQueueEndedEmbed(session, "finished")) return;
      const player = client?.shoukaku?.players?.get?.(gid);
      if (player?.track) return;
      await sendMusicQueueEndedEmbed(client, cid, gid);
    })();
  }, 1600);
  pendingQueueEndedTimers.set(gid, timer);
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
    const { isGuildClipRecording } = require("../Voice/voiceClipService");
    if (isGuildClipRecording(gid)) {
      musicIdleSince.delete(gid);
      continue;
    }
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
  const { stopVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
  await stopVoiceContinuousCapture(gid, client).catch(() => null);
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
          markFreshPlayAttempt(session);
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
          markFreshPlayAttempt(session);
          await playEncodedFromStart(player, head.encoded);
          session.playingEncoded = head.encoded;
          return;
        } catch (err) {
          logMusic("repeat queue loop:", err?.message || err);
          session.repeatQueue = false;
          session.repeatQueueSnapshot = null;
        }
      }
      if (shouldSuppressQueueEndedEmbed(session, reasonRaw)) {
        logMusic(
          `suppress queue-ended guild=${guildId} reason=${String(reasonRaw || "")} freshMs=${
            Date.now() - Number(session._freshPlayAt || 0)
          }`
        );
        session.earlyPlayFailed = true;
        session.nowPlaying = null;
        session.playingEncoded = null;
        clearSessionCurrentRequester(session);
        session.tracks = [];
        musicIdleSince.set(guildId, Date.now());
        persistMusicQueueSnapshotNow(client);
        cancelPendingQueueEndedEmbed(gid);
        return;
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
      scheduleMusicQueueEndedEmbed(client, notifyChannelId, guildId);
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
  if (client._shoukakuInitPending) return;
  if (client._shoukakuInitDone && client?.shoukaku?.nodes?.size) return;
  if (client._shoukakuInitDone && !client?.shoukaku?.nodes?.size) {
    client._shoukakuInitDone = false;
    try {
      client.shoukaku?.removeAllListeners?.();
    } catch (_) {}
    client.shoukaku = null;
  }
  if (String(process.env.MUSIC_ENABLED || "1").trim() === "0") {
    logMusic("disabilitato (MUSIC_ENABLED=0)");
    client._shoukakuInitDone = true;
    return;
  }
  client._shoukakuInitPending = true;
  void waitForLavalinkTcpThenInitShoukaku(client).catch((err) => {
    client._shoukakuInitPending = false;
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  });
}

function probeLavalinkTcp(host, port, timeoutMs = 1500) {
  const net = require("net");
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, family: 4 });
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      try {
        socket.destroy();
      } catch (_) {}
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => done(true));
    socket.on("error", () => done(false));
    socket.on("timeout", () => done(false));
  });
}

function isTransientLavalinkConnectError(err) {
  const msg = String(err?.message || err || "");
  const code = String(err?.code || "");
  return (
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "ECONNRESET" ||
    /ECONNREFUSED|ETIMEDOUT|ECONNRESET|connect ECONNREFUSED/i.test(msg) ||
    /websocket closed before a connection was established/i.test(msg) ||
    /fetch failed/i.test(msg) ||
    /socket hang up/i.test(msg) ||
    /EPIPE/i.test(msg)
  );
}

async function probeLavalinkHttpReady(host, port, timeoutMs = 2500) {
  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${host}:${port}/version`, {
      headers: { Authorization: password },
      signal: ctrl.signal,
    });
    return Boolean(res?.ok);
  } catch (_) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForLavalinkTcpThenInitShoukaku(client) {
  const { host, port, url } = parseLavalinkHost();
  const portNum = Number(port) || 2333;
  const maxWaitMs = Math.max(5_000, Number(process.env.LAVALINK_MUSIC_WAIT_MS || 90_000) || 90_000);
  const started = Date.now();
  let warnedOffline = false;

  while (Date.now() - started < maxWaitMs) {
    // TCP non basta: altrimenti Shoukaku prende "Websocket closed before a connection was established".
    if ((await probeLavalinkTcp(host, portNum)) && (await probeLavalinkHttpReady(host, portNum))) break;
    if (!warnedOffline) {
      warnedOffline = true;
      logMusic(
        `Lavalink non ancora pronto su ${host}:${portNum}, attendo prima di collegare Shoukaku...`,
      );
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  if (!(await probeLavalinkHttpReady(host, portNum))) {
    client._shoukakuInitPending = false;
    global.logger?.warn?.(
      `[MUSIC] Lavalink non raggiungibile entro ${Math.round(maxWaitMs / 1000)}s su ${host}:${portNum}. Riprovo al prossimo comando musica.`,
    );
    return;
  }

  const password = process.env.LAVALINK_PASSWORD || "youshallnotpass";
  const secure = String(process.env.LAVALINK_SECURE || "").trim() === "1";
  const nodes = [
    {
      name: process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main",
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
    if (!shoukaku.nodes.size) {
      client._shoukakuInitPending = false;
      global.logger?.warn?.("[MUSIC] Shoukaku senza nodi dopo init (clientReady race). Riprovo al prossimo play.");
      return;
    }
    client.shoukaku = shoukaku;
    client._shoukakuInitDone = true;
    client._shoukakuInitPending = false;
    restoreMusicQueueSnapshot();
    let refusedLogged = false;
    shoukaku.on("error", (name, err) => {
      if (isTransientLavalinkConnectError(err)) {
        if (!refusedLogged) {
          refusedLogged = true;
          logMusic(
            `Shoukaku node ${name}: Lavalink momentaneamente non raggiungibile, riconnessione automatica...`,
          );
        }
        return;
      }
      refusedLogged = false;
      global.logger?.warn?.(`[MUSIC] Shoukaku node ${name}:`, err?.message || err);
    });
    shoukaku.on("ready", (name) => {
      refusedLogged = false;
      logMusic(`Lavalink collegato (nodo ${name})`);
      // Solo qui il nodo è CONNECTED: non schedulare il resume all'init (race con boot Lavalink).
      scheduleMusicPlaybackResume(client);
    });
    startMusicInactivityWatcher(client);
    startMusicQueueSnapshotLoop(client);
  } catch (err) {
    client._shoukakuInitPending = false;
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
  if (client._shoukakuInitPending && !isLavalinkUsable(client)) {
    const waitUntil = Date.now() + 20_000;
    while (client._shoukakuInitPending && Date.now() < waitUntil) {
      await new Promise((r) => setTimeout(r, 400));
    }
  }
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
      initPending: Boolean(client._shoukakuInitPending),
    });
    return {
      ok: false,
      message:
        "Musica non disponibile: Lavalink non è collegato. Controlla che il processo **lavalink** sia online (`pm2 list`) e che `LAVALINK_HOST` / `LAVALINK_PASSWORD` coincidano con `application.yml`.",
    };
  }
  const voiceChannel = member.voice?.channel;
  if (!voiceChannel || voiceChannel.isVoiceBased?.() === false) {
    return { ok: false, message: "Entra in un canale vocale per riprodurre musica." };
  }

  const guildId = guild.id;
  const { isGuildClipRecording } = require("../Voice/voiceClipService");
  if (isGuildClipRecording(guildId)) {
    const musicDuringClip = guildMusicSessionBlocksOtherVoiceChannels(client, guildId);
    if (!musicDuringClip.blocked) {
      return {
        ok: false,
        message: "Registrazione clip in corso. Ferma la clip o attendi la fine, poi riprova.",
      };
    }
  }
  if (guildHasBlockingNativeVoiceConnection(guildId)) {
    // Non bloccare a vita: distruggi la sessione nativa TTS/zombie e prosegui.
    try {
      const { purgeTtsVoicePersistence } = require("../TTS/ttsService");
      await purgeTtsVoicePersistence(guildId, client);
      const { getVoiceConnection: gvc } = require("@discordjs/voice");
      const leftover = gvc(String(guildId));
      if (leftover) {
        try {
          leftover.destroy();
        } catch (_) {}
      }
      await new Promise((r) => setTimeout(r, 700));
    } catch (err) {
      global.logger?.warn?.("[MUSIC] purge blocking TTS failed:", err?.message || err);
    }
    if (guildHasBlockingNativeVoiceConnection(guildId)) {
      return {
        ok: false,
        message:
          "Il bot ha ancora una sessione **TTS** in vocale: la musica non può avviarsi insieme. Fai uscire il TTS con **leave**, poi riprova `+play`.",
      };
    }
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
    ({ tracks, resolved } = await resolvePlayableTracks(node, trimmed, {
      metaHint: ctx.metaHint || null,
    }));
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
      notifyBotPresenceVoiceActivity(client);
      const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
      await startVoiceContinuousCapture({
        guildId,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch((err) => {
        global.logger?.warn?.("[MUSIC] voice capture start:", err?.message || err);
      });
    } catch (err) {
      global.logger?.warn?.("[MUSIC] joinVoiceChannel:", err?.message || err);
      return { ok: false, message: musicJoinVoiceChannelErrorMessage(err) };
    }
    attachEndHandler(client, player, guildId);
    const volume = resolveDefaultJoinGlobalVolume();
    await player.setGlobalVolume(volume);
  } else {
    const volume = resolveDefaultJoinGlobalVolume();
    await player.setGlobalVolume(volume).catch(() => {});
    if (player.paused) await player.setPaused(false).catch(() => {});
    const { isVoiceCaptureActive, startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
    if (!isVoiceCaptureActive(guildId)) {
      await startVoiceContinuousCapture({
        guildId,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch((err) => {
        global.logger?.warn?.("[MUSIC] voice capture resume:", err?.message || err);
      });
    }
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
  cancelPendingQueueEndedEmbed(guildId);
  const started = await playWithMirrorFallbacks(player, session, node, first);
  if (started.interrupted) {
    return {
      ok: false,
      message: "Riproduzione interrotta da un altro comando.",
    };
  }
  if (!started.ok || !started.track) {
    session.tracks.length = 0;
    session.nowPlaying = null;
    session.playingEncoded = null;
    session.musicSessionOwnerId = null;
    clearSessionCurrentRequester(session);
    return {
      ok: false,
      message:
        "Lo stream non è partito. Riprova con titolo + artista o un link Spotify (metadati → mirror YouTube).",
    };
  }
  const playingTrack = started.track;
  session._suppressQueueEndedUntil = 0;
  persistMusicQueueSnapshotNow(client);
  session.musicSessionOwnerId = requesterUser?.id ? String(requesterUser.id) : null;
  const label = describeTrack(playingTrack);
  const spotifyUrl = await resolveSpotifyWebUrl(node, playingTrack);
  const linkMd = formatTrackTitleMarkdownLink(label, spotifyUrl);
  const tail = rest.length ? ` (+${rest.length} in coda)` : "";
  const embedDescription = `${linkMd}${tail}`;
  const embedBody = `**${NOW_PLAYING_EMBED_TITLE}:** ${embedDescription}`;
  return {
    ok: true,
    message: `**${NOW_PLAYING_EMBED_TITLE}:** **${label}**${tail}`,
    embedTitle: NOW_PLAYING_EMBED_TITLE,
    embedDescription,
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
  let embedDescription = `**${safeDiscordLinkLabel(session.nowPlaying)}**`;
  if (node?.rest?.decode) {
    try {
      const t = await node.rest.decode(prev.encoded);
      const label = describeTrack(t);
      session.nowPlaying = label;
      const url = await resolveSpotifyWebUrl(node, t);
      embedDescription = formatTrackTitleMarkdownLink(label, url);
    } catch (_) {}
  }
  const embedBody = `**${NOW_PLAYING_EMBED_TITLE}:** ${embedDescription}`;
  return {
    ok: true,
    message: `**${NOW_PLAYING_EMBED_TITLE}:** ${session.nowPlaying}`,
    embedTitle: NOW_PLAYING_EMBED_TITLE,
    embedDescription,
    embedBody,
  };
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

async function resumeMusicVoiceAfterAfkProbe(client, guildId) {
  const gid = String(guildId || "").trim();
  const sh = client?.shoukaku;
  if (!sh || !gid) return false;
  const session = guildQueues.get(gid);
  const encoded = String(session?.playingEncoded || "").trim();
  const vcId = String(session?.voiceChannelId || "").trim();
  if (!encoded || !vcId || !/^\d{17,22}$/.test(vcId)) return false;
  if (guildHasBlockingNativeVoiceConnection(gid)) {
    global.logger?.warn?.("[MUSIC] afk probe resume blocked by native voice session", gid);
    return false;
  }

  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return false;
  const voiceChannel =
    guild.channels.cache.get(vcId) || (await guild.channels.fetch(vcId).catch(() => null));
  if (!voiceChannel?.isVoiceBased?.()) return false;

  const me = guild.members.me;
  if (!voiceChannel.permissionsFor?.(me)?.has?.(["Connect", "Speak", "ViewChannel"])) return false;

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
      notifyBotPresenceVoiceActivity(client);
      const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
      await startVoiceContinuousCapture({
        guildId: gid,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch(() => null);
    } else if (!sh.connections?.get(gid)?.channelId) {
      await sh.joinVoiceChannel({
        guildId: gid,
        shardId: getShardIdForGuild(guild),
        channelId: voiceChannel.id,
        deaf: true,
      });
      notifyBotPresenceVoiceActivity(client);
      const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService");
      await startVoiceContinuousCapture({
        guildId: gid,
        voiceChannel,
        client,
        botUserId: client?.user?.id,
      }).catch(() => null);
    }
    attachEndHandler(client, player, gid);
    await player.setGlobalVolume(resolveDefaultJoinGlobalVolume());
    if (!player.track) {
      await playEncodedFromStart(player, encoded);
    } else {
      await player.setPaused(false).catch(() => null);
    }
    persistMusicQueueSnapshotNow(client);
    return true;
  } catch (err) {
    global.logger?.warn?.("[MUSIC] afk probe resume failed", gid, err?.message || err);
    return false;
  }
}

async function suspendMusicVoiceForAfkProbe(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return { active: false };
  const session = guildQueues.get(gid);
  const sh = client.shoukaku;
  const conn = sh?.connections?.get(gid);
  const player = sh?.players?.get(gid);
  if (!session && !conn?.channelId && !player?.track) return { active: false };

  const merged = mergeSessionSnapshotFromLivePlayer(client, gid, session || {});
  if (session) Object.assign(session, merged);
  else guildQueues.set(gid, merged);
  persistMusicQueueSnapshotNow(client);

  if (player && player.paused === false) {
    await player.setPaused(true).catch(() => null);
  }
  if (conn?.channelId) {
    await leaveMusicVoiceChannelMarked(client, gid);
    return { active: true, channelId: String(merged.voiceChannelId || conn.channelId) };
  }
  return { active: Boolean(merged.voiceChannelId), channelId: merged.voiceChannelId || null };
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
  guildMusicSessionBlocksOtherVoiceChannels,
  suspendMusicVoiceForAfkProbe,
  resumeMusicVoiceAfterAfkProbe,
};