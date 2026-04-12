const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");

const OLLAMA_CHAT_URL = String(
  process.env.OLLAMA_CHAT_URL || "http://127.0.0.1:11434/api/generate",
).trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "qwen2.5:0.5b").trim();
const OLLAMA_FALLBACK_MODEL = String(
  process.env.OLLAMA_FALLBACK_MODEL || "qwen2.5:1.5b",
).trim();
const OLLAMA_TIMEOUT_MS = Math.max(
  5000,
  Number(process.env.OLLAMA_TIMEOUT_MS || 14000),
);
const OLLAMA_MAX_PROMPT_CHARS = Math.max(
  200,
  Number(process.env.OLLAMA_MAX_PROMPT_CHARS || 900),
);
const OLLAMA_MAX_RESPONSE_CHARS = Math.max(
  300,
  Number(process.env.OLLAMA_MAX_RESPONSE_CHARS || 900),
);
const AI_USER_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.AI_USER_COOLDOWN_MS || 10000),
);
const AI_MAX_QUEUE = Math.max(1, Number(process.env.AI_MAX_QUEUE || 12));
const AI_MAX_INFLIGHT = Math.max(1, Number(process.env.AI_MAX_INFLIGHT || 1));
const OLLAMA_TEMPERATURE = Math.min(
  1.5,
  Math.max(0.1, Number(process.env.OLLAMA_TEMPERATURE ?? 0.55)),
);
const OLLAMA_PERSONA =
  String(process.env.OLLAMA_PERSONA || "").trim() ||
  [
    "Sei un assistente AI generalista: intelligente, chiaro e utile. Rispondi sempre in italiano salvo che l'utente chieda esplicitamente un'altra lingua.",
    "Comportati come un modello conversazionale standard: spiegazioni, ragionamento, creatività o chiacchiera, in base a cosa serve.",
    "Tono naturale (di solito tu con l'utente), senza incipit finti da call center. Niente liste lunghe se non servono.",
  ].join(" ");

function parseAmbientEnabled() {
  const v = process.env.OLLAMA_AMBIENT_ENABLED;
  if (v === undefined || v === null || String(v).trim() === "") return true;
  const s = String(v).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

const OLLAMA_AMBIENT_ENABLED = parseAmbientEnabled();

function getAmbientChannelIdSet() {
  const raw = String(process.env.OLLAMA_AMBIENT_CHANNEL_IDS || "").trim();
  if (!raw) return null;
  return new Set(
    raw
      .split(/[,|\s]+/u)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

const userCooldownMap = new Map();
const aiQueue = [];
let aiInFlight = 0;

function pruneCooldown(nowTs) {
  for (const [key, expiresAt] of userCooldownMap.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= nowTs) {
      userCooldownMap.delete(key);
    }
  }
}

function aiUserCooldownKey(message) {
  return `${String(message.guildId || "dm")}:${String(message.author?.id || "")}`;
}

function normalizeResponseText(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  if (text.length <= OLLAMA_MAX_RESPONSE_CHARS) return text;
  const budget = OLLAMA_MAX_RESPONSE_CHARS - 3;
  let cut = text.slice(0, budget);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > budget * 0.55) cut = cut.slice(0, lastSpace);
  return `${cut.trimEnd()}...`;
}

function looksLikeBadRefusal(text) {
  const s = String(text || "").toLowerCase();
  if (!s) return true;
  return (
    s.includes("non sono pronto per rispondere in italiano") ||
    s.includes("non posso parlare o rispondere a parole") ||
    s.includes("non supporto l'italiano") ||
    s.includes("non supporto italiano")
  );
}

async function callOllama(prompt, modelOverride = null) {
  const model = String(modelOverride || OLLAMA_MODEL).trim() || OLLAMA_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        stream: false,
        keep_alive: String(process.env.OLLAMA_KEEP_ALIVE || "30m"),
        prompt: `${OLLAMA_PERSONA}\n\nUtente:\n${prompt}\n\nAssistente:`,
        options: {
          temperature: OLLAMA_TEMPERATURE,
          num_predict: Math.max(
            96,
            Number(process.env.OLLAMA_NUM_PREDICT || 180),
          ),
          num_ctx: Math.max(256, Number(process.env.OLLAMA_NUM_CTX || 512)),
        },
      }),
    });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`ollama_http_${response.status}:${errorBody.slice(0, 120)}`);
    }
    const data = await response.json().catch(() => null);
    const messageText = normalizeResponseText(
      data?.response || data?.message?.content || "",
    );
    if (!messageText) {
      throw new Error("ollama_empty_response");
    }
    return messageText;
  } finally {
    clearTimeout(timeout);
  }
}

