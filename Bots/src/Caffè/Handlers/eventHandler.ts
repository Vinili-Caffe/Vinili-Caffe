const { installEventLoader } = require("../../shared/runtime/createEventLoader") as typeof import("../../shared/runtime/createEventLoader");

export = (client?) => {
  installEventLoader(client);
};
