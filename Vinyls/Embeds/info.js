const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const IDs = require("../Utils/Config/ids");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { DIVIDER_URL } = require("../../shared/discord/constants");
const INFO_CHANNEL_ID = IDs.channels.info;
const INFO_MEDIA_NAME = "info.gif";
const INFO_MEDIA_PATH = path.join(__dirname, "..", "Photos", INFO_MEDIA_NAME);
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");

async function run(client) {
  const channel = await getClientChannelCached(client, INFO_CHANNEL_ID);
  if (!channel?.isTextBased?.()) return;
  const attachment = new AttachmentBuilder(INFO_MEDIA_PATH, { name: INFO_MEDIA_NAME });
  const infoIntroText = [
    "# Ti diamo il benvenuto nella nostra community!",
    "",
    "<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.",
    "",
    "<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**",
    "<:VC_DoubleReply:1482532332509466797> Nel canale <id:customize> potrai selezionare i ruoli da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!",
    "<:VC_Reply:1482532158080942191> Puoi cambiare il tuo colore con il comando `+colors`",
    "",
    `Dubbi o problemi? <#${IDs.channels.ticket}> sarà la vostra bussola, lo staff vi risponderà il prima possibile!`,
  ].join("\n");
  const infoLinksText = [
    "<:VC_Instagram:1482526710426767360> [Seguici su Instagram](https://www.instagram.com/viniliecaffe/)",
    "<:VC_TikTok:1498017166060949525> [Seguici su TikTok](https://www.tiktok.com/@viniliecaffe)",
    "<:VC_Logo:1498073401317916803> [Sito Ufficiale](https://www.viniliecaffe.it)",
  ].join("\n");
  const infoMetaText = [
    "<:exp:1470067108543987846> Owner: <@295500038401163264>",
    "<:moon:1470064812615667827> Fondazione: ||<t:1765382400:F>||",
    "<:nitroboost:1470064881674883326> Invite: https://discord.gg/viniliecaffe",
  ].join("\n");
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("︲REGOLAMENTO")
      .setEmoji("<a:VC_Rule:1482706839928967280>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/regole"),
    new ButtonBuilder()
      .setLabel("︲DONAZIONI")
      .setEmoji("<a:VC_Sparkles:1468546911936974889>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/donazioni"),
    new ButtonBuilder()
      .setLabel("︲SPONSOR")
      .setEmoji("<:pinnednew:1443670849990430750>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/sponsor"),
    new ButtonBuilder()
      .setCustomId("info_tags")
      .setLabel("︲TAGS")
      .setEmoji("<:VC_Firework:1470796227913322658>")
      .setStyle(ButtonStyle.Success),
    );

  const infoSecondText = [
    "<:VC_PurpleFlower:1469463879149944943> **Sblocca dei vantaggi, permessi e ruoli:**",
    "",
    "Scopri tramite i bottoni sottostanti come sbloccare permessi, ad esempio: mandare link e immagini in chat, poter cambiare il nickname e molti altri.",
  ].join("\n");
  const infoFooterText = "Usa i bottoni sottostanti per accedere ad altre categorie del server.";
  const infoEmbedPrimary = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Ti diamo il benvenuto nella nostra community!")
    .setDescription(infoIntroText)
    .addFields(
      { name: "<:VC_Link:1482460590894088222> Links", value: infoLinksText, inline: true },
      { name: "<:VC_Info:1482526956703580372> Informazioni", value: infoMetaText, inline: true },
    )
    .setImage(DIVIDER_URL)
    .setFooter({ text: infoFooterText });
  const infoEmbedSecondary = new EmbedBuilder()
    .setColor("#6f4e37")
    .setDescription(infoSecondText)
    .setImage(DIVIDER_URL)
    .setFooter({ text: infoFooterText });
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("info_boost_levels").setLabel("︲VANTAGGI BOOST & LIVELLI").setEmoji("<a:VC_Rocket:1468544312475123753>").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("info_badges_roles").setLabel("︲BADGE & ALTRI RUOLI").setEmoji("<a:VC_Diamon:1482706116873031680>").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("info_verifica").setLabel("︲VERIFICA SELFIE").setEmoji(`<a:VC_Verified:1482532479637127188>`).setStyle(ButtonStyle.Secondary),
  );
  const guildId = channel.guild?.id;
  if (!guildId) return;
  let panel = null;
  try {
    panel = await personalityPanelFindOneAndUpdate(
      { guildId, channelId: INFO_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: INFO_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] info panel findOneAndUpdate error:", err?.message || err);
  }

  const id1 = panel?.infoMessageId1 || null;
  const id2 = panel?.infoMessageId2 || null;
  const distinct = id1 && id2 && String(id1) !== String(id2);
  const exists1 = id1 ? await channel.messages.fetch(id1).then(() => true).catch(() => false) : false;
  const exists2 = id2 ? await channel.messages.fetch(id2).then(() => true).catch(() => false) : false;
  const hasTwoDistinctExisting = Boolean(distinct && exists1 && exists2);
  let msgGif = null;
  let msgPanel = null;
  let msgPanelSecondary = null;

  if (hasTwoDistinctExisting) {
    msgGif = await upsertPanelMessage(channel, client, {
      messageId: id1,
      files: [attachment],
      content: "",
      components: [],
      attachmentName: INFO_MEDIA_NAME,
    });
    msgPanel = await upsertPanelMessage(channel, client, {
      messageId: id2,
      content: "",
      embeds: [infoEmbedPrimary],
      components: [row1],
    });
    msgPanelSecondary = await upsertPanelMessage(channel, client, {
      embeds: [infoEmbedSecondary],
      components: [row2],
    });
  } else {
    if (id1) await channel.messages.fetch(id1).then((m) => m.delete()).catch(() => {});
    if (id2 && String(id2) !== String(id1)) await channel.messages.fetch(id2).then((m) => m.delete()).catch(() => {});
    msgGif = await channel.send({ files: [attachment] }).catch((err) => { global.logger?.warn?.("[embeds] info gif send:", err?.message || err); return null; });
    msgPanel = await channel.send({
      content: "",
      embeds: [infoEmbedPrimary],
      components: [row1],
    }).catch((err) => { global.logger?.warn?.("[embeds] info panel send:", err?.message || err); return null; });
    msgPanelSecondary = await channel.send({
      content: "",
      embeds: [infoEmbedSecondary],
      components: [row2],
    }).catch((err) => { global.logger?.warn?.("[embeds] info panel second send:", err?.message || err); return null; });
  }

  if (msgGif?.id || msgPanel?.id || msgPanelSecondary?.id) {
    await personalityPanelUpdateOne(
      { guildId, channelId: INFO_CHANNEL_ID },
      {
        $set: {
          infoMessageId1: msgGif?.id ?? panel?.infoMessageId1 ?? null,
          infoMessageId2: msgPanel?.id ?? panel?.infoMessageId2 ?? null,
        },
      },
    ).catch(() => {});
  }
};

module.exports = { name: "info", order: 20, section: "embedWithButtons", run }