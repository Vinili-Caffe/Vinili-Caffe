const { createConsoleLogs } = require("../../../shared/logging/consoleLogs") as typeof import("../../../shared/logging/consoleLogs");

export = createConsoleLogs({ withBuffers: true });
