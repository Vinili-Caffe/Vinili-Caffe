/** TTS: ripresa dei collegamenti e dei messaggi persi dopo un riavvio. */
const { getTtsVoiceJoinPolicy } = require("../../discord/ttsVoiceJoinPolicy") as typeof import("../../discord/ttsVoiceJoinPolicy");
const { voiceFindOneAndUpdate, voiceFindManyLeanForBot } = require("../../botState/domainStatesStore") as typeof import("../../botState/domainStatesStore");
const { getClientChannelCached } = require("../../discord/interactionEntityCache") as typeof import("../../discord/interactionEntityCache");
const { filterScriptsForTtsLang } = require("../../discord/ttsTextSanitize") as typeof import("../../discord/ttsTextSanitize");
const { persistTtsQueueSnapshotNow, restoreTtsQueueForChannel, startTtsQueueSnapshotLoop, getState, getLockedChannelId, sleep, getMusicVoiceCoordination, resolveMusicBlocksTtsForGuild, musicOwnsGuildVoice, ensureConnection, playNext } = require("./ttsEngine") as typeof import("./ttsEngine");
const { booleanFromConfig, passesTtsContentFilters, sanitizeText, normalizeCaseForTts, expandAbbreviationsForTts, normalizePausesForTts, numbersToWordsForTts } = require("./ttsText") as typeof import("./ttsText");
const { warmUserTtsLangsFromDb, hydrateUserTtsLangForUser, getUserTtsLang } = require("./ttsLang") as typeof import("./ttsLang");
const { resolveTtsMessageVoiceChannel, authorIsInVoiceChannel, purgeTtsVoicePersistence } = require("./ttsVoice") as typeof import("./ttsVoice");

const MAX_TTS_QUEUE = 10000;
const TTS_CATCHUP_FETCH_LIMIT = 100;
const TTS_CATCHUP_DEFAULT_LOOKBACK_MS = 30 * 1000;

function shouldHandleMessage(message?, botVoiceChannelId?) {
  const messageVoiceChannel = resolveTtsMessageVoiceChannel(message);
  if (!messageVoiceChannel || !botVoiceChannelId) return false;
  return String(messageVoiceChannel.id) === String(botVoiceChannelId);
}
function enqueue(state?, item?) {
  if (state.queue.length >= MAX_TTS_QUEUE) return;
  state.queue.push(item);
  persistTtsQueueSnapshotNow();
  if (!state.playing) {
    playNext(state);
  }
}
async function joinTtsChannel(voiceChannel?) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const musicBlock = resolveMusicBlocksTtsForGuild(voiceChannel.client, voiceChannel.guild.id);
  if (musicBlock.blocked) {
    return { ok: false, reason: "music_active", musicChannelId: musicBlock.channelId };
  }
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && String(lockedChannelId) !== String(voiceChannel.id)) {
    return { ok: false, reason: "locked" };
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch((err?) => {
    global.logger?.warn?.("[TTS] joinTtsChannel failed:", err?.message || err);
    return null;
  });
  if (!connection) return { ok: false, reason: "join_failed" };
  const { startVoiceContinuousCapture } = require("../../../Vinili/Services/Voice/voiceContinuousCaptureService") as typeof import("../../../Vinili/Services/Voice/voiceContinuousCaptureService");
  await startVoiceContinuousCapture({
    guildId: voiceChannel.guild.id,
    voiceChannel,
    client: voiceChannel.client,
    botUserId: voiceChannel.client?.user?.id,
  }).catch((err?) => {
    global.logger?.warn?.("[TTS] voice capture start:", err?.message || err);
  });
  return { ok: true };
}

async function saveTtsLastMessageProgress(guildId?, channelId?, messageId?, createdTimestamp?, botUserId?) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !channelId || !messageId || !bid) return;
  if (musicOwnsGuildVoice(guildId)) return;
  const gid = String(guildId);
  const cid = String(channelId);
  const mid = String(messageId);
  const ts = createdTimestamp ? new Date(Number(createdTimestamp)) : new Date();
  try {
    await (voiceFindOneAndUpdate as any)(
      { guildId: gid, botUserId: bid, claimLegacyVoiceRow: true },
      {
        $set: {
          channelId: cid,
          lockedChannelId: cid,
          lastTtsMessageId: mid,
          lastTtsProcessedAt: ts,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save last TTS message progress", error);
  }
}

async function enqueueTtsMessageFromHistory(message?, client?, voiceChannel?, state?, prefix?) {
  const config = client?.config;
  if (!message || !client || !voiceChannel || !state) return;
  if (!passesTtsContentFilters(message, config, prefix)) return;
  if (!shouldHandleMessage(message, voiceChannel.id)) return;
  if (!(await authorIsInVoiceChannel(message, voiceChannel))) return;
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false);
  await hydrateUserTtsLangForUser(message.author?.id);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText));
  baseText = filterScriptsForTtsLang(baseText, lang);
  if (!baseText || !baseText.trim()) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = message.author?.username || "Utente";
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  enqueue(state, { voiceChannel, text, lang });
  await saveTtsLastMessageProgress(voiceChannel.guild.id, voiceChannel.id, message.id, message.createdTimestamp, String(voiceChannel.client?.user?.id || ""));
}

