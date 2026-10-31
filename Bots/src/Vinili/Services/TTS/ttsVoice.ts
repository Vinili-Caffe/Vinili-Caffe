/** TTS: collegamento al vocale (entrata, spostamenti, disconnessioni, musica). */
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const { ttsStates, ttsLastJoinAtByGuild, guildLocks, getLockedChannelId, setLockedChannel, clearLockedChannel, clearTtsPostJoinVoiceGrace, markTtsVoiceDisconnectSuppress, resolveMusicBlocksTtsForGuild, findLockedChannelIdByGuild, cleanupAllTtsStateForGuild, saveVoiceState, clearVoiceState } = require("./ttsEngine") as typeof import("./ttsEngine");

const TTS_POST_JOIN_EMPTY_LEAVE_GRACE_MS = 6000;

function resolveTtsMessageVoiceChannel(message?) {
  if (!message?.channel) return null;
  if (message.channel.isVoiceBased?.() && !message.channel.isThread?.()) {
    return message.channel;
  }
  if (message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.()) {
    return message.channel.parent;
  }
  return null;
}

function resolveBotTtsVoiceChannelId(guildId?, client?) {
  if (!guildId) return null;
  const gid = String(guildId);
  const fromLock = getLockedChannelId(gid) || findLockedChannelIdByGuild(gid);
  if (fromLock) return String(fromLock);
    if (resolveMusicBlocksTtsForGuild(client, gid).blocked) return null;
  const me = client?.guilds?.cache?.get(gid)?.members?.me;
  const fromVoice = me?.voice?.channelId;
  return fromVoice ? String(fromVoice) : null;
}

async function authorIsInVoiceChannel(message?, voiceChannel?) {
  if (!message?.author?.id || !voiceChannel?.id) return false;
  let member = message.member;
  if (!member?.voice && message.guild) {
    member = await getGuildMemberCached(message.guild, message.author.id).catch(() => null);
  }
  const authorVoiceId = member?.voice?.channel?.id ?? member?.voice?.channelId ?? null;
  if (!authorVoiceId) return false;
  return String(authorVoiceId) === String(voiceChannel.id);
}
function isTtsPostJoinVoiceGraceActive(guildId?, graceMs = TTS_POST_JOIN_EMPTY_LEAVE_GRACE_MS) {
  if (guildId == null) return false;
  const at = Number(ttsLastJoinAtByGuild.get(String(guildId)));
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < graceMs;
}

async function handleTtsBotVoiceMove({ voiceChannel, oldChannelId }) {
  if (!voiceChannel?.guild?.id || !voiceChannel?.id || !oldChannelId) return { ok: false, reason: "invalid" };
  const guildId = String(voiceChannel.guild.id);
  const oldId = String(oldChannelId);
  const newId = String(voiceChannel.id);
  if (!newId || !oldId || oldId === newId) return { ok: false, reason: "no_change" };

  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) lockedChannelId = findLockedChannelIdByGuild(guildId);
  if (lockedChannelId && String(lockedChannelId) !== oldId) {
    return { ok: false, reason: "not_tts_channel" };
  }

  const oldState = ttsStates.get(oldId) || null;
  const newState = ttsStates.get(newId) || null;

  if (newState && newState !== oldState) {
    markTtsVoiceDisconnectSuppress(guildId);
    try { if (newState.connection) newState.connection.destroy(); } catch (_) { }
    ttsStates.delete(newId);
  }

  if (oldState) {
    ttsStates.delete(oldId);
    oldState.guildId = guildId;
    oldState.channelId = newId;
    if (oldState.connection?.joinConfig) {
      try { oldState.connection.joinConfig.channelId = newId; } catch (_) { }
    }
    try { oldState.connection?.subscribe?.(oldState.player); } catch (_) { }
    ttsStates.set(newId, oldState);
  }

  clearLockedChannel(guildId, oldId);
  setLockedChannel(guildId, newId);
  await saveVoiceState(guildId, newId, String(voiceChannel.client?.user?.id || ""));
  const { startVoiceContinuousCapture } = require("../Voice/voiceContinuousCaptureService") as typeof import("../Voice/voiceContinuousCaptureService");
  await startVoiceContinuousCapture({
    guildId,
    voiceChannel,
    client: voiceChannel.client,
    botUserId: voiceChannel.client?.user?.id,
  }).catch((err?) => {
    global.logger?.warn?.("[TTS] voice capture move restart:", err?.message || err);
  });
  return { ok: true };
}

async function purgeTtsVoicePersistence(guildId?, client?) {
  if (guildId == null) return;
  const gid = String(guildId);
  markTtsVoiceDisconnectSuppress(gid);
  clearTtsPostJoinVoiceGrace(gid);
  clearGuildTtsLock(gid);
  cleanupAllTtsStateForGuild(gid);
  if (client?.user?.id) {
    await clearVoiceState(gid, String(client.user.id));
  }
}
function clearGuildTtsLock(guildId?) {
  if (guildId == null) return;
  guildLocks.delete(String(guildId));
}

export = { resolveTtsMessageVoiceChannel, resolveBotTtsVoiceChannelId, authorIsInVoiceChannel, isTtsPostJoinVoiceGraceActive, handleTtsBotVoiceMove, purgeTtsVoicePersistence, clearGuildTtsLock };
