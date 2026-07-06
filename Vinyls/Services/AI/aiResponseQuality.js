const SKIP_TOKENS = new Set(["[skip]", "skip", "niente", "nulla"]);

const BOILERPLATE_RE =
  /(?:come assistente|sono un'?assistente|certamente!?|assolutamente!?|ecco (?:alcune|una) (?:risposta|informazioni)|in qualità di|happy to help|as an ai|i am an ai|non ho (?:accesso|informazioni)|mi dispiace,? ma non posso)/i;

const MARKDOWN_RE = /```|^\s*#{1,6}\s|\*\*[^*]+\*\*|\n\s*[-*•]\s/m;

const ROLEPLAY_RE = /^\s*\*[^*]+\*|\*[^*]+\*\s*$/;

const TRAILING_EMOJI_RE = /(\s*[\p{Extended_Pictographic}\p{Emoji_Presentation}]+)$/u;

function splitTrailingEmoji(raw) {
  const text = String(raw || "").trim();
  const match = text.match(TRAILING_EMOJI_RE);
  if (!match) return { body: text, suffix: "" };
  return { body: text.slice(0, -match[0].length).trimEnd(), suffix: match[0] };
}

function fixTerminalPunctuation(body) {
  let core = String(body || "").trimEnd();
  if (!core) return "";
  core = core.replace(/\?\s*[!…]+$/u, "?");
  core = core.replace(/\?\s*\.+$/u, "?");
  core = core.replace(/([.!?…])\s+([.!?…])+$/u, "$1");
  core = core.replace(/[!…]+$/u, ".");
  core = core.replace(/\.{2,}$/u, ".");
  return core;
}

function softenTrailingExclamation(text) {
  const { body, suffix } = splitTrailingEmoji(text);
  if (!body.endsWith("!")) return fixTerminalPunctuation(body) + suffix;
  if (/\?/.test(body)) return fixTerminalPunctuation(body) + suffix;
  if (/!{2,}$/.test(body)) return body + suffix;
  const words = body.replace(/[!?.…]+$/u, "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /^(wow|grande|bella|bello|ahah|ahaha|ah|oddio|figata|assurdo|pazzesco)$/i.test(words[0])) {
    return body + suffix;
  }
  return fixTerminalPunctuation(body.replace(/!+$/u, ".")) + suffix;
}

function normalizeAiReply(text) {
  let raw = String(text || "").trim();
  if (!raw) return "";
  raw = raw.replace(/^["'`]+|["'`]+$/g, "").trim();
  raw = raw.replace(/^(?:vinili|assistant|ai)\s*:\s*/i, "").trim();
  raw = raw.replace(/\s*\[SKIP\]\s*$/i, "").trim();
  return softenTrailingExclamation(raw);
}

function isAiSkipToken(text) {
  const raw = String(text || "").trim().toLowerCase().replace(/^\[|\]$/g, "");
  return SKIP_TOKENS.has(raw);
}

