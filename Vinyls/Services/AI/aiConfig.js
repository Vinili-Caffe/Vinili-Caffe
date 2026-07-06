const IDs = require("../../Utils/Config/ids");

const DEFAULT_OPENROUTER_MODELS = [
  "google/gemma-2-9b-it:free",
  "meta-llama/llama-3.2-3b-instruct:free",
];

const DEFAULT_EXCLUDED_CHANNEL_KEYS = [
  "ticket",
  "ticketLogs",
  "staffCmds",
  "highCmds",
  "staffChat",
  "moderazioneStaff",
  "modLogs",
  "verifyLogs",
  "activityLogs",
  "joinLeaveLogs",
  "commandLogChannel",
  "errorLogChannel",
  "partnerLogs",
  "ticketLogs",
  "pexDepex",
  "warnStaff",
  "valutazioniStaff",
  "puntiTolti",
  "resocontiStaff",
  "visioneModuli",
  "candidatureStaff",
];

function resolveOpenRouterModels(cfg = {}) {
  const fromCfg = Array.isArray(cfg.openRouterModels) ? cfg.openRouterModels : [];
  const fromEnv = String(process.env.AI_OPENROUTER_MODELS || process.env.OPENROUTER_MODEL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const list = fromCfg.length ? fromCfg : fromEnv.length ? fromEnv : DEFAULT_OPENROUTER_MODELS;
  return list.filter((m) => m && !/^openrouter\/(free|auto)$/i.test(m));
}

function resolveDefaultExcludedChannelIds() {
  const ch = IDs.channels || {};
  const out = new Set();
  for (const key of DEFAULT_EXCLUDED_CHANNEL_KEYS) {
    const id = ch[key];
    if (id) out.add(String(id));
  }
  return [...out];
}

function resolveAiConfig(client) {
  const cfg = client?.config?.ai || {};
  const excluded = new Set(resolveDefaultExcludedChannelIds());
  for (const id of cfg.excludedChannelIds || []) {
    if (id) excluded.add(String(id));
  }
  const ambient = Array.isArray(cfg.ambientChannelIds)
    ? cfg.ambientChannelIds.map((id) => String(id)).filter(Boolean)
    : [];
  return {
    enabled: Boolean(cfg.enabled),
    mentionEnabled: cfg.mentionEnabled === true,
    prefixEnabled: cfg.prefixEnabled === true,
    replyToAiEnabled: cfg.replyToAiEnabled === true,
    ambientChannelIds: ambient,
    excludedCategoryIds: (cfg.excludedCategoryIds || []).map(String).filter(Boolean),
    excludedChannelIds: [...excluded],
    ollamaModel: String(process.env.OLLAMA_CHAT_MODEL || cfg.ollamaModel || "llama3.2").trim(),
    ollamaFastModel: String(process.env.OLLAMA_FAST_MODEL || cfg.ollamaFastModel || cfg.ollamaModel || "llama3.2").trim(),
    ollamaEmbedModel: String(process.env.OLLAMA_EMBED_MODEL || cfg.ollamaEmbedModel || "nomic-embed-text").trim(),
    ollamaBaseUrl: String(process.env.OLLAMA_BASE_URL || cfg.ollamaBaseUrl || "http://127.0.0.1:11434").replace(/\/$/, ""),
    openRouterModels: resolveOpenRouterModels(cfg),
    maxContextChunks: Math.max(1, Math.min(12, Number(cfg.maxContextChunks || 6))),
    maxMessageChunks: Math.max(0, Math.min(8, Number(cfg.maxMessageChunks || 4))),
    rateLimitPerUserSec: Math.max(0, Math.min(120, Number(cfg.rateLimitPerUserSec ?? 15))),
    typingIndicator: cfg.typingIndicator !== false,
    messageIngestEnabled: cfg.messageIngestEnabled !== false,
    webSearchEnabled: cfg.webSearchEnabled === true,
    splitLongReplies: cfg.splitLongReplies !== false,
    maxHistoryTurns: Math.max(2, Math.min(16, Number(cfg.maxHistoryTurns || 8))),
    replyDelayMinMs: Math.max(0, Number(cfg.replyDelayMinMs || 300)),
    replyDelayMaxMs: Math.max(0, Number(cfg.replyDelayMaxMs || 1200)),
  };
}

function isAiEnabled(client) {
  return resolveAiConfig(client).enabled;
}

module.exports = {
  DEFAULT_OPENROUTER_MODELS,
  resolveAiConfig,
  resolveOpenRouterModels,
  isAiEnabled,
  resolveDefaultExcludedChannelIds,
};