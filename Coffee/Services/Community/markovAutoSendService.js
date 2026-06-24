const { getMarkovConfig, isMarkovEnabled, readGuildCorpus, readGuildImages, readGuildStickers } = require("./markovMessageCollectorService");
const { isMarkovEligibleChannel, resolveMarkovOutputChannel, resolveMarkovOutputChannelId } = require("./markovChannelAccess");
const { generateMarkovLines } = require("./markovGeneratorService");
const { buildAllowedMentionsForText, pickRandomItem, clampMarkovOutput, resolveMarkovImageEmbed } = require("./markovMediaUtils");
const { maybeApplyCommandStyle, sanitizeCommandLikeText } = require("./markovCommandStyleService");

const guildState = new Map();
const markovMessageIdsByGuild = new Map();
const replyCooldownByUser = new Map();
const autoSendLocksByGuild = new Map();

async function withAutoSendGuildLock(guildId, fn) {
  const key = String(guildId || "").trim();
  if (!key) return undefined;
  const prev = autoSendLocksByGuild.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const chain = prev.finally(() => gate);
  autoSendLocksByGuild.set(key, chain);
  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (autoSendLocksByGuild.get(key) === chain) {
      autoSendLocksByGuild.delete(key);
    }
  }
}

function getAutoSendConfig(client) {
  const markov = getMarkovConfig(client);
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const imageChanceRaw = Number(auto.imageChance ?? markov.imageChance ?? 0.35);
  const imageChance = Number.isFinite(imageChanceRaw) ? Math.min(1, Math.max(0, imageChanceRaw)) : 0.35;
  const stickerChanceRaw = Number(auto.stickerChance ?? markov.stickerChance ?? imageChance);
  const stickerChance = Number.isFinite(stickerChanceRaw) ? Math.min(1, Math.max(0, stickerChanceRaw)) : imageChance;
  const mediaChanceRaw = Number(auto.mediaChance ?? markov.mediaChance ?? imageChance);
  const mediaChance = Number.isFinite(mediaChanceRaw) ? Math.min(1, Math.max(0, mediaChanceRaw)) : 0.15;
  const mediaImageShareRaw = Number(auto.mediaImageShare ?? markov.mediaImageShare ?? 0.7);
  const mediaImageShare = Number.isFinite(mediaImageShareRaw) ? Math.min(1, Math.max(0, mediaImageShareRaw)) : 0.7;
  const gapRaw = Number(auto.minSendGapMs ?? auto.channelCooldownMs ?? 45_000);
  const minSendGapMs = Number.isFinite(gapRaw) ? Math.max(0, gapRaw) : 45_000;
  const maxSymbolsRaw = Number(auto.maxSymbols ?? markov.defaultMaxSymbols ?? 180);
  const maxSymbols = Number.isFinite(maxSymbolsRaw) ? Math.min(500, Math.max(60, maxSymbolsRaw)) : 180;
  const maxWordsRaw = Number(auto.maxWords ?? 22);
  const maxWords = Number.isFinite(maxWordsRaw) ? Math.min(80, Math.max(4, maxWordsRaw)) : 22;
  return {
    enabled: auto.enabled !== false && markov.enabled !== false,
    minMessagesBetween: Math.max(5, Number(auto.minMessagesBetween ?? 15)),
    maxMessagesBetween: Math.max(5, Number(auto.maxMessagesBetween ?? 40)),
    minCorpusLines: Math.max(5, Number(auto.minCorpusLines ?? 30)),
    minCorpusImages: Math.max(0, Number(auto.minCorpusImages ?? 5)),
    minCorpusStickers: Math.max(0, Number(auto.minCorpusStickers ?? 3)),
    minSendGapMs,
    maxSymbols,
    maxWords,
    imageChance,
    stickerChance,
    mediaChance,
    mediaImageShare,
    allowImageOnly: auto.allowImageOnly === true,
    allowStickerOnly: auto.allowStickerOnly === true,
    preventBackToBackImages: auto.preventBackToBackImages !== false,
    commandStyleChance: Math.min(1, Math.max(0, Number(auto.commandStyleChance ?? markov.commandStyleChance ?? 0.2))),
    commandStyleEnabled: auto.commandStyleEnabled === true && markov.commandStyleEnabled === true,
  };
}

function getMarkovReplyConfig(client) {
  const markov = getMarkovConfig(client);
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const cooldownRaw = Number(auto.replyCooldownMs ?? 8000);
  const maxTrackedRaw = Number(auto.maxTrackedMessageIds ?? 500);
  return {
    enabled: auto.replyToMarkovMessage === true && markov.enabled !== false,
    cooldownMs: Number.isFinite(cooldownRaw) ? Math.max(0, cooldownRaw) : 8000,
    maxTrackedMessageIds: Number.isFinite(maxTrackedRaw) ? Math.max(50, maxTrackedRaw) : 500,
  };
}

function pickNextThreshold(client) {
  const cfg = getAutoSendConfig(client);
  const min = Math.min(cfg.minMessagesBetween, cfg.maxMessagesBetween);
  const max = Math.max(cfg.minMessagesBetween, cfg.maxMessagesBetween);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getGuildState(guildId, client) {
  const key = String(guildId || "");
  if (!key) return null;
  if (!guildState.has(key)) {
    guildState.set(key, {
      messagesSinceLastGen: 0,
      nextThreshold: pickNextThreshold(client),
      lastAutoSendAt: 0,
      lastSendHadImage: false,
      inFlight: false,
    });
  }
  return guildState.get(key);
}

function resetGuildState(guildId, client) {
  const state = getGuildState(guildId, client);
  if (!state) return;
  const lastAutoSendAt = state.lastAutoSendAt;
  const lastSendHadImage = state.lastSendHadImage;
  state.messagesSinceLastGen = 0;
  state.nextThreshold = pickNextThreshold(client);
  state.lastAutoSendAt = lastAutoSendAt;
  state.lastSendHadImage = lastSendHadImage;
}

function getReplyReferenceId(message) {
  const ref = message?.reference;
  if (!ref) return null;
  const id = String(ref.messageId || ref.message?.id || "").trim();
  return /^\d{5,30}$/.test(id) ? id : null;
}

function isTrackedMarkovMessage(guildId, messageId) {
  const key = String(guildId || "");
  const id = String(messageId || "");
  if (!key || !id) return false;
  return markovMessageIdsByGuild.get(key)?.has(id) === true;
}

function recordMarkovSentMessage(guildId, messageId, client) {
  const key = String(guildId || "");
  const id = String(messageId || "");
  if (!key || !/^\d{5,30}$/.test(id)) return;
  const replyCfg = getMarkovReplyConfig(client);
  if (!markovMessageIdsByGuild.has(key)) {
    markovMessageIdsByGuild.set(key, new Set());
  }
  const bucket = markovMessageIdsByGuild.get(key);
  bucket.add(id);
  const maxIds = replyCfg.maxTrackedMessageIds;
  if (bucket.size <= maxIds) return;
  const overflow = bucket.size - maxIds;
  const iter = bucket.values();
  for (let i = 0; i < overflow; i += 1) {
    const oldest = iter.next().value;
    if (oldest) bucket.delete(oldest);
  }
}

function isMarkovReplyTarget(refMessage, guildId, client) {
  if (!refMessage) return false;
  if (String(refMessage.author?.id || "") !== String(client?.user?.id || "")) return false;
  if (getReplyReferenceId(refMessage)) return false;
  if (isTrackedMarkovMessage(guildId, refMessage.id)) return true;
  const outputId = resolveMarkovOutputChannelId(client);
  return Boolean(outputId && String(refMessage.channelId) === String(outputId));
}

async function resolveReferencedMessage(message) {
  const ref = message?.reference;
  if (!ref) return null;
  if (ref.message) return ref.message;
  const refId = getReplyReferenceId(message);
  if (!refId || !message.channel?.messages?.fetch) return null;
  return message.channel.messages.fetch(refId).catch(() => null);
}

function isAutoSendTriggerChannel(message, client) {
  const outputId = resolveMarkovOutputChannelId(client);
  if (!outputId) return false;
  return String(message?.channelId || "") === String(outputId);
}

function tryBeginAutoSend(guildId, client) {
  const autoCfg = getAutoSendConfig(client);
  const state = getGuildState(guildId, client);
  if (!state || state.inFlight) return null;

  if (autoCfg.minSendGapMs > 0 && state.lastAutoSendAt > 0) {
    const elapsed = Date.now() - state.lastAutoSendAt;
    if (elapsed < autoCfg.minSendGapMs) return null;
  }

  state.messagesSinceLastGen += 1;
  if (state.messagesSinceLastGen < state.nextThreshold) return null;

  state.inFlight = true;
  return { state, autoCfg };
}

function rollChance(chance) {
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return Math.random() < chance;
}

function pickVisualAttachment(images, stickers, state, autoCfg) {
  const imageList = Array.isArray(images) ? images : [];
  const stickerList = Array.isArray(stickers) ? stickers : [];
  const hasImage = imageList.length > 0;
  const hasSticker = stickerList.length > 0;
  if (!hasImage && !hasSticker) return null;
  if (autoCfg.preventBackToBackImages && state?.lastSendHadImage) return null;
  if (!rollChance(autoCfg.mediaChance)) return null;
  if (hasImage && hasSticker) {
    return rollChance(autoCfg.mediaImageShare)
      ? { kind: "image", value: pickRandomItem(imageList) }
      : { kind: "sticker", value: pickRandomItem(stickerList) };
  }
  if (hasImage) return { kind: "image", value: pickRandomItem(imageList) };
  return { kind: "sticker", value: pickRandomItem(stickerList) };
}

function buildAutoSendPayload(client, text, images, stickers, opts = {}) {
  const markov = getMarkovConfig(client);
  const autoCfg = opts.autoCfg || getAutoSendConfig(client);
  const state = opts.state || null;
  const imageList = Array.isArray(images) ? images : [];
  const stickerList = Array.isArray(stickers) ? stickers : [];
  const trimmedText = String(text || "").trim();
  const visual = pickVisualAttachment(imageList, stickerList, state, autoCfg);
  const imageUrl = visual?.kind === "image" ? visual.value : null;
  const stickerId = visual?.kind === "sticker" ? visual.value : null;
  if (!trimmedText && !imageUrl && !stickerId) return null;
  if (!trimmedText && imageUrl && !autoCfg.allowImageOnly) return null;
  if (!trimmedText && stickerId && !autoCfg.allowStickerOnly) return null;

  const payload = {
    allowedMentions: buildAllowedMentionsForText(trimmedText, markov),
  };
  if (trimmedText) payload.content = trimmedText;
  if (imageUrl) payload.pendingImageUrl = imageUrl;
  if (stickerId) payload.stickers = [stickerId];
  return payload;
}

async function materializeMarkovPayload(payload) {
  if (!payload) return null;
  const pendingImageUrl = payload.pendingImageUrl;
  const out = { ...payload };
  delete out.pendingImageUrl;
  if (pendingImageUrl) {
    const imageEmbed = await resolveMarkovImageEmbed(pendingImageUrl);
    if (imageEmbed) out.embeds = [imageEmbed];
  }
  return out;
}

function getMarkovReadOpts(client) {
  const markovCfg = getMarkovConfig(client);
  return {
    maxLines: Number(markovCfg.maxLinesPerChannel ?? 10000),
    maxImages: Number(markovCfg.maxImagesPerChannel ?? 500),
    maxStickers: Number(markovCfg.maxStickersPerChannel ?? 200),
  };
}

function hasEnoughMarkovCorpus(corpus, images, stickers, autoCfg, opts = {}) {
  const requireMinimums = opts.requireMinimums !== false;
  if (!requireMinimums) {
    return corpus.length > 0 || images.length > 0 || stickers.length > 0;
  }
  const hasEnoughText = corpus.length >= autoCfg.minCorpusLines;
  const hasEnoughImages = images.length >= autoCfg.minCorpusImages;
  const hasEnoughStickers = stickers.length >= autoCfg.minCorpusStickers;
  return hasEnoughText || hasEnoughImages || hasEnoughStickers;
}

async function composeMarkovText(client, channel, corpus, autoCfg) {
  if (!corpus.length) return "";
  const outputLimits = { maxSymbols: autoCfg.maxSymbols, maxWords: autoCfg.maxWords };
  const result = await generateMarkovLines(client, channel, {
    count: 1,
    corpusScope: "guild",
    maxSymbols: autoCfg.maxSymbols,
  });
  if (!result.ok || !result.lines?.[0]) return "";
  let text = clampMarkovOutput(result.lines[0], outputLimits);
  if (text && autoCfg.commandStyleEnabled) {
    text = maybeApplyCommandStyle(client, text, corpus);
    text = clampMarkovOutput(text, {
      maxSymbols: autoCfg.maxSymbols + 48,
      maxWords: autoCfg.maxWords + 6,
    });
  }
  return sanitizeCommandLikeText(client, text);
}

async function buildMarkovSendPayload(client, channel, opts = {}) {
  const autoCfg = opts.autoCfg || getAutoSendConfig(client);
  const state = opts.state || null;
  const readOpts = getMarkovReadOpts(client);
  const corpus = await readGuildCorpus(client, readOpts);
  const images = await readGuildImages(client, readOpts);
  const stickers = await readGuildStickers(client, readOpts);
  if (!hasEnoughMarkovCorpus(corpus, images, stickers, autoCfg, opts)) {
    return null;
  }

  const hasEnoughText = corpus.length >= (opts.requireMinimums === false ? 1 : autoCfg.minCorpusLines);
  let text = "";
  if (corpus.length > 0) {
    if (hasEnoughText || opts.requireMinimums === false) {
      text = await composeMarkovText(client, channel, corpus, autoCfg);
    }
  }

  const hasEnoughImages = images.length >= (opts.requireMinimums === false ? 1 : autoCfg.minCorpusImages);
  const hasEnoughStickers = stickers.length >= (opts.requireMinimums === false ? 1 : autoCfg.minCorpusStickers);
  if (!text && !hasEnoughImages && !hasEnoughStickers && opts.requireMinimums !== false) {
    return null;
  }

  return buildAutoSendPayload(client, text, images, stickers, { state, autoCfg });
}

async function tryAutoSendMarkovMessage(message, client) {
  if (!message?.guild || !message.channel) return false;
  if (message.author?.bot) return false;
  if (!isMarkovEnabled(client)) return false;
  const autoCfg = getAutoSendConfig(client);
  if (!autoCfg.enabled) return false;
  if (!isAutoSendTriggerChannel(message, client)) return false;
  if (!isMarkovEligibleChannel(message.channel, message.guild, client.config || {})) return false;

  const guildId = String(message.guild.id);
  return withAutoSendGuildLock(guildId, async () => {
    const begun = tryBeginAutoSend(guildId, client);
    if (!begun) return false;
    const { state } = begun;

    try {
      const outputChannel = await resolveMarkovOutputChannel(message.guild, client);
      if (!outputChannel) {
        global.logger?.warn?.("[MARKOV] auto-send output channel unavailable");
        return false;
      }

      const payload = await materializeMarkovPayload(
        await buildMarkovSendPayload(client, outputChannel, { state, autoCfg, requireMinimums: true }),
      );
      if (!payload) return false;

      const sent = await outputChannel.send(payload).catch((err) => {
        global.logger?.warn?.("[MARKOV] auto-send failed:", err?.message || err);
        return null;
      });

      if (!sent) return false;

      recordMarkovSentMessage(guildId, sent.id, client);
      state.lastAutoSendAt = Date.now();
      state.lastSendHadImage = Boolean(payload.embeds?.length || payload.files?.length || payload.stickers?.length);
      resetGuildState(guildId, client);
      return true;
    } finally {
      state.inFlight = false;
    }
  });
}

async function tryReplyToMarkovMessage(message, client) {
  if (!message?.guild || !message.channel) return false;
  if (message.author?.bot) return false;
  if (!isMarkovEnabled(client)) return false;
  const replyCfg = getMarkovReplyConfig(client);
  if (!replyCfg.enabled) return false;
  if (!getReplyReferenceId(message)) return false;
  if (!isMarkovEligibleChannel(message.channel, message.guild, client.config || {})) return false;

  const guildId = String(message.guild.id);
  const state = getGuildState(guildId, client);
  if (!state || state.inFlight) return false;

  const coolKey = `${guildId}:${message.author.id}`;
  const lastReplyAt = replyCooldownByUser.get(coolKey) || 0;
  if (replyCfg.cooldownMs > 0 && Date.now() - lastReplyAt < replyCfg.cooldownMs) return false;

  const refMessage = await resolveReferencedMessage(message);
  if (!isMarkovReplyTarget(refMessage, guildId, client)) return false;

  state.inFlight = true;
  try {
    const autoCfg = getAutoSendConfig(client);
    const payload = await buildMarkovSendPayload(client, message.channel, {
      state,
      autoCfg,
      requireMinimums: false,
    });
    if (!payload) return false;

    const replyPayload = {
      ...payload,
      allowedMentions: {
        ...(payload.allowedMentions || { parse: [] }),
        repliedUser: false,
      },
      failIfNotExists: false,
    };

    const sent = await message.reply(replyPayload).catch((err) => {
      global.logger?.warn?.("[MARKOV] reply failed:", err?.message || err);
      return null;
    });
    if (!sent) return false;

    recordMarkovSentMessage(guildId, sent.id, client);
    replyCooldownByUser.set(coolKey, Date.now());
    state.lastSendHadImage = Boolean(payload.embeds?.length || payload.files?.length || payload.stickers?.length);
    return true;
  } finally {
    state.inFlight = false;
  }
}

async function handleMarkovAutoSendMessageCreate(message, client) {
  try {
    return await tryAutoSendMarkovMessage(message, client);
  } catch (err) {
    global.logger?.warn?.("[MARKOV] auto-send error:", err?.message || err);
    return false;
  }
}

async function handleMarkovReplyMessageCreate(message, client) {
  try {
    return await tryReplyToMarkovMessage(message, client);
  } catch (err) {
    global.logger?.warn?.("[MARKOV] reply error:", err?.message || err);
    return false;
  }
}

module.exports = {
  getAutoSendConfig,
  getMarkovReplyConfig,
  handleMarkovAutoSendMessageCreate,
  handleMarkovReplyMessageCreate,
  resetGuildState,
  buildAutoSendPayload,
  tryBeginAutoSend,
  getReplyReferenceId,
  isAutoSendTriggerChannel,
  isTrackedMarkovMessage,
  recordMarkovSentMessage,
  isMarkovReplyTarget,
};