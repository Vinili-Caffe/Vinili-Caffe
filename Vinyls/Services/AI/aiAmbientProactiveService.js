const { resolveAiConfig } = require("./aiConfig");
const { isAmbientAiChannel } = require("./aiChannelPolicy");
const { generateAiAnswer } = require("./aiChatOrchestrator");
const { sendAiReply } = require("./aiReplyUtils");
const {
  isProactiveAiReplyAcceptable,
  collectChatParticipantNames,
  buildProactiveChatBundle,
  formatProactiveChatContext,
  explainProactiveRejectReason,
} = require("./aiResponseQuality");
const { tryBeginAiChat, endAiChat } = require("./aiRuntimeGuard");

const channelState = new Map();
let proactiveOllamaBackoffUntil = 0;
let proactiveOllamaFailures = 0;

function isProactiveOllamaInBackoff() {
  return Date.now() < proactiveOllamaBackoffUntil;
}

function noteProactiveOllamaResult(ok) {
  if (ok) {
    proactiveOllamaFailures = 0;
    proactiveOllamaBackoffUntil = 0;
    return;
  }
  proactiveOllamaFailures += 1;
  if (proactiveOllamaFailures < 2) return;
  const backoffMin = Math.min(60, 15 * proactiveOllamaFailures);
  proactiveOllamaBackoffUntil = Date.now() + backoffMin * 60 * 1000;
  global.logger?.warn?.(`[AI] proactive ollama in pausa per ${backoffMin}m (timeout ripetuti su llama3.2)`);
}

function resolveAmbientProactiveConfig(client) {
  const cfg = resolveAiConfig(client);
  const raw = client?.config?.ai?.ambientProactive || {};
  const chanceMax = Math.min(0.4, Math.max(0.05, Number(raw.chanceMax || 0.28)));
  return {
    enabled: cfg.enabled && raw.enabled !== false,
    minMessagesInWindow: Math.max(2, Number(raw.minMessagesInWindow || 4)),
    activityWindowMs: Math.max(45000, Number(raw.activityWindowMs || 180000)),
    minIntervalMs: Math.max(90000, Number(raw.minIntervalMs || 180000)),
    chancePerEligibleMessage: Math.min(chanceMax, Math.max(0.02, Number(raw.chancePerEligibleMessage || 0.12))),
    chanceMax,
    hotChatMultiplier: Math.min(2.5, Math.max(1, Number(raw.hotChatMultiplier || 1.6))),
    hotChatMessageFactor: Math.max(1.2, Number(raw.hotChatMessageFactor || 1.75)),
    provider: String(raw.provider || "openrouter_then_ollama").trim() || "openrouter_then_ollama",
    polishItalian: raw.polishItalian !== false,
  };
}

function resolveProactiveChance(proactiveCfg, recentCount) {
  let chance = proactiveCfg.chancePerEligibleMessage;
  const threshold = proactiveCfg.minMessagesInWindow * proactiveCfg.hotChatMessageFactor;
  if (recentCount >= threshold) {
    chance *= proactiveCfg.hotChatMultiplier;
  }
  return Math.min(proactiveCfg.chanceMax, chance);
}

function getChannelState(channelId) {
  const id = String(channelId || "");
  if (!channelState.has(id)) {
    channelState.set(id, { recent: [], lastProactiveAt: 0 });
  }
  return channelState.get(id);
}

function pruneRecent(state, windowMs) {
  const cutoff = Date.now() - windowMs;
  state.recent = state.recent.filter((row) => row.at >= cutoff);
}

function resolveMessageAuthor(message) {
  return String(message.member?.displayName || message.author?.globalName || message.author?.username || "utente").trim();
}

function proactiveReplyOpts(bundle) {
  return {
    participantNames: bundle.participantNames,
    forbiddenNicknameFragments: bundle.forbiddenNicknameFragments,
    allowedNameTokens: bundle.allowedNameTokens,
    lastContent: bundle.lastContent,
    lastAuthor: bundle.lastAuthor,
  };
}

