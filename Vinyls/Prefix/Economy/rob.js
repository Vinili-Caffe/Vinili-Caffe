const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { assertEconomyAccess } = require("../../Services/Community/galeoniEconomyService");
const {
  attemptRob,
  buildRobGuiPayload,
  economyConfig,
  extractUserId,
  formatRobNotice,
  getSession,
  makeSession,
  resolveTargetUser,
  scheduleRobIdlePanel,
  setSession,
  warmupRobPanel,
} = require("../../Utils/Economy/robGuiRuntime");

module.exports = {
  name: "rob",
  aliases: ["ruba"],
  allowEmptyArgs: true,
  description: "Tenta un furto a Gringott con pannello interattivo.",
  usage: "+rob [@utente]",
  examples: ["+rob", "+rob @utente", "+ruba"],
  async execute(message, args, client) {
    const access = await assertEconomyAccess(message, client);
    if (!access.ok) {
      await safeMessageReply(message, { content: `<a:VC_Cross:1482532424570376253> ${access.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const cfg = economyConfig(client);
    const targetId = message.mentions.users.first()?.id || extractUserId(args?.[0]);
    const resolved = await resolveTargetUser(client, message, targetId, cfg);
    if (!resolved || resolved.error) {
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> ${resolved?.error || "Nessun bersaglio idoneo: smistamento Hogwarts completato e almeno il saldo minimo Galeoni."}`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const session = makeSession({
      ownerId: message.author.id,
      guildId: message.guild.id,
      targetId: resolved.id,
      targetName: resolved.name,
      isBank: resolved.isBank,
      cfg,
    });
    await warmupRobPanel();
    let notice = resolved.isBank
      ? "Cassaforte di Gringott: bottino dalla banca. Premi **Colpo** o **Rubare a utente**."
      : "Bersaglio giocatore idoneo. Premi **Colpo** o **Verso Gringott** per la banca.";
    if (targetId) {
      const hit = await attemptRob(client, message, session, cfg);
      if (!hit.ok) {
        await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${hit.message}`, allowedMentions: { repliedUser: false } });
        return;
      }
      notice = formatRobNotice(hit.result, session.targetName);
      session.panelAnimating = true;
      const sent = await safeMessageReply(message, await buildRobGuiPayload(session, "🥷 Infiltrazione in corso…", false, true));
      if (sent?.id) {
        setSession(sent.id, session);
        scheduleRobIdlePanel(sent, getSession(sent.id) || session, notice);
      }
      return;
    }
    const sent = await safeMessageReply(message, await buildRobGuiPayload(session, notice, false, false));
    if (sent?.id) setSession(sent.id, session);
  },
};