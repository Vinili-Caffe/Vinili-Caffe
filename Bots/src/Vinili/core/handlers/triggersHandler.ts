const path = require("path") as typeof import("path");
const { installTriggersLoader } = require("../../../shared/runtime/createTriggersLoader") as typeof import("../../../shared/runtime/createTriggersLoader");

export = (client?) => {
  installTriggersLoader(client, {
    extraFiles: (root?) => [
      path.join(root, "Community", "discord", "panels", "startupPanels.js"),
    ],
  });
};
