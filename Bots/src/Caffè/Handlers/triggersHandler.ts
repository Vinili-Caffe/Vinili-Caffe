const { installTriggersLoader } = require("../../shared/runtime/createTriggersLoader") as typeof import("../../shared/runtime/createTriggersLoader");

export = (client?) => {
  installTriggersLoader(client);
};
