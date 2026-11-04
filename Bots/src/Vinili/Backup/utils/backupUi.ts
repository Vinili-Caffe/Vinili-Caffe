const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const CHANNEL_TYPE_LABEL = {
  0: E.channeltext,
  2: E.voice,
  4: E.VC_category,
  5: E.VC_Announce,
  13: E.VC_stage,
  15: E.forum,
  16: E.link,
};

function formatBytes(bytes?) {
  const size = Number(bytes || 0);
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const idx = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const val = size / 1024 ** idx;
  return `${val.toFixed(val >= 100 || idx === 0 ? 0 : 2)} ${units[idx]}`;
}

function truncateLines(lines?, maxLines = 32) {
  if (!Array.isArray(lines)) return [];
  if (lines.length <= maxLines) return lines;
  return [...lines.slice(0, maxLines), `... (+${lines.length - maxLines})`];
}

function toCodeBlock(lines?) {
  const safe = truncateLines(lines).join("\n").slice(0, 950);
  return `\`\`\`\n${safe || "-"}\n\`\`\``;
}

function buildCreatingEmbed() {
  return new EmbedBuilder()
    .setColor("#4aa3ff")
    .setDescription(`${E.VC_Loading} **Creazione backup in corso...**`);
}

function buildSuccessEmbed(guild?, result?) {
  const g = guild || null;
  return new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle("Completato")
    .setDescription(
      [
        `${E.success} Backup creato con successo con ID \`${result.backupId}\`.`,
        "",
        `${E.VC_InactiveStatus} Da qui: nel pannello **+backup** usa il menu **Info** o **Carica**.`,
      ].join("\n"),
    )
    .addFields([
      {
        name: `${E.success} Salvato`,
        value: [
          `${E.member_role_icon} Membri/Bot: **${result.stats.members}**`,
          `${E.VC_Mention} Ruoli: **${result.stats.roles}**`,
          `${E.channeltext} Canali: **${result.stats.channels}**`,
          `${E.VC_threads} Thread: **${result.stats.threads}**`,
          `${E.VC_Chat} Messaggi: **${result.stats.messages}**`,
          `${E.VC_BanHammer} Bans: **${result.stats.bans}**`,
          `${E.VC_Link} Invites: **${result.stats.invites}**`,
          `${E.VC_webhooks} Webhooks: **${result.stats.webhooks}**`,
          `${E.VC_file} File: \`${result.fileName}\` (${formatBytes(result.sizeBytes)})`,
        ].join("\n"),
        inline: false,
      },
    ])
    .setFooter({
      text: g?.name || "Backup",
      iconURL: g?.iconURL?.() || null,
    })
    .setTimestamp();
}

function buildErrorEmbed(error?, title = `${E.cancel} Backup non riuscito`) {
  const detail = String(error?.message || error || "Errore sconosciuto").slice(0, 400);
  return new EmbedBuilder().setColor("Red").setTitle(title).setDescription(`${E.vegax} ${detail}`);
}

function sortChannels(channels = []) {
  return [...channels].sort((a?, b?) => {
    const typeA = Number(a?.type ?? 0);
    const typeB = Number(b?.type ?? 0);
    if (typeA === 4 && typeB !== 4) return -1;
    if (typeA !== 4 && typeB === 4) return 1;
    const posA = Number(a?.position ?? 0);
    const posB = Number(b?.position ?? 0);
    if (posA !== posB) return posA - posB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "it");
  });
}

function formatChannelList(channels = []) {
  const sorted = sortChannels(channels);
  const categories = sorted.filter((c?) => Number(c.type) === 4);
  const children = sorted.filter((c?) => Number(c.type) !== 4);
  const byParent = new Map();

  for (const child of children) {
    const parentId = child.parentId ? String(child.parentId) : "root";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(child);
  }

  let i = 1;
  const out = [];

  for (const category of categories) {
    out.push(`${i}. ${CHANNEL_TYPE_LABEL[4]} ${category.name}`);
    i += 1;

    const list = sortChannels(byParent.get(String(category.id)) || []);
    for (const ch of list) {
      const icon = CHANNEL_TYPE_LABEL[Number(ch.type)] || "#";
      out.push(`${i}.   ${icon} ${ch.name}`);
      i += 1;
    }
  }

  const uncategorized = sortChannels(byParent.get("root") || []);
  for (const ch of uncategorized) {
    const icon = CHANNEL_TYPE_LABEL[Number(ch.type)] || "#";
    out.push(`${i}. ${icon} ${ch.name}`);
    i += 1;
  }

  return out;
}

function formatRoleList(roles = []) {
  const sorted = [...roles].sort((a?, b?) => Number(b?.position ?? 0) - Number(a?.position ?? 0));
  return sorted.map((role?, idx?) => `${idx + 1}. ${role.name}`);
}

function countMessages(payload?) {
  const chMap = payload?.messages?.channels || {};
  const thMap = payload?.messages?.threads || {};
  const channels = Object.values(chMap).reduce((sum?, list?) => sum + (Array.isArray(list) ? list.length : 0), 0);
  const threads = Object.values(thMap).reduce((sum?, list?) => sum + (Array.isArray(list) ? list.length : 0), 0);
  return channels + threads;
}

