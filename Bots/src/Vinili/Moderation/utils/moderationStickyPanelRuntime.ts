const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { personalityPanelUpdateOne } = require("../../Community/services/globalSettingsGuildStores") as typeof import("../../Community/services/globalSettingsGuildStores");
const {
  MOD_GUIDE_BUTTON_IDS,
  buildModerationGuideStickyPayload,
} = require("./moderationGuidePanelComponents") as typeof import("./moderationGuidePanelComponents");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474").trim();
const moderationStickyLocks = new Map();
const moderationStickyDebounceTimers = new Map();
const MODERATION_STICKY_DEBOUNCE_MS = 2500;

function getSanzioniChannelId() {
  return String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
}

function walkComponents(node?, out?) {
  if (!node) return;
  out.push(node);
  const children = node?.components || node?.data?.components || [];
  for (const child of children) walkComponents(child, out);
}

function iterMessageComponents(message?) {
  const out = [];
  for (const row of message?.components || []) walkComponents(row, out);
  return out;
}

function componentCustomId(c?) {
  return String(c?.customId || c?.custom_id || "");
}

function collectMessagePlainText(message?) {
  const parts = [];
  const embedDesc = String(
    message?.embeds?.[0]?.description || message?.embeds?.[0]?.data?.description || "",
  );
  if (embedDesc) parts.push(embedDesc);
  for (const c of iterMessageComponents(message)) {
    const content = String(c?.content || c?.data?.content || "").trim();
    if (content) parts.push(content);
  }
  return parts.join("\n").toLowerCase();
}

function isModerationStickyPanelMessage(message?) {
  if (!message?.author?.bot) return false;
  const ids = new Set(MOD_GUIDE_BUTTON_IDS);
  for (const c of iterMessageComponents(message)) {
    if (ids.has(componentCustomId(c))) return true;
  }
  const text = collectMessagePlainText(message);
  return text.includes("applicare") && text.includes("sanzioni") && text.includes("prove");
}

async function getSanzioniPanelRow(channelId?) {
  const { GlobalSettings } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
  const doc = await GlobalSettings.findOne({ guildId: MAIN_GUILD_ID })
    .select("personalityPanels")
    .lean()
    .catch(() => null);
  const row = (doc?.personalityPanels || []).find((x?) => String(x?.channelId) === String(channelId));
  return row || null;
}

async function saveSanzioniPanelMessageId(channelId?, messageId?) {
  const cid = String(channelId || "").trim();
  const mid = messageId ? String(messageId) : null;
  if (!cid) return;
  await personalityPanelUpdateOne({ channelId: cid }, { $set: { sanzioniPanelMessageId: mid } }).catch(() => null);
}

async function resolveSanzioniChannel(client?, channelRef?) {
  if (channelRef?.isTextBased?.()) return channelRef;
  const channelId = getSanzioniChannelId();
  if (!channelId) return null;
  if (channelRef?.guild) {
    return (
      channelRef.guild.channels.cache.get(channelId) ||
      (await getGuildChannelCached(channelRef.guild, channelId))
    );
  }
  return client?.channels?.cache?.get(channelId) || (await getClientChannelCached(client, channelId));
}

async function deleteRecentModerationStickies(channel?, keepId = "") {
  const keep = String(keepId || "").trim();
  const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
  if (!recent?.size) return;
  const deletions = [];
  for (const message of recent.values()) {
    if (!isModerationStickyPanelMessage(message)) continue;
    if (keep && String(message.id) === keep) continue;
    deletions.push(message.delete().catch(() => null));
  }
  if (deletions.length) await Promise.all(deletions);
}

async function withModerationStickyLock(channelId?, fn?) {
  const lockKey = String(channelId || "").trim();
  if (!lockKey) return fn();
  while (moderationStickyLocks.get(lockKey)) {
    await moderationStickyLocks.get(lockKey);
  }
  let release;
  const gate = new Promise((resolve?) => {
    release = resolve;
  });
  moderationStickyLocks.set(lockKey, gate);
  try {
    return await fn();
  } finally {
    moderationStickyLocks.delete(lockKey);
    release?.();
  }
}

