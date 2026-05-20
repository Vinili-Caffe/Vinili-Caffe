const { MessageFlags } = require("discord.js");
const {
  attemptRob,
  buildRobGuiPayload,
  deleteSession,
  economyConfig,
  formatRobNotice,
  getSession,
  interactionMessageAdapter,
  isRobGuiCustomId,
  makeGringottTarget,
  parseRobGuiCustomId,
  pickRandomTarget,
  resetForNewAttempt,
  scheduleRobIdlePanel,
  setSession,
} = require("../Utils/Economy/robGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isRobGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction, client) {
  const parsed = parseRobGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo piano non è tuo.");
    return true;
  }
  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+rob`.");
    return true;
  }
  const msg = interactionMessageAdapter(interaction);

  if (parsed.action === "reroll") {
    if (session.phase === "done") resetForNewAttempt(session);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const cfg = economyConfig(client);
    let notice = "<a:VC_Verified:1482532479637127188> Obiettivo: cassaforte Gringott.";
    if (session.isBank) {
      const pick = await pickRandomTarget(client, interaction.message, interaction.user.id, cfg);
      if (!pick) {
        await interaction.followUp({ content: "<:vegax:1443934876440068179> Nessun giocatore idoneo. Resta su Gringott o usa `+rob @utente`.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      session.targetId = pick.id;
      session.targetName = pick.name;
      session.isBank = false;
      notice = `<a:VC_Verified:1482532479637127188> Bersaglio: **${pick.name}**.`;
    } else {
      const bank = makeGringottTarget();
      session.targetId = bank.id;
      session.targetName = bank.name;
      session.isBank = true;
    }
    session.lastResult = null;
    session.phase = "idle";
    setSession(interaction.message.id, session);
    const payload = await buildRobGuiPayload(session, notice, false, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "hit") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    if (session.phase === "done") {
      await replyPrivate(interaction, "<:vegax:1443934876440068179> Hai già tentato il colpo. Usa di nuovo `+rob` quando il cooldown è finito.");
      return true;
    }
    const hit = await attemptRob(client, msg, session, economyConfig(client));
    if (!hit.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${hit.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    session.panelAnimating = true;
    setSession(interaction.message.id, session);
    const notice = formatRobNotice(hit.result, session.targetName);
    const spinPayload = await buildRobGuiPayload(session, "🥷 Infiltrazione in corso…", false, true);
    await interaction.message?.edit?.(spinPayload).catch(() => {});
    scheduleRobIdlePanel(interaction.message, getSession(interaction.message.id) || session, notice);
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    resetForNewAttempt(session);
    const payload = await buildRobGuiPayload(session, "Sessione chiusa.", true, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "robGui", order: 25, match, execute };