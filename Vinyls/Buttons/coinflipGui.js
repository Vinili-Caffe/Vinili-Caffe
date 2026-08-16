const { MessageFlags } = require("discord.js");
const {
  buildCoinflipGuiPayload,
  deleteSession,
  economyConfig,
  formatCoinflipNotice,
  getSession,
  interactionMessageAdapter,
  isCoinflipGuiCustomId,
  parseCoinflipGuiCustomId,
  playCoinflipSession,
  scheduleCoinflipIdlePanel,
  setSession,
} = require("../Utils/Economy/coinflipGuiRuntime");
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isCoinflipGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isCoinflipGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction, client) {
  const parsed = parseCoinflipGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo pannello non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+testaocroce`.");
    return true;
  }
  const cfg = economyConfig(client);
  const msg = interactionMessageAdapter(interaction);
  const balance = await fetchSpendableBalance(client, session);

  if (
    await handleEconomyBetModal({
      interaction,
      parsed,
      session,
      cfg,
      setSession,
      balance,
      beforeApply: (s) => {
        s.lastResult = null;
      },
      onApplied: async (notice) => {
        const payload = await buildCoinflipGuiPayload(session, cfg, notice, false, false, balance);
        await interaction.update(payload).catch(() => {});
      },
    })
  ) {
    return true;
  }

  if (
    await handleEconomyBetButton({
      interaction,
      parsed,
      session,
      cfg,
      controlId: (action, ownerId) => `coinflip_gui:${action}:${ownerId}`,
      balance,
      canAdjust: !session.panelAnimating,
      denyMessage: "<a:VC_Cross:1482532424570376253> Attendi la fine del lancio.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Attendi la fine del lancio.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = clampBetAmount(
      parsed.action === "minus" ? session.bet - step : session.bet + step,
      cfg,
      balance,
    );
    session.lastResult = null;
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    const payload = await buildCoinflipGuiPayload(session, cfg, notice, false, false, balance);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const cleared = deleteSession(interaction.message?.id);
    if (cleared && typeof cleared.then === "function") await cleared.catch(() => null);
    session.lastResult = null;
    session.panelAnimating = false;
    const payload = await buildCoinflipGuiPayload(session, cfg, "Sessione chiusa.", true, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "testa" || parsed.action === "croce") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Attendi la fine del lancio.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const flipped = await playCoinflipSession(client, msg, session, parsed.action);
    if (!flipped.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${flipped.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    session.panelAnimating = true;
    setSession(interaction.message.id, session);
    const notice = formatCoinflipNotice(flipped.result);
    const spinPayload = await buildCoinflipGuiPayload(session, cfg, "🪙 La moneta è in aria…", false, true);
    await interaction.message?.edit?.(spinPayload).catch(() => {});
    scheduleCoinflipIdlePanel(interaction.message, session, cfg, notice);
    return true;
  }

  return false;
}

module.exports = { name: "coinflipGui", order: 25, match, execute };