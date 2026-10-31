/** Musica: pausa e ripresa del vocale durante il controllo AFK. */
const { notifyBotPresenceVoiceActivity } = require("../../../shared/discord/botPresenceActivity") as typeof import("../../../shared/discord/botPresenceActivity");
const { playEncodedFromStart } = require("./musicMirror") as typeof import("./musicMirror");
const { musicPurgeTts, guildQueues, mergeSessionSnapshotFromLivePlayer, persistMusicQueueSnapshotNow, getShardIdForGuild, clearBlockingNativeVoiceForMusic, leaveMusicVoiceChannelMarked } = require("./musicVoice") as typeof import("./musicVoice");
const { resolveDefaultJoinGlobalVolume, musicStartCapture, attachEndHandler } = require("./musicEngine") as typeof import("./musicEngine");

async function resumeMusicVoiceAfterAfkProbe(client?, guildId?) {
  const gid = String(guildId || "").trim();
  const sh = client?.shoukaku;
  if (!sh || !gid) return false;
  const session = guildQueues.get(gid);
  const encoded = String(session?.playingEncoded || "").trim();
  const vcId = String(session?.voiceChannelId || "").trim();
  if (!encoded || !vcId || !/^\d{17,22}$/.test(vcId)) return false;
  if (await clearBlockingNativeVoiceForMusic(gid, client)) {
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
    await musicPurgeTts(gid, client).catch(() => {});
    let player = sh.players.get(gid);
    if (!player) {
      player = await sh.joinVoiceChannel({
        guildId: gid,
        shardId: getShardIdForGuild(guild),
        channelId: voiceChannel.id,
        deaf: false,
      });
      notifyBotPresenceVoiceActivity(client);
      await musicStartCapture({
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
        deaf: false,
      });
      notifyBotPresenceVoiceActivity(client);
      await musicStartCapture({
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

async function suspendMusicVoiceForAfkProbe(client?, guildId?) {
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

export = { resumeMusicVoiceAfterAfkProbe, suspendMusicVoiceForAfkProbe };
