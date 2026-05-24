const { assertEconomyAccess } = require("../../Services/Community/galeoniEconomyService");
const { assertRobberHasBroom } = require("../../Services/Community/hogwartsShopBoostsService");
const {
  attemptRob,
  buildRobGuiPayload,
  economyConfig,
  extractUserId,
  getSession,
  makeSession,
  pushRobHitAnimation,
  resolveTargetUser,
  setSession,
  warmupRobPanel,
} = require("../../Utils/Economy/robGuiRuntime");
const { EMOJI_DENY, postGuiPanel, replyDeny, runEconomyPanelCommand } = require("../../Utils/Economy/economyCommandHelpers");

module.exports = {
  name: "rob",
  aliases: ["ruba"],
  allowEmptyArgs: true,
  description: "Furto a Gringott (serve smistamento e scopa dallo shop Hogwarts).",
  usage: "+rob [@utente]",
  examples: ["+rob", "+rob @utente", "+ruba"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "ROB", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const broom = await assertRobberHasBroom(c, msg.guild.id, msg.author.id);
      if (!broom.ok) {
        await deny(msg, broom.message);
        return;
      }
      const cfg = economyConfig(c);
      const targetId = msg.mentions.users.first()?.id || extractUserId(args?.[0]);
      const resolved = await resolveTargetUser(c, msg, targetId, cfg);
      if (!resolved || resolved.error) {
        await deny(
          msg,
          resolved?.error || "Nessun bersaglio idoneo: smistamento Hogwarts completato e almeno il saldo minimo Galeoni.",
        );
        return;
      }
      const session = await makeSession({
        ownerId: msg.author.id,
        guildId: msg.guild.id,
        targetId: resolved.id,
        targetName: resolved.name,
        isBank: resolved.isBank,
        cfg,
        client: c,
      });
      warmupRobPanel({ wait: false });
      await warmupRobPanel({ maxMs: 3500 });
      const payload = await buildRobGuiPayload(session, "", false, {});
      const sent = await post(msg, { payload, session, setSession, label: "furto" });
      if (!sent || !targetId) return;
      const hit = await pushRobHitAnimation(sent, getSession(sent.id) || session, () => attemptRob(c, msg, session, cfg));
      if (!hit.ok) {
        const errPayload = await buildRobGuiPayload(session, `${EMOJI_DENY} ${hit.message}`, false, {});
        await sent.edit(errPayload).catch(() => {});
      }
    });
  },
};