const path = require("path");
const { logBootTable } = require("../../shared/runtime/bootTableRuntime");

module.exports = (client) => {
  client.logBootTables = () => {
    logBootTable(["Handlers", "Services", "Utils", "Schemas"], path.join(__dirname, ".."));
  };
};
