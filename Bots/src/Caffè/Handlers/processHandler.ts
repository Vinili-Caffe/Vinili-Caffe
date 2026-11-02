const { installProcessHandlers } = require("../../shared/handlers/processHandlers") as typeof import("../../shared/handlers/processHandlers");

export = function installCoffeeProcessHandlers() {
  installProcessHandlers({
    flag: "__viniliTestProcessHandlersInstalled",
    ignoreWarnings: true,
    exitDelayMs: 200,
  });
};
