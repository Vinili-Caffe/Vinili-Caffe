const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { buildImageButtonPayload, canvasStatusLine } = require("./guiPanelPayload") as typeof import("./guiPanelPayload");
const { formatCurrency } = require("../../Services/Community/serverWalletService") as typeof import("../../Services/Community/serverWalletService");
const { ROB_BANK_TARGET_ID, economyConfig, evaluateRobTarget, isRobBankTarget, listRobCandidateUserIds, rob, robBank, robBankTargetId, resolveEconomyMode } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { formatGaleoni } = require("../../Services/Community/gringottService") as typeof import("../../Services/Community/gringottService");
const { resolveEconomyPresentation } = require("./economyPresentation") as typeof import("./economyPresentation");
const { createPersistedGuiSessionApi, SESSION_DB_TTL_MS } = require("../../Services/Community/economyGuiSessionStore") as typeof import("../../Services/Community/economyGuiSessionStore");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue") as typeof import("../../../shared/render/economyRenderQueue");
const PREFIX = "rob_gui";
const SESSION_TTL_MS = SESSION_DB_TTL_MS;
const RENDER_CACHE_MAX = 32;
const ROB_RENDER_TIMEOUT_MS = Math.max(4000, Math.floor(Number(process.env.VC_ROB_RENDER_TIMEOUT_MS || 12000)));
const IDLE_CACHE_KEY = "idle:bank";
const { setSession, getSession, deleteSession } = createPersistedGuiSessionApi("rob", { ttlMs: SESSION_TTL_MS });
const renderCache = new Map();
let defaultIdleCache = null;
let warmupPromise = null;

function now() {
  return Date.now();
}

function makeBankTarget(client?) {
  const label = client ? resolveEconomyPresentation(client).robBankLabel : "Gringott";
  return {
    id: client ? robBankTargetId(client) : ROB_BANK_TARGET_ID,
    name: label,
    user: null,
    isBank: true,
  };
}

async function makeSession({ ownerId, guildId, targetId, targetName, cfg, isBank, client, currency }) {
  const bank = Boolean(isBank) || isRobBankTarget(targetId);
  const bankLabel = client ? resolveEconomyPresentation(client).robBankLabel : "Gringott";
  const galeoniEconomy = Boolean(client && resolveEconomyMode(client) === "galeoni");
  const baseChance = Math.max(1, Math.min(99, Math.floor(Number(cfg?.rob?.successChance) || 35)));
  let successChance = baseChance;
  let robBroomBonus = 0;
  let robBroomName = "";
  if (client && guildId && ownerId && resolveEconomyPresentation(client).hogwartsEconomyLive) {
    try {
      const { peekRobSuccessChance } = require("../../Services/Community/hogwartsShopBoostsService") as typeof import("../../Services/Community/hogwartsShopBoostsService");
      const peeked = await peekRobSuccessChance(client, guildId, ownerId, baseChance);
      successChance = Math.max(1, Math.min(99, Math.floor(Number(peeked?.chance) || baseChance)));
      robBroomBonus = Math.max(0, Math.floor(Number(peeked?.bonus) || 0));
      robBroomName = String(peeked?.broomName || "").trim();
    } catch (_) {}
  }
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    targetId: bank ? (client ? robBankTargetId(client) : ROB_BANK_TARGET_ID) : String(targetId || ""),
    targetName: bank ? bankLabel : String(targetName || "").trim() || "Bersaglio",
    isBank: bank,
    currency: currency === "vinili" ? "vinili" : "caffe",
    galeoniEconomy,
    robBankLabel: bankLabel,
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

function controlId(action?, ownerId?) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isRobGuiCustomId(customId?) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseRobGuiCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  const action = parts[1];
  if (!["user", "bank", "reroll", "hit", "close"].includes(action)) return null;
  return { action, ownerId: parts[2] };
}

