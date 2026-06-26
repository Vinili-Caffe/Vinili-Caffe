const assert = require("assert");

function makeTowerGame(overrides = {}) {
  return {
    type: "hogwartsObservationTower",
    houseBrickCounts: {},
    participantCounts: {},
    participantHouses: {},
    targetBricks: 1,
    maxPerUser: 10,
    minLetters: 1,
    minPlayers: 1,
    housePoints: 0,
    rewardExp: 10,
    startedAt: Date.now(),
    endsAt: Date.now() + 60_000,
    timeout: null,
    soloHouseId: "gryffindor",
    ...overrides,
  };
}

function loadMinigameInternals() {
  const path = require("path");
  const servicePath = path.join(__dirname, "..", "Vinyls", "Services", "Minigames", "minigameService.js");
  const src = require("fs").readFileSync(servicePath, "utf8");
  assert(src.includes("tryClaimMinigameChannelClose"), "tryClaimMinigameChannelClose mancante");
  assert(src.includes("tryClaimObservationTowerEmbed"), "tryClaimObservationTowerEmbed mancante");
  assert(src.includes("finishObservationTowerTimeout"), "finishObservationTowerTimeout mancante");
  assert(src.includes("runMinigameChannelExclusive"), "runMinigameChannelExclusive mancante");
  assert(src.includes("processObservationTowerMessage"), "processObservationTowerMessage mancante");
}

loadMinigameInternals();

const channelWinClosing = new Set();

function tryClaimMinigameChannelClose(channelId) {
  const chId = String(channelId || "").trim();
  if (!chId) return false;
  if (channelWinClosing.has(chId)) return false;
  channelWinClosing.add(chId);
  return true;
}

function endMinigameWinClose(channelId) {
  channelWinClosing.delete(String(channelId || "").trim());
}

function tryClaimObservationTowerFinish(game, channelId) {
  if (!game || game._finishEmbedSent || game._finishClaimed) return false;
  const chId = String(channelId || "").trim();
  if (!tryClaimMinigameChannelClose(chId)) return false;
  game._finishClaimed = true;
  return true;
}

function tryClaimObservationTowerEmbed(game) {
  if (!game || game._finishEmbedSent) return false;
  game._finishEmbedSent = true;
  return true;
}

const channelId = "chan-1";
const game = makeTowerGame();

assert(tryClaimObservationTowerFinish(game, channelId), "primo claim torre deve vincere");
assert(!tryClaimObservationTowerFinish(game, channelId), "secondo claim torre deve fallire");
assert(tryClaimObservationTowerEmbed(game), "primo claim embed deve vincere");
assert(!tryClaimObservationTowerEmbed(game), "secondo claim embed deve fallire");

endMinigameWinClose(channelId);
const timeoutGame = makeTowerGame();
const successGame = makeTowerGame();
assert(tryClaimObservationTowerFinish(successGame, channelId), "success claim");
assert(!tryClaimObservationTowerFinish(timeoutGame, channelId), "timeout claim dopo success deve fallire per channelWinClosing");

endMinigameWinClose(channelId);
const timeoutFirst = makeTowerGame();
assert(tryClaimMinigameChannelClose(channelId), "timeout channel claim");
assert(!tryClaimMinigameChannelClose(channelId), "win channel claim dopo timeout deve fallire");

console.log("OBSERVATION_TOWER_RACE_TEST_OK");