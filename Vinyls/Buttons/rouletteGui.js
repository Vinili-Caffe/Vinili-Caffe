const { MessageFlags } = require("discord.js");
const { SIMPLE_CHOICES, buildRouletteBetPayload, buildRouletteGuiPayload, deleteSession, economyConfig, formatRouletteSpinNotice, getSession, interactionMessageAdapter, isRouletteGuiCustomId, parseRouletteGuiCustomId, pushRouletteSpinGif, setChoice, setSession, spinRouletteSession } = require("../Utils/Economy/rouletteGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isRouletteGuiCustomId(interaction.customId)) return true;
  if (interaction?.isStringSelectMenu?.() && isRouletteGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function updatePanel(interaction, session, cfg, notice = "", disabled = false, animating = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => {});
  }
  const payload = await buildRouletteGuiPayload(session, cfg, notice, disabled, animating);
  await interaction.message?.edit?.(payload).catch(async () => {
    await interaction.followUp?.({ content: "<a:VC_Cross:1482532424570376253> Non riesco ad aggiornare il pannello roulette.", flags: PRIVATE_FLAG }).catch(() => {});
  });
}

async function execute(interaction, client) {
  const parsed = parseRouletteGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo tavolo non è tuo.");
    return true;
  }

  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+roulette`.");
    return true;
  }

  const cfg = economyConfig(client);

  if (parsed.action === "minus" || parsed.action === "plus") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const step = Math.max(1, Math.floor(Number(cfg.minBet) || 5));
    session.bet = parsed.action === "minus"
      ? Math.max(cfg.minBet, session.bet - step)
      : Math.min(cfg.maxBet, session.bet + step);
    setSession(interaction.message.id, session);
    const notice = parsed.action === "minus"
      ? "<a:VC_Verified:1482532479637127188> Puntata abbassata."
      : "<a:VC_Verified:1482532479637127188> Puntata aumentata.";
    const payload = await buildRouletteBetPayload(session, cfg, notice);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "num_lo" || parsed.action === "num_hi") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_pixeltime:1482535344103620771> Attendi che la ruota si fermi.");
      return true;
    }
    const value = interaction.values?.[0];
    const picked = setChoice(session, value);
    if (!picked.ok) {
      await replyPrivate(interaction, `<:vegax:1443934876440068179> ${picked.message}`);
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, `<a:VC_Verified:1482532479637127188> Puntata sul numero **${session.choice}**.`);
    return true;
  }

  if (SIMPLE_CHOICES.has(parsed.action)) {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_pixeltime:1482535344103620771> Attendi che la ruota si fermi.");
      return true;
    }
    const picked = setChoice(session, parsed.action);
    if (!picked.ok) {
      await replyPrivate(interaction, `<:vegax:1443934876440068179> ${picked.message}`);
      return true;
    }
    setSession(interaction.message.id, session);
    await updatePanel(interaction, session, cfg, `<a:VC_Verified:1482532479637127188> Puntata su **${parsed.action}**.`);
    return true;
  }

  if (parsed.action === "spin") {
    if (session.panelAnimating) {
      await replyPrivate(interaction, "<a:VC_pixeltime:1482535344103620771> La ruota sta già girando.");
      return true;
    }
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => {});
    }
    const spin = await spinRouletteSession(client, interactionMessageAdapter(interaction), session);
    if (!spin.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${spin.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    session.panelAnimating = true;
    setSession(interaction.message.id, session);
    const live = getSession(interaction.message.id) || session;
    const finalNotice = formatRouletteSpinNotice(spin.result);
    const spinNotice = "🎡 La pallina è in movimento...";
    void pushRouletteSpinGif(interaction.message, live, cfg, spinNotice, finalNotice);
    return true;
  }

  if (parsed.action === "close") {
    deleteSession(interaction.message?.id);
    session.panelAnimating = false;
    await updatePanel(interaction, session, cfg, "Sessione chiusa.", true);
    return true;
  }

  return false;
}

module.exports = { name: "rouletteGui", order: 25, match, execute };