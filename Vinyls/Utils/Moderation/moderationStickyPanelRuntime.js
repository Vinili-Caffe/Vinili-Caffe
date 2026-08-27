const IDs = require("../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const { personalityPanelUpdateOne } = require("../Global/globalSettingsGuildStores");
const {
  MOD_GUIDE_BUTTON_IDS,
  buildModerationGuideStickyPayload,
} = require("./moderationGuidePanelComponents");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474").trim();
const moderationStickyLocks = new Map();
const moderationStickyDebounceTimers = new Map();
const MODERATION_STICKY_DEBOUNCE_MS = 2500;

function getSanzioniChannelId() {
  return String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
}

function iterMessageComponents(message) {
  const rows = message?.components || [];
  const out = [];
  for (const row of rows) {
    for (const c of row?.components || []) out.push(c);
  }
  return out;
}

function componentCustomId(c) {
  return String(c?.customId || c?.custom_id || "");
}

function isModerationStickyPanelMessage(message) {
  if (!message?.author?.bot) return false;
  const ids = new Set(MOD_GUIDE_BUTTON_IDS);
  for (const c of iterMessageComponents(message)) {
    if (ids.has(componentCustomId(c))) return true;
  }
  const desc = String(
    message?.embeds?.[0]?.description || message?.embeds?.[0]?.data?.description || "",
  ).toLowerCase();
  return desc.includes("applicare") && desc.includes("sanzioni") && desc.includes("prove");
}

async function getSanzioniPanelRow(channelId) {
  const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
  const doc = await GlobalSettings.findOne({ guildId: MAIN_GUILD_ID })
    .select("personalityPanels")
    .lean()
    .catch(() => null);
  const row = (doc?.personalityPanels || []).find((x) => String(x?.channelId) === String(channelId));
  return row || null;
}

async function saveSanzioniPanelMessageId(channelId, messageId) {
  const cid = String(channelId || "").trim();
  const mid = messageId ? String(messageId) : null;
  if (!cid) return;
  await personalityPanelUpdateOne({ channelId: cid }, { $set: { sanzioniPanelMessageId: mid } }).catch(() => null);
}

async function resolveSanzioniChannel(client, channelRef) {
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

async function deleteRecentModerationStickies(channel, keepId = "") {
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

async function ensureModerationStickyPanel(client, channelRef) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  if (!channel?.isTextBased?.()) return null;
  const panelRow = await getSanzioniPanelRow(channel.id);
  const payload = buildModerationGuideStickyPayload();
  const existingId = String(panelRow?.sanzioniPanelMessageId || "").trim();
  if (existingId) {
    const existing = await channel.messages.fetch(existingId).catch(() => null);
    if (existing && isModerationStickyPanelMessage(existing)) {
      await existing.edit(payload).catch(() => null);
      await deleteRecentModerationStickies(channel, existing.id);
      return existing;
    }
  }
  const sent = await channel
    .send({ ...payload, __skipNoticeEmbed: true })
    .catch((err) => {
      global.logger?.warn?.("[SANZIONI STICKY] send failed:", err?.message || err);
      return null;
    });
  if (sent?.id) {
    await saveSanzioniPanelMessageId(channel.id, sent.id);
    await deleteRecentModerationStickies(channel, sent.id);
  }
  return sent;
}

async function maybeRepositionModerationStickyNow(channelRef, client) {
  const channel = await resolveSanzioniChannel(client, channelRef);
  const sanzioniChannelId = getSanzioniChannelId();
  if (!channel?.isTextBased?.() || String(channel.id) !== sanzioniChannelId) return;

  const lockKey = String(channel.id);
  while (moderationStickyLocks.get(lockKey)) {
    await moderationStickyLocks.get(lockKey);
  }
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  moderationStickyLocks.set(lockKey, gate);
  try {
    const panelRow = await getSanzioniPanelRow(channel.id);
    const stickyId = String(panelRow?.sanzioniPanelMessageId || "").trim();
    const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const last = latest?.first?.() || [...(latest?.values?.() || [])][0] || null;
    if (last && stickyId && String(last.id) === stickyId && isModerationStickyPanelMessage(last)) {
      await deleteRecentModerationStickies(channel, stickyId);
      return;
    }

    const payload = buildModerationGuideStickyPayload();
    const sent = await channel
      .send({ ...payload, __skipNoticeEmbed: true })
      .catch((err) => {
        global.logger?.warn?.("[SANZIONI STICKY] reposition send failed:", err?.message || err);
        return null;
      });
    if (!sent?.id) return;

    await saveSanzioniPanelMessageId(channel.id, sent.id);
    await deleteRecentModerationStickies(channel, sent.id);
  } finally {
    moderationStickyLocks.delete(lockKey);
    release?.();
  }
}

/** Debounce: una sola riposizione dopo alert/ping/sanzione ravvicinati. */
async function maybeRepositionModerationSticky(channelRef, client, options = {}) {
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

module.exports = {
  getSanzioniChannelId,
  buildModerationGuideStickyPayload,
  ensureModerationStickyPanel,
  maybeRepositionModerationSticky,
  isModerationStickyPanelMessage,
};
