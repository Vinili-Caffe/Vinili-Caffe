const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getDevIds } = require("../../Utils/Moderation/commandPermissions");
const COUNTDOWN_FROM = 10;
const TICK_MS = 1000;
const INTRO = "<a:VC_Alert:1482706673176150077> **Lorenzo sta per uscire da questo server. Il server verrà cancellato tra 10 secondi.**";
const FINALE = "<:VC_cry:1486082958757724160> **Lorenzo è uscito dal server. Bravi, vergognatevi <a:VC_clap:1507868436095696976>**";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isBotDev(userId, client) {
  return getDevIds(client).includes(String(userId || ""));
}

async function sendChannel(message, content) {
  // Fake countdown: resta plain text (VC_Alert altrimenti diventa notice embed).
  const sent = await message.channel
    .send({ content, __skipNoticeEmbed: true })
    .catch(() => null);
  return Boolean(sent);
}

module.exports = {
  name: "quit",
  allowEmptyArgs: true,
  hideFromHelp: true,
  description: "Fake quit con countdown.",
  usage: "+quit",
  examples: ["+quit"],

  async execute(message) {
    if (!message.inGuild?.() || !message.guild || !message.channel) return;
    if (!isBotDev(message.author.id, message.client)) return;

    let first = await safeMessageReply(message, {
      content: INTRO,
      allowedMentions: { repliedUser: false },
      __skipNoticeEmbed: true,
    });
    if (!first) {
      const ok = await sendChannel(message, INTRO);
      if (!ok) return;
    }

    for (let n = COUNTDOWN_FROM; n >= 1; n -= 1) {
      await sleep(TICK_MS);
      const ok = await sendChannel(message, `**${n}**`);
      if (!ok) return;
    }

    await sleep(TICK_MS);
    await sendChannel(message, FINALE);
  },
};
