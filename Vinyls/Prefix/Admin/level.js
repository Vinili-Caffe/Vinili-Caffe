const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildExpSettings, getLevelInfo } = require("../../Services/Community/expService");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const SERVER_SECTIONS = ["home", "settings", "channels", "roles", "multi"];

function discordUserDisplayName(userLike) {
  if (!userLike || typeof userLike !== "object") return "Utente";
  return String(userLike.globalName || userLike.username || userLike.tag || "").trim() || "Utente";
}

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

function buildServerSectionEmbed(guild, settings, section, openerUser = null) {
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
      `<:VC_EXP:1482534670896730143> **Multi globale:** **${settings?.baseMultiplier ?? 1}x**`,
    ];
    if (eventActive) {
      lines.push(
        `<a:VC_Events:1482706144953897223> **Multi evento:** **${settings?.eventMultiplier ?? 1}x** — fino al **${settings.eventExpiresAt ? settings.eventExpiresAt.toLocaleString("it-IT", { hour12: false }) : "-"}**`,
      );
    }
    lines.push(
      "",
      "<:VC_Lock:1482526739044368476> **Canali bloccati**",
      fmtDiscordList(lockLines, "_Nessuno_"),
      "",
      "<:VC_Lock:1482526739044368476> **Ruoli bloccati**",
      fmtDiscordList(ignoreLines, "_Nessuno_"),
      "",
      "<:VC_EXP:1482534670896730143> **Multi ruoli**",
      fmtDiscordList(multiLines, "_Nessuno_"),
      "",
      "<:VC_Modifica:1478859646587633717> Usa il menu per cambiare sezione e i pulsanti per modificare la configurazione.",
    );
    const welcome = discordUserDisplayName(openerUser);
    return base.setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${welcome}.`).setDescription(lines.join("\n"));
  }
  if (sec === "settings") {
    const eventActive = Boolean(settings?.eventExpiresAt && settings.eventExpiresAt.getTime() > Date.now());
    const eff = Number(settings?.effectiveMultiplier);
    const effLabel = Number.isFinite(eff) && eff > 0 ? `${eff}x` : `${settings?.baseMultiplier ?? 1}x`;
    const lines = [
      "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
      "",
      `<:VC_EXP:1482534670896730143> **Moltiplicatore globale:** **${settings?.baseMultiplier ?? 1}x**`,
      `<a:VC_Events:1482706144953897223> **Moltiplicatore effettivo:** **${effLabel}**`,
      "",
    ];
    if (eventActive) {
      lines.push(
        `<a:VC_Events:1482706144953897223> **Evento EXP attivo:** **${settings?.eventMultiplier ?? 1}x**`,
        `<a:VC_pixeltime:1482535344103620771> **Scadenza evento:** **${settings.eventExpiresAt ? settings.eventExpiresAt.toLocaleString("it-IT", { hour12: false }) : "-"}**`,
      );
    } else {
      lines.push("<a:VC_Events:1482706144953897223> **Evento EXP:** _Nessun evento attivo_");
    }
    lines.push(
      "",
      "<:VC_Modifica:1478859646587633717> Usa i pulsanti per modificare il moltiplicatore globale o impostare un evento temporaneo.",
    );
    return base.setDescription(lines.join("\n"));
  }
  if (sec === "channels") {
    const lockLines = (settings?.lockedChannelIds || []).map((id) => `<#${id}>`);
    const lines = [
      "<:VC_Info:1482526956703580372> **Canali in cui l’EXP è bloccata:**",
      "",
      fmtDiscordList(lockLines, "<:VC_InactiveStatus:1482526984234860574> _Nessun canale bloccato._"),
      "",
      "<:VC_Modifica:1478859646587633717> Usa i pulsanti per bloccare o sbloccare un canale.",
    ];
    return base.setDescription(lines.join("\n"));
  }
  if (sec === "roles") {
    const ignoreLines = (settings?.ignoredRoleIds || []).map((id) => `<@&${id}>`);
    const lines = [
      "<:VC_Info:1482526956703580372> **Ruoli esclusi dal guadagno EXP:**",
      "",
      fmtDiscordList(ignoreLines, "<:VC_InactiveStatus:1482526984234860574> _Nessun ruolo escluso._"),
      "",
      "<:VC_Modifica:1478859646587633717> Usa i pulsanti per ignorare o riabilitare un ruolo.",
    ];
    return base.setDescription(lines.join("\n"));
  }
  const multiMap = settings?.roleMultipliersMerged instanceof Map ? settings.roleMultipliersMerged : new Map();
  const multiLines = formatRoleMultiLines(guild, multiMap);
  const lines = [
    "<:VC_Info:1482526956703580372> **Moltiplicatori per ruolo:**",
    "",
    fmtDiscordList(multiLines, "<:VC_InactiveStatus:1482526984234860574> _Nessun moltiplicatore configurato._"),
    "",
    "<:VC_Modifica:1478859646587633717> Usa i pulsanti per impostare o rimuovere un moltiplicatore.",
  ];
  return base.setDescription(lines.join("\n"));
}

