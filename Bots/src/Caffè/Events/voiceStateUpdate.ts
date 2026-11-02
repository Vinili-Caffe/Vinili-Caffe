const { handleMusicBotVoiceDisconnect, shouldDeferTtsLeaveForMusicEmptyVc } = require("../../shared/music/services/lavalinkMusicService") as typeof import("../../shared/music/services/lavalinkMusicService");
const { leaveTtsGuild, handleTtsBotVoiceMove, isTtsPostJoinVoiceGraceActive } = require("../../shared/tts/services/ttsService") as typeof import("../../shared/tts/services/ttsService");
const { finalizeStanzaVisitorVoiceSessionIfLeft, handleStanzaVoiceLobbyJoin, handleStanzaVoiceOccupied, handleStanzaVoiceEmpty, handleStanzaVoiceSilenceSync } = require("../Services/Voice/stanzaVoiceRoomsService") as typeof import("../Services/Voice/stanzaVoiceRoomsService");

export = {
  name: "voiceStateUpdate",
  async execute(oldState?, newState?, client?) {
    const guild = newState?.guild || oldState?.guild;
    if (!guild) return;
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
    try {
      await handleStanzaVoiceSilenceSync(oldState, newState);
    } catch (error) {
      global.logger?.warn?.("[voiceStateUpdate] stanza silence sync:", error?.message || error);
    }

    if (client?.config?.tts?.stayConnected) return;

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      newState.channelId &&
      String(oldState.channelId) !== String(newState.channelId)
    ) {
      const newChannelId = String(newState.channelId);
      const channel =
        guild.channels?.cache?.get(newChannelId) ||
        (await guild.channels?.fetch?.(newChannelId).catch(() => null));
      if (channel?.isVoiceBased?.()) {
        await handleTtsBotVoiceMove({
          voiceChannel: channel,
          oldChannelId: oldState.channelId,
        }).catch((err?) => {
          global.logger?.warn?.(
            "[voiceStateUpdate] handleTtsBotVoiceMove failed:",
            err?.message || err,
          );
        });
      }
    }

    if (
      oldState.id === client.user.id &&
      oldState.channelId &&
      !newState.channelId
    ) {
      await handleMusicBotVoiceDisconnect(client, guild).catch((err?) => {
        global.logger?.warn?.(
          "[voiceStateUpdate] handleMusicBotVoiceDisconnect failed:",
          err?.message || err,
        );
      });
      await guild.members.fetch({ user: client.user.id, force: true }).catch(() => null);
      await leaveTtsGuild(guild.id, client).catch((err?) => {
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
    if (isTtsPostJoinVoiceGraceActive(guild.id)) return;

    const humans = botChannel.members.filter((m?) => !m.user.bot);
    if (humans.size === 0) {
      if (shouldDeferTtsLeaveForMusicEmptyVc(client, guild.id)) {
      } else {
        await leaveTtsGuild(guild.id, client).catch((err?) => {
          global.logger?.warn?.(
            "[voiceStateUpdate] leaveTtsGuild failed:",
            err?.message || err,
          );
        });
      }
    }
  },
};