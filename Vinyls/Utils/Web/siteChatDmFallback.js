"use strict";

/**
 * Delayed Discord DM fallback for chat recipients without active WPA/web-push.
 * Debounced per thread+user; cancelled on read or reply; re-checked at fire time.
 */

const DEFAULT_DELAY_MS = 4 * 60 * 1000;
const pending = new Map();

function delayMs() {
  const raw = Number.parseInt(String(process.env.VC_CHAT_DM_FALLBACK_MS || "").trim(), 10);
  if (Number.isFinite(raw) && raw >= 30_000 && raw <= 30 * 60_000) return raw;
  return DEFAULT_DELAY_MS;
}

function makeKey(scope, threadId, userId) {
  return `${String(scope || "").trim()}:${String(threadId || "").trim()}:${String(userId || "").trim()}`;
}

function clearEntry(key) {
  const entry = pending.get(key);
  if (!entry) return;
  try {
    if (entry.timer) clearTimeout(entry.timer);
  } catch (_) {}
  pending.delete(key);
}

function cancelChatDmFallback(scope, threadId, userId) {
  const uid = String(userId || "").trim();
  const tid = String(threadId || "").trim();
  const sc = String(scope || "").trim();
  if (!uid || !tid || !sc) return;
  clearEntry(makeKey(sc, tid, uid));
}

async function userStillNeedsDm(entry) {
  const uid = entry.userId;
  try {
    const { userHasActiveWebPush } = require("./siteWebPushService");
    if (await userHasActiveWebPush(uid).catch(() => false)) return { ok: false, reason: "web_push" };
  } catch (_) {}

  try {
    const { shouldSkipSiteInAppNotif } = require("./siteNotifPrefs");
    const soft = await shouldSkipSiteInAppNotif(entry.guildId, uid, {
      kind: entry.kind,
      title: entry.title,
      body: entry.body,
      openUrl: entry.openPath,
    }).catch(() => false);
    if (soft) return { ok: false, reason: "muted" };
  } catch (_) {}

  if (entry.scope === "ticket") {
    return ticketStillNeedsDm(entry);
  }
  if (entry.scope === "workflow") {
    return workflowStillNeedsDm(entry);
  }
  return { ok: false, reason: "bad_scope" };
}

async function ticketStillNeedsDm(entry) {
  const { SiteWebTicketMessage } = require("../../Schemas/Web/siteWebTicketSchemas");
  const mid = String(entry.messageId || "").trim();
  if (!mid) return { ok: false, reason: "no_message" };

  const msg = await SiteWebTicketMessage.findById(mid)
    .select("_id ticketId authorId createdAt readBy")
    .lean()
    .catch(() => null);
  if (!msg) return { ok: false, reason: "missing" };

  const read = (Array.isArray(msg.readBy) ? msg.readBy : []).some(
    (r) => String(r?.userId || "") === entry.userId,
  );
  if (read) return { ok: false, reason: "read" };

  const replied = await SiteWebTicketMessage.exists({
    ticketId: msg.ticketId,
    authorId: entry.userId,
    createdAt: { $gt: msg.createdAt || new Date(0) },
    authorKind: { $nin: ["system", "bot"] },
  }).catch(() => null);
  if (replied) return { ok: false, reason: "replied" };

  return { ok: true, msg };
}

async function workflowStillNeedsDm(entry) {
  const { SiteWorkflowChatMessage } = require("../../Schemas/Web/siteWorkflowChatSchemas");
  const mid = String(entry.messageId || "").trim();
  if (!mid) return { ok: false, reason: "no_message" };

  const msg = await SiteWorkflowChatMessage.findById(mid)
    .select("_id guildId dedupeKey authorId createdAt readBy")
    .lean()
    .catch(() => null);
  if (!msg) return { ok: false, reason: "missing" };

  const read = (Array.isArray(msg.readBy) ? msg.readBy : []).some(
    (r) => String(r?.userId || "") === entry.userId,
  );
  if (read) return { ok: false, reason: "read" };

  const replied = await SiteWorkflowChatMessage.exists({
    guildId: msg.guildId,
    dedupeKey: msg.dedupeKey,
    authorId: entry.userId,
    createdAt: { $gt: msg.createdAt || new Date(0) },
    authorKind: { $ne: "system" },
  }).catch(() => null);
  if (replied) return { ok: false, reason: "replied" };

  return { ok: true, msg };
}

