const { MessageFlags } = require("discord.js");
const { buildSlotsGuiPayload, cashoutSession, deleteSession, economyConfig, formatSlotsSpinNotice, getSession, interactionMessageAdapter, isSlotsGuiCustomId, parseSlotsGuiCustomId, scheduleSlotsIdlePanel, setSession, spinSession } = require("../Utils/Economy/slotsGuiRuntime")
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isSlotsGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isSlotsGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", disabled = false, animating = false, balance = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildSlotsGuiPayload(session, cfg, notice, disabled, animating, balance);
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

  const guildId = interaction.guild?.id;
  let session = await getSession(interaction.message?.id, guildId, parsed.ownerId);

  if (!session) {
    // Fallback: pannello ancora valido ma memoria persa (restart) — solo se messageId combacia.
    session = await getSession("", guildId, parsed.ownerId);
    if (session) {
      const mid = String(interaction.message?.id || "");
      if (mid && String(session.messageId || "") !== mid) session = null;
      else {
        session.guildId = session.guildId || String(guildId || "");
        session.ownerId = session.ownerId || parsed.ownerId;
        if (mid) await setSession(mid, session);
      }
    }
  }

  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questa sessione slot è scaduta. Usa di nuovo `+slots`.");
    return true;
  }

  const cfg = economyConfig(client);
  const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
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
        const payload = await buildSlotsGuiPayload(session, cfg, notice, false, false, balance);
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
      controlId: (action, ownerId) => `slots_gui:${action}:${ownerId}`,
      balance,
      canAdjust: !session.panelAnimating,
      denyMessage: "<a:VC_pixeltime:1482535344103620771> Attendi che i rulli si fermino.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus") {
    session.bet = clampBetAmount(session.bet - step, cfg, balance);
    await setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Puntata abbassata.", false, false, balance);
    return true;
  }

  if (parsed.action === "plus") {
    session.bet = clampBetAmount(session.bet + step, cfg, balance);
    await setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Puntata aumentata.", false, false, balance);
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
    await setSession(interaction.message.id, session);
    const live = (await getSession(interaction.message.id, guildId, parsed.ownerId)) || session;
    const finalNotice = formatSlotsSpinNotice(spin.result);
    await updatePanel(interaction, live, cfg, "🎰 I rulli stanno girando...", false, true);
    scheduleSlotsIdlePanel(interaction.message, live, cfg, finalNotice);
    return true;
  }

  if (parsed.action === "cashout") {
    // Compat pannelli vecchi: paga subito eventuali vincite residue, senza più bottone.
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const out = await cashoutSession(client, interaction, session, interaction.message?.id);
    if (!out.ok) {
      await interaction.followUp({ content: `<a:VC_Cross:1482532424570376253> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await updatePanel(
      interaction,
      session,
      cfg,
      out.amount > 0 ? `🪙 Hai riscosso **${out.amount} Galeoni**.` : "Niente da riscuotere: le vincite ora sono automatiche.",
    );
    return true;
  }

  if (parsed.action === "close") {
    let notice = "Sessione chiusa.";
    const pendingBank = Number(session.bank || 0) > 0;
    if (pendingBank) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferUpdate().catch(() => {});
      }
      const out = await cashoutSession(client, interaction, session, interaction.message?.id);
      notice = out.ok
        ? `🪙 Sessione chiusa. Ho riscosso automaticamente **${out.amount} Galeoni**.`
        : `<a:VC_Cross:1482532424570376253> Sessione chiusa, ma non sono riuscito a riscuotere: ${out.message}`;
    }
    const cleared = deleteSession(interaction.message?.id, session);
    if (cleared && typeof cleared.then === "function") await cleared.catch(() => null);
    session.cashedOut = true;
    await updatePanel(interaction, session, cfg, notice, true);
    return true;
  }

  return false;
}

module.exports = { name: "slotsGui", order: 25, match, execute };