const logs = require("../Moderation/utils/logs") as typeof import("../Moderation/utils/logs");
const { installProcessHandlers } = require("../../shared/handlers/processHandlers") as typeof import("../../shared/handlers/processHandlers");

export = () => {
  installProcessHandlers({
    flag: "__viniliProcessHandlersInstalled",
    logError: (message?) => logs.error(`[ERROR] ${message}`),
    logWarn: (message?) => logs.warn(String(message)),
    logInfo: (message?) => logs.success(String(message)),
    onBeforeFlush: async () => {
      try {
        require("../Community/services/activityService").suspendAllLiveVoiceExp();
      } catch {}
      try {
        require("../Staff/services/staffAutoValutazioniService").suspendStaffAutoValutazioni();
      } catch {}
    },
    onAfterFlush: async (signal?) => {
      try {
        const { closeMongoGraceful } = require("../../shared/db/mongoConnect") as typeof import("../../shared/db/mongoConnect");
        await closeMongoGraceful(signal);
      } catch (err) {
        logs.error(`[ERROR] Mongo close failed: ${err?.stack || err}`);
      }
    },
    exitDelayMs: 150,
  });
};
