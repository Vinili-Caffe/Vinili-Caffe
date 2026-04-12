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

const KNOWLEDGE_QUERY_STOPWORDS = new Set(
  `anche alle all alla ancora appena are and bene che chi come cosa cosi cose dei degli delle della detto dire ecco fai fatti fare for from gli gia hai ho loro male molto mia non per perche poi proprio piu qualche qualcosa qua qui quella quello solo sono sempre sua the this that tutti tutte tutto una uno vita was when where while with you`.split(
    /\s+/,
  ),
);

function looksLikeServerOrBotScopedQuery(raw) {
  const t = normalizeText(raw);
  if (!t || t.length < 2) return false;
  if (/^\s*\+\s*[0-9a-zà-ù_-]/iu.test(String(raw || ""))) return true;
  return /\b(comand\w*|prefix\w*|ticket\w*|warn\w*|mut\w*|unmute|ban\w*|unban|kick\w*|staff\w*|moderat\w*|purge\w*|ruol\w*|canal\w*|permess\w*|regol\w+|automod|segnal\w*|verific\w*|sponsor\w*|support\w*|discord|guild|server|\bbot\b|vinili|caff(e|è))\b/iu.test(
    t,
  );
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
  const minDocScore = Math.max(1, Number(options.minDocScore ?? 3));
  const skipIntentGate = Boolean(options.skipServerIntentGate);
  const docs = getKnowledgeDocs();
  if (!docs.length) return "";

  if (!skipIntentGate && !looksLikeServerOrBotScopedQuery(query)) return "";

  const queryTokens = tokenize(query).filter(
    (tok) => !KNOWLEDGE_QUERY_STOPWORDS.has(tok),
  );
  if (!queryTokens.length) return "";

  const ranked = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, queryTokens) }))
    .sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id, "it"));
  const best = ranked[0]?.score || 0;
  if (best < minDocScore) return "";

  const selected = ranked
    .filter((entry) => entry.score >= minDocScore)
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