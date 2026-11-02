/** Minigiochi: paesi, bandiere e quiz capitali. */
const axios = require("axios") as typeof import("axios").default;
const { getCapitalQuizBank, getItalianRegionCapitalBank, CAPITAL_ITALIAN, FAMOUS_CAPITAL_COUNTRIES, FLAG_WELL_KNOWN_COUNTRIES } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { warnMinigame } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName } = require("./minigameImages") as typeof import("./minigameImages");
const { buildAliases } = require("./minigameSourcesShared") as typeof import("./minigameSourcesShared");

let cachedCountries = null;
let cachedCountriesAt = 0;
const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedCapitalQuestions = null;
let cachedCapitalQuestionsAt = 0;
const CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedReverseCapitalQuestions = null;
let cachedReverseCapitalQuestionsAt = 0;
let cachedRegionCapitalQuestions = null;
let cachedRegionCapitalQuestionsAt = 0;
const REGION_CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function collectCountryNames(country?) {
  const names = new Set();
  const add = (value?) => { const normalized = normalizeCountryName(value); if (normalized) names.add(normalized); const compact = buildCompactAlias(value); if (compact) names.add(compact); };
  add(country?.translations?.ita?.common);
  add(country?.translations?.ita?.official);
  add(country?.name?.common);
  add(country?.name?.official);
  const nativeNames = country?.name?.nativeName || {};
  for (const key of Object.keys(nativeNames)) {
    add(nativeNames[key]?.common);
    add(nativeNames[key]?.official);
  }
  const translations = country?.translations || {};
  for (const key of Object.keys(translations)) {
    add(translations[key]?.common);
    add(translations[key]?.official);
  }
  const altSpellings = Array.isArray(country?.altSpellings) ? country.altSpellings : [];
  for (const alt of altSpellings) add(alt);
  return Array.from(names.values());
}

function isLikelyFamousCapitalCountry(countryDisplay?, aliases = [], cfg: Record<string, any> = {}) {
  const customFamous = Array.isArray(cfg?.guessCapital?.famousCountries) ? cfg.guessCapital.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FAMOUS_CAPITAL_COUNTRIES),
    ...customFamous.map((value?) => normalizeCountryName(value)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(countryDisplay);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const alias of aliases) {
    const normalizedAlias = normalizeCountryName(alias);
    if (normalizedAlias && allowlist.has(normalizedAlias)) return true;
  }
  return false;
}

function isWellKnownFlagCountry(displayName?, namesArray = [], cfg: Record<string, any> = {}) {
  const custom = Array.isArray(cfg?.guessFlag?.famousCountries) ? cfg.guessFlag.famousCountries : [];
  const allowlist = new Set([
    ...Array.from(FLAG_WELL_KNOWN_COUNTRIES),
    ...custom.map((v?) => normalizeCountryName(v)).filter(Boolean),
  ]);
  const normalizedDisplay = normalizeCountryName(displayName);
  if (normalizedDisplay && allowlist.has(normalizedDisplay)) return true;
  for (const n of namesArray || []) {
    const norm = normalizeCountryName(n);
    if (norm && allowlist.has(norm)) return true;
  }
  return false;
}

