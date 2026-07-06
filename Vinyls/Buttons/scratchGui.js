const { MessageFlags } = require("discord.js");
const { buildScratchGuiPayload, buyTicket, deleteSession, economyConfig, formatScratchNotice, getSession, interactionMessageAdapter, isScratchGuiCustomId, parseScratchGuiCustomId, resetForNewTicket, revealAll, revealCell, scheduleScratchRevealPanel, setSession } = require("../Utils/Economy/scratchGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isScratchGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", panelClosed = false, animating = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildScratchGuiPayload(session, cfg, notice, panelClosed, animating);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello gratta e vinci.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction, client) {
  const parsed = parseScratchGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo biglietto non è tuo.");
    return true;
  }
  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+scratch`.");
    return true;
  }
  const cfg = economyConfig(client);
  const msg = interactionMessageAdapter(interaction);

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase !== "idle" && session.phase !== "done") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di comprare.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = parsed.action === "minus"
      ? Math.max(cfg.minBet, session.bet - step)
      : Math.min(cfg.maxBet, session.bet + step);
    if (session.phase === "done") resetForNewTicket(session);
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    await updatePanel(interaction, session, cfg, notice, false, false);
    return true;
  }

  if (parsed.action === "buy") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const bought = await buyTicket(client, msg, session);
    if (!bought.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${bought.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Biglietto acquistato — gratta le zone!", false, false);
    return true;
  }

  if (parsed.action === "cell") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const scratched = await revealCell(client, msg, session, parsed.cell, cfg);
    if (!scratched.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${scratched.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = scratched.finished ? formatScratchNotice(scratched.result) : "<a:VC_Verified:1482532479637127188> Zona grattata.";
    await updatePanel(interaction, session, cfg, notice, false, false);
    return true;
  }

  if (parsed.action === "reveal") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const all = await revealAll(client, msg, session, cfg);
    if (!all.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${all.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = formatScratchNotice(all.result);
    const spinPayload = await buildScratchGuiPayload(session, cfg, "✨ Grattata in corso…", false, true);
    await interaction.message?.edit?.(spinPayload).catch(() => {});
    scheduleScratchRevealPanel(interaction.message, getSession(interaction.message.id) || session, cfg, notice);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    resetForNewTicket(session);
    await updatePanel(interaction, session, cfg, "Sessione chiusa.", true, false);
    return true;
  }

  return false;
}

module.exports = { name: "scratchGui", order: 25, match, execute };