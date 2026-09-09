const { handleStanzaChannelUpdate } = require("../Services/Voice/stanzaVoiceRoomsService");

module.exports = {
  name: "channelUpdate",
  async execute(oldChannel, newChannel) {
    try {
      await handleStanzaChannelUpdate(oldChannel, newChannel);
    } catch (error) {
      global.logger?.warn?.("[channelUpdate] stanza name enforce:", error?.message || error);
    }
  },
};
