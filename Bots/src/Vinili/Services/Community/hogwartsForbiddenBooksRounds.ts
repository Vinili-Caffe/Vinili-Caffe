const path = require("path") as typeof import("path");
const fs = require("fs") as typeof import("fs");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { parseScheduleMs, resolveForbiddenBooksSchedule } = require("../../Utils/Web/hogwartsEventSchedule") as typeof import("../../Utils/Web/hogwartsEventSchedule");

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

function forbiddenBooksConfig(client?) {
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
  appelli: "Appelli",
  unban: "Appelli",
  evento_shop: "Shop evento",
  evento_pozioni: "Pozioni",
  evento_smistamento: "Smistamento",
  evento_coppa: "Coppa delle case",
  privacy: "Privacy",
  terms: "Termini",
  cookie: "Cookie",
});

const FORBIDDEN_BOOK_TITLES = Object.freeze({
  home: "Cronache di Hogwarts",
  faq: "Domande di un Mago Curioso",
  wiki: "Enciclopedia delle Arti Magiche",
  regole: "Il Codice dell'Onore Magico",
  donazioni: "Tesori Segreti di Gringott",
  vote: "Il Verdetto del Calice",
  ruoli: "Gerarchie della Scuola di Magia",
  sponsor: "Patrocini dei Mecenati Oscuri",
  candidature: "Lettere ai Prefetti",
  recensioni: "Giudizi del Critico Magico",
  suggerimenti: "Appunti dal Gabinetto degli Indovinelli",
  user: "Diario dello Studente",
  perks: "Privilegi della Torre",
  notifications: "Messaggeri della Civetta",
  appelli: "Appelli al Wizengamot",
  unban: "Appelli al Wizengamot",
  evento_shop: "Catalogo di Flourish & Blotts",
  evento_pozioni: "Ricettario di Pozioni Proibite",
  evento_smistamento: "Segreti del Cappello Parlante",
  evento_coppa: "Annali della Coppa delle Case",
  privacy: "Il Velo dell'Invisibilità",
  terms: "Patto Vincolante di Magia",
  cookie: "Biscotti della Fortuna Magica",
});

const FORBIDDEN_BOOK_ID_ALIASES = Object.freeze({
  unban: "appelli",
});

const PUBLIC_FORBIDDEN_BOOK_IDS = Object.freeze([
  "home",
  "faq",
  "wiki",
  "regole",
  "donazioni",
  "vote",
  "ruoli",
  "sponsor",
  "candidature",
  "recensioni",
  "suggerimenti",
  "appelli",
  "evento_shop",
  "evento_pozioni",
  "evento_smistamento",
  "evento_coppa",
  "privacy",
  "terms",
  "cookie",
]);

const DEFAULT_ROUND_BOOK_IDS = Object.freeze([
  "home", "faq", "wiki", "regole", "donazioni", "vote", "ruoli", "sponsor",
]);

function canonicalizeForbiddenBookId(value?) {
  const id = String(value || "").trim().toLowerCase();
  if (!id) return "";
  return FORBIDDEN_BOOK_ID_ALIASES[id] || id;
}

function normalizeRoundBookIds(raw?) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const entry of list) {
    const id = canonicalizeForbiddenBookId(entry);
    if (!id || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

function resolveForbiddenBooksRounds(client?) {
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
  return rounds.sort((a?, b?) => a.startMs - b.startMs);
}

function forbiddenEventDedupeKey(cfg?, roundId = "") {
  const base = `${String(cfg?.eventKey || "").trim() || "hogwarts"}:${FORBIDDEN_EVENT_DEDUPE}`;
  const rid = String(roundId || "").trim();
  return rid ? `${base}:${rid}` : base;
}

function forbiddenRoundDedupeKey(cfg?, round?) {
  if (!round || !round.id) return forbiddenEventDedupeKey(cfg);
  if (round.legacyDedupeKey) return round.legacyDedupeKey;
  return forbiddenEventDedupeKey(cfg, round.id);
}

function resolveForbiddenRoundByTime(client?, nowMs = Date.now()) {
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

function allConfiguredForbiddenBookIds(client?) {
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

function normalizeForbiddenBookId(value?, allowedBookIds?) {
  const id = canonicalizeForbiddenBookId(value);
  const allowedRaw = Array.isArray(allowedBookIds) && allowedBookIds.length
    ? allowedBookIds
    : DEFAULT_ROUND_BOOK_IDS;
  const allowed = allowedRaw.map(canonicalizeForbiddenBookId).filter(Boolean);
  return allowed.includes(id) ? id : "";
}

function formatForbiddenBookLabel(bookId?) {
  const id = canonicalizeForbiddenBookId(bookId);
  return FORBIDDEN_BOOK_LABELS[id] || String(bookId || "").trim();
}

function formatForbiddenBookTitle(bookId?) {
  const id = canonicalizeForbiddenBookId(bookId);
  return FORBIDDEN_BOOK_TITLES[id] || formatForbiddenBookLabel(id) || String(bookId || "").trim();
}

function filterPublicForbiddenBookIds(ids?) {
  const list = Array.isArray(ids) ? ids : [];
  const out = [];
  for (const entry of list) {
    const id = canonicalizeForbiddenBookId(entry);
    if (!id || !PUBLIC_FORBIDDEN_BOOK_IDS.includes(id) || out.includes(id)) continue;
    out.push(id);
  }
  return out;
}

export = {
  FORBIDDEN_EVENT_DEDUPE,
  FORBIDDEN_BOOK_LABELS,
  FORBIDDEN_BOOK_TITLES,
  FORBIDDEN_BOOK_ID_ALIASES,
  PUBLIC_FORBIDDEN_BOOK_IDS,
  DEFAULT_ROUND_BOOK_IDS,
  forbiddenBooksConfig,
  resolveForbiddenBooksRounds,
  forbiddenEventDedupeKey,
  forbiddenRoundDedupeKey,
  resolveForbiddenRoundByTime,
  allConfiguredForbiddenBookIds,
  canonicalizeForbiddenBookId,
  normalizeForbiddenBookId,
  formatForbiddenBookLabel,
  formatForbiddenBookTitle,
  filterPublicForbiddenBookIds,
};