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
    if (!cfg.goodbye.enabled || !cfg.goodbye.channelId) return;
    const rest = (client || member.client)?.rest;
    const body = T.buildMessageBody(cfg.goodbye.draft, T.memberVars(guild, member.user));
    await rest.post(Routes.channelMessages(cfg.goodbye.channelId), { body }).catch((err?) => global.logger?.warn?.("[GOODBYE] send:", guild.id, err?.message || err));
  },
};
