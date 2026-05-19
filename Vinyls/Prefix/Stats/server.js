const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const serverButton = require("../../Buttons").server;

module.exports = {
  name: serverButton.name,
  allowEmptyArgs: true,
  SERVER_REFRESH_CUSTOM_ID_PREFIX: serverButton.SERVER_REFRESH_CUSTOM_ID_PREFIX,
  buildServerOverviewPayload: serverButton.buildServerOverviewPayload,

  async execute(message, args = []) {
    await message.channel.sendTyping();
    const { lookbackDays } = serverButton.parseServerActivityArgs(args);
    const loading = serverButton.buildServerLoadingPayload?.(lookbackDays, message.author?.id);
    let sent = loading
      ? await safeMessageReply(message, { ...loading, allowedMentions: { repliedUser: false } })
      : null;
    const payload = await serverButton.buildServerOverviewPayload(message.guild, lookbackDays, message.author?.id);
    if (sent?.edit) {
      await sent.edit(serverButton.normalizeServerMessageEdit(payload, { repliedUser: false })).catch(async () => {
        await safeMessageReply(message, serverButton.normalizeServerMessageEdit(payload, { repliedUser: false }));
      });
      return;
    }
    await safeMessageReply(message, serverButton.normalizeServerMessageEdit(payload, { repliedUser: false }));
  },
};