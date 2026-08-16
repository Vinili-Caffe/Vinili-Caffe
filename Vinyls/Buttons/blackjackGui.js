const { MessageFlags } = require("discord.js");
const {
  buildBlackjackGuiPayload,
  deleteSession,
  doubleHand,
  economyConfig,
  formatRoundNotice,
  getSession,
  hitHand,
  interactionMessageAdapter,
  isBlackjackGuiCustomId,
  parseBlackjackGuiCustomId,
  refundOpenHand,
  resetSessionForNewRound,
  setSession,
  standHand,
  startHand,
} = require("../Utils/Economy/blackjackGuiRuntime");
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal");
const { finalizeEconomyGuiClose } = require("../Utils/Economy/economyCommandHelpers");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isBlackjackGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isBlackjackGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", panelClosed = false, balance = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildBlackjackGuiPayload(session, cfg, notice, panelClosed, balance);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello blackjack.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

function controlId(action, ownerId) {
  return `blackjack_gui:${action}:${ownerId}`;
}

async function execute(interaction, client) {
  const parsed = parseBlackjackGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo tavolo non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+blackjack`.");
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
      onApplied: async (notice) => {
        const payload = await buildBlackjackGuiPayload(session, cfg, notice, false, balance);
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
      controlId,
      balance,
      canAdjust: session.phase === "idle" || session.phase === "done",
      denyMessage: "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di distribuire.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase !== "idle" && session.phase !== "done") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di distribuire.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = clampBetAmount(
      parsed.action === "minus" ? session.bet - step : session.bet + step,
      cfg,
      balance,
    );
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    await updatePanel(interaction, session, cfg, notice, false, balance);
    return true;
  }

  if (parsed.action === "deal") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const dealt = await startHand(client, msg, session);
    if (!dealt.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${dealt.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = dealt.instant ? formatRoundNotice(dealt.result) : "<a:VC_Verified:1482532479637127188> Carte distribuite.";
    await updatePanel(interaction, session, cfg, notice, false);
    return true;
  }

  if (parsed.action === "hit") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const hit = await hitHand(client, msg, session, cfg);
    if (!hit.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${hit.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    let notice = "<a:VC_Verified:1482532479637127188> Carta pescata.";
    if (hit.bust || hit.autoStand) {
      notice = formatRoundNotice(hit.result);
    }
    await updatePanel(interaction, session, cfg, notice, false);
    return true;
  }

  if (parsed.action === "stand") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const stood = await standHand(client, msg, session, cfg);
    if (!stood.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${stood.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, formatRoundNotice(stood.result), false);
    return true;
  }

  if (parsed.action === "double") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const doubled = await doubleHand(client, msg, session, cfg);
    if (!doubled.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${doubled.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, formatRoundNotice(doubled.result), false);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const wasOpen = session.phase === "playing" || session.phase === "dealer";
    const refunded = await refundOpenHand(client, session, interaction.user?.id);
    const keepOpen = wasOpen && refunded.ok !== false;
    const notice = !refunded.ok
      ? `Mano ancora aperta: rimborso non riuscito (${refunded.message}). Riprova Chiudi o finisci la mano.`
      : refunded.amount > 0
        ? `Mano annullata. Ti ho restituito **${refunded.amount}** Galeoni. Puoi riprovare.`
        : keepOpen
          ? "Mano annullata. Puoi regolare la puntata e riprovare."
          : "Sessione chiusa.";
    await finalizeEconomyGuiClose({
      interaction,
      session,
      cfg,
      notice,
      keepOpen,
      setSession,
      deleteSession,
      updatePanel,
    });
    return true;
  }

  return false;
}

module.exports = { name: "blackjackGui", order: 25, match, execute };
