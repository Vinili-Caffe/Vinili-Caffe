const { assertServerEconomyAccess, isHighStaff } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { openBalPanel, setSession } = require("../../Utils/Economy/balGuiRuntime") as typeof import("../../Utils/Economy/balGuiRuntime");
const { postGuiPanel, replyDeny, resolveEconomyUserArg, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers") as typeof import("../../Utils/Economy/economyCommandHelpers");
const { economyUsername } = require("../../Utils/Economy/economyDisplayHelpers") as typeof import("../../Utils/Economy/economyDisplayHelpers");

export = {
  name: "bal",
  allowEmptyArgs: true,
  description: "Mostra il saldo Vinili e Caffè con pannello interattivo.",
  usage: "+bal [@utente|username]",
  examples: ["+bal", "+bal @utente", "+bal username"],
  async execute(message?, args?, client?) {
    await runEconomyPanelCommand(message, client, "BAL", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertServerEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const rawTarget = String(args?.[0] || "").trim();
      let targetUser = msg.author;
      if (rawTarget) {
        const resolved = await resolveEconomyUserArg(msg, rawTarget);
        if (!resolved) {
          await deny(msg, "Utente non trovato. Usa `@menzione`, ID o username.");
          return;
        }
        targetUser = resolved;
      }
      const targetId = targetUser.id;
      const targetName = economyUsername(targetUser);
      const showStaffControls = await isHighStaff(msg.member, c, msg.author.id);
      const opened = await openBalPanel(c, msg, { targetId, targetName, showStaffControls });
      if (!opened.ok) {
        await deny(msg, opened.message);
        return;
      }
      await post(msg, { payload: opened.payload, session: opened.session, setSession, label: "saldo" });
    });
  },
};
