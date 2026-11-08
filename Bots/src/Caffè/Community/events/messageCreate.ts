const { dispatchPrefixMessage } = require("../../core/prefixDispatcher") as typeof import("../../core/prefixDispatcher");
const { handleTtsMessage } = require("../../../shared/tts/services/ttsService") as typeof import("../../../shared/tts/services/ttsService");
const {
  handleVoiceTranscriptionMessage,
} = require("../../../Vinili/Voice/services/voiceTranscriptionService") as typeof import("../../../Vinili/Voice/services/voiceTranscriptionService");

export = {
  name: "messageCreate",
  async execute(message?, client?) {
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    /* TTS + trascrizione vocali fuori dal critical path (come legacy Coffee). */
    if (!isEditedPrefixExecution) {
      const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
      setImmediate(() => {
        handleTtsMessage(message, client, safePrefix).catch((error?) => {
          global.logger?.error?.("[TTS ERROR]", error);
        });
        handleVoiceTranscriptionMessage(message, client).catch((error?) => {
          global.logger?.error?.("[VOICE TRANSCRIBE ERROR]", error);
        });
      });
    }
    await dispatchPrefixMessage(message, client);
  },
};
