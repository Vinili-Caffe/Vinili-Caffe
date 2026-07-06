const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../../shared/discord/panelUpsertRuntime");
const { personalityPanelUpdateOne } = require("../Global/globalSettingsGuildStores");

const PAUSE_REQUEST_OPEN_ID = "pause_request:open";
const PAUSE_STICKY_EMBED_SIGNATURE = "richiesta pausa|vinili & caffè";
const pauseStickyLocks = new Map();

function getPauseChannelId() {
  return String(IDs.channels?.pause || "").trim();
}

function isPauseStickyPanelMessage(message) {
  if (!message?.author?.bot) return false;
  const rows = message?.components || [];
  for (const row of rows) {
    const children = row?.components || [];
    for (const c of children) {
      const id = String(c?.customId || c?.custom_id || "");
      if (id === PAUSE_REQUEST_OPEN_ID) return true;
    }
  }
  const sig = String(
    message?.embeds?.[0]?.title || message?.embeds?.[0]?.data?.title || "",
  )
    .trim()
    .toLowerCase();
  return sig.includes("richiesta pausa");
}

async function getPausePanelRow(channelId) {
  const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
  const guildId = String(IDs.guildId || IDs.guild || "").trim() || "1329080093599076474";
  const doc = await GlobalSettings.findOne({ guildId }).select("personalityPanels").lean().catch(() => null);
  const row = (doc?.personalityPanels || []).find((x) => String(x?.channelId) === String(channelId));
  return row || null;
}

async function savePausePanelMessageId(channelId, messageId) {
  const cid = String(channelId || "").trim();
  const mid = messageId ? String(messageId) : null;
  if (!cid) return;
  await personalityPanelUpdateOne({ channelId: cid }, { $set: { pausePanelMessageId: mid } }).catch(() => null);
}

function buildPauseStickyPanelPayload() {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Richiesta pausa")
    .setDescription(
      [
        "<:VC_Staff:1494286904089247754> Usa il pulsante qui sotto per inviare una **richiesta pausa**.",
        "",
        "<a:VC_Calendar:1482706208149475358> Ti verranno chiesti **data di inizio**, **data di ritorno** e **motivo**.",
        "",
        "**Formati data accettati:** `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `domani`",
        "",
        "<:VC_Attention:1482534443632558151> La pausa deve iniziare **almeno da domani**.",
      ].join("\n"),
    );
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(PAUSE_REQUEST_OPEN_ID)
      .setLabel("Richiedi pausa")
      .setEmoji("<a:VC_Calendar:1482706208149475358>")
      .setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

async function resolvePauseChannel(client, channelRef) {
  if (channelRef?.isTextBased?.()) return channelRef;
  const pauseChannelId = getPauseChannelId();
  if (!pauseChannelId) return null;
  if (channelRef?.guild) {
    return (
      channelRef.guild.channels.cache.get(pauseChannelId) ||
      (await getGuildChannelCached(channelRef.guild, pauseChannelId))
    );
  }
  return client?.channels?.cache?.get(pauseChannelId) || (await getClientChannelCached(client, pauseChannelId));
}

async function ensurePauseStickyPanel(client, channelRef) {
  const channel = await resolvePauseChannel(client, channelRef);
  if (!channel?.isTextBased?.()) return null;
  const panelRow = await getPausePanelRow(channel.id);
  const payload = buildPauseStickyPanelPayload();
  const sent = await upsertPanelMessage(channel, client, {
    messageId: panelRow?.pausePanelMessageId || null,
    ...payload,
  });
  if (sent?.id) await savePausePanelMessageId(channel.id, sent.id);
  return sent;
}

async function maybeRepositionPauseSticky(channelRef, client) {
  const channel = await resolvePauseChannel(client, channelRef);
  const pauseChannelId = getPauseChannelId();
  if (!channel?.isTextBased?.() || String(channel.id) !== pauseChannelId) return;

  const lockKey = String(channel.id);
  while (pauseStickyLocks.get(lockKey)) {
    await pauseStickyLocks.get(lockKey);
  }
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  pauseStickyLocks.set(lockKey, gate);
  try {
    const panelRow = await getPausePanelRow(channel.id);
    const stickyId = String(panelRow?.pausePanelMessageId || "").trim();
    const latest = await channel.messages.fetch({ limit: 1 }).catch(() => null);
    const last = latest?.first?.() || null;
    if (last && stickyId && String(last.id) === stickyId && isPauseStickyPanelMessage(last)) return;

    if (stickyId) {
      const old = await channel.messages.fetch(stickyId).catch(() => null);
      if (old && isPauseStickyPanelMessage(old)) {
        await old.delete().catch(() => null);
      }
    }

    const payload = buildPauseStickyPanelPayload();
    const sent = await channel.send(payload).catch(() => null);
    if (sent?.id) await savePausePanelMessageId(channel.id, sent.id);
  } finally {
    pauseStickyLocks.delete(lockKey);
    release?.();
  }
}

module.exports = {
  PAUSE_REQUEST_OPEN_ID,
  PAUSE_STICKY_EMBED_SIGNATURE,
  buildPauseStickyPanelPayload,
  ensurePauseStickyPanel,
  maybeRepositionPauseSticky,
  isPauseStickyPanelMessage,
  getPauseChannelId,
};