function buildServerSectionButtonRow(section, ownerId) {
  const safeOwner = String(ownerId || "");
  if (section === "settings") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:gmulti:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Multi globale")
        .setEmoji("<:VC_EXP:1482534670896730143>"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:event:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Multi evento")
        .setEmoji("<a:VC_Events:1482706144953897223>"),
    );
  }
  if (section === "channels") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:lock:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Blocca")
        .setEmoji("<:VC_Lock:1482526739044368476>"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:unlock:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Sblocca")
        .setEmoji("<a:VC_Unlock:1482532082466029608>"),
    );
  }
  if (section === "roles") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:ignore:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Blocca")
        .setEmoji("<:VC_Lock:1482526739044368476>"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:unignore:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Sblocca")
        .setEmoji("<a:VC_Unlock:1482532082466029608>"),
    );
  }
  if (section === "multi") {
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:role_multi_set:${safeOwner}`)
        .setStyle(ButtonStyle.Primary)
        .setLabel("Imposta")
        .setEmoji("<a:VC_Verified:1482532479637127188>"),
      new ButtonBuilder()
        .setCustomId(`level_panel:server_btn:role_multi_remove:${safeOwner}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel("Rimuovi")
        .setEmoji("<a:VC_Cross:1482532424570376253>"),
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
        { label: "Home", emoji: "<a:VC_Rule:1482706839928967280>", value: "home", default: cur === "home", description: "Riepilogo configurazione" },
        { label: "Settings", emoji: "<:VC_Stats:1482527532682055780>", value: "settings", default: cur === "settings", description: "Multi globale ed evento" },
        { label: "Canali", emoji: "<a:VC_Channel:1482534583944871996>", value: "channels", default: cur === "channels", description: "Blocca / sblocca canali" },
        { label: "Ruoli", emoji: "<:VC_addperson:1485419347068588073>", value: "roles", default: cur === "roles", description: "Ignora / riabilita ruoli" },
        { label: "Multi", emoji: "<a:VC_Events:1482706144953897223>", value: "multi", default: cur === "multi", description: "Moltiplicatori per ruolo" },
      ),
  );
}

async function buildLevelServerPanelPayload(guild, ownerId, section = "home", openerUser = null) {
  const safeOwner = String(ownerId || "");
  const secRaw = String(section || "home").toLowerCase();
  const sec = SERVER_SECTIONS.includes(secRaw) ? secRaw : "home";
  const settings = await getGuildExpSettings(guild?.id);
  const embed = buildServerSectionEmbed(guild, settings, sec, openerUser);
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
        ...(await buildLevelServerPanelPayload(message.guild, message.author.id, "home", message.author)),
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
      ...(await buildLevelUserPanelPayload(message.guild, message.author.id, target.id, message.author, target)),
      allowedMentions: { repliedUser: false },
    });
  },
};

async function buildLevelUserPanelPayload(guild, ownerId, targetUserId, openerUser = null, targetUser = null) {
  const safeOwner = String(ownerId || "");
  const safeTarget = String(targetUserId || "");
  const guildId = guild?.id;
  let totalExp = 0;
  let weeklyExp = 0;
  if (guildId && /^\d{16,20}$/.test(safeTarget)) {
    const row = await ActivityUserProfile.findOne({ guildId, userId: safeTarget })
      .select("profile.totals.exp.totalExp profile.totals.exp.weeklyExp")
      .lean()
      .catch(() => null);
    totalExp = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.totalExp || 0)));
    weeklyExp = Math.max(0, Math.floor(Number(row?.profile?.totals?.exp?.weeklyExp || 0)));
  }
  const li = getLevelInfo(totalExp);
  const targetName = discordUserDisplayName(targetUser);
  const welcome = discordUserDisplayName(openerUser);
  const lines = [
    "<:VC_Info:1482526956703580372> **Configurazione attuale:**",
    "",
    `<:VC_addperson:1485419347068588073> **Utente:** <@${safeTarget}> (${targetName})`,
    `<:VC_Leaderboard:1482534806314287387> **Livello:** **${li.level}**`,
    `<:VC_EXP:1482534670896730143> **Totale:** **${totalExp}**`,
    `<:VC_EXP:1482534670896730143> **Settimanale:** **${weeklyExp}**`,
    `<a:VC_pixeltime:1482535344103620771> **Progresso:** **${li.progressPercent}%** (_mancano ${li.remainingToNext} EXP_)`,
    "",
    "<:VC_Modifica:1478859646587633717> Usa i pulsanti per impostare EXP/livello, aggiungere o togliere livelli, resettare o sincronizzare i ruoli.",
  ];
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<a:VC_Announce:1482534613568979007> Benvenuto ${welcome}.`)
    .setDescription(lines.join("\n"));
  const iconUrl = guild?.iconURL?.({ size: 256, extension: "png" });
  if (iconUrl) embed.setThumbnail(iconUrl);

  const rowButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`level_panel:user_btn:set:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel("Imposta")
      .setEmoji("<:VC_Modifica:1478859646587633717>"),
    new ButtonBuilder()
      .setCustomId(`level_panel:user_btn:add:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Success)
      .setLabel("Aggiungi")
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId(`level_panel:user_btn:remove:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel("Rimuovi")
      .setEmoji("➖"),
    new ButtonBuilder()
      .setCustomId(`level_panel:user_btn:reset:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Primary)
      .setLabel("Reset")
      .setEmoji("<:VC_update:1478721333096349817>"),
    new ButtonBuilder()
      .setCustomId(`level_panel:user_btn:syncroles:${safeOwner}:${safeTarget}`)
      .setStyle(ButtonStyle.Success)
      .setLabel("Sincronizza")
      .setEmoji("<:VC_download:1478825280436175009>"),
  );
  return { embeds: [embed], components: [rowButtons] };
}

module.exports.buildLevelServerPanelPayload = buildLevelServerPanelPayload;
module.exports.buildLevelUserPanelPayload = buildLevelUserPanelPayload;