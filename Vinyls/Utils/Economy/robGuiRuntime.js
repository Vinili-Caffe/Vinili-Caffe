const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const {
  ROB_BANK_TARGET_ID,
  economyConfig,
  evaluateRobTarget,
  isRobBankTarget,
  rob,
  robBank,
} = require("../../Services/Community/galeoniEconomyService");

const PREFIX = "rob_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const sessions = new Map();

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function makeGringottTarget() {
  return {
    id: ROB_BANK_TARGET_ID,
    name: "Gringott (Banca)",
    user: null,
    isBank: true,
  };
}

function makeSession({ ownerId, guildId, targetId, targetName, cfg, isBank }) {
  const bank = Boolean(isBank) || isRobBankTarget(targetId);
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    targetId: bank ? ROB_BANK_TARGET_ID : String(targetId || ""),
    targetName: bank ? "Gringott (Banca)" : String(targetName || "").trim() || "Bersaglio",
    isBank: bank,
    phase: "idle",
    lastResult: null,
    panelAnimating: false,
    successChance: Math.max(1, Math.min(99, Math.floor(Number(cfg?.rob?.successChance) || 35))),
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

function controlId(action, ownerId) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isRobGuiCustomId(customId) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseRobGuiCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function buildRows(session, panelClosed = false) {
  const ownerId = session.ownerId;
  const locked = Boolean(panelClosed) || Boolean(session.panelAnimating);
  const done = session.phase === "done";
  const rerollLabel = session.isBank ? "Rubare a utente" : "Verso Gringott";
  const rerollEmoji = session.isBank ? "👤" : "🏦";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("reroll", ownerId)).setLabel(rerollLabel).setEmoji(rerollEmoji).setStyle(ButtonStyle.Secondary).setDisabled(locked || done),
      new ButtonBuilder().setCustomId(controlId("hit", ownerId)).setLabel("Colpo").setEmoji("🥷").setStyle(ButtonStyle.Success).setDisabled(locked || done),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(panelClosed),
    ),
  ];
}

async function renderPanel(session) {
  const last = session.lastResult;
  try {
    const renderRobCanvas = require("../Render/robCanvas");
    const rendered = await renderRobCanvas({
      phase: session.phase,
      targetName: session.targetName,
      successChance: session.successChance,
      success: Boolean(last?.success),
      hasResult: Boolean(last),
      amount: last?.amount || 0,
      penalty: last?.penalty || 0,
      animating: Boolean(session.panelAnimating),
      isBank: Boolean(session.isBank),
    });
    const fileName = rendered.format === "gif" ? "rob-heist.gif" : "rob-heist.png";
    const files = [new AttachmentBuilder(Buffer.from(rendered.buffer), { name: fileName })];
    return { files, image: `attachment://${fileName}`, isGif: rendered.format === "gif" };
  } catch (error) {
    global.logger?.warn?.("[ROB GUI] render:", error?.message || error);
    return { files: [], image: null, isGif: false };
  }
}

function buildEmbed(session, notice) {
  const last = session.lastResult;
  const color = last?.success ? "#2ecc71" : last ? "#ed4245" : "#5c4510";
  const lines = [
    session.isBank
      ? "🏦 Obiettivo: **cassaforte di Gringott** (bottino dalla banca)"
      : `🎯 Bersaglio: **${session.targetName}**`,
    `📊 Probabilità di successo: **${session.successChance}%**`,
  ];
  if (session.phase === "idle") {
    lines.push(session.isBank
      ? "Premi **Colpo** per tentare il furto alla cassaforte. Usa `+rob @utente` per derubare un giocatore."
      : "Premi **Colpo** per tentare il furto. Usa **Verso Gringott** per la banca.");
  }
  if (session.phase === "done" && last) {
    lines.push(last.success
      ? `🏆 Colpo riuscito: **+${formatGaleoni(last.amount)}**`
      : `<a:VC_Cross:1482532424570376253> Beccato! Multa: **${formatGaleoni(last.penalty || 0)}**`);
  }
  if (notice) lines.push(notice);
  return new EmbedBuilder().setColor(color).setDescription(lines.filter(Boolean).join("\n"));
}

async function buildRobGuiPayload(session, notice = "", panelClosed = false, animating = false) {
  const live = { ...session, panelAnimating: Boolean(animating || session.panelAnimating) };
  const attachment = await renderPanel(live);
  const embed = buildEmbed(session, notice);
  const files = attachment.files?.length ? attachment.files : undefined;
  if (attachment.image && files?.length && !attachment.isGif) embed.setImage(attachment.image);
  return { embeds: [embed], components: buildRows(session, panelClosed), files, allowedMentions: { repliedUser: false } };
}

