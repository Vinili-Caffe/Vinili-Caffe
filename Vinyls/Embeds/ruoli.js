const path = require("path");
const fs = require("fs");
const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const IDs = require("../Utils/Config/ids");
const {
  buildPronounsRow,
  buildAgeRow,
  buildRegionRow,
  buildZodiacRow,
  buildRelationshipRow,
  buildDmRow,
  buildMentionsRow,
  buildColors1Row,
  buildColorsPlusRow,
} = require("../Utils/Community/ruoliColoriPanelComponents");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");

const CHANNEL_ID = IDs.channels.ruoliColori;
const IMAGE_NAME = "personalità.gif";
const IMAGE_PATH = path.join(__dirname, "..", "Photos", IMAGE_NAME);
const IMAGE_PATH_ASCII = path.join(__dirname, "..", "Photos", "personalita.gif");
const MENTIONS_IMAGE_NAME = "menzioni.gif";
const MENTIONS_IMAGE_PATH = path.join(__dirname, "..", "Photos", MENTIONS_IMAGE_NAME);
const COLORS_IMAGE_NAME = "colori.gif";
const COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", COLORS_IMAGE_NAME);
const PLUS_COLORS_IMAGE_NAME = "coloriPlus.gif";
const PLUS_COLORS_IMAGE_PATH = path.join(__dirname, "..", "Photos", PLUS_COLORS_IMAGE_NAME);
async function run(client) {
  const channel = client.channels.cache.get(CHANNEL_ID) || (await getClientChannelCached(client, CHANNEL_ID));
  if (!channel) return;
  const personalityPhotoPath = fs.existsSync(IMAGE_PATH) ? IMAGE_PATH : (fs.existsSync(IMAGE_PATH_ASCII) ? IMAGE_PATH_ASCII : null);
  const attachment = personalityPhotoPath ? new AttachmentBuilder(personalityPhotoPath, { name: IMAGE_NAME }) : null;
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(
      [
        `Scegli in cosa ti identifichi, quanti anni hai, segno zodiacale, stato sentimentale e di dove sei. Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.`,
        "",
        "<a:VC_Exclamation:1482534702077444217> Massimo **1** ruolo per categoria.",
      ].join("\n"),
    )
  const mentionsAttachment = fs.existsSync(MENTIONS_IMAGE_PATH) ? new AttachmentBuilder(MENTIONS_IMAGE_PATH, { name: MENTIONS_IMAGE_NAME }) : null;
  const mentionsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Menzioni")
    .setDescription(
      [
        `Scegli lo stato DM e quali notifiche ricevere dal server in base a cosa ti interessa maggiormente. Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.`,
        "",
        "<a:VC_Exclamation:1482534702077444217> Massimo **1** ruolo per categoria.",
      ].join("\n"),
    )
  const colorsAttachment = fs.existsSync(COLORS_IMAGE_PATH) ? new AttachmentBuilder(COLORS_IMAGE_PATH, { name: COLORS_IMAGE_NAME }) : null;
  const colorsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(["Scegli il colore per personalizzare il nome del tuo profilo quando scrivi in chat.", "", "<a:VC_Exclamation:1482534702077444217> Verrà mostrato il **colore più in alto** nella lista dei ruoli nel tuo profilo."].join("\n"))
  const plusColorsAttachment = fs.existsSync(PLUS_COLORS_IMAGE_PATH) ? new AttachmentBuilder(PLUS_COLORS_IMAGE_PATH, { name: PLUS_COLORS_IMAGE_NAME }) : null;
  const plusColorsEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:sparkledred:1470064814502973591> Personalità")
    .setDescription(
      [
        'Scegli il colore che più ti piace per il tuo profilo! Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.',
        "",
        `⚠️ Questi ruoli sono riservati a coloro con questi ruoli: <@&${IDs.roles.ServerBooster}> e/o <@&${IDs.roles.Level50}>`,
        "",
        "<:sparkle:1470064801811140866> **LISTA COLORI:**",
        `<:VC_1:1482706338021642333> <@&${IDs.roles.redPlus}>`,
        `<:VC_2:1482706376525611090> <@&${IDs.roles.orangePlus}>`,
        `<:VC_3:1482706404773990460> <@&${IDs.roles.yellowPlus}>`,
        `<:VC_4:1482706432347344916> <@&${IDs.roles.greenPlus}>`,
        `<:VC_5:1482706459765637272> <@&${IDs.roles.bluePlus}>`,
        `<:VC_6:1482706490769801327> <@&${IDs.roles.purplePlus}>`,
        `<:VC_7:1482706523330183218> <@&${IDs.roles.pinkPlus}>`,
        `<:VC_8:1482706553281708092> <@&${IDs.roles.blackPlus}>`,
        `<:VC_9:1482706583438889051> <@&${IDs.roles.grayPlus}>`,
        `<:VC_10:1482706613663174707> <@&${IDs.roles.whitePlus}>`,
        `<:VC_2:1482706376525611090> <@&${IDs.roles.orangeBlackPlus}> — livello **120**`,
        `<:VC_4:1482706432347344916> <@&${IDs.roles.greenBlackPlus}> — livello **150**`,
        `<:VC_5:1482706459765637272> <@&${IDs.roles.aquaBlackPlus}> — livello **200**`,
      ].join("\n"),
    )
  const pronouns = buildPronounsRow();
  const age = buildAgeRow();
  const region = buildRegionRow();
  const zodiacMenu = buildZodiacRow();
  const dmStatus = buildDmRow();
  const relationship = buildRelationshipRow();
  const mentionsMenu = buildMentionsRow();
  const colorsMenu = buildColors1Row();
  const plusColorsMenu = buildColorsPlusRow();

  const guildId = channel.guild?.id;
  if (!guildId) return;

  let panel = null;
  try {
    panel = await personalityPanelFindOneAndUpdate(
      { guildId, channelId: CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const updatePanel = async (personalityMessageId, dmPanelMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId) => {
    try {
      await personalityPanelUpdateOne(
        { guildId, channelId: CHANNEL_ID },
        { $set: { personalityMessageId, dmPanelMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId } },
      );
    } catch (err) {
      global.logger?.warn?.("[embeds] updatePanel:", err?.message || err);
    }
  };
  const personalityMessage = await upsertPanelMessage(channel, client, {
    messageId: panel?.personalityMessageId || null,
    embeds: [embed],
    components: [pronouns, age, zodiacMenu, region, relationship],
    files: attachment ? [attachment] : [],
    attachmentName: attachment ? IMAGE_NAME : undefined,
  });
  const mentionsMessage = await upsertPanelMessage(channel, client, {
    messageId: panel?.mentionsMessageId || null,
    embeds: [mentionsEmbed],
    components: [dmStatus, mentionsMenu],
    files: mentionsAttachment ? [mentionsAttachment] : [],
    attachmentName: mentionsAttachment ? MENTIONS_IMAGE_NAME : undefined,
  });
  const colorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.colorsMessageId || null, embeds: [colorsEmbed], components: [colorsMenu], files: colorsAttachment ? [colorsAttachment] : [], attachmentName: colorsAttachment ? COLORS_IMAGE_NAME : undefined });
  const plusColorsMessage = await upsertPanelMessage(channel, client, { messageId: panel?.plusColorsMessageId || null, embeds: [plusColorsEmbed], components: [plusColorsMenu], files: plusColorsAttachment ? [plusColorsAttachment] : [], attachmentName: plusColorsAttachment ? PLUS_COLORS_IMAGE_NAME : undefined });

  if (personalityMessage || mentionsMessage || colorsMessage || plusColorsMessage) {
    await updatePanel(
      personalityMessage?.id || panel?.personalityMessageId || null,
      null,
      mentionsMessage?.id || panel?.mentionsMessageId || null,
      colorsMessage?.id || panel?.colorsMessageId || null,
      plusColorsMessage?.id || panel?.plusColorsMessageId || null,
    );
  }
}

module.exports = { name: "ruoli", order: 10, section: "menu", run };