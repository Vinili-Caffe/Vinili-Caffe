const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { formatEconomyAmount } = require("./economyDisplayHelpers");

const BET_INPUT_ID = "bet_amount";
const BET_ACTION = "bet";
const BET_MODAL_ACTION = "betmodal";
const PRIVATE_FLAG = MessageFlags.Ephemeral;
/** Tetto tecnico se maxBet=0 e non abbiamo ancora il saldo. */
const UNLIMITED_BET_CEILING = 1_000_000_000;

function resolveConfiguredMaxBet(cfg) {
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
  const n = Math.floor(Number(cfg?.maxBet));
  // 0 / assente = nessun tetto fisso (solo disponibilità/saldo).
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(min, n);
}

function resolveEffectiveMaxBet(cfg, balance = null) {
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
  const configured = resolveConfiguredMaxBet(cfg);
  // Importante: Number(null) === 0 — non trattare null/undefined come saldo 0,
  // altrimenti max collassa a minBet e +/- restano disabilitati.
  const hasBal = balance != null && balance !== "" && Number.isFinite(Number(balance));
  const bal = hasBal ? Math.max(0, Math.floor(Number(balance))) : null;
  if (configured > 0 && hasBal) return Math.max(min, Math.min(configured, bal));
  if (configured > 0) return configured;
  if (hasBal) return Math.max(min, bal);
  return UNLIMITED_BET_CEILING;
}

function betBounds(cfg, balance = null) {
  const min = Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
  const max = resolveEffectiveMaxBet(cfg, balance);
  return { min, max };
}

function clampBetAmount(value, cfg, balance = null) {
  const { min, max } = betBounds(cfg, balance);
  const n = Math.floor(Number(value) || min);
  return Math.max(min, Math.min(max, n));
}

function buildBetAmountButton(customId, { disabled = false } = {}) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel("Puntata")
    .setEmoji("✏️")
    .setStyle(ButtonStyle.Primary)
    .setDisabled(Boolean(disabled));
}

function buildBetAmountModal({ customId, min, max, current, labelPrefix = "Importo" }) {
  const { min: minN, max: maxN } = betBounds({ minBet: min, maxBet: max > 0 ? max : 0 }, max > 0 ? max : null);
  const cur = Math.max(minN, Math.min(maxN, Math.floor(Number(current) || minN)));
  const maxLen = Math.max(1, Math.min(10, String(maxN).length));
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Imposta puntata")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(BET_INPUT_ID)
          .setLabel(`${labelPrefix} (${minN}–${maxN})`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(maxLen)
          .setPlaceholder(`${minN} … ${maxN}`)
          .setValue(String(cur)),
      ),
    );
}

function parseBetAmountInput(interaction, cfg, balance = null) {
  const { min, max } = betBounds(cfg, balance);
  const raw = interaction.fields?.getTextInputValue?.(BET_INPUT_ID) || "";
  const n = Math.floor(Number(String(raw).replace(/[^\d]/g, "")));
  if (!Number.isFinite(n) || n < min || n > max) {
    return { ok: false, message: `Inserisci un numero tra **${min}** e **${max}** (saldo disponibile).` };
  }
  return { ok: true, amount: n, min, max };
}

async function handleEconomyBetButton({
  interaction,
  parsed,
  session,
  cfg,
  controlId,
  canAdjust = true,
  denyMessage = "<a:VC_Cross:1482532424570376253> La puntata non si può cambiare ora.",
  balance = null,
  labelPrefix = "Importo",
}) {
  if (parsed?.action !== BET_ACTION) return false;
  if (!canAdjust) {
    await interaction.reply({ content: denyMessage, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  const { min, max } = betBounds(cfg, balance);
  const modal = buildBetAmountModal({
    customId: controlId(BET_MODAL_ACTION, parsed.ownerId),
    min,
    max,
    current: session.bet,
    labelPrefix,
  });
  await interaction.showModal(modal).catch(() => {});
  return true;
}

async function handleEconomyBetModal({
  interaction,
  parsed,
  session,
  cfg,
  setSession,
  messageId,
  onApplied,
  beforeApply = null,
  balance = null,
}) {
  if (parsed?.action !== BET_MODAL_ACTION) return false;
  const parsedBet = parseBetAmountInput(interaction, cfg, balance);
  if (!parsedBet.ok) {
    await interaction.reply({ content: `<:vegax:1443934876440068179> ${parsedBet.message}`, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  if (typeof beforeApply === "function") beforeApply(session);
  session.bet = parsedBet.amount;
  if (typeof setSession === "function") {
    const out = setSession(messageId || interaction.message?.id, session);
    if (out && typeof out.then === "function") await out;
  }
  if (typeof onApplied === "function") {
    const notice = "<a:VC_Verified:1482532479637127188> Puntata aggiornata.";
    const out = onApplied(notice, session, parsedBet);
    if (out && typeof out.then === "function") await out;
  }
  return true;
}

async function fetchSpendableBalance(client, session) {
  try {
    const { getGamblingSpendableBalance } = require("../../Services/Community/activeEconomyService");
    return await getGamblingSpendableBalance(
      client,
      session?.guildId,
      session?.ownerId,
      session?.currency,
    );
  } catch {
    return null;
  }
}

module.exports = {
  BET_ACTION,
  BET_INPUT_ID,
  BET_MODAL_ACTION,
  UNLIMITED_BET_CEILING,
  betBounds,
  buildBetAmountButton,
  buildBetAmountModal,
  clampBetAmount,
  fetchSpendableBalance,
  handleEconomyBetButton,
  handleEconomyBetModal,
  parseBetAmountInput,
  resolveConfiguredMaxBet,
  resolveEffectiveMaxBet,
};
