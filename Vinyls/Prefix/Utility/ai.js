const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");

const OLLAMA_CHAT_URL = String(
  process.env.OLLAMA_CHAT_URL || "http://127.0.0.1:11434/api/generate",
).trim();
const OLLAMA_MODEL = String(process.env.OLLAMA_MODEL || "qwen2.5:0.5b").trim();
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

function normalizeResponseText(raw) {
  const text = String(raw || "").replace(/\r\n/g, "\n").trim();
  if (!text) return "";
  if (text.length <= OLLAMA_MAX_RESPONSE_CHARS) return text;
  return `${text.slice(0, OLLAMA_MAX_RESPONSE_CHARS - 3).trimEnd()}...`;
}

async function callOllama(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OLLAMA_TIMEOUT_MS);
  timeout.unref?.();
  try {
    const response = await fetch(OLLAMA_CHAT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        stream: false,
        keep_alive: String(process.env.OLLAMA_KEEP_ALIVE || "30m"),
        prompt: `Rispondi in italiano, in modo utile e conciso.\n\nUtente: ${prompt}\nAssistente:`,
        options: {
          temperature: 0.4,
          num_predict: Math.max(16, Number(process.env.OLLAMA_NUM_PREDICT || 40)),
          num_ctx: Math.max(256, Number(process.env.OLLAMA_NUM_CTX || 512)),
        }
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

module.exports = {
  name: "ai",
  args: true,
  async execute(message, args) {
    const nowTs = Date.now();
    pruneCooldown(nowTs);
    const userKey = `${String(message.guildId || "dm")}:${String(message.author?.id || "")}`;
    const cooldownUntil = Number(userCooldownMap.get(userKey) || 0);
    if (cooldownUntil > nowTs) {
      const remaining = Math.max(1, Math.ceil((cooldownUntil - nowTs) / 1000));
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              `<:vegax:1443934876440068179> Aspetta **${remaining}s** prima di usare di nuovo \`+ai\`.`,
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    const rawPrompt = Array.isArray(args) ? args.join(" ").trim() : "";
    if (!rawPrompt) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> Uso: `+ai <domanda>`",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    const prompt = rawPrompt.slice(0, OLLAMA_MAX_PROMPT_CHARS);
    if (aiQueue.length >= AI_MAX_QUEUE && aiInFlight >= AI_MAX_INFLIGHT) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> AI occupata in questo momento. Riprova tra poco.",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }

    userCooldownMap.set(userKey, nowTs + AI_USER_COOLDOWN_MS);
    await message.channel.sendTyping().catch(() => {});
    const startedAt = Date.now();
    try {
      const text = await enqueueAiTask(() => callOllama(prompt));
      return safeMessageReply(message, {
        content: text,
        allowedMentions: { repliedUser: false, parse: [] },
      });
    } catch (error) {
      const errMessage = String(error?.message || "");
      if (errMessage === "ai_queue_full") {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Coda AI piena. Riprova tra poco.",
              ),
          ],
          allowedMentions: { repliedUser: false, parse: [] },
        });
      }
      if (errMessage.includes("AbortError")) {
        return safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription(
                "<:vegax:1443934876440068179> Timeout AI locale. Riprova con una richiesta piu corta.",
              ),
          ],
          allowedMentions: { repliedUser: false, parse: [] },
        });
      }
      global.logger?.warn?.("[+ai] failed:", errMessage || error);
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(
              "<:vegax:1443934876440068179> AI locale non disponibile. Controlla che Ollama sia attivo sulla VPS.",
            ),
        ],
        allowedMentions: { repliedUser: false, parse: [] },
      });
    }
  },
};