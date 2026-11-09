/** Log: ruoli o nickname cambiati. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?) {
    const guild = newMember?.guild;
    if (!guild || oldMember?.partial) return;
    const before = new Set<string>(oldMember?.roles?.cache ? [...oldMember.roles.cache.keys()].map(String) : []);
    const after = new Set<string>(newMember?.roles?.cache ? [...newMember.roles.cache.keys()].map(String) : []);
    const added = [...after].filter((id) => !before.has(id));
    const removed = [...before].filter((id) => !after.has(id));
    if (added.length || removed.length) {
      await L.sendServerLog(
        guild,
        "memberRoles",
        {
          color: L.COLORS.blue,
          author: L.authorOf(newMember.user),
          title: "Ruoli cambiati",
          description: [L.userLine(newMember.user), added.length ? `**Aggiunti:** ${added.map((id) => `<@&${id}>`).join(" ")}` : "", removed.length ? `**Tolti:** ${removed.map((id) => `<@&${id}>`).join(" ")}` : ""].filter(Boolean).join("\n"),
        },
        { isBot: Boolean(newMember.user?.bot) },
      );
    }
    if ((oldMember?.nickname || null) !== (newMember?.nickname || null)) {
      await L.sendServerLog(
        guild,
        "memberNick",
        {
          color: L.COLORS.blue,
          author: L.authorOf(newMember.user),
          title: "Nickname cambiato",
          description: [L.userLine(newMember.user), `**Prima:** ${L.clip(oldMember?.nickname || "*nessuno*", 100)}`, `**Dopo:** ${L.clip(newMember?.nickname || "*nessuno*", 100)}`].join("\n"),
        },
        { isBot: Boolean(newMember.user?.bot) },
      );
    }
    /* timeout dato o tolto */
    const tBefore = Number(oldMember?.communicationDisabledUntilTimestamp || 0);
    const tAfter = Number(newMember?.communicationDisabledUntilTimestamp || 0);
    const activeBefore = tBefore > Date.now();
    const activeAfter = tAfter > Date.now();
    if (activeBefore !== activeAfter || (activeAfter && tBefore !== tAfter)) {
      await L.sendServerLog(guild, "memberTimeout", {
        color: activeAfter ? L.COLORS.orange : L.COLORS.green,
        author: L.authorOf(newMember.user),
        title: activeAfter ? "Timeout dato" : "Timeout tolto",
        description: [L.userLine(newMember.user), activeAfter ? `**Fino a:** <t:${Math.floor(tAfter / 1000)}:f> (<t:${Math.floor(tAfter / 1000)}:R>)` : ""].filter(Boolean).join("\n"),
      });
    }
    /* boost iniziato o finito */
    const boostBefore = Boolean(oldMember?.premiumSinceTimestamp);
    const boostAfter = Boolean(newMember?.premiumSinceTimestamp);
    if (boostBefore !== boostAfter) {
      await L.sendServerLog(guild, "memberBoost", {
        color: boostAfter ? 0xf47fff : L.COLORS.grey,
        author: L.authorOf(newMember.user),
        title: boostAfter ? "Nuovo boost" : "Boost terminato",
        description: [L.userLine(newMember.user), `**Boost del server ora:** ${guild.premiumSubscriptionCount ?? "?"}`].join("\n"),
      });
    }
  },
};
