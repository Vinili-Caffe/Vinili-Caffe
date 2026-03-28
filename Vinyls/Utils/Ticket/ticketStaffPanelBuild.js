const {
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  OverwriteType,
} = require("discord.js");
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

function buildTicketStaffPanelPayload(_member, _channel, _ticketDoc) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_panel_nav_add")
      .setLabel("Aggiungi")
      .setStyle(ButtonStyle.Success)
      .setEmoji("➕"),
    new ButtonBuilder()
      .setCustomId("ticket_panel_nav_remove")
      .setLabel("Rimuovi")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("➖"),
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
    new ButtonBuilder()
      .setCustomId("ticket_panel_nav_closerequest")
      .setLabel("Rich. chiusura")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_PinkQuestionMark:1471892611026391306>"),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ticket_panel_nav_transfer")
      .setLabel("Trasferisci claim")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔀"),
  );
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> Pannello ticket — scegli un’azione")
    .setDescription(
      [
        "Usa i pulsanti per continuare. **Claim**, **unclaim** e **chiudi** restano sul messaggio di apertura del ticket.",
        "",
        "**Aggiungi** / **Rimuovi** — aprono un messaggio privato (solo tu) con menu a tendina. *Serve ruolo staff ticket.*",
        "**Switchpanel** — menu categoria (solo **High Staff**).",
        "**Rinomina** — si apre subito il modulo nome canale (solo **High Staff**).",
        "**Rich. chiusura** — modulo motivo, poi messaggio all’apertore (chi ha claimato o **High Staff**).",
        "**Trasferisci claim** — menu utenti nel messaggio privato (ticket **claimato**; claimant o **High Staff**).",
      ].join("\n"),
    );
  return { embed, components: [row1, row2] };
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
      "Ticket **chiusi** di recente (apertore ancora nel server). Scegli dalla lista oppure usa `+ticket reopen <id>`.",
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

module.exports = {
  buildTicketStaffPanelPayload,
  buildTicketReopenOutsidePanelPayload,
  hasStaffTicketRole,
  canSeeTransferPanel,
  canSeeCloseRequestPanel,
  buildRemoveMemberOptions,
};