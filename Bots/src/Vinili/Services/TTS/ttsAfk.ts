/** TTS: pausa durante il controllo AFK e annunci singoli. */
const { getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, StreamType } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const prism = require("prism-media") as typeof import("prism-media");
const ffmpegStatic = require("ffmpeg-static") as typeof import("ffmpeg-static");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ttsStates, safeUnlinkTtsFile, logTtsPlayFailure, createTtsBuffer, getState, getLockedChannelId, markTtsVoiceDisconnectSuppress, destroyVoiceConnectionSafe, playNext, findLockedChannelIdByGuild } = require("./ttsEngine") as typeof import("./ttsEngine");
const { joinTtsChannel } = require("./ttsRestore") as typeof import("./ttsRestore");

function getTtsReturnChannelIdForGuild(guildId?) {
  if (guildId == null) return null;
  const gid = String(guildId);
  return getLockedChannelId(gid) || findLockedChannelIdByGuild(gid) || null;
}

async function suspendTtsVoiceForAfkProbe(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return { active: false };
  const channelId = getTtsReturnChannelIdForGuild(gid);
  const conn = getVoiceConnection(gid);
  const activeChannelId = String(channelId || conn?.joinConfig?.channelId || "").trim();
  if (!activeChannelId && !conn) return { active: false };

  const { stopVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService") as typeof import("../Voice/voiceContinuousCaptureService");
  await stopVoiceContinuousCapture(gid, client).catch(() => null);

  const state = ttsStates.get(activeChannelId);
  if (state?.connection) {
    markTtsVoiceDisconnectSuppress(gid);
    destroyVoiceConnectionSafe(state.connection);
    state.connection = null;
  }
  if (state) state.playing = false;
  return { active: true, channelId: activeChannelId };
}

async function resumeTtsVoiceAfterAfkProbe(client?, guildId?, channelId?, queueSnapshot?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  if (!gid || !cid || !client) return false;
  const channel = await getClientChannelCached(client, cid).catch(() => null);
  if (!channel?.isVoiceBased?.()) return false;
  const joined = await joinTtsChannel(channel);
  if (!joined?.ok) return false;
  const state = getState(channel);
  const items = Array.isArray(queueSnapshot) ? queueSnapshot : [];
  for (const item of items) {
    const text = String(item?.text || "").trim();
    if (!text) continue;
    const lang = String(item?.lang || "it").trim() || "it";
    state.queue.push({ voiceChannel: channel, text, lang });
  }
  if (!state.playing && state.queue.length) playNext(state);
  return true;
}

async function playOneShotTtsOnConnection(connection?, text?, lang = "it") {
  const phrase = String(text || "").trim();
  if (!connection || !phrase) return false;

  const tmpPath = path.resolve(
    os.tmpdir(),
    `tts_oneshot_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  const player = createAudioPlayer();
  let subscribed = false;
  try {
    const buffer = await createTtsBuffer(phrase, lang);
    if (!buffer || buffer.length === 0) return false;
    fs.writeFileSync(tmpPath, buffer);
    connection.subscribe(player);
    subscribed = true;
    const ffmpegArgs = [
      "-analyzeduration", "0", "-loglevel", "0", "-i", tmpPath,
      "-f", "s16le", "-ar", "48000", "-ac", "2",
    ];
    const transcoder = new prism.FFmpeg(({
      args: ffmpegArgs,
      shell: false,
      command: ffmpegStatic || "ffmpeg",
    } as any));
    const resource = createAudioResource(transcoder, {
      inputType: StreamType.Raw,
      inlineVolume: false,
    });
    await new Promise((resolve?, reject?) => {
      const done = (err?) => {
        player.removeListener(AudioPlayerStatus.Idle, onIdle);
        player.removeListener("error", onError);
        if (err) reject(err);
        else ((resolve as any)() as any);
      };
      const onIdle = () => done(null);
      const onError = (err?) => done(err);
      player.once(AudioPlayerStatus.Idle, onIdle);
      player.once("error", onError);
      player.play(resource);
    });
    return true;
  } catch (err) {
    logTtsPlayFailure(err);
    return false;
  } finally {
    if (subscribed) {
      try {
        player.stop();
      } catch (_) {}
    }
    safeUnlinkTtsFile(tmpPath);
  }
}

export = { getTtsReturnChannelIdForGuild, suspendTtsVoiceForAfkProbe, resumeTtsVoiceAfterAfkProbe, playOneShotTtsOnConnection };
