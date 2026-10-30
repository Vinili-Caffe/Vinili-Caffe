"use strict";

/**
 * Delayed Discord DM fallback for chat recipients without active WPA/web-push.
 * Debounced per thread+user; cancelled on read or reply; re-checked at fire time.
 */

const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../shared/recovery/snapshotStore") as typeof import("../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../shared/recovery/shutdownCheckpoint") as typeof import("../../shared/recovery/shutdownCheckpoint");

const DEFAULT_DELAY_MS = 4 * 60 * 1000;
const pending = new Map();
/* rebootDurability1: pending chat DM fallbacks → snapshot disk */
const SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "siteChatDmFallbackSnapshot.json");
let flushRegistered = false;
let restoredOnStartup = false;

function delayMs() {
  const raw = Number.parseInt(String(process.env.VC_CHAT_DM_FALLBACK_MS || "").trim(), 10);
  if (Number.isFinite(raw) && raw >= 30_000 && raw <= 30 * 60_000) return raw;
  return DEFAULT_DELAY_MS;
}

function makeKey(scope?, threadId?, userId?) {
  return `${String(scope || "").trim()}:${String(threadId || "").trim()}:${String(userId || "").trim()}`;
}

function serializeEntry(entry?) {
  if (!entry) return null;
  const fireAt = Number(entry.fireAt || 0);
  if (!Number.isFinite(fireAt) || fireAt <= 0) return null;
  return {
    fireAt,
    scope: String(entry.scope || "").trim(),
    threadId: String(entry.threadId || "").trim(),
    userId: String(entry.userId || "").trim(),
    guildId: String(entry.guildId || "").trim(),
    messageId: String(entry.messageId || "").trim(),
    openPath: String(entry.openPath || "").trim().slice(0, 400),
    title: String(entry.title || "").trim().slice(0, 120),
    body: String(entry.body || "").trim().slice(0, 300),
    label: String(entry.label || "").trim().slice(0, 80),
    kind: String(entry.kind || "").trim() || "info",
  };
}

function persistPendingNow() {
  const payload: Record<string, any> = {};
  const now = Date.now();
  for (const [key, entry] of pending.entries()) {
    const row = serializeEntry(entry);
    if (!key || !row) continue;
    if (row.fireAt <= now - 60_000) continue;
    payload[key] = row;
  }
  writeSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_site_chat_dm_fallback",
    version: 1,
    payload,
  });
}

function ensureFlushRegistered() {
  if (flushRegistered) return;
  flushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_site_chat_dm_fallback", () => persistPendingNow());
}

function clearEntry(key?) {
  const entry = pending.get(key);
  if (!entry) return;
  try {
    if (entry.timer) clearTimeout(entry.timer);
  } catch (_) {}
  pending.delete(key);
  persistPendingNow();
}

function cancelChatDmFallback(scope?, threadId?, userId?) {
  const uid = String(userId || "").trim();
  const tid = String(threadId || "").trim();
  const sc = String(scope || "").trim();
  if (!uid || !tid || !sc) return;
  clearEntry(makeKey(sc, tid, uid));
}

