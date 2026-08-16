const { MessageFlags } = require("discord.js");
const {
  buildIncomeClaimPayload,
  claimFromPanel,
  deleteSession,
  formatClaimNotice,
  getSession,
  interactionMessageAdapter,
  isIncomeGuiCustomId,
  parseIncomeGuiCustomId,
  setSession,
  syncSessionPeek,
} = require("../Utils/Economy/incomeClaimGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isIncomeGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction, client) {
  const parsed = parseIncomeGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo pannello non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, `<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo \`+${parsed.incomeType}\`.`);
    return true;
  }
  if (session.incomeType !== parsed.incomeType) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Pannello non valido.");
    return true;
  }

  if (parsed.action === "claim") {
    if (session.phase === "claiming") return true;
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    session.phase = "claiming";
    setSession(interaction.message.id, session);
    const messageLike = await interactionMessageAdapter(interaction);
    const claimed = await claimFromPanel(client, messageLike, session);
    if (!claimed.ok) {
      session.phase = "idle";
      await syncSessionPeek(client, messageLike, session);
      setSession(interaction.message.id, session);
      const payload = await buildIncomeClaimPayload(session, "", false, client);
      await interaction.message?.edit?.(payload).catch(() => {});
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${claimed.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = formatClaimNotice(claimed.result, session.incomeType, client);
    const payload = await buildIncomeClaimPayload(session, notice, false, client);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    const payload = await buildIncomeClaimPayload(session, "Sessione chiusa.", true, client);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "incomeClaimGui", order: 24, match, execute };