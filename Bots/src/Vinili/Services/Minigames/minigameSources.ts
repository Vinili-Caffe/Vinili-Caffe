/** Minigiochi: dati presi da fuori (paesi, capitali, squadre, giocatori, cantanti, album, canzoni) con le loro cache. */
const axios = require("axios") as typeof import("axios").default;
const { getCapitalQuizBank, getItalianRegionCapitalBank, CAPITAL_ITALIAN, FAMOUS_CAPITAL_COUNTRIES, FLAG_WELL_KNOWN_COUNTRIES } = require("../../Data/Minigames/minigameBanks") as typeof import("../../Data/Minigames/minigameBanks");
const { warnMinigame, noteSportsDb429, isSportsDbCoolingDown } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, pickBestSingerImage, hasUsablePlayerImage } = require("./minigameImages") as typeof import("./minigameImages");

let cachedCountries = null;
let cachedCountriesAt = 0;
const COUNTRY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedSongs = null;
let cachedSongsAt = 0;
const SONG_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedCapitalQuestions = null;
let cachedCapitalQuestionsAt = 0;
const CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedRegionCapitalQuestions = null;
let cachedRegionCapitalQuestionsAt = 0;
const REGION_CAPITAL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
let cachedTeams = null;
let cachedTeamsAt = 0;
const TEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedLeaguePlayers = null;
let cachedLeaguePlayersAt = 0;
const LEAGUE_PLAYER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cachedSingers = null;
let cachedSingersAt = 0;
const SINGER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
let cachedAlbums = null;
let cachedAlbumsAt = 0;
const ALBUM_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_FOOTBALL_LEAGUES = ["Italian Serie A", "English Premier League", "Spanish La Liga", "German Bundesliga", "French Ligue 1", "Dutch Eredivisie", "Belgian Pro League", "Portuguese Primeira Liga", "Saudi Pro League", "Turkish Super Lig", "Italian Serie B", "English League Championship", "American Major League Soccer",];
const TEAM_ITALIAN_MAP = getTeamItalianMap();

function isThesportsdb429(err?) {
  const msg = err?.message || err?.response?.data || String(err);
  const status = err?.response?.status;
  const url = err?.response?.config?.url || err?.config?.url;
  const is429 = status === 429 || (typeof msg === "string" && msg.includes("429"));
  return is429 && typeof url === "string" && /thesportsdb\.com/i.test(url);
}

