const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const {
  STAFF_VAL_NEG_TRADE_PREFIX,
  parseStaffValNegTradeOpenCustomId,
  formatStaffValNegTradeModalCustomId,
  parseStaffValNegTradeModalCustomId,
  buildStaffProfilePayload,
  SECTION_VALUTAZIONI,
} = require("../Utils/Staff/staffProfilePanelRuntime");
const { runValutazioneSelfNegTradeForPanel } = require("../Utils/Staff/valutazionePanelActions");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const { memberHasStaffRole } = require("../Utils/Community/staffListUtils");
const PRIVATE_FLAG = 1 << 6;
const IN_NEG_ID = "staff_vnt_neg_id";

function modalNegIdValue(interaction) {
  try {
    return String(interaction.fields.getTextInputValue(IN_NEG_ID) || "").trim();
  } catch {
    return "";
  }
}

async function refreshValutazioniPanelMessage(interaction, client, parsed) {
  const guild = interaction.guild;
  const msg = interaction.message;
  if (!guild || !msg?.edit || !parsed?.targetId || !parsed?.viewerId) return;
  const opts = {};
  if (parsed.sourceMessageId) opts.sourceMessageId = parsed.sourceMessageId;
  if (await isPartnerPmDailyCommandsThread(interaction.channel)) opts.partnersChatPanel = true;
  const payload = await buildStaffProfilePayload(guild, parsed.targetId, parsed.viewerId, client, SECTION_VALUTAZIONI, opts);
  await msg.edit(payload).catch(() => {});
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_VAL_NEG_TRADE_PREFIX}:open:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${STAFF_VAL_NEG_TRADE_PREFIX}:md:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    const parsed = parseStaffValNegTradeOpenCustomId(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId || parsed.viewerId !== parsed.targetId) {
      await interaction
        .reply({ content: "<a:VC_Cross:1482532424570376253> Questo pulsante è solo sul **tuo** profilo.", flags: PRIVATE_FLAG })
        .catch(() => {});
      return true;
    }
    if (!memberHasStaffRole(interaction.member)) {
      await interaction
        .reply({ content: "<a:VC_Cross:1482532424570376253> Solo lo **staff** può usare questa opzione.", flags: PRIVATE_FLAG })
        .catch(() => {});
      return true;
    }
    const modal = new ModalBuilder()
      .setCustomId(formatStaffValNegTradeModalCustomId(parsed.viewerId, parsed.targetId, parsed.sourceMessageId))
      .setTitle("Compensa 1 negativa (3 positive)");
    const row = new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(IN_NEG_ID)
        .setLabel("N° negativa da rimuovere (come in lista: 1 = −1)")
        .setStyle(TextInputStyle.Short)
        .setMinLength(1)
        .setMaxLength(3)
        .setRequired(true)
        .setPlaceholder("1"),
    );
    modal.addComponents(row);
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit()) {
    const parsed = parseStaffValNegTradeModalCustomId(interaction.customId);
    if (!parsed) return false;
    if (String(interaction.user.id) !== parsed.viewerId || parsed.viewerId !== parsed.targetId) {
      await interaction
        .reply({ content: "<a:VC_Cross:1482532424570376253> Questa richiesta non è tua.", flags: PRIVATE_FLAG })
        .catch(() => {});
      return true;
    }
    const raw = modalNegIdValue(interaction);
    const negId = parseInt(raw.replace(/\D/g, ""), 10);
    if (!Number.isInteger(negId) || negId < 1) {
      await interaction
        .reply({ content: "<:VC_Attention:1482534443632558151> Inserisci un **numero valido** (es. **1** per la prima negativa in elenco).", flags: PRIVATE_FLAG })
        .catch(() => {});
      return true;
    }
    await interaction.deferUpdate().catch(() => {});
    const staffUser = interaction.user;
    const res = await runValutazioneSelfNegTradeForPanel(interaction.guild, interaction.member, staffUser, negId);
    if (!res.ok) {
      await interaction.followUp({ content: res.message || "<:vegax:1443934876440068179> Operazione non riuscita.", flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await refreshValutazioniPanelMessage(interaction, interaction.client, parsed);
    await interaction
      .followUp({
        content:
          "<:vegacheckmark:1443666279058772028> **Fatto:** rimosse **3 positive** (le più vecchie) e **1 negativa** scelta. Controlla anche il canale **valutazioni staff**.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "staffValutazioneNegTradeButtons", order: 9, match, execute };