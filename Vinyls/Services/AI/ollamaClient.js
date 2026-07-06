const axios = require("axios");

let lastHealth = { ok: false, at: 0, model: "" };
let ollamaQueue = Promise.resolve();

function runOnOllamaQueue(task) {
  const next = ollamaQueue.then(() => task());
  ollamaQueue = next.catch(() => {});
  return next;
}

async function ollamaPost(baseUrl, path, body, timeoutMs = 45000) {
  const url = `${String(baseUrl || "").replace(/\/$/, "")}${path}`;
  const res = await axios.post(url, body, { timeout: timeoutMs });
  return res?.data;
}

async function ollamaChatCompletion(messages, opts = {}) {
  const baseUrl = opts.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = opts.model || process.env.OLLAMA_CHAT_MODEL || "llama3.2";
  const data = await runOnOllamaQueue(() =>
    ollamaPost(
      baseUrl,
      "/api/chat",
      {
        model,
        messages: Array.isArray(messages) ? messages : [],
        stream: false,
        keep_alive: String(opts.keepAlive || process.env.OLLAMA_KEEP_ALIVE || "10m"),
        options: {
          temperature: Number(opts.temperature ?? 0.7),
          top_p: Number(opts.topP ?? 0.9),
          repeat_penalty: Number(opts.repeatPenalty ?? 1.1),
          num_predict: Math.max(64, Math.min(2048, Number(opts.maxTokens || 700))),
        },
      },
      Number(opts.timeoutMs || 60000),
    ),
  );
  const content = String(data?.message?.content || "").trim();
  return content || null;
}

async function ollamaEmbedText(text, opts = {}) {
  const baseUrl = opts.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = opts.model || process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text";
  const input = String(text || "").trim();
  if (!input) return null;
  const data = await runOnOllamaQueue(() =>
    ollamaPost(
      baseUrl,
      "/api/embeddings",
      { model, prompt: input },
      Number(opts.timeoutMs || 30000),
    ),
  );
  const emb = data?.embedding;
  return Array.isArray(emb) && emb.length ? emb : null;
}

async function warmOllamaChatModel(opts = {}) {
  const baseUrl = opts.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = opts.model || process.env.OLLAMA_CHAT_MODEL || "llama3.2";
  await runOnOllamaQueue(() =>
    ollamaPost(
      baseUrl,
      "/api/chat",
      {
        model,
        messages: [{ role: "user", content: "ok" }],
        stream: false,
        keep_alive: String(opts.keepAlive || process.env.OLLAMA_KEEP_ALIVE || "10m"),
        options: { temperature: 0, num_predict: 4 },
      },
      Number(opts.timeoutMs || 180000),
    ),
  );
  return true;
}

async function checkOllamaHealth(opts = {}) {
  const baseUrl = opts.baseUrl || process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  const model = opts.model || process.env.OLLAMA_CHAT_MODEL || "llama3.2";
  try {
    const data = await axios.get(`${String(baseUrl).replace(/\/$/, "")}/api/tags`, { timeout: 8000 });
    const models = Array.isArray(data?.data?.models) ? data.data.models.map((m) => m.name) : [];
    const ok = models.some((name) => String(name || "").startsWith(model));
    lastHealth = { ok, at: Date.now(), model, models: models.slice(0, 8) };
    return lastHealth;
  } catch (err) {
    lastHealth = { ok: false, at: Date.now(), model, error: err?.message || String(err) };
    return lastHealth;
  }
}

function getLastOllamaHealth() {
  return lastHealth;
}

module.exports = {
  ollamaChatCompletion,
  ollamaEmbedText,
  warmOllamaChatModel,
  checkOllamaHealth,
  getLastOllamaHealth,
};