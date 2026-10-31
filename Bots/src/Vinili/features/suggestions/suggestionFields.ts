/** Suggerimenti: bacheca, tag, testo e motivo. */
function normalizeSuggestionBoard(value?) {
  const b = String(value || "")
    .trim()
    .toLowerCase();
  if (b === "staff") return "staff";
  return "community";
}

const SUGGESTION_TOPIC_TAGS = Object.freeze(["server", "staff", "sito", "bots", "eventi", "altro"]);

function normalizeSuggestionTopicTag(value?) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  return SUGGESTION_TOPIC_TAGS.includes(t) ? t : "";
}

/** Persist/API validation: required exact tag. Display fallback for legacy docs. */
function suggestionTopicTagOf(doc?, { forDisplay = false } = {}) {
  const raw = doc && (doc.topicTag != null ? doc.topicTag : doc.tag != null ? doc.tag : doc.topic);
  const n = normalizeSuggestionTopicTag(raw);
  if (n) return n;
  return forDisplay ? "altro" : "";
}

function validateSuggestionTopicTag(tag?, kind?) {
  const normalized = normalizeSuggestionTopicTag(tag);
  if (!normalized) {
    return {
      ok: false,
      status: 400,
      error: "invalid_tag",
      message: "Scegli un argomento (Server, Staff, Sito, Bots, Eventi o Altro).",
    };
  }
  if (kind === "bug" && normalized === "eventi") {
    return {
      ok: false,
      status: 400,
      error: "invalid_tag_for_kind",
      message: "Il tag Eventi è disponibile solo per le idee, non per le segnalazioni bug.",
    };
  }
  return { ok: true, tag: normalized };
}

function suggestionBoardOf(doc?) {
  return normalizeSuggestionBoard(doc && doc.suggestionBoard);
}

function boardListQuery(board?) {
  if (board === "staff") return { suggestionBoard: "staff" };
  /* legacy docs without field = community */
  return {
    $or: [
      { suggestionBoard: { $exists: false } },
      { suggestionBoard: null },
      { suggestionBoard: "" },
      { suggestionBoard: "community" },
    ],
  };
}

function scrubDiscordDefaultAvatarUrl(url?) {
  const s = String(url || "").trim();
  if (!s) return "";
  if (/cdn\.discordapp\.com\/embed\/avatars\//i.test(s)) return "";
  return s;
}

function avatarHashFromDiscordUrl(url?) {
  const s = String(url || "").trim();
  if (!s || /cdn\.discordapp\.com\/embed\/avatars\//i.test(s)) return "";
  const guild = s.match(/\/guilds\/\d+\/users\/\d+\/avatars\/((?:a_)?[a-f0-9]+)/i);
  if (guild) return String(guild[1] || "").trim();
  const user = s.match(/\/avatars\/\d+\/((?:a_)?[a-f0-9]+)/i);
  return user ? String(user[1] || "").trim() : "";
}

function sanitizeBody(value?, maxLen?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeStaffReason(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1000);
}

function normalizeSuggestionKind(value?) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (k === "bug" || k === "bugs" || k === "problema") return "bug";
  if (k === "suggestion" || k === "suggerimento" || k === "suggerimenti" || k === "idea") return "suggestion";
  return "";
}

export = { normalizeSuggestionBoard, SUGGESTION_TOPIC_TAGS, suggestionTopicTagOf, validateSuggestionTopicTag, suggestionBoardOf, boardListQuery, scrubDiscordDefaultAvatarUrl, avatarHashFromDiscordUrl, sanitizeBody, sanitizeStaffReason, normalizeSuggestionKind };