function runAiQueue() {
  while (aiInFlight < AI_MAX_INFLIGHT && aiQueue.length > 0) {
    const task = aiQueue.shift();
    if (!task) break;
    aiInFlight += 1;
    Promise.resolve()
      .then(task.run)
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        aiInFlight = Math.max(0, aiInFlight - 1);
        runAiQueue();
      });
  }
}

function enqueueAiTask(run) {
  if (aiQueue.length >= AI_MAX_QUEUE) {
    return Promise.reject(new Error("ai_queue_full"));
  }
  return new Promise((resolve, reject) => {
    aiQueue.push({ run, resolve, reject });
    runAiQueue();
  });
}

function isAiQueueSaturated() {
  return aiQueue.length >= AI_MAX_QUEUE && aiInFlight >= AI_MAX_INFLIGHT;
}

async function handleAmbientOllamaMessage(message, client) {
  if (!OLLAMA_AMBIENT_ENABLED) return false;
  if (!message?.guild || !message.channel?.isTextBased?.()) return false;
  const mainId = String(IDs.guilds?.main || "").trim();
  if (!mainId || String(message.guild.id) !== mainId) return false;
  const channelFilter = getAmbientChannelIdSet();
  if (channelFilter && !channelFilter.has(String(message.channelId || ""))) return false;

  const botId = String(client?.user?.id || "");
  if (!botId) return false;

  const refId = message.reference?.messageId;
  let replyToBot = false;
  if (refId) {
    const refMsg = await message.channel.messages.fetch(refId).catch(() => null);
    if (refMsg?.author?.id === botId) replyToBot = true;
  }
  const mentionedBot = Boolean(message.mentions?.users?.has?.(botId));
  if (!replyToBot && !mentionedBot) return false;

  const prefix = String(client?.config?.prefix || "+");
  const rawContent = String(message.content || "").trim();
  if (rawContent.startsWith(prefix)) return false;

  let rawPrompt = rawContent;
  if (mentionedBot) {
    rawPrompt = rawPrompt.replace(new RegExp(`<@!?${botId}>`, "gu"), " ").replace(/\s+/gu, " ").trim();
  }
  if (!rawPrompt) return false;

  const nowTs = Date.now();
  pruneCooldown(nowTs);
  const userKey = aiUserCooldownKey(message);
  const cooldownUntil = Number(userCooldownMap.get(userKey) || 0);
  if (cooldownUntil > nowTs) {
    const remaining = Math.max(1, Math.ceil((cooldownUntil - nowTs) / 1000));
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            `<:vegax:1443934876440068179> Aspetta **${remaining}s** prima di un'altra richiesta all'AI.`,
          ),
      ],
      allowedMentions: { repliedUser: false, parse: [] },
    });
    return true;
  }

  if (isAiQueueSaturated()) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription("<:vegax:1443934876440068179> AI occupata. Riprova tra poco."),
      ],
      allowedMentions: { repliedUser: false, parse: [] },
    });
    return true;
  }

  const prompt = rawPrompt.slice(0, OLLAMA_MAX_PROMPT_CHARS);

  userCooldownMap.set(userKey, nowTs + AI_USER_COOLDOWN_MS);
  await message.channel.sendTyping().catch(() => {});
  try {
    let finalText = await enqueueAiTask(() => callOllama(prompt, null));
    if (looksLikeBadRefusal(finalText) && OLLAMA_FALLBACK_MODEL) {
      try {
        finalText = await enqueueAiTask(() =>
          callOllama(prompt, OLLAMA_FALLBACK_MODEL),
        );
      } catch (_) {}
    }
    await safeMessageReply(message, {
      content: finalText,
      allowedMentions: { repliedUser: false, parse: [] },
    });
    return true;
  } catch (error) {
    const errMessage = String(error?.message || "");
    if (errMessage === "ai_queue_full") {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Coda AI piena. Riprova tra poco."),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
      return true;
    }
    if (errMessage.includes("AbortError")) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Timeout AI locale. Riprova con una richiesta piu corta.",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
      return true;
    }
    global.logger?.warn?.("[ollama ambient] failed:", errMessage || error);
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> AI locale non disponibile. Controlla che Ollama sia attivo sulla VPS.",
          ),
      ],
      allowedMentions: { repliedUser: false, parse: [] },
    });
    return true;
  }
}

module.exports = {
  OLLAMA_MAX_PROMPT_CHARS,
  OLLAMA_FALLBACK_MODEL,
  pruneCooldown,
  aiUserCooldownKey,
  userCooldownMap,
  AI_USER_COOLDOWN_MS,
  AI_MAX_QUEUE,
  AI_MAX_INFLIGHT,
  callOllama,
  enqueueAiTask,
  looksLikeBadRefusal,
  isAiQueueSaturated,
  handleAmbientOllamaMessage,
};