function buildRows(session?, panelClosed = false) {
  const ownerId = session.ownerId;
  const locked = Boolean(panelClosed) || Boolean(session.panelAnimating);
  const done = session.phase === "done";
  const softBlocked = Boolean(session.softBlocked);
  const bankLabel = session.robBankLabel || "Gringott";
  const row = [];
  if (session.isBank) {
    row.push(
      new ButtonBuilder()
        .setCustomId(controlId("user", ownerId))
        .setLabel("Rubare a un utente")
        .setEmoji("👤")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || done),
    );
  } else {
    row.push(
      new ButtonBuilder()
        .setCustomId(controlId("user", ownerId))
        .setLabel("Altro utente")
        .setEmoji("🎲")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || done),
      new ButtonBuilder()
        .setCustomId(controlId("bank", ownerId))
        .setLabel(`Alla ${bankLabel}`)
        .setEmoji("🏦")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || done),
    );
  }
  row.push(
    new ButtonBuilder().setCustomId(controlId("hit", ownerId)).setLabel("Colpo").setEmoji("🥷").setStyle(ButtonStyle.Success).setDisabled(locked || done || softBlocked),
    new ButtonBuilder().setCustomId(controlId("close", ownerId)).setLabel("Chiudi").setEmoji("<a:VC_Cross:1482532424570376253>").setStyle(ButtonStyle.Danger).setDisabled(panelClosed),
  );
  return [new ActionRowBuilder().addComponents(...row)];
}

function cacheNameKey(session?) {
  return String(session?.targetName || "").trim().toLowerCase() || "x";
}

function spinPreviewCacheKey(session?) {
  const kind = session?.isBank ? "bank" : "user";
  const chance = Math.max(1, Math.min(99, Math.floor(Number(session?.successChance) || 35)));
    return `preview:spin:${kind}:${chance}:${cacheNameKey(session)}`;
}

function idlePanelCacheKey(session?) {
  if (session?.isBank) return IDLE_CACHE_KEY;
  const chance = Math.max(1, Math.min(99, Math.floor(Number(session?.successChance) || 35)));
  return `idle:user:${chance}:${cacheNameKey(session)}`;
}

function renderCacheKey(session?, opts: Record<string, any> = {}) {
  if (opts.previewSpin) return spinPreviewCacheKey(session);
  const last = session.lastResult;
  const noticeKey = opts.noticeKey ? `:n:${opts.noticeKey}` : "";
  if (!last && !session.panelAnimating) {
    return `${idlePanelCacheKey(session)}${noticeKey}`;
  }
  if (last) {
    return `png:${session.isBank ? "bank" : "user"}:${last.success ? 1 : 0}:${last.amount || 0}:${last.penalty || 0}:${session.targetName}${noticeKey}`;
  }
  return `${idlePanelCacheKey(session)}:anim${noticeKey}`;
}

function attachmentFromCache(entry?) {
  if (!entry?.buffer?.length) return { files: [], image: null, isGif: false };
  const fileName = entry.fileName || "rob-heist.png";
  const isGif = fileName.endsWith(".gif");
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
    isGif,
  };
}

