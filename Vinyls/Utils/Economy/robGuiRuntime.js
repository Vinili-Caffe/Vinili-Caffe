const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload");
const { formatGaleoni } = require("../../Services/Community/gringottService");
const { ROB_BANK_TARGET_ID, economyConfig, evaluateRobTarget, isRobBankTarget, rob, robBank } = require("../../Services/Community/galeoniEconomyService");
const PREFIX = "rob_gui";
const SESSION_TTL_MS = 10 * 60 * 1000;
const RENDER_CACHE_MAX = 32;
const ROB_RENDER_TIMEOUT_MS = Math.max(4000, Math.floor(Number(process.env.VC_ROB_RENDER_TIMEOUT_MS || 12000)));
const IDLE_CACHE_KEY = "idle:bank";
const sessions = new Map();
const renderCache = new Map();
let defaultIdleCache = null;
let warmupPromise = null;

function now() {
  return Date.now();
}

function sessionKey(messageId) {
  return String(messageId || "").trim();
}

function makeGringottTarget() {
  return {
    id: ROB_BANK_TARGET_ID,
    name: "Gringott",
    user: null,
    isBank: true,
  };
}

async function makeSession({ ownerId, guildId, targetId, targetName, cfg, isBank, client }) {
  const bank = Boolean(isBank) || isRobBankTarget(targetId);
  const baseChance = Math.max(1, Math.min(99, Math.floor(Number(cfg?.rob?.successChance) || 35)));
  let successChance = baseChance;
  let robBroomBonus = 0;
  let robBroomName = "";
  if (client) {
    const { resolveRobSuccessChance } = require("../../Services/Community/hogwartsShopBoostsService");
    const resolved = await resolveRobSuccessChance(client, guildId, ownerId, baseChance);
    successChance = resolved.chance;
    robBroomBonus = resolved.bonus;
    robBroomName = resolved.broomName || "";
  }
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    targetId: bank ? ROB_BANK_TARGET_ID : String(targetId || ""),
    targetName: bank ? "Gringott" : String(targetName || "").trim() || "Bersaglio",
    isBank: bank,
    phase: "idle",
    lastResult: null,
    panelAnimating: false,
    successChance,
    robBroomBonus,
    robBroomName,
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
  const rerollLabel = session.isBank ? "Rubare a utente" : "alla Gringott";
  const rerollEmoji = session.isBank ? "👤" : "🏦";
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(controlId("reroll", ownerId)).setLabel(rerollLabel).setEmoji(rerollEmoji).setStyle(ButtonStyle.Secondary).setDisabled(locked || done),
      new ButtonBuilder().setCustomId(controlId("hit", ownerId)).setLabel("Colpo").setEmoji("🥷").setStyle(ButtonStyle.Success).setDisabled(locked || done),
      new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(panelClosed),
    ),
  ];
}

function spinPreviewCacheKey(session) {
  return session.isBank ? "preview:spin:bank" : "preview:spin:user";
}

function renderCacheKey(session, opts = {}) {
  if (opts.previewSpin) return spinPreviewCacheKey(session);
  const last = session.lastResult;
  if (!last && !session.panelAnimating) {
    return session.isBank ? IDLE_CACHE_KEY : "idle:user";
  }
  if (last) {
    return `png:${session.isBank ? "bank" : "user"}:${last.success ? 1 : 0}:${last.amount || 0}:${last.penalty || 0}:${session.targetName}`;
  }
  return `${IDLE_CACHE_KEY}:${session.isBank ? "bank" : "user"}:${session.successChance}`;
}

function attachmentFromCache(entry) {
  if (!entry?.buffer?.length) return { files: [], image: null, isGif: false };
  const fileName = entry.fileName || "rob-heist.png";
  const isGif = fileName.endsWith(".gif");
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
    isGif,
  };
}

