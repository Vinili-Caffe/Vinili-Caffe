/** TTS: motore (stato per server, collegamento al vocale, coda e riproduzione) e salvataggio della coda. */
const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const { isVoiceTransportError, voiceTransportErrorMessage } = require("../../../shared/discord/voiceTransportErrors") as typeof import("../../../shared/discord/voiceTransportErrors");
const { getTtsVoiceJoinPolicy, voiceJoinRetryWaitMs } = require("../../../shared/discord/ttsVoiceJoinPolicy") as typeof import("../../../shared/discord/ttsVoiceJoinPolicy");
const { notifyBotPresenceVoiceActivity } = require("../../../shared/discord/botPresenceActivity") as typeof import("../../../shared/discord/botPresenceActivity");
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const prism = require("prism-media") as typeof import("prism-media");
const ffmpegStatic = require("ffmpeg-static") as typeof import("ffmpeg-static");
const { voiceFindOneAndUpdate, voiceDeleteOne } = require("../../Utils/BotState/domainStatesStore") as typeof import("../../Utils/BotState/domainStatesStore");
const { getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { safeUnlinkTtsFile, logTtsPlayFailure, createTtsBuffer } = require("./ttsProviders") as typeof import("./ttsProviders");
const { persistTtsQueueSnapshotNow, restoreTtsQueueForChannel, startTtsQueueSnapshotLoop } = require("./ttsQueuePersist") as typeof import("./ttsQueuePersist");

const ttsStates = new Map();
const ttsLastJoinAtByGuild = new Map();
const guildLocks = new Map();
const lastSavedChannels = new Map();
const ttsJoinWarnCache = new Map();
const ttsVoiceDisconnectSuppress = new Map();

function getState(voiceChannel?) {
  const key = voiceChannel.id;
  let state = ttsStates.get(key);
  if (!state) {
    const player = createAudioPlayer();
    state = {
      player,
      queue: [],
      connection: null,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      playing: false,
      currentTtsFile: null,
    };
    player.on(AudioPlayerStatus.Idle, () => {
      if (state.currentTtsFile) {
        safeUnlinkTtsFile(state.currentTtsFile);
        state.currentTtsFile = null;
      }
      state.playing = false;
      playNext(state);
    });
    player.on("error", (err?) => {
      global.logger.error("[TTS PLAYER ERROR]", err);
      state.playing = false;
      playNext(state);
    });
    ttsStates.set(key, state);
  }
  return state;
}
function getLockedChannelId(guildId?) {
  if (guildId == null) return null;
  return guildLocks.get(String(guildId)) || null;
}
function setLockedChannel(guildId?, channelId?) {
  if (guildId != null && channelId != null)
    guildLocks.set(String(guildId), String(channelId));
}
function clearLockedChannel(guildId?, channelId?) {
  if (guildId == null) return;
  const locked = guildLocks.get(String(guildId));
  if (locked && String(locked) === String(channelId)) {
    guildLocks.delete(String(guildId));
  }
}
function markTtsVoiceJoinGrace(guildId?) {
  if (guildId == null) return;
  ttsLastJoinAtByGuild.set(String(guildId), Date.now());
}
function clearTtsPostJoinVoiceGrace(guildId?) {
  if (guildId == null) return;
  ttsLastJoinAtByGuild.delete(String(guildId));
}

function markTtsVoiceDisconnectSuppress(guildId?, ttlMs = 2800) {
  if (guildId == null) return;
  ttsVoiceDisconnectSuppress.set(String(guildId), Date.now() + ttlMs);
}

function shouldIgnoreTtsVoiceDisconnectFinalize(guildId?) {
  const until = ttsVoiceDisconnectSuppress.get(String(guildId));
  return typeof until === "number" && Date.now() < until;
}

function attachTtsVoiceConnectionErrorHandler(connection?, guildId?, channelId = "") {
  if (!connection || connection.__vcTtsErrorHook) return;
  connection.__vcTtsErrorHook = true;
  connection.on("error", (err?) => {
    const errMessage = voiceTransportErrorMessage(err);
    if (!isVoiceTransportError(err)) {
      global.logger?.warn?.("[TTS] voice connection error:", errMessage || err);
      return;
    }
    if (shouldLogTtsJoinWarning(guildId, channelId, errMessage)) {
      global.logger?.warn?.("[TTS] voice transport:", errMessage);
    }
  });
}

function attachTtsVoiceConnectionDisconnectHandler(connection?, voiceChannel?) {
  const guildId = String(voiceChannel?.guild?.id || "");
  if (!guildId || !connection || connection.__vcTtsDisconnectHook) return;
  connection.__vcTtsDisconnectHook = true;
  attachTtsVoiceConnectionErrorHandler(connection, guildId, String(voiceChannel?.id || ""));
  connection.on("stateChange", (_oldState?, newState?) => {
    if (newState.status !== VoiceConnectionStatus.Disconnected) return;
    const delayMs = 1000;
    setTimeout(() => {
      void (async () => {
        try {
          if (shouldIgnoreTtsVoiceDisconnectFinalize(guildId)) return;
          const client = voiceChannel.client;
          const guild = await getClientGuildCached(client, guildId).catch(() => null);
          if (!guild || !client?.user?.id) return;
          await guild.members.fetch({ user: client.user.id, force: true }).catch(() => null);
          const me = guild.members.me;
          if (me?.voice?.channelId) return;
          const hasLock = Boolean(getLockedChannelId(guildId) || findLockedChannelIdByGuild(guildId));
          if (hasLock) {
            await leaveTtsGuild(guildId, client);
          } else {
            await clearVoiceState(guildId, String(client.user.id));
            cleanupAllTtsStateForGuild(guildId);
          }
        } catch (_) {}
      })();
    }, delayMs);
  });
}
function sleep(ms?) {
  return new Promise((r?) => setTimeout(r, ms));
}

function destroyVoiceConnectionSafe(connection?, logPrefix = "[TTS] connection destroy:") {
  if (!connection) return false;
  const suppressGid = connection.joinConfig?.guildId;
  if (suppressGid) markTtsVoiceDisconnectSuppress(suppressGid);
  const status = String(connection?.state?.status || "");
  if (status === String(VoiceConnectionStatus.Destroyed)) return false;
  try {
    connection.destroy();
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/already been destroyed/i.test(msg)) return false;
    global.logger?.warn?.(logPrefix, msg || err);
    return false;
  }
}