function rememberRenderCache(key?, buffer?, fileName?) {
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}`, isGif: fileName.endsWith(".gif") });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderPanel(session?, opts: Record<string, any> = {}, notice = "", panelClosed = false) {
  const last = session.lastResult;
  const previewSpin = Boolean(opts.previewSpin);
  const status = canvasStatusLine(notice || buildRobContent(session, notice, panelClosed));
    const noticeKey = status && (session.softBlocked || /protetto|casata|blocc/i.test(status))
    ? status.slice(0, 48).toLowerCase()
    : "";
  const key = renderCacheKey(session, { previewSpin, noticeKey });
  if (!opts.bypassCache) {
    const cached = renderCache.get(key);
    if (cached) return attachmentFromCache(cached);
  }
    if (!opts.bypassCache && !last && !previewSpin && !session.panelAnimating && !noticeKey && session.isBank && defaultIdleCache) {
    return attachmentFromCache(defaultIdleCache);
  }
  try {
    const renderRobCanvas = require("../Render/robCanvas") as typeof import("../Render/robCanvas");
    const rendered = await runEconomyRender(() =>
      Promise.race([
      renderRobCanvas({
        phase: previewSpin ? "animating" : session.phase === "spinning" ? "animating" : session.phase,
        targetName: session.targetName,
        bankLabel: session.robBankLabel || session.targetName,
        successChance: session.successChance,
        success: Boolean(last?.success),
        hasResult: previewSpin ? false : Boolean(last),
        amount: last?.amount || 0,
        penalty: last?.penalty || 0,
        animating: Boolean(previewSpin),
        previewSpin,
        isBank: Boolean(session.isBank),
        statusLine: status,
      }),
      new Promise((_?, reject?) => {
        setTimeout(() => reject(new Error("rob_render_timeout")), ROB_RENDER_TIMEOUT_MS);
      }),
    ]),
    );
    const fileName = rendered.format === "gif" ? "rob-heist.gif" : "rob-heist.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[ROB GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null, isGif: false };
  }
}

function buildRobContent(session?, notice?, panelClosed?) {
  if (panelClosed) return String(notice || "").trim();
  const last = session.lastResult;
  if (session.phase === "done" && last) {
    return formatRobNotice(
      { ok: true, success: Boolean(last.success), amount: last.amount, penalty: last.penalty, bank: session.isBank, currency: last.currency },
      session.targetName,
      session.galeoniEconomy ? { galeoni: true } : null,
    );
  }
  const n = String(notice || "").trim();
  if (n) return n;
  if (session.panelAnimating) return "";
  return "";
}

async function buildRobGuiPayload(session?, notice = "", panelClosed = false, renderOpts: Record<string, any> = {}) {
  const live = { ...session, panelAnimating: Boolean(renderOpts.forceAnimating ?? session.panelAnimating) };
  const attachment = await renderPanel(live, renderOpts, notice, panelClosed);
  const payload = buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, panelClosed),
  });
    if (session.softBlocked && String(notice || "").trim()) {
    payload.content = String(notice).trim().slice(0, 180);
  }
  return payload;
}

function spinAnimationDurationMs() {
  try {
    const renderRobCanvas = require("../Render/robCanvas") as typeof import("../Render/robCanvas");
    if (typeof renderRobCanvas.spinAnimationDurationMs === "function") {
      return renderRobCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 2600;
}

function scheduleRobIdlePanel(message?, session?, notice = "", delayMs = null) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const waitMs = Number.isFinite(delayMs) ? Math.max(0, delayMs) : spinAnimationDurationMs();
  setTimeout(() => {
    void getSession(messageId, session?.guildId, session?.ownerId).then((live?) => {
      if (!live) return;
      live.panelAnimating = false;
      live.phase = live.phase === "spinning" ? "done" : live.phase;
      setSession(messageId, live);
      buildRobGuiPayload(live, notice, false, {})
        .then((payload?) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    });
  }, waitMs);
}

async function warmupSpinPreviews() {
    for (const targetName of ["Gringott", "Cassaforte"]) {
    const stub = {
      isBank: true,
      targetName,
      successChance: 35,
      phase: "idle",
      panelAnimating: false,
      lastResult: null,
    };
    if (renderCache.has(spinPreviewCacheKey(stub))) continue;
    await renderPanel(stub, { previewSpin: true }).catch(() => {});
  }
}

async function warmupRobPanel(opts: Record<string, any> = {}) {
  const maxMs = Math.max(500, Math.floor(Number(opts.maxMs) || 4000));
  const wait = opts.wait !== false;
  const bankWarmStub = { isBank: true, targetName: "Gringott", successChance: 35 };
  if (defaultIdleCache) {
    if (!wait) {
      if (!renderCache.has(spinPreviewCacheKey(bankWarmStub))) {
        setImmediate(() => warmupSpinPreviews().catch(() => {}));
      }
      return;
    }
    if (renderCache.has(spinPreviewCacheKey(bankWarmStub))) return;
  }
  if (!warmupPromise) {
    warmupPromise = (async () => {
      try {
        const renderRobCanvas = require("../Render/robCanvas") as typeof import("../Render/robCanvas");
        if (typeof renderRobCanvas.warmup === "function") renderRobCanvas.warmup();
        const idle = await renderRobCanvas({ phase: "idle", targetName: "Gringott", bankLabel: "Gringott", isBank: true, successChance: 35 });
        const idleName = "rob-heist.png";
        defaultIdleCache = { buffer: idle.buffer, fileName: idleName, image: `attachment://${idleName}`, isGif: false };
        rememberRenderCache(IDLE_CACHE_KEY, idle.buffer, idleName);
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
    new Promise((resolve?) => setTimeout(resolve, maxMs)),
  ]);
}

