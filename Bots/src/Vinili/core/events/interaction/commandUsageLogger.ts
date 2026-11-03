const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { createCommandUsageLogger } = require("../../../../shared/logging/createCommandUsageLogger") as typeof import("../../../../shared/logging/createCommandUsageLogger");
export = createCommandUsageLogger(IDs, { truncateFields: true });