async function userStillNeedsDm(entry?) {
  const uid = entry.userId;
  try {
    const { userHasActiveWebPush } = require("./siteWebPushService") as typeof import("./siteWebPushService");
    if (await userHasActiveWebPush(uid).catch(() => false)) return { ok: false, reason: "web_push" };
  } catch (_) {}

  try {
    const { shouldSkipSiteInAppNotif } = require("./siteNotifPrefs") as typeof import("./siteNotifPrefs");
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

async function ticketStillNeedsDm(entry?) {
  const { SiteWebTicketMessage } = require("../Schemas/Web/siteWebTicketSchemas") as typeof import("../Schemas/Web/siteWebTicketSchemas");
  const mid = String(entry.messageId || "").trim();
  if (!mid) return { ok: false, reason: "no_message" };

  const msg = await SiteWebTicketMessage.findById(mid)
    .select("_id ticketId authorId createdAt readBy")
    .lean()
    .catch(() => null);
  if (!msg) return { ok: false, reason: "missing" };

  const read = (Array.isArray(msg.readBy) ? msg.readBy : []).some(
    (r?) => String(r?.userId || "") === entry.userId,
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

async function workflowStillNeedsDm(entry?) {
  const { SiteWorkflowChatMessage } = require("../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../Schemas/Web/siteWorkflowChatSchemas");
  const mid = String(entry.messageId || "").trim();
  if (!mid) return { ok: false, reason: "no_message" };

  const msg = await SiteWorkflowChatMessage.findById(mid)
    .select("_id guildId dedupeKey authorId createdAt readBy")
    .lean()
    .catch(() => null);
  if (!msg) return { ok: false, reason: "missing" };

  const read = (Array.isArray(msg.readBy) ? msg.readBy : []).some(
    (r?) => String(r?.userId || "") === entry.userId,
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

async function fireFallback(key?, entry?) {
  pending.delete(key);
  persistPendingNow();
  try {
    const check = await userStillNeedsDm(entry);
    if (!check.ok) return { sent: false, reason: check.reason };

    const client = entry.client;
    if (!client?.users?.fetch) return { sent: false, reason: "no_client" };

    const user = await client.users.fetch(entry.userId).catch(() => null);
    if (!user?.send) return { sent: false, reason: "no_user" };

    const { buildSiteLinkRow } = require("./discordWorkflowUiGate") as typeof import("./discordWorkflowUiGate");
    const { sendDm } = require("../Utils/noDmList") as typeof import("../Utils/noDmList");

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
    }).catch((err?) => {
      global.logger?.warn?.("[chat-dm-fallback] send failed:", err?.message || err);
      return null;
    });

    return { sent: Boolean(sent), reason: sent ? "sent" : "dm_skipped" };
  } catch (err) {
    global.logger?.warn?.("[chat-dm-fallback] fire failed:", err?.message || err);
    return { sent: false, reason: "error" };
  }
}

function armEntryTimer(key?, entry?) {
  const wait = Math.max(1_000, Number(entry.fireAt || 0) - Date.now());
  entry.timer = setTimeout(() => {
    void fireFallback(key, entry);
  }, wait);
  if (typeof entry.timer.unref === "function") entry.timer.unref();
  pending.set(key, entry);
}

/**
 * Schedule (or reset debounce) a Discord DM if the user has no active web push.
 * @param {import("discord.js").Client} client
 * @param {object} opts
 */
async function scheduleChatDmFallback(client?, opts: Record<string, any> = {}) {
  const scope = String(opts.scope || "").trim();
  const threadId = String(opts.threadId || "").trim();
  const userId = String(opts.userId || "").trim();
  if (!client?.users || !scope || !threadId || !userId) return { scheduled: false, reason: "bad_args" };
  if (!/^\d{16,22}$/.test(userId)) return { scheduled: false, reason: "bad_user" };

  ensureFlushRegistered();

  try {
    const { userHasActiveWebPush } = require("./siteWebPushService") as typeof import("./siteWebPushService");
    if (await userHasActiveWebPush(userId).catch(() => false)) {
      return { scheduled: false, reason: "web_push" };
    }
  } catch (_) {}

  try {
    const { shouldSkipSiteInAppNotif } = require("./siteNotifPrefs") as typeof import("./siteNotifPrefs");
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

  const wait = delayMs();
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
    fireAt: Date.now() + wait,
    timer: null,
  };

  armEntryTimer(key, entry);
  persistPendingNow();
  return { scheduled: true, delayMs: wait };
}

function pendingChatDmFallbackCount() {
  return pending.size;
}

async function restoreChatDmFallbacksOnStartup(client?) {
  if (!client || restoredOnStartup) return { restored: 0, fired: 0 };
  restoredOnStartup = true;
  ensureFlushRegistered();

  const raw = readSnapshotWithMeta({
    filePath: SNAPSHOT_PATH,
    walPath: `${SNAPSHOT_PATH}.wal`,
    key: "vinyls_site_chat_dm_fallback",
    version: 1,
    fallback: {},
  });

  let restored = 0;
  let fired = 0;
  const now = Date.now();

  for (const [key, row] of Object.entries(raw || {})) {
    const serialized = serializeEntry(row);
    if (!key || !serialized) continue;
    if (pending.has(key)) continue;

    const entry = {
      ...serialized,
      client,
      timer: null,
    };

    if (serialized.fireAt <= now) {
      fired += 1;
      void fireFallback(key, entry);
      continue;
    }

    armEntryTimer(key, entry);
    restored += 1;
  }

  persistPendingNow();
  if (restored || fired) {
    global.logger?.info?.(
      `[chat-dm-fallback] restore: restored=${restored} firedNow=${fired}`,
    );
  }
  return { restored, fired };
}

export = {
  scheduleChatDmFallback,
  cancelChatDmFallback,
  pendingChatDmFallbackCount,
  delayMs,
  restoreChatDmFallbacksOnStartup,
};
