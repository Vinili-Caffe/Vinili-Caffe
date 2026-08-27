const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const IDs = require("../Config/ids");
const { getGuildChannelCached, getClientChannelCached } = require("../Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../../shared/discord/panelUpsertRuntime");
const { personalityPanelUpdateOne } = require("../Global/globalSettingsGuildStores");
const {
  isDiscordWorkflowUiEnabled,
  buildSiteLinkRow,
  siteWorkflowPath,
} = require("../Web/discordWorkflowUiGate");

const PAUSE_REQUEST_OPEN_ID = "pause_request:open";
const PAUSE_STICKY_EMBED_SIGNATURE = "richiesta pausa|vinili & caffè";
const MAIN_GUILD_ID = String(IDs.guilds?.main || "1329080093599076474").trim();
const pauseStickyLocks = new Map();

function getPauseChannelId() {
  return String(IDs.channels?.pause || "").trim();
}

function iterMessageComponents(message) {
  const rows = message?.components || [];
  const out = [];
  for (const row of rows) {
    const children = row?.components || [];
    for (const c of children) out.push(c);
  }
  return out;
}

function componentCustomId(c) {
  return String(c?.customId || c?.custom_id || "");
}

function isPauseStickyPanelMessage(message) {
  if (!message?.author?.bot) return false;
  for (const c of iterMessageComponents(message)) {
    const id = componentCustomId(c);
    if (id === PAUSE_REQUEST_OPEN_ID) return true;
    // Link panel (sito): stesso sticky senza customId di richiesta.
    if (String(c?.url || c?.data?.url || "").includes("/staff/pause")) return true;
  }
  const sig = String(
    message?.embeds?.[0]?.title || message?.embeds?.[0]?.data?.title || "",
  )
    .trim()
    .toLowerCase();
  return sig.includes("richiesta pausa");
}

/** Messaggio richiesta Accetta/Rifiuta — non deve triggerare un nuovo sticky. */
function isPauseDecisionRequestMessage(message) {
  if (!message?.author?.bot) return false;
  for (const c of iterMessageComponents(message)) {
    const id = componentCustomId(c);
    if (id.startsWith("pause_accept:") || id.startsWith("pause_reject:")) return true;
  }
  return false;
}

async function getPausePanelRow(channelId) {
  const { GlobalSettings } = require("../../Schemas/Community/communitySchemas");
  const guildId = MAIN_GUILD_ID;
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
  const discordUi = isDiscordWorkflowUiEnabled();
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Richiesta pausa")
    .setDescription(
      discordUi
        ? [
            "<:VC_Staff:1494286904089247754> Usa il pulsante qui sotto per inviare una **richiesta pausa**.",
            "",
            "<a:VC_Calendar:1482706208149475358> Ti verranno chiesti **data di inizio**, **data di ritorno** e **motivo**.",
            "",
            "**Formati data accettati:** `GG/MM`, `GG/MM/AAAA`, `1 agosto`, `domani`",
            "",
            "<:VC_Attention:1482534443632558151> La pausa deve iniziare **almeno da domani**.",
          ].join("\n")
        : [
            "<:VC_Staff:1494286904089247754> Le **richieste pausa** si inviano e gestiscono **solo sul sito**.",
            "",
            "<a:VC_Calendar:1482706208149475358> Apri la pagina pause, scegli le date e il motivo, poi invia la richiesta.",
            "",
            "<:VC_Attention:1482534443632558151> La pausa deve iniziare **almeno da domani**.",
            "",
            "La chat con l'High Staff è disponibile nella stessa pagina dopo l'invio.",
          ].join("\n"),
    );
  const row = discordUi
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(PAUSE_REQUEST_OPEN_ID)
          .setLabel("Richiedi pausa")
          .setEmoji("<a:VC_Calendar:1482706208149475358>")
          .setStyle(ButtonStyle.Primary),
      )
    : buildSiteLinkRow("Apri richieste pausa", siteWorkflowPath("pause"));
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

async function deleteRecentPauseStickies(channel, keepId = "") {
  const keep = String(keepId || "").trim();
  const recent = await channel.messages.fetch({ limit: 20 }).catch(() => null);
  if (!recent?.size) return;
  const deletions = [];
  for (const message of recent.values()) {
    if (!isPauseStickyPanelMessage(message)) continue;
    if (keep && String(message.id) === keep) continue;
    deletions.push(message.delete().catch(() => null));
  }
  if (deletions.length) await Promise.all(deletions);
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
  if (sent?.id) {
    await deleteRecentPauseStickies(channel, sent.id);
    await savePausePanelMessageId(channel.id, sent.id);
  }
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
    const last = latest?.first?.() || [...(latest?.values?.() || [])][0] || null;
    if (last && stickyId && String(last.id) === stickyId && isPauseStickyPanelMessage(last)) {
      await deleteRecentPauseStickies(channel, stickyId);
      return;
    }

    // Prima pubblica il nuovo sticky, poi cancella i vecchi (se send fallisce resta almeno uno).
    const payload = buildPauseStickyPanelPayload();
    const sent = await channel
      .send({ ...payload, __skipNoticeEmbed: true })
      .catch((err) => {
        global.logger?.warn?.("[PAUSE STICKY] send failed:", err?.message || err);
        return null;
      });
    if (!sent?.id) return;

    await savePausePanelMessageId(channel.id, sent.id);
    await deleteRecentPauseStickies(channel, sent.id);
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
  isPauseDecisionRequestMessage,
  getPauseChannelId,
};
