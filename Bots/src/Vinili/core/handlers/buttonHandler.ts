const path = require("path") as typeof import("path");
const { createButtonHandlersLoader } = require("../../../shared/runtime/createButtonHandlersLoader") as typeof import("../../../shared/runtime/createButtonHandlersLoader");

const REMOVED_BUTTON_HANDLER_NAMES = new Set([
  "balGui",
  "incomeClaimGui",
  "blackjackGui",
  "coinflipGui",
  "duelGui",
  "robGui",
  "rouletteGui",
  "rpsGui",
  "scratchGui",
  "shopGui",
  "slotsGui",
  "trisGui",
  "classificaToggle",
  "myquoteDelete",
  "myrepostDelete",
  "myclipDelete",
  "myquotePagination",
  "myrepostPagination",
  "myclipPagination",
  "colorsCommand",
  "candidature",
  "ticket",
  "websiteUnbanSite",
  "websiteUnmuteSite",
  "resoconto",
  "profile",
]);

export = createButtonHandlersLoader({
  removedHandlerNames: REMOVED_BUTTON_HANDLER_NAMES,
  resolveDirs: () => {
    const root = path.resolve(__dirname, "..", "..");
    return [
      path.join(root, "Partner", "discord", "buttons"),
      path.join(root, "Stats", "discord", "buttons"),
      path.join(root, "Giveaway", "discord", "buttons"),
      path.join(root, "Minigames", "discord", "buttons"),
      path.join(root, "Backup", "discord", "buttons"),
      path.join(root, "Level", "discord", "buttons"),
      path.join(root, "Security", "discord", "buttons"),
      path.join(root, "Community", "discord", "buttons"),
      path.resolve(__dirname, "..", "..", "..", "shared", "music", "discord", "buttons"),
      path.join(root, "Moderation", "discord", "buttons"),
      path.join(root, "MultiGuild", "Buttons"),
    ];
  },
});
