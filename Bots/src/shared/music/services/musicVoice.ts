/** Musica: canale vocale del bot (chi può comandarlo, entrata, uscita, disconnessioni). */
const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../../Vinili/Utils/Config/ids") as typeof import("../../../Vinili/Utils/Config/ids");
const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const { applyDefaultFooterToEmbeds } = require("../../embeds/defaultFooter") as typeof import("../../embeds/defaultFooter");
const path = require("path") as typeof import("path");
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { writeSnapshotWithMeta } = require("../../recovery/snapshotStore") as typeof import("../../recovery/snapshotStore");
const { getMusicBotHooks } = require("../../music/musicBotHooks") as typeof import("../../music/musicBotHooks");

function musicHooks() {
  return getMusicBotHooks();
}

async function musicPurgeTts(guildId?, client?) {
  const h = musicHooks();
  if (typeof h.purgeTtsVoicePersistence === "function") {
    return (h.purgeTtsVoicePersistence as any)(guildId, client);
  }
  const { purgeTtsVoicePersistence } = require("../../tts/services/ttsService") as typeof import("../../tts/services/ttsService");
  return purgeTtsVoicePersistence(guildId, client);
}
async function musicLeaveTts(guildId?, client?) {
  const h = musicHooks();
  if (typeof h.leaveTtsGuild === "function") {
    return (h.leaveTtsGuild as any)(guildId, client);
  }
  const { leaveTtsGuild } = require("../../tts/services/ttsService") as typeof import("../../tts/services/ttsService");
  return leaveTtsGuild(guildId, client);
}
async function musicStopCapture(guildId?) {
  const h = musicHooks();
  if (typeof h.stopVoiceContinuousCapture === "function") {
    return (h.stopVoiceContinuousCapture as any)(guildId);
  }
  try {
    const { stopVoiceContinuousCapture } = require("../../../Vinili/Services/Voice/voiceContinuousCaptureService") as typeof import("../../../Vinili/Services/Voice/voiceContinuousCaptureService");
    return stopVoiceContinuousCapture(guildId);
  } catch (_) {}
}

const guildQueues = new Map();
const endListeners = new Set();
const lastMusicEndHandledByGuild = new Map();
const musicIdleSince = new Map();
const MUSIC_QUEUE_SNAPSHOT_PATH = process.env.MUSIC_QUEUE_SNAPSHOT_PATH
  ? path.resolve(String(process.env.MUSIC_QUEUE_SNAPSHOT_PATH))
  : path.join(__dirname, "..", "..", "..", "Vinili", "Data", "musicQueueSnapshot.json");

function serializeQueueTrack(track?) {
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

function serializeEncodedLabelRows(rows?) {
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row?) => {
      const encoded = typeof row?.encoded === "string" ? row.encoded : null;
      if (!encoded) return null;
      const label = row?.label ? String(row.label) : "Traccia";
      return { encoded, label };
    })
    .filter(Boolean);
}

