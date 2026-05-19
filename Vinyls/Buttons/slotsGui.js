const { MessageFlags } = require("discord.js");
const { buildSlotsGuiPayload, cashoutSession, deleteSession, economyConfig, formatSlotsSpinNotice, getSession, interactionMessageAdapter, isSlotsGuiCustomId, parseSlotsGuiCustomId, scheduleSlotsIdlePanel, setSession, spinSession } = require("../Utils/Economy/slotsGuiRuntime")
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isSlotsGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", disabled = false, animating = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildSlotsGuiPayload(session, cfg, notice, disabled, animating);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello della slot.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction, client) {
  const parsed = parseSlotsGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questa slot non è tua.");
    return true;
  }

  const session = await getSession(interaction.message?.id, interaction.guild?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questa sessione slot è scaduta. Usa di nuovo `+slots`.");
    return true;
  }

  const cfg = economyConfig(client);
  const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
  if (parsed.action === "minus") {
    session.bet = Math.max(cfg.minBet, session.bet - step);
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Puntata abbassata.");
    return true;
  }

  if (parsed.action === "plus") {
    session.bet = Math.min(cfg.maxBet, session.bet + step);
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Puntata aumentata.");
    return true;
  }

  if (parsed.action === "spin") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_pixeltime:1482535344103620771> Attendi che i rulli si fermino.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const spin = await spinSession(client, interactionMessageAdapter(interaction), session);
    if (!spin.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${spin.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    session.panelAnimating = true;
    setSession(interaction.message.id, session);
    const live = (await getSession(interaction.message.id, interaction.guild?.id)) || session;
    const finalNotice = formatSlotsSpinNotice(spin.result, live);
    await updatePanel(interaction, live, cfg, "🎰 I rulli stanno girando...", false, true);
    scheduleSlotsIdlePanel(interaction.message, live, cfg, finalNotice);
    return true;
  }

  if (parsed.action === "cashout") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const out = await cashoutSession(client, interaction, session, interaction.message.id);
    if (!out.ok) {
      await interaction.followUp({ content: `<a:VC_Cross:1482532424570376253> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await updatePanel(interaction, session, cfg, `🪙 Hai riscosso **${out.amount} Galeoni**.`);
    return true;
  }

  if (parsed.action === "close") {
    let notice = "Sessione chiusa.";
    if (Number(session.bank || 0) > 0) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      const out = await cashoutSession(client, interaction, session, interaction.message.id);
      notice = out.ok ? `🪙 Sessione chiusa. Ho riscosso automaticamente **${out.amount} Galeoni**.` : `<a:VC_Cross:1482532424570376253> Sessione chiusa, ma non sono riuscito a riscuotere: ${out.message}`;
    }
    deleteSession(interaction.message?.id, session);
    session.cashedOut = true;
    await updatePanel(interaction, session, cfg, notice, true);
    return true;
  }

  return false;
}

module.exports = { name: "slotsGui", order: 25, match, execute };