async function fireFallback(key, entry) {
  pending.delete(key);
  try {
    const check = await userStillNeedsDm(entry);
    if (!check.ok) return { sent: false, reason: check.reason };

    const client = entry.client;
    if (!client?.users?.fetch) return { sent: false, reason: "no_client" };

    const user = await client.users.fetch(entry.userId).catch(() => null);
    if (!user?.send) return { sent: false, reason: "no_user" };

    const { buildSiteLinkRow } = require("./discordWorkflowUiGate");
    const { sendDm } = require("../noDmList");

    const label = entry.label || (entry.scope === "ticket" ? "ticket" : "chat");
    const preview = String(entry.body || "").replace(/\s+/g, " ").trim().slice(0, 160);
    const content = preview
      ? `Hai un messaggio non letto nella **${label}** su Vinili & Caffè.\n${preview}`
      : `Hai un messaggio non letto nella **${label}** su Vinili & Caffè.\nApri per leggere e rispondere.`;

    const payload = {
      content,
      components: [buildSiteLinkRow("Apri sul sito", entry.openPath || "/")],
    };

    const sent = await sendDm(user, payload, {
      guildId: entry.guildId || undefined,
      skipIfWebPush: true,
      webPushNotifMeta: {
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        openUrl: entry.openPath,
      },
    }).catch((err) => {
      global.logger?.warn?.("[chat-dm-fallback] send failed:", err?.message || err);
      return null;
    });

    return { sent: Boolean(sent), reason: sent ? "sent" : "dm_skipped" };
  } catch (err) {
    global.logger?.warn?.("[chat-dm-fallback] fire failed:", err?.message || err);
    return { sent: false, reason: "error" };
  }
}

/**
 * Schedule (or reset debounce) a Discord DM if the user has no active web push.
 * @param {import("discord.js").Client} client
 * @param {object} opts
 */
async function scheduleChatDmFallback(client, opts = {}) {
  const scope = String(opts.scope || "").trim();
  const threadId = String(opts.threadId || "").trim();
  const userId = String(opts.userId || "").trim();
  if (!client?.users || !scope || !threadId || !userId) return { scheduled: false, reason: "bad_args" };
  if (!/^\d{16,22}$/.test(userId)) return { scheduled: false, reason: "bad_user" };

  try {
    const { userHasActiveWebPush } = require("./siteWebPushService");
    if (await userHasActiveWebPush(userId).catch(() => false)) {
      return { scheduled: false, reason: "web_push" };
    }
  } catch (_) {}

  try {
    const { shouldSkipSiteInAppNotif } = require("./siteNotifPrefs");
    const soft = await shouldSkipSiteInAppNotif(String(opts.guildId || "").trim(), userId, {
      kind: opts.kind,
      title: opts.title,
      body: opts.body,
      openUrl: opts.openPath,
    }).catch(() => false);
    if (soft) return { scheduled: false, reason: "muted" };
  } catch (_) {}

  const key = makeKey(scope, threadId, userId);
  clearEntry(key);

  const entry = {
    client,
    scope,
    threadId,
    userId,
    guildId: String(opts.guildId || "").trim(),
    messageId: String(opts.messageId || "").trim(),
    openPath: String(opts.openPath || "").trim().slice(0, 400),
    title: String(opts.title || "Nuovo messaggio").trim().slice(0, 120),
    body: String(opts.body || "").trim().slice(0, 300),
    label: String(opts.label || "").trim().slice(0, 80),
    kind: String(opts.kind || (scope === "ticket" ? "web_ticket" : "mod")).trim() || "info",
    timer: null,
  };

  const wait = delayMs();
  entry.timer = setTimeout(() => {
    void fireFallback(key, entry);
  }, wait);
  if (typeof entry.timer.unref === "function") entry.timer.unref();
  pending.set(key, entry);
  return { scheduled: true, delayMs: wait };
}

function pendingChatDmFallbackCount() {
  return pending.size;
}

module.exports = {
  scheduleChatDmFallback,
  cancelChatDmFallback,
  pendingChatDmFallbackCount,
  delayMs,
};
