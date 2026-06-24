const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload");
const { CURRENCY_CAFFE, CURRENCY_VINILI, addCurrency, formatCurrency, getServerWallet, spendCurrency } = require("../../Services/Community/serverWalletService");
const { getBalBridgePanel } = require("../../Services/Community/serverEconomyBridgeService");
const PREFIX = "bal_gui";
const MODAL_PREFIX = "bal_gui_md";
const CONVERT_MODAL_PREFIX = "bal_gui_cv";
const SESSION_TTL_MS = 12 * 60 * 1000;
const AMOUNT_STEPS = [2, 5, 10, 25, 50, 100];
const sessions = new Map();

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function normalizeAmountStep(value) {
  const n = Math.floor(Number(value) || 0);
  if (!Number.isFinite(n) || n < 1) return AMOUNT_STEPS[1];
  if (n > 500000) return 500000;
  return n;
}

function cycleStep(current, direction) {
  const cur = normalizeAmountStep(current);
  const idx = AMOUNT_STEPS.indexOf(cur);
  if (idx >= 0) {
    const next = idx + (direction > 0 ? 1 : -1);
    if (next >= 0 && next < AMOUNT_STEPS.length) return AMOUNT_STEPS[next];
  }
  const sorted = [...AMOUNT_STEPS].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (direction > 0 && sorted[i] > cur) return sorted[i];
    if (direction < 0 && sorted[sorted.length - 1 - i] < cur) return sorted[sorted.length - 1 - i];
  }
  return direction > 0 ? sorted[sorted.length - 1] : sorted[0];
}

function emptyWalletState() {
  return {
    vinili: { balance: 0, earned: 0, spent: 0 },
    caffe: { balance: 0, earned: 0, spent: 0 },
  };
}

function makeSession({ ownerId, guildId, targetId, targetName, showStaffControls, state, adjustAmount, staffCurrency, bridge }) {
  const bridgeData = bridge && typeof bridge === "object" ? bridge : {};
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    targetId: String(targetId || ""),
    targetName: String(targetName || "").trim() || "Utente",
    showStaffControls: Boolean(showStaffControls),
    state: state || emptyWalletState(),
    adjustAmount: normalizeAmountStep(adjustAmount ?? AMOUNT_STEPS[1]),
    staffCurrency: staffCurrency === CURRENCY_CAFFE ? CURRENCY_CAFFE : CURRENCY_VINILI,
    showGaleoni: Boolean(bridgeData.showGaleoni),
    canConvert: Boolean(bridgeData.canConvert),
    galeoni: bridgeData.galeoni || { balance: 0, earned: 0, spent: 0 },
    conversion: bridgeData.conversion || null,
    lastNotice: "",
    panelClosed: false,
    createdAt: now(),
    updatedAt: now(),
  };
}

function setSession(messageId, session) {
  sessions.set(sessionKey(messageId), { ...session, updatedAt: now() });
}

function getSession(messageId) {
  const key = sessionKey(messageId);
  const cached = sessions.get(key);
  if (!cached) return null;
  if (now() - Number(cached.updatedAt || cached.createdAt || 0) > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return cached;
}

function deleteSession(messageId) {
  sessions.delete(sessionKey(messageId));
}

function controlId(action, ownerId, targetId) {
  return `${PREFIX}:${action}:${ownerId}:${targetId}`;
}

function modalId(ownerId, targetId) {
  return `${MODAL_PREFIX}:${ownerId}:${targetId}`;
}

function isBalGuiCustomId(customId) {
  const id = String(customId || "");
  return id.startsWith(`${PREFIX}:`) || id.startsWith(`${MODAL_PREFIX}:`) || id.startsWith(`${CONVERT_MODAL_PREFIX}:`);
}

function parseBalGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] === CONVERT_MODAL_PREFIX && parts.length >= 3) {
    return { kind: "convert_modal", ownerId: parts[1], targetId: parts[2] };
  }
  if (parts[0] === PREFIX && parts.length >= 4) {
    return { kind: "button", action: parts[1], ownerId: parts[2], targetId: parts[3] };
  }
  if (parts[0] === MODAL_PREFIX && parts.length >= 3) {
    return { kind: "modal", ownerId: parts[1], targetId: parts[2] };
  }
  return null;
}