function getTeamItalianMap() {
  const k = (s?) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  const entries = [
    { keys: ["olympique marseille", "marseille"], display: "Marsiglia", extra: ["OM"] },
    { keys: ["juventus"], display: "Juventus", extra: ["Juve", "Juve FC", "Bianconeri"] },
    { keys: ["inter", "inter milan", "internazionale"], display: "Inter", extra: ["Internazionale", "Nerazzurri"] },
    { keys: ["ac milan", "milan"], display: "Milan", extra: ["AC Milan", "Rossoneri"] },
    { keys: ["napoli", "ssc napoli", "naples"], display: "Napoli", extra: ["Partenopei"] },
    { keys: ["roma", "as roma"], display: "Roma", extra: ["AS Roma", "Giallorossi"] },
    { keys: ["lazio", "ss lazio"], display: "Lazio", extra: ["SS Lazio", "Biancocelesti"] },
    { keys: ["atalanta", "atalanta bc", "atalanta bergamasca calcio"], display: "Atalanta", extra: ["Dea", "Nerazzurri"] },
    { keys: ["fiorentina", "acf fiorentina"], display: "Fiorentina", extra: ["Viola", "ACF Fiorentina"] },
    { keys: ["bologna", "bologna fc"], display: "Bologna", extra: ["Bologna FC", "Felsinei"] },
    { keys: ["torino", "torino fc"], display: "Torino", extra: ["Torino FC", "Granata"] },
    { keys: ["genoa", "genoa cfc"], display: "Genoa", extra: ["Genoa CFC", "Grifone"] },
    { keys: ["sampdoria", "uc sampdoria"], display: "Sampdoria", extra: ["Samp", "UC Sampdoria"] },
    { keys: ["cagliari", "cagliari calcio"], display: "Cagliari", extra: ["Rossoblù"] },
    { keys: ["udinese", "udinese calcio"], display: "Udinese", extra: ["Udinese Calcio"] },
    { keys: ["sassuolo", "us sassuolo"], display: "Sassuolo", extra: ["US Sassuolo"] },
    { keys: ["empoli", "empoli fc"], display: "Empoli", extra: ["Empoli FC"] },
    { keys: ["verona", "hellas verona", "verona fc"], display: "Verona", extra: ["Hellas Verona", "Gialloblù"] },
    { keys: ["lecce", "us lecce"], display: "Lecce", extra: ["US Lecce", "Giallorossi"] },
    { keys: ["frosinone", "frosinone calcio"], display: "Frosinone", extra: ["Frosinone Calcio"] },
    { keys: ["salernitana", "us salernitana"], display: "Salernitana", extra: ["US Salernitana"] },
    { keys: ["monza", "ac monza"], display: "Monza", extra: ["AC Monza", "Brianzoli"] },
    { keys: ["real madrid", "real madrid cf"], display: "Real Madrid", extra: ["Madrid", "Real", "Merengues"] },
    { keys: ["barcelona", "fc barcelona", "fc barcelona b"], display: "Barcellona", extra: ["Barcelona", "Barça", "Barca", "Blaugrana"] },
    { keys: ["atletico madrid", "atlético madrid", "club atletico de madrid"], display: "Atletico Madrid", extra: ["Atlético", "Atletico", "Colchoneros"] },
    { keys: ["sevilla", "sevilla fc"], display: "Siviglia", extra: ["Sevilla", "Sevilla FC"] },
    { keys: ["real betis", "real betis balompie"], display: "Real Betis", extra: ["Betis", "Real Betis"] },
    { keys: ["villarreal", "villarreal cf"], display: "Villarreal", extra: ["Villarreal CF", "Submarino Amarillo"] },
    { keys: ["valencia", "valencia cf"], display: "Valencia", extra: ["Valencia CF", "Che"] },
    { keys: ["real sociedad", "real sociedad de futbol"], display: "Real Sociedad", extra: ["Real Sociedad", "La Real"] },
    { keys: ["athletic bilbao", "athletic club", "athletic club bilbao"], display: "Athletic Bilbao", extra: ["Athletic", "Bilbao", "Leones"] },
    { keys: ["bayern munich", "fc bayern munich", "fc bayern münchen"], display: "Bayern Monaco", extra: ["Bayern", "Bayern Munich", "FC Bayern"] },
    { keys: ["borussia dortmund", "bv borussia dortmund"], display: "Borussia Dortmund", extra: ["Dortmund", "BVB", "Borussia"] },
    { keys: ["rb leipzig", "rasenballsport leipzig"], display: "RB Lipsia", extra: ["Leipzig", "RB Leipzig"] },
    { keys: ["bayer leverkusen", "bayer 04 leverkusen"], display: "Bayer Leverkusen", extra: ["Leverkusen", "Bayer"] },
    { keys: ["eintracht frankfurt", "eintracht frankfurt e v"], display: "Eintracht Francoforte", extra: ["Eintracht Frankfurt", "Frankfurt", "SGE"] },
    { keys: ["vfl wolfsburg", "vfl wolfsburg"], display: "Wolfsburg", extra: ["VfL Wolfsburg"] },
    { keys: ["paris saint germain", "paris saint-germain", "paris sg", "psg"], display: "Paris Saint-Germain", extra: ["PSG", "Paris SG", "Parigi"] },
    { keys: ["olympique lyonnais", "lyon"], display: "Olympique Lione", extra: ["Lione", "OL", "Lyon"] },
    { keys: ["lille", "lille osc", "losc lille"], display: "Lille", extra: ["Lille OSC", "LOSC"] },
    { keys: ["monaco", "as monaco", "as monaco fc"], display: "Monaco", extra: ["AS Monaco", "Monaco FC"] },
    { keys: ["rennes", "stade rennais", "stade rennais fc 1901"], display: "Rennes", extra: ["Stade Rennes", "Stade Rennais"] },
    { keys: ["manchester united", "manchester united fc"], display: "Manchester United", extra: ["United", "Man United", "Man Utd", "Red Devils"] },
    { keys: ["manchester city", "manchester city fc"], display: "Manchester City", extra: ["City", "Man City", "Citizens"] },
    { keys: ["liverpool", "liverpool fc"], display: "Liverpool", extra: ["Liverpool FC", "Reds"] },
    { keys: ["arsenal", "arsenal fc"], display: "Arsenal", extra: ["Arsenal FC", "Gunners"] },
    { keys: ["chelsea", "chelsea fc"], display: "Chelsea", extra: ["Chelsea FC", "Blues"] },
    { keys: ["tottenham hotspur", "tottenham"], display: "Tottenham", extra: ["Spurs", "Tottenham Hotspur"] },
    { keys: ["newcastle united", "newcastle united fc"], display: "Newcastle", extra: ["Newcastle United", "Magpies"] },
    { keys: ["west ham united", "west ham"], display: "West Ham", extra: ["West Ham United", "Hammers"] },
    { keys: ["brighton and hove albion", "brighton"], display: "Brighton", extra: ["Brighton & Hove Albion", "Seagulls"] },
    { keys: ["aston villa", "aston villa fc"], display: "Aston Villa", extra: ["Villa", "Villans"] },
    { keys: ["crystal palace", "crystal palace fc"], display: "Crystal Palace", extra: ["Palace", "Eagles"] },
    { keys: ["fulham", "fulham fc"], display: "Fulham", extra: ["Fulham FC"] },
    { keys: ["wolverhampton wanderers", "wolves", "wolverhampton"], display: "Wolverhampton", extra: ["Wolves", "Wanderers"] },
    { keys: ["everton", "everton fc"], display: "Everton", extra: ["Everton FC", "Toffees"] },
    { keys: ["nottingham forest", "nottingham forest fc"], display: "Nottingham Forest", extra: ["Forest", "Nott'm Forest"] },
    { keys: ["brentford", "brentford fc"], display: "Brentford", extra: ["Brentford FC", "Bees"] },
    { keys: ["ajax", "afc ajax", "ajax amsterdam"], display: "Ajax", extra: ["AFC Ajax", "Ajax Amsterdam"] },
    { keys: ["psv", "psv eindhoven"], display: "PSV Eindhoven", extra: ["PSV", "Eindhoven"] },
    { keys: ["feyenoord", "feyenoord rotterdam"], display: "Feyenoord", extra: ["Feyenoord Rotterdam"] },
    { keys: ["benfica", "sl benfica", "sport lisboa e benfica"], display: "Benfica", extra: ["SL Benfica", "Águias"] },
    { keys: ["porto", "fc porto", "fc porto porto"], display: "Porto", extra: ["FC Porto", "Dragões"] },
    { keys: ["sporting lisbon", "sporting cp", "sporting clube de portugal"], display: "Sporting Lisbona", extra: ["Sporting", "Sporting CP", "Leões"] },
    { keys: ["celtic", "celtic fc"], display: "Celtic", extra: ["Celtic FC", "Bhoys"] },
    { keys: ["rangers", "rangers fc"], display: "Rangers", extra: ["Rangers FC"] },
    { keys: ["galatasaray", "galatasaray sk"], display: "Galatasaray", extra: ["Galatasaray SK", "Cim-Bom"] },
    { keys: ["fenerbahce", "fenerbahçe", "fenerbahce sk"], display: "Fenerbahçe", extra: ["Fenerbahce", "Fener"] },
    { keys: ["besiktas", "beşiktaş", "besiktas jk"], display: "Beşiktaş", extra: ["Besiktas", "Kara Kartallar"] },
    { keys: ["al nassr", "al-nassr"], display: "Al-Nassr", extra: ["Al Nassr", "Nassr"] },
    { keys: ["al hilal", "al-hilal", "al hilal saud fc"], display: "Al-Hilal", extra: ["Al Hilal", "Hilal"] },
  ];
  const map = new Map();
  for (const { keys, display, extra } of entries) {
    const aliasList = Array.isArray(extra) ? extra : [];
    for (const key of keys) {
      const n = k(key);
      if (n) map.set(n, { display, extraAliases: aliasList });
    }
  }
  return map;
}

