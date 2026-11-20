const { reemitPrefixOnMessageUpdate } = require("../../../shared/prefix/reemitPrefixOnMessageUpdate") as typeof import("../../../shared/prefix/reemitPrefixOnMessageUpdate");

export = {
  name: "messageUpdate",
  async execute(oldMessage?, newMessage?, client?) {
    await reemitPrefixOnMessageUpdate(oldMessage, newMessage, client, { defaultPrefix: "," });
  },
};
