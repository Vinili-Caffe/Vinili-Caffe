const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { buildScratchGuiPayload, buyTicket, deleteSession, economyConfig, formatScratchNotice, getSession, interactionMessageAdapter, isScratchGuiCustomId, parseScratchGuiCustomId, refundOpenTicket, resetForNewTicket, revealAll, revealCell, scheduleScratchRevealPanel, setSession } = require("../Utils/Economy/scratchGuiRuntime") as typeof import("../Utils/Economy/scratchGuiRuntime");
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal") as typeof import("../Utils/Economy/economyBetModal");
const { finalizeEconomyGuiClose } = require("../Utils/Economy/economyCommandHelpers") as typeof import("../Utils/Economy/economyCommandHelpers");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction?) {
  if (interaction?.isButton?.() && isScratchGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isScratchGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction?, content?) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction?, session?, cfg?, notice = "", panelClosed = false, animating = false, balance = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildScratchGuiPayload(session, cfg, notice, panelClosed, animating, balance);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello gratta e vinci.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction?, client?) {
  const parsed = parseScratchGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo biglietto non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+scratch`.");
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
      beforeApply: (s?) => {
        if (s.phase === "done") resetForNewTicket(s);
      },
      onApplied: async (notice?) => {
        const payload = await buildScratchGuiPayload(session, cfg, notice, false, false, balance);
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
      controlId: (action?, ownerId?) => `scratch_gui:${action}:${ownerId}`,
      balance,
      canAdjust: session.phase === "idle" || session.phase === "done",
      denyMessage: "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di comprare.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase !== "idle" && session.phase !== "done") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di comprare.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = clampBetAmount(
      parsed.action === "minus" ? session.bet - step : session.bet + step,
      cfg,
      balance,
    );
    if (session.phase === "done") resetForNewTicket(session);
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    await updatePanel(interaction, session, cfg, notice, false, false, balance);
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
    scheduleScratchRevealPanel(interaction.message, session, cfg, notice);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const wasOpen = session.phase === "ready";
    const refunded = await refundOpenTicket(client, session, interaction.user?.id);
    const keepOpen = wasOpen && refunded.ok !== false;
    const notice = !refunded.ok
      ? `Biglietto ancora aperto: rimborso non riuscito (${refunded.message}). Riprova Chiudi.`
      : refunded.amount > 0
        ? `Biglietto annullato. Ti ho restituito **${refunded.amount}** Galeoni. Puoi riprovare.`
        : keepOpen
          ? "Biglietto annullato. Puoi regolare la puntata e riprovare."
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
      updateExtraArgs: [false],
    });
    return true;
  }

  return false;
}

export = { name: "scratchGui", order: 25, match, execute };