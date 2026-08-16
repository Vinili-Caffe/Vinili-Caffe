const { MessageFlags } = require("discord.js");
const { acceptPvpChallenge, cancelPvpChallenge, declinePvpChallenge, getSession, isDuelGuiCustomId, parseDuelGuiCustomId } = require("../Utils/Economy/duelGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isDuelGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction) {
  const parsed = parseDuelGuiCustomId(interaction.customId);
  if (!parsed) return false;
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+duel`.");
    return true;
  }
  if (parsed.action === "accept") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const out = await acceptPvpChallenge(interaction.client, interaction, session);
    if (!out.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    return true;
  }
  if (parsed.action === "decline") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const out = await declinePvpChallenge(interaction.client, interaction, session);
    if (!out.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await interaction.message?.edit?.(out.payload).catch(() => {});
    return true;
  }
  if (parsed.action === "cancel") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const out = await cancelPvpChallenge(interaction.client, interaction, session);
    if (!out.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${out.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    await interaction.message?.edit?.(out.payload).catch(() => {});
    return true;
  }
  return false;
}

module.exports = { name: "duelGui", order: 25, match, execute };