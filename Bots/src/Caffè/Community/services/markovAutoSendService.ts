const { getMarkovConfig, isMarkovEnabled, readGuildCorpus, readGuildImages, readGuildStickers, removeStickerFromGuildCorpus, removeImageFromGuildCorpus } = require("./markovMessageCollectorService") as typeof import("./markovMessageCollectorService");
const { isMarkovEligibleChannel, resolveMarkovOutputChannel, resolveMarkovOutputChannelId } = require("./markovChannelAccess") as typeof import("./markovChannelAccess");
const { generateMarkovLines } = require("./markovGeneratorService") as typeof import("./markovGeneratorService");
const { buildAllowedMentionsForText, pickRandomItem, clampMarkovOutput, resolveMarkovImageAttachment, resolveMarkovStickerEmbed } = require("./markovMediaUtils") as typeof import("./markovMediaUtils");
const { maybeApplyCommandStyle, sanitizeCommandLikeText, looksLikeWrittenCommand } = require("./markovCommandStyleService") as typeof import("./markovCommandStyleService");
const { isMarkovUnsafeText, filterUnsafeMarkovLines } = require("../../../shared/moderation/markovTextSafety") as typeof import("../../../shared/moderation/markovTextSafety");

const guildState = new Map();
const markovMessageIdsByGuild = new Map();
const replyCooldownByUser = new Map();
const autoSendLocksByGuild = new Map();

