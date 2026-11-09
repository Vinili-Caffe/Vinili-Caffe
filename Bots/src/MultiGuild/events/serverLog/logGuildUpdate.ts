/** Log: impostazioni del server cambiate (nome, icona, banner, verifica, AFK, link personalizzato). */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

const VERIF = ["nessuna", "bassa", "media", "alta", "massima"];
export = {
  name: "guildUpdate",
  async execute(oldGuild?, newGuild?) {
    if (!newGuild?.id) return;
    const lines: string[] = [];
    if (oldGuild?.name !== newGuild.name) lines.push(`**Nome:** ${L.clip(oldGuild?.name, 100)} → ${L.clip(newGuild.name, 100)}`);
    if ((oldGuild?.icon || "") !== (newGuild.icon || "")) lines.push("**Icona:** cambiata");
    if ((oldGuild?.banner || "") !== (newGuild.banner || "")) lines.push("**Banner:** cambiato");
    if ((oldGuild?.splash || "") !== (newGuild.splash || "")) lines.push("**Sfondo inviti:** cambiato");
    if ((oldGuild?.description || "") !== (newGuild.description || "")) lines.push(`**Descrizione:** ${L.clip(newGuild.description || "—", 300)}`);
    if (oldGuild?.verificationLevel !== newGuild.verificationLevel) lines.push(`**Verifica:** ${VERIF[oldGuild?.verificationLevel] ?? "?"} → ${VERIF[newGuild.verificationLevel] ?? "?"}`);
    if ((oldGuild?.vanityURLCode || "") !== (newGuild.vanityURLCode || "")) lines.push(`**Link personalizzato:** ${oldGuild?.vanityURLCode || "—"} → ${newGuild.vanityURLCode || "—"}`);
    if ((oldGuild?.afkChannelId || "") !== (newGuild.afkChannelId || "")) lines.push(`**Canale AFK:** ${newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : "nessuno"}`);
    if ((oldGuild?.systemChannelId || "") !== (newGuild.systemChannelId || "")) lines.push(`**Canale di sistema:** ${newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : "nessuno"}`);
    if ((oldGuild?.ownerId || "") !== (newGuild.ownerId || "")) lines.push(`**Proprietario:** <@${oldGuild?.ownerId}> → <@${newGuild.ownerId}>`);
    if (!lines.length) return;
    let icon = "";
    try {
      icon = typeof newGuild.iconURL === "function" ? newGuild.iconURL({ size: 128 }) || "" : "";
    } catch {
      icon = "";
    }
    await L.sendServerLog(newGuild, "serverUpdate", { color: L.COLORS.blue, title: "Server modificato", description: lines.join("\n"), ...(icon ? { thumbnail: { url: icon } } : {}) });
  },
};
