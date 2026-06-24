const IDs = require("../Config/ids");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const { scheduleMessageDeletion, EPHEMERAL_TTL_SHORT_MS } = require("../Config/ephemeralMessageTtl");
const {
  isChannelOrThreadUnderStaffCmds,
  isStaffCmdsPmCommandsThread,
  getStaffCmdsThreadIdsCache,
} = require("../Staff/staffCmdsChannelUtils");
const { getStaffCmdsThreadIds } = require("../Global/globalSettingsBucket");

function partnersChatChannelId() {
  return String(IDs.channels?.partnersChat || "").trim();
}

/** #partners-chat o thread sotto quel canale. */
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

/** Thread comandi PM sotto #staff-cmds. */
async function isPartnerPmDailyCommandsThread(channel) {
  return isStaffCmdsPmCommandsThread(channel);
}

async function isOpenPartnershipTicketChannel(channel) {
  const id = String(channel?.id || "").trim();
  if (!/^\d{16,22}$/.test(id)) return false;
  const doc = await Ticket.findOne({ channelId: id, open: true }, { ticketType: 1 }).lean().catch(() => null);
  return String(doc?.ticketType || "").toLowerCase() === "partnership";
}

async function resolvePmCommandsThreadId() {
  const cached = getStaffCmdsThreadIdsCache().pm;
  if (cached && /^\d{16,22}$/.test(String(cached))) return String(cached);
  const ids = await getStaffCmdsThreadIds();
  return ids?.pm && /^\d{16,22}$/.test(String(ids.pm)) ? String(ids.pm) : "";
}

/**
 * Se il comando PM è fuori dal thread dedicato (partners-chat, #staff-cmds o thread High),
 * restituisce il testo di rifiuto; altrimenti null.
 */
async function partnersChatPartnerCommandDeniedReplyContent(channel, options = {}) {
  if (options.allowPartnership === true && (await isOpenPartnershipTicketChannel(channel))) return null;
  if (await isStaffCmdsPmCommandsThread(channel)) return null;
  const inPartnersChat = isChannelOrThreadUnderPartnersChat(channel);
  const inStaffCmdsZone = isChannelOrThreadUnderStaffCmds(channel);
  if (!inPartnersChat && !inStaffCmdsZone) return null;
  const tid = await resolvePmCommandsThreadId();
  const staffCmdsId = String(IDs.channels?.staffCmds || "").trim();
  const hint = tid
    ? ` Spostati in <#${tid}> (sotto <#${staffCmdsId}>).`
    : staffCmdsId
      ? ` Apri il thread **Comandi Partner Manager** sotto <#${staffCmdsId}>.`
      : " Apri il thread **Comandi Partner Manager** sotto #staff-cmds.";
  return (
    "<:vegax:1443934876440068179> Partnership, classifica PM, blacklist e pannello profilo staff/PM vanno usati solo nel **thread Comandi Partner Manager**, non qui." +
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