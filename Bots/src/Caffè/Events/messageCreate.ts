const { dispatchPrefixMessage } = require("../core/prefixDispatcher") as typeof import("../core/prefixDispatcher");
const { handleTtsMessage } = require("../../shared/tts/services/ttsService") as typeof import("../../shared/tts/services/ttsService");
const { recordReminderActivity } = require("../Community/services/chatReminderService") as typeof import("../Community/services/chatReminderService");
const { handleStanzaPanelPromptMessageCreate } = require("../Voice/services/stanzaVoiceRoomsService") as typeof import("../Voice/services/stanzaVoiceRoomsService");
const { handleVoiceTranscriptionMessage } = require("../Voice/services/voiceTranscriptionService") as typeof import("../Voice/services/voiceTranscriptionService");
const { ingestMarkovMessageCreate } = require("../Community/services/markovMessageCollectorService") as typeof import("../Community/services/markovMessageCollectorService");
const { handleMarkovAutoSendMessageCreate, handleMarkovReplyMessageCreate } = require("../Community/services/markovAutoSendService") as typeof import("../Community/services/markovAutoSendService");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const REMINDER_CHANNEL_ID = IDs.channels?.chat || null;

export = {
  name: "messageCreate",
  async execute(message?, client?) {
    if (!message.author?.bot && message.guild && REMINDER_CHANNEL_ID && String(message.channelId) === String(REMINDER_CHANNEL_ID)) {
      try {
        recordReminderActivity(message.channelId);
      } catch (error) {
        global.logger?.error?.("[REMINDER ACTIVITY ERROR]", error);
      }
    }
    try {
      const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
      const content = String(message.content || "").trim();
      const isPrefixCommand = content.startsWith(safePrefix);
      if (!isPrefixCommand && !message.author?.bot && message.guild) {
        if (await handleStanzaPanelPromptMessageCreate(message)) return;
      }
    } catch (error) {
      global.logger?.error?.("[STANZA PANEL MESSAGE ERROR]", error);
    }
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    /* perfP2: TTS + transcribe fuori dal critical path (come Vinyls) */
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
    if (!message.author?.bot && message.guild) {
      void ingestMarkovMessageCreate(message, client).then(async () => {
        const replied = await handleMarkovReplyMessageCreate(message, client);
        if (!replied) {
          void handleMarkovAutoSendMessageCreate(message, client);
        }
      });
    }
    await dispatchPrefixMessage(message, client);
  },
};