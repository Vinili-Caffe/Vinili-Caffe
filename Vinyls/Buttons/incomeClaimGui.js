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
  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, `<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo \`+${parsed.incomeType}\`.`);
    return true;
  }
  if (session.incomeType !== parsed.incomeType) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Pannello non valido.");
    return true;
  }

  if (parsed.action === "claim") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const claimed = await claimFromPanel(client, interactionMessageAdapter(interaction), session);
    if (!claimed.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${claimed.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    const notice = formatClaimNotice(claimed.result, session.incomeType);
    const payload = await buildIncomeClaimPayload(session, notice, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    const payload = await buildIncomeClaimPayload(session, "Sessione chiusa.", true);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "incomeClaimGui", order: 24, match, execute };