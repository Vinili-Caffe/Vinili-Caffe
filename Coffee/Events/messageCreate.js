const { dispatchPrefixMessage } = require("../Utils/Prefix/prefixDispatcher");
const { handleTtsMessage } = require("../Services/TTS/ttsService");
const { recordReminderActivity } = require("../Services/Community/chatReminderService");
const { handleStanzaPanelPromptMessageCreate } = require("../Services/Voice/stanzaVoiceRoomsService");
const { handleVoiceTranscriptionMessage } = require("../Services/Voice/voiceTranscriptionService");
const IDs = require("../Utils/Config/ids");
const REMINDER_CHANNEL_ID = IDs.channels?.chat || null;

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    if (!message.author?.bot && message.guild && REMINDER_CHANNEL_ID && String(message.channelId) === String(REMINDER_CHANNEL_ID)) {
      try {
        recordReminderActivity(message.channelId);
      } catch (error) {
        global.logger?.error?.("[REMINDER ACTIVITY ERROR]", error);
      }
    }
    try {
      if (await handleStanzaPanelPromptMessageCreate(message)) return;
    } catch (error) {
      global.logger?.error?.("[STANZA PANEL MESSAGE ERROR]", error);
    }
    const isEditedPrefixExecution = Boolean(message?.__fromMessageUpdatePrefix);
    try {
      if (!isEditedPrefixExecution) {
        const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
        await handleTtsMessage(message, client, safePrefix);
      }
    } catch (error) {
      global.logger?.error?.("[TTS ERROR]", error);
    }
    try {
      if (!isEditedPrefixExecution) {
        await handleVoiceTranscriptionMessage(message, client);
      }
    } catch (error) {
      global.logger?.error?.("[VOICE TRANSCRIBE ERROR]", error);
    }
    await dispatchPrefixMessage(message, client);
  },
};