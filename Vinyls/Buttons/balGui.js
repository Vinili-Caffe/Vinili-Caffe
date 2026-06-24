const { MessageFlags } = require("discord.js");
const { CURRENCY_CAFFE, CURRENCY_VINILI } = require("../Services/Community/serverWalletService");
const { isHighStaff } = require("../Services/Community/serverEconomyService");
const { applyStaffCredit, applyStaffDebit, buildAmountModal, buildBalPayload, buildConvertModal, cycleStep, deleteSession, formatCurrency, getSession, isBalGuiCustomId, isStaffAction, normalizeAmountStep, parseBalGuiCustomId, reloadBalance, setSession, staffCurrencyLabel } = require("../Utils/Economy/balGuiRuntime");
const { convertCaffeToGaleoni } = require("../Services/Community/serverEconomyBridgeService");
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
  await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Solo **High Staff** può gestire il saldo da questo pannello.");
  return false;
}

function currencyBalance(session, currency) {
  const bucket = currency === CURRENCY_CAFFE ? session.state?.caffe : session.state?.vinili;
  return Math.max(0, Math.floor(Number(bucket?.balance) || 0));
}

async function execute(interaction, client) {
  const parsed = parseBalGuiCustomId(interaction.customId);
  if (!parsed) return false;

  if (parsed.kind === "convert_modal") {
    if (parsed.ownerId !== String(interaction.user?.id || "")) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Questo modulo non è tuo.");
      return true;
    }
    const session = getSession(interaction.message?.id);
    if (!session || session.ownerId !== parsed.ownerId || session.targetId !== parsed.targetId) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Sessione scaduta. Usa di nuovo `+bal`.");
      return true;
    }
    const raw = interaction.fields?.getTextInputValue?.("caffe_amount") || "";
    const amount = Math.floor(Number(String(raw).replace(/[^\d]/g, "")));
    const msg = { guild: interaction.guild, member: interaction.member, author: interaction.user };
    const out = await convertCaffeToGaleoni(client, msg, amount);
    if (!out.ok) {
      await replyPrivate(interaction, `<:vegax:1443934876440068179> ${out.message}`);
      return true;
    }
    session.state = out.wallet || session.state;
    session.galeoni = out.gringott
      ? { balance: out.gringott.balance, earned: out.gringott.earned, spent: out.gringott.spent }
      : session.galeoni;
    await reloadBalance(client, session, msg);
    session.lastNotice = out.message;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, session.lastNotice, false);
    await interaction.update(payload).catch(() => {});
    return true;
  }

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
    const payload = await buildBalPayload(session, `<a:VC_Verified:1482532479637127188> Importo impostato a **${formatCurrency(session.staffCurrency, amt)}**.`, false);
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

  if (action === "convert") {
    if (!session.canConvert) {
      await replyPrivate(interaction, "<a:VC_Cross:1482532424570376253> Conversione non disponibile su questo pannello.");
      return true;
    }
    await interaction.showModal(buildConvertModal(session)).catch(() => {});
    return true;
  }

  if (action === "amount_modal") {
    await interaction.showModal(buildAmountModal(session)).catch(() => {});
    return true;
  }

  if (action === "pick_vinili" || action === "pick_caffe") {
    session.staffCurrency = action === "pick_caffe" ? CURRENCY_CAFFE : CURRENCY_VINILI;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `Valuta: **${staffCurrencyLabel(session.staffCurrency)}**.`, false);
    await interaction.update(payload).catch(() => {});
    return true;
  }

  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate().catch(() => {});

  if (action === "step_down") {
    session.adjustAmount = cycleStep(session.adjustAmount, -1);
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `Importo: **${formatCurrency(session.staffCurrency, session.adjustAmount)}**.`, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "step_up") {
    session.adjustAmount = cycleStep(session.adjustAmount, 1);
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, `Importo: **${formatCurrency(session.staffCurrency, session.adjustAmount)}**.`, false);
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
    const cur = result.currency || session.staffCurrency;
    session.lastNotice = `<a:VC_Verified:1482532479637127188> Aggiunti **${formatCurrency(cur, result.entry?.amount || session.adjustAmount)}** — nuovo saldo **${formatCurrency(cur, currencyBalance(session, cur))}**.`;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, session.lastNotice, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "debit") {
    const result = await applyStaffDebit(client, session, userId);
    if (!result.ok) {
      const msg = result.code === "insufficient_funds"
        ? `Saldo ${staffCurrencyLabel(result.currency || session.staffCurrency)} insufficiente.`
        : `Impossibile rimuovere: \`${result.code || "errore"}\`.`;
      await followPrivate(interaction, `<:vegax:1443934876440068179> ${msg}`);
      return true;
    }
    session.state = result.state;
    const cur = result.currency || session.staffCurrency;
    session.lastNotice = `<a:VC_Verified:1482532479637127188> Rimossi **${formatCurrency(cur, result.entry?.amount || session.adjustAmount)}** — nuovo saldo **${formatCurrency(cur, currencyBalance(session, cur))}**.`;
    setSession(interaction.message.id, session);
    const payload = await buildBalPayload(session, session.lastNotice, false);
    await interaction.message?.edit?.(payload).catch(() => {});
    return true;
  }

  if (action === "refresh") {
    const msg = { guild: interaction.guild, member: interaction.member, author: interaction.user };
    await reloadBalance(client, session, msg);
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