async function ensureModerationStickyPanel(client?, channelRef?) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  if (!channel?.isTextBased?.()) return null;

  return withModerationStickyLock(channel.id, async () => {
    const payload = buildModerationGuideStickyPayload();
    const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const last = latest?.first?.() || [...(latest?.values?.() || [])][0] || null;

    // Already sticky at bottom → edit in place (no delete/recreate race).
    if (last && isModerationStickyPanelMessage(last)) {
      const { isComponentsV2Message } = require("../../../shared/discord/panelUpsertRuntime") as typeof import("../../../shared/discord/panelUpsertRuntime");
      const { isComponentsV2Payload } = require("../../../shared/embeds/vcPageEmbedV2") as typeof import("../../../shared/embeds/vcPageEmbedV2");
      if (isComponentsV2Payload(payload) && !isComponentsV2Message(last)) {
        await last.delete().catch(() => null);
      } else {
        const edited = await last.edit(payload).catch(() => null);
        if (edited) {
          await saveSanzioniPanelMessageId(channel.id, edited.id);
          await deleteRecentModerationStickies(channel, edited.id);
          return edited;
        }
      }
    }

    const panelRow = await getSanzioniPanelRow(channel.id);
    const existingId = String(panelRow?.sanzioniPanelMessageId || "").trim();
    if (existingId) {
      const existing = await channel.messages.fetch(existingId).catch(() => null);
      // Mid-channel sticky: drop it and send fresh at bottom.
      if (existing && isModerationStickyPanelMessage(existing)) {
        await existing.delete().catch(() => null);
      }
    }

    const sent = await channel
      .send({ ...payload, __skipNoticeEmbed: true })
      .catch((err?) => {
        global.logger?.warn?.("[SANZIONI STICKY] send failed:", err?.message || err);
        return null;
      });
    if (sent?.id) {
      await saveSanzioniPanelMessageId(channel.id, sent.id);
      await deleteRecentModerationStickies(channel, sent.id);
    }
    return sent;
  });
}

async function maybeRepositionModerationStickyNow(channelRef?, client?) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  const sanzioniChannelId = getSanzioniChannelId();
  if (!channel?.isTextBased?.() || String(channel.id) !== sanzioniChannelId) return;

  return withModerationStickyLock(channel.id, async () => {
    const panelRow = await getSanzioniPanelRow(channel.id);
    const stickyId = String(panelRow?.sanzioniPanelMessageId || "").trim();
    const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const last = latest?.first?.() || [...(latest?.values?.() || [])][0] || null;
    if (last && stickyId && String(last.id) === stickyId && isModerationStickyPanelMessage(last)) {
      await deleteRecentModerationStickies(channel, stickyId);
      return;
    }
    // Last message is already the sticky (DB id stale) → just resync id.
    if (last && isModerationStickyPanelMessage(last)) {
      await saveSanzioniPanelMessageId(channel.id, last.id);
      await deleteRecentModerationStickies(channel, last.id);
      return;
    }

    const payload = buildModerationGuideStickyPayload();
    const sent = await channel
      .send({ ...payload, __skipNoticeEmbed: true })
      .catch((err?) => {
        global.logger?.warn?.("[SANZIONI STICKY] reposition send failed:", err?.message || err);
        return null;
      });
    if (!sent?.id) return;

    await saveSanzioniPanelMessageId(channel.id, sent.id);
    await deleteRecentModerationStickies(channel, sent.id);
  });
}

async function maybeRepositionModerationSticky(channelRef?, client?, options: Record<string, any> = {}) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  const sanzioniChannelId = getSanzioniChannelId();
  if (!channel?.isTextBased?.() || String(channel.id) !== sanzioniChannelId) return;

  const delayMs = Math.max(
    500,
    Number(options?.delayMs ?? MODERATION_STICKY_DEBOUNCE_MS) || MODERATION_STICKY_DEBOUNCE_MS,
  );
  const lockKey = String(channel.id);
  const existing = moderationStickyDebounceTimers.get(lockKey);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(() => {
    moderationStickyDebounceTimers.delete(lockKey);
    void maybeRepositionModerationStickyNow(channel, client).catch(() => null);
  }, delayMs);
  timer.unref?.();
  moderationStickyDebounceTimers.set(lockKey, timer);
}

export = {
  getSanzioniChannelId,
  buildModerationGuideStickyPayload,
  ensureModerationStickyPanel,
  maybeRepositionModerationSticky,
  isModerationStickyPanelMessage,
};
