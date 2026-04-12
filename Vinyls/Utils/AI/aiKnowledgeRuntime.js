const fs = require("fs");
const path = require("path");

const KNOWLEDGE_DIR = path.resolve(__dirname, "..", "..", "Docs", "AI");
const CACHE_TTL_MS = 60_000;

let cacheExpiresAt = 0;
let cachedDocs = [];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[`*_#>\[\]\(\)\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  const raw = normalizeText(value);
  if (!raw) return [];
  const tokens = raw.split(" ").filter((token) => token.length >= 3);
  return Array.from(new Set(tokens));
}

function loadKnowledgeDocsFromDisk() {
  if (!fs.existsSync(KNOWLEDGE_DIR)) return [];
  const names = fs
    .readdirSync(KNOWLEDGE_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.md$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, "it"));
  const docs = [];
  for (const name of names) {
    const fullPath = path.join(KNOWLEDGE_DIR, name);
    const body = fs.readFileSync(fullPath, "utf8");
    if (!String(body || "").trim()) continue;
    docs.push({
      id: name,
      title: name.replace(/\.md$/i, ""),
      body: String(body),
      normalized: normalizeText(body),
    });
  }
  return docs;
}

function getKnowledgeDocs() {
  const nowTs = Date.now();
  if (nowTs < cacheExpiresAt && Array.isArray(cachedDocs)) return cachedDocs;
  cachedDocs = loadKnowledgeDocsFromDisk();
  cacheExpiresAt = nowTs + CACHE_TTL_MS;
  return cachedDocs;
}

function scoreDoc(doc, queryTokens) {
  if (!doc || !Array.isArray(queryTokens) || !queryTokens.length) return 0;
  let score = 0;
  for (const token of queryTokens) {
    const inTitle = doc.title.includes(token);
    const matchCount = doc.normalized.split(token).length - 1;
    if (inTitle) score += 4;
    if (matchCount > 0) score += Math.min(6, matchCount);
  }
  return score;
}

function buildSnippet(text, maxChars) {
  const clean = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!clean) return "";
  if (clean.length <= maxChars) return clean;
  return `${clean.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function getAiKnowledgeContext(query, options = {}) {
  const maxDocs = Math.max(1, Number(options.maxDocs || 3));
  const maxChars = Math.max(400, Number(options.maxChars || 1600));
  const docs = getKnowledgeDocs();
  if (!docs.length) return "";

  const queryTokens = tokenize(query);
  const ranked = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens) }))
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id, "it"));
  const selected = ranked
    .filter((entry) => entry.score > 0)
    .slice(0, maxDocs)
    .map((entry) => entry.doc);
  if (!selected.length) return "";

  const lines = [];
  let usedChars = 0;
  for (const doc of selected) {
    const remaining = maxChars - usedChars;
    if (remaining < 120) break;
    const snippet = buildSnippet(doc.body, Math.max(120, remaining - 40));
    if (!snippet) continue;
    const block = `### ${doc.title}\n${snippet}`;
    lines.push(block);
    usedChars += block.length + 2;
  }
  return lines.join("\n\n").trim();
}

module.exports = { getAiKnowledgeContext };