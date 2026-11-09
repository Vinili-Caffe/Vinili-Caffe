/** Log: ingresso / uscita / spostamento in vocale. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "voiceStateUpdate",
  async execute(oldState?, newState?) {
    const guild = newState?.guild || oldState?.guild;
    if (!guild) return;
    const member = newState?.member || oldState?.member;
    const user = member?.user || newState?.member?.user || oldState?.member?.user;
    const oldCh = oldState?.channelId ? String(oldState.channelId) : "";
    const newCh = newState?.channelId ? String(newState.channelId) : "";
    if (oldCh === newCh) return;

    if (!oldCh && newCh) {
      await L.sendServerLog(
        guild,
        "voiceJoin",
        {
          color: L.COLORS.green,
          author: L.authorOf(user),
          title: "Entrato in vocale",
          description: [L.userLine(user), `**Canale:** <#${newCh}>`].join("\n"),
        },
        { channelId: newCh, isBot: Boolean(user?.bot) },
      );
      return;
    }
    if (oldCh && !newCh) {
      await L.sendServerLog(
        guild,
        "voiceLeave",
        {
          color: L.COLORS.orange,
          author: L.authorOf(user),
          title: "Uscito dalla vocale",
          description: [L.userLine(user), `**Canale:** <#${oldCh}>`].join("\n"),
        },
        { channelId: oldCh, isBot: Boolean(user?.bot) },
      );
      return;
    }
    if (oldCh && newCh) {
      await L.sendServerLog(
        guild,
        "voiceMove",
        {
          color: L.COLORS.blue,
          author: L.authorOf(user),
          title: "Spostato in vocale",
          description: [L.userLine(user), `**Da:** <#${oldCh}>`, `**A:** <#${newCh}>`].join("\n"),
        },
        { channelId: newCh, isBot: Boolean(user?.bot) },
      );
    }
  },
};