function getMusicVoiceCoordination() {
  try {
    return require("../Music/lavalinkMusicService");
  } catch {
    return null;
  }
}

function resolveMusicBlocksTtsForGuild(client?, guildId?) {
  const { resolveMusicBlocksTts } = require("../../../shared/discord/musicTtsVoiceGuard") as typeof import("../../../shared/discord/musicTtsVoiceGuard");
  return resolveMusicBlocksTts(client, guildId, getMusicVoiceCoordination());
}

function musicOwnsGuildVoice(guildId?, client = null) {
  return resolveMusicBlocksTtsForGuild(client, guildId).blocked;
}

function shouldLogTtsJoinWarning(guildId?, channelId?, errMessage?, ttlMs = 30000) {
  const key = `${String(guildId || "")}:${String(channelId || "")}:${String(errMessage || "")}`;
  const now = Date.now();
  const lastAt = Number(ttsJoinWarnCache.get(key) || 0);
  if (now - lastAt < ttlMs) return false;
  ttsJoinWarnCache.set(key, now);
  return true;
}
async function destroyGuildVoiceConnection(guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "");
  if (!gid) return false;
  markTtsVoiceDisconnectSuppress(gid);
  const policy = getTtsVoiceJoinPolicy();
  const existing = getVoiceConnection(gid);
  let destroyed = false;
  if (existing) {
    destroyed = destroyVoiceConnectionSafe(existing, "[TTS] destroy existing voice connection:");
  }
  const settleMs =
    opts.settleMs != null
      ? Math.max(0, Number(opts.settleMs) || 0)
      : destroyed
        ? policy.destroySettleMs
        : policy.emptyDestroySettleMs;
  if (settleMs > 0) await sleep(settleMs);
  return destroyed;
}
async function ensureConnection(state?, voiceChannel?) {
  const musicBlock = resolveMusicBlocksTtsForGuild(voiceChannel.client, voiceChannel.guild.id);
  if (musicBlock.blocked) return null;
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return null;
  }
  const policy = getTtsVoiceJoinPolicy();
  if (state.connection?.joinConfig?.channelId === voiceChannel.id) {
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, Math.min(policy.readyTimeoutMs, 8_000));
      attachTtsVoiceConnectionDisconnectHandler(state.connection, voiceChannel);
      notifyBotPresenceVoiceActivity(voiceChannel.client);
      return state.connection;
    } catch {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
  }
  if (state.connection) {
    destroyVoiceConnectionSafe(state.connection);
    state.connection = null;
  }
  markTtsVoiceDisconnectSuppress(voiceChannel.guild.id);
  await destroyGuildVoiceConnection(voiceChannel.guild.id);
  const maxAttempts = policy.maxAttempts;
  const readyTimeoutMs = policy.readyTimeoutMs;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let connection = null;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      attachTtsVoiceConnectionErrorHandler(connection, voiceChannel.guild.id, voiceChannel.id);
      state.connection = connection;
      state.guildId = voiceChannel.guild.id;
      state.channelId = voiceChannel.id;
      connection.subscribe(state.player);
      await entersState(connection, VoiceConnectionStatus.Ready, readyTimeoutMs);
      setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
      await saveVoiceState(voiceChannel.guild.id, voiceChannel.id, String(voiceChannel.client?.user?.id || ""));
      markTtsVoiceJoinGrace(voiceChannel.guild.id);
      attachTtsVoiceConnectionDisconnectHandler(connection, voiceChannel);
      notifyBotPresenceVoiceActivity(voiceChannel.client);
      return connection;
    } catch (err) {
      if (connection) {
        destroyVoiceConnectionSafe(connection, "[TTS] connection destroy after error:");
        state.connection = null;
      }
      await destroyGuildVoiceConnection(voiceChannel.guild.id, { settleMs: policy.destroySettleMs });
      if (isVoiceTransportError(err) && attempt < maxAttempts) {
        const waitMs = voiceJoinRetryWaitMs(attempt);
        const errMessage = String(err?.message || err);
        if (
          shouldLogTtsJoinWarning(
            voiceChannel.guild?.id,
            voiceChannel.id,
            `retry:${errMessage}`,
            12_000,
          )
        ) {
          global.logger?.warn?.(
            "[TTS] voice join retry",
            `${attempt}/${maxAttempts}`,
            "in",
            waitMs + "ms:",
            errMessage,
          );
        }
        await sleep(waitMs);
        continue;
      }
      global.logger?.warn?.("[TTS] voice join failed:", err?.message || err);
      throw err;
    }
  }
  return null;
}
async function playNext(state?) {
  if (state.queue.length === 0) {
    state.playing = false;
    persistTtsQueueSnapshotNow();
    return;
  }
  const item = state.queue.shift();
  persistTtsQueueSnapshotNow();
  state.playing = true;
  const tmpPath = path.resolve(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  state.currentTtsFile = null;
  try {
    const connection = await ensureConnection(state, item.voiceChannel);
    if (!connection) {
      state.playing = false;
      playNext(state);
      return;
    }
    const buffer = await createTtsBuffer(item.text, item.lang);
    if (!buffer || buffer.length === 0) throw new Error("TTS buffer vuoto");
    fs.writeFileSync(tmpPath, buffer);
    state.currentTtsFile = tmpPath;
    const ffmpegArgs = ["-analyzeduration", "0", "-loglevel", "0", "-i", tmpPath, "-f", "s16le", "-ar", "48000", "-ac", "2",];
    const transcoder = new prism.FFmpeg(({ args: ffmpegArgs, shell: false, command: ffmpegStatic || "ffmpeg", } as any));
    const resource = createAudioResource(transcoder, { inputType: StreamType.Raw, inlineVolume: false, });
    state.player.play(resource);
  } catch (err) {
    logTtsPlayFailure(err);
    safeUnlinkTtsFile(tmpPath);
    state.currentTtsFile = null;
    state.playing = false;
    playNext(state);
  }
}
function findLockedChannelIdByGuild(guildId?) {
  if (guildId == null) return null;
  const gid = String(guildId);
  for (const [channelId, state] of ttsStates.entries()) {
    if (state?.guildId && String(state.guildId) === gid && state.connection) {
      return channelId;
    }
  }
  return null;
}

function cleanupAllTtsStateForGuild(guildId?) {
  if (guildId == null) return;
  const gid = String(guildId);
  for (const [channelId, state] of [...ttsStates.entries()]) {
    if (!state || String(state.guildId) !== gid) continue;
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      safeUnlinkTtsFile(state.currentTtsFile);
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
    ttsStates.delete(channelId);
  }
  guildLocks.delete(gid);
  clearTtsPostJoinVoiceGrace(gid);
  persistTtsQueueSnapshotNow();
}

async function leaveTtsGuild(guildId?, client?) {
  const { stopVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService") as typeof import("../Voice/voiceContinuousCaptureService");
  await stopVoiceContinuousCapture(guildId, client).catch(() => null);
  markTtsVoiceDisconnectSuppress(guildId);
  clearTtsPostJoinVoiceGrace(guildId);

  /* findBotVoice: mai destroy della connessione del minigame (anche se empty-VC leave gareggia col join). */
  if (client) {
    try {
      const { shouldDeferTtsLeaveForFindBotVoiceMinigame } = require("../Minigames/minigameService") as typeof import("../Minigames/minigameService");
      const guildEarly = await getClientGuildCached(client, guildId);
      const meEarly =
        guildEarly?.members?.me ??
        (guildEarly && client.user?.id ? await getGuildMemberCached(guildEarly, client.user.id) : null);
      const holdChannelId = String(meEarly?.voice?.channelId || "");
      if (shouldDeferTtsLeaveForFindBotVoiceMinigame(client, guildId, holdChannelId)) {
        return { ok: false, reason: "find_bot_voice_active" };
      }
    } catch (err) {
      global.logger?.warn?.("[TTS] findBotVoice leave guard:", err?.message || err);
    }
  }

  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) {
    lockedChannelId = findLockedChannelIdByGuild(guildId);
    if (lockedChannelId) setLockedChannel(guildId, lockedChannelId);
  }
  if (!lockedChannelId && client) {
    const guild = await getClientGuildCached(client, guildId);
    const me = guild?.members?.me ?? (guild && client.user?.id ? await getGuildMemberCached(guild, client.user.id) : null);
    if (me?.voice?.channelId) {
      try {
        const { shouldDeferTtsLeaveForFindBotVoiceMinigame } = require("../Minigames/minigameService") as typeof import("../Minigames/minigameService");
        if (shouldDeferTtsLeaveForFindBotVoiceMinigame(client, guildId, String(me.voice.channelId))) {
          return { ok: false, reason: "find_bot_voice_active" };
        }
      } catch (_) {}
      try {
        const existing = getVoiceConnection(String(guildId));
        if (existing) {
          destroyVoiceConnectionSafe(existing, "[TTS] disconnect cleanup:");
        } else {
          cleanupAllTtsStateForGuild(guildId);
        }
      } catch (err) {
        global.logger?.warn?.("[TTS] disconnect cleanup:", err?.message || err);
      }
      cleanupAllTtsStateForGuild(guildId);
      await clearVoiceState(guildId, String(client?.user?.id || ""));
      return { ok: true };
    }
    await clearVoiceState(guildId, String(client?.user?.id || ""));
    persistTtsQueueSnapshotNow();
    return { ok: false, reason: "not_connected" };
  }
  if (!lockedChannelId) {
    await clearVoiceState(guildId, String(client?.user?.id || ""));
    persistTtsQueueSnapshotNow();
    return { ok: false, reason: "not_connected" };
  }
  const state = ttsStates.get(lockedChannelId);
  if (state) {
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      safeUnlinkTtsFile(state.currentTtsFile);
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
    clearLockedChannel(guildId, lockedChannelId);
    ttsStates.delete(lockedChannelId);
  } else {
    clearLockedChannel(guildId, lockedChannelId);
    cleanupAllTtsStateForGuild(guildId);
  }
  await clearVoiceState(guildId, String(client?.user?.id || ""));
  persistTtsQueueSnapshotNow();
  return { ok: true };
}

async function saveVoiceState(guildId?, channelId?, botUserId?) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !channelId || !bid) return;
  if (musicOwnsGuildVoice(guildId)) return;
  const dedupeKey = `${guildId}:${bid}`;
  if (lastSavedChannels.get(dedupeKey) === channelId) return;
  lastSavedChannels.set(dedupeKey, channelId);
  try {
    await (voiceFindOneAndUpdate as any)(
      { guildId, botUserId: bid, claimLegacyVoiceRow: true },
      { $set: { channelId, lockedChannelId: channelId, updatedAt: new Date() } },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save voice state", error);
  }
}

async function clearVoiceState(guildId?, botUserId?) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !bid) return;
  lastSavedChannels.delete(`${guildId}:${bid}`);
  try {
    await voiceDeleteOne({ guildId, botUserId: bid });
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to clear voice state", error);
  }
}

export = { ttsStates, ttsLastJoinAtByGuild, guildLocks, persistTtsQueueSnapshotNow, restoreTtsQueueForChannel, startTtsQueueSnapshotLoop, safeUnlinkTtsFile, logTtsPlayFailure, createTtsBuffer, getState, getLockedChannelId, setLockedChannel, clearLockedChannel, clearTtsPostJoinVoiceGrace, markTtsVoiceDisconnectSuppress, sleep, destroyVoiceConnectionSafe, getMusicVoiceCoordination, resolveMusicBlocksTtsForGuild, musicOwnsGuildVoice, ensureConnection, playNext, findLockedChannelIdByGuild, cleanupAllTtsStateForGuild, leaveTtsGuild, saveVoiceState, clearVoiceState };
