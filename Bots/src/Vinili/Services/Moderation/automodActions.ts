/** Automod: azioni sui messaggi e sugli utenti (avviso, cancellazione, timeout, ban). */
const path = require("path") as typeof import("path");
const { writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { TEXT_RULES, nowMs } = require("./automodText") as typeof import("./automodText");
const { scheduleMetricsSave, dayKeyFromMs, getGuildMetricsBucket } = require("./automodEmbeds") as typeof import("./automodEmbeds");

const ACTION_COOLDOWN = new Map();
const ACTION_COOLDOWN_MS = 12_000;
const MENTION_RULES = {
  enabled: true,
  timeoutMs: 45 * 60_000,
  hourCap: 20,
  userMentions: { enabled: true, heat: 15, minUserMentions: 5 },
  roleMentions: { enabled: true, heat: 20 },
  everyoneMentions: { enabled: true, heat: 100 },
};
const ATTACHMENT_RULES = { enabled: true, timeoutMs: 0, embeds: { enabled: true, heat: 12 }, images: { enabled: true, heat: 6 }, files: { enabled: true, heat: 12 }, links: { enabled: true, heat: 10 }, stickers: { enabled: true, heat: 12 }, };
const AUTOMOD_HOT_SNAPSHOT_PATH = path.resolve(__dirname, "..", "..", "Data", "automodHotSnapshot.json");
const AUTOMOD_HOT_SNAPSHOT_DEBOUNCE_MS = 2000;
let automodHotSnapshotTimer = null;

function flushAutomodHotSnapshotNow() {
  try {
    const actionCooldown: Record<string, any> = {};
    for (const [key, ts] of ACTION_COOLDOWN.entries()) {
      if (!key) continue;
      const at = Number(ts || 0);
      if (!Number.isFinite(at) || at <= 0) continue;
      actionCooldown[String(key)] = at;
    }
    writeSnapshotWithMeta({
      filePath: AUTOMOD_HOT_SNAPSHOT_PATH,
      walPath: `${AUTOMOD_HOT_SNAPSHOT_PATH}.wal`,
      key: "vinyls_automod_hot",
      version: 1,
      payload: { actionCooldown },
    });
  } catch { }
}

function scheduleAutomodHotSnapshotPersist() {
  if (automodHotSnapshotTimer) return;
  automodHotSnapshotTimer = setTimeout(() => {
    automodHotSnapshotTimer = null;
    flushAutomodHotSnapshotNow();
  }, AUTOMOD_HOT_SNAPSHOT_DEBOUNCE_MS);
  automodHotSnapshotTimer.unref?.();
}

function recordAutomodMetric(message?, action?, violations = []) {
  const guildId = String(message?.guildId || "");
  if (!guildId) return;
  const bucket = getGuildMetricsBucket(guildId, dayKeyFromMs());
  const actionKey = String(action || "unknown");
  bucket.actions[actionKey] = Number(bucket.actions[actionKey] || 0) + 1;
  const channelId = String(message?.channelId || "");
  if (channelId) {
    bucket.channels[channelId] = Number(bucket.channels[channelId] || 0) + 1;
  }
  const userId = String(message?.author?.id || "");
  if (userId) {
    bucket.users[userId] = Number(bucket.users[userId] || 0) + 1;
  }
  for (const v of Array.isArray(violations) ? violations : []) {
    const key = String(v?.key || "").trim();
    if (!key) continue;
    bucket.rules[key] = Number(bucket.rules[key] || 0) + 1;
  }
  scheduleMetricsSave();
}

function getCooldownKey(message?) {
  return `${message.guildId}:${message.author.id}`;
}

function isAutomodPublicNoticeCooldownClear(message?) {
  const key = getCooldownKey(message);
  const last = ACTION_COOLDOWN.get(key) || 0;
  return nowMs() - last >= ACTION_COOLDOWN_MS;
}

function touchAutomodPublicNoticeCooldown(message?) {
  ACTION_COOLDOWN.set(getCooldownKey(message), nowMs());
  scheduleAutomodHotSnapshotPersist();
}

function collectRelatedViolationMessageIds(violations?, currentMessageId?) {
  const current = String(currentMessageId || "");
  const ids = new Set();
  for (const violation of Array.isArray(violations) ? violations : []) {
    const list = Array.isArray(violation?.relatedMessageIds)
      ? violation.relatedMessageIds
      : [];
    for (const rawId of list) {
      const id = String(rawId || "").trim();
      if (!id || id === current) continue;
      ids.add(id);
    }
  }
  return [...ids];
}

async function deleteRelatedViolationMessages(message?, violations?) {
  const channel = message?.channel;
  if (!channel?.messages?.fetch) return 0;
  const relatedIds = collectRelatedViolationMessageIds(violations, message?.id);
  if (!relatedIds.length) return 0;
  let removed = 0;
  for (const id of relatedIds) {
    const extra = await channel.messages.fetch(id).catch(() => null);
    if (!extra) continue;
    const ok = await extra.delete().then(() => true).catch(() => false);
    if (ok) removed += 1;
  }
  return removed;
}

function resolveInstantTimeoutOverrideMs(violations = []) {
  let maxMs = 0;
  for (const violation of Array.isArray(violations) ? violations : []) {
    const key = String(violation?.key || "");
    if (key === "regular_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.regularMessage.timeoutMs || 0));
    } else if (key === "suspicious_account") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.suspiciousAccount.timeoutMs || 0));
    } else if (key === "similar_message") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.similarMessage.timeoutMs || 0));
    } else if (
      key === "mention_user" ||
      key === "mention_role" ||
      key === "mention_everyone" ||
      key === "mention_hour_cap" ||
      key === "mentions_lockdown"
    ) {
      maxMs = Math.max(maxMs, Number(MENTION_RULES.timeoutMs || 0));
    } else if (key === "invite") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.inviteLinks.timeoutMs || 0));
    } else if (key === "scam_pattern" || key === "scam_image_bait" || key === "grabbed_scam_image") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.maliciousLinks.timeoutMs || 0));
    } else if (key === "nsfw_link") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.nsfwLinks.timeoutMs || 0));
    } else if (key === "word_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.wordBlacklist.timeoutMs || 0));
    } else if (key === "link_blacklist") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.linkBlacklist.timeoutMs || 0));
    } else if (key === "emoji_spam") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.emojis.timeoutMs || 0));
    } else if (key === "new_lines") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.newLines.timeoutMs || 0));
    } else if (key === "zalgo") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.zalgo.timeoutMs || 0));
    } else if (key === "characters") {
      maxMs = Math.max(maxMs, Number(TEXT_RULES.characters.timeoutMs || 0));
    } else if (
      key === "attachment_embed" ||
      key === "attachment_image" ||
      key === "attachment_file" ||
      key === "attachment_link" ||
      key === "attachment_sticker"
    ) {
      maxMs = Math.max(maxMs, Number(ATTACHMENT_RULES.timeoutMs || 0));
    }
  }
  return Number.isFinite(maxMs) && maxMs > 0 ? maxMs : 0;
}

export = { ACTION_COOLDOWN, ACTION_COOLDOWN_MS, MENTION_RULES, ATTACHMENT_RULES, AUTOMOD_HOT_SNAPSHOT_PATH, flushAutomodHotSnapshotNow, recordAutomodMetric, isAutomodPublicNoticeCooldownClear, touchAutomodPublicNoticeCooldown, deleteRelatedViolationMessages, resolveInstantTimeoutOverrideMs };
