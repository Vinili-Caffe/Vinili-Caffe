/**
 * Benvenuto, DM di benvenuto e ruoli automatici configurati dalla dashboard.
 * Nel server principale benvenuto e DM li manda il flusso di Vinili (dopo i controlli d'ingresso):
 * qui solo i ruoli automatici.
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");
const { sendDashboardWelcome, sendDashboardWelcomeDm } = require("../services/welcomeRuntime") as typeof import("../services/welcomeRuntime");

export = {
  name: "guildMemberAdd",
  async execute(member?) {
    const guild = member?.guild;
    if (!guild || member.user?.bot) return;
    const cfg = await T.getWelcome(guild.id);

    if (cfg.autoRoleIds.length) {
      const me = guild.members.me;
      const ok = cfg.autoRoleIds.filter((id) => {
        const r = guild.roles.cache.get(id);
        return r && !r.managed && me && r.position < me.roles.highest.position;
      });
      if (ok.length) await member.roles.add(ok, "Ruoli automatici all'ingresso").catch((err?) => global.logger?.warn?.("[WELCOME] autorole:", guild.id, err?.message || err));
    }

    if (T.isMainGuild(guild.id)) return;
    await sendDashboardWelcome(member);
    await sendDashboardWelcomeDm(member);
  },
};
