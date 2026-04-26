const path = require("path");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const IDs = require("../Utils/Config/ids");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const INFO_CHANNEL_ID = IDs.channels.info;
const INFO_MEDIA_NAME = "info.gif";
const INFO_MEDIA_PATH = path.join(__dirname, "..", "Photos", INFO_MEDIA_NAME);
const { DIVIDER_URL } = require("../../shared/discord/constants");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");

async function run(client) {
  const channel = await getClientChannelCached(client, INFO_CHANNEL_ID);
  if (!channel?.isTextBased?.()) return;
  const attachment = new AttachmentBuilder(INFO_MEDIA_PATH, { name: INFO_MEDIA_NAME });
  const embed1 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Ti diamo il benvenuto nella nostra community!")
    .setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:" })
    .setDescription(
      [
        "<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.",
        "",
        "<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**",
        "<:VC_Reply:1482532158080942191> Nel canale <id:customize> potrai selezionare i colori e i ruoli da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!",
        "",
        `Dubbi o problemi? <#${IDs.channels.ticket}> sarà la vostra bussola, lo staff vi risponderà il prima possibile!`,
      ].join("\n"),
    )
    .addFields(
      {
        name: "<:VC_Dot:1482532364222595303> Links",
        value: [
          "<:VC_Instagram:1482526710426767360> [Seguici su Instagram](<https://www.instagram.com/viniliecaffe/>)",
          "<:VC_TikTok:1498017166060949525> [Seguici su TikTok](<https://www.tiktok.com/@viniliecaffe/>)",
          "<:VC_Logo:1498073401317916803> [Sito Ufficiale](<https://www.viniliecaffe.it>)",
          "<:VC_bump:1482531857521311885> [Lascia una recensione su DISBOARD](<https://disboard.org/it/server/1329080093599076474>)",
          "<:discadia:1498023529055260682> [Votaci su Discadia](<https://discadia.com/vote/viniliecaffe/>)",
          "<:VC_topgg:1495124467553275934> [Votaci e lascia una recensione su Top.gg](<https://top.gg/discord/servers/832911595289169920>)",
        ].join("\n"),
        inline: true,
      },
      {
        name: "<:VC_Dot:1482532364222595303> Informazioni",
        value: [
          "<:exp:1470067108543987846> Owner: <@295500038401163264>",
          "<:moon:1470064812615667827> Founder: ||<t:1765382400:F>||",
          "<:nitroboost:1470064881674883326> Invite: <https://discord.gg/viniliecaffe>",
        ].join("\n"),
        inline: true,
      },
    )
    .setImage(DIVIDER_URL);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("info_rules")
      .setLabel("︲REGOLAMENTO")
      .setEmoji("<a:VC_Rule:1482706839928967280>")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("info_donations")
      .setLabel("︲DONAZIONI")
      .setEmoji("<a:VC_Sparkles:1468546911936974889>")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("info_sponsor")
      .setLabel("︲SPONSOR")
      .setEmoji("<:pinnednew:1443670849990430750>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("info_tags")
      .setLabel("︲TAGS")
      .setEmoji("<:VC_Firework:1470796227913322658>")
      .setStyle(ButtonStyle.Success),
  );
  const embed2 = new EmbedBuilder()
    .setColor("#6f4e37")
    .setFooter({ text: "Usa i bottoni sottostanti per accedere ad altre categorie del server:" })
    .setTitle("<:VC_PurpleFlower:1469463879149944943> Sblocca dei vantaggi, permessi e ruoli:")
    .setDescription(
      "Scopri tramite i bottoni sottostanti come sbloccare permessi, ad esempio: mandare link e immagini in chat, poter cambiare il nickname e molti altri.",
    )
    .setImage(DIVIDER_URL);
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
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const id1 = panel?.infoMessageId1 || null;
  const id2 = panel?.infoMessageId2 || null;
  const distinct = id1 && id2 && String(id1) !== String(id2);
  const exists1 = id1 ? await channel.messages.fetch(id1).then(() => true).catch(() => false) : false;
  const exists2 = id2 ? await channel.messages.fetch(id2).then(() => true).catch(() => false) : false;
  const hasTwoDistinctExisting = Boolean(distinct && exists1 && exists2);
  let msg1 = null;
  let msg2 = null;

  if (hasTwoDistinctExisting) {
    msg1 = await upsertPanelMessage(channel, client, { messageId: id1, files: [attachment], embeds: [embed1], components: [row1], attachmentName: INFO_MEDIA_NAME });
    msg2 = await upsertPanelMessage(channel, client, { messageId: id2, embeds: [embed2], components: [row2] });
  } else {
    if (id1) await channel.messages.fetch(id1).then((m) => m.delete()).catch(() => {});
    if (id2 && String(id2) !== String(id1)) await channel.messages.fetch(id2).then((m) => m.delete()).catch(() => {});
    const payload1 = { files: [attachment], embeds: [embed1], components: [row1] };
    const payload2 = { embeds: [embed2], components: [row2] };
    msg1 = await channel.send(payload1).catch((err) => { global.logger?.warn?.("[embeds] info msg1 send:", err?.message || err); return null; });
    msg2 = msg1 ? await channel.send(payload2).catch((err) => { global.logger?.warn?.("[embeds] info msg2 send:", err?.message || err); return null; }) : null;
  }

  if (msg1?.id || msg2?.id) {
    await personalityPanelUpdateOne(
      { guildId, channelId: INFO_CHANNEL_ID },
      {
        $set: {
          infoMessageId1: msg1?.id ?? panel?.infoMessageId1 ?? null,
          infoMessageId2: msg2?.id ?? panel?.infoMessageId2 ?? null,
        },
      },
    ).catch(() => {});
  }
}

module.exports = { name: "info", order: 20, section: "embedWithButtons", run };