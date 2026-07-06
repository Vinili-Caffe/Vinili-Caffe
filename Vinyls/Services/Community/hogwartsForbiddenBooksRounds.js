const path = require("path");
const fs = require("fs");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { parseScheduleMs, resolveForbiddenBooksSchedule } = require("../../Utils/Web/hogwartsEventSchedule");

const FORBIDDEN_EVENT_DEDUPE = "forbidden_section_books";
const VINYLS_FORBIDDEN_BOOKS_CONFIG_PATH = path.join(__dirname, "..", "..", "config.json");

let vinylsForbiddenBooksFallback = null;

function loadVinylsForbiddenBooksFallback() {
  if (vinylsForbiddenBooksFallback) return vinylsForbiddenBooksFallback;
  try {
    const raw = JSON.parse(fs.readFileSync(VINYLS_FORBIDDEN_BOOKS_CONFIG_PATH, "utf8"));
    vinylsForbiddenBooksFallback = raw?.hogwartsForbiddenBooks && typeof raw.hogwartsForbiddenBooks === "object"
      ? raw.hogwartsForbiddenBooks
      : {};
  } catch {
    vinylsForbiddenBooksFallback = {};
  }
  return vinylsForbiddenBooksFallback;
}

function forbiddenBooksConfig(client) {
  const root = client?.config?.hogwartsForbiddenBooks && typeof client.config.hogwartsForbiddenBooks === "object"
    ? client.config.hogwartsForbiddenBooks
    : {};
  const rounds = Array.isArray(root.rounds) ? root.rounds : [];
  if (rounds.length) return root;
  const fallback = loadVinylsForbiddenBooksFallback();
  if (!Object.keys(root).length) return fallback;
  return { ...fallback, ...root, rounds: Array.isArray(fallback.rounds) ? fallback.rounds : [] };
}

const FORBIDDEN_BOOK_LABELS = Object.freeze({
  home: "Home",
  faq: "FAQ",
  wiki: "Wiki",
  regole: "Regole",
  donazioni: "Donazioni",
  vote: "Voto",
  ruoli: "Ruoli",
  sponsor: "Sponsor",
  candidature: "Candidature",
  recensioni: "Recensioni",
  suggerimenti: "Suggerimenti",
  user: "Profilo utente",
  perks: "Perks",
  notifications: "Notifiche",
  unban: "Richiesta unban",
  evento_shop: "Shop evento",
  evento_pozioni: "Pozioni",
  evento_smistamento: "Smistamento",
  evento_coppa: "Coppa delle case",
  privacy: "Privacy",
  terms: "Termini",
  cookie: "Cookie",
});

const DEFAULT_ROUND_BOOK_IDS = Object.freeze([
  "home", "faq", "wiki", "regole", "donazioni", "vote", "ruoli", "sponsor",
]);

function normalizeRoundBookIds(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of list) {
    const id = String(entry || "").trim().toLowerCase();
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function resolveForbiddenBooksRounds(client) {
  const raw = forbiddenBooksConfig(client);
  const roundsRaw = Array.isArray(raw.rounds) ? raw.rounds : [];
  if (!roundsRaw.length) return [];
  const { endMs: eventEndMs } = resolveForbiddenBooksSchedule(client);
  const rounds = [];
  for (let i = 0; i < roundsRaw.length; i += 1) {
    const entry = roundsRaw[i] && typeof roundsRaw[i] === "object" ? roundsRaw[i] : {};
    const id = String(entry.id || `r${i + 1}`).trim() || `r${i + 1}`;
    const startMs = parseScheduleMs(String(entry.start || "").trim(), "12:00:00");
    if (!Number.isFinite(startMs)) continue;
    const bookIds = normalizeRoundBookIds(entry.bookIds);
    if (!bookIds.length) continue;
    const nextStartMs = i + 1 < roundsRaw.length
      ? parseScheduleMs(String(roundsRaw[i + 1]?.start || "").trim(), "12:00:00")
      : null;
    const endMs = Number.isFinite(nextStartMs) ? nextStartMs : eventEndMs;
    rounds.push({
      id,
      label: String(entry.label || `Round ${i + 1}`).trim() || `Round ${i + 1}`,
      start: String(entry.start || "").trim(),
      startMs,
      endMs: Number.isFinite(endMs) ? endMs : eventEndMs,
      bookIds,
      index: rounds.length,
      legacyDedupeKey: i === 0 ? forbiddenEventDedupeKey(resolveHogwartsEventConfig(client)) : null,
    });
  }
  return rounds.sort((a, b) => a.startMs - b.startMs);
}

function forbiddenEventDedupeKey(cfg, roundId = "") {
  const base = `${String(cfg?.eventKey || "").trim() || "hogwarts"}:${FORBIDDEN_EVENT_DEDUPE}`;
  const rid = String(roundId || "").trim();
  return rid ? `${base}:${rid}` : base;
}

function forbiddenRoundDedupeKey(cfg, round) {
  if (!round || !round.id) return forbiddenEventDedupeKey(cfg);
  if (round.legacyDedupeKey) return round.legacyDedupeKey;
  return forbiddenEventDedupeKey(cfg, round.id);
}

function resolveForbiddenRoundByTime(client, nowMs = Date.now()) {
  const rounds = resolveForbiddenBooksRounds(client);
  const now = Number(nowMs || Date.now());
  if (!rounds.length) return { rounds: [], active: null, next: null, mode: "legacy" };
  let active = null;
  let next = null;
  for (const round of rounds) {
    if (now >= round.startMs && now < round.endMs) {
      active = round;
      break;
    }
    if (round.startMs > now && !next) next = round;
  }
  if (!next) {
    for (const round of rounds) {
      if (round.startMs > now) {
        next = round;
        break;
      }
    }
  }
  return { rounds, active, next, mode: "rounds" };
}

function allConfiguredForbiddenBookIds(client) {
  const rounds = resolveForbiddenBooksRounds(client);
  if (!rounds.length) return [...DEFAULT_ROUND_BOOK_IDS];
  const out = [];
  for (const round of rounds) {
    for (const id of round.bookIds) {
      if (!out.includes(id)) out.push(id);
    }
  }
  return out;
}

function normalizeForbiddenBookId(value, allowedBookIds) {
  const id = String(value || "").trim().toLowerCase();
  const allowed = Array.isArray(allowedBookIds) && allowedBookIds.length
    ? allowedBookIds
    : DEFAULT_ROUND_BOOK_IDS;
  return allowed.includes(id) ? id : "";
}

function formatForbiddenBookLabel(bookId) {
  return FORBIDDEN_BOOK_LABELS[String(bookId || "").trim().toLowerCase()] || String(bookId || "").trim();
}

module.exports = {
  FORBIDDEN_EVENT_DEDUPE,
  FORBIDDEN_BOOK_LABELS,
  DEFAULT_ROUND_BOOK_IDS,
  forbiddenBooksConfig,
  resolveForbiddenBooksRounds,
  forbiddenEventDedupeKey,
  forbiddenRoundDedupeKey,
  resolveForbiddenRoundByTime,
  allConfiguredForbiddenBookIds,
  normalizeForbiddenBookId,
  formatForbiddenBookLabel,
};