function rememberRenderCache(key, buffer, fileName) {
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}`, isGif: fileName.endsWith(".gif") });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderPanel(session, opts = {}, notice = "", panelClosed = false) {
  const last = session.lastResult;
  const previewSpin = Boolean(opts.previewSpin);
  const key = renderCacheKey(session, { previewSpin });
  const cached = renderCache.get(key);
  if (cached) return attachmentFromCache(cached);
  if (!last && !previewSpin && !session.panelAnimating && defaultIdleCache) {
    return attachmentFromCache(defaultIdleCache);
  }
  try {
    const renderRobCanvas = require("../Render/robCanvas");
    const rendered = await Promise.race([
      renderRobCanvas({
        phase: previewSpin ? "animating" : session.phase === "spinning" ? "animating" : session.phase,
        targetName: session.targetName,
        successChance: session.successChance,
        success: Boolean(last?.success),
        hasResult: previewSpin ? false : Boolean(last),
        amount: last?.amount || 0,
        penalty: last?.penalty || 0,
        animating: Boolean(previewSpin),
        previewSpin,
        isBank: Boolean(session.isBank),
        statusLine: canvasStatusLine(notice || buildRobContent(session, notice, panelClosed)),
      }),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("rob_render_timeout")), ROB_RENDER_TIMEOUT_MS);
      }),
    ]);
    const fileName = rendered.format === "gif" ? "rob-heist.gif" : "rob-heist.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[ROB GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null, isGif: false };
  }
}

function buildRobContent(session, notice, panelClosed) {
  if (panelClosed) return String(notice || "").trim();
  const last = session.lastResult;
  if (session.phase === "done" && last) {
    return formatRobNotice(
      { ok: true, success: Boolean(last.success), amount: last.amount, penalty: last.penalty, bank: session.isBank },
      session.targetName,
    );
  }
  if (session.panelAnimating) return String(notice || "").trim();
  return "";
}

async function buildRobGuiPayload(session, notice = "", panelClosed = false, renderOpts = {}) {
  const live = { ...session, panelAnimating: Boolean(renderOpts.forceAnimating ?? session.panelAnimating) };
  const attachment = await renderPanel(live, renderOpts, notice, panelClosed);
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, panelClosed),
  });
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

function scheduleRobIdlePanel(message, session, notice = "", delayMs = null) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const waitMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : spinAnimationDurationMs();
  setTimeout(() => {
    const live = getSession(messageId);
    if (!live) return;
    live.panelAnimating = false;
    live.phase = live.phase === "spinning" ? "done" : live.phase;
    setSession(messageId, live);
    buildRobGuiPayload(live, notice, false, {})
      .then((payload) => message.edit(payload).catch(() => {}))
      .catch(() => {});
  }, waitMs);
}

async function warmupSpinPreviews() {
  for (const isBank of [true, false]) {
    const key = spinPreviewCacheKey({ isBank });
    if (renderCache.has(key)) continue;
    const stub = {
      isBank,
      targetName: isBank ? "Gringott" : "Bersaglio",
      successChance: 35,
      phase: "idle",
      panelAnimating: false,
      lastResult: null,
    };
    await renderPanel(stub, { previewSpin: true }).catch(() => {});
  }
}

async function warmupRobPanel(opts = {}) {
  const maxMs = Math.max(500, Math.floor(Number(opts.maxMs) || 4000));
  const wait = opts.wait !== false;
  if (defaultIdleCache) {
    if (!wait) {
      if (!renderCache.has(spinPreviewCacheKey({ isBank: true }))) {
        setImmediate(() => warmupSpinPreviews().catch(() => {}));
      }
      return;
    }
    if (renderCache.has(spinPreviewCacheKey({ isBank: true }))) return;
  }
  if (!warmupPromise) {
    warmupPromise = (async () => {
      try {
        const renderRobCanvas = require("../Render/robCanvas");
        if (typeof renderRobCanvas.warmup === "function") renderRobCanvas.warmup();
        const idle = await renderRobCanvas({ phase: "idle", targetName: "Gringott", isBank: true, successChance: 35 });
        const idleName = "rob-heist.png";
        defaultIdleCache = { buffer: idle.buffer, fileName: idleName, image: `attachment://${idleName}`, isGif: false };
        rememberRenderCache(IDLE_CACHE_KEY, idle.buffer, idleName);
        rememberRenderCache("idle:user", idle.buffer, idleName);
      } catch (err) {
        global.logger?.warn?.("[ROB GUI] idle warmup:", err?.message || err);
      } finally {
        setImmediate(() => warmupSpinPreviews().catch(() => {}));
      }
    })();
  }
  if (!wait) return;
  await Promise.race([
    warmupPromise.catch(() => {}),
    new Promise((resolve) => setTimeout(resolve, maxMs)),
  ]);
}

async function pushRobHitAnimation(message, session, attemptFn) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return { ok: false, message: "Messaggio non modificabile." };
  session.panelAnimating = true;
  session.phase = "spinning";
  session.lastResult = null;
  setSession(messageId, session);
  const started = Date.now();
  const spinKey = spinPreviewCacheKey(session);
  if (!renderCache.has(spinKey)) {
    warmupRobPanel({ wait: false });
  }
  try {
    const spinPayload = await Promise.race([
      buildRobGuiPayload(session, "", false, { previewSpin: true, forceAnimating: true }),
      new Promise((resolve) => setTimeout(async () => resolve(buildRobGuiPayload(session, "", false, {})), 8000)),
    ]);
    await message.edit(spinPayload).catch(() => {});
  } catch (error) {
    global.logger?.warn?.("[ROB GUI] spin preview:", error?.message || error);
  }
  const hit = await attemptFn();
  if (!hit?.ok) {
    resetForNewAttempt(session);
    setSession(messageId, session);
    const idlePayload = await buildRobGuiPayload(session, "", false, {});
    await message.edit(idlePayload).catch(() => {});
    return hit;
  }
  session.lastResult = hit.result;
  session.phase = "done";
  session.panelAnimating = true;
  setSession(messageId, session);
  const notice = formatRobNotice(hit.result, session.targetName);
  const remaining = Math.max(0, spinAnimationDurationMs() - (Date.now() - started));
  scheduleRobIdlePanel(message, session, notice, remaining);
  return hit;
}

setImmediate(() => {
  warmupRobPanel({ wait: true, maxMs: 15000 }).catch(() => {});
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
    session.updatedAt = now();
    return { ok: true, result };
  }
  const target = await resolveTargetUser(client, messageLike, session.targetId, cfg || economyConfig(client));
  if (target?.error) return { ok: false, message: target.error };
  if (!target?.user) return { ok: false, message: "Nessun bersaglio idoneo: serve smistamento Hogwarts e saldo Galeoni sufficiente." };
  session.targetId = target.id;
  session.targetName = target.name;
  session.isBank = false;
  const result = await rob(client, messageLike, target.user);
  if (!result.ok) return result;
  session.updatedAt = now();
  return { ok: true, result };
}

module.exports = { ROB_BANK_TARGET_ID, attemptRob, buildRobGuiPayload, deleteSession, economyConfig, extractUserId, formatRobNotice, getSession, interactionMessageAdapter, isRobBankTarget, isRobGuiCustomId, makeGringottTarget, makeSession, parseRobGuiCustomId, pickRandomTarget, pushRobHitAnimation, resetForNewAttempt, resolveTargetUser, scheduleRobIdlePanel, setSession, spinAnimationDurationMs, warmupRobPanel };