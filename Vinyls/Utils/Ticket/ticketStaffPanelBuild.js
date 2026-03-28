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
        .setEmoji("➕"),
    );
  }
  if (staffTicket && remOptsLen > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_remove")
        .setLabel("Rimuovi")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("➖"),
    );
  }
  if (isHighStaff) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_switch")
        .setLabel("Switchpanel")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔄"),
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_rename")
        .setLabel("Rinomina")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Ticket:1482535175283019888>"),
    );
  }
  if (showCloseReq) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_closerequest")
        .setLabel("Richiedi Chiusura")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_PinkQuestionMark:1471892611026391306>"),
    );
  }
  if (showTransfer) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_nav_transfer")
        .setLabel("Trasferisci claim")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔀"),
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
      "**Aggiungi** — menu utenti. **Rimuovi** — solo se c'è almeno un membro da togliere dai permessi del canale.",
    );
  }
  if (isHighStaff) {
    desc.push("**Switch** / **Rinomina**.");
  }
  if (showCloseReq) {
    desc.push("**Richiedi Chiusura**.");
  }
  if (showTransfer) {
    desc.push("**Trasferisci**.");
  }
  if (desc.length <= 2) {
    desc.push("Qui non compaiono azioni per i tuoi permessi: usa i bottoni sopra se applicabili.");
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(desc.join("\n"));

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
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> Riapri ticket")
    .setDescription(
      "Ticket **chiusi** di recente. Scegli dalla lista oppure usa +ticket reopen <id>.",
    );
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