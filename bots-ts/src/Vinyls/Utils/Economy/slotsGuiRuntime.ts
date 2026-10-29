const { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { buildImageButtonPayload } = require("./guiPanelPayload") as typeof import("./guiPanelPayload");
const { runEconomyRender } = require("../../../shared/render/economyRenderQueue") as typeof import("../../../shared/render/economyRenderQueue");
const { formatEconomyAmount } = require("./economyDisplayHelpers") as typeof import("./economyDisplayHelpers");
const { buildBetAmountButton, betBounds, clampBetAmount } = require("./economyBetModal") as typeof import("./economyBetModal");
const {
  cashoutSlotsBank,
  economyConfig,
  flushSlotsGuiPendingBank,
  playSlots,
} = require("../../Services/Community/activeEconomyService") as typeof import("../../Services/Community/activeEconomyService");
const { markSessionStakeCooldown, sessionSpendOptions } = require("./economyCommandHelpers") as typeof import("./economyCommandHelpers");
const {
  clearSlotsGuiSession,
  loadSlotsGuiSessionByMessage,
  loadSlotsGuiSessionByOwner,
  persistSlotsGuiSession,
  takeUserSlotsGuiPending,
} = require("../../Services/Community/slotsGuiSessionStore") as typeof import("../../Services/Community/slotsGuiSessionStore");
const PREFIX = "slots_gui";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RENDER_CACHE_MAX = 64;
const sessions = new Map();
const renderCache = new Map();
let defaultIdleCache = null;

function now() {
  return Date.now();
}

function sessionKey(messageId?) {
  return String(messageId || "").trim();
}

function clampBet(value?, cfg?, balance = null) {
  return clampBetAmount(value, cfg, balance);
}

function betStep(cfg?) {
  return Math.max(1, Math.floor(Number(cfg?.minBet) || 5));
}

function makeSession({ ownerId, guildId, bet, cfg }) {
  return {
    ownerId: String(ownerId || ""),
    guildId: String(guildId || ""),
    bet: clampBet(bet, cfg),
    bank: 0,
    spins: 0,
    lastResult: null,
    panelAnimating: false,
    createdAt: now(),
    updatedAt: now(),
    cashedOut: false,
  };
}

async function setSession(messageId?, session?) {
  const mid = sessionKey(messageId);
  const live = {
    ...session,
    messageId: mid || sessionKey(session?.messageId),
    updatedAt: now(),
  };
  if (mid) sessions.set(mid, live);
  const persistPromise = persistSlotsGuiSession(mid || live.messageId, live)
    .then((ok?) => {
      if (!ok) global.logger?.warn?.(`[SLOTS GUI] persist failed for message ${mid || live.messageId}`);
      return ok;
    })
    .catch((err?) => {
      global.logger?.warn?.("[SLOTS GUI] persist:", err?.message || err);
      return false;
    });
  live.persistPromise = persistPromise;
  return live;
}

async function getSession(messageId?, guildId?, ownerIdHint = "") {
  const key = sessionKey(messageId);
  if (key) {
    const cached = sessions.get(key);
    if (cached) {
      const bank = Math.max(0, Math.floor(Number(cached.bank) || 0));
      const age = now() - Number(cached.updatedAt || cached.createdAt || 0);
      if (bank <= 0 && age > SESSION_TTL_MS) {
        sessions.delete(key);
      } else {
        return cached;
      }
    }
  }

  const g = String(guildId || "").trim();
  const owner = String(ownerIdHint || "").trim();
  let restored = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (key) restored = await loadSlotsGuiSessionByMessage(g, key);
    if (!restored && owner && g) {
      const byOwner = await loadSlotsGuiSessionByOwner(g, owner);
            if (byOwner && (!key || sessionKey(byOwner.messageId) === key)) restored = byOwner;
    }
    if (restored) break;
    if (attempt < 3) await new Promise((r?) => setTimeout(r, 80 * attempt));
  }
  if (!restored) return null;

  restored.updatedAt = now();
  restored.panelAnimating = false;
  const storeKey = sessionKey(restored.messageId) || key;
  if (storeKey) sessions.set(storeKey, restored);
  if (key && key !== storeKey) sessions.set(key, restored);
  return restored;
}

function deleteSession(messageId?, session?) {
  const mid = sessionKey(messageId);
  const cached = mid ? sessions.get(mid) : null;
  if (mid) sessions.delete(mid);
  const live = session || cached;
  if (live) live.cashedOut = true;
  if (live?.guildId && live?.ownerId) {
    clearSlotsGuiSession(live.guildId, live.ownerId, mid || live.messageId).catch(() => {});
  }
}

