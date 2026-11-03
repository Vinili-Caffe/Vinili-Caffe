const path = require("path") as typeof import("path");
const { installBootTables } = require("../../../shared/runtime/createBootTablesInstaller") as typeof import("../../../shared/runtime/createBootTablesInstaller");

export = (client?) => {
  installBootTables(
    client,
    ["Community", "Voice", "Moderation", "Staff", "core", "Config", "site"],
    path.join(__dirname, "..", ".."),
  );
};
