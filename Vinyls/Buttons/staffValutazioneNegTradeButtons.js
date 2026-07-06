const { ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const {
  STAFF_VAL_NEG_TRADE_PREFIX,
  STAFF_VAL_PAUSE_TRADE_PREFIX,
  parseStaffValNegTradeOpenCustomId,
  formatStaffValNegTradeModalCustomId,
  parseStaffValNegTradeModalCustomId,
  formatStaffValPauseTradeOpenCustomId,
  formatStaffValPauseTradeModalCustomId,
  parseStaffValPauseTradeOpenCustomId,
  parseStaffValPauseTradeModalCustomId,
  buildStaffProfilePayload,
  SECTION_VALUTAZIONI,
} = require("../Utils/Staff/staffProfilePanelRuntime");
const {
  runValutazioneNegTradeForPanel,
  runValutazionePosPauseTradeForPanel,
} = require("../Utils/Staff/valutazionePanelActions");
const { isPartnerPmDailyCommandsThread } = require("../Utils/Partner/partnersChatChannelUtils");
const IDs = require("../Utils/Config/ids");
const PRIVATE_FLAG = 1 << 6;
const IN_NEG_ID = "staff_vnt_neg_id";
const IN_POS_COUNT = "staff_vpt_pos_count";
const IN_PAUSE_DAYS = "staff_vpt_pause_days";

function modalFieldValue(interaction, customId) {
  try {
    return String(interaction.fields.getTextInputValue(customId) || "").trim();
  } catch {
    return "";
  }
}

function memberIsHighStaffOrAbove(member) {
  const cache = member?.roles?.cache;
  if (!cache) return false;
  return Boolean(IDs.roles?.HighStaff && cache.has(IDs.roles.HighStaff));
}

function isSelfValTradeTarget(parsed) {
  return String(parsed?.viewerId || "") === String(parsed?.targetId || "");
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

function parsePositiveInt(raw, min = 1) {
  const n = parseInt(String(raw || "").replace(/\D/g, ""), 10);
  if (!Number.isInteger(n) || n < min) return null;
  return n;
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_VAL_NEG_TRADE_PREFIX}:open:`)) return true;
  if (interaction?.isButton?.() && id.startsWith(`${STAFF_VAL_PAUSE_TRADE_PREFIX}:open:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${STAFF_VAL_NEG_TRADE_PREFIX}:md:`)) return true;
  if (interaction?.isModalSubmit?.() && id.startsWith(`${STAFF_VAL_PAUSE_TRADE_PREFIX}:md:`)) return true;
  return false;
}

async function execute(interaction) {
  if (interaction.isButton()) {
    const negParsed = parseStaffValNegTradeOpenCustomId(interaction.customId);
    if (negParsed) {
      if (String(interaction.user.id) !== negParsed.viewerId) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Questo pulsante non è per te.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (!memberIsHighStaffOrAbove(interaction.member)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Solo **High Staff** può usare questa opzione.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (isSelfValTradeTarget(negParsed)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Non puoi scambiare valutazioni sul **tuo** profilo.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      const modal = new ModalBuilder()
        .setCustomId(formatStaffValNegTradeModalCustomId(negParsed.viewerId, negParsed.targetId, negParsed.sourceMessageId))
        .setTitle("Compensa 1 negativa (3 positive)");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(IN_NEG_ID)
            .setLabel("N° negativa da rimuovere (1 = −1 in lista)")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
            .setPlaceholder("1"),
        ),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    const pauseParsed = parseStaffValPauseTradeOpenCustomId(interaction.customId);
    if (pauseParsed) {
      if (String(interaction.user.id) !== pauseParsed.viewerId) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Questo pulsante non è per te.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (!memberIsHighStaffOrAbove(interaction.member)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Solo **High Staff** può usare questa opzione.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (isSelfValTradeTarget(pauseParsed)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Non puoi scambiare valutazioni sul **tuo** profilo.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      const modal = new ModalBuilder()
        .setCustomId(formatStaffValPauseTradeModalCustomId(pauseParsed.viewerId, pauseParsed.targetId, pauseParsed.sourceMessageId))
        .setTitle("Positive → giorni pausa extra");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(IN_POS_COUNT)
            .setLabel("Valutazioni positive da rimuovere")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
            .setPlaceholder("es. 2"),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId(IN_PAUSE_DAYS)
            .setLabel("Giorni pausa extra da aggiungere")
            .setStyle(TextInputStyle.Short)
            .setMinLength(1)
            .setMaxLength(3)
            .setRequired(true)
            .setPlaceholder("es. 5"),
        ),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    return false;
  }

  if (interaction.isModalSubmit()) {
    const negParsed = parseStaffValNegTradeModalCustomId(interaction.customId);
    if (negParsed) {
      if (String(interaction.user.id) !== negParsed.viewerId) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Questa richiesta non è tua.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (!memberIsHighStaffOrAbove(interaction.member)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Solo **High Staff** può usare questa opzione.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (isSelfValTradeTarget(negParsed)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Non puoi scambiare valutazioni sul **tuo** profilo.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      const negId = parsePositiveInt(modalFieldValue(interaction, IN_NEG_ID), 1);
      if (!negId) {
        await interaction
          .reply({ content: "<:VC_Attention:1482534443632558151> Inserisci un **numero valido** (es. **1** per la prima negativa in elenco).", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      await interaction.deferUpdate().catch(() => {});
      const targetUser = await interaction.client.users.fetch(negParsed.targetId).catch(() => null);
      if (!targetUser) {
        await interaction.followUp({ content: "<:vegax:1443934876440068179> Utente non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const res = await runValutazioneNegTradeForPanel(interaction.guild, interaction.member, targetUser, negId);
      if (!res.ok) {
        await interaction.followUp({ content: res.message || "<:vegax:1443934876440068179> Operazione non riuscita.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await refreshValutazioniPanelMessage(interaction, interaction.client, negParsed);
      await interaction
        .followUp({
          content:
            "<:vegacheckmark:1443666279058772028> **Fatto:** rimosse **3 positive** e **1 negativa** scelta. Controlla il canale **valutazioni staff**.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }

    const pauseParsed = parseStaffValPauseTradeModalCustomId(interaction.customId);
    if (pauseParsed) {
      if (String(interaction.user.id) !== pauseParsed.viewerId) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Questa richiesta non è tua.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (!memberIsHighStaffOrAbove(interaction.member)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Solo **High Staff** può usare questa opzione.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      if (isSelfValTradeTarget(pauseParsed)) {
        await interaction
          .reply({ content: "<a:VC_Cross:1482532424570376253> Non puoi scambiare valutazioni sul **tuo** profilo.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      const posCount = parsePositiveInt(modalFieldValue(interaction, IN_POS_COUNT), 1);
      const pauseDays = parsePositiveInt(modalFieldValue(interaction, IN_PAUSE_DAYS), 1);
      if (!posCount || !pauseDays) {
        await interaction
          .reply({ content: "<:VC_Attention:1482534443632558151> Inserisci **numeri validi** per positive e giorni pausa.", flags: PRIVATE_FLAG })
          .catch(() => {});
        return true;
      }
      await interaction.deferUpdate().catch(() => {});
      const targetUser = await interaction.client.users.fetch(pauseParsed.targetId).catch(() => null);
      if (!targetUser) {
        await interaction.followUp({ content: "<:vegax:1443934876440068179> Utente non trovato.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const res = await runValutazionePosPauseTradeForPanel(interaction.guild, interaction.member, targetUser, posCount, pauseDays);
      if (!res.ok) {
        await interaction.followUp({ content: res.message || "<:vegax:1443934876440068179> Operazione non riuscita.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await refreshValutazioniPanelMessage(interaction, interaction.client, pauseParsed);
      await interaction
        .followUp({
          content: `<:vegacheckmark:1443666279058772028> **Fatto:** rimosse **${posCount} positive** e aggiunti **+${pauseDays}** giorni pausa extra (totale scambio: **${res.pauseBonusTotal}**).`,
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    return false;
  }

  return false;
}

module.exports = { name: "staffValutazioneNegTradeButtons", order: 9, match, execute };