async function pushRobHitAnimation(message?, session?, attemptFn?, options: Record<string, any> = {}) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return { ok: false, message: "Messaggio non modificabile." };

    if (typeof options.preflightFn === "function") {
    let pre;
    try {
      pre = await options.preflightFn();
    } catch (err) {
      global.logger?.warn?.("[ROB GUI] preflight:", err?.message || err);
      pre = { ok: false, message: "Non riesco a verificare il bersaglio. Riprova." };
    }
    if (!pre?.ok) {
      session.panelAnimating = false;
      session.phase = "idle";
      if (isSoftRobTargetBlock(pre)) session.softBlocked = true;
      resetForNewAttempt(session);
      setSession(messageId, session);
      const denyNotice = `<:vegax:1443934876440068179> ${pre.message || "Furto bloccato su questo utente."}`;
      const idlePayload = await buildRobGuiPayload(session, denyNotice, false, { bypassCache: true });
      await message.edit(idlePayload).catch(() => {});
      return pre;
    }
    session.softBlocked = false;
  }

  session.panelAnimating = true;
  session.phase = "spinning";
  session.lastResult = null;
  session.softBlocked = false;
  setSession(messageId, session);
  const started = Date.now();
  const spinKey = spinPreviewCacheKey(session);
  if (!renderCache.has(spinKey)) {
    warmupRobPanel({ wait: false });
  }
  try {
    const spinPayload = await Promise.race([
      buildRobGuiPayload(session, "", false, { previewSpin: true, forceAnimating: true }),
      new Promise((resolve?) => setTimeout(async () => resolve(buildRobGuiPayload(session, "", false, {})), 8000)),
    ]);
    await message.edit(spinPayload).catch(() => {});
  } catch (error) {
    global.logger?.warn?.("[ROB GUI] spin preview:", error?.message || error);
  }
  const hit = await attemptFn();
  if (!hit?.ok) {
    if (isSoftRobTargetBlock(hit)) session.softBlocked = true;
    resetForNewAttempt(session);
    setSession(messageId, session);
    const denyNotice = isSoftRobTargetBlock(hit)
      ? `<:vegax:1443934876440068179> ${hit.message || "Furto bloccato su questo utente."}`
      : "";
    const idlePayload = await buildRobGuiPayload(session, denyNotice, false, { bypassCache: Boolean(denyNotice) });
    await message.edit(idlePayload).catch(() => {});
    return hit;
  }
  session.lastResult = hit.result;
  session.phase = "done";
  session.panelAnimating = true;
  setSession(messageId, session);
  const notice = formatRobNotice(hit.result, session.targetName, session.galeoniEconomy ? { galeoni: true } : null);
  const remaining = Math.max(0, spinAnimationDurationMs() - (Date.now() - started));
  scheduleRobIdlePanel(message, session, notice, remaining);
  return hit;
}

setImmediate(() => {
  warmupRobPanel({ wait: true, maxMs: 15000 }).catch(() => {});
});

function interactionMessageAdapter(interaction?) {
  return { guild: interaction.guild, member: interaction.member, author: interaction.user };
}

function extractUserId(value?) {
  const clean = String(value || "").replace(/[<@!>]/g, "").trim();
  return /^\d{16,20}$/.test(clean) ? clean : "";
}

