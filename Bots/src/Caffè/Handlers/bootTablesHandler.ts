const path = require("path") as typeof import("path");
const { logBootTable } = require("../../shared/runtime/bootTableRuntime") as typeof import("../../shared/runtime/bootTableRuntime");

export = (client?) => {
  client.logBootTables = () => {
    logBootTable(
      ["Handlers", "Community", "Voice", "Moderation", "Staff", "Events", "core", "Config"],
      path.join(__dirname, ".."),
    );
  };
};