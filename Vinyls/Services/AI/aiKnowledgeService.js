const { AiKnowledgeChunk } = require("../../Schemas/AI/aiSchemas");
const { isMongoReady } = require("../../Utils/Database/mongoConnect");
const { rankByEmbedding } = require("./aiEmbeddingUtils");
const { ollamaEmbedText } = require("./ollamaClient");

function extractSearchTerms(query) {
  return String(query || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 3)
    .slice(0, 8);
}

async function searchKnowledgeByText(query, limit = 4) {
  if (!isMongoReady()) return [];
  const terms = extractSearchTerms(query);
  if (!terms.length) return [];
  const or = terms.map((t) => ({ text: { $regex: t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }));
  const docs = await AiKnowledgeChunk.find({ $or: or })
    .select("source path title text")
    .limit(Math.max(limit * 3, 12))
    .lean()
    .catch(() => []);
  const seen = new Set();
  const out = [];
  for (const doc of docs) {
    const key = `${doc.source}:${doc.path}:${doc.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(doc);
    if (out.length >= limit) break;
  }
  return out;
}

async function embedQuery(text, aiCfg) {
  return ollamaEmbedText(text, {
    baseUrl: aiCfg.ollamaBaseUrl,
    model: aiCfg.ollamaEmbedModel,
    timeoutMs: 12000,
  }).catch(() => null);
}

async function searchKnowledge(query, aiCfg, opts = {}) {
  if (!isMongoReady()) return [];
  const limit = Math.max(1, Number(opts.limit || aiCfg.maxContextChunks || 6));
  const embedding = opts.embedding !== undefined ? opts.embedding : await embedQuery(query, aiCfg);
  let vectorHits = [];
  if (embedding) {
    const docs = await AiKnowledgeChunk.find({ embedding: { $exists: true, $ne: [] } })
      .select("source path title text embedding")
      .lean()
      .limit(Math.max(limit * 12, 48))
      .catch(() => []);
    vectorHits = rankByEmbedding(embedding, docs, limit).map((row) => row.doc);
  }
  const textHits = await searchKnowledgeByText(query, limit);
  const seen = new Set();
  const merged = [];
  for (const doc of [...vectorHits, ...textHits]) {
    const key = `${doc?.source || ""}:${doc?.path || ""}:${doc?.title || ""}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(doc);
    if (merged.length >= limit) break;
  }
  return merged;
}

function formatKnowledgeContext(chunks) {
  const list = Array.isArray(chunks) ? chunks : [];
  if (!list.length) return "";
  return list
    .map((c, i) => {
      const title = String(c?.title || c?.path || c?.source || `Fonte ${i + 1}`).trim();
      const body = String(c?.text || "").trim().slice(0, 480);
      return `[${title}]\n${body}`;
    })
    .join("\n\n---\n\n");
}

module.exports = { embedQuery, searchKnowledge, searchKnowledgeByText, formatKnowledgeContext, extractSearchTerms };