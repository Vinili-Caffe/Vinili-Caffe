const { assertServerEconomyAccess, economyConfig, parseCurrencyArg, defaultBetCurrency } = require("../../Services/Community/serverEconomyService");
const {
  attemptRob,
  buildRobGuiPayload,
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
  description: "Tenta un furto contro la cassaforte o un altro utente.",
  usage: "+rob [@utente] [vinili|caffe]",
  examples: ["+rob", "+rob @utente", "+rob caffe", "+ruba vinili"],
  async execute(message, args, client) {
    await runEconomyPanelCommand(message, client, "ROB", async ({ message: msg, client: c, replyDeny: deny, postGuiPanel: post }) => {
      const access = await assertServerEconomyAccess(msg, c);
      if (!access.ok) {
        await deny(msg, access.message);
        return;
      }
      const cfg = economyConfig(c);
      const rawArgs = Array.isArray(args) ? args.map((v) => String(v || "").trim()).filter(Boolean) : [];
      const lastCur = rawArgs.length ? parseCurrencyArg(rawArgs[rawArgs.length - 1]) : null;
      const currency = lastCur?.ok && lastCur.currency ? lastCur.currency : defaultBetCurrency();
      const targetArgs = lastCur?.ok && lastCur.currency && rawArgs.length ? rawArgs.slice(0, -1) : rawArgs;
      const targetId = msg.mentions.users.first()?.id || extractUserId(targetArgs?.[0]);
      const resolved = await resolveTargetUser(c, msg, targetId, cfg, currency);
      if (!resolved || resolved.error) {
        await deny(
          msg,
          resolved?.error || "Nessun bersaglio idoneo: serve un utente con saldo sufficiente in Vinili o Caffè.",
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
        currency,
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