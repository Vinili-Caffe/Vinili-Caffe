const { MessageFlags } = require("discord.js");
const { isHighStaff } = require("../Services/Community/galeoniEconomyService");
const { formatGaleoni } = require("../Services/Community/gringottService");
const { applyStaffCredit, applyStaffDebit, buildAmountModal, buildBalPayload, cycleStep, deleteSession, getSession, isBalGuiCustomId, isStaffAction, normalizeAmountStep, parseBalGuiCustomId, reloadBalance, setSession } = require("../Utils/Economy/balGuiRuntime");
const PRIVATE_FLAG = MessageFlags.Ephemeral;

function match(interaction) {
  if (interaction?.isButton?.() && isBalGuiCustomId(interaction.customId)) return true;
  if (interaction?.isModalSubmit?.() && isBalGuiCustomId(interaction.customId)) return true;
  return false;
}

async function replyPrivate(interaction, content) {
  await interaction.reply({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function followPrivate(interaction, content) {
  await interaction.followUp({ content, flags: PRIVATE_FLAG }).catch(() => {});
}

async function ensureStaff(interaction, client) {
  const ok = await isHighStaff(interaction.member, client, interaction.user?.id);
  if (ok) return true;
  await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Solo **High Staff** può gestire i Galeoni da questo pannello.");
  return false;
}

async function execute(interaction, client) {
  const parsed = parseBalGuiCustomId(interaction.customId);
  if (!parsed) return false;

  if (parsed.kind === "modal") {
    if (!(await ensureStaff(interaction, client))) return true;
    const session = getSession(interaction.message?.id);
    if (!session || session.ownerId !== parsed.ownerId || session.targetId !== parsed.targetId) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+bal`.");
      return true;
    }
    const raw = interaction.fields?.getTextInputValue?.("amount") || "";
    const amt = normalizeAmountStep(String(raw).replace(/[^\d]/g, ""));
    if (amt < 1) {
      await replyPrivate(interaction, "<:vegax:1443934876440068179> Inserisci un importo valido (minimo 1).");
      return true;
    }
    session.adjustAmount = amt;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `<a:VC_Verified:1482532479637127188> Importo impostato a **${formatGaleoni(amt)}**.`, false);
    await interaction.update(payload).catch(() => {});
    return true;
  }

  const session = getSession(interaction.message?.id);
  if (!session) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+bal`.");
    return true;
  }
  if (session.ownerId !== parsed.ownerId || session.targetId !== parsed.targetId) {
    await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Pannello non valido.");
    return true;
  }

  const action = parsed.action;
  const userId = String(interaction.user?.id || "");
  const isOwner = userId === session.ownerId;

  if (isStaffAction(action)) {
    if (!session.showStaffControls) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo pannello non ha controlli staff.");
      return true;
    }
    if (!(await ensureStaff(interaction, client))) return true;
  } else if (action === "close") {
    if (!isOwner) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può chiuderlo.");
      return true;
    }
  } else if (action === "refresh" && !isOwner) {
    if (!(await isHighStaff(interaction.member, client, userId))) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Non puoi aggiornare questo pannello.");
      return true;
    }
  }

  if (action === "amount_modal") {
    await interaction.showModal(buildAmountModal(session)).catch(() => {});
    return true;
  }

  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});

  if (action === "step_down") {
    session.adjustAmount = cycleStep(session.adjustAmount, -1);
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `Importo: **${formatGaleoni(session.adjustAmount)}**.`, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "step_up") {
    session.adjustAmount = cycleStep(session.adjustAmount, 1);
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `Importo: **${formatGaleoni(session.adjustAmount)}**.`, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "credit") {
    const result = await applyStaffCredit(client, session, userId);
    if (!result.ok) {
      await followPrivate(interaction, `<:vegax:1443934876440068179> Impossibile aggiungere: \`${result.code || "errore"}\`.`);
      return true;
    }
    session.state = result.state;
    session.lastNotice = `<a:VC_Verified:1482532479637127188> Aggiunti **${formatGaleoni(result.entry?.amount || session.adjustAmount)}** — nuovo saldo **${formatGaleoni(result.state?.balance || 0)}**.`;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, session.lastNotice, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "debit") {
    const result = await applyStaffDebit(client, session, userId);
    if (!result.ok) {
      const msg = result.code === "insufficient_funds"
        ? "Saldo insufficiente per la rimozione richiesta."
        : `Impossibile rimuovere: \`${result.code || "errore"}\`.`;
      await followPrivate(interaction, `<:vegax:1443934876440068179> ${msg}`);
      return true;
    }
    session.state = result.state;
    session.lastNotice = `<a:VC_Verified:1482532479637127188> Rimossi **${formatGaleoni(result.entry?.amount || session.adjustAmount)}** — nuovo saldo **${formatGaleoni(result.state?.balance || 0)}**.`;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, session.lastNotice, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "refresh") {
    await reloadBalance(client, session);
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, "<a:VC_Verified:1482532479637127188> Saldo aggiornato.", false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "close") {
    deleteSession(interaction.message?.id);
    session.panelClosed = true;
    const payload = await buildBalPayload(session, "Pannello chiuso.", true);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { name: "balGui", order: 25, match, execute };