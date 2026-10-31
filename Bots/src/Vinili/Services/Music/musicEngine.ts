/** Musica: il motore (sessioni per server, avvio dei brani, fine brano, collegamento a Lavalink). */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { Shoukaku, Connectors, Constants, Utils } = require("shoukaku") as typeof import("shoukaku");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { readSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { notifyBotPresenceVoiceActivity } = require("../../../shared/discord/botPresenceActivity") as typeof import("../../../shared/discord/botPresenceActivity");
const { playEncodedFromStart, playWithMirrorFallbacks, describeTrack } = require("./musicMirror") as typeof import("./musicMirror");
const { musicHooks, musicPurgeTts, musicLeaveTts, guildQueues, endListeners, lastMusicEndHandledByGuild, musicIdleSince, MUSIC_QUEUE_SNAPSHOT_PATH, serializeEncodedLabelRows, persistMusicQueueSnapshotNow, getShardIdForGuild, getShoukakuVoiceConnectionTimeoutSeconds, clearBlockingNativeVoiceForMusic, leaveMusicVoiceChannelMarked } = require("./musicVoice") as typeof import("./musicVoice");

const MUSIC_DEFAULT_LAVALINK_VOLUME = 20;

function lavalinkGlobalVolumeFromUserPercent(percent0to100?) {
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
async function musicStartCapture(opts?) {
  const h = musicHooks();
  if (!h.enableVoiceCapture) return;
  if (typeof h.startVoiceContinuousCapture === "function") {
    return (h.startVoiceContinuousCapture as any)(opts);
  }
  const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService") as typeof import("../Voice/voiceContinuousCaptureService");
  return startVoiceContinuousCapture(opts);
}
const pendingQueueEndedTimers = new Map();
/* posResume1: 5s → posizione più fedele al riavvio (prima 15s = fino a 15s di rewind) */
/* perfP2: snapshot coda meno frequente (era 5s) */
const MUSIC_QUEUE_SNAPSHOT_INTERVAL_MS = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.VC_MUSIC_QUEUE_SNAPSHOT_MS || 30_000) || 30_000),
);

