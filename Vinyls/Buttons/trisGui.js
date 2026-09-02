const { MessageFlags } = require("discord.js");
const {
  acceptPvpChallenge,
  buildTrisGuiPayload,
  cancelPvpChallenge,
  declinePvpChallenge,
  deleteSession,
  economyConfig,
  forceKillTrisSession,
  formatRoundNotice,
  getSession,
  interactionMessageAdapter,
  isParticipant,
  isTrisGuiCustomId,
  parseTrisGuiCustomId,
  playCell,
  refundOnClose,
  resetSessionForNewRound,
  setSession,
  startGame,
} = require("../Utils/Economy/trisGuiRuntime");
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal");
const { finalizeEconomyGuiClose } = require("../Utils/Economy/economyCommandHelpers");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isTrisGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isTrisGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", panelClosed = false, balance = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildTrisGuiPayload(session, cfg, notice, panelClosed, balance);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello tris.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function forceDisableOpenTrisPanel(interaction, client, parsed) {
  const cfg = economyConfig(client);
  const notice =
    "<a:VC_Cross:1482532424570376253> Tris disattivato: sessione chiusa. Le puntate non vengono rimborsate.";
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId).catch(() => null);
  if (session) {
    if (!session.channelId && interaction.channelId) session.channelId = String(interaction.channelId);
    if (!session.messageId && interaction.message?.id) session.messageId = String(interaction.message.id);
    await forceKillTrisSession(client, session, interaction.user?.id || session.ownerId).catch(() => null);
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }
  const panelSession = session || {
    ownerId: String(parsed.ownerId || interaction.user?.id || ""),
    guildId: String(interaction.guild?.id || ""),
    mode: "bot",
    phase: "idle",
    board: ["", "", "", "", "", "", "", "", ""],
    bet: cfg?.minBet || 5,
    playerName: "Tu",
    opponentName: "Bot",
  };
  const payload = await buildTrisGuiPayload(panelSession, cfg, notice, true, false).catch(() => null);
  if (payload) {
    await interaction.message?.edit?.(payload).catch(() => null);
  }
  await interaction
    .followUp?.({
      content: "<a:VC_Cross:1482532424570376253> Il tris è temporaneamente disattivato. Questa sessione non è più utilizzabile.",
      flags: PRIVATE_FLAG,
    })
    .catch(() => null);
}

async function execute(interaction, client) {
  const parsed = parseTrisGuiCustomId(interaction.customId);
  if (!parsed) return false;

  const cfg = economyConfig(client);
  if (cfg?.tris?.enabled === false) {
    await forceDisableOpenTrisPanel(interaction, client, parsed);
    return true;
  }

  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+tris`.");
    return true;
  }

  const msg = interactionMessageAdapter(interaction);
  const uid = String(interaction.user?.id || "");
  const balance = await fetchSpendableBalance(client, session);

  if (session.mode === "pvp") {
        if (parsed.action === "minus" || parsed.action === "plus" || parsed.action === "bet" || parsed.action === "betmodal" || parsed.action === "start") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> In PvP la puntata è fissa all'invito.");
      return true;
    }
    if (parsed.action === "accept") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await acceptPvpChallenge(client, interaction, session, cfg);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const live = (await getSession(interaction.message.id, interaction.guild?.id, parsed.ownerId)) || session;
      await updatePanel(interaction, live, cfg, out.notice, false);
      return true;
    }
    if (parsed.action === "decline") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await declinePvpChallenge(interaction, session);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await updatePanel(interaction, session, cfg, out.notice, out.disabled);
      return true;
    }
    if (parsed.action === "cancel") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await cancelPvpChallenge(interaction, session);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await updatePanel(interaction, session, cfg, out.notice, out.disabled);
      return true;
    }
    if (parsed.action === "cell") {
      if (!isParticipant(session, uid)) {
        await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non fai parte di questa sfida.");
        return true;
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const played = await playCell(client, msg, session, parsed.cell, cfg, uid);
      if (!played.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${played.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const notice = played.finished
        ? formatRoundNotice(played.result, session, uid)
        : `<a:VC_Verified:1482532479637127188> Mossa registrata. Turno di **${session.currentTurnId === session.ownerId ? session.playerName : session.opponentName}**.`;
      const panelClosed = played.finished;
      if (played.finished) {
                deleteSession(interaction.message?.id, session);
      } else {
        setSession(interaction.message.id, session);
      }
      await updatePanel(interaction, session, cfg, notice, panelClosed);
      return true;
    }
    if (parsed.action === "close") {
      if (!isParticipant(session, uid)) {
        await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non fai parte di questa sfida.");
        return true;
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const refunded = await refundOnClose(client, session, uid);
      const notice = refunded.amount > 0
        ? `Sessione chiusa. Puntate rimborsate (**${refunded.amount}** a testa).`
        : !refunded.ok
          ? `Sessione chiusa, ma il rimborso non è riuscito: ${refunded.message}`
          : "Sessione chiusa.";
      await finalizeEconomyGuiClose({
        interaction,
        session,
        cfg,
        notice,
        keepOpen: false,
        setSession,
        deleteSession,
        updatePanel,
      });
      return true;
    }
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Azione non valida per questa sfida.");
    return true;
  }

  if (uid !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo pannello non è tuo.");
    return true;
  }

  if (
    await handleEconomyBetModal({
      interaction,
      parsed,
      session,
      cfg,
      setSession,
      balance,
      onApplied: async (notice) => {
        const payload = await buildTrisGuiPayload(session, cfg, notice, false, balance);
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
      controlId: (action, ownerId) => `tris_gui:${action}:${ownerId}`,
      balance,
      canAdjust: session.phase !== "playing",
      denyMessage: "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di iniziare.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase === "playing") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di iniziare.");
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

  if (parsed.action === "start") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const started = await startGame(client, msg, session);
    if (!started.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${started.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, "<a:VC_Verified:1482532479637127188> Partita iniziata — fai la tua mossa.", false);
    return true;
  }

  if (parsed.action === "cell") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const played = await playCell(client, msg, session, parsed.cell, cfg, uid);
    if (!played.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${played.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = played.finished ? formatRoundNotice(played.result, session, uid) : "<a:VC_Verified:1482532479637127188> Mossa registrata.";
    await updatePanel(interaction, session, cfg, notice, false);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const wasPlaying = session.phase === "playing";
    const refunded = await refundOnClose(client, session, uid);
    const keepOpen = wasPlaying && refunded.ok !== false;
    const notice = !refunded.ok
      ? `Partita ancora aperta: rimborso non riuscito (${refunded.message}). Riprova Chiudi o finisci la partita.`
      : refunded.amount > 0
        ? `Partita annullata. Ti ho restituito **${refunded.amount}** Galeoni. Puoi riprovare.`
        : keepOpen
          ? "Partita annullata. Puoi regolare la puntata e riprovare."
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

module.exports = { name: "trisGui", order: 25, match, execute };