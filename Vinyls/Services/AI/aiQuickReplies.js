const GREETING_RE =
  /^(ciao|hey|salve|buongiorno|buonasera|buonanotte|hi|hello|yo|ehi|bella|bene|come stai|che fai)[\s!?.,]*$/i;

const MEMBER_TAG_RE =
  /\b(tagg(?:a|are|ami|o)|menzion(?:a|are|ami|o)|ping(?:a|are|ami|o)|@(?:\s*utente)?|chiama\s+l['']?utente)\b/i;

const GREETING_REPLIES = [
  "Ciao! Sono Vinili, l'assistente del server — chiedimi pure su regole, comandi, perks o eventi.",
  "Ehi! Vinili qui. Come posso aiutarti oggi?",
  "Ciao! Dimmi pure cosa ti serve: regole, +help, livelli, Hogwarts o altro sul server.",
];

function tryQuickAiReply(question) {
  const q = String(question || "").trim();
  if (!GREETING_RE.test(q)) return null;
  const idx = Math.floor(Math.random() * GREETING_REPLIES.length);
  return GREETING_REPLIES[idx];
}

module.exports = { tryQuickAiReply, MEMBER_TAG_RE, GREETING_RE };