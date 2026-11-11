/** Musica: ripresa sessioni da snapshot dopo collegamento Lavalink. */
const { logMusic } = require("./musicSearch") as typeof import("./musicSearch");
const { playEncodedFromStart } = require("./musicMirror") as typeof import("./musicMirror");
const {
  guildQueues,
  musicPurgeTts,
  persistMusicQueueSnapshotNow,
  getShardIdForGuild,
  clearBlockingNativeVoiceForMusic,
} = require("./musicVoice") as typeof import("./musicVoice");
const { notifyBotPresenceVoiceActivity } = require("../../discord/botPresenceActivity") as typeof import("../../discord/botPresenceActivity");
const { attachEndHandler } = require("./musicSessionQueue") as typeof import("./musicSessionQueue");

function musicEngineHelpers() {
  return require("./musicEngine") as typeof import("./musicEngine");
}

function scheduleMusicPlaybackResume(client?) {
  if (!client || client._musicPlaybackResumeScheduled || client._musicPlaybackResumeDone) return;
  client._musicPlaybackResumeScheduled = true;
  const run = async () => {
    let tries = 0;
        while (tries < 120 && !musicEngineHelpers().isLavalinkUsable(client)) {
      await new Promise((r?) => setTimeout(r, 1000));
      tries += 1;
    }
    if (!musicEngineHelpers().isLavalinkUsable(client)) {
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
    /* se la traccia corrente era già finita (posizione ≈ length ms), passa alla successiva */
    const npInfo =
      session?.nowPlaying && typeof session.nowPlaying === "object" ? session.nowPlaying : null;
    const curLen = Math.max(
      0,
      Math.floor(Number(npInfo?.length ?? npInfo?.info?.length ?? session?.playingTrackLengthMs ?? 0) || 0),
    );
    const curPos = Math.max(0, Math.floor(Number(session.playingPositionMs) || 0));
    if (encoded && curLen > 5000 && curPos >= Math.max(0, curLen - 2500)) {
      encoded = "";
      session.playingEncoded = null;
      session.playingPositionMs = 0;
      session.nowPlaying = null;
    }
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
    if (!encoded || !vcId || !/^\d{17,22}$/.test(vcId)) {
      if (!encoded && !(Array.isArray(session.tracks) && session.tracks.length)) {
        guildQueues.delete(gid);
        persistMusicQueueSnapshotNow(client);
      }
      continue;
    }
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
        await musicEngineHelpers().musicStartCapture({
          guildId: gid,
          voiceChannel,
          client,
          botUserId: client?.user?.id,
        }).catch((err?) => {
          global.logger?.warn?.("[MUSIC] voice capture start:", err?.message || err);
        });
      }
      attachEndHandler(client, player, gid);
      await player.setGlobalVolume(musicEngineHelpers().resolveDefaultJoinGlobalVolume());
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

export = { scheduleMusicPlaybackResume, resumeRestoredMusicSessions };
