const path = require("path") as typeof import("path");
const { logBootTable } = require("../../shared/runtime/bootTableRuntime") as typeof import("../../shared/runtime/bootTableRuntime");

export = (client?) => {
  client.logBootTables = () => {
    logBootTable(["Handlers", "Services", "Utils", "Schemas"], path.join(__dirname, ".."));
  };
};