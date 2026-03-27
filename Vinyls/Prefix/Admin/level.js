const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildExpSettings } = require("../../Services/Community/expService");
const profileDisplayName = user && typeof user === "object"
? String(user.globalName || user.username || user.tag || "").trim() || "Admin"
: "Admin";
const SERVER_SECTIONS = ["home", "settings", "channels", "roles", "multi"];

async function resolveTargetUser(message, raw) {
  const fromMention = message.mentions?.users?.first();
  if (fromMention) return fromMention;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function fmtDiscordList(lines, emptyLabel, maxLines = 18) {
  if (!lines.length) return emptyLabel;
  const shown = lines.slice(0, maxLines);
  const extra = lines.length - shown.length;
  return shown.join("\n") + (extra > 0 ? `\n*(+${extra} altri)*` : "");
}

function formatRoleMultiLines(guild, roleMultipliersMap) {
  const rows = [];
  for (const [roleId, mult] of roleMultipliersMap.entries()) {
    const r = guild?.roles?.cache?.get(roleId);
    const label = r?.name ? `**${r.name}**` : `<@&${roleId}>`;
    rows.push(`${label} — **${mult}x**`);
  }
  return rows;
}

function buildServerSectionEmbed(guild, settings, section) {
  const sec = SERVER_SECTIONS.includes(section) ? section : "home";
  const base = new EmbedBuilder().setColor("#6f4e37");
  if (sec === "home") {
    const eventActive = Boolean(settings?.eventExpiresAt && settings.eventExpiresAt.getTime() > Date.now());
    const lockLines = (settings?.lockedChannelIds || []).map((id) => `<#${id}>`);
    const ignoreLines = (settings?.ignoredRoleIds || []).map((id) => `<@&${id}>`);
    const multiMap = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : new Map();
    const multiLines = formatRoleMultiLines(guild, multiMap);
    const lines = [
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `**Multi globale:** **${settings?.baseMultiplier ?? 1}x**`,
    ];
    if (eventActive) {
      lines.push(
        `**Multi evento:** **${settings?.eventMultiplier ?? 1}x** — fino al **${settings.eventExpiresAt ? settings.eventExpiresAt.toLocaleString("it-IT", { hour12: false }) : "-"}**`,
      );
    }
    lines.push(
      "",
      "**Canali bloccati (EXP)**",
      fmtDiscordList(lockLines, "_Nessuno_"),
      "",
      "**Ruoli bloccati (EXP)**",
      fmtDiscordList(ignoreLines, "_Nessuno_"),
      "",
      "**Multi ruoli**",
      fmtDiscordList(multiLines, "_Nessuno_"),
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu per cambiare sezione e i pulsanti per modificare la configurazione.",
    );
    return base.setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${profileDisplayName}.`).setDescription(lines.join("\n"));
  }
  if (sec === "settings") {
    return base
      .setTitle("Level — Impostazioni")
      .setDescription(
        [
          "<:VC_Info:1482526956703580372> **Moltiplicatori**",
          "",
          "- **Moltiplicatore globale** — si applica sempre all’EXP (base).",
          "- **Evento EXP** — moltiplicatore temporaneo con scadenza.",
          "",
          "<:VC_Modifica:1478859646587633717> Usa i pulsanti qui sotto.",
        ].join("\n"),
      );
  }
  if (sec === "channels") {
    return base
      .setTitle("Level — Canali")
      .setDescription(
        [
          "<:VC_Info:1482526956703580372> **Canali EXP**",
          "",
          "Blocca o sblocca l’EXP in un canale (lista **bloccati** nella Home).",
          "",
          "<:VC_Modifica:1478859646587633717> Usa i pulsanti per inserire un canale.",
        ].join("\n"),
      );
  }
  if (sec === "roles") {
    return base
      .setTitle("Level — Ruoli")
      .setDescription(
        [
          "<:VC_Info:1482526956703580372> **Ruoli EXP**",
          "",
          "Escludi o riabilita ruoli dal guadagno EXP.",
          "",
          "<:VC_Modifica:1478859646587633717> Usa i pulsanti per inserire un ruolo.",
        ].join("\n"),
      );
  }
  return base
    .setTitle("Level — Multi ruoli")
    .setDescription(
      [
        "<:VC_Info:1482526956703580372> **Moltiplicatori per ruolo**",
        "",
        "Imposta un moltiplicatore per un ruolo (sovrascrive i default del bot dove presente). Rimuovi l’override per tornare al default.",
        "",
        "<:VC_Modifica:1478859646587633717> Usa i pulsanti qui sotto.",
      ].join("\n"),
    );
}

function buildServerSectionButtonRow(section, ownerId) {
  const safeOwner = String(ownerId || "");
  if (section === "settings") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:gmulti:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Moltiplicatore globale"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:event:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Evento EXP"),
    );
  }
  if (section === "channels") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:lock:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Blocca canale"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:unlock:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Sblocca canale"),
    );
  }
  if (section === "roles") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:ignore:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Ignora ruolo"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:unignore:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Riabilita ruolo"),
    );
  }
  if (section === "multi") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:role_multi_set:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Imposta multi ruolo"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:role_multi_remove:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Rimuovi override"),
    );
  }
  return null;
}

function buildServerNavSelect(ownerId, currentSection) {
  const safeOwner = String(ownerId || "");
  const cur = SERVER_SECTIONS.includes(currentSection) ? currentSection : "home";
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`level_panel:server_nav:${safeOwner}`)
      .setPlaceholder("Sezione pannello")
      .addOptions(
        { label: "Home", value: "home", default: cur === "home", description: "Riepilogo configurazione" },
        { label: "Settings", value: "settings", default: cur === "settings", description: "Multi globale ed evento" },
        { label: "Canali", value: "channels", default: cur === "channels", description: "Blocca / sblocca canali" },
        { label: "Ruoli", value: "roles", default: cur === "roles", description: "Ignora / riabilita ruoli" },
        { label: "Multi", value: "multi", default: cur === "multi", description: "Moltiplicatori per ruolo" },
      ),
  );
}

async function buildLevelServerPanelPayload(guild, ownerId, section = "home") {
  const safeOwner = String(ownerId || "");
  const secRaw = String(section || "home").toLowerCase();
  const sec = SERVER_SECTIONS.includes(secRaw) ? secRaw : "home";
  const settings = await getGuildExpSettings(guild?.id);
  const embed = buildServerSectionEmbed(guild, settings, sec);
  const iconUrl = guild?.iconURL?.({ size: 256, extension: "png" });
  if (iconUrl) embed.setThumbnail(iconUrl);
  const rowNav = buildServerNavSelect(safeOwner, sec);
  const components = [rowNav];
  if (sec !== "home") {
    const rowBtn = buildServerSectionButtonRow(sec, safeOwner);
    if (rowBtn) components.push(rowBtn);
  }
  return { embeds: [embed], components };
}

module.exports = {
  name: "level",
  aliases: [],
  usage: "+level | +level <@utente | id>",
  examples: ["+level", "+level @utente"],

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const guildId = message.guild?.id;
    if (!guildId) return;

    if (!args.length) {
      await safeMessageReply(message, {
        ...(await buildLevelServerPanelPayload(message.guild, message.author.id, "home")),
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = await resolveTargetUser(message, args[0]);
    if (!target) {
      await safeMessageReply(message, {
        content:
          "<:vegax:1443934876440068179> Usa `+level` oppure `+level <@utente | id>`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await safeMessageReply(message, {
      ...buildLevelUserPanelPayload(message.author.id, target.id),
      allowedMentions: { repliedUser: false },
    });
  },
};

function buildLevelUserPanelPayload(ownerId, targetUserId) {
  const safeOwner = String(ownerId || "");
  const safeTarget = String(targetUserId || "");
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${profileDisplayName}.`)
    .setDescription([
      `Target: <@${safeTarget}>`,
      "",
      "Azioni rapide disponibili:",
      "- set exp/level",
      "- add/remove livelli",
      "- reset livello",
      "- sync ruoli livello",
    ].join("\n"));

  const rowActions = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`level_panel:user_actions:${safeOwner}:${safeTarget}`)
      .setPlaceholder("Scegli azione utente")
      .addOptions(
        { label: "set", value: "set", description: "Imposta exp o level manualmente" },
        { label: "add", value: "add", description: "Aggiunge livelli all'utente" },
        { label: "remove", value: "remove", description: "Rimuove livelli all'utente" },
        { label: "reset", value: "reset", description: "Azzera exp/livello dell'utente" },
        { label: "syncroles", value: "syncroles", description: "Sincronizza ruoli livello dell'utente" },
      ),
  );
  return { embeds: [embed], components: [rowActions] };
}

module.exports.buildLevelServerPanelPayload = buildLevelServerPanelPayload;
module.exports.buildLevelUserPanelPayload = buildLevelUserPanelPayload;