async function catchupTtsMessagesForChannel(
  client?,
  voiceChannel?,
  lastProcessedAt?,
  lastProcessedMessageId?,
  prefix?,
) {
  if (!voiceChannel?.messages?.fetch) return;
  const nowMs = Date.now();
  const baseCutoffMs = lastProcessedAt ? new Date(lastProcessedAt).getTime() : nowMs - TTS_CATCHUP_DEFAULT_LOOKBACK_MS;
  if (!Number.isFinite(baseCutoffMs)) return;

  const state = getState(voiceChannel);
  const messages = await voiceChannel.messages.fetch({ limit: TTS_CATCHUP_FETCH_LIMIT }).catch(() => null);
  if (!messages) return;

  const cutoffMs = Math.max(0, baseCutoffMs - 1500);
  const sorted = Array.from(messages.values()).sort((a?: any, b?: any) => a.createdTimestamp - b.createdTimestamp);

  for (const message of sorted) {
    if (state.queue.length >= MAX_TTS_QUEUE) break;
    if (
      lastProcessedMessageId &&
      String((message as any)?.id || "") === String(lastProcessedMessageId)
    ) {
      continue;
    }
    if ((message as any)?.createdTimestamp <= cutoffMs) continue;
    if ((message as any)?.author?.bot) continue;
    await enqueueTtsMessageFromHistory(message, client, voiceChannel, state, prefix).catch(() => null);
  }
}

async function restoreTtsConnections(client?) {
  try {
    startTtsQueueSnapshotLoop(client);
    await warmUserTtsLangsFromDb();
    if (!booleanFromConfig(client?.config?.tts?.restoreVoiceOnRestart, true)) {
      return;
    }
    const policy = getTtsVoiceJoinPolicy();
    if (policy.restoreBootDelayMs > 0) {
      await sleep(policy.restoreBootDelayMs);
    }
    const prefix = String(client?.config?.prefix || "+");
    const states = await voiceFindManyLeanForBot(String(client.user.id), { includeLegacyWithoutBot: false }).catch(() => []);
    const concurrency = policy.restoreConcurrency;

    for (let i = 0; i < states.length; i += concurrency) {
      const batch = states.slice(i, i + concurrency);
      await Promise.all(
        batch.map(async (entry?) => {
          const channel = await getClientChannelCached(client, entry?.channelId);
          if (!channel || !channel.isVoiceBased?.()) return;
          const gid = String(channel.guild?.id || entry?.guildId || "");
          if (!gid) return;
          if (musicOwnsGuildVoice(gid, client)) {
            await purgeTtsVoicePersistence(gid, client);
            return;
          }
          const music = getMusicVoiceCoordination();
          const musicVc = typeof music?.getGuildMusicVoiceChannelId === "function"
            ? music.getGuildMusicVoiceChannelId(gid)
            : null;
          if (musicVc && String(musicVc) !== String(channel.id)) {
            await purgeTtsVoicePersistence(gid, client);
            return;
          }

          await joinTtsChannel(channel).catch((e?) =>
            global.logger?.warn?.("[TTS] restore join skipped:", e?.message || e),
          );
          await catchupTtsMessagesForChannel(
            client,
            channel,
            entry?.lastTtsProcessedAt,
            entry?.lastTtsMessageId,
            prefix,
          );
          restoreTtsQueueForChannel(channel);
        }),
      );
      if (policy.restoreGapMs > 0 && i + concurrency < states.length) {
        await sleep(policy.restoreGapMs);
      }
    }
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to restore voice connections", error);
  }
}

export = { shouldHandleMessage, enqueue, joinTtsChannel, saveTtsLastMessageProgress, restoreTtsConnections };
