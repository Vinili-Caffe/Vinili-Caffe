const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const profileButton = require("../../Buttons/profile");

async function resolveTargetUser(message, args = []) {
  const mentioned = message?.mentions?.users?.first?.();
  if (mentioned) return mentioned;
  const raw = String(Array.isArray(args) ? args.join(" ") : "").trim();
  if (!raw) return message?.author || null;
  const id = raw.replace(/[<@!>]/g, "");
  if (/^\d{17,20}$/.test(id)) {
    return message.client.users.fetch(id).catch(() => null);
  }
  return message?.author || null;
}

module.exports = {
  name: "profile",
  allowEmptyArgs: true,
  usage: "`+profile` · `+profile @utente`",
  examples: ["+profile", "+profile @Lore"],

  async execute(message, args = []) {
    if (!message?.guild || !message?.author) return;
    await message.channel.sendTyping().catch(() => {});
    const targetUser = await resolveTargetUser(message, args);
    if (!targetUser) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Utente non trovato.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const payload = await profileButton.buildPanelPayload(
      message.guild,
      targetUser.id,
      message.client,
      "home",
    );
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};