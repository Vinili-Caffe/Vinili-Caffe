const axios = require("axios");
const { resolveOpenRouterModels } = require("./aiConfig");

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
let cooldownUntil = 0;

function isOpenRouterCoolingDown() {
  return Date.now() < Number(cooldownUntil || 0);
}

function startCooldown(ms = 15 * 60 * 1000) {
  cooldownUntil = Date.now() + Math.max(5000, Number(ms) || 0);
}

async function openRouterChatCompletion(messages, opts = {}) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey || isOpenRouterCoolingDown()) return null;
  const models = resolveOpenRouterModels(opts.cfg || {});
  if (!models.length) return null;

  let lastError = null;
  for (const model of models) {
    try {
      const response = await axios.post(
        OPENROUTER_API_URL,
        {
          model,
          messages: Array.isArray(messages) ? messages : [],
          max_tokens: Math.max(64, Math.min(2048, Number(opts.maxTokens || 900))),
          temperature: Number(opts.temperature ?? 0.65),
        },
        {
          timeout: Number(opts.timeoutMs || 12000),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://viniliecaffe.it",
            "X-Title": "Vinili e Caffè Bot AI",
          },
        },
      );
      const content = String(response?.data?.choices?.[0]?.message?.content || "").trim();
      if (content) return content;
      lastError = new Error(`Empty OpenRouter content (${model})`);
    } catch (err) {
      lastError = err;
      const status = Number(err?.response?.status || 0);
      if (status === 429) {
        startCooldown();
        break;
      }
      if ([400, 404, 500, 502, 503, 504].includes(status)) continue;
      throw err;
    }
  }
  if (lastError) {
    global.logger?.warn?.("[AI] OpenRouter failed:", lastError?.message || lastError);
  }
  return null;
}

module.exports = {
  openRouterChatCompletion,
  isOpenRouterCoolingDown,
};