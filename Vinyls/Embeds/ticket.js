const path = require("path");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { buildTicketOpenSelectRows } = require("../Utils/Ticket/ticketOpenMenuComponents");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const TICKET_CHANNEL_ID = IDs.channels.ticket;
const TICKET_MEDIA_NAME = "ticket.gif";
const TICKET_MEDIA_PATH = path.join(__dirname, "..", "Photos", TICKET_MEDIA_NAME);
const { guildIconUrl } = require("../Utils/Discord/guildDiscordIdentity");

async function run(client) {
  const channel = client.channels.cache.get(TICKET_CHANNEL_ID) || (await getClientChannelCached(client, TICKET_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;
  const attachment = new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME });
  const ticketPanelEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({name: "Contatta lo Staff & chiedi supporto:", iconURL: guildIconUrl(channel.guild, { size: 128 }) || undefined})
    .setDescription(
      `I ticket equivalgono a un sistema di supporto che permette di parlare direttamente con lo staff, al fine di chiedere chiarimenti, rivolgere domande sul server, segnalare un accaduto all'interno di quest'ultimo o per altre richieste.

<:VC_1:1482706338021642333> **SUPPORTO**
<a:VC_Arrow:1482706699365257397> Usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.
<:VC_2:1482706376525611090> **PARTNERSHIP**
<a:VC_Arrow:1482706699365257397> Usalo per fare partnership con noi.
<:VC_3:1482706404773990460> **HIGH STAFF**
<a:VC_Arrow:1482706699365257397> Usalo per fare una donazione, per richiedere una sponsor a pagamento o per parlare con un amministratore del server.
<:VC_4:1482706432347344916> **PERKS**
<a:VC_Arrow:1482706699365257397> Usalo per fare la verifica selfie o per riscattare i ruoli Supporter o Follower.

<a:VC_Alert:1482706673176150077> Richieste di trasferimenti o fusioni noi da voi verranno sanzionate.
<a:VC_Alarm:1482706641618079816> Non accettiamo richieste di bot o siti, aprire ticket per ciò comporterà un warn.

<:VC_Attention:1482534443632558151> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`,
    )
    .setFooter({ text: `Non garantiamo di rispondere negli orari notturni, dalle 00:00 alle 10:00` })

  const ticketSelectRows = buildTicketOpenSelectRows();

  let panelDoc = null;
  try {
    panelDoc = await personalityPanelFindOneAndUpdate(
      { guildId, channelId: TICKET_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: TICKET_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const panelMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.ticketInfoMessageId || null, files: [attachment], embeds: [ticketPanelEmbed], components: ticketSelectRows, attachmentName: TICKET_MEDIA_NAME });

  if (panelMessage?.id) {
    await personalityPanelUpdateOne({ guildId, channelId: TICKET_CHANNEL_ID }, { $set: { ticketInfoMessageId: panelMessage?.id || panelDoc?.ticketInfoMessageId || null } }).catch(() => {});
  }
}

module.exports = { name: "ticket", order: 20, section: "menu", run };