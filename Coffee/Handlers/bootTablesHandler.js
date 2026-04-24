const path = require("path");
const { logBootTable } = require("../../shared/runtime/bootTableRuntime");

module.exports = (client) => {
  client.logBootTables = () => {
    logBootTable(["Handlers", "Triggers", "Services", "Schemas", "Prefix", "Events"], path.join(__dirname, ".."));
  };
};