function buildInfoEmbed(guild?, backupId?, backupData?, fileSize?, checksum = null) {
  const payload = backupData || {};
  const payloadGuild = payload.guild || {};
  const roles = Array.isArray(payload.roles) ? payload.roles : [];
  const channels = Array.isArray(payload.channels) ? payload.channels : [];
  const threads = Array.isArray(payload.threads) ? payload.threads : [];
  const members = Array.isArray(payload.members) ? payload.members : [];
  const bans = Array.isArray(payload.bans) ? payload.bans : [];
  const totalMessages = countMessages(payload);
  const channelLines = formatChannelList(channels);
  const roleLines = formatRoleList(roles);
  const createdAt = Math.floor(new Date(payload.createdAt || Date.now()).getTime() / 1000);

  const minimalBackup = totalMessages <= 0 && members.length <= 0 && bans.length <= 0;

  const embed = new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(
      `${E.VC_InactiveStatus} Info Backup - ${payloadGuild.name || guild?.name || "Server sconosciuto"}`,
    )
    .setDescription(
      minimalBackup
        ? `${E.vegax} Questo backup non contiene messaggi, membri o ban.`
        : `${E.VC_InactiveStatus} Questo backup contiene uno snapshot completo del server.`,
    )
    .addFields([
      {
        name: `${E.VC_Clock} Creato il`,
        value: `<t:${createdAt}:R>`,
        inline: true,
      },
      {
        name: `${E.VC_Timer} Conservato fino a`,
        value: "per sempre",
        inline: true,
      },
      {
        name: `${E.VC_id} Backup ID`,
        value: `\`${backupId}\``,
        inline: true,
      },
      { name: "Canali", value: String(channels.length), inline: true },
      { name: "Ruoli", value: String(roles.length), inline: true },
      { name: "Thread", value: String(threads.length), inline: true },
      { name: "Canali", value: toCodeBlock(channelLines), inline: true },
      { name: "Ruoli", value: toCodeBlock(roleLines), inline: true },
      { name: "Membri", value: String(members.length), inline: true },
      { name: "Ban", value: String(bans.length), inline: true },
      {
        name: "Messaggi",
        value: `${totalMessages} totali`,
        inline: true,
      },
      {
        name: `${E.VC_file} File backup`,
        value: `\`${backupId}.json.gz\` (${formatBytes(fileSize)})`,
        inline: false,
      },
      {
        name: `${E.VC_Link} Integrità`,
        value: checksum
          ? `\`SHA256\` payload: \`${String(checksum.payload || "").slice(0, 12)}...\`\n\`SHA256\` compressed: \`${String(checksum.compressed || "").slice(0, 12)}...\``
          : "N/D",
        inline: false,
      },
    ])
    .setFooter({
      text: guild?.name || "Backup",
      iconURL: guild?.iconURL?.() || null,
    })
    .setTimestamp();

  return embed;
}

function buildLoadStatusEmbed(status?) {
  if (!status) {
    return new EmbedBuilder()
      .setColor("#3498db")
      .setTitle(`${E.VC_Loading__969578} Stato caricamento backup`)
      .setDescription(`${E.cancel} Nessun backup load in corso in questo server.`);
  }
  const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
  const actions = Array.isArray(status.actions) ? status.actions : [];
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(`${E.VC_InactiveStatus} Stato caricamento backup`)
    .setDescription(
      [
        `${E.VC_id} Backup ID: \`${String(status.backupId || "").toUpperCase()}\``,
        `${E.VC_Clock} Avviato: <t:${startedAt}:R>`,
        `${E.VC_Loading} Fase: \`${String(status.phase || "avvio")}\``,
        `${E.VC_Loading__969578} Elementi processati: **${Number(status.processed || 0)}**`,
        `${E.cancel} Annullamento richiesto: **${status.cancelRequested ? "sì" : "no"}**`,
        `${E.VC_Link} Limite messaggi: \`${status.messagesLimit == null ? "TUTTI" : Number(status.messagesLimit || 0)}\``,
        `${E.VC_BanHammer} Azioni: ${actions.length ? `\`${actions.join("`, `")}\`` : "nessuna"}`,
      ].join("\n"),
    );
}

function buildLoadCancelResultEmbed(cancelled?) {
  return new EmbedBuilder()
    .setColor(cancelled ? "#2ecc71" : "#3498db")
    .setTitle(cancelled ? "${E.success} Completato" : " ${E.VC_InactiveStatus} Info")
    .setDescription(
      cancelled
        ? "${E.success} Richiesta di annullamento inviata. Il processo verrà fermato appena possibile."
        : "${E.cancel} Nessun backup load attivo da annullare.",
    );
}

export = {
  buildCreatingEmbed,
  buildSuccessEmbed,
  buildErrorEmbed,
  buildInfoEmbed,
  buildLoadStatusEmbed,
  buildLoadCancelResultEmbed,
  sortChannels,
};