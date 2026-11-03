const { handleStanzaChannelUpdate } = require("../../Voice/services/stanzaVoiceRoomsService") as typeof import("../../Voice/services/stanzaVoiceRoomsService");

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
