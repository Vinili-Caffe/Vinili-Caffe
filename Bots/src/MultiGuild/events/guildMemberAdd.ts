/**
 * Benvenuto, DM di benvenuto e ruoli automatici configurati dalla dashboard.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

export = {
  name: "guildMemberAdd",
  async execute(member?, client?) {
    const guild = member?.guild;
    if (!guild || member.user?.bot) return;
    const cfg = await T.getWelcome(guild.id);
    const rest = (client || member.client)?.rest;
    const vars = T.memberVars(guild, member.user);

    if (cfg.autoRoleIds.length) {
      const me = guild.members.me;
      const ok = cfg.autoRoleIds.filter((id) => {
        const r = guild.roles.cache.get(id);
        return r && !r.managed && me && r.position < me.roles.highest.position;
      });
      if (ok.length) await member.roles.add(ok, "Ruoli automatici all'ingresso").catch((err?) => global.logger?.warn?.("[WELCOME] autorole:", guild.id, err?.message || err));
    }

    if (cfg.welcome.enabled && cfg.welcome.channelId) {
      const body = T.buildMessageBody(cfg.welcome.draft, vars, [], { mentionUserId: member.id });
      await rest.post(Routes.channelMessages(cfg.welcome.channelId), { body }).catch((err?) => global.logger?.warn?.("[WELCOME] send:", guild.id, err?.message || err));
    }

    if (cfg.dm.enabled) {
      await member.user
        .createDM()
        .then((dm?) => rest.post(Routes.channelMessages(dm.id), { body: T.buildMessageBody(cfg.dm.draft, vars) }))
        .catch(() => null);
    }
  },
};
