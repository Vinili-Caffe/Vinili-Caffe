const { assertEconomyAccess, isHighStaff } = require("../../Services/Community/galeoniEconomyService");
const { openBalPanel, setSession } = require("../../Utils/Economy/balGuiRuntime");
const { postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

module.exports = {
  name: "bal",
  aliases: ["balance", "saldo", "galeoni"],
  allowEmptyArgs: true,
  description: "Mostra il saldo Galeoni con pannello interattivo.",
  usage: "+bal [@utente]",
  examples: ["+bal", "+bal @utente"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "BAL", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const targetId = msg.mentions.users.first()?.id || extractUserId(args?.[0]) || msg.author.id;
      let targetName = msg.author.displayName || msg.author.username;
      if (targetId !== msg.author.id) {
        const targetUser = msg.mentions.users.first() || (await c.users.fetch(targetId).catch(() => null));
        targetName = targetUser?.displayName || targetUser?.username || `Utente ${targetId.slice(-4)}`;
      }
      const showStaffControls = await isHighStaff(msg.member, c, msg.author.id);
      const opened = await openBalPanel(c, msg, { targetId, targetName, showStaffControls, preview: access.preview });
      if (!opened.ok) {
        await deny(msg, opened.message);
        return;
      }
      await post(msg, { payload: opened.payload, session: opened.session, setSession, label: "saldo" });
    });
  },
};