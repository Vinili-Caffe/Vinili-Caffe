const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher") as typeof import("../Utils/Prefix/prefixDispatcher");
const { handleTtsMessage } = require("../Services/TTS/ttsService") as typeof import("../Services/TTS/ttsService");
const { recordReminderActivity } = require("../Services/Community/chatReminderService") as typeof import("../Services/Community/chatReminderService");
const { handleStanzaPanelPromptMessageCreate } = require("../Services/Voice/stanzaVoiceRoomsService") as typeof import("../Services/Voice/stanzaVoiceRoomsService");
const { handleVoiceTranscriptionMessage } = require("../Services/Voice/voiceTranscriptionService") as typeof import("../Services/Voice/voiceTranscriptionService");
const { ingestMarkovMessageCreate } = require("../Services/Community/markovMessageCollectorService") as typeof import("../Services/Community/markovMessageCollectorService");
const { handleMarkovAutoSendMessageCreate, handleMarkovReplyMessageCreate } = require("../Services/Community/markovAutoSendService") as typeof import("../Services/Community/markovAutoSendService");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
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