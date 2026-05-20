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
  resetSessionForNewRound,
  setSession,
  standHand,
  startHand,
} = require("../Utils/Economy/blackjackGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isBlackjackGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", panelClosed = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildBlackjackGuiPayload(session, cfg, notice, panelClosed);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello blackjack.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction, client) {
  const parsed = parseBlackjackGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo tavolo non è tuo.");
    return true;
  }
  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+blackjack`.");
    return true;
  }
  const cfg = economyConfig(client);
  const msg = interactionMessageAdapter(interaction);

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase !== "idle" && session.phase !== "done") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di distribuire.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = parsed.action === "minus"
      ? Math.max(cfg.minBet, session.bet - step)
      : Math.min(cfg.maxBet, session.bet + step);
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    await updatePanel(interaction, session, cfg, notice);
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
    let done = false;
    if (hit.bust || hit.autoStand) {
      notice = formatRoundNotice(hit.result);
      done = true;
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
    deleteSession(interaction.message?.id);
    resetSessionForNewRound(session);
    await updatePanel(interaction, session, cfg, "Sessione chiusa.", true);
    return true;
  }

  return false;
}

module.exports = { name: "blackjackGui", order: 25, match, execute };