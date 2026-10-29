const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { buildRpsBetPayload, buildRpsGuiPayload, cancelPvpChallenge, deleteSession, economyConfig, formatRpsRoundNotice, getSession, interactionMessageAdapter, isParticipant, isRpsGuiCustomId, parseRpsGuiCustomId, playRpsSession, acceptPvpChallenge, declinePvpChallenge, finalizePvpMatch, refundOnClose, scheduleRpsIdlePanel, setPvpChoice, setSession } = require("../Utils/Economy/rpsGuiRuntime") as typeof import("../Utils/Economy/rpsGuiRuntime");
const { handleEconomyBetButton, handleEconomyBetModal, clampBetAmount, fetchSpendableBalance } = require("../Utils/Economy/economyBetModal") as typeof import("../Utils/Economy/economyBetModal");
const { finalizeEconomyGuiClose } = require("../Utils/Economy/economyCommandHelpers") as typeof import("../Utils/Economy/economyCommandHelpers");
const PRIVATE_FLAG = MessageFlags.Ephemeral;
const CHOICE_ACTIONS_SET = new Set(["sasso", "carta", "forbici"]);

function match(interaction?) {
  if (interaction?.isButton?.() && isRpsGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isRpsGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction?, content?) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction?, session?, cfg?, notice = "", disabled = false, animating = false, balance = null) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildRpsGuiPayload(session, cfg, notice, disabled, animating, balance);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello morra.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function handlePvpChoice(interaction?, client?, session?, cfg?, choice?) {
  if (session.phase !== "pick") {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non puoi scegliere ora.");
    return true;
  }
  if (!isParticipant(session, interaction.user?.id)) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non fai parte di questa sfida.");
    return true;
  }
  const picked = setPvpChoice(session, interaction.user.id, choice);
  if (!picked.ok) {
    await replyPrivate(interaction, `<:vegax:1443934876440068179> ${picked.message}`);
    return true;
  }
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  setSession(interaction.message.id, session);
  if (!picked.ready) {
    const payload = await buildRpsGuiPayload(session, cfg, "<a:VC_Verified:1482532479637127188> Mossa registrata. In attesa dell'avversario…", false, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    await interaction.followUp({ content: "<a:VC_Verified:1482532479637127188> Mossa registrata in segreto.", flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  const finalized = await finalizePvpMatch(client, interaction.guild, session, interaction.user.id);
  if (!finalized.ok) {
    await interaction.followUp({ content: `<:vegax:1443934876440068179> ${finalized.message}`, flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }
  session.stakesLocked = false;
  setSession(interaction.message.id, session);
  const live = session;
  const finalNotice = formatRpsRoundNotice(finalized.result);
  const payload = await buildRpsGuiPayload(live, cfg, "🎬 3… 2… 1… via!", false, true);
  await interaction.message?.edit?.(payload).catch(() => {});
  scheduleRpsIdlePanel(interaction.message, live, cfg, finalNotice);
  return true;
}

async function execute(interaction?, client?) {
  const parsed = parseRpsGuiCustomId(interaction.customId);
  if (!parsed) return false;

  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+rps`.");
    return true;
  }

  const cfg = economyConfig(client);
  const uid = String(interaction.user?.id || "");
  const balance = await fetchSpendableBalance(client, session);

  if (session.mode === "pvp") {
    if (parsed.action === "accept") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await acceptPvpChallenge(client, interaction, session, cfg);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const live = (await getSession(interaction.message.id, interaction.guild?.id, parsed.ownerId)) || session;
      await updatePanel(interaction, live, cfg, out.notice, false, false);
      return true;
    }
    if (parsed.action === "decline") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await declinePvpChallenge(interaction, session);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await updatePanel(interaction, session, cfg, out.notice, out.disabled, false);
      return true;
    }
    if (parsed.action === "cancel") {
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const out = await cancelPvpChallenge(interaction, session);
      if (!out.ok) {
        await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      await updatePanel(interaction, session, cfg, out.notice, out.disabled, false);
      return true;
    }
    if (CHOICE_ACTIONS_SET.has(parsed.action)) {
      return handlePvpChoice(interaction, client, session, cfg, parsed.action);
    }
    if (parsed.action === "close") {
      if (!isParticipant(session, uid)) {
        await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non fai parte di questa sfida.");
        return true;
      }
      if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
      const refunded = await refundOnClose(client, session, uid);
      session.panelAnimating = false;
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
    return false;
  }

  if (uid !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questa partita non è tua.");
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
      onApplied: async (notice?) => {
        const payload = await buildRpsBetPayload(session, cfg, notice, balance);
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
      controlId: (action?, ownerId?) => `rps_gui:${action}:${ownerId}`,
      balance,
      canAdjust: !session.panelAnimating && session.mode !== "pvp",
      denyMessage: "<a:VC_Cross:1482532424570376253> La puntata non si può cambiare ora.",
    })
  ) {
    return true;
  }

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
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
    const payload = await buildRpsBetPayload(session, cfg, notice, balance);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (CHOICE_ACTIONS_SET.has(parsed.action)) {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_pixeltime:1482535344103620771> Attendi che la mano del rivale si riveli.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const round = await playRpsSession(client, interactionMessageAdapter(interaction), session, parsed.action);
    if (!round.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${round.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    session.panelAnimating = true;
    setSession(interaction.message.id, session);
    const live = session;
    const finalNotice = formatRpsRoundNotice(round.result);
    const payload = await buildRpsGuiPayload(live, cfg, "🎬 3… 2… 1… via!", false, true);
    await interaction.message?.edit?.(payload).catch(() => {});
    scheduleRpsIdlePanel(interaction.message, live, cfg, finalNotice);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const refunded = await refundOnClose(client, session, interaction.user?.id);
    session.panelAnimating = false;
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

  return false;
}

export = { name: "rpsGui", order: 25, match, execute };