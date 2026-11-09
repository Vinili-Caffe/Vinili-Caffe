/** Log: ruolo modificato (nome, colore, permessi, separato, menzionabile). */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

/* nomi italiani dei permessi più importanti (per i cambi dei ruoli) */
const PERMS: [bigint, string][] = [
  [1n << 3n, "Amministratore"],
  [1n << 5n, "Gestire il server"],
  [1n << 28n, "Gestire i ruoli"],
  [1n << 4n, "Gestire i canali"],
  [1n << 13n, "Gestire i messaggi"],
  [1n << 1n, "Espellere"],
  [1n << 2n, "Bannare"],
  [1n << 40n, "Mettere in timeout"],
  [1n << 17n, "Menzionare @everyone"],
  [1n << 29n, "Gestire i webhook"],
  [1n << 30n, "Gestire emoji e sticker"],
  [1n << 27n, "Gestire i nickname"],
  [1n << 7n, "Vedere il registro"],
];

export = {
  name: "roleUpdate",
  async execute(oldRole?, newRole?) {
    if (!newRole?.guild) return;
    const lines: string[] = [];
    if (oldRole?.name !== newRole.name) lines.push(`**Nome:** ${L.clip(oldRole?.name, 100)} → ${L.clip(newRole.name, 100)}`);
    if ((oldRole?.color || 0) !== (newRole.color || 0)) lines.push(`**Colore:** #${(oldRole?.color || 0).toString(16).padStart(6, "0")} → #${(newRole.color || 0).toString(16).padStart(6, "0")}`);
    if (Boolean(oldRole?.hoist) !== Boolean(newRole.hoist)) lines.push(`**Mostrato a parte:** ${newRole.hoist ? "sì" : "no"}`);
    if (Boolean(oldRole?.mentionable) !== Boolean(newRole.mentionable)) lines.push(`**Menzionabile:** ${newRole.mentionable ? "sì" : "no"}`);
    const pb = BigInt(oldRole?.permissions?.bitfield ?? 0n);
    const pa = BigInt(newRole.permissions?.bitfield ?? 0n);
    if (pb !== pa) {
      const added = PERMS.filter(([b]) => (pa & b) === b && (pb & b) !== b).map(([, n]) => n);
      const removed = PERMS.filter(([b]) => (pb & b) === b && (pa & b) !== b).map(([, n]) => n);
      if (added.length) lines.push(`**Permessi aggiunti:** ${added.join(", ")}`);
      if (removed.length) lines.push(`**Permessi tolti:** ${removed.join(", ")}`);
      if (!added.length && !removed.length) lines.push("**Permessi:** modificati");
    }
    if (!lines.length) return; /* solo posizione */
    await L.sendServerLog(newRole.guild, "roleUpdate", { color: newRole.color || L.COLORS.orange, title: "Ruolo modificato", description: [`<@&${newRole.id}> \`${newRole.id}\``, ...lines].join("\n") });
  },
};
