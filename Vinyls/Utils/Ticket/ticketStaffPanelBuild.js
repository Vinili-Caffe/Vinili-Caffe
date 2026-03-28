const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, OverwriteType } = require("discord.js");
const IDs = require("../Config/ids");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGHSTAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNERMANAGER_ROLE_ID = IDs.roles.PartnerManager;

function hasStaffTicketRole(member) {
  if (!member?.roles?.cache) return false;
  return [STAFF_ROLE_ID, HIGHSTAFF_ROLE_ID, PARTNERMANAGER_ROLE_ID].some(
    (id) => id && member.roles.cache.has(id),
  );
}

function canSeeTransferPanel(member, ticketDoc) {
  const claimer = String(ticketDoc?.claimedBy || "").trim();
  if (!claimer) return false;
  if (String(member?.id || "") === claimer) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function canSeeCloseRequestPanel(member, ticketDoc) {
  if (!ticketDoc) return false;
  const claimer = String(ticketDoc.claimedBy || "").trim();
  if (claimer && String(member?.id || "") === claimer) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function getBotAvatarUrl(channelOrGuild) {
  const client = channelOrGuild?.client || channelOrGuild?.guild?.client;
  return client?.user?.displayAvatarURL?.() || null;
}

function buildRemoveMemberOptions(channel) {
  const ids = [];
  for (const ow of channel.permissionOverwrites.cache.values()) {
    if (ow.type === OverwriteType.Member) ids.push(ow.id);
  }
  const guild = channel.guild;
  const options = [];
  for (const id of ids) {
    if (options.length >= 25) break;
    const mem = guild.members.cache.get(id);
    if (!mem || mem.user?.bot) continue;
    options.push({
      label: String(mem.displayName || mem.user?.username || id).slice(0, 100),
      value: id,
      description: String(mem.user?.username || "").slice(0, 100),
    });
  }
  return options.sort((a, b) => a.label.localeCompare(b.label, "it"));
}

function buildTicketStaffPanelPayload(member, channel, ticketDoc) {
  const isHighStaff = Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
  const staffTicket = hasStaffTicketRole(member);
  const remOptsLen = staffTicket ? buildRemoveMemberOptions(channel).length : 0;
  const claimedTrim = String(ticketDoc?.claimedBy || "").trim();
  const showTransfer = Boolean(claimedTrim && canSeeTransferPanel(member, ticketDoc));
  const showCloseReq = canSeeCloseRequestPanel(member, ticketDoc);

  const buttons = [];
  if (staffTicket) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_add")
        .setLabel("Aggiungi")
        .setStyle(ButtonStyle.Success)
        .setEmoji("<:VC_addperson:1485419347068588073>"),
    );
  }
  if (staffTicket && remOptsLen > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_remove")
        .setLabel("Rimuovi")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("<:VC_addperson:1485419347068588073>"),
    );
  }
  if (isHighStaff) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_switch")
        .setLabel("Switch Panel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_id:1478517313618575419>"),
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_rename")
        .setLabel("Rinomina")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Modifica:1478859646587633717>"),
    );
  }
  if (showCloseReq) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_closerequest")
        .setLabel("Richiedi Chiusura")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_close:1478517239136256020>"),
    );
  }
  if (showTransfer) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_transfer")
        .setLabel("Trasferisci")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_claim:1478517202016669887>"),
    );
  }

  const components = [];
  for (let i = 0; i < buttons.length; i += 5) {
    components.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }

  const desc = [
    "Questo è il pannello per gestire al completo il tuo ticket.",
    "",
  ];
  if (staffTicket) {
    desc.push(
      "**Aggiungi** — Aggiungi un utente al ticket.",
      "**Rimuovi** — Rimuovi un utente dal ticket."
    );
  }
  if (isHighStaff) {
    desc.push(
      "**Switch Panel** - Cambia il panel del ticket.",
      "**Rinomina** - Rinomina il ticket.");
  }
  if (showCloseReq) {
    desc.push(
      "**Richiedi Chiusura** - Richiedi la chiusura del ticket."
    );
  }
  if (showTransfer) {
    desc.push(
      "**Trasferisci** - Trasferisci il claim del ticket a un altro staffer."
    );
  }
  if (desc.length <= 2) {
    desc.push("Qui non compaiono azioni per i tuoi permessi: usa i bottoni sopra se applicabili.",
      "Se hai bisogno di aiuto, contatta un staff membro.");
  }

  const thumbnailUrl = getBotAvatarUrl(channel);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> TICKET PANEL")
    .setDescription(desc.join("\n"))
    .setThumbnail(thumbnailUrl || undefined);

  return { embed, components };
}

function buildTicketReopenOutsidePanelPayload(guild, closedTicketDocs) {
  if (!guild?.members?.cache || !Array.isArray(closedTicketDocs) || !closedTicketDocs.length) return null;
  const options = [];
  for (const t of closedTicketDocs) {
    if (options.length >= 25) break;
    const num = Number(t.ticketNumber);
    if (!Number.isInteger(num) || num <= 0) continue;
    const mem = guild.members.cache.get(t.userId);
    if (!mem) continue;
    const who = String(mem.displayName || mem.user?.username || mem.id).slice(0, 60);
    options.push({
      label: `#${num} — ${who}`.slice(0, 100),
      value: String(num),
      description: `Apertore: ${String(mem.user?.username || mem.id).slice(0, 90)}`,
    });
  }
  if (!options.length) return null;
  const thumbnailUrl = getBotAvatarUrl(guild);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> TICKET PANEL")
    .setDescription("<:VC_id:1478517313618575419> Scegli dalla lista un ticket da riaprire…")
    .setThumbnail(thumbnailUrl || undefined);
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("ticket_panel_reopen_pick")
      .setPlaceholder("🔄 Seleziona un ticket da riaprire…")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(options),
  );
  return { embed, components: [row] };
}

module.exports = { buildTicketStaffPanelPayload, buildTicketReopenOutsidePanelPayload, hasStaffTicketRole, canSeeTransferPanel, canSeeCloseRequestPanel, buildRemoveMemberOptions };  