async function generateProactiveReply(aiCfg, chatBundle, proactiveCfg) {
  const attempts = [
    { temperature: 0.26, maxTokens: 96 },
    { temperature: 0.16, maxTokens: 88 },
  ];
  const provider = proactiveCfg?.provider || "openrouter_then_ollama";
  const polishItalian = proactiveCfg?.polishItalian !== false;
  const localOnly = provider === "ollama";
  const contextBlock = formatProactiveChatContext(chatBundle);
  const replyOpts = proactiveReplyOpts(chatBundle);
  const author = chatBundle.lastAuthor || "l'autore";
  for (const attempt of attempts) {
    const answer = await generateAiAnswer({
      aiCfg,
      question:
        `Commenta in UNA frase solo l'ultimo messaggio di "${author}". ` +
        "Persone diverse hanno scritto i messaggi precedenti: non confonderli. " +
        "Usa nickname completi se citi qualcuno, mai solo la prima parola (es. non 'Lore' se il nickname è composto). " +
        "Niente 'povero/povera', niente prefettura inventata. Finisci con . o ? Altrimenti [SKIP].",
      contextBlock,
      history: [],
      maxTokens: attempt.maxTokens,
      localOnly,
      lightweight: true,
      temperature: attempt.temperature,
      provider,
      polishItalian,
    });
    if (answer && isProactiveAiReplyAcceptable(answer, replyOpts)) return answer;
    if (answer) {
      const why = explainProactiveRejectReason(answer, replyOpts) || "qualità";
      global.logger?.info?.(`[AI] proactive reply scartata (${why}):`, answer.slice(0, 120));
    }
  }
  return null;
}

async function tryProactiveAmbientPost(channel, client, recent) {
  if (isProactiveOllamaInBackoff()) return;
  if (!tryBeginAiChat()) return;
  try {
    const proactiveCfg = resolveAmbientProactiveConfig(client);
    const aiCfg = resolveAiConfig(client);
    const chatBundle = buildProactiveChatBundle(recent);
    if (!chatBundle.lastContent) {
      noteProactiveOllamaResult(false);
      return;
    }
    const answer = await generateProactiveReply(aiCfg, chatBundle, proactiveCfg);
    if (!answer) {
      noteProactiveOllamaResult(false);
      return;
    }
    noteProactiveOllamaResult(true);
    await sendAiReply(channel, answer, {
      typingIndicator: true,
      replyDelayMinMs: aiCfg.replyDelayMinMs,
      replyDelayMaxMs: aiCfg.replyDelayMaxMs,
    }).catch(() => null);
  } catch (err) {
    global.logger?.warn?.("[AI] proactive ambient failed:", err?.message || err);
  } finally {
    endAiChat();
  }
}

async function recordAmbientChannelActivity(message, client) {
  const proactiveCfg = resolveAmbientProactiveConfig(client);
  if (!proactiveCfg.enabled) return;
  if (!message?.guild || message.author?.bot) return;
  if (!isAmbientAiChannel(message, client)) return;

  const content = String(message.content || "").trim();
  if (content.length < 2) return;

  const channelId = String(message.channel.id);
  const state = getChannelState(channelId);
  state.recent.push({
    author: resolveMessageAuthor(message),
    content: content.slice(0, 400),
    at: Date.now(),
  });
  pruneRecent(state, proactiveCfg.activityWindowMs);

  if (state.recent.length < proactiveCfg.minMessagesInWindow) return;
  const sinceLast = Date.now() - Number(state.lastProactiveAt || 0);
  if (sinceLast < proactiveCfg.minIntervalMs) return;
  const chance = resolveProactiveChance(proactiveCfg, state.recent.length);
  if (Math.random() > chance) return;

  state.lastProactiveAt = Date.now();
  void tryProactiveAmbientPost(message.channel, client, state.recent);
}

module.exports = { recordAmbientChannelActivity, resolveAmbientProactiveConfig };