function restoreSessionSnapshotRow(row?) {
  if (!row || typeof row !== "object") return null;
  const tracks = Array.isArray(row.tracks)
    ? row.tracks
        .map((t?) => {
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
    playingPositionMs: Math.max(0, Math.floor(Number(row?.playingPositionMs) || 0)),
  };
}

function scheduleMusicPlaybackResume(client?) {
  if (!client || client._musicPlaybackResumeScheduled || client._musicPlaybackResumeDone) return;
  client._musicPlaybackResumeScheduled = true;
  const run = async () => {
    let tries = 0;
        while (tries < 120 && !isLavalinkUsable(client)) {
      await new Promise((r?) => setTimeout(r, 1000));
      tries += 1;
    }
    if (!isLavalinkUsable(client)) {
            client._musicPlaybackResumeScheduled = false;
      logMusic("playback resume deferred: Lavalink non ancora CONNECTED (riprovo al collegamento nodo)");
      return;
    }
    /* queueResumeKeep1: inProgress PRIMA di done — voice leave a boot non deve wipe la coda */
    client._musicPlaybackResumeInProgress = true;
    try {
      await resumeRestoredMusicSessions(client).catch((err?) => {
        global.logger?.warn?.("[MUSIC] playback resume failed:", err?.message || err);
      });
    } finally {
      client._musicPlaybackResumeInProgress = false;
      client._musicPlaybackResumeDone = true;
    }
  };
  setImmediate(() => void run());
}

async function resumeRestoredMusicSessions(client?, opts: Record<string, any> = {}) {
  const sh = client?.shoukaku;
  if (!sh) return;
  const isRetry = opts && opts.retry === true;
  let blockedCount = 0;
  for (const [guildId, session] of [...guildQueues.entries()]) {
    const gid = String(guildId || "").trim();
    if (!gid || !session) continue;
    let encoded = String(session.playingEncoded || "").trim();
    const vcId = String(session.voiceChannelId || "").trim();
    /* queueResumeKeep1: se manca playingEncoded ma c'è coda → riparti dal primo track */
    if (!encoded && Array.isArray(session.tracks) && session.tracks.length > 0) {
      const next = session.tracks.shift();
      encoded = String(next?.encoded || next?.track || "").trim();
      if (encoded) {
        session.playingEncoded = encoded;
        session.nowPlaying = next?.info || next?.nowPlaying || session.nowPlaying || null;
        session.playingPositionMs = 0;
      }
    }
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
    if (await clearBlockingNativeVoiceForMusic(gid, client)) {
      blockedCount += 1;
      /* musicResumeRetry1: al primo pass TTS restore spesso ri-join → ritenta dopo boot */
      if (!isRetry) {
        global.logger?.warn?.(
          "[MUSIC] resume: blocked by native voice session (retry in 12s)",
          gid,
        );
      } else {
        global.logger?.warn?.("[MUSIC] resume: blocked by native voice session", gid);
      }
      continue;
    }

    try {
      await musicPurgeTts(gid, client).catch(() => {});
      let player = sh.players.get(gid);
      if (!player) {
        player = await sh.joinVoiceChannel({
          guildId: gid,
          shardId: getShardIdForGuild(guild),
          channelId: voiceChannel.id,
          /* clipAllVoices3: deaf=true → Discord non manda le altre voci al bot */
          deaf: false,
        });
        notifyBotPresenceVoiceActivity(client);
        await musicStartCapture({
          guildId: gid,
          voiceChannel,
          client,
          botUserId: client?.user?.id,
        }).catch((err?) => {
          global.logger?.warn?.("[MUSIC] voice capture start:", err?.message || err);
        });
      }
      attachEndHandler(client, player, gid);
      await player.setGlobalVolume(resolveDefaultJoinGlobalVolume());
      /* posResume1: riparti da snapshot (rewind 1.5s per non saltare battuta) */
      const rawPos = Math.max(0, Math.floor(Number(session.playingPositionMs) || 0));
      const resumePos = rawPos > 2500 ? Math.max(0, rawPos - 1500) : 0;
      await playEncodedFromStart(player, encoded, { position: resumePos });
      session.playingPositionMs = resumePos;
      persistMusicQueueSnapshotNow(client);
      logMusic(`resumed session in guild ${gid} @${resumePos}ms`);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] resume join/play failed", gid, err?.message || err);
    }
  }
  if (blockedCount > 0 && !isRetry && client && !client._musicResumeNativeRetryArmed) {
    client._musicResumeNativeRetryArmed = true;
    setTimeout(() => {
      void resumeRestoredMusicSessions(client, { retry: true }).catch((err?) => {
        global.logger?.warn?.("[MUSIC] playback resume retry failed:", err?.message || err);
      });
    }, 12000);
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

function startMusicQueueSnapshotLoop(client?) {
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

function trackForManualQueue(track?) {
  if (!track) return null;
  const encoded =
    typeof track.encoded === "string"
      ? track.encoded
      : typeof track === "string"
        ? track
        : null;
  if (!encoded) return null;
  const out: Record<string, any> = { encoded };
  if (track.info && typeof track.info === "object") out.info = track.info;
  if (track.vcRequestedByUserId) out.vcRequestedByUserId = String(track.vcRequestedByUserId);
  if (track.vcRequestedByUserTag) out.vcRequestedByUserTag = String(track.vcRequestedByUserTag);
    if (Array.isArray(track._mirrorCandidates) && track._mirrorCandidates.length) {
    out._mirrorCandidates = track._mirrorCandidates;
  }
  return out;
}

function shiftNextQueueTrack(session?, skipEncoded = null) {
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

function isNaturalTrackEndReason(reasonRaw?) {
  const r = String(reasonRaw || "").toLowerCase();
  return r === "finished" || r === "ended" || r === "finish" || r === "end";
}

function isFailedStartEndReason(reasonRaw?) {
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

function shouldSuppressQueueEndedEmbed(session?, reasonRaw?) {
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

function clearSessionCurrentRequester(session?) {
  if (!session) return;
  session.currentRequesterUserId = null;
  session.currentRequesterUserTag = null;
}

function encodedFromEvTrack(rawT?) {
  if (typeof rawT === "string") return rawT;
  if (rawT?.encoded && typeof rawT.encoded === "string") return rawT.encoded;
  return null;
}

function getSession(guildId?) {
  let s = guildQueues.get(guildId);
  if (!s) {
    s = {
      tracks: [],
      textChannelId: null,
      nowPlaying: null,
      voiceChannelId: null,
      playingEncoded: null,
      playingPositionMs: 0,
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
  if (s.playingPositionMs === undefined) s.playingPositionMs = 0;
  return s;
}

function isLavalinkUsable(client?) {
  const sh = client?.shoukaku;
  if (!sh?.nodes?.size) return false;
  const nodeName = String(process.env.LAVALINK_NODE_NAME || process.env.LAVALINK_NAME || "main").trim() || "main";
  const node = sh.nodes.get(nodeName) || sh.nodes.values().next().value;
  if (!node) return false;
  const connected = Constants?.State?.CONNECTED;
  if (node.state === connected) return true;
    return String(node.state || "").toUpperCase() === "CONNECTED";
}

async function sendMusicQueueEndedEmbed(client?, textChannelId?, guildId?) {
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

function cancelPendingQueueEndedEmbed(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return;
  const t = pendingQueueEndedTimers.get(gid);
  if (t) {
    clearTimeout(t);
    pendingQueueEndedTimers.delete(gid);
  }
}

function scheduleMusicQueueEndedEmbed(client?, textChannelId?, guildId?) {
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

async function sendMusicInactivityLeaveEmbed(client?, textChannelId?, guildId?) {
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

function isMusicSessionQueueIdle(guildId?) {
  const session = guildQueues.get(String(guildId || "").trim());
  const np = String(session?.nowPlaying || "").trim();
  const pending = Array.isArray(session?.tracks) ? session.tracks.length : 0;
  return !np && pending === 0;
}

async function tickMusicInactivity(client?) {
  const sh = client.shoukaku;
  if (!sh?.connections?.size) {
    musicIdleSince.clear();
    return;
  }
  const now = Date.now();
  for (const [guildId, conn] of sh.connections) {
    const gid = String(guildId || "").trim();
    if (!gid || !conn?.channelId) continue;
    const { isGuildClipRecording } = require("../Voice/voiceClipService") as typeof import("../Voice/voiceClipService");
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
    const session = guildQueues.get(gid);
    const queueIdle = isMusicSessionQueueIdle(gid);
    /* playlistRaceFix1: tra un brano e l'altro / mirror probe non contare idle */
    const hasQueueWork = Boolean(
      session &&
        (session.nowPlaying ||
          (Array.isArray(session.tracks) && session.tracks.length) ||
          session._mirrorProbing ||
          session._playAdvanceLock),
    );
    const trackPlaying = Boolean(player?.track) && !player.paused;
    const emptyVc = humans === 0;
    const trulyIdle = !trackPlaying && !hasQueueWork && queueIdle;
    if (!emptyVc && !trulyIdle) {
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
    await musicLeaveTts(gid, client).catch(() => {});
  }
}

function startMusicInactivityWatcher(client?) {
  if (client._musicInactivityTickTimer) return;
  client._musicInactivityTickTimer = setInterval(() => {
    void tickMusicInactivity(client).catch((e?) => {
      global.logger?.warn?.("[MUSIC] inactivity tick:", e?.message || e);
    });
  }, 15_000);
  client._musicInactivityTickTimer.unref?.();
}

function getIdealMusicNode(client?) {
  const sh = client?.shoukaku;
  if (!sh?.nodes?.size) return null;
  return (
    sh.nodes.get(process.env.LAVALINK_NODE_NAME || "main") ||
    (typeof sh.getIdealNode === "function" ? sh.getIdealNode() : null) ||
    sh.nodes.values().next().value ||
    null
  );
}

/**
 * Avvia un brano in coda con gli stessi mirror della prima play.
 * Se lo stream non parte, prova i brani successivi invece di lasciare la coda bloccata.
 */
async function playSessionTrackNow(client?, player?, session?, guildId?, track?, opts: Record<string, any> = {}) {
  /* playlistRaceFix1: default più alto; non azzerare il resto della playlist a 8 fail */
  const maxAttempts = Math.max(1, Math.min(80, Number(opts.maxAttempts) || 40));
  const node = getIdealMusicNode(client);
  if (!node?.rest || !player || !session) {
    return { ok: false, interrupted: false, reason: "no_node" };
  }
  session._playAdvanceLock = true;
  try {
    let cand = track;
    for (let attempt = 0; attempt < maxAttempts && cand; attempt += 1) {
      session.nowPlaying = describeTrack(cand);
      session.currentRequesterUserId = cand?.vcRequestedByUserId || session.currentRequesterUserId || null;
      session.currentRequesterUserTag = cand?.vcRequestedByUserTag || session.currentRequesterUserTag || null;
      const started = await playWithMirrorFallbacks(player, session, node, cand);
      if (started.interrupted) return { ok: false, interrupted: true };
      if (started.ok && started.track) {
        session.playingEncoded = started.track.encoded;
        session.playingPositionMs = 0;
        session.nowPlaying = describeTrack(started.track);
        session.earlyPlayFailed = false;
        if (typeof session.suppressQueueEndUntil !== "undefined") {
          session.suppressQueueEndUntil = Date.now() + 4000;
        }
        if (session.repeatOne && started.track.encoded) {
          session.repeatEncoded = started.track.encoded;
        }
        try {
          persistMusicQueueSnapshotNow(client);
        } catch (_) {}
        return { ok: true, track: started.track };
      }
      logMusic("queue advance after failed start", {
        guildId: String(guildId || ""),
        attempt: attempt + 1,
        label: describeTrack(cand),
        left: Array.isArray(session.tracks) ? session.tracks.length : 0,
      });
      cand = shiftNextQueueTrack(session, null);
    }
    return {
      ok: false,
      interrupted: false,
      reason: "exhausted",
      left: Array.isArray(session.tracks) ? session.tracks.length : 0,
    };
  } finally {
    session._playAdvanceLock = false;
  }
}

function attachEndHandler(client?, player?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !player) return;
  if (typeof player.removeAllListeners === "function") {
    player.removeAllListeners("end");
    try {
      player.removeAllListeners("stuck");
    } catch (_) {}
    try {
      player.removeAllListeners("exception");
    } catch (_) {}
    try {
      player.removeAllListeners("closed");
    } catch (_) {}
  }
  endListeners.add(gid);

  const advanceAfterFailure = async (reasonTag?) => {
    const session = guildQueues.get(gid);
    if (!session || session._mirrorProbing || session._playAdvanceLock) return;
    const next = shiftNextQueueTrack(session, session.playingEncoded || null);
    if (!next) return;
    logMusic("force advance after player fault", { guildId: gid, reason: reasonTag });
    try {
      await playSessionTrackNow(client, player, session, gid, next);
    } catch (err) {
      global.logger?.warn?.("[MUSIC] force advance failed:", err?.message || err);
    }
  };

  player.on("stuck", (ev?) => {
    logMusic("track stuck", {
      guildId: gid,
      thresholdMs: ev?.thresholdMs,
      encoded: String(sessionPlayingEncoded(gid) || "").slice(0, 24),
    });
    void (async () => {
      try {
        if (typeof player.seekTo === "function") {
          await player.seekTo(0);
          return;
        }
      } catch (_) {}
      await advanceAfterFailure("stuck");
    })();
  });

  player.on("exception", (ev?) => {
    logMusic("track exception", {
      guildId: gid,
      message: ev?.exception?.message || ev?.message || "",
    });
    const session = guildQueues.get(gid);
    if (session) session.earlyPlayFailed = true;
    if (session?._mirrorProbing) return;
    void advanceAfterFailure("exception");
  });

  player.on("closed", (ev?) => {
    logMusic("player closed", { guildId: gid, code: ev?.code, byRemote: ev?.byRemote });
  });

  player.on("end", async (ev?) => {
    const reasonRaw = String(ev?.reason ?? ev?.endReason ?? "").toLowerCase();
    if (reasonRaw === "replaced") return;
    const session = guildQueues.get(gid);
    if (!session) return;
    /* playlistRaceFix1: end durante mirror → segnala fail, non shiftare coda */
    if (session._mirrorProbing || session._playAdvanceLock) {
      session.earlyPlayFailed = true;
      logMusic("end deferred during probe/advance", {
        guildId: gid,
        reason: reasonRaw,
        probing: Boolean(session._mirrorProbing),
        advancing: Boolean(session._playAdvanceLock),
      });
      return;
    }
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
          const replayTrack = {
            encoded,
            info: null,
            _mirrorCandidates: null,
          };
          const replayed = await playSessionTrackNow(client, player, session, gid, replayTrack, {
            maxAttempts: 1,
          });
          if (replayed.ok) return;
          session.repeatOne = false;
          session.repeatEncoded = null;
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
        session.tracks = snap.slice(1).map((e?) => ({ encoded: e.encoded, info: e.info || null }));
        const head = snap[0];
        clearSessionCurrentRequester(session);
        try {
          const looped = await playSessionTrackNow(
            client,
            player,
            session,
            gid,
            { encoded: head.encoded, info: head.info || null },
            { maxAttempts: 1 },
          );
          if (looped.ok) return;
          session.repeatQueue = false;
          session.repeatQueueSnapshot = null;
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
        /* non wipe tracks se ce ne sono ancora (race / suppress) */
        if (!Array.isArray(session.tracks) || !session.tracks.length) {
          session.tracks = [];
        }
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
    try {
      const played = await playSessionTrackNow(client, player, session, gid, next);
      if (played.ok || played.interrupted) return;
      const left = Array.isArray(session.tracks) ? session.tracks.length : 0;
      logMusic("play next exhausted attempts", { guildId: gid, left });
      /* playlistRaceFix1: se restano brani, non buttare tutta la playlist */
      if (left > 0) {
        const retry = shiftNextQueueTrack(session, null);
        if (retry) {
          const again = await playSessionTrackNow(client, player, session, gid, retry, {
            maxAttempts: 40,
          });
          if (again.ok || again.interrupted) return;
        }
      }
      const stillLeft = Array.isArray(session.tracks) ? session.tracks.length : 0;
      const notifyChannelId = session.textChannelId || null;
      session.nowPlaying = null;
      session.playingEncoded = null;
      clearSessionCurrentRequester(session);
      if (stillLeft <= 0) {
        session.tracks = [];
        musicIdleSince.set(guildId, Date.now());
        persistMusicQueueSnapshotNow(client);
        if (!shouldSuppressQueueEndedEmbed(session, reasonRaw)) {
          scheduleMusicQueueEndedEmbed(client, notifyChannelId, guildId);
        } else {
          cancelPendingQueueEndedEmbed(gid);
        }
      } else {
        logMusic("keep remaining playlist after start failures", { guildId: gid, left: stillLeft });
        musicIdleSince.set(guildId, Date.now());
        persistMusicQueueSnapshotNow(client);
        cancelPendingQueueEndedEmbed(gid);
      }
    } catch (err) {
      global.logger?.warn?.("[MUSIC] play next failed:", err?.message || err);
      /* non distruggere la coda: riprova il prossimo al prossimo end/skip */
      try {
        session.earlyPlayFailed = true;
        session.nowPlaying = null;
        session.playingEncoded = null;
        persistMusicQueueSnapshotNow(client);
      } catch (_) {}
    }
  });
}

function sessionPlayingEncoded(guildId?) {
  try {
    return guildQueues.get(String(guildId || "").trim())?.playingEncoded || "";
  } catch (_) {
    return "";
  }
}

function initLavalinkMusicIfEnabled(client?) {
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
  void waitForLavalinkTcpThenInitShoukaku(client).catch((err?) => {
    client._shoukakuInitPending = false;
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  });
}

function isTransientLavalinkConnectError(err?) {
  return require("../../../shared/music/lavalinkProbe").isTransientLavalinkConnectError(err);
}

async function waitForLavalinkTcpThenInitShoukaku(client?) {
  const { waitUntilLavalinkReady } = require("../../../shared/music/lavalinkProbe") as typeof import("../../../shared/music/lavalinkProbe");
  const ready = await waitUntilLavalinkReady({});
  const { host, port, url } = ready;
  const portNum = Number(port) || 2333;

  if (!ready.ok) {
    client._shoukakuInitPending = false;
    /* wait-for-lavalink già monitora: niente warn duplicato al boot. */
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
    shoukaku.on("error", (name?, err?) => {
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
    shoukaku.on("ready", (name?) => {
      refusedLogged = false;
      logMusic(`Lavalink collegato (nodo ${name})`);
            scheduleMusicPlaybackResume(client);
    });
    startMusicInactivityWatcher(client);
    startMusicQueueSnapshotLoop(client);
  } catch (err) {
    client._shoukakuInitPending = false;
    global.logger?.error?.("[MUSIC] Inizializzazione Shoukaku fallita:", err?.message || err, err?.stack);
  }
}

export = { lavalinkGlobalVolumeFromUserPercent, resolveDefaultJoinGlobalVolume, musicStartCapture, trackForManualQueue, clearSessionCurrentRequester, getSession, isLavalinkUsable, cancelPendingQueueEndedEmbed, attachEndHandler, initLavalinkMusicIfEnabled };