function countSentences(text) {
  const parts = String(text || "")
    .split(/[.!?…]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length;
}

const ENGLISH_HEAVY_RE =
  /\b(the|and|you|your|what|how|really|awesome|definitely|literally|that's|it's|don't|can't|would|should|could)\b/gi;

function looksMostlyEnglish(text) {
  const en = (String(text || "").match(ENGLISH_HEAVY_RE) || []).length;
  const it = (String(text || "").match(/\b(che|non|per|con|una|sono|sei|hai|come|questo|anche|molto|bene|forse|sembra|già)\b/gi) || []).length;
  return en >= 2 && en > it;
}

function hasBalancedQuotes(text) {
  const dq = (String(text || "").match(/"/g) || []).length;
  return dq % 2 === 0;
}

function endsLikeCompleteSentence(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  return /[.!?…](?:\s*[\p{Extended_Pictographic}\p{Emoji_Presentation}])?$/u.test(raw);
}

function looksTruncatedOrIncomplete(text) {
  const raw = String(text || "").trim();
  if (!raw) return true;
  if (!hasBalancedQuotes(raw)) return true;
  if (/[,;:]\s*$/.test(raw)) return true;
  if (/\b(ma|e|che|però|quindi|perché|della|del|un|una|il|la|di)\s*$/i.test(raw)) return true;
  if (/["']\w{1,6}$/.test(raw)) return true;
  if (!endsLikeCompleteSentence(raw)) return true;
  return false;
}

function looksRambling(text) {
  const raw = String(text || "").trim();
  if (!raw) return true;
  const commas = (raw.match(/,/g) || []).length;
  if (commas >= 3) return true;
  if (countSentences(raw) > 2) return true;
  if (/\b(la verità è che|in conclusione|detto questo|a mio avviso)\b/i.test(raw)) return true;
  const butCount = (raw.match(/\bma\b/gi) || []).length;
  if (butCount >= 2) return true;
  return false;
}

function tokenizeDisplayName(name) {
  const raw = String(name || "").trim();
  if (!raw) return [];
  const out = new Set();
  for (const chunk of raw.split(/[|·•\-–—/]+/)) {
    for (const word of chunk.split(/\s+/)) {
      const token = word.replace(/[^\p{L}\p{N}']/gu, "").trim();
      if (token.length >= 2) out.add(token);
    }
  }
  if (!out.size && raw.length >= 2) out.add(raw);
  return [...out];
}

function collectForbiddenNicknameFragments(names) {
  const forbidden = new Set();
  for (const name of names || []) {
    for (const token of tokenizeDisplayName(name)) {
      if (token.length < 5) continue;
      const lower = token.toLowerCase();
      for (let i = 4; i < lower.length; i += 1) {
        forbidden.add(lower.slice(0, i));
      }
    }
  }
  return [...forbidden];
}

function collectChatParticipantNames(recent) {
  const names = new Set();
  for (const row of recent || []) {
    const author = String(row?.author || "").trim();
    if (author.length >= 2) names.add(author);
  }
  return [...names];
}

function buildProactiveChatBundle(recent) {
  const rows = (recent || []).slice(-4);
  const participantNames = collectChatParticipantNames(rows);
  const last = rows[rows.length - 1] || null;
  const previous = rows.slice(0, -1);
  return {
    participantNames,
    lastAuthor: String(last?.author || "").trim(),
    lastContent: String(last?.content || "").trim(),
    previousMessages: previous.map((row) => ({
      author: String(row?.author || "").trim(),
      content: String(row?.content || "").trim(),
    })),
    forbiddenNicknameFragments: collectForbiddenNicknameFragments(participantNames),
    allowedNameTokens: participantNames.flatMap((n) => tokenizeDisplayName(n).map((t) => t.toLowerCase())),
  };
}

function formatProactiveChatContext(bundle) {
  if (!bundle?.lastContent) return "";
  const parts = [
    "Ogni messaggio sotto è scritto da una persona DIVERSA. Non unificarli in un solo interlocutore.",
    "Se citi qualcuno con nickname composto (es. con |), devi usare TUTTO il nickname, mai solo la prima parola (Lore da solo è vietato).",
  ];
  if (/prefetto/i.test(bundle.lastAuthor || "")) {
    parts.push(
      'Nota: "Prefetto di Tassorosso" è un ruolo Hogwarts nel server, NON una prefettura geografica.',
    );
  }
  parts.push(
    `Nickname consentiti (solo interi, identici):\n${(bundle.participantNames || []).map((n) => `- "${n}"`).join("\n")}`,
  );
  if (bundle.previousMessages?.length) {
    parts.push(
      "Contesto (NON rispondere a questi):\n" +
        bundle.previousMessages
          .map((row, i) => `[${i + 1}] "${row.author}": ${row.content}`)
          .join("\n"),
    );
  }
  parts.push(
    `ULTIMO messaggio (rispondi SOLO a questo):\n"${bundle.lastAuthor}": ${bundle.lastContent}`,
    `Autore da citare se serve: "${bundle.lastAuthor}" (nickname completo, mai "tu" o abbreviazioni).`,
  );
  return parts.join("\n\n");
}

function looksLikeTruncatedNickname(text, opts = {}) {
  const allowed = new Set((opts.allowedNameTokens || []).map((t) => String(t).toLowerCase()));
  const forbidden = opts.forbiddenNicknameFragments || collectForbiddenNicknameFragments(opts.participantNames);
  const raw = String(text || "").toLowerCase();
  for (const frag of forbidden) {
    if (!frag || allowed.has(frag)) continue;
    if (new RegExp(`\\b${frag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)) return true;
  }
  return false;
}

function looksLikeWrongDirectAddress(text) {
  const raw = String(text || "");
  if (/\b(che\s+)?tu\s+(sia|sei|hai|fai|facci|possa|voglia|parta|vada|stia)\b/i.test(raw)) return true;
  if (/\b(ti|tuo|tua|tuoi|tue)\b/i.test(raw)) return true;
  return false;
}

function getAllowedMentionTokens(lastAuthor) {
  const allowed = new Set();
  const full = String(lastAuthor || "").trim().toLowerCase();
  if (full) allowed.add(full);
  for (const token of tokenizeDisplayName(lastAuthor)) {
    if (token.length >= 2) allowed.add(token.toLowerCase());
  }
  return allowed;
}

function mentionsDisallowedParticipant(text, opts = {}) {
  const raw = String(text || "").toLowerCase();
  const allowed = getAllowedMentionTokens(opts.lastAuthor);
  for (const name of opts.participantNames || []) {
    const full = String(name || "").trim().toLowerCase();
    if (!full || allowed.has(full)) continue;
    if (raw.includes(full)) return true;
    for (const token of tokenizeDisplayName(name)) {
      const t = token.toLowerCase();
      if (t.length < 3 || allowed.has(t)) continue;
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${esc}\\b`, "i").test(raw)) return true;
    }
  }
  return false;
}

function explainProactiveRejectReason(text, opts = {}) {
  const raw = normalizeAiReply(text);
  if (!raw || isAiSkipToken(raw)) return "skip";
  if (raw.length < 8 || raw.length > 200) return "lunghezza";
  if (BOILERPLATE_RE.test(raw)) return "boilerplate";
  if (MARKDOWN_RE.test(raw)) return "markdown";
  if (ROLEPLAY_RE.test(raw)) return "roleplay";
  if (looksTruncatedOrIncomplete(raw)) return "incompleta";
  if (looksRambling(raw)) return "rambling";
  if (countSentences(raw) > 1) return "troppe_frase";
  if (looksMostlyEnglish(raw)) return "inglese";
  if (looksLikeMisusedNickname(raw, opts.participantNames)) return "nickname_oggetto";
  if (looksLikeTruncatedNickname(raw, opts)) return "nickname_troncato";
  if (looksLikeWrongDirectAddress(raw)) return "tu_ti_vocativo";
  if (looksLikeInventedFollowUp(raw, opts.lastContent)) return "domanda_inventata";
  if (looksLikePartialDisplayNameCitation(raw, opts.participantNames)) return "nickname_parziale";
  if (mentionsDisallowedParticipant(raw, opts)) return "altro_utente";
  if (looksLikeInventedPityOrNarrative(raw, opts)) return "narrativa_inventata";
  if (/\n{2,}/.test(raw)) return "multilinea";
  return null;
}

function isCompositeDisplayName(name) {
  const raw = String(name || "").trim();
  return /[|·•/]/.test(raw) || raw.split(/\s+/).filter(Boolean).length >= 4;
}

function looksLikePartialDisplayNameCitation(text, participantNames) {
  const raw = String(text || "");
  const lower = raw.toLowerCase();
  for (const name of participantNames || []) {
    if (!isCompositeDisplayName(name)) continue;
    if (lower.includes(String(name).toLowerCase())) continue;
    for (const token of tokenizeDisplayName(name)) {
      if (token.length < 3) continue;
      const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${esc}\\b`, "i").test(raw)) return true;
    }
  }
  return false;
}

function looksLikeInventedPityOrNarrative(text, opts = {}) {
  const raw = String(text || "").toLowerCase();
  const src = String(opts.lastContent || "").toLowerCase();
  const lastAuthor = String(opts.lastAuthor || "");
  if (/\bpover[oa]\b/.test(raw)) return true;
  if (/\b(la|il|le|i)\s+(sua|suo|suae|suoi)\s+\w+/i.test(raw) && !/\b(sua|suo|suae|suoi)\s+\w+/i.test(src)) return true;
  if (/\bprefetture?\b/i.test(raw) && /prefetto/i.test(lastAuthor)) return true;
  if (/\bpiù occupat[oa]\b/i.test(raw) && !/\boccupat/i.test(src)) return true;
  return false;
}
function looksLikeInventedFollowUp(text, lastContent) {
  const raw = String(text || "");
  const src = String(lastContent || "").toLowerCase();
  if (countSentences(raw) > 1) return true;
  if (/\b(chi (?:è|e)|cosa|perché|perche|quando|dove)\b/i.test(raw) && src.length < 12) return true;
  if (/\b(i tuoi|le tue|i suoi|le sue)\s+(auguri|complimenti|regali|messaggi)\b/i.test(raw) && !/\bauguri\b/i.test(src)) {
    return true;
  }
  return false;
}

function looksLikeMisusedNickname(text, participantNames) {
  const names = (participantNames || []).map((n) => String(n || "").trim()).filter((n) => n.length >= 2);
  if (!names.length) return false;
  const raw = String(text || "");
  for (const name of names) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(i|le|gli)\\s+(suoi|suae|sue)\\s+${esc}\\b`, "i").test(raw)) return true;
    if (new RegExp(`\\b(un|una|dei|delle|degli|del|della|sul|sulla)\\s+${esc}\\b`, "i").test(raw)) return true;
    if (new RegExp(`\\bcon\\s+(i|le|gli|suoi|sue)\\s+${esc}\\b`, "i").test(raw)) return true;
  }
  return false;
}

function isProactiveAiReplyAcceptable(text, opts = {}) {
  return !explainProactiveRejectReason(text, opts);
}

function isChatAiReplyAcceptable(text) {
  const raw = normalizeAiReply(text);
  if (!raw || isAiSkipToken(raw)) return false;
  if (raw.length < 2 || raw.length > 3600) return false;
  if (BOILERPLATE_RE.test(raw)) return false;
  if (ROLEPLAY_RE.test(raw)) return false;
  return true;
}

module.exports = {
  normalizeAiReply,
  isAiSkipToken,
  collectChatParticipantNames,
  buildProactiveChatBundle,
  formatProactiveChatContext,
  explainProactiveRejectReason,
  looksLikeMisusedNickname,
  isProactiveAiReplyAcceptable,
  isChatAiReplyAcceptable,
};