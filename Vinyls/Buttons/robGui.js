const { MessageFlags } = require("discord.js");
const { attemptRob, buildRobGuiPayload, deleteSession, economyConfig, getSession, interactionMessageAdapter, isRobGuiCustomId, makeGringottTarget, parseRobGuiCustomId, pickRandomTarget, resetForNewAttempt, pushRobHitAnimation, setSession } = require("../Utils/Economy/robGuiRuntime");
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
    if (session.isBank) {
      const pick = await pickRandomTarget(client, interaction.message, interaction.user.id, cfg);
      if (!pick) {
        await interaction.followUp({ content: "<:vegax:1443934876440068179> Nessun giocatore idoneo. Resta su Gringott o usa `+rob @utente`.", flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      session.targetId = pick.id;
      session.targetName = pick.name;
      session.isBank = false;
    } else {
      const bank = makeGringottTarget();
      session.targetId = bank.id;
      session.targetName = bank.name;
      session.isBank = true;
    }
    session.lastResult = null;
    session.phase = "idle";
    setSession(interaction.message.id, session);
    const payload = await buildRobGuiPayload(session, "", false, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "hit") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    if (session.phase === "done") {
      await replyPrivate(interaction, "<:vegax:1443934876440068179> Hai già tentato il colpo. Usa di nuovo `+rob` quando il cooldown è finito.");
      return true;
    }
    const cfg = economyConfig(client);
    const hit = await pushRobHitAnimation(interaction.message, session, () => attemptRob(client, msg, session, cfg));
    if (!hit.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${hit.message}`, flags: PRIVATE_FLAG }).catch(() => {});
    }
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    resetForNewAttempt(session);
    const payload = await buildRobGuiPayload(session, "", true, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "robGui", order: 25, match, execute };