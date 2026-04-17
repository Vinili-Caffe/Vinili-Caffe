const IDs = require("../Config/ids");
const { getPartnerPmDailyThreadId } = require("../Global/globalSettingsBucket");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { scheduleMessageDeletion, EPHEMERAL_TTL_SHORT_MS } = require("../Config/ephemeralMessageTtl");

function partnersChatChannelId() {
  return String(IDs.channels?.partnersChat || "").trim();
}

/** #partners-chat o thread sotto quel canale (comandi PM / thread giornaliero). */
function isChannelOrThreadUnderPartnersChat(channel) {
  const chat = partnersChatChannelId();
  if (!channel) return false;
  const id = String(channel.id);
  if (chat && id === chat) return true;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    const parent = String(channel.parentId || "");
    if (chat && parent === chat) return true;
  }
  return false;
}

/** Thread giornaliero «Comandi PM» sotto #partners-chat (id persistito in globalsettings). */
async function isPartnerPmDailyCommandsThread(channel) {
  if (!channel || typeof channel.isThread !== "function" || !channel.isThread()) return false;
  const chatId = partnersChatChannelId();
  if (!chatId || String(channel.parentId || "") !== chatId) return false;
  const threadId = await getPartnerPmDailyThreadId();
  if (!threadId) return false;
  return String(channel.id) === String(threadId);
}

async function isOpenPartnershipTicketChannel(channel) {
  const id = String(channel?.id || "").trim();
  if (!/^\d{16,22}$/.test(id)) return false;
  const doc = await Ticket.findOne({ channelId: id, open: true }, { ticketType: 1 }).lean().catch(() => null);
  return String(doc?.ticketType || "").toLowerCase() === "partnership";
}

/**
 * Se il comando è in #partners-chat o in un suo thread che non è il thread giornaliero PM,
 * restituisce il testo di rifiuto; altrimenti null (canali fuori da partners-chat: nessun blocco).
 * Con `allowPartnership: true`, un ticket partnership aperto sul canale corrente non viene bloccato (slash/modal partnership).
 */
async function partnersChatPartnerCommandDeniedReplyContent(channel, options = {}) {
  if (options.allowPartnership === true && (await isOpenPartnershipTicketChannel(channel))) return null;
  if (!isChannelOrThreadUnderPartnersChat(channel)) return null;
  if (await isPartnerPmDailyCommandsThread(channel)) return null;
  const tid = await getPartnerPmDailyThreadId();
  const safe = tid && /^\d{16,22}$/.test(String(tid).trim()) ? String(tid).trim() : "";
  const hint = safe ? ` Spostati in <#${safe}>.` : " Apri il thread **Comandi PM** del giorno (sotto #partners-chat).";
  return (
    "<:vegax:1443934876440068179> Partnership, classifica PM, blacklist e `+staff` in vista PM vanno usati solo nel **thread giornaliero Comandi PM**, non qui." +
    hint
  );
}

/** Risposta a un comando prefisso + cancellazione dopo ~8s del messaggio utente e della risposta bot. */
async function sendPartnersChatDeniedPrefixCleanup(message, content) {
  const ttl = EPHEMERAL_TTL_SHORT_MS;
  let sent = null;
  try {
    if (message && typeof message.reply === "function") {
      sent = await message.reply({ content, allowedMentions: { repliedUser: false } });
    }
  } catch (_) {}
  if (!sent && message?.channel?.send) {
    try {
      sent = await message.channel.send({ content, allowedMentions: { parse: [] } });
    } catch (_) {}
  }
  if (sent) scheduleMessageDeletion(sent, ttl);
  if (message?.deletable) scheduleMessageDeletion(message, ttl);
  return sent;
}

/** Dopo `reply` ephemeral a un’interazione, rimuove la risposta (es. avviso zona sbagliata). */
function schedulePartnersDeniedDeleteReply(interaction, ttlMs = EPHEMERAL_TTL_SHORT_MS) {
  const t = Number(ttlMs) > 0 ? ttlMs : EPHEMERAL_TTL_SHORT_MS;
  const timer = setTimeout(() => {
    interaction?.deleteReply?.().catch(() => {});
  }, t);
  if (typeof timer.unref === "function") timer.unref();
}

module.exports = {
  partnersChatChannelId,
  isChannelOrThreadUnderPartnersChat,
  isPartnerPmDailyCommandsThread,
  isOpenPartnershipTicketChannel,
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
  schedulePartnersDeniedDeleteReply,
};