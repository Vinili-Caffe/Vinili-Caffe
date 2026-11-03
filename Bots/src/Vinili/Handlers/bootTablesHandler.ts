const path = require("path") as typeof import("path");
const { installBootTables } = require("../../shared/runtime/createBootTablesInstaller") as typeof import("../../shared/runtime/createBootTablesInstaller");

export = (client?) => {
  installBootTables(
    client,
    [
      "Handlers",
      "Community",
      "Moderation",
      "Security",
      "Staff",
      "Partner",
      "MultiGuild",
      "Minigames",
      "Level",
      "Giveaway",
      "Stats",
      "Backup",
      "Events",
      "Config",
      "core",
      "site",
    ],
    path.join(__dirname, ".."),
  );
};
