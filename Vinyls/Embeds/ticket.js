const path = require("path");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const TICKET_CHANNEL_ID = IDs.channels.ticket;
const TICKET_MEDIA_NAME = "ticket.gif";
const TICKET_MEDIA_PATH = path.join(__dirname, "..", "Photos", TICKET_MEDIA_NAME);
const { DIVIDER_URL } = require("../../shared/discord/constants");

async function run(client) {
  const channel = client.channels.cache.get(TICKET_CHANNEL_ID) || (await getClientChannelCached(client, TICKET_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;
  const attachment = new AttachmentBuilder(TICKET_MEDIA_PATH, { name: TICKET_MEDIA_NAME });
  const ticketInfoEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(
      `<:reportmessage:1443670575376765130> Benvenuto nella **sezione** dedicata all'__assistenza__! Apri un **ticket** in base alle tue _esigenze_ e ricorda di **rispettare** il regolamento.

<:VC_Dot:1482532364222595303> Massimo **__\`1\`__** ticket alla volta;
<:VC_Dot:1482532364222595303> Scegli **sempre** la giusta sezione;
<:VC_Dot:1482532364222595303> Non **abusare** dei __ticket__;
<:VC_Dot:1482532364222595303> Non aprire ticket __inutili__;`,
    )
    .setImage(DIVIDER_URL);

  const ticketPanelEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: "Contatta lo Staff & chiedi supporto:",
      iconURL: channel.guild?.iconURL() || undefined,
    })
    .setDescription(
      `I ticket equivalgono a un sistema di supporto che permette di parlare direttamente con lo staff, al fine di chiedere chiarimenti, rivolgere domande sul server, segnalare un accaduto all'interno di quest'ultimo o per altre richieste.

<:VC_1:1482706338021642333> **SUPPORTO**
<a:VC_Arrow:1482706699365257397> Usalo per fare segnalazioni, riportare dei problemi o bug, per avere delle informazioni o per qualunque altra cosa che non rientra nelle categorie sottostanti.
<:VC_2:1482706376525611090> **PARTNERSHIP**
<a:VC_Arrow:1482706699365257397> Usalo per fare partnership con noi.
<:VC_3:1482706404773990460> **HIGH STAFF**
<a:VC_Arrow:1482706699365257397> Usalo per fare una donazione, per fare la "selfie verify", per richiedere una sponsor a pagamento o per parlare con un amministratore del server.

<:VC_Attention:1482534443632558151> Aprire un ticket **__inutile__** oppure **__non rispondere__** nell'arco di **\`24\` ore** comporterà un **warn**.`,
    )
    .setFooter({ text: `Non garantiamo di rispondere negli orari notturni, dalle 00:00 alle 10:00` })
    .setImage(DIVIDER_URL);

  const ticketMenu = new StringSelectMenuBuilder()
    .setCustomId("ticket_open_menu")
    .setPlaceholder("🎫 Seleziona una categoria...")
    .addOptions(
      { label: "SUPPORTO", description: "Supporto generale • Segnalazioni • Problemi", value: "ticket_supporto", emoji: { id: "1443651872258003005", name: "discordstaff" } },
      { label: "PARTNERSHIP", description: "Partnership", value: "ticket_partnership", emoji: { id: "1443651871125409812", name: "partneredserverowner" } },
      { label: "HIGH STAFF", description: "Verifica Selfie • Donazioni • Sponsor • High Staff", value: "ticket_highstaff", emoji: { id: "1443670575376765130", name: "reportmessage" } },
    );
  const ticketSelectRow = new ActionRowBuilder().addComponents(ticketMenu);

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

  const infoMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.ticketInfoMessageId || null, files: [attachment], embeds: [ticketInfoEmbed], components: [], attachmentName: TICKET_MEDIA_NAME });
  const panelMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.ticketPanelMessageId || null, embeds: [ticketPanelEmbed], components: [ticketSelectRow] });

  if (infoMessage?.id || panelMessage?.id) {
    await personalityPanelUpdateOne(
      { guildId, channelId: TICKET_CHANNEL_ID },
      {
        $set: {
          ticketInfoMessageId: infoMessage?.id || panelDoc?.ticketInfoMessageId || null,
          ticketPanelMessageId: panelMessage?.id || panelDoc?.ticketPanelMessageId || null,
        },
      },
    ).catch(() => {});
  }
}

module.exports = { name: "ticket", order: 20, section: "menu", run };