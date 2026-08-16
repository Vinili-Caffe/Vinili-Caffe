const { MessageFlags } = require("discord.js");
const { CURRENCY_CAFFE, CURRENCY_VINILI } = require("../Services/Community/serverWalletService");
const {
  buildShopPayload,
  deleteSession,
  getSession,
  isShopGuiCustomId,
  parseShopGuiCustomId,
  purchaseFromSession,
  reloadPanelState,
  setSession,
} = require("../Utils/Economy/shopGuiRuntime");

const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  return Boolean(interaction?.isButton?.() && isShopGuiCustomId(interaction.customId));
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function execute(interaction, client) {
  const parsed = parseShopGuiCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id || "") !== parsed.ownerId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo shop non è tuo.");
    return true;
  }
  const session = await getSession(interaction.message?.id, interaction.guild?.id, parsed.ownerId);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+shop`.");
    return true;
  }
  const msg = { guild: interaction.guild, member: interaction.member, author: interaction.user };

  if (parsed.action === "close") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    deleteSession(interaction.message?.id);
    session.panelClosed = true;
    await interaction.message?.edit?.(buildShopPayload(session, true)).catch(() => {});
    return true;
  }

  if (parsed.action === "pick_vinili" || parsed.action === "pick_caffe") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    session.currency = parsed.action === "pick_vinili" ? CURRENCY_VINILI : CURRENCY_CAFFE;
    session.lastNotice = "";
    const reload = await reloadPanelState(client, msg, session);
    if (!reload.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${reload.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await interaction.message?.edit?.(buildShopPayload(session)).catch(() => {});
    return true;
  }

  if (parsed.action === "refresh") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    session.lastNotice = "";
    const reload = await reloadPanelState(client, msg, session);
    if (!reload.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${reload.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await interaction.message?.edit?.(buildShopPayload(session)).catch(() => {});
    return true;
  }

  if (parsed.action === "buy") {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});
    const bought = await purchaseFromSession(client, msg, session, parsed.itemId);
    if (!bought.ok) {
      await interaction.followUp({ content: `<:vegax:1443934876440068179> ${bought.message}`, flags: PRIVATE_FLAG }).catch(() => {});
      return true;
    }
    setSession(interaction.message.id, session);
    await interaction.message?.edit?.(bought.payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "shopGui", order: 26, match, execute };