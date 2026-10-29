const { handleStanzaChannelUpdate } = require("../Services/Voice/stanzaVoiceRoomsService") as typeof import("../Services/Voice/stanzaVoiceRoomsService");

export = {
  name: "channelUpdate",
  async execute(oldChannel?, newChannel?) {
    try {
      await handleStanzaChannelUpdate(oldChannel, newChannel);
    } catch (error) {
      global.logger?.warn?.("[channelUpdate] stanza name enforce:", error?.message || error);
    }
  },
};
