/** Log: AutoMod di Discord ha bloccato o segnalato qualcosa. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

const ACTION: Record<number, string> = { 1: "Messaggio bloccato", 2: "Avviso inviato", 3: "Timeout" };
export = {
  name: "autoModerationActionExecution",
  async execute(exec?) {
    const guild = exec?.guild;
    if (!guild) return;
    /* un'esecuzione arriva una volta per azione: logga solo la prima (blocco) o il timeout */
    const type = Number(exec.action?.type);
    if (type === 2) return;
    await L.sendServerLog(
      guild,
      "automodAction",
      {
        color: L.COLORS.orange,
        title: `AutoMod · ${ACTION[type] || "Azione"}`,
        description: [
          `**Utente:** <@${exec.userId}> \`${exec.userId}\``,
          exec.channelId ? `**Canale:** <#${exec.channelId}>` : "",
          exec.matchedKeyword ? `**Parola trovata:** ${L.clip(exec.matchedKeyword, 100)}` : "",
          exec.content ? `**Messaggio:** ${L.clip(exec.content, 900)}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { channelId: exec.channelId ? String(exec.channelId) : null },
    );
  },
};