async function loadCountryList(cfg?) {
  const now = Date.now();
  if (cachedCountries && now - cachedCountriesAt < COUNTRY_CACHE_TTL_MS)
    return cachedCountries;

  let apiUrl = cfg?.guessFlag?.apiUrl;
  if (apiUrl && apiUrl.includes("restcountries.com") && apiUrl.includes("fields=")) {
    apiUrl = apiUrl.replace(/fields=([^&]+)/, (_?, f?) => `fields=${f},region,subregion,population,languages`);
  }
  let list = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      if (Array.isArray(res?.data)) {
        list = res.data;
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  const MIN_POPULATION_FOR_FLAG = 280000;
  const REGION_LABELS = { Europe: "Europa", Africa: "Africa", Americas: "Americhe", Asia: "Asia", Oceania: "Oceania", Antarctic: "Antartide" };
  const useWellKnownOnly = cfg?.guessFlag?.useWellKnownOnly !== false;
  const mapped = list.map((country?) => {
    const names = collectCountryNames(country);
    const flagUrl = country?.flags?.png || country?.flags?.svg || country?.flags?.[0];
    const displayName = country?.translations?.ita?.common || country?.name?.common || country?.name?.official || null;
    if (!names.length || !flagUrl || !displayName) return null;
    const pop = country?.population;
    if (Number.isFinite(pop) && pop < MIN_POPULATION_FOR_FLAG) return null;
    const region = country?.region;
    const subregion = country?.subregion;
    const langs = country?.languages;
    let populationLabel = null;
    if (Number.isFinite(pop)) {
      if (pop >= 1_000_000_000) populationLabel = `~${(pop / 1_000_000_000).toFixed(1)} miliardi`;
      else if (pop >= 1_000_000) populationLabel = `~${Math.round(pop / 1_000_000)} milioni`;
      else if (pop >= 1_000) populationLabel = `~${Math.round(pop / 1_000)} mila`;
      else populationLabel = `~${pop}`;
    }
    const languageNames = langs && typeof langs === "object" ? Object.values(langs).slice(0, 2) : [];
    return {
      names,
      flagUrl,
      displayName,
      region: region ? (REGION_LABELS[region] || region) : null,
      subregion: subregion || null,
      populationLabel: populationLabel || null,
      languages: languageNames.length ? languageNames : null,
    };
  }).filter(Boolean).filter((item?) => !useWellKnownOnly || isWellKnownFlagCountry(item.displayName, item.names, cfg));
  cachedCountries = mapped;
  cachedCountriesAt = now;
  return cachedCountries;
}

async function loadCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedCapitalQuestions &&
    now - cachedCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedCapitalQuestions;
  }

  const apiUrl = cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const capitalNames = [...capitals];
      for (const cap of capitals) {
        const it = CAPITAL_ITALIAN[String(cap || "").trim()];
        if (it && !capitalNames.includes(it)) capitalNames.push(it);
      }
      const aliases = buildAliases(capitalNames);
      if (!aliases.length) continue;
      out.push({ country: String(countryDisplay), answers: aliases, image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedCapitalQuestions = out.length ? out : getCapitalQuizBank().map((row?) => ({ country: row.country, answers: row.answers, image: null }));
  cachedCapitalQuestionsAt = now;
  return cachedCapitalQuestions;
}


async function loadReverseCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedReverseCapitalQuestions &&
    now - cachedReverseCapitalQuestionsAt < CAPITAL_CACHE_TTL_MS
  ) {
    return cachedReverseCapitalQuestions;
  }
  const apiUrl = cfg?.guessReverseCapital?.apiUrl || cfg?.guessCapital?.apiUrl || "https://restcountries.com/v3.1/all?fields=name,translations,capital,flags";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data) ? res.data : [];
    for (const country of list) {
      const countryDisplay = country?.translations?.ita?.common || country?.name?.common || null;
      const capitals = Array.isArray(country?.capital) ? country.capital : [];
      const image = country?.flags?.png || country?.flags?.svg || null;
      if (!countryDisplay || !capitals.length) continue;
      const countryAliases = collectCountryNames(country);
      if (!isLikelyFamousCapitalCountry(countryDisplay, countryAliases, cfg)) continue;
      const answers = buildAliases(countryAliases);
      if (!answers.length) continue;
      for (const cap of capitals) {
        const capitalStr = String(cap || "").trim();
        if (!capitalStr) continue;
        out.push({ capital: capitalStr, country: String(countryDisplay), answers, image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedReverseCapitalQuestions = out.length ? out : [];
  cachedReverseCapitalQuestionsAt = now;
  return cachedReverseCapitalQuestions;
}

async function loadRegionCapitalQuestionBank(cfg?) {
  const now = Date.now();
  if (
    cachedRegionCapitalQuestions &&
    now - cachedRegionCapitalQuestionsAt < REGION_CAPITAL_CACHE_TTL_MS
  ) {
    return cachedRegionCapitalQuestions;
  }

  const apiUrl = cfg?.guessRegionCapital?.apiUrl || null;
  const out = [];
  if (apiUrl) {
    try {
      const res = await axios.get(apiUrl, { timeout: 15000 });
      const list = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.data) ? res.data.data : [];
      for (const row of list) {
        const region = row?.region || row?.regione || row?.name || null;
        const capital = row?.capital || row?.capoluogo || null;
        if (!region || !capital) continue;
        const answers = buildAliases(Array.isArray(capital) ? capital : [capital],);
        if (!answers.length) continue;
        out.push({ region: String(region), answers });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }

  if (!out.length) {
    for (const row of getItalianRegionCapitalBank()) {
      const region = row?.region || null;
      const answers = buildAliases(row?.answers || []);
      if (!region || !answers.length) continue;
      out.push({ region: String(region), answers });
    }
  }

  cachedRegionCapitalQuestions = out;
  cachedRegionCapitalQuestionsAt = now;
  return cachedRegionCapitalQuestions;
}

export = { loadCountryList, loadCapitalQuestionBank, loadReverseCapitalQuestionBank, loadRegionCapitalQuestionBank };
