/**
 * Messaggio di addio configurato dalla dashboard.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

export = {
  name: "guildMemberRemove",
  async execute(member?, client?) {
    const guild = member?.guild;
    if (!guild || member.user?.bot) return;
    const cfg = await T.getWelcome(guild.id);
    const vars = T.memberVars(guild, member.user);
    /* privato a chi esce: arriva solo se ha ancora un server in comune col bot e i privati aperti */
    if (cfg.goodbyeDm?.enabled) await T.sendDraftDm(client || member.client, member.id, cfg.goodbyeDm.draft, vars);
    if (!cfg.goodbye.enabled || !cfg.goodbye.channelId) return;
    const rest = (client || member.client)?.rest;
    const body = T.buildMessageBody(cfg.goodbye.draft, vars);
    await rest.post(Routes.channelMessages(cfg.goodbye.channelId), { body }).catch((err?) => global.logger?.warn?.("[GOODBYE] send:", guild.id, err?.message || err));
  },
};
