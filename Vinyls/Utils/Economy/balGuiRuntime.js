const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { addGaleoni, formatGaleoni, getGringottBalance, spendGaleoni } = require("../../Services/Community/gringottService");
const { eventKey } = require("../../Services/Community/galeoniEconomyService");
const PREFIX = "bal_gui";
const MODAL_PREFIX = "bal_gui_md";
const SESSION_TTL_MS = 12 * 60 * 1000;
const AMOUNT_STEPS = [10, 25, 50, 100, 250, 500, 1000];
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

function makeSession({ ownerId, guildId, targetId, targetName, showStaffControls, preview, state, adjustAmount }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    targetId: String(targetId || ""),
    targetName: String(targetName || "").trim() || "Utente",
    showStaffControls: Boolean(showStaffControls),
    preview: Boolean(preview),
    state: state || { balance: 0, earned: 0, spent: 0 },
    adjustAmount: normalizeAmountStep(adjustAmount ?? AMOUNT_STEPS[1]),
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
  return id.startsWith(`${PREFIX}:`) || id.startsWith(`${MODAL_PREFIX}:`);
}

function parseBalGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] === PREFIX && parts.length >= 4) {
    return { kind: "button", action: parts[1], ownerId: parts[2], targetId: parts[3] };
  }
  if (parts[0] === MODAL_PREFIX && parts.length >= 3) {
    return { kind: "modal", ownerId: parts[1], targetId: parts[2] };
  }
  return null;
}

function isStaffAction(action) {
  return ["step_down", "step_up", "credit", "debit", "amount_modal"].includes(String(action || ""));
}

function buildRows(session, panelClosed = false) {
  const ownerId = session.ownerId;
  const targetId = session.targetId;
  const locked = Boolean(panelClosed);
  const rows = [];
  if (session.showStaffControls) {
    const stepLabel = `${session.adjustAmount} G.`;
    rows.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(controlId("step_down", ownerId, targetId)).setLabel("«").setStyle(ButtonStyle.Secondary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("amount_modal", ownerId, targetId)).setLabel(stepLabel).setEmoji("🏦").setStyle(ButtonStyle.Primary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("step_up", ownerId, targetId)).setLabel("»").setStyle(ButtonStyle.Secondary).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("debit", ownerId, targetId)).setLabel("Togli").setEmoji("➖").setStyle(ButtonStyle.Danger).setDisabled(locked),
        new ButtonBuilder().setCustomId(controlId("credit", ownerId, targetId)).setLabel("Aggiungi").setEmoji("➕").setStyle(ButtonStyle.Success).setDisabled(locked),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("refresh", ownerId, targetId)).setLabel("Aggiorna").setEmoji("🔄").setStyle(ButtonStyle.Secondary).setDisabled(locked),
      new ButtonBuilder().setCustomId(controlId("close", ownerId, targetId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(locked),
    ),
  );
  return rows;
}

async function renderPanel(session) {
  try {
    const renderBalCanvas = require("../Render/balCanvas");
    const rendered = await renderBalCanvas({
      targetLabel: session.targetName,
      balance: session.state?.balance || 0,
      earned: session.state?.earned || 0,
      spent: session.state?.spent || 0,
      staffMode: session.showStaffControls,
      noticeShort: session.showStaffControls ? `Importo ${session.adjustAmount}` : "Saldo",
    });
    const fileName = "gringott-bal.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}` };
  } catch (error) {
    global.logger?.warn?.("[BAL GUI] render:", error?.message || error);
    return { files: [], image: null };
  }
}

function buildEmbed(session, notice = "") {
  const state = session.state || {};
  const lines = [
    `🏦 **Gringott** — conto di **${session.targetName}**`,
    `💰 Saldo: **${formatGaleoni(state.balance || 0)}**`,
    `📈 Guadagnati: **${formatGaleoni(state.earned || 0)}**`,
    `📉 Spesi: **${formatGaleoni(state.spent || 0)}**`,
  ];
  if (notice) lines.push(notice);
  const embed = new EmbedBuilder().setColor("#d4af37").setDescription(lines.filter(Boolean).join("\n"));
  return embed;
}

async function buildBalPayload(session, notice = "", panelClosed = false) {
  const attachment = await renderPanel(session);
  const embed = buildEmbed(session, notice);
  if (attachment.image && attachment.files?.length) embed.setImage(attachment.image);
  return { embeds: [embed], components: buildRows(session, panelClosed), files: attachment.files, allowedMentions: { repliedUser: false } };
}

async function reloadBalance(client, session) {
  const evt = eventKey(client);
  const state = await getGringottBalance(session.guildId, session.targetId, evt);
  session.state = state || { balance: 0, earned: 0, spent: 0 };
  session.updatedAt = now();
  return session;
}

async function applyStaffCredit(client, session, actorId) {
  const amt = normalizeAmountStep(session.adjustAmount);
  return addGaleoni({
    guildId: session.guildId,
    userId: session.targetId,
    amount: amt,
    reason: "Regolazione High Staff",
    actorId,
    source: "staff_bal_panel",
    eventKey: eventKey(client),
  });
}

async function applyStaffDebit(client, session, actorId) {
  const amt = normalizeAmountStep(session.adjustAmount);
  return spendGaleoni({
    guildId: session.guildId,
    userId: session.targetId,
    amount: amt,
    reason: "Regolazione High Staff",
    actorId,
    source: "staff_bal_panel",
    eventKey: eventKey(client),
  });
}

function buildAmountModal(session) {
  return new ModalBuilder()
    .setCustomId(modalId(session.ownerId, session.targetId))
    .setTitle("Importo Galeoni")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Quantità")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(7)
          .setPlaceholder("Es. 100")
          .setValue(String(session.adjustAmount || 25)),
      ),
    );
}

async function warmupBalPanel() {
  try {
    const renderBalCanvas = require("../Render/balCanvas");
    if (typeof renderBalCanvas.warmup === "function") renderBalCanvas.warmup();
    await renderBalCanvas({ targetLabel: "Utente", balance: 50, earned: 50, spent: 0 });
  } catch (_) {}
}

setImmediate(() => {
  warmupBalPanel().catch(() => {});
});

async function openBalPanel(client, message, options = {}) {
  const guildId = String(message?.guild?.id || "");
  const targetId = String(options.targetId || message?.author?.id || "");
  const targetName = String(options.targetName || "Utente").trim() || "Utente";
  const evt = eventKey(client);
  const state = await getGringottBalance(guildId, targetId, evt);
  const session = makeSession({
    ownerId: message.author.id,
    guildId,
    targetId,
    targetName,
    showStaffControls: Boolean(options.showStaffControls),
    preview: Boolean(options.preview),
    state: state || { balance: 0, earned: 0, spent: 0 },
  });
  await warmupBalPanel();
  return { ok: true, session, payload: await buildBalPayload(session, false) };
}

module.exports = { AMOUNT_STEPS, applyStaffCredit, applyStaffDebit, buildAmountModal, buildBalPayload, controlId, cycleStep, deleteSession, getSession, isBalGuiCustomId, isStaffAction, modalId, normalizeAmountStep, openBalPanel, parseBalGuiCustomId, reloadBalance, setSession, warmupBalPanel };