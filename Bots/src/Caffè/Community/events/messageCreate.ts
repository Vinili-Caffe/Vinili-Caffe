const { dispatchPrefixMessage } = require("../../core/prefixDispatcher") as typeof import("../../core/prefixDispatcher");
const { handleTtsMessage } = require("../../../shared/tts/services/ttsService") as typeof import("../../../shared/tts/services/ttsService");

export = {
  name: "messageCreate",
  async execute(message?, client?) {
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    if (!isEditedPrefixExecution) {
      const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
      setImmediate(() => {
        handleTtsMessage(message, client, safePrefix).catch((error?) => {
          global.logger?.error?.("[TTS ERROR]", error);
        });
      });
    }
    await dispatchPrefixMessage(message, client);
  },
};
