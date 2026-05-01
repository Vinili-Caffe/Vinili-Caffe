const IDs = require("../Utils/Config/ids");
const { leaveTtsGuild } = require("../Services/TTS/ttsService");
const {
  finalizeStanzaVisitorVoiceSessionIfLeft,
  handleStanzaVoiceLobbyJoin,
  handleStanzaVoiceOccupied,
  handleStanzaVoiceEmpty,
} = require("../Services/Voice/stanzaVoiceRoomsService");

const ALLOWED_GUILD_IDS = new Set([IDs.guilds ?. main,IDs.guilds ?. test].filter(Boolean).map((id)=>String(id)),);

module.exports = {
  name: "voiceStateUpdate",
  async execute(oldState, newState, client) {
    const guild = newState?.guild || oldState?.guild;
    if (!guild) return;
    if (ALLOWED_GUILD_IDS.size && !ALLOWED_GUILD_IDS.has(String(guild.id || ""))) {
      return;
    }
    if (!client?.user?.id) return;

    try {
      await finalizeStanzaVisitorVoiceSessionIfLeft(oldState, newState);
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza visitor flush:", error?.message || error);
    }
    try {
      await handleStanzaVoiceLobbyJoin(oldState, newState, client);
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza lobby join:", error?.message || error);
    }
    try {
      await handleStanzaVoiceOccupied(oldState, newState);
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza occupied:", error?.message || error);
    }
    try {
      await handleStanzaVoiceEmpty(oldState, newState);
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza empty:", error?.message || error);
    }

    if (client?.config?.tts?.stayConnected) return;

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await leaveTtsGuild(guild.id, client).catch((err) => {
        global.logger?.warn?.(
          "[voiceStateUpdate] leaveTtsGuild failed:",
          err?.message || err,
        );
      });
      return;
    }

    const botMember = guild.members.me || guild.members.cache.get(client.user.id);
    const botChannel = botMember?.voice?.channel;
    if (!botChannel) return;

    const humans = botChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      await leaveTtsGuild(guild.id, client).catch((err) => {
        global.logger?.warn?.(
          "[voiceStateUpdate] leaveTtsGuild failed:",
          err?.message || err,
        );
      });
    }
  },
};