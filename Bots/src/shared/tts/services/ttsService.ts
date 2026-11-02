
const { accountUsername } = require("../../discord/guildDiscordIdentity") as typeof import("../../discord/guildDiscordIdentity");
const { filterScriptsForTtsLang } = require("../../discord/ttsTextSanitize") as typeof import("../../discord/ttsTextSanitize");
const { ttsStates, getState, resolveMusicBlocksTtsForGuild, ensureConnection, leaveTtsGuild } = require("./ttsEngine") as typeof import("./ttsEngine");
const { booleanFromConfig, passesTtsContentFilters, sanitizeText, normalizeCaseForTts, expandAbbreviationsForTts, normalizePausesForTts, numbersToWordsForTts } = require("./ttsText") as typeof import("./ttsText");
const { hydrateUserTtsLangForUser, setUserTtsLang, getUserTtsLang, resolveDefaultTtsLang } = require("./ttsLang") as typeof import("./ttsLang");
const { resolveTtsMessageVoiceChannel, resolveBotTtsVoiceChannelId, authorIsInVoiceChannel, isTtsPostJoinVoiceGraceActive, handleTtsBotVoiceMove, purgeTtsVoicePersistence } = require("./ttsVoice") as typeof import("./ttsVoice");
const { shouldHandleMessage, enqueue, joinTtsChannel, saveTtsLastMessageProgress, restoreTtsConnections } = require("./ttsRestore") as typeof import("./ttsRestore");
const { getTtsReturnChannelIdForGuild, suspendTtsVoiceForAfkProbe, resumeTtsVoiceAfterAfkProbe, playOneShotTtsOnConnection } = require("./ttsAfk") as typeof import("./ttsAfk");


async function handleTtsMessage(message?, client?, prefix?) {
  const config = client?.config;
  if (message?.author?.bot) return;
  const guildId = message.guild?.id;
  if (!guildId || !passesTtsContentFilters(message, config, prefix)) return;
  if (!message.member && message.guild?.members?.fetch) {
    try {
      message.member =
        (await message.guild.members
          .fetch(message.author?.id)
          .catch(() => null)) || message.member;
    } catch (err) {
      global.logger?.warn?.("[TTS] member fetch:", err?.message || err);
    }
  }

  const messageVoiceChannel = resolveTtsMessageVoiceChannel(message);
  if (!messageVoiceChannel) return;
  if (!(await authorIsInVoiceChannel(message, messageVoiceChannel))) return;

  const autojoin = booleanFromConfig(config?.tts?.autojoin, false);
  let botVoiceChannelId = resolveBotTtsVoiceChannelId(guildId, client);
  if (!botVoiceChannelId) {
    if (!autojoin) return;
    botVoiceChannelId = String(messageVoiceChannel.id);
  }
  if (!shouldHandleMessage(message, botVoiceChannelId)) return;

  const voiceChannel = messageVoiceChannel;
  if (!voiceChannel.joinable) return;
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false,);
  await hydrateUserTtsLangForUser(message.author?.id);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText),);
  baseText = filterScriptsForTtsLang(baseText, lang);
  if (!baseText || !baseText.trim()) return;
  const musicBlock = resolveMusicBlocksTtsForGuild(client, guildId);
  if (musicBlock.blocked) {
        return;
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch(() => null,);
  if (!connection) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = accountUsername(message.member || message.author);
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  await saveTtsLastMessageProgress(voiceChannel.guild.id, voiceChannel.id, message.id, message.createdTimestamp, String(client?.user?.id || ""));
  enqueue(state, { voiceChannel, text, lang });
}

function snapshotTtsQueueForGuild(guildId?, channelId?) {
  const cid = String(channelId || getTtsReturnChannelIdForGuild(guildId) || "").trim();
  if (!cid) return [];
  const state = ttsStates.get(cid);
  if (!state?.queue?.length) return [];
  return state.queue
    .map((item?) => ({
      text: String(item?.text || "").trim(),
      lang: String(item?.lang || "it").trim() || "it",
    }))
    .filter((item?) => item.text);
}

export = { handleTtsMessage, joinTtsChannel, leaveTtsGuild, setUserTtsLang, getUserTtsLang, hydrateUserTtsLangForUser, restoreTtsConnections, handleTtsBotVoiceMove, isTtsPostJoinVoiceGraceActive, purgeTtsVoicePersistence, getTtsReturnChannelIdForGuild, snapshotTtsQueueForGuild, suspendTtsVoiceForAfkProbe, resumeTtsVoiceAfterAfkProbe, resolveDefaultTtsLang, playOneShotTtsOnConnection };
