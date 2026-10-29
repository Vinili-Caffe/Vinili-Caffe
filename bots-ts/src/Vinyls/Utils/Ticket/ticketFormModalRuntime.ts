const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
} = require("discord.js") as typeof import("discord.js");
const {
  findGuildFormById,
  getGuildFormsSync,
  refreshTicketFormsCache,
} = require("../../MultiGuild/core/tenantTicketForms") as typeof import("../../MultiGuild/core/tenantTicketForms");

const FORM_OPEN_PREFIX = "tkform:";

function formOpenCustomId(panelId?) {
  const id = String(panelId || "").trim();
  return id ? `${FORM_OPEN_PREFIX}${id}` : null;
}

function parseFormOpenCustomId(customId?) {
  const raw = String(customId || "").trim();
  if (!raw.startsWith(FORM_OPEN_PREFIX)) return null;
  const id = raw.slice(FORM_OPEN_PREFIX.length).trim();
  return id || null;
}

function isTicketFormModal(customId?) {
  return Boolean(parseFormOpenCustomId(customId));
}

function modalCompatibleFields(form?) {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  return fields
    .filter((f?) => f && (f.type === "text_input" || !f.type))
    .slice(0, 5);
}

function ticketFormOpenBlockReason(form?) {
  if (!form) return null;
  const all = Array.isArray(form.fields) ? form.fields.filter(Boolean) : [];
  if (!all.length) {
    return "Il form collegato non ha campi. Aggiungine almeno uno di tipo Text Input nella dashboard.";
  }
  const textFields = modalCompatibleFields(form);
  if (!textFields.length) {
    return "Discord mostra nei modal solo campi Text Input. Aggiungi almeno un Text Input al form (gli altri tipi restano in dashboard ma non compaiono all'apertura).";
  }
  return null;
}

function buildTicketFormModal(form?, panelId?) {
  if (!form) return null;
  const fields = modalCompatibleFields(form);
  if (!fields.length) return null;
  const customId = formOpenCustomId(panelId);
  if (!customId) return null;
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(String(form.title || "Form").slice(0, 45));
  for (const field of fields) {
    const input = new TextInputBuilder()
      .setCustomId(String(field.id))
      .setLabel(String(field.label || "Campo").slice(0, 45))
      .setStyle(field.style === "paragraph" ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(field.required !== false);
    if (field.placeholder) input.setPlaceholder(String(field.placeholder).slice(0, 100));
    if (Number.isFinite(field.minLength) && field.minLength > 0) {
      input.setMinLength(Math.min(4000, Math.max(0, field.minLength)));
    }
    if (Number.isFinite(field.maxLength) && field.maxLength > 0) {
      input.setMaxLength(Math.min(4000, Math.max(1, field.maxLength)));
    }
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

function readTicketFormAnswers(interaction?, form?) {
  const fields = modalCompatibleFields(form);
  const answers = [];
  for (const field of fields) {
    let value = "";
    try {
      value = String(interaction.fields.getTextInputValue(String(field.id)) || "").trim();
    } catch (_) {
      value = "";
    }
    answers.push({
      fieldId: field.id,
      label: field.label,
      value: value || null,
      required: field.required !== false,
    });
  }
  return answers;
}

function buildFormAnswersEmbed(form?, answers?, color = "#6f4e37") {
  const fields = [];
  for (const row of answers || []) {
    const label = String(row.label || "Campo").trim().slice(0, 256) || "Campo";
    const valueRaw = row.value != null ? String(row.value).trim() : "";
    const value = (valueRaw || "—").slice(0, 1024);
    fields.push({ name: label, value, inline: false });
  }
  if (!fields.length) return null;
    return new EmbedBuilder().setColor(color).addFields(fields.slice(0, 25));
}

async function resolvePanelOpenForm(guildId?, panel?) {
  const formId = String(panel?.formId || "").trim();
  if (!formId) return null;
  await refreshTicketFormsCache().catch(() => null);
  return findGuildFormById(guildId, formId) || getGuildFormsSync(guildId).forms.find((f?) => f.id === formId) || null;
}

export = {
  FORM_OPEN_PREFIX,
  formOpenCustomId,
  parseFormOpenCustomId,
  isTicketFormModal,
  modalCompatibleFields,
  ticketFormOpenBlockReason,
  buildTicketFormModal,
  readTicketFormAnswers,
  buildFormAnswersEmbed,
  resolvePanelOpenForm,
};
