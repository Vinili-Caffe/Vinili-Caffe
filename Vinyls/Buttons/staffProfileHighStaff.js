const {
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { STAFF_HP_PREFIX } = require("../Utils/Staff/staffProfilePanelRuntime");
const {
  runProfileStaffPex,
  runProspectStaffPex,
  runProfileStaffDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
} = require("../Commands/Staff/staff");
const valutazioneCmd = require("../Commands/Staff/valutazione");
const { addPartnerPoints, removePartnerPoints, formatPartnerPointsChange } = require("../Commands/Admin/partnerpoints");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils");

const MODAL_PREFIX = "staff_hp_modal";
const IN_REASON = "staff_hp_reason";
const IN_IDX = "staff_hp_idx";
const IN_PPM_AMOUNT = "staff_hp_ppm_amount";
const IN_PPM_LINK = "staff_hp_ppm_link";
const PRIVATE_FLAG = 1 << 6;
const MAX_PPM_AMOUNT = 10000;

const TITLE_BY_ACTION = {
  pex: "Motivo pex",
  depex: "Motivo depex",
  valpos: "Motivo valutazione positiva",
  valneg: "Motivo valutazione negativa",
  warn: "Motivo warn staff",
  valpos_rm: "Rimuovi valutazione positiva",
  valneg_rm: "Rimuovi valutazione negativa",
  warn_rm: "Rimuovi warn staff",
  ppm_add: "Aggiungi punti partner",
  ppm_remove: "Rimuovi punti partner",
};

function parseStaffHpButton(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== STAFF_HP_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const allowed = new Set([
    "pex",
    "depex",
    "valpos",
    "valneg",
    "warn",
    "valpos_rm",
    "valneg_rm",
    "warn_rm",
    "ppm_add",
    "ppm_remove",
  ]);
  if (!allowed.has(action)) return null;
  return { action, viewerId, targetId };
}

function parseStaffHpModal(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== MODAL_PREFIX) return null;
  const action = String(parts[1] || "");
  const viewerId = String(parts[2] || "");
  const targetId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(viewerId) || !/^\d{16,20}$/.test(targetId)) return null;
  const allowed = new Set([
    "pex",
    "depex",
    "valpos",
    "valneg",
    "warn",
    "valpos_rm",
    "valneg_rm",
    "warn_rm",
    "ppm_add",
    "ppm_remove",
  ]);
  if (!allowed.has(action)) return null;
  return { action, viewerId, targetId };
}

async function ensureHighStaffViewer(interaction) {
  const roleId = IDs.roles?.HighStaff;
  const has = Boolean(roleId && interaction.member?.roles?.cache?.has(roleId));
  if (has) return true;
  await interaction
    .reply({
      content: "<:vegax:1443934876440068179> Solo l'**High Staff** può usare questi pulsanti.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => {});
  return false;
}

function buildReasonModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const input = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  modal.addComponents(new ActionRowBuilder().addComponents(input));
  return modal;
}

function buildIdReasonModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const idInput = new TextInputBuilder()
    .setCustomId(IN_IDX)
    .setLabel("Numero (1, 2, 3… dalla lista)")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(4);
  const reasonInput = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo rimozione")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  modal.addComponents(
    new ActionRowBuilder().addComponents(idInput),
    new ActionRowBuilder().addComponents(reasonInput),
  );
  return modal;
}

function buildPpmAddModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const amt = new TextInputBuilder()
    .setCustomId(IN_PPM_AMOUNT)
    .setLabel("Quantità punti")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  modal.addComponents(new ActionRowBuilder().addComponents(amt));
  return modal;
}