function randomBetween(min?, max?) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

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

let cachedReverseCapitalQuestions = null;
let cachedReverseCapitalQuestionsAt = 0;

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

async function loadFootballTeamsFromApi(cfg?) {
  const now = Date.now();
  if (cachedTeams && now - cachedTeamsAt < TEAM_CACHE_TTL_MS)
    return cachedTeams;
  if (isSportsDbCoolingDown()) {
    return Array.isArray(cachedTeams) ? cachedTeams : [];
  }

  const apiBase = cfg?.guessTeam?.apiUrl || "https://www.thesportsdb.com/api/v1/json/123/search_all_teams.php?l=";
  const leagues = Array.isArray(cfg?.guessTeam?.leagues) && cfg.guessTeam.leagues.length ? cfg.guessTeam.leagues : DEFAULT_FOOTBALL_LEAGUES;
  const out = [];
  for (const league of leagues) {
    if (isSportsDbCoolingDown()) break;
    try {
      const url = `${apiBase}${encodeURIComponent(league)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const teams = Array.isArray(res?.data?.teams) ? res.data.teams : [];
      for (const team of teams) {
        if (!isLikelyFamousTeam(team, cfg)) continue;
        const name = team?.strTeam;
        const badge = team?.strBadge || null;
        if (!name || !badge) continue;
        const normKey = normalizeCountryName(name);
        const italian = TEAM_ITALIAN_MAP.get(normKey);
        const displayName = italian?.display ?? name;
        const aliasSources = [name, team?.strTeamShort, team?.strTeamAlternate, displayName, ...(italian?.extraAliases ?? [])].filter(Boolean);
        const aliases = buildAliases(aliasSources);
        if (!aliases.length) continue;
        out.push({ team: displayName, teamId: team?.idTeam ? String(team.idTeam) : null, league, answers: aliases, image: badge });
      }
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        if (Array.isArray(cachedTeams) && cachedTeams.length) return cachedTeams;
        return out;
      }
      warnMinigame(err);
    }
  }

  cachedTeams = out;
  cachedTeamsAt = now;
  return cachedTeams;
}

const DEFAULT_ONLY_FAMOUS_MIN_FANS = 50000;
const FALLBACK_MIN_FANS = 20000;
const MIN_SINGERS_AFTER_FILTER = 15;

async function loadSingersFromApi(cfg?) {
  const now = Date.now();
  if (cachedSingers && now - cachedSingersAt < SINGER_CACHE_TTL_MS)
    return cachedSingers;

  const apiUrl = cfg?.guessSinger?.apiUrl || "https://api.deezer.com/chart/0/artists?limit=100";
  const minFans = Number(cfg?.guessSinger?.onlyFamousMinFans ?? DEFAULT_ONLY_FAMOUS_MIN_FANS) || 0;
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const artist of list) {
      const name = artist?.name;
      const image = pickBestSingerImage(artist);
      if (!name) continue;
      const fans = Number(artist?.nb_fan ?? 0);
      if (minFans > 0 && fans < minFans) continue;
      out.push({ name, answers: buildAliases([name]), image });
    }
    if (minFans > 0 && out.length < MIN_SINGERS_AFTER_FILTER) {
      out.length = 0;
      const fallback = Number(cfg?.guessSinger?.fallbackMinFans ?? FALLBACK_MIN_FANS) || FALLBACK_MIN_FANS;
      for (const artist of list) {
        const name = artist?.name;
        const image = pickBestSingerImage(artist);
        if (!name) continue;
        if (Number(artist?.nb_fan ?? 0) < fallback) continue;
        out.push({ name, answers: buildAliases([name]), image });
      }
    }
  } catch (err) {
    warnMinigame(err);
  }
  cachedSingers = out;
  cachedSingersAt = now;
  return cachedSingers;
}

async function loadAlbumsFromApi(cfg?) {
  const now = Date.now();
  if (cachedAlbums && now - cachedAlbumsAt < ALBUM_CACHE_TTL_MS)
    return cachedAlbums;

  const onlyFamousArtists = cfg?.guessAlbum?.onlyFamousArtists !== false;
  let famousArtistNames = null;
  if (onlyFamousArtists) {
    const singers = await loadSingersFromApi(cfg);
    famousArtistNames = new Set(singers.map((s?) => normalizeCountryName(s?.name)).filter(Boolean));
  }

  const apiUrl = cfg?.guessAlbum?.apiUrl || "https://api.deezer.com/chart/0/albums?limit=100";
  const out = [];
  try {
    const res = await axios.get(apiUrl, { timeout: 15000 });
    const list = Array.isArray(res?.data?.data) ? res.data.data : [];
    for (const album of list) {
      const title = album?.title;
      const artist = album?.artist?.name || "Artista sconosciuto";
      const image = album?.cover_xl || album?.cover_big || album?.cover_medium || album?.cover || null;
      if (!title || !image) continue;
      if (onlyFamousArtists && famousArtistNames && !famousArtistNames.has(normalizeCountryName(artist)))
        continue;
      out.push({ album: title, artist, answers: buildAliases([title]), image });
    }
  } catch (err) {
    warnMinigame(err);
  }

  cachedAlbums = out;
  cachedAlbumsAt = now;
  return cachedAlbums;
}

function normalizePlayerGuess(raw?) {
  return normalizeCountryName(raw);
}

function buildCompactAlias(value?) {
  const normalized = normalizeCountryName(value);
  if (!normalized) return null;
  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length <= 1) return null;
  const compact = tokens.filter((t?) => t.length > 1).join(" ").trim();
  if (!compact || compact === normalized) return null;
  return compact;
}

function buildAliases(values = []) {
  const out = new Set();
  for (const value of values) {
    const normalized = normalizeCountryName(value);
    if (normalized) out.add(normalized);
    const compact = buildCompactAlias(value);
    if (compact) out.add(compact);
  }
  return Array.from(out.values());
}

const PLAYER_RETIRED_PATTERNS = [
  /\s*_Retired\s*$/i,
  /\s*_retired\s*$/i,
  /\s*\(Retired\)\s*$/i,
  /\s*\(retired\)\s*$/i,
  /\s*-\s*Retired\s*$/i,
  /\s*Retired\s*$/i,
];
const PLAYER_RETIRED_ITALIAN = " (Ritirato)";

function normalizePlayerDisplayName(str?) {
  if (!str || typeof str !== "string") return str;
  let out = String(str).trim();
  for (const re of PLAYER_RETIRED_PATTERNS) {
    out = out.replace(re, PLAYER_RETIRED_ITALIAN);
  }
  return out.trim() || str;
}

function buildPlayerAliases(player?) {
  const aliases = new Set();
  const add = (value?) => { const normalized = normalizePlayerGuess(value); if (normalized) aliases.add(normalized); };
  add(player?.strPlayer);
  add(normalizePlayerDisplayName(player?.strPlayer));
  add(player?.strKnownAs);
  add(player?.strNickname);
  return Array.from(aliases.values());
}

function isFootballPlayer(player?) {
  if (!player || typeof player !== "object") return false;
  const sportRaw = String(player?.strSport || "").trim().toLowerCase();
  const teamRaw = String(player?.strTeam || "").trim().toLowerCase();
  const leagueRaw = String(player?.strLeague || "").trim().toLowerCase();
  const footballSports = new Set(["soccer", "association football", "football", "calcio",]);
  if (sportRaw && !footballSports.has(sportRaw)) return false;
  const blockedHints = ["rugby", "nfl", "basket", "nba", "hockey", "baseball", "cricket", "volley", "handball",];
  const combined = `${teamRaw} ${leagueRaw}`;
  if (blockedHints.some((hint?) => combined.includes(hint))) return false;
  return true;
}

function isYouthReserveOrWomenTeam(team?) {
  const combined = [
    team?.strTeam,
    team?.strLeague,
    team?.strLeagueAlternate,
    team?.strDescriptionEN,
    team?.strDescriptionIT,
  ]
    .map((value?) => String(value || "").toLowerCase())
    .join(" ");
  return /(women|femminile|femenino|u17|u18|u19|u20|u21|u23|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scoreTeamPopularity(team?) {
  let score = 0;
  if (team?.strBadge) score += 3;
  if (team?.strLogo) score += 2;
  if (team?.strBanner) score += 1;
  if (team?.strFanart1 || team?.strFanart2 || team?.strFanart3 || team?.strFanart4) score += 2;
  if (team?.strStadiumThumb) score += 1;
  if (team?.strDescriptionEN || team?.strDescriptionIT) score += 1;
  if (team?.intFormedYear) score += 1;
  if (team?.strWebsite || team?.strFacebook || team?.strInstagram || team?.strTwitter || team?.strYoutube) score += 1;
  return score;
}

function isLikelyFamousTeam(team?, cfg?) {
  if (!team?.strTeam || !team?.strBadge) return false;
  if (isYouthReserveOrWomenTeam(team)) return false;
  const pinnedNames = Array.isArray(cfg?.guessTeam?.famousNames) ? cfg.guessTeam.famousNames.map((value?) => normalizeCountryName(value)).filter(Boolean) : [];
  const normalizedName = normalizeCountryName(team.strTeam);
  if (normalizedName && pinnedNames.includes(normalizedName)) return true;
  const minScore = Math.max(4, Number(cfg?.guessTeam?.leagueFamousMinScore || 6));
  return scoreTeamPopularity(team) >= minScore;
}

function isYouthOrReservePlayer(player?) {
  const combined = [
    player?.strTeam,
    player?.strLeague,
    player?.strPosition,
    player?.strDescriptionEN,
    player?.strDescriptionIT,
  ]
    .map((value?) => String(value || "").toLowerCase())
    .join(" ");
  return /(u17|u18|u19|u20|u21|u23|youth|academy|primavera|reserve|reserves|b team|under-\d+)/i.test(combined);
}

function scorePlayerPopularity(player?) {
  let score = 0;
  if (player?.strThumb) score += 4;
  if (player?.strCutout) score += 4;
  if (player?.strRender) score += 2;
  if (player?.strFanart1) score += 2;
  if (player?.strBanner) score += 1;
  if (player?.strDescriptionEN || player?.strDescriptionIT) score += 2;
  if (player?.strFacebook || player?.strInstagram || player?.strTwitter) score += 1;
  if (player?.strPosition) score += 1;
  if (player?.strNumber) score += 1;
  if (player?.strNationality) score += 1;
  return score;
}

function isLikelyFamousFootballPlayer(player?, minScore = 7) {
  if (!isFootballPlayer(player)) return false;
  if (!player?.strPlayer) return false;
  if (isYouthOrReservePlayer(player)) return false;
  if (!hasUsablePlayerImage(player)) return false;
  return scorePlayerPopularity(player) >= minScore;
}

function buildPlayerInfoFromApiPlayer(player?) {
  if (!player?.strPlayer) return null;
  const image = player.strThumb || player.strCutout || player.strRender || null;
  if (!image) return null;
  return {
    name: normalizePlayerDisplayName(player.strPlayer),
    team: player.strTeam || "Squadra sconosciuta",
    nationality: player.strNationality || "Nazionalità sconosciuta",
    image,
    aliases: buildPlayerAliases(player),
  };
}

async function loadLeaguePlayersFromApi(cfg?) {
  const now = Date.now();
  if (cachedLeaguePlayers && now - cachedLeaguePlayersAt < LEAGUE_PLAYER_CACHE_TTL_MS) return cachedLeaguePlayers;
  if (isSportsDbCoolingDown()) {
    return Array.isArray(cachedLeaguePlayers) ? cachedLeaguePlayers : [];
  }

  const teams = await loadFootballTeamsFromApi(cfg);
  const playerApiBase = cfg?.guessPlayer?.teamApiUrl || "https://www.thesportsdb.com/api/v1/json/123/lookup_all_players.php?id=";
  const minPopularityScore = Math.max(5, Number(cfg?.guessPlayer?.leagueFamousMinScore || 7));
  const out = [];
  const seenNames = new Set();

  for (const team of teams) {
    if (isSportsDbCoolingDown()) break;
    const teamId = String(team?.teamId || "").trim();
    if (!teamId) continue;
    try {
      const url = `${playerApiBase}${encodeURIComponent(teamId)}`;
      const res = await axios.get(url, { timeout: 15000 });
      const players = Array.isArray(res?.data?.player) ? res.data.player : [];
      for (const player of players) {
        if (!isLikelyFamousFootballPlayer(player, minPopularityScore)) continue;
        const normalizedName = normalizePlayerGuess(player?.strPlayer);
        if (!normalizedName || seenNames.has(normalizedName)) continue;
        const info = buildPlayerInfoFromApiPlayer(player);
        if (!info) continue;
        seenNames.add(normalizedName);
        out.push(info);
      }
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        if (Array.isArray(cachedLeaguePlayers) && cachedLeaguePlayers.length) return cachedLeaguePlayers;
        return out;
      }
      warnMinigame(err);
    }
  }

  cachedLeaguePlayers = out;
  cachedLeaguePlayersAt = now;
  return cachedLeaguePlayers;
}

async function fetchPlayerInfo(cfg?, name?) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase || !name) return null;
  const url = `${apiBase}${encodeURIComponent(name)}`;
  try {
    if (isSportsDbCoolingDown()) return null;
    const res = await axios.get(url, { timeout: 15000 });
    const players = res?.data?.player;
    if (!Array.isArray(players) || players.length === 0) return null;
    const filteredPlayers = players.filter((p?) => isFootballPlayer(p));
    if (!filteredPlayers.length) return null;
    const source = filteredPlayers;
    const player = source.find((p?) => (p?.strThumb || p?.strCutout) && p?.strPlayer) || source[0];
    if (!player?.strPlayer) return null;
    if (!player.strThumb && !player.strCutout) return null;
    return {
      name: normalizePlayerDisplayName(player.strPlayer),
      team: player.strTeam || "Squadra sconosciuta",
      nationality: player.strNationality || "Nazionalità sconosciuta",
      image: player.strThumb || player.strCutout || null,
      aliases: buildPlayerAliases(player),
    };
  } catch (err) {
    if (isThesportsdb429(err)) {
      noteSportsDb429(err);
      return null;
    }
    warnMinigame(err);
    return null;
  }
}

async function fetchPlayerFromRandomLetter(cfg?) {
  const apiBase = cfg?.guessPlayer?.apiUrl;
  if (!apiBase) return null;
  if (isSportsDbCoolingDown()) return null;
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if (isSportsDbCoolingDown()) return null;
    const letter = letters[randomBetween(0, letters.length - 1)];
    const url = `${apiBase}${encodeURIComponent(letter)}`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const players = res?.data?.player;
      if (!Array.isArray(players) || players.length === 0) continue;
      const filteredPlayers = players.filter((p?) => isFootballPlayer(p));
      if (!filteredPlayers.length) continue;
      const source = filteredPlayers;
      const withImage = source.filter((p?) => p?.strThumb || p?.strCutout);
      const pool = withImage.length ? withImage : source;
      const player = pool[randomBetween(0, pool.length - 1)];
      if (!player?.strPlayer) continue;
      if (!player.strThumb && !player.strCutout) continue;
      return {
        name: normalizePlayerDisplayName(player.strPlayer),
        team: player.strTeam || "Squadra sconosciuta",
        nationality: player.strNationality || "Nazionalità sconosciuta",
        image: player.strThumb || player.strCutout || null,
        aliases: buildPlayerAliases(player),
      };
    } catch (err) {
      if (isThesportsdb429(err)) {
        noteSportsDb429(err);
        return null;
      }
      warnMinigame(err);
    }
  }
  return null;
}

async function fetchFamousPlayer(cfg?) {
  const customNames = Array.isArray(cfg?.guessPlayer?.famousNames) ? cfg.guessPlayer.famousNames : [];
  const names = customNames.map((name?) => String(name || "").trim()).filter(Boolean);
  if (!names.length) return null;

  const maxAttempts = Math.min(10, names.length);
  const used = new Set();
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    let pick = null;
    for (let guard = 0; guard < 20; guard += 1) {
      const candidate = names[randomBetween(0, names.length - 1)];
      if (!used.has(candidate)) {
        pick = candidate;
        used.add(candidate);
        break;
      }
    }
    if (!pick) break;
    const info = await fetchPlayerInfo(cfg, pick);
    if (info?.name && info?.image) return info;
  }
  return null;
}

async function fetchLeagueFamousPlayer(cfg?) {
  const players = await loadLeaguePlayersFromApi(cfg);
  if (!players.length) return null;
  return players[randomBetween(0, players.length - 1)] || null;
}

async function fetchRandomSong(cfg?) {
  const apiBase = cfg?.guessSong?.apiUrl;
  if (!apiBase) return null;
  const popularTerms = Array.isArray(cfg?.guessSong?.popularTerms) && cfg.guessSong.popularTerms.length ? cfg.guessSong.popularTerms : ["the weeknd", "dua lipa", "ed sheeran", "drake", "ariana grande", "taylor swift", "billie eilish", "maneskin", "elodie", "sfera ebbasta", "thasup", "bad bunny", "eminem", "coldplay", "maroon 5", "bruno mars", "adele", "beyoncé", "rihanna", "justin bieber", "shawn mendes", "harry styles", "the chainsmokers", "david guetta", "calvin harris", "marco mengoni", "fedez", "j-ax", "ghali", "salmo", "lazza", "madame", "rosa chemical", "tananai", "blanco", "ultimo", "lorenzo fragola", "laura pausini", "eros ramazzotti", "vasco rossi", "ligabue", "tiziano ferro", "jovanotti", "giorgia", "alessandra amoroso", "articolo 31", "gemitaiz", "caparezza",];
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const term = popularTerms[randomBetween(0, popularTerms.length - 1)];
    const url = `${apiBase}${encodeURIComponent(term)}&entity=song&limit=50`;
    try {
      const res = await axios.get(url, { timeout: 15000 });
      const results = Array.isArray(res?.data?.results) ? res.data.results : [];
      const songs = results.filter((item?) => item?.trackName && item?.artistName && item?.previewUrl,);
      if (!songs.length) continue;
      const song = songs[randomBetween(0, songs.length - 1)];
      const artwork = song.artworkUrl100 ? song.artworkUrl100.replace("100x100bb", "600x600bb") : null;
      const genre = song.primaryGenreName || "Genere sconosciuto";
      const artistCountry = await fetchArtistCountry(cfg, song.artistName);
      return {
        title: song.trackName,
        artist: song.artistName,
        album: song.collectionName || "Album sconosciuto",
        artwork,
        genre,
        artistCountry: artistCountry || "Nazionalità sconosciuta",
        previewUrl: song.previewUrl || null,
      };
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

const POPULAR_SONG_TOP_PER_SOURCE = 50;
const DEFAULT_POPULAR_FEEDS = [
  "https://itunes.apple.com/it/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/us/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/gb/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/fr/rss/topsongs/limit=100/json",
  "https://itunes.apple.com/de/rss/topsongs/limit=100/json",
];

async function loadPopularSongList(cfg?) {
  const now = Date.now();
  if (cachedSongs && now - cachedSongsAt < SONG_CACHE_TTL_MS)
    return cachedSongs;
  const all = [];
  const topN = Math.max(20, Number(cfg?.guessSong?.topPerSource ?? POPULAR_SONG_TOP_PER_SOURCE) || POPULAR_SONG_TOP_PER_SOURCE);

  const deezerChartUrl = cfg?.guessSong?.deezerChartUrl || "https://api.deezer.com/chart/0/tracks?limit=100";
  try {
    const chartRes = await axios.get(deezerChartUrl, { timeout: 15000 });
    const tracks = Array.isArray(chartRes?.data?.data) ? chartRes.data.data : [];
    const slice = tracks.slice(0, topN);
    for (const track of slice) {
      if (!track?.title || !track?.artist?.name) continue;
      all.push({
        source: "deezer",
        id: String(track.id || ""),
        title: track.title,
        artist: track.artist.name,
        album: track?.album?.title || "Album sconosciuto",
        artwork:
          track?.album?.cover_xl ||
          track?.album?.cover_big ||
          track?.album?.cover_medium ||
          null,
        genre: "Popolare",
        previewUrl: track.preview || null,
      });
    }
  } catch (err) {
    warnMinigame(err);
  }

  const feeds = (Array.isArray(cfg?.guessSong?.popularFeeds) as any)?.length ? cfg.guessSong.popularFeeds : DEFAULT_POPULAR_FEEDS;
  for (const feed of feeds) {
    if (!feed) continue;
    try {
      const res = await axios.get(feed, { timeout: 15000 });
      const entries = Array.isArray(res?.data?.feed?.entry) ? res.data.feed.entry : [];
      const sliceEntries = entries.slice(0, topN);
      for (const entry of sliceEntries) {
        const id = entry?.id?.attributes?.["im:id"] || entry?.id?.attributes?.im_id;
        const title = entry?.["im:name"]?.label || entry?.title?.label;
        const artist = entry?.["im:artist"]?.label || entry?.["im:artist"]?.name;
        const images = Array.isArray(entry?.["im:image"]) ? entry["im:image"] : [];
        const artwork = images.length ? images[images.length - 1].label : null;
        if (!id || !title || !artist) continue;
        all.push({
          source: "itunes_feed",
          id: String(id),
          title,
          artist,
          artwork,
        });
      }
    } catch (err) {
      warnMinigame(err);
    }
  }
  cachedSongs = all;
  cachedSongsAt = now;
  return cachedSongs;
}

async function fetchPopularSong(cfg?) {
  const list = await loadPopularSongList(cfg);
  if (!list.length) return null;
  const onlyWithPreview = list.filter((item?) => item?.previewUrl);
  const pool = onlyWithPreview.length ? onlyWithPreview : list;
  const pick = pool[randomBetween(0, pool.length - 1)];
  if (!pick?.id) return null;

  if (pick.source === "deezer") {
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: pick.title,
      artist: pick.artist,
      album: pick.album || "Album sconosciuto",
      artwork: pick.artwork || null,
      genre: pick.genre || "Genere sconosciuto",
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: pick.previewUrl || null,
    };
  }

  const lookupUrl = `https://itunes.apple.com/lookup?id=${encodeURIComponent(pick.id)}`;
  try {
    const res = await axios.get(lookupUrl, { timeout: 15000 });
    const item = Array.isArray(res?.data?.results) ? res.data.results[0] : null;
    if (!item?.trackName || !item?.artistName) return null;
    const genre = item?.primaryGenreName || "Genere sconosciuto";
    const artistCountry = await fetchArtistCountry(cfg, pick.artist);
    return {
      title: item?.trackName || pick.title,
      artist: item?.artistName || pick.artist,
      album: item?.collectionName || "Album sconosciuto",
      artwork: item?.artworkUrl100
        ? item.artworkUrl100.replace("100x100bb", "600x600bb")
        : pick.artwork,
      genre,
      artistCountry: artistCountry || "Nazionalità sconosciuta",
      previewUrl: item?.previewUrl || null,
    };
  } catch {
    return null;
  }
}

function normalizeArtistLabel(value?) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\((feat|ft)\.?[^)]*\)/g, " ")
    .replace(/\b(feat|ft)\.?[\s\S]*$/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildArtistSearchTerms(artistName?) {
  const raw = String(artistName || "").trim();
  const normalized = normalizeArtistLabel(raw);
  const terms = new Set();
  if (raw) terms.add(raw);
  if (normalized && normalized !== raw.toLowerCase()) terms.add(normalized);
  return Array.from(terms).filter(Boolean);
}

function pickBestArtistCandidate(candidates?, artistName?) {
  if (!Array.isArray(candidates) || !candidates.length) return null;
  const target = normalizeArtistLabel(artistName);
  const scored = candidates.map((artist?) => { const artistLabel = normalizeArtistLabel(artist?.name); const hasCountry = Boolean(artist?.country || artist?.area?.name); const mbScore = Number(artist?.score || 0); let nameScore = 0; if (artistLabel && target) { if (artistLabel === target) nameScore = 120; else if (artistLabel.includes(target) || target.includes(artistLabel)) nameScore = 60; } const countryBonus = hasCountry ? 30 : 0; return { artist, score: mbScore + nameScore + countryBonus }; }).sort((a?, b?) => b.score - a.score);
  return scored[0]?.artist || null;
}

async function fetchArtistCountry(cfg?, artistName?) {
  if (!artistName) return null;
  const apiBase = cfg?.guessSong?.artistApiUrl || "https://musicbrainz.org/ws/2/artist/?query=artist:";
  const terms = buildArtistSearchTerms(artistName);
  const urls = [];

  for (const term of terms) {
    urls.push(`${apiBase}${encodeURIComponent((term as any))}&fmt=json&limit=8`);
  }
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(artistName)}&fmt=json&limit=8`,
  );
  urls.push(
    `https://musicbrainz.org/ws/2/artist/?query=artist:%22${encodeURIComponent(artistName)}%22&fmt=json&limit=8`,
  );

  const seen = new Set();
  for (const url of urls) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    try {
      const res = await axios.get(url, { timeout: 15000, headers: { "User-Agent": "ViniliCaffeBot/1.0 (discord bot)", }, });
      const candidates = Array.isArray(res?.data?.artists) ? res.data.artists : [];
      const artist = pickBestArtistCandidate(candidates, artistName);
      const country = artist?.country || artist?.area?.name || null;
      if (country) return country;
    } catch (err) {
      warnMinigame(err);
    }
  }
  return null;
}

export = { randomBetween, loadCountryList, loadCapitalQuestionBank, loadReverseCapitalQuestionBank, loadRegionCapitalQuestionBank, loadFootballTeamsFromApi, loadSingersFromApi, loadAlbumsFromApi, normalizePlayerGuess, buildCompactAlias, buildAliases, fetchPlayerFromRandomLetter, fetchFamousPlayer, fetchLeagueFamousPlayer, fetchRandomSong, fetchPopularSong };
