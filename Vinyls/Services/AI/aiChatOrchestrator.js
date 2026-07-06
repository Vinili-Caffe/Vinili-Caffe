const { buildPersonaSystemPrompt } = require("../../Data/AI/communityPersona");
const { resolveAiConfig } = require("./aiConfig");
const { checkAiRateLimit } = require("./aiRateLimit");
const { isSimpleAiQuery } = require("./aiRouter");
const { searchKnowledge, formatKnowledgeContext, embedQuery } = require("./aiKnowledgeService");
const {
  searchServerMessages,
  searchServerMessagesByText,
  formatServerMessagesContext,
} = require("./aiMessageSearchService");
const { buildGuildLiveContext } = require("./aiGuildContextService");
const { getChatHistory, appendChatTurn, clearChatSession } = require("./aiChatSessionService");
const { ollamaChatCompletion } = require("./ollamaClient");
const { openRouterChatCompletion } = require("./openRouterClient");
const { sendAiReply } = require("./aiReplyUtils");
const { normalizeAiReply, isChatAiReplyAcceptable } = require("./aiResponseQuality");
const { tryQuickAiReply } = require("./aiQuickReplies");
const { resolveMemberTagReply } = require("./aiMemberTagService");
const { tryBeginAiChat, endAiChat } = require("./aiRuntimeGuard");

const TYPING_PULSE_MS = 8000;
const AI_REQUEST_TIMEOUT_MS = Math.max(30000, Number(process.env.AI_REQUEST_TIMEOUT_MS || 75000));
const OLLAMA_CHAT_TIMEOUT_MS = Math.max(30000, Number(process.env.AI_OLLAMA_TIMEOUT_MS || 60000));
const OLLAMA_LOCAL_CHAT_TIMEOUT_MS = Math.max(
  30000,
  Number(process.env.AI_OLLAMA_LOCAL_TIMEOUT_MS || process.env.AI_OLLAMA_TIMEOUT_MS || 45000),
);

function withTimeout(promise, ms, label = "AI request") {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      timer.unref?.();
    }),
  ]);
}

function buildReplyContextMessage(replyMessage) {
  if (!replyMessage) return "";
  const author = replyMessage.author?.username || "utente";
  const content = String(replyMessage.content || "").trim().slice(0, 1200);
  if (!content) return "";
  return `Messaggio a cui l'utente risponde (${author}): ${content}`;
}

function startTypingPulse(channel) {
  if (!channel?.sendTyping) return null;
  const pulse = () => channel.sendTyping().catch(() => null);
  pulse();
  return setInterval(pulse, TYPING_PULSE_MS);
}

function stopTypingPulse(timer) {
  if (timer) clearInterval(timer);
}

const PROACTIVE_SYSTEM_PROMPT = [
  "Sei Vinili nel canale chat di Vinili & Caffè.",
  "Scrivi UNA sola frase in italiano corretto e colloquiale.",
  "In chat ogni messaggio è di una persona DIVERSA: leggi autore e testo separatamente.",
  "Rispondi SOLO all'ultimo messaggio indicato, non mescolare messaggi precedenti.",
  "Se citi qualcuno, usa il nickname COMPLETO e IDENTICO (mai solo la prima parola: 'Lore' da solo è sbagliato se il nickname è 'Lore | Prefetto di Tassorosso').",
  "Prefetto di Tassorosso è un ruolo Hogwarts, non una prefettura geografica.",
  "Non citare altre persone presenti in chat: rispondi solo all'autore dell'ultimo messaggio.",
  "Non usare 'povero/povera' né inventare storie sulla vita o ruoli delle persone.",
  "La frase deve finire con . o ? (no !).",
  "Se non puoi reagire in modo sensato, rispondi solo: [SKIP]",
].join("\n");

const ITALIAN_POLISH_SYSTEM =
  "Correggi ortografia e grammatica italiane. Mantieni identico significato e tono da chat Discord. Una sola frase. Non cambiare i nickname (lasciali identici, completi). Se la frase è già corretta, ripetila uguale. Output solo la frase.";

function hasOpenRouterKey() {
  return Boolean(String(process.env.OPENROUTER_API_KEY || "").trim());
}

async function polishItalianDraft(draft, aiCfg) {
  const raw = String(draft || "").trim();
  if (!raw || !hasOpenRouterKey()) return raw;
  const polished = await openRouterChatCompletion(
    [
      { role: "system", content: ITALIAN_POLISH_SYSTEM },
      { role: "user", content: raw },
    ],
    { cfg: aiCfg, maxTokens: 120, temperature: 0.15, timeoutMs: 12000 },
  ).catch(() => null);
  return normalizeAiReply(polished) || raw;
}