function isStaffAction(action) {
  return ["step_down", "step_up", "credit", "debit", "amount_modal", "pick_vinili", "pick_caffe"].includes(String(action || ""));
}

function staffCurrencyLabel(currency) {
  return currency === CURRENCY_CAFFE ? "Caffè" : "Vinili";
}

function buildRows(session, panelClosed = false) {
  const ownerId = session.ownerId;
  const targetId = session.targetId;
  const locked = Boolean(panelClosed);
  const rows = [];
  if (session.showStaffControls) {
    const cur = session.staffCurrency === CURRENCY_CAFFE ? CURRENCY_CAFFE : CURRENCY_VINILI;
    const stepLabel = `${session.adjustAmount}`;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("pick_vinili", ownerId, targetId)).setLabel("Vinili").setEmoji("💿").setStyle(cur === CURRENCY_VINILI ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("pick_caffe", ownerId, targetId)).setLabel("Caffè").setEmoji("☕").setStyle(cur === CURRENCY_CAFFE ? ButtonStyle.Primary : ButtonStyle.Secondary).setDisabled(locked),
      ),
    );
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("step_down", ownerId, targetId)).setLabel("«").setStyle(ButtonStyle.Secondary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("amount_modal", ownerId, targetId)).setLabel(stepLabel).setEmoji(cur === CURRENCY_CAFFE ? "☕" : "💿").setStyle(ButtonStyle.Primary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("step_up", ownerId, targetId)).setLabel("»").setStyle(ButtonStyle.Secondary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("debit", ownerId, targetId)).setLabel("Togli").setEmoji("➖").setStyle(ButtonStyle.Danger).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("credit", ownerId, targetId)).setLabel("Aggiungi").setEmoji("➕").setStyle(ButtonStyle.Success).setDisabled(locked),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      ...(session.canConvert
        ? [
            new ButtonBuilder()
              .setCustomId(controlId("convert", ownerId, targetId))
              .setLabel("Converti Caffè")
              .setEmoji("🪙")
              .setStyle(ButtonStyle.Success)
              .setDisabled(locked),
          ]
        : []),
      new ButtonBuilder().setCustomId(controlId("refresh", ownerId, targetId)).setLabel("Aggiorna").setEmoji("🔄").setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("close", ownerId, targetId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ),
  );
  return rows;
}

function bridgeHintForSession(session) {
  const conv = session.conversion;
  if (!session.showGaleoni) return "";
  if (session.canConvert && conv?.rateLabel) {
    return `${conv.rateLabel} · oggi ancora ${conv.remainingGaleoni} Galeoni`;
  }
  return "Saldo evento Hogwarts su Gringott";
}

async function renderPanel(session, notice = "") {
  try {
    const renderBalCanvas = require("../Render/balCanvas");
    const status = canvasStatusLine(notice);
    const rendered = await renderBalCanvas({
      targetLabel: session.targetName,
      vinili: session.state?.vinili || emptyWalletState().vinili,
      caffe: session.state?.caffe || emptyWalletState().caffe,
      galeoni: session.galeoni || { balance: 0, earned: 0, spent: 0 },
      showGaleoni: session.showGaleoni,
      bridgeHint: bridgeHintForSession(session),
      staffMode: session.showStaffControls,
      staffCurrency: session.staffCurrency,
      noticeShort: status || (session.showStaffControls ? `${staffCurrencyLabel(session.staffCurrency)} · ${session.adjustAmount}` : session.showGaleoni ? "Vinili · Caffè · Galeoni" : "Vinili & Caffè"),
    });
    const fileName = "server-bal.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}` };
  } catch (error) {
    global.logger?.warn?.("[BAL GUI] render:", error?.message || error);
    return { files: [], image: null };
  }
}

async function buildBalPayload(session, notice = "", panelClosed = false) {
  const attachment = await renderPanel(session, notice);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, panelClosed),
  });
}

