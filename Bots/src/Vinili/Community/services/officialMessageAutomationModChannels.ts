const { getSanzioniChannelId } = require("../../Moderation/utils/moderationStickyPanelRuntime") as typeof import("../../Moderation/utils/moderationStickyPanelRuntime");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../shared/utils/ephemeralMessageTtl");
const SANZIONI_CHANNEL_ID = getSanzioniChannelId();
const PAUSE_CHANNEL_ID = IDs.channels.pause;

/** Sticky guida sanzioni rimosso: niente più riposizionamento. */
async function handleSanzioniChannelMessage(message?) {
  if (!message?.guild) return false;
  const sanzioniChannelId = String(SANZIONI_CHANNEL_ID || "");
  if (!sanzioniChannelId || String(message.channelId) !== sanzioniChannelId) return false;
  return false;
}

/** Le pause si chiedono solo dal sito: un messaggio nel canale pause viene tolto con il link. */
async function handlePauseChannelMessage(message?) {
  if (!message?.guild) return false;
  const pauseChannelId = String(IDs.channels.pause || "");
  if (!pauseChannelId || String(message.channelId) !== pauseChannelId) return false;
  if (message.author?.bot || message.webhookId || message.system) return false;
  const { siteWorkflowUrl } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
  const warning = await message.channel
    .send({ content: `${message.author} le richieste pausa si inviano **solo sul sito**:
${siteWorkflowUrl("pause")}` })
    .catch(() => null);
  await message.delete().catch(() => {});
  if (warning) scheduleMessageDeletion(warning, EPHEMERAL_TTL_NORMAL_MS);
  return true;
}

export = { handleSanzioniChannelMessage, handlePauseChannelMessage };