function controlId(action?, ownerId?) {
  return `${PREFIX}:${action}:${ownerId}`;
}

function isSlotsGuiCustomId(customId?) {
  return String(customId || "").startsWith(`${PREFIX}:`);
}

function parseSlotsGuiCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  return { action: parts[1], ownerId: parts[2] };
}

function buildRows(session?, cfg?, disabled = false, balance = null) {
  const ownerId = session.ownerId;
  const step = betStep(cfg);
  const { min, max } = betBounds(cfg, balance);
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("minus", ownerId))
        .setLabel(`-${step}`)
        .setEmoji("➖")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || session.bet <= min),
      buildBetAmountButton(controlId("bet", ownerId), { disabled }),
      new ButtonBuilder()
        .setCustomId(controlId("plus", ownerId))
        .setLabel(`+${step}`)
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled || session.bet >= max),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(controlId("spin", ownerId))
        .setLabel("Gira")
        .setEmoji("🎰")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled || Boolean(session.panelAnimating)),
      new ButtonBuilder()
        .setCustomId(controlId("close", ownerId))
        .setLabel("Chiudi")
        .setEmoji("<a:VC_Cross:1482532424570376253>")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

function spinAnimationDurationMs() {
  try {
    const renderSlotsCanvas = require("../Render/slotsCanvas") as typeof import("../Render/slotsCanvas");
    if (typeof renderSlotsCanvas.spinAnimationDurationMs === "function") {
      return renderSlotsCanvas.spinAnimationDurationMs();
    }
  } catch (_) {}
  return 4600;
}

function renderCacheKey(session?, animating?) {
  const last = session.lastResult;
  const reels = last?.result?.reels || ["🍒", "🍋", "🔔"];
  const bet = Math.max(0, Math.floor(Number(session.bet) || 0));
  const payout = Math.max(0, Math.floor(Number(last?.payout) || 0));
  const win = Boolean(last?.win);
  const hasResult = Boolean(last);
  if (animating && last) return `gif:${reels.join("|")}:${bet}:${payout}:${win ? 1 : 0}`;
  return `png:${reels.join("|")}:${bet}:${payout}:${win ? 1 : 0}:${hasResult ? 1 : 0}`;
}

function attachmentFromCache(entry?) {
  if (!entry?.buffer?.length) return { files: [], image: null };
  const fileName = entry.fileName || "slots-panel.png";
  return {
    files: [new AttachmentBuilder(Buffer.from(entry.buffer), { name: fileName })],
    image: `attachment://${fileName}`,
  };
}

function rememberRenderCache(key?, buffer?, fileName?) {
  renderCache.set(key, { buffer, fileName, image: `attachment://${fileName}` });
  if (renderCache.size > RENDER_CACHE_MAX) {
    const oldest = renderCache.keys().next().value;
    if (oldest) renderCache.delete(oldest);
  }
}

async function renderSlotsAttachment(session?, { animating = false } = {}) {
  const last = session.lastResult;
  const key = renderCacheKey(session, Boolean(animating && last));
  const hit = renderCache.get(key);
  if (hit) return attachmentFromCache(hit);
  try {
    const renderSlotsCanvas = require("../Render/slotsCanvas") as typeof import("../Render/slotsCanvas");
    const rendered: any = await runEconomyRender(() =>
      renderSlotsCanvas({
      reels: last?.result?.reels || ["🍒", "🍋", "🔔"],
      bet: session.bet,
      payout: last?.payout || 0,
      win: Boolean(last?.win),
      hasResult: Boolean(last),
      animating: Boolean(animating && last),
    }),
    );
    const fileName = rendered.format === "gif" ? "slots-panel.gif" : "slots-panel.png";
    rememberRenderCache(key, rendered.buffer, fileName);
    return attachmentFromCache(renderCache.get(key));
  } catch (error) {
    global.logger?.warn?.("[SLOTS GUI] render:", error?.message || error);
    if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
    return { files: [], image: null };
  }
}

async function resolvePanelAttachment(session?, animating = false) {
  const out = await renderSlotsAttachment(session, { animating });
  if (out.files?.length) return out;
  if (defaultIdleCache) return attachmentFromCache(defaultIdleCache);
  return out;
}