function spinAnimationDurationMs() {
  try {
    const renderRobCanvas = require("../Render/robCanvas");
    if (typeof renderRobCanvas.spinAnimationDurationMs === "function") {
      return renderRobCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 2600;
}

function scheduleRobIdlePanel(message, session, notice = "") {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live) return;
    live.panelAnimating = false;
    setSession(messageId, live);
    buildRobGuiPayload(live, notice, false, false)
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, spinAnimationDurationMs());
}

async function warmupRobPanel() {
  try {
    const renderRobCanvas = require("../Render/robCanvas");
    if (typeof renderRobCanvas.warmup === "function") renderRobCanvas.warmup();
    await renderRobCanvas({ phase: "idle", targetName: "Gringott", isBank: true });
  } catch (_) {}
}

setImmediate(() => {
  warmupRobPanel().catch(() => {});
});

function interactionMessageAdapter(interaction) {
  return { guild: interaction.guild, member: interaction.member, author: interaction.user };
}

function extractUserId(value) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

function memberDisplayName(member, user) {
  return String(member?.displayName || user?.globalName || user?.username || "Utente").trim();
}

async function pickRandomTarget(client, message, excludeId, cfg) {
  const guild = message?.guild;
  if (!guild) return null;
  if (guild.members?.fetch) await guild.members.fetch().catch(() => null);
  const members = Array.from(guild.members?.cache?.values?.() || [])
    .filter((m) => m?.user && !m.user.bot && m.user.id !== excludeId);
  if (!members.length) return null;
  const shuffled = members.sort(() => Math.random() - 0.5);
  const tries = Math.min(40, shuffled.length);
  for (let i = 0; i < tries; i += 1) {
    const pick = shuffled[i];
    const check = await evaluateRobTarget(client, guild, pick.user.id, cfg, excludeId);
    if (!check.ok) continue;
    return {
      id: pick.user.id,
      name: memberDisplayName(pick, pick.user),
      user: pick.user,
      isBank: false,
    };
  }
  return null;
}

async function resolveTargetUser(client, message, targetId, cfg) {
  const id = String(targetId || "").trim();
  if (!id) return makeGringottTarget();
  if (isRobBankTarget(id)) return makeGringottTarget();
  const user = await client.users.fetch(id).catch(() => null);
  if (!user || user.bot) return { error: "Scegli un utente valido da derubare." };
  const member = message.guild?.members?.cache?.get(id);
  const check = await evaluateRobTarget(client, message.guild, user.id, cfg, message.author.id);
  if (!check.ok) return { error: check.message };
  return {
    id: user.id,
    name: memberDisplayName(member, user),
    user,
    isBank: false,
  };
}

function resetForNewAttempt(session) {
  session.phase = "idle";
  session.lastResult = null;
  session.panelAnimating = false;
  session.updatedAt = now();
}

function formatRobNotice(result, targetName) {
  if (!result?.ok) return result?.message || "";
  if (result.success) {
    return result.bank
      ? `🏆 Cassaforte di Gringott svaligiata: **+${formatGaleoni(result.amount)}**.`
      : `🏆 Colpo riuscito su **${targetName}**: **+${formatGaleoni(result.amount)}**.`;
  }
  return result.bank
    ? `<a:VC_Cross:1482532424570376253> Allarme alla banca! Multa: **${formatGaleoni(result.penalty || 0)}**.`
    : `<a:VC_Cross:1482532424570376253> Beccato su **${targetName}**! Multa: **${formatGaleoni(result.penalty || 0)}**.`;
}

async function attemptRob(client, messageLike, session, cfg) {
  if (session.isBank || isRobBankTarget(session.targetId)) {
    const result = await robBank(client, messageLike);
    if (!result.ok) return result;
    session.lastResult = result;
    session.phase = "done";
    session.updatedAt = now();
    return { ok: true, result, animating: true };
  }
  const target = await resolveTargetUser(client, messageLike, session.targetId, cfg || economyConfig(client));
  if (target?.error) return { ok: false, message: target.error };
  if (!target?.user) return { ok: false, message: "Nessun bersaglio idoneo: serve smistamento Hogwarts e saldo Galeoni sufficiente." };
  session.targetId = target.id;
  session.targetName = target.name;
  session.isBank = false;
  const result = await rob(client, messageLike, target.user);
  if (!result.ok) return result;
  session.lastResult = result;
  session.phase = "done";
  session.updatedAt = now();
  return { ok: true, result, animating: true };
}

module.exports = {
  ROB_BANK_TARGET_ID,
  attemptRob,
  buildRobGuiPayload,
  deleteSession,
  economyConfig,
  extractUserId,
  formatRobNotice,
  getSession,
  interactionMessageAdapter,
  isRobBankTarget,
  isRobGuiCustomId,
  makeGringottTarget,
  makeSession,
  parseRobGuiCustomId,
  pickRandomTarget,
  resetForNewAttempt,
  resolveTargetUser,
  scheduleRobIdlePanel,
  setSession,
  warmupRobPanel,
};