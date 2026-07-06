const WEB_INTENT_RE =
  /\b(oggi|ieri|adesso|attualit[aà]|notizie|news|ultim[aà]|cerca(?:re)?|google|web|internet|prezzo|quanto costa|uscita|release|meteo|chi ha vinto|risultato)\b/i;
const SERVER_MEMORY_RE =
  /\b(hanno detto|ha scritto|messaggio|in chat|nel canale|ricordi|qualcuno ha|chi ha detto)\b/i;
const COMPLEX_RE = /\b(spiega|perch[eé]|confronta|analizza|pro e contro|step|guida|tutorial|dettagli)\b/i;
const SIMPLE_GREETING_RE =
  /^(ciao|hey|salve|buongiorno|buonasera|buonanotte|hi|hello|yo|ehi|bella|bene|come stai|che fai)[\s!?.,]*$/i;

function isSimpleAiQuery(question) {
  const q = String(question || "").trim();
  if (!q) return false;
  if (SIMPLE_GREETING_RE.test(q)) return true;
  if (q.length > 40) return false;
  if (detectWebIntent(q) || detectServerMemoryIntent(q) || COMPLEX_RE.test(q)) return false;
  if (q.includes("?") && q.length > 28) return false;
  return q.length <= 28;
}

function shouldUseOpenRouter({ question, needsWeb, needsServerSearch, knowledgeHits, ollamaFailed, localOnly }) {
  if (localOnly) return false;
  if (needsWeb || needsServerSearch) return true;
  if (ollamaFailed) return true;
  const q = String(question || "");
  if (q.length > 320) return true;
  if (WEB_INTENT_RE.test(q)) return true;
  if (COMPLEX_RE.test(q) && q.length > 80) return true;
  if (!knowledgeHits && q.length > 120) return true;
  return false;
}

function detectWebIntent(question) {
  return WEB_INTENT_RE.test(String(question || ""));
}

function detectServerMemoryIntent(question) {
  return SERVER_MEMORY_RE.test(String(question || ""));
}

module.exports = {
  shouldUseOpenRouter,
  detectWebIntent,
  detectServerMemoryIntent,
  isSimpleAiQuery,
};