async function warmupSlotsPanel() {
  try {
    const renderSlotsCanvas = require("../Render/slotsCanvas") as typeof import("../Render/slotsCanvas");
    if (typeof renderSlotsCanvas.warmup === "function") renderSlotsCanvas.warmup();
    if (defaultIdleCache) return;
    const rendered = await renderSlotsCanvas({
      reels: ["🍒", "🍋", "🔔"],
      bet: 5,
      payout: 0,
      win: false,
      hasResult: false,
      animating: false,
    });
    const fileName = "slots-panel.png";
    defaultIdleCache = { buffer: rendered.buffer, fileName, image: `attachment://${fileName}` };
    rememberRenderCache("png:🍒|🍋|🔔:5:0:0:0", defaultIdleCache.buffer, fileName);
  } catch (_) {}
}

setImmediate(() => {
  warmupSlotsPanel().catch(() => {});
});

function scheduleSlotsIdlePanel(message?, session?, cfg?, notice = "", disabled = false) {
  const messageId = String(message?.id || "");
  if (!message?.edit || !messageId) return;
  const delayMs = spinAnimationDurationMs();
  setTimeout(() => {
    getSession(messageId, session.guildId, session.ownerId).then((live?) => {
      if (!live) return;
      live.panelAnimating = false;
      setSession(messageId, live);
      buildSlotsGuiPayload(live, cfg, notice, disabled, false)
        .then((payload?) => message.edit(payload).catch(() => {}))
        .catch(() => {});
    }).catch(() => {});
  }, delayMs);
}

function formatSlotsSpinNotice(spinResult?) {
  if (spinResult?.win) {
    return `🏆 Hai vinto **${formatEconomyAmount(spinResult.payout)}** (accreditati subito).`;
  }
  return "<a:VC_Cross:1482532424570376253> Giro perso.\n<a:VC_pixeltime:1482535344103620771> Puoi rigirare quando il cooldown lo permette.";
}

async function buildSlotsGuiPayload(session?, cfg?, notice = "", disabled = false, animating = false, balance = null) {
  const attachment = await resolvePanelAttachment(session, animating);
  if (!attachment.files?.length) global.logger?.warn?.("[SLOTS GUI] pannello senza immagine (canvas/cache vuoti)");
  return buildImageButtonPayload({
    files: attachment.files || [],
    components: buildRows(session, cfg, disabled, balance),
  });
}

function interactionMessageAdapter(interaction?) {
  return {
    guild: interaction.guild,
    member: interaction.member,
    author: interaction.user,
  };
}

async function spinSession(client?, messageLike?, session?) {
  const result = await playSlots(client, messageLike, String(session.bet), null, sessionSpendOptions(session));
  if (!result.ok) return { ok: false, message: result.message };
  markSessionStakeCooldown(session);
  session.lastResult = result;
  session.spins += 1;
  session.bank = 0;
  session.updatedAt = now();
  return { ok: true, result };
}

async function cashoutSession(client?, interaction?, session?, messageId?) {
  const adapter = interactionMessageAdapter(interaction);
  if (messageId && session) {
    await setSession(messageId, session);
  }
  const pending = session?.guildId && session?.ownerId
    ? await takeUserSlotsGuiPending(session.guildId, session.ownerId)
    : null;
  const memBank = Math.max(0, Math.floor(Number(session?.bank) || 0));
  const dbBank = Math.max(0, Math.floor(Number(pending?.bank) || 0));
  if (dbBank > 0) {
    const flushed = await flushSlotsGuiPendingBank(client, adapter);
    if (!flushed?.ok) return flushed;
    if (flushed.amount > 0) {
      if (session) {
        session.bank = 0;
        session.cashedOut = true;
      }
      if (messageId && session) await setSession(messageId, session);
      return { ok: true, amount: flushed.amount, paid: flushed };
    }
  }
  if (memBank <= 0) {
    return { ok: false, message: "<a:VC_Cross:1482532424570376253> Non hai vincite da riscuotere in questa sessione." };
  }
  const out = await cashoutSlotsBank(client, adapter, memBank);
  if (!out.ok) return out;
  if (session) {
    session.bank = 0;
    session.cashedOut = true;
  }
  if (messageId && session) await setSession(messageId, session);
  return out;
}

export = {
  SESSION_TTL_MS,
  buildSlotsGuiPayload,
  cashoutSession,
  clampBet,
  deleteSession,
  economyConfig,
  formatSlotsSpinNotice,
  getSession,
  interactionMessageAdapter,
  isSlotsGuiCustomId,
  makeSession,
  parseSlotsGuiCustomId,
  scheduleSlotsIdlePanel,
  setSession,
  spinSession,
  spinAnimationDurationMs,
  warmupSlotsPanel,
};
