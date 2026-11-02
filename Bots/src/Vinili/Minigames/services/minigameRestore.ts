/** Minigiochi: ripristino del gioco in corso dopo un riavvio del bot (per ogni tipo). */
const core = require("./minigameRestoreCore") as typeof import("./minigameRestoreCore");

export = {
  restoreActiveGames: core.restoreActiveGames,
};