function buildPpmRemoveModal(customId, title) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(String(title).slice(0, 45));
  const amt = new TextInputBuilder()
    .setCustomId(IN_PPM_AMOUNT)
    .setLabel("Quantità da rimuovere")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(5);
  const reasonInput = new TextInputBuilder()
    .setCustomId(IN_REASON)
    .setLabel("Motivo")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500);
  const linkInput = new TextInputBuilder()
    .setCustomId(IN_PPM_LINK)
    .setLabel("Link messaggio")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(200);
  modal.addComponents(
    new ActionRowBuilder().addComponents(amt),
    new ActionRowBuilder().addComponents(reasonInput),
    new ActionRowBuilder().addComponents(linkInput),
  );
  return modal;
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_HP_PREFIX}:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${MODAL_PREFIX}:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    const parsed = parseStaffHpButton(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usare questi pulsanti.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (!(await ensureHighStaffViewer(interaction))) return true;
    const modalId = `${MODAL_PREFIX}:${parsed.action}:${parsed.viewerId}:${parsed.targetId}`;
    const title = TITLE_BY_ACTION[parsed.action] || "Azione staff";
    let modal;
    if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm" || parsed.action === "warn_rm") {
      modal = buildIdReasonModal(modalId, title);
    } else if (parsed.action === "ppm_add") {
      modal = buildPpmAddModal(modalId, title);
    } else if (parsed.action === "ppm_remove") {
      modal = buildPpmRemoveModal(modalId, title);
    } else {
      modal = buildReasonModal(modalId, title);
    }
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseStaffHpModal(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può inviare questo modulo.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (!(await ensureHighStaffViewer(interaction))) return true;
    const guild = interaction.guild;
    if (!guild) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Solo nel server.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    const reason = String(interaction.fields?.getTextInputValue(IN_REASON) || "").trim().slice(0, 500);
    const targetUser = await interaction.client.users.fetch(parsed.targetId).catch(() => null);
    if (!targetUser) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Utente non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    let res;
    if (parsed.action === "ppm_add") {
      const rawAmt = String(interaction.fields?.getTextInputValue(IN_PPM_AMOUNT) || "").trim();
      const amount = parseInt(rawAmt, 10);
      if (!Number.isInteger(amount) || amount < 1) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Quantità non valida.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      if (amount > MAX_PPM_AMOUNT) {
        await interaction
          .reply({
            content: `<:vegax:1443934876440068179> Massimo \`${MAX_PPM_AMOUNT}\` punti per operazione.`,
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await interaction
          .reply({
            content:
              "<:vegax:1443934876440068179> I punti partner si gestiscono solo per utenti con il ruolo **Partner Manager**.",
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return true;
      }
      const staffData = await addPartnerPoints(guild.id, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("add", amount);
      await interaction
        .reply({
          content: `<:vegacheckmark:1443666279058772028> **${changeLabel}** a ${targetUser}. Totale: \`${staffData?.staff?.partnerCount ?? 0}\`.`,
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (parsed.action === "ppm_remove") {
      const rawAmt = String(interaction.fields?.getTextInputValue(IN_PPM_AMOUNT) || "").trim();
      const amount = parseInt(rawAmt, 10);
      const motivo = reason;
      const messageLink = String(interaction.fields?.getTextInputValue(IN_PPM_LINK) || "").trim();
      if (!Number.isInteger(amount) || amount < 1) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Quantità non valida.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      if (amount > MAX_PPM_AMOUNT) {
        await interaction
          .reply({
            content: `<:vegax:1443934876440068179> Massimo \`${MAX_PPM_AMOUNT}\` punti per operazione.`,
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return true;
      }
      if (!motivo) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      if (!messageLink) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Link messaggio obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      if (!targetMember?.roles?.cache?.has?.(IDs.roles.PartnerManager)) {
        await interaction
          .reply({
            content:
              "<:vegax:1443934876440068179> I punti partner si gestiscono solo per utenti con il ruolo **Partner Manager**.",
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return true;
      }
      const staffData = await removePartnerPoints(guild.id, targetUser.id, amount);
      const changeLabel = formatPartnerPointsChange("remove", amount);
      const removedPointsChannel = guild.channels.cache.get(IDs.channels?.puntiTolti);
      if (removedPointsChannel) {
        await removedPointsChannel
          .send({
            content: `
<:partnermanager:1443651916838998099> ${targetUser}
<:VC_reason:1478517122929004544> ${motivo}
<:VC_Link:1482460590894088222> ${messageLink}`,
          })
          .catch(() => null);
      }
      await interaction
        .reply({
          content: `<:vegacheckmark:1443666279058772028> **${changeLabel}** a ${targetUser}. Totale: \`${staffData?.staff?.partnerCount ?? 0}\`.`,
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    if (parsed.action === "pex") {
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const targetMember = await guild.members.fetch(parsed.targetId).catch(() => null);
      res = targetMember && memberHasStaffRole(targetMember)
        ? await runProfileStaffPex(guild, interaction.client, targetUser, interaction.user, reason)
        : await runProspectStaffPex(guild, interaction.client, targetUser, interaction.user, reason);
    } else if (parsed.action === "depex") {
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      res = await runProfileStaffDepex(guild, interaction.client, targetUser, interaction.user, reason);
    } else if (parsed.action === "valpos") {
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      res = await valutazioneCmd.runValutazionePositiveAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "valneg") {
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      res = await valutazioneCmd.runValutazioneNegativeAddForPanel(guild, interaction.member, targetUser, reason);
    } else if (parsed.action === "warn") {
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      res = await runProfileStaffWarnAdd(guild, interaction.client, targetUser, interaction.user, reason);
    } else if (parsed.action === "valpos_rm" || parsed.action === "valneg_rm" || parsed.action === "warn_rm") {
      const rawId = String(interaction.fields?.getTextInputValue(IN_IDX) || "").trim();
      const removeId = parseInt(rawId, 10);
      if (!reason) {
        await interaction.reply({ content: "<:vegax:1443934876440068179> Motivo obbligatorio.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      if (parsed.action === "valpos_rm") {
        res = await valutazioneCmd.runValutazionePositiveRemoveForPanel(
          guild,
          interaction.member,
          targetUser,
          removeId,
          reason,
        );
      } else if (parsed.action === "valneg_rm") {
        res = await valutazioneCmd.runValutazioneNegativeRemoveForPanel(
          guild,
          interaction.member,
          targetUser,
          removeId,
          reason,
        );
      } else {
        res = await runProfileStaffWarnRemove(
          guild,
          interaction.client,
          targetUser,
          interaction.user,
          removeId,
          reason,
        );
      }
    } else {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Azione non riconosciuta.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    if (!res || !res.ok) {
      await interaction
        .reply({
          content: res?.message || "<:vegax:1443934876440068179> Operazione non riuscita.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    await interaction
      .reply({
        content: "<:vegacheckmark:1443666279058772028> Azione registrata.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "staffProfileHighStaff", order: 11, match, execute };