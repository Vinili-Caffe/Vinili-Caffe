/**
 * movieNightStrictProposal1 — anno obbligatorio + (da strict) check Wikidata durata.
 */
const {
  extractMovieNightProposalTitle,
  movieNightTitleCompareKey,
} = require("./movieNightProposal") as typeof import("./movieNightProposal");

const MAX_RUNTIME_MINUTES = 150; // 2h 30m

function extractMovieNightProposalYear(raw?) {
  const text = String(raw || "");
  const paren = text.match(/[\(\[]\s*((?:19|20)\d{2})\s*(?:[-–—]\s*(?:(?:19|20)\d{2})?)?\s*[\)\]]/);
  if (paren && paren[1]) {
    const y = Number(paren[1]);
    if (Number.isFinite(y)) return y;
  }
  const bare = text.match(/(?:^|[^\d])((?:19|20)\d{2})(?:[^\d]|$)/);
  if (bare && bare[1]) {
    const y = Number(bare[1]);
    if (Number.isFinite(y) && y >= 1888 && y <= 2100) return y;
  }
  return null;
}

function compactTitleKey(title?) {
  return movieNightTitleCompareKey(title) || String(title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/gi, "");
}

function scoreTitleAgainstLabel(movieTitle?, label?) {
  const a = compactTitleKey(movieTitle);
  const b = compactTitleKey(label);
  if (!a || !b) return 0;
  if (a === b) return 1000;
  if (a.startsWith(b) || b.startsWith(a)) return 900;
  if (a.includes(b) || b.includes(a)) return 800;
  return 0;
}

async function fetchJson(url?, timeoutMs = 8000) {
  if (typeof fetch !== "function") return null;
  const signal =
    typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const response = await fetch(url, {
    signal,
    headers: {
      "User-Agent": "ViniliECaffeBot/1.0 (movie-night-proposal-rules)",
      Accept: "application/json",
    },
  }).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

function parseWikidataYear(claims?) {
  const rows = claims?.P577;
  if (!Array.isArray(rows) || !rows.length) return null;
  let best = null;
  for (const row of rows) {
    const time = String(row?.mainsnak?.datavalue?.value?.time || "");
    const m = time.match(/([+-]?\d{4})/);
    if (!m) continue;
    const y = Math.abs(Number(m[1]));
    if (!Number.isFinite(y)) continue;
    if (best == null || y < best) best = y;
  }
  return best;
}

function parseWikidataRuntimeMinutes(claims?) {
  const rows = claims?.P2047;
  if (!Array.isArray(rows) || !rows.length) return null;
  for (const row of rows) {
    const amount = Number(row?.mainsnak?.datavalue?.value?.amount);
    const unit = String(row?.mainsnak?.datavalue?.value?.unit || "");
    if (!Number.isFinite(amount) || amount <= 0) continue;
    // Q11574 minute, Q25235 second, Q11296 hour
    if (unit.endsWith("/Q11574") || unit.includes("Q11574")) return Math.round(amount);
    if (unit.endsWith("/Q25235") || unit.includes("Q25235")) return Math.round(amount / 60);
    if (unit.endsWith("/Q11296") || unit.includes("Q11296")) return Math.round(amount * 60);
    // default: assume minutes when unit missing/unknown and amount looks like runtime
    if (amount >= 20 && amount <= 600) return Math.round(amount);
  }
  return null;
}

async function resolveWikidataMovieEntityId(title?, yearHint = null) {
  const clean = extractMovieNightProposalTitle(title) || String(title || "").trim();
  if (!clean) return null;
  const queries = [clean, yearHint ? `${clean} ${yearHint}` : "", `film ${clean}`].filter(Boolean);
  let best = null;
  let bestScore = 0;
  for (const lang of ["it", "en"]) {
    for (const query of queries) {
      const url = new URL("https://www.wikidata.org/w/api.php");
      url.searchParams.set("action", "wbsearchentities");
      url.searchParams.set("format", "json");
      url.searchParams.set("language", lang);
      url.searchParams.set("uselang", lang);
      url.searchParams.set("type", "item");
      url.searchParams.set("limit", "6");
      url.searchParams.set("search", query);
      const data = await fetchJson(url.toString());
      for (const entity of data?.search || []) {
        const blob = [entity?.description, entity?.label, entity?.match?.text]
          .map((x?) => String(x || "").toLowerCase())
          .join(" ");
        if (!/\b(film|movie|pellicola|cinema|anime)\b/i.test(blob) && !/\bfilm\b/i.test(blob)) {
          continue;
        }
        let score = scoreTitleAgainstLabel(clean, entity?.label || entity?.match?.text || "");
        if (yearHint && blob.includes(String(yearHint))) score += 120;
        if (score > bestScore) {
          bestScore = score;
          best = String(entity.id || "");
        }
      }
      if (bestScore >= 1000) break;
    }
    if (bestScore >= 1000) break;
  }
  return bestScore >= 800 ? best : null;
}

async function fetchMovieNightProposalMeta(title?, yearHint = null) {
  const id = await resolveWikidataMovieEntityId(title, yearHint);
  if (!id) return { ok: false, reason: "not_found" };
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.searchParams.set("action", "wbgetentities");
  url.searchParams.set("format", "json");
  url.searchParams.set("props", "claims|labels");
  url.searchParams.set("languages", "it|en");
  url.searchParams.set("ids", id);
  const data = await fetchJson(url.toString());
  const entity = data?.entities?.[id];
  if (!entity || entity.missing) return { ok: false, reason: "entity_missing", id };
  const claims = entity.claims || {};
  return {
    ok: true,
    id,
    year: parseWikidataYear(claims),
    runtimeMinutes: parseWikidataRuntimeMinutes(claims),
    label: entity.labels?.it?.value || entity.labels?.en?.value || "",
  };
}

/**
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
async function validateMovieNightProposalContent(raw?, { enforceMeta = false } = {}) {
  const yearInText = extractMovieNightProposalYear(raw);
  if (!yearInText) {
    return {
      ok: false,
      code: "missing_year",
      message: "indica l'anno di uscita del film (anche tra parentesi), es. `Titolo (2015)`.",
    };
  }

  if (!enforceMeta) return { ok: true, year: yearInText };

  const title = extractMovieNightProposalTitle(raw) || String(raw || "").trim();
  const meta = await fetchMovieNightProposalMeta(title, yearInText).catch(() => null);
  if (!meta?.ok) return { ok: true, year: yearInText, metaSkipped: true };

  if (Number.isFinite(Number(meta.runtimeMinutes)) && Number(meta.runtimeMinutes) > MAX_RUNTIME_MINUTES) {
    const mins = Number(meta.runtimeMinutes);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return {
      ok: false,
      code: "runtime_too_long",
      message: `questo film dura circa ${h}h ${String(m).padStart(2, "0")}m (max 2h 30m).`,
    };
  }
  return { ok: true, year: yearInText, meta };
}

export = {
  MAX_RUNTIME_MINUTES,
  extractMovieNightProposalYear,
  fetchMovieNightProposalMeta,
  validateMovieNightProposalContent,
};
