/** Log: canale modificato (nome, argomento, lentezza, NSFW, categoria). */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "channelUpdate",
  async execute(oldCh?, newCh?) {
    if (!newCh?.guild) return;
    const lines: string[] = [];
    if (oldCh?.name !== newCh.name) lines.push(`**Nome:** ${L.clip(oldCh?.name, 100)} → ${L.clip(newCh.name, 100)}`);
    if ((oldCh?.topic || "") !== (newCh.topic || "")) lines.push(`**Argomento:** ${L.clip(oldCh?.topic || "—", 300)} → ${L.clip(newCh.topic || "—", 300)}`);
    if ((oldCh?.rateLimitPerUser || 0) !== (newCh.rateLimitPerUser || 0)) lines.push(`**Modalità lenta:** ${oldCh?.rateLimitPerUser || 0}s → ${newCh.rateLimitPerUser || 0}s`);
    if (Boolean(oldCh?.nsfw) !== Boolean(newCh.nsfw)) lines.push(`**NSFW:** ${newCh.nsfw ? "attivato" : "disattivato"}`);
    if ((oldCh?.parentId || "") !== (newCh.parentId || "")) lines.push(`**Categoria:** ${oldCh?.parent?.name || "nessuna"} → ${newCh.parent?.name || "nessuna"}`);
    if ((oldCh?.bitrate || 0) !== (newCh.bitrate || 0) && newCh.bitrate) lines.push(`**Bitrate:** ${Math.round((oldCh?.bitrate || 0) / 1000)} → ${Math.round(newCh.bitrate / 1000)} kbps`);
    if ((oldCh?.userLimit || 0) !== (newCh.userLimit || 0)) lines.push(`**Limite utenti:** ${oldCh?.userLimit || "∞"} → ${newCh.userLimit || "∞"}`);
    if (!lines.length) return; /* solo permessi o posizione: troppo rumore */
    await L.sendServerLog(newCh.guild, "channelUpdate", { color: L.COLORS.orange, title: "Canale modificato", description: [`<#${newCh.id}> \`${newCh.id}\``, ...lines].join("\n") });
  },
};