async function reloadBalance(client, session, messageLike = null) {
  const state = await getServerWallet(session.guildId, session.targetId);
  session.state = state || emptyWalletState();
  const msg = messageLike || { guild: { id: session.guildId }, author: { id: session.ownerId }, member: null };
  const bridge = await getBalBridgePanel(client, msg, session.ownerId, session.targetId);
  session.showGaleoni = bridge.showGaleoni;
  session.canConvert = bridge.canConvert;
  session.galeoni = bridge.galeoni;
  session.conversion = bridge.conversion;
  session.updatedAt = now();
  return session;
}

function convertModalId(ownerId, targetId) {
  return `${CONVERT_MODAL_PREFIX}:${ownerId}:${targetId}`;
}

function buildConvertModal(session) {
  const min = Math.max(1, Math.floor(Number(session.conversion?.cfg?.minCaffeConvert) || 8));
  const rate = Math.max(1, Math.floor(Number(session.conversion?.cfg?.caffePerGaleone) || 4));
  return new ModalBuilder()
    .setCustomId(convertModalId(session.ownerId, session.targetId))
    .setTitle("Converti Caffè in Galeoni")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("caffe_amount")
          .setLabel(`Caffè da convertire (${rate} → 1 Galeone)`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(7)
          .setPlaceholder(`Min ${min}`)
          .setValue(String(min)),
      ),
    );
}

async function applyStaffCredit(client, session, actorId) {
  const amt = normalizeAmountStep(session.adjustAmount);
  const currency = session.staffCurrency === CURRENCY_CAFFE ? CURRENCY_CAFFE : CURRENCY_VINILI;
  return addCurrency({
    guildId: session.guildId,
    userId: session.targetId,
    currency,
    amount: amt,
    reason: "Regolazione High Staff",
    actorId,
    source: "staff_bal_panel",
  });
}

async function applyStaffDebit(client, session, actorId) {
  const amt = normalizeAmountStep(session.adjustAmount);
  const currency = session.staffCurrency === CURRENCY_CAFFE ? CURRENCY_CAFFE : CURRENCY_VINILI;
  return spendCurrency({
    guildId: session.guildId,
    userId: session.targetId,
    currency,
    amount: amt,
    reason: "Regolazione High Staff",
    actorId,
    source: "staff_bal_panel",
  });
}

function buildAmountModal(session) {
  const cur = session.staffCurrency === CURRENCY_CAFFE ? CURRENCY_CAFFE : CURRENCY_VINILI;
  return new ModalBuilder()
    .setCustomId(modalId(session.ownerId, session.targetId))
    .setTitle(`Importo ${staffCurrencyLabel(cur)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Quantità")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(7)
          .setPlaceholder("Es. 25")
          .setValue(String(session.adjustAmount || 10)),
      ),
    );
}

async function warmupBalPanel() {
  try {
    const renderBalCanvas = require("../Render/balCanvas");
    if (typeof renderBalCanvas.warmup === "function") renderBalCanvas.warmup();
    await renderBalCanvas({
      targetLabel: "Utente",
      vinili: { balance: 12, earned: 20, spent: 8 },
      caffe: { balance: 8, earned: 15, spent: 7 },
    });
  } catch (_) {}
}


setImmediate(() => {
  warmupBalPanel().catch(() => {});
});

async function openBalPanel(client, message, options = {}) {
  const guildId = String(message?.guild?.id || "");
  const targetId = String(options.targetId || message?.author?.id || "");
  const targetName = String(options.targetName || "Utente").trim() || "Utente";
  const state = await getServerWallet(guildId, targetId);
  const bridge = await getBalBridgePanel(client, message, message.author.id, targetId);
  const session = makeSession({
    ownerId: message.author.id,
    guildId,
    targetId,
    targetName,
    showStaffControls: Boolean(options.showStaffControls),
    state: state || emptyWalletState(),
    bridge,
  });
  await warmupBalPanel();
  return { ok: true, session, payload: await buildBalPayload(session, false) };
}

module.exports = { AMOUNT_STEPS, applyStaffCredit, applyStaffDebit, buildAmountModal, buildBalPayload, buildConvertModal, controlId, convertModalId, cycleStep, deleteSession, formatCurrency, getSession, isBalGuiCustomId, isStaffAction, modalId, normalizeAmountStep, openBalPanel, parseBalGuiCustomId, reloadBalance, setSession, staffCurrencyLabel, warmupBalPanel };