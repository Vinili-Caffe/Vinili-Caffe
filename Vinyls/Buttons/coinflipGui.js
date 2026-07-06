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
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isCoinflipGuiCustomId(interaction.customId));
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
  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+testaocroce`.");
    return true;
  }
  const cfg = economyConfig(client);
  const msg = interactionMessageAdapter(interaction);

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Attendi la fine del lancio.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = parsed.action === "minus"
      ? Math.max(cfg.minBet, session.bet - step)
      : Math.min(cfg.maxBet, session.bet + step);
    session.lastResult = null;
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    const payload = await buildCoinflipGuiPayload(session, cfg, notice, false, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
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
    scheduleCoinflipIdlePanel(interaction.message, getSession(interaction.message.id) || session, cfg, notice);
    return true;
  }

  return false;
}

module.exports = { name: "coinflipGui", order: 25, match, execute };