function memberDisplayName(member?, user?) {
  const { economyUsername } = require("./economyDisplayHelpers") as typeof import("./economyDisplayHelpers");
  return economyUsername(user || member, "Utente");
}

async function resolvePickedMemberTarget(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid || !guild) return null;
  let member = guild.members?.cache?.get(uid) || null;
  if (!member && guild.members?.fetch) {
    member = await guild.members.fetch(uid).catch(() => null);
  }
  if (!member?.user || member.user.bot) return null;
  return {
    id: member.user.id,
    name: memberDisplayName(member, member.user),
    user: member.user,
    isBank: false,
  };
}

async function pickRandomTarget(client?, message?, excludeId?, cfg?, currency = "caffe", opts: Record<string, any> = {}) {
  const guild = message?.guild;
  if (!guild) return null;
  const skipIds = new Set(
    [excludeId, ...(Array.isArray(opts.alsoExclude) ? opts.alsoExclude : [])]
      .map((id?) => String(id || "").trim())
      .filter(Boolean),
  );

    if (resolveEconomyMode(client) === "galeoni") {
    const candidates = await listRobCandidateUserIds(client, guild.id, excludeId, cfg).catch(() => []);
    const pool = Array.isArray(candidates) ? candidates : [];
    for (let i = 0; i < pool.length; i += 1) {
      const uid = String(pool[i] || "").trim();
      if (!uid || skipIds.has(uid)) continue;
      const check = await evaluateRobTarget(client, guild, uid, cfg, excludeId, currency);
      if (!check.ok) continue;
      const resolved = await resolvePickedMemberTarget(guild, uid);
      if (resolved) return resolved;
    }
  }

  if (guild.members?.fetch) await guild.members.fetch().catch(() => null);
  const members = Array.from(guild.members?.cache?.values?.() || [])
    .filter((m?) => m?.user && !m.user.bot && !skipIds.has(m.user.id));
  if (!members.length) return null;
  const shuffled = members.sort(() => Math.random() - 0.5);
  const tries = Math.min(80, shuffled.length);
  for (let i = 0; i < tries; i += 1) {
    const pick = shuffled[i];
    const check = await evaluateRobTarget(client, guild, pick.user.id, cfg, excludeId, currency);
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

async function resolveTargetUser(client?, message?, targetId?, cfg?, currency?) {
  const id = String(targetId || "").trim();
  if (!id) return makeBankTarget(client);
  if (isRobBankTarget(id)) return makeBankTarget(client);
  const user = await client.users.fetch(id).catch(() => null);
  if (!user || user.bot) return { error: "Scegli un utente valido da derubare.", code: "invalid_user" };
  const member = message.guild?.members?.cache?.get(id);
  const check = await evaluateRobTarget(client, message.guild, user.id, cfg, message.author.id, currency);
  if (!check.ok) {
    const soft = { error: check.message, code: check.code || "target_blocked" };
    if (isSoftRobTargetBlock(soft)) {
      return {
        ...soft,
        id: user.id,
        name: memberDisplayName(member, user),
        user,
        isBank: false,
        softBlocked: true,
      };
    }
    return soft;
  }
  return {
    id: user.id,
    name: memberDisplayName(member, user),
    user,
    isBank: false,
  };
}

function isSoftRobTargetBlock(resolved?) {
  const code = String(resolved?.code || "").trim();
  if (code === "protected" || code === "same_house") return true;
  const msg = String(resolved?.error || resolved?.message || "").toLowerCase();
  return msg.includes("protetto da un furto") || msg.includes("stessa casata");
}

function resetForNewAttempt(session?) {
  session.phase = "idle";
  session.lastResult = null;
  session.panelAnimating = false;
  session.updatedAt = now();
  }

function formatRobNotice(result?, targetName?, modeHint = null) {
  const galeoniMode = modeHint?.galeoni === true;
  const cur = result?.currency === "vinili" ? "vinili" : "caffe";
  const formatAmt = (amount?) => (galeoniMode ? formatGaleoni(amount) : formatCurrency(cur, amount));
  if (!result?.ok) return result?.message || "";
  if (result.success) {
    return result.bank
      ? `🏆 ${targetName} svaligiata: **+${formatAmt(result.amount)}**.`
      : `🏆 Colpo riuscito su **${targetName}**: **+${formatAmt(result.amount)}**.`;
  }
  return result.bank
    ? `<a:VC_Cross:1482532424570376253> Allarme alla ${targetName}! Multa: **${formatAmt(result.penalty || 0)}**.`
    : `<a:VC_Cross:1482532424570376253> Beccato su **${targetName}**! Multa: **${formatAmt(result.penalty || 0)}**.`;
}

async function preflightRobAttempt(client?, messageLike?, session?, cfg?) {
  if (session.isBank || isRobBankTarget(session.targetId)) return { ok: true };
  const currency = session.currency === "vinili" ? "vinili" : "caffe";
  const target = await resolveTargetUser(client, messageLike, session.targetId, cfg || economyConfig(client), currency);
  if (target?.error) {
    if (isSoftRobTargetBlock(target)) {
      const { clearRobCooldown } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
      await clearRobCooldown(client, messageLike?.guild?.id, messageLike?.author?.id).catch(() => {});
    }
    return { ok: false, message: target.error, code: target.code || "target_blocked" };
  }
  if (!target?.user) {
    return {
      ok: false,
      message: resolveEconomyMode(client) === "galeoni"
        ? "Nessun bersaglio idoneo: serve un utente con Galeoni sufficienti e smistamento completato."
        : "Nessun bersaglio idoneo: serve un utente con saldo sufficiente in Vinili o Caffè.",
    };
  }
  session.targetId = target.id;
  session.targetName = target.name;
  session.isBank = false;
  return { ok: true, target };
}

async function attemptRob(client?, messageLike?, session?, cfg?) {
  const currency = session.currency === "vinili" ? "vinili" : "caffe";
  const targetError = resolveEconomyMode(client) === "galeoni"
    ? "Nessun bersaglio idoneo: serve un utente con Galeoni sufficienti e smistamento completato."
    : "Nessun bersaglio idoneo: serve un utente con saldo sufficiente in Vinili o Caffè.";
  if (session.isBank || isRobBankTarget(session.targetId)) {
    const result = await robBank(client, messageLike, currency);
    if (!result.ok) return result;
    session.updatedAt = now();
    return { ok: true, result };
  }
  const target = await resolveTargetUser(client, messageLike, session.targetId, cfg || economyConfig(client), currency);
  if (target?.error) {
    if (isSoftRobTargetBlock(target)) {
      const { clearRobCooldown } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
      await clearRobCooldown(client, messageLike?.guild?.id, messageLike?.author?.id).catch(() => {});
    }
    return { ok: false, message: target.error, code: target.code || "target_blocked" };
  }
  if (!target?.user) return { ok: false, message: targetError };
  session.targetId = target.id;
  session.targetName = target.name;
  session.isBank = false;
  const result = await rob(client, messageLike, target.user, currency);
  if (!result.ok) {
    if (isSoftRobTargetBlock(result)) {
      const { clearRobCooldown } = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
      await clearRobCooldown(client, messageLike?.guild?.id, messageLike?.author?.id).catch(() => {});
    }
    return result;
  }
  session.updatedAt = now();
  return { ok: true, result };
}

export = { ROB_BANK_TARGET_ID, attemptRob, buildRobGuiPayload, deleteSession, economyConfig, extractUserId, formatRobNotice, getSession, interactionMessageAdapter, isRobBankTarget, isRobGuiCustomId, isSoftRobTargetBlock, makeBankTarget, makeSession, parseRobGuiCustomId, pickRandomTarget, preflightRobAttempt, pushRobHitAnimation, resetForNewAttempt, resolveTargetUser, scheduleRobIdlePanel, setSession, spinAnimationDurationMs, warmupRobPanel };