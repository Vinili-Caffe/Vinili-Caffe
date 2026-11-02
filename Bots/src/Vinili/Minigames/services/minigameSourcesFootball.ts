/** Minigiochi: squadre e calciatori (TheSportsDB). */
const axios = require("axios") as any;
const { warnMinigame, noteSportsDb429, isSportsDbCoolingDown } = require("./minigameLog") as typeof import("./minigameLog");
const { normalizeCountryName, hasUsablePlayerImage } = require("./minigameImages") as typeof import("./minigameImages");
const { randomBetween, buildAliases, normalizePlayerGuess } = require("./minigameSourcesShared") as typeof import("./minigameSourcesShared");

let cachedTeams = null;
let cachedTeamsAt = 0;
const TEAM_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
let cachedLeaguePlayers = null;
let cachedLeaguePlayersAt = 0;
const LEAGUE_PLAYER_CACHE_TTL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_FOOTBALL_LEAGUES = ["Italian Serie A", "English Premier League", "Spanish La Liga", "German Bundesliga", "French Ligue 1", "Dutch Eredivisie", "Belgian Pro League", "Portuguese Primeira Liga", "Saudi Pro League", "Turkish Super Lig", "Italian Serie B", "English League Championship", "American Major League Soccer",];

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
const TEAM_ITALIAN_MAP = getTeamItalianMap();

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

export = { loadFootballTeamsFromApi, fetchPlayerFromRandomLetter, fetchFamousPlayer, fetchLeagueFamousPlayer };
