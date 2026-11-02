/** Minigiochi: dati presi da fuori (paesi, capitali, squadre, giocatori, cantanti, album, canzoni) con le loro cache. */
const shared = require("./minigameSourcesShared") as typeof import("./minigameSourcesShared");
const countries = require("./minigameSourcesCountries") as typeof import("./minigameSourcesCountries");
const football = require("./minigameSourcesFootball") as typeof import("./minigameSourcesFootball");
const music = require("./minigameSourcesMusic") as typeof import("./minigameSourcesMusic");

export = {
  randomBetween: shared.randomBetween,
  loadCountryList: countries.loadCountryList,
  loadCapitalQuestionBank: countries.loadCapitalQuestionBank,
  loadReverseCapitalQuestionBank: countries.loadReverseCapitalQuestionBank,
  loadRegionCapitalQuestionBank: countries.loadRegionCapitalQuestionBank,
  loadFootballTeamsFromApi: football.loadFootballTeamsFromApi,
  loadSingersFromApi: music.loadSingersFromApi,
  loadAlbumsFromApi: music.loadAlbumsFromApi,
  normalizePlayerGuess: shared.normalizePlayerGuess,
  buildCompactAlias: shared.buildCompactAlias,
  buildAliases: shared.buildAliases,
  fetchPlayerFromRandomLetter: football.fetchPlayerFromRandomLetter,
  fetchFamousPlayer: football.fetchFamousPlayer,
  fetchLeagueFamousPlayer: football.fetchLeagueFamousPlayer,
  fetchRandomSong: music.fetchRandomSong,
  fetchPopularSong: music.fetchPopularSong,
};
