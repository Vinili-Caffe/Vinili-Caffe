const { MessageFlags } = require("discord.js");
const {
  acceptPvpChallenge,
  buildTrisGuiPayload,
  cancelPvpChallenge,
  declinePvpChallenge,
  deleteSession,
  economyConfig,
  formatRoundNotice,
  getSession,
  interactionMessageAdapter,
  isParticipant,
  isTrisGuiCustomId,
  parseTrisGuiCustomId,
  playCell,
  resetSessionForNewRound,
  setSession,
  startGame,
} = require("../Utils/Economy/trisGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isTrisGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", panelClosed = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildTrisGuiPayload(session, cfg, notice, panelClosed);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello tris.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction, client) {
  const parsed = parseTrisGuiCustomId(interaction.customId);
  if (!parsed) return false;

  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+tris`.");
    return true;
  }

  const cfg = economyConfig(client);
  const msg = interactionMessageAdapter(interaction);
  const uid = String(interaction.user?.id || "");

  if (session.mode === "pvp") {
    if (parsed.action === "accept") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await acceptPvpChallenge(client, interaction, session, cfg);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const live = getSession(interaction.message.id) || session;
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
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const played = await playCell(client, msg, session, parsed.cell, cfg, uid);
      if (!played.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${played.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      setSession(interaction.message.id, session);
      const notice = played.finished
        ? formatRoundNotice(played.result, session, uid)
        : `<a:VC_Verified:1482532479637127188> Mossa registrata. Turno di **${session.currentTurnId === session.ownerId ? session.playerName : session.opponentName}**.`;
      const panelClosed = played.finished;
      if (played.finished) deleteSession(interaction.message?.id);
      await updatePanel(interaction, session, cfg, notice, panelClosed);
      return true;
    }
    if (parsed.action === "close") {
      if (!isParticipant(session, uid)) {
        await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non fai parte di questa sfida.");
        return true;
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      deleteSession(interaction.message?.id);
      resetSessionForNewRound(session);
      await updatePanel(interaction, session, cfg, "Sessione chiusa.", true);
      return true;
    }
    return false;
  }

  if (uid !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo pannello non è tuo.");
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (session.phase === "playing") {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> La puntata si cambia solo prima di iniziare.");
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
    await updatePanel(interaction, session, cfg, notice, false);
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
    deleteSession(interaction.message?.id);
    resetSessionForNewRound(session);
    await updatePanel(interaction, session, cfg, "Sessione chiusa.", true);
    return true;
  }

  return false;
}

module.exports = { name: "trisGui", order: 25, match, execute };