function serializeSessionSnapshot(session?) {
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
    /* posResume1: ms nella traccia corrente (0 = inizio) */
    playingPositionMs: Math.max(0, Math.floor(Number(session?.playingPositionMs) || 0)),
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

function mergeSessionSnapshotFromLivePlayer(client?, guildId?, session?) {
  const gid = String(guildId || "").trim();
  const base = session && typeof session === "object" ? { ...session } : {};
  if (!client?.shoukaku || !gid) return base;
  const player = client.shoukaku.players?.get(gid);
  const conn = client.shoukaku.connections?.get(gid);
  if (typeof player?.track === "string" && player.track.length) {
    base.playingEncoded = player.track;
  }
  if (player && Number.isFinite(Number(player.position))) {
    base.playingPositionMs = Math.max(0, Math.floor(Number(player.position) || 0));
  }
  if (conn?.channelId) {
    base.voiceChannelId = String(conn.channelId);
  }
  return base;
}

function getGuildMusicVoiceChannelId(guildId?) {
  const session = guildQueues.get(String(guildId || "").trim());
  const vc = session?.voiceChannelId;
  return vc ? String(vc) : null;
}

function resolveGuildMusicVoiceChannelId(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  const conn = client?.shoukaku?.connections?.get(gid);
  if (conn?.channelId) return String(conn.channelId);
  const guild = client?.guilds?.cache?.get(gid);
  const botVc = guild?.members?.me?.voice?.channelId;
  if (botVc) return String(botVc);
  return getGuildMusicVoiceChannelId(gid);
}

function guildMusicSessionBlocksOtherVoiceChannels(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { blocked: false, channelId: null };
  const musicVc = resolveGuildMusicVoiceChannelId(client, gid);
  if (!musicVc) return { blocked: false, channelId: null };
  const player = client?.shoukaku?.players?.get(gid);
  const session = guildQueues.get(gid);
  /* noVoiceSteal1: conta anche il bot fermo in vocale per la musica (coda finita, non ancora uscito):
     prima il TTS da un altro canale poteva portarlo via */
  const active =
    Boolean(player?.track) ||
    Boolean(String(session?.nowPlaying || "").trim()) ||
    (Array.isArray(session?.tracks) && session.tracks.length > 0) ||
    Boolean(client?.shoukaku?.connections?.get(gid)?.channelId);
  return { blocked: active, channelId: musicVc };
}

/** Canale del collegamento vocale "nativo" (TTS, clip) del bot in questo server, se c'è. */
function nativeVoiceChannelId(guildId?) {
  const conn = getVoiceConnection(String(guildId || ""));
  if (!conn || conn.state?.status === VoiceConnectionStatus.Destroyed) return "";
  return String(conn.joinConfig?.channelId || "");
}

function assertRequesterInActiveMusicVoiceChannel(client?, guild?, member?) {
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

function isMainGuildMusicAdminBypass(guild?, member?) {
  const gid = String(guild?.id || "").trim();
  const mainId = resolveMainGuildIdForMusic();
  if (!gid || !mainId || gid !== mainId) return false;
  const perms = member?.permissions;
  if (!perms || typeof perms.has !== "function") return false;
  return perms.has(PermissionsBitField.Flags.Administrator);
}

function assertMusicCommandAllowed(client?, guild?, member?, requesterUserId?) {
  const vcGate = assertRequesterInActiveMusicVoiceChannel(client, guild, member);
  if (!vcGate.ok) return vcGate;
  if (isMainGuildMusicAdminBypass(guild, member)) return { ok: true };
  return assertMusicSessionOwnerOrAllowLegacy(guild?.id, requesterUserId);
}

function guildHasMusicVoiceResumeHint(guildId?) {
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

function persistMusicQueueSnapshotNow(client?) {
  try {
    const sessions: Record<string, any> = {};
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

function getShardIdForGuild(guild?) {
  if (guild?.shardId != null && Number.isFinite(guild.shardId)) return guild.shardId;
  return 0;
}

function getShoukakuVoiceConnectionTimeoutSeconds() {
  const n = Number(process.env.SHOUKAKU_VOICE_CONNECTION_TIMEOUT);
  if (Number.isFinite(n) && n >= 15 && n <= 300) return Math.floor(n);
  return 60;
}

function musicJoinVoiceChannelErrorMessage(err?) {
  const m = String(err?.message || err || "");
  if (/not established|voice connection/i.test(m)) {
    return (
      "Connessione musica non pronta in tempo. Se il bot era in **TTS** nello stesso server, la musica (Lavalink) non può condividere quella sessione: usa prima il **leave** del TTS, poi `+play`. " +
      "Altrimenti verifica permessi nel canale vocale, firewall/UDP dal server **Lavalink** verso Discord, e opzionalmente `SHOUKAKU_VOICE_CONNECTION_TIMEOUT` (secondi) nel .env."
    );
  }
  return `Entrata in vocale fallita: ${m || "errore sconosciuto"}`;
}

function guildHasBlockingNativeVoiceConnection(guildId?) {
  const gid = String(guildId || "");
  if (!gid) return false;
  const conn = getVoiceConnection(gid);
  if (!conn) return false;
  return conn.state?.status !== VoiceConnectionStatus.Destroyed;
}

/* musicResumeNativePurge1 + musicResumeRetry1: TTS/capture leftover post-restart —
   un solo destroy+700ms spesso perde la race con restore TTS → resume skip permanente. */
async function clearBlockingNativeVoiceForMusic(guildId?, client?) {
  const gid = String(guildId || "").trim();
  if (!gid || !guildHasBlockingNativeVoiceConnection(gid)) return false;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await musicPurgeTts(gid, client).catch(() => {});
      // bug: `tts` non esisteva (errore subito dopo il purge, l'uscita del TTS non partiva mai)
      await musicLeaveTts(gid, client).catch(() => {});
    } catch (_) {}
    try {
      await (musicStopCapture as any)(gid, client).catch(() => {});
    } catch (_) {}
    try {
      const { clearVoiceSession } = require("../../../Vinili/Services/Voice/voiceSessionService") as typeof import("../../../Vinili/Services/Voice/voiceSessionService");
      clearVoiceSession(gid);
    } catch (_) {}
    try {
      const leftover = getVoiceConnection(gid);
      if (leftover && leftover.state?.status !== VoiceConnectionStatus.Destroyed) {
        try {
          leftover.destroy();
        } catch (_) {}
      }
    } catch (_) {}
    await new Promise((r?) => setTimeout(r, 500 + attempt * 500));
    if (!guildHasBlockingNativeVoiceConnection(gid)) return false;
  }
  return true;
}

function assertMusicSessionOwnerOrAllowLegacy(guildId?, requesterUserId?) {
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

async function sendMusicKickedFromVoiceEmbed(client?, textChannelId?, guildId?) {
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

function markMusicVoiceLeaveIntentional(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return;
  if (!client._musicIntentionalVoiceLeaveGuildIds) client._musicIntentionalVoiceLeaveGuildIds = new Set();
  client._musicIntentionalVoiceLeaveGuildIds.add(gid);
  const t = setTimeout(() => {
    client._musicIntentionalVoiceLeaveGuildIds?.delete(gid);
  }, 5000);
  t.unref?.();
}

async function leaveMusicVoiceChannelMarked(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return;
  await (musicStopCapture as any)(gid, client).catch(() => null);
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

async function handleMusicBotVoiceDisconnect(client?, guild?) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !client) return;
  const intentional = Boolean(client._musicIntentionalVoiceLeaveGuildIds?.has(gid));
  if (intentional) {
    client._musicIntentionalVoiceLeaveGuildIds?.delete(gid);
  }
  const sh = client.shoukaku;
  const session = guildQueues.get(gid);
  const player = sh?.players?.get(gid);
  const activelyPlaying = Boolean(player?.track);
  const hadPlayer = Boolean(player);
  const hadConn = Boolean(sh?.connections?.get(gid)?.channelId);
  const hadSessionMusic = Boolean(session && (session.tracks?.length || session.nowPlaying));
  const hadResumeHint = guildHasMusicVoiceResumeHint(gid);
  /* queueResumeKeep1: leave fantasma a boot (prima che resume finisca / senza track attiva) → tieni coda */
  const keepForResume =
    !intentional &&
    hadResumeHint &&
    !activelyPlaying &&
    (Boolean(client._musicPlaybackResumeInProgress) || !client._musicPlaybackResumeDone);
  const textChannelId = session?.textChannelId || null;
  if (hadPlayer || hadSessionMusic || hadConn || hadResumeHint) {
    /* playlistRaceFix1: leave intenzionale (AFK probe / stop) tiene la sessione in RAM */
    if (intentional || keepForResume) {
      persistMusicQueueSnapshotNow(client);
      logMusic(
        keepForResume
          ? "voice disconnect during resume window — keep queue session"
          : "voice disconnect intentional — keep queue session",
        { guildId: gid },
      );
    } else {
      guildQueues.delete(gid);
    }
    endListeners.delete(gid);
    if (sh?.players?.get(gid)) {
      try {
        await sh.players.get(gid).destroy();
      } catch (_) {}
    }
    try {
      await sh?.leaveVoiceChannel(gid);
    } catch (_) {}
    if (textChannelId && !intentional && !keepForResume) {
      await sendMusicKickedFromVoiceEmbed(client, textChannelId, gid);
    }
  }
  persistMusicQueueSnapshotNow(client);
  if (!intentional && !keepForResume) {
    await musicPurgeTts(gid, client).catch(() => {});
    try {
      const { clearVoiceSession } = require("../../../Vinili/Services/Voice/voiceSessionService") as typeof import("../../../Vinili/Services/Voice/voiceSessionService");
      clearVoiceSession(gid);
    } catch (_) {}
  }
}

async function destroyGhostMusicStateIfBotNotInVoice(client?, guild?) {
  const gid = String(guild?.id || "").trim();
  if (!gid || !client?.shoukaku) return;
  if (guild.members?.me?.voice?.channel?.id) return;
  const sh = client.shoukaku;
  const player = sh.players?.get(gid);
  const conn = sh.connections?.get(gid);
  const session = guildQueues.get(gid);
  /* queueResumeKeep1: non wipe snapshot in attesa di resume */
  if (
    guildHasMusicVoiceResumeHint(gid) &&
    !player?.track &&
    (Boolean(client._musicPlaybackResumeInProgress) || !client._musicPlaybackResumeDone)
  ) {
    return;
  }
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

export = { nativeVoiceChannelId, musicHooks, musicPurgeTts, musicLeaveTts, guildQueues, endListeners, lastMusicEndHandledByGuild, musicIdleSince, MUSIC_QUEUE_SNAPSHOT_PATH, serializeEncodedLabelRows, mergeSessionSnapshotFromLivePlayer, getGuildMusicVoiceChannelId, guildMusicSessionBlocksOtherVoiceChannels, assertMusicCommandAllowed, guildHasMusicVoiceResumeHint, persistMusicQueueSnapshotNow, getShardIdForGuild, getShoukakuVoiceConnectionTimeoutSeconds, musicJoinVoiceChannelErrorMessage, clearBlockingNativeVoiceForMusic, markMusicVoiceLeaveIntentional, leaveMusicVoiceChannelMarked, handleMusicBotVoiceDisconnect, destroyGhostMusicStateIfBotNotInVoice };
