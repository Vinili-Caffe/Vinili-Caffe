const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { findActiveModerations, countModLogsForUser, findModLogsPage } = require("../modCaseStore") as typeof import("../modCaseStore");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  pickUser,
  formatRemainingWords,
  formatDurationWords,
  formatDynoDate,
} = require("./helpers") as typeof import("./helpers");

async function runModlogsOrModerations(cmd?, message?, args?) {
  const target = await pickUser(message, args, 0);
  if (cmd === "moderations") {
    const limit = target.userId ? 10 : 25;
          const candidates = await findActiveModerations(message.guild.id, target.userId || null, Math.max(limit * 4, 50));
    const rows = [];
    for (const row of candidates) {
      if (rows.length >= limit) break;
      const action = String(row.action || "").toUpperCase();
      if (action === "BAN") {
        rows.push(row);
        continue;
      }
      if (action !== "MUTE") continue;
      const uid = String(row.userId || "").trim();
      if (!uid) continue;
      const inGuild = Boolean(
        message.guild.members.cache.get(uid) ||
        (await message.guild.members.fetch(uid).catch(() => null)),
      );
      if (!inGuild) continue;
      rows.push(row);
    }
    if (!rows.length) {
      const msg = target.userId ? `${E.cancel} Non ci sono mute/ban attivi per questo utente.` : `${E.cancel} Non ci sono mute/ban attive al momento.`;
      return message.channel
        .send({
          embeds: [
            new EmbedBuilder()
              .setColor("#3498DB")
              .setDescription(`${E.VC_InactiveStatus} **${msg}**`),
          ],
        })
        .catch(() => null);
    }
    const now = Date.now();
    const singleUserId = target.userId ? String(target.userId).trim() : null;
    const singleUsername = singleUserId ? (message.client.users.cache.get(singleUserId) || (await message.client.users.fetch(singleUserId).catch(() => null)))?.username?.toLowerCase() || singleUserId : null;
    const lines = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const type = String(row.action || "").toUpperCase() === "MUTE" ? "Mutato" : "Ban";
      const expiresAt = new Date(row.expiresAt || Date.now()).getTime();
      const remaining = formatRemainingWords(expiresAt - now);
      let username = singleUsername;
      if (username == null) {
        const uid = String(row.userId || "").trim();
        const u = uid ? (message.client.users.cache.get(uid) || (await message.client.users.fetch(uid).catch(() => null))) : null;
        username = u?.username?.toLowerCase() ?? uid ?? "sconosciuto";
      }
      lines.push(`${i + 1}. **${username}**\n${type} | Tempo rimanente: ${remaining}`);
    }
    const title = singleUserId ? `Moderazioni attive per ${singleUsername || singleUserId}`
      : "Moderazioni attive";
    const activeEmbed = new EmbedBuilder().setColor("#3498DB").setTitle(title).setDescription(lines.join("\n\n")).setFooter({
      text: rows.length === 1 ? "1 moderazione attiva" : `${rows.length} moderazioni attive`,
    });
    return message.channel.send({ embeds: [activeEmbed] }).catch(() => null);
  }

  if (!target.userId) {
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder().setColor("#ED4245").setDescription(`${E.cancel} Nessun log trovato per quell'utente.`),
        ],
      })
      .catch(() => null);
  }

  const rawPage = Number.parseInt(args[1], 10);
  const requestedPage = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const perPage = 6;
  const total = await countModLogsForUser(message.guild.id, target.userId);
  if (total <= 0) {
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder().setColor("#ED4245").setDescription(`${E.cancel} Nessun log trovato per quell'utente.`),
        ],
      })
      .catch(() => null);
  }

  const targetUser = await message.client.users.fetch(target.userId).catch(() => null);
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(requestedPage, totalPages);
  const skip = (safePage - 1) * perPage;
  const rows = await findModLogsPage(message.guild.id, target.userId, skip, perPage);
  if (!rows.length) {
    return message.channel
      .send({
        embeds: [
          new EmbedBuilder().setColor("#ED4245").setDescription(`${E.cancel} Nessun log trovato per quell'utente.`),
        ],
      })
      .catch(() => null);
  }
  const lines = [];
  for (const row of rows) {
    const modUser = await message.client.users.fetch(String(row.modId || "")).catch(() => null);
    const type = String(row.action || "Sconosciuto").toLowerCase().replace(/^\w/, (c?) => c.toUpperCase());
    const createdAt = formatDynoDate(row.createdAt);
    const length = formatDurationWords(row.durationMs);
    const blockLines = [
      `${E.VC_id} **Case ${row.caseId}**`,
      `${E.VC_InactiveStatus} **Tipo:** ${type}`,
      `${E.VC_User} **Utente:** \`${target.userId}\` · ${targetUser?.username || "Sconosciuto"}`,
      `${E.VC_Staff} **Responsabile:** ${modUser?.username || row.modId || "Sconosciuto"}`,
    ];
    if (length) blockLines.push(`${E.VC_Clock} **Durata:** ${length}`);
    blockLines.push(`${E.VC_reason} **Motivo:** ${row.reason || "Nessun motivo fornito."} - ${createdAt}`);
    lines.push(blockLines.join("\n"));
  }

  const logsEmbed = new EmbedBuilder()
    .setColor("#3498DB")
    .setTitle(String(`Modlog di ${targetUser?.username || target.userId} (Pagina ${safePage} di ${totalPages})`).slice(0, 256))
    .setDescription(String(lines.join("\n\n")).slice(0, 4096))
    .setFooter({ text: `${total} log totali | Usa +modlogs [utente] [pagina] per vedere un'altra pagina` });

  return message.channel.send({ embeds: [logsEmbed] }).catch(() => null);
}

export = { runModlogsOrModerations };
