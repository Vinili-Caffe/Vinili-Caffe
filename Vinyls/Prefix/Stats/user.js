const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const userButton = require("../../Buttons").user;

module.exports = {
  name: userButton.name,
  allowEmptyArgs: false,
  description: "Mostra le statistiche attività di un utente (mention, ID o username).",
  usage: "+user <@utente | id | username>",
  examples: ["+user @Utente", "+user 123456789012345678", "+user NomeUtente"],
  USER_REFRESH_CUSTOM_ID_PREFIX: userButton.USER_REFRESH_CUSTOM_ID_PREFIX,
  USER_PERIOD_OPEN_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_OPEN_CUSTOM_ID_PREFIX,
  USER_PERIOD_SET_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_SET_CUSTOM_ID_PREFIX,
  USER_PERIOD_BACK_CUSTOM_ID_PREFIX: userButton.USER_PERIOD_BACK_CUSTOM_ID_PREFIX,
  buildUserOverviewPayload: userButton.buildUserOverviewPayload,
  buildUserComponents: userButton.buildUserComponents,

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const { targetId, lookbackDays } = await userButton.resolveUserTargetAndLookback(message, args);
    if (!targetId) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa: `+user <@utente | id | username>`",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    try {
      const payload = await userButton.buildUserOverviewPayload(message.guild, targetId, lookbackDays, "main", message.client);
      payload.components = userButton.buildUserComponents(message.author.id, targetId, lookbackDays, "main");
      await safeMessageReply(message, { ...payload, allowedMentions: { repliedUser: false } });
    } catch (err) {
      global.logger?.error?.("[+user] Errore:", err?.message || err);
      const hint = err?.message && /canvas|Cannot find module/i.test(String(err.message)) ? " Sul server potrebbe mancare il pacchetto `canvas` (e dipendenze di sistema)." : "";
      await safeMessageReply(message, {
        content: `<:vegax:1443934876440068179> Errore nel generare le statistiche.${hint}`,
        allowedMentions: { repliedUser: false },
      });
    }
  },
};