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
  if (!ticketDoc?.claimedBy) return false;
  if (member?.id === ticketDoc.claimedBy) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function canSeeCloseRequestPanel(member, ticketDoc) {
  if (!ticketDoc) return false;
  if (member?.id === ticketDoc.claimedBy) return true;
  return Boolean(HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID));
}

function buildAddMemberOptions(guild) {
  const list = guild.members.cache
    .filter((m) => m && !m.user?.bot)
    .map((m) => m)
    .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"))
    .slice(0, 25);
  return list.map((m) => ({
    label: String(m.displayName || m.user?.username || m.id).slice(0, 100),
    value: m.id,
    description: String(m.user?.username || "").slice(0, 100),
  }));
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

function buildTicketStaffPanelPayload(member, channel, ticketDoc, canClaimTicketFn) {
  const rows = [];
  const guild = channel.guild;

  if (hasStaffTicketRole(member)) {
    const addOpts = buildAddMemberOptions(guild);
    if (addOpts.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_panel_add_member")
            .setPlaceholder("➕ Aggiungi un utente al ticket…")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(addOpts),
        ),
      );
    }
    const remOpts = buildRemoveMemberOptions(channel);
    if (remOpts.length) {
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_panel_remove_member")
            .setPlaceholder("➖ Rimuovi un utente dal ticket…")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(remOpts),
        ),
      );
    }
  }

  if (ticketDoc && canSeeTransferPanel(member, ticketDoc) && canClaimTicketFn) {
    const transferCandidates = guild.members.cache
      .filter((m) => {
        if (!m || m.user?.bot) return false;
        return canClaimTicketFn(m, ticketDoc.ticketType, guild.id);
      })
      .map((m) => m)
      .filter((m) => m.id !== ticketDoc.userId && m.id !== ticketDoc.claimedBy)
      .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || ""), "it"))
      .slice(0, 25);
    if (transferCandidates.length) {
      const tOpts = transferCandidates.map((m) => ({
        label: String(m.displayName || m.user?.username || m.id).slice(0, 100),
        value: m.id,
        description: "Trasferisci il claim a questo utente",
      }));
      rows.push(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_panel_transfer_user")
            .setPlaceholder("🔀 Trasferisci claim…")
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(tOpts),
        ),
      );
    }
  }

  if (HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
    rows.push(
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("ticket_panel_switch_category")
          .setPlaceholder("🔄 Cambia categoria ticket (switchpanel)…")
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(
            {
              label: "Supporto",
              value: "supporto",
              description: "Prima categoria",
            },
            {
              label: "Partnership",
              value: "partnership",
              description: "Seconda categoria",
            },
            {
              label: "High Staff",
              value: "highstaff",
              description: "Terza categoria",
            },
          ),
      ),
    );
  }

  const buttonRow = [];
  if (HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)) {
    buttonRow.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_rename")
        .setLabel("Rinomina canale")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:VC_Ticket:1482535175283019888>"),
    );
  }
  if (canSeeCloseRequestPanel(member, ticketDoc)) {
    buttonRow.push(
      new ButtonBuilder()
        .setCustomId("ticket_panel_closerequest")
        .setLabel("Richiesta chiusura")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("<:VC_PinkQuestionMark:1471892611026391306>"),
    );
  }
  if (buttonRow.length) {
    rows.push(new ActionRowBuilder().addComponents(buttonRow));
  }

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:VC_Ticket:1482535175283019888> Pannello azioni ticket")
    .setDescription(
      [
        "Scegli un’azione qui sotto. **Claim**, **unclaim** e **chiudi** restano nel messaggio di apertura del ticket.",
        "",
        hasStaffTicketRole(member)
          ? "**Staff:** aggiungi o rimuovi utenti con i menu a tendina."
          : "",
        canSeeTransferPanel(member, ticketDoc) ? "**Claim:** puoi trasferire il claim con il menu dedicato." : "",
        HIGHSTAFF_ROLE_ID && member?.roles?.cache?.has(HIGHSTAFF_ROLE_ID)
          ? "**High Staff:** switch categoria o rinomina."
          : "",
        canSeeCloseRequestPanel(member, ticketDoc)
          ? "**Richiesta chiusura:** invia la richiesta all’apertore (come `+ticket closerequest`)."
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );

  return { embed, components: rows.slice(0, 5) };
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
};