async function generateAiAnswer({
  aiCfg,
  question,
  contextBlock,
  history,
  maxTokens = 500,
  localOnly = false,
  lightweight = false,
  temperature = null,
  provider = null,
  polishItalian = false,
}) {
  const ctx = String(contextBlock || "").trim();
  const system = lightweight ? PROACTIVE_SYSTEM_PROMPT : buildPersonaSystemPrompt(ctx);
  const messages = [{ role: "system", content: system }];
  for (const turn of history || []) {
    const role = turn?.role === "assistant" ? "assistant" : "user";
    const content = String(turn?.content || "").trim();
    if (content) messages.push({ role, content });
  }
  const q = String(question || "").trim();
  const userContent = lightweight && ctx ? `${q}\n\n${ctx}` : q;
  messages.push({ role: "user", content: userContent });

  const resolvedProvider =
    provider || (localOnly ? "ollama" : hasOpenRouterKey() ? "openrouter_then_ollama" : "ollama");
  const providerChain =
    resolvedProvider === "openrouter"
      ? ["openrouter"]
      : resolvedProvider === "openrouter_then_ollama"
        ? ["openrouter", "ollama"]
        : ["ollama"];

  const temp =
    temperature != null
      ? Number(temperature)
      : lightweight
        ? 0.35
        : 0.55;

  for (let pi = 0; pi < providerChain.length; pi += 1) {
    const chainProvider = providerChain[pi];
    let answer = null;

    if (chainProvider === "openrouter") {
      answer = await openRouterChatCompletion(messages, {
        cfg: aiCfg,
        maxTokens,
        temperature: temp,
        timeoutMs: lightweight ? 14000 : 20000,
      }).catch((err) => {
        global.logger?.warn?.("[AI] openrouter chat failed:", err?.message || err);
        return null;
      });
    } else {
      const primaryModel = aiCfg.ollamaModel;
      const fallbackModel =
        aiCfg.ollamaFastModel && aiCfg.ollamaFastModel !== primaryModel ? aiCfg.ollamaFastModel : "";
      const timeoutMs = localOnly ? OLLAMA_LOCAL_CHAT_TIMEOUT_MS : OLLAMA_CHAT_TIMEOUT_MS;
      const models = [...new Set([primaryModel, fallbackModel].filter(Boolean))];
      for (let i = 0; i < models.length; i += 1) {
        const model = models[i];
        answer = await ollamaChatCompletion(messages, {
          baseUrl: aiCfg.ollamaBaseUrl,
          model,
          maxTokens,
          timeoutMs: i === 0 ? timeoutMs : Math.max(12000, timeoutMs - 10000),
          temperature: i === 0 ? temp : Math.max(0.2, temp - 0.12),
          topP: lightweight ? 0.82 : 0.9,
          repeatPenalty: lightweight ? 1.18 : 1.1,
        }).catch((err) => {
          global.logger?.warn?.(`[AI] ollama chat failed (${model}):`, err?.message || err);
          return null;
        });
        if (answer) break;
      }
    }

    let cleaned = normalizeAiReply(answer);
    if (cleaned && polishItalian) cleaned = await polishItalianDraft(cleaned, aiCfg);
    if (cleaned && (lightweight || isChatAiReplyAcceptable(cleaned))) return cleaned;
  }

  return null;
}

async function deliverQuickReply(channel, guildId, channelId, uid, question, answer, opts = {}) {
  const mentionUserIds = Array.isArray(opts.mentionUserIds) ? opts.mentionUserIds.filter(Boolean) : [];
  await sendAiReply(channel, answer, {
    typingIndicator: false,
    replyDelayMinMs: 0,
    replyDelayMaxMs: 0,
    allowedMentions: mentionUserIds.length ? { users: mentionUserIds } : { parse: [] },
  }).catch(() => null);
  void Promise.all([
    appendChatTurn(guildId, channelId, uid, "user", question),
    appendChatTurn(guildId, channelId, uid, "assistant", answer),
  ]).catch(() => null);
  return { ok: true, answer };
}

async function handleAiChatRequest(ctx) {
  if (!tryBeginAiChat()) {
    return {
      ok: false,
      code: "busy",
      message: "L'assistente IA è occupato con altre richieste. Riprova tra qualche secondo.",
    };
  }
  try {
    const {
      client,
      guild,
      channel,
      userId,
      question,
      replyMessage = null,
      skipRateLimit = false,
    } = ctx;
    const aiCfg = resolveAiConfig(client);
    if (!aiCfg.enabled) {
      return { ok: false, code: "disabled", message: "L'assistente IA non è attivo su questo server." };
    }

    const q = String(question || "").trim();
    if (!q) {
      return { ok: false, code: "empty", message: "Scrivi una domanda dopo il comando o nella menzione." };
    }

    if (!skipRateLimit) {
      const rl = checkAiRateLimit(userId, aiCfg.rateLimitPerUserSec);
      if (!rl.ok) {
        return {
          ok: false,
          code: "ratelimit",
          message: `Rallenta un attimo — riprova tra ${rl.retryAfterSec}s.`,
        };
      }
    }

    const guildId = String(guild?.id || "");
    const channelId = String(channel?.id || "");
    const uid = String(userId || "");
    const memberTagReply = await resolveMemberTagReply({ guild, question: q }).catch(() => null);
    if (memberTagReply?.text) {
      return deliverQuickReply(channel, guildId, channelId, uid, q, memberTagReply.text, {
        mentionUserIds: memberTagReply.mentionUserIds,
      });
    }

    const quickReply = tryQuickAiReply(q);
    if (quickReply) {
      return deliverQuickReply(channel, guildId, channelId, uid, q, quickReply);
    }

    const simple = isSimpleAiQuery(q);
    const maxTokens = simple ? 220 : q.length > 120 ? 480 : 360;
    const typingTimer = aiCfg.typingIndicator ? startTypingPulse(channel) : null;

    try {
      const answer = await withTimeout(
        (async () => {
          const [history, queryEmbedding, guildCtx] = await Promise.all([
            getChatHistory(guildId, channelId, uid, aiCfg.maxHistoryTurns).catch(() => []),
            embedQuery(q, aiCfg).catch(() => null),
            withTimeout(buildGuildLiveContext(guild, client), 8000, "guild context").catch(() => ""),
          ]);

          let msgChunks = [];
          if (aiCfg.messageIngestEnabled) {
            if (queryEmbedding) {
              msgChunks = await searchServerMessages(guildId, queryEmbedding, aiCfg).catch(() => []);
            }
            if (!msgChunks.length) {
              msgChunks = await searchServerMessagesByText(guildId, q, aiCfg).catch(() => []);
            }
          }

          const knowledgeChunks = await searchKnowledge(q, aiCfg, { embedding: queryEmbedding }).catch(() => []);
          const knowledgeCtx = formatKnowledgeContext(knowledgeChunks);
          const serverCtx = formatServerMessagesContext(guildId, msgChunks);
          const replyCtx = buildReplyContextMessage(replyMessage);
          const contextParts = [];
          if (guildCtx) contextParts.push(`[Server Discord (live)]\n${guildCtx}`);
          if (knowledgeCtx) contextParts.push(`[Knowledge]\n${knowledgeCtx}`);
          if (serverCtx) contextParts.push(`[Messaggi server]\n${serverCtx}`);
          if (replyCtx) contextParts.push(replyCtx);
          const contextBlock = contextParts.join("\n\n");

          const llmAnswer = await generateAiAnswer({
            aiCfg,
            question: q,
            contextBlock,
            history,
            maxTokens,
            localOnly: false,
          });
          if (!llmAnswer) return null;
          return llmAnswer;
        })(),
        AI_REQUEST_TIMEOUT_MS,
        "AI chat",
      );

      if (!answer) {
        return {
          ok: false,
          code: "llm_unavailable",
          message: "Ollama non risponde in questo momento. Riprova tra qualche secondo.",
        };
      }

      await sendAiReply(channel, answer, {
        typingIndicator: false,
        replyDelayMinMs: aiCfg.splitLongReplies ? aiCfg.replyDelayMinMs : 0,
        replyDelayMaxMs: aiCfg.splitLongReplies ? aiCfg.replyDelayMaxMs : 0,
      }).catch(() => null);

      void Promise.all([
        appendChatTurn(guildId, channelId, uid, "user", q),
        appendChatTurn(guildId, channelId, uid, "assistant", answer),
      ]).catch((err) => {
        global.logger?.warn?.("[AI] session save failed:", err?.message || err);
      });

      return { ok: true, answer };
    } catch (err) {
      if (String(err?.message || "").includes("timed out")) {
        return {
          ok: false,
          code: "timeout",
          message: "La risposta sta impiegando troppo tempo. Riprova con una domanda più breve.",
        };
      }
      throw err;
    } finally {
      stopTypingPulse(typingTimer);
    }
  } catch (err) {
    global.logger?.error?.("[AI] handleAiChatRequest failed:", err?.stack || err?.message || err);
    return {
      ok: false,
      code: "internal_error",
      message: "Errore interno dell'assistente IA. Riprova tra poco.",
    };
  } finally {
    endAiChat();
  }
}

async function handleAiResetRequest(ctx) {
  try {
    const { guild, channel, userId } = ctx;
    await clearChatSession(String(guild?.id || ""), String(channel?.id || ""), String(userId || ""));
    return { ok: true, message: "Memoria della chat azzerata per questo canale." };
  } catch (err) {
    global.logger?.warn?.("[AI] reset failed:", err?.message || err);
    return { ok: false, message: "Non sono riuscito ad azzerare la memoria chat." };
  }
}

module.exports = { handleAiChatRequest, handleAiResetRequest, generateAiAnswer };