const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyAccess, isHighStaff } = require("../../Services/Community/galeoniEconomyService");
const { openBalPanel, setSession } = require("../../Utils/Economy/balGuiRuntime");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

module.exports = {
  name: "bal",
  aliases: ["balance", "saldo", "galeoni"],
  allowEmptyArgs: true,
  description: "Mostra il saldo.",
  usage: "+bal [@utente]",
  examples: ["+bal", "+bal @utente"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }

    const targetId = message.mentions.users.first()?.id || extractUserId(args?.[0]) || message.author.id;
    let targetName = message.author.displayName || message.author.username;
    if (targetId !== message.author.id) {
      const targetUser = message.mentions.users.first() || await client.users.fetch(targetId).catch(() => null);
      targetName = targetUser?.displayName || targetUser?.username || `Utente ${targetId.slice(-4)}`;
    }

    const showStaffControls = await isHighStaff(message.member, client, message.author.id);
    const opened = await openBalPanel(client, message, { targetId, targetName, showStaffControls, preview: access.preview });
    if (!opened.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${opened.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const sent = await safeMessageReply(message, opened.payload);
    if (sent?.id) setSession(sent.id, opened.session);
  },
};