async function withAutoSendGuildLock(guildId?, fn?) {
  const key = String(guildId || "").trim();
  if (!key) return undefined;
  const prev = autoSendLocksByGuild.get(key) || Promise.resolve();
  let release = () => {};
  const gate = new Promise((resolve?) => {
    release = (resolve as any);
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

function getAutoSendConfig(client?) {
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

function getMarkovReplyConfig(client?) {
  const markov = getMarkovConfig(client);
  const auto = markov.autoSend && typeof markov.autoSend === "object" ? markov.autoSend : {};
  const cooldownRaw = Number(auto.replyCooldownMs ?? 8000);
  const maxTrackedRaw = Number(auto.maxTrackedMessageIds ?? 500);
    const replyToMarkovMessage =
    auto.replyToMarkovMessage === true ||
    (auto.replyToMarkovMessage !== false && auto.replyToBotMessage !== true);
  const replyToBotMessage = auto.replyToBotMessage === true;
  const replyToMention = auto.replyToMention === true;
  return {
    enabled: (replyToMarkovMessage || replyToBotMessage || replyToMention) && markov.enabled !== false,
    replyToMarkovMessage,
    replyToBotMessage,
    replyToMention,
    cooldownMs: Number.isFinite(cooldownRaw) ? Math.max(0, cooldownRaw) : 8000,
    maxTrackedMessageIds: Number.isFinite(maxTrackedRaw) ? Math.max(50, maxTrackedRaw) : 500,
  };
}

function pickNextThreshold(client?) {
  const cfg = getAutoSendConfig(client);
  const min = Math.min(cfg.minMessagesBetween, cfg.maxMessagesBetween);
  const max = Math.max(cfg.minMessagesBetween, cfg.maxMessagesBetween);
  return min + Math.floor(Math.random() * (max - min + 1));
}

function getGuildState(guildId?, client?) {
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

function resetGuildState(guildId?, client?) {
  const state = getGuildState(guildId, client);
  if (!state) return;
  const lastAutoSendAt = state.lastAutoSendAt;
  const lastSendHadImage = state.lastSendHadImage;
  state.messagesSinceLastGen = 0;
  state.nextThreshold = pickNextThreshold(client);
  state.lastAutoSendAt = lastAutoSendAt;
  state.lastSendHadImage = lastSendHadImage;
}

function getReplyReferenceId(message?) {
  const ref = message?.reference;
  if (!ref) return null;
  const id = String(ref.messageId || ref.message?.id || "").trim();
  return /^\d{5,30}$/.test(id) ? id : null;
}

function isTrackedMarkovMessage(guildId?, messageId?) {
  const key = String(guildId || "");
  const id = String(messageId || "");
  if (!key || !id) return false;
  return markovMessageIdsByGuild.get(key)?.has(id) === true;
}

function recordMarkovSentMessage(guildId?, messageId?, client?) {
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

function isBotClientMessage(message?, client?) {
  const botId = String(client?.user?.id || "").trim();
  if (!botId) return false;
  return String(message?.author?.id || "") === botId;
}

function messageMentionsClient(message?, client?) {
  const botId = String(client?.user?.id || "").trim();
  if (!botId) return false;
  if (message?.mentions?.users?.has?.(botId)) return true;
  const content = String(message?.content || "");
  if (!content) return false;
  return content.includes(`<@${botId}>`) || content.includes(`<@!${botId}>`);
}

function messageMentionsClientInContent(message?, client?) {
  const botId = String(client?.user?.id || "").trim();
  if (!botId) return false;
  const content = String(message?.content || "");
  if (!content) return false;
  return content.includes(`<@${botId}>`) || content.includes(`<@!${botId}>`);
}

function isValidMentionTrigger(message?, client?, refMessage?, replyCfg?) {
  if (!replyCfg?.replyToMention) return false;
  if (!messageMentionsClient(message, client)) return false;
  if (refMessage && isBotClientMessage(refMessage, client)) {
    return messageMentionsClientInContent(message, client);
  }
  return true;
}

function isPrefixCommandMessage(message?, client?) {
  let text = String(message?.content || "").trim();
  if (!text) return false;
  const botId = String(client?.user?.id || "").trim();
  if (botId) {
    text = text
      .replace(new RegExp(`^(?:<@!?${botId}>\\s*)+`, "i"), "")
      .trim();
  }
  text = text.replace(/^(?:<@!?\d{16,22}>\s*)+/g, "").trim();
  if (!text) return false;
  if (looksLikeWrittenCommand(text)) return true;
  const coffeePrefix = String(client?.config?.prefix || ",").trim();
  const vinylsPrefix = String(client?.config?.markov?.vinylsStylePrefix || "+").trim() || "+";
  for (const prefix of [coffeePrefix, vinylsPrefix, "+", ",", ".", "/"]) {
    if (!prefix) continue;
    if (text.startsWith(prefix) && /^[a-zA-Z0-9_-]+/.test(text.slice(prefix.length))) {
      return true;
    }
  }
  return false;
}

function isMarkovReplyTarget(refMessage?, guildId?, client?, replyCfg = null) {
  if (!refMessage) return false;
  if (!isBotClientMessage(refMessage, client)) return false;
  const cfg = replyCfg || getMarkovReplyConfig(client);
    if (cfg.replyToBotMessage) return true;
    if (cfg.replyToMarkovMessage) {
    return isTrackedMarkovMessage(guildId, refMessage.id);
  }
  return false;
}

async function resolveReferencedMessage(message?) {
  const ref = message?.reference;
  if (!ref) return null;
  if (ref.message) return ref.message;
  const refId = getReplyReferenceId(message);
  if (!refId || !message.channel?.messages?.fetch) return null;
  return message.channel.messages.fetch(refId).catch(() => null);
}

function isAutoSendTriggerChannel(message?, client?) {
  const outputId = resolveMarkovOutputChannelId(client);
  if (!outputId) return false;
  return String(message?.channelId || "") === String(outputId);
}

function tryBeginAutoSend(guildId?, client?) {
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

function rollChance(chance?) {
  if (chance >= 1) return true;
  if (chance <= 0) return false;
  return Math.random() < chance;
}

function pickVisualAttachment(images?, stickers?, state?, autoCfg?) {
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

function buildAutoSendPayload(client?, text?, images?, stickers?, opts: Record<string, any> = {}) {
  const markov = getMarkovConfig(client);
  const autoCfg = opts.autoCfg || getAutoSendConfig(client);
  const state = opts.state || null;
  const imageList = Array.isArray(images) ? images : [];
  const stickerList = Array.isArray(stickers) ? stickers : [];
  const trimmedText = String(text || "").trim();
  if (trimmedText && isMarkovUnsafeText(trimmedText)) return null;
  const visual = pickVisualAttachment(imageList, stickerList, state, autoCfg);
  const imageUrl = visual?.kind === "image" ? visual.value : null;
  const stickerRef = visual?.kind === "sticker" ? visual.value : null;
  if (!trimmedText && !imageUrl && !stickerRef) return null;
  if (!trimmedText && imageUrl && !autoCfg.allowImageOnly) return null;
  if (!trimmedText && stickerRef && !autoCfg.allowStickerOnly) return null;

  const payload: Record<string, any> = {
    allowedMentions: buildAllowedMentionsForText(trimmedText, markov),
        __skipNoticeEmbed: true,
        __skipDefaultEmbedFooter: true,
  };
  if (trimmedText) payload.content = trimmedText;
  if (imageUrl) payload.pendingImageUrl = imageUrl;
  if (stickerRef) payload.pendingStickerRef = stickerRef;
  return payload;
}

async function materializeMarkovPayload(payload?, client?) {
  if (!payload) return null;
  const pendingImageUrl = payload.pendingImageUrl;
  const pendingStickerRef = payload.pendingStickerRef;
  const out = { ...payload };
  delete out.pendingImageUrl;
  delete out.pendingStickerRef;
  out.__skipDefaultEmbedFooter = true;
  out.__skipNoticeEmbed = true;

  if (pendingImageUrl) {
    const imageFile = await resolveMarkovImageAttachment(pendingImageUrl);
    if (imageFile) {
      out.files = [...(Array.isArray(out.files) ? out.files : []), imageFile];
    } else {
      void removeImageFromGuildCorpus(client, pendingImageUrl).catch(() => {});
    }
  }

  if (pendingStickerRef) {
    const stickerId = String(pendingStickerRef?.id || pendingStickerRef || "").trim();
        if (stickerId) {
      out.stickers = [stickerId];
      out.pendingStickerRef = normalizePendingStickerRef(pendingStickerRef);
    } else {
      const stickerEmbed = await resolveMarkovStickerEmbed(client, pendingStickerRef);
      if (stickerEmbed?.image?.url) {
        const stickerFile = await resolveMarkovImageAttachment(stickerEmbed.image.url);
        if (stickerFile) {
          out.files = [...(Array.isArray(out.files) ? out.files : []), stickerFile];
        }
      }
    }
  }

    if (Array.isArray(out.embeds)) {
    delete out.embeds;
  }

  if (!out.content && !out.files?.length && !out.stickers?.length) return null;
  return out;
}

function normalizePendingStickerRef(stickerRef?) {
  if (!stickerRef) return null;
  if (typeof stickerRef === "string") {
    const id = stickerRef.trim();
    return /^\d{5,30}$/.test(id) ? { id, url: null } : null;
  }
  const id = String(stickerRef.id || "").trim();
  if (!/^\d{5,30}$/.test(id)) return null;
  return { id, url: String(stickerRef.url || "").trim() || null };
}

function isMarkovStickerSendError(err?) {
  const message = String(err?.message || err || "").toLowerCase();
  return message.includes("cannot use this sticker") || message.includes("unknown sticker");
}

function isCannotReplyToMessageError(err?) {
  const code = err?.code ?? err?.rawError?.code;
  if (code === 50035) {
    const refErr = err?.rawError?.errors?.message_reference;
    if (refErr && typeof refErr === "object") {
      const flat = JSON.stringify(refErr);
      if (/REPLIES_CANNOT_REPLY_TO_SYSTEM_MESSAGE|cannot reply to a system message/i.test(flat)) {
        return true;
      }
    }
  }
  return /cannot reply to a system message/i.test(String(err?.message || err || ""));
}

function canReplyToDiscordMessage(message?) {
  if (!message || message.system === true) return false;
  return typeof message.reply === "function";
}

async function sendMarkovPayload(channel?, payload?, client?, sendFn?) {
  const sent = await sendFn(payload).catch((err?) => {
    if (!isMarkovStickerSendError(err)) {
      global.logger?.warn?.("[MARKOV] send failed:", err?.message || err);
      return null;
    }
    const stickerId = String(payload?.pendingStickerRef?.id || payload?.stickers?.[0] || "").trim();
    if (stickerId) {
      void removeStickerFromGuildCorpus(client, stickerId).catch(() => {});
    }
    const retryPayload = { ...payload };
    delete retryPayload.pendingStickerRef;
    delete retryPayload.stickers;
    if (retryPayload.embeds?.length) {
      delete retryPayload.embeds;
    }
    if (!retryPayload.content && !retryPayload.files?.length) {
      return null;
    }
    return sendFn(retryPayload).catch((retryErr?) => {
      global.logger?.warn?.("[MARKOV] send retry failed:", retryErr?.message || retryErr);
      return null;
    });
  });
  return sent;
}

async function sendMarkovReplyOrFallback(message?, payload?, client?) {
  if (!canReplyToDiscordMessage(message)) {
    return sendMarkovPayload(message.channel, payload, client, (p?) => message.channel.send(p));
  }
  return sendMarkovPayload(message.channel, payload, client, async (p?) => {
    try {
      return await message.reply(p);
    } catch (err) {
      if (!isCannotReplyToMessageError(err)) throw err;
      return message.channel.send(p);
    }
  });
}

function getMarkovReadOpts(client?) {
  const markovCfg = getMarkovConfig(client);
  return {
    maxLines: Number(markovCfg.maxLinesPerChannel ?? 10000),
    maxImages: Number(markovCfg.maxImagesPerChannel ?? 500),
    maxStickers: Number(markovCfg.maxStickersPerChannel ?? 200),
  };
}

function hasEnoughMarkovCorpus(corpus?, images?, stickers?, autoCfg?, opts: Record<string, any> = {}) {
  const requireMinimums = opts.requireMinimums !== false;
  if (!requireMinimums) {
    return corpus.length > 0 || images.length > 0 || stickers.length > 0;
  }
  const hasEnoughText = corpus.length >= autoCfg.minCorpusLines;
  const hasEnoughImages = images.length >= autoCfg.minCorpusImages;
  const hasEnoughStickers = stickers.length >= autoCfg.minCorpusStickers;
  return hasEnoughText || hasEnoughImages || hasEnoughStickers;
}

async function composeMarkovText(client?, channel?, corpus?, autoCfg?) {
  const safeCorpus = filterUnsafeMarkovLines(corpus);
  if (!safeCorpus.length) return "";
  const outputLimits = { maxSymbols: autoCfg.maxSymbols, maxWords: autoCfg.maxWords };
  const maxAttempts = 8;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await generateMarkovLines(client, channel, {
      count: 1,
      corpusScope: "guild",
      maxSymbols: autoCfg.maxSymbols,
      corpusLines: safeCorpus,
    });
    if (!result.ok || !result.lines?.[0]) continue;
    let text = clampMarkovOutput(result.lines[0], outputLimits);
    if (text && autoCfg.commandStyleEnabled) {
      text = maybeApplyCommandStyle(client, text, safeCorpus);
      text = clampMarkovOutput(text, {
        maxSymbols: autoCfg.maxSymbols + 48,
        maxWords: autoCfg.maxWords + 6,
      });
    }
    text = sanitizeCommandLikeText(client, text);
    if (text && !isMarkovUnsafeText(text)) return text;
  }
  return "";
}

async function buildMarkovSendPayload(client?, channel?, opts: Record<string, any> = {}) {
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

async function tryAutoSendMarkovMessage(message?, client?) {
  if (!message?.guild || !message.channel) return false;
  if (message.system || message.author?.bot) return false;
  if (!isMarkovEnabled(client)) return false;
  const autoCfg = getAutoSendConfig(client);
  if (!autoCfg.enabled) return false;
  if (!isAutoSendTriggerChannel(message, client)) return false;
  if (!isMarkovEligibleChannel(message.channel, message.guild, client.config || {}, client)) return false;

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
        client,
      );
      if (!payload) return false;

      const sent = await sendMarkovPayload(outputChannel, payload, client, (sendPayload?) => outputChannel.send(sendPayload));

      if (!sent) return false;

      recordMarkovSentMessage(guildId, sent.id, client);
      state.lastAutoSendAt = Date.now();
      state.lastSendHadImage = Boolean(payload.files?.length || payload.stickers?.length);
      resetGuildState(guildId, client);
      return true;
    } finally {
      state.inFlight = false;
    }
  });
}

async function tryReplyToMarkovMessage(message?, client?) {
  if (!message?.guild || !message.channel) return false;
  if (message.system || message.author?.bot) return false;
  if (!isMarkovEnabled(client)) return false;
  const replyCfg = getMarkovReplyConfig(client);
  if (!replyCfg.enabled) return false;
    if (!isAutoSendTriggerChannel(message, client)) return false;
  if (!isMarkovEligibleChannel(message.channel, message.guild, client.config || {}, client)) return false;
    if (isPrefixCommandMessage(message, client)) return false;

  const refId = getReplyReferenceId(message);
  const refMessage = refId ? await resolveReferencedMessage(message) : null;

      let isValidTrigger = false;
  if (refMessage && isBotClientMessage(refMessage, client)) {
    isValidTrigger = isMarkovReplyTarget(refMessage, String(message.guild.id), client, replyCfg);
  } else {
    isValidTrigger = isValidMentionTrigger(message, client, refMessage, replyCfg);
  }
  if (!isValidTrigger) return false;

  const guildId = String(message.guild.id);
  const state = getGuildState(guildId, client);
  if (!state || state.inFlight) return false;

  const coolKey = `${guildId}:${message.author.id}`;
  const lastReplyAt = replyCooldownByUser.get(coolKey) || 0;
  if (replyCfg.cooldownMs > 0 && Date.now() - lastReplyAt < replyCfg.cooldownMs) return false;

  state.inFlight = true;
  try {
    const autoCfg = getAutoSendConfig(client);
    const payload = await materializeMarkovPayload(
      await buildMarkovSendPayload(client, message.channel, {
        state,
        autoCfg,
        requireMinimums: false,
      }),
      client,
    );
    if (!payload) return false;

    const replyPayload = {
      ...payload,
      allowedMentions: {
        ...(payload.allowedMentions || { parse: [] }),
        repliedUser: false,
      },
      failIfNotExists: false,
    };

    const sent = await sendMarkovReplyOrFallback(message, replyPayload, client);
    if (!sent) return false;

    recordMarkovSentMessage(guildId, sent.id, client);
    replyCooldownByUser.set(coolKey, Date.now());
    state.lastSendHadImage = Boolean(payload.files?.length || payload.stickers?.length);
    return true;
  } finally {
    state.inFlight = false;
  }
}

async function handleMarkovAutoSendMessageCreate(message?, client?) {
  try {
    return await tryAutoSendMarkovMessage(message, client);
  } catch (err) {
    global.logger?.warn?.("[MARKOV] auto-send error:", err?.message || err);
    return false;
  }
}

async function handleMarkovReplyMessageCreate(message?, client?) {
  try {
    return await tryReplyToMarkovMessage(message, client);
  } catch (err) {
    global.logger?.warn?.("[MARKOV] reply error:", err?.message || err);
    return false;
  }
}

export = {
  handleMarkovAutoSendMessageCreate,
  handleMarkovReplyMessageCreate,
};