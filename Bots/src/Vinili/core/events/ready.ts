const { execute } = require("./ready/readyExecute") as typeof import("./ready/readyExecute");

export = {
  name: "clientReady",
  once: true,
  execute,
};
