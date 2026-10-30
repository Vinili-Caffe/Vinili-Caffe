const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores") as typeof import("../Utils/Global/globalSettingsGuildStores");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { buildPronounsRow, buildAgeRow, buildRegionRow, buildZodiacRow, buildRelationshipRow, buildDmRow, buildMentionsRow, buildColors1Row, buildColorsPlusRow } = require("../Utils/Community/ruoliColoriPanelComponents") as typeof import("../Utils/Community/ruoliColoriPanelComponents");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime") as typeof import("../../shared/discord/panelUpsertRuntime");
const { buildVcPagePayload } = require("../Utils/Embeds/vcPageEmbedV2") as typeof import("../Utils/Embeds/vcPageEmbedV2");
const { resolveBotPhotoMedia } = require("../Utils/Discord/botPhotosCdn") as typeof import("../Utils/Discord/botPhotosCdn");

const CHANNEL_ID = IDs.channels.ruoliColori;
const IMAGE_NAME = "personalità.gif";
const MENTIONS_IMAGE_NAME = "menzioni.gif";
const COLORS_IMAGE_NAME = "colori.gif";
const PLUS_COLORS_IMAGE_NAME = "coloriPlus.gif";

async function run(client?) {
  const channel = client.channels.cache.get(CHANNEL_ID) || (await getClientChannelCached(client, CHANNEL_ID));
  if (!channel) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;

  const pronouns = buildPronounsRow();
  const age = buildAgeRow();
  const region = buildRegionRow();
  const zodiacMenu = buildZodiacRow();
  const dmStatus = buildDmRow();
  const relationship = buildRelationshipRow();
  const mentionsMenu = buildMentionsRow();
  const colorsMenu = buildColors1Row();
  const plusColorsMenu = buildColorsPlusRow();

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

  const updatePanel = async (personalityMessageId?, dmPanelMessageId?, mentionsMessageId?, colorsMessageId?, plusColorsMessageId?) => {
    try {
      await personalityPanelUpdateOne(
        { guildId, channelId: CHANNEL_ID },
        { $set: { personalityMessageId, dmPanelMessageId, mentionsMessageId, colorsMessageId, plusColorsMessageId } },
      );
    } catch (err) {
      global.logger?.warn?.("[embeds] updatePanel:", err?.message || err);
    }
  };

  const personalityMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panel?.personalityMessageId || null,
      guildId,
      title: "<:sparkledred:1470064814502973591> Personalità",
      body: [
        `Scegli in cosa ti identifichi, quanti anni hai, segno zodiacale, stato sentimentale e di dove sei. Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.`,
        "",
        "<a:VC_Exclamation:1482534702077444217> Massimo **1** ruolo per categoria.",
      ].join("\n"),
      rows: [pronouns, age, zodiacMenu, region, relationship],
      ...resolveBotPhotoMedia(IMAGE_NAME),
    }),
  );

  const mentionsMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panel?.mentionsMessageId || null,
      guildId,
      title: "<:sparkledred:1470064814502973591> Menzioni",
      body: [
        `Scegli lo stato DM e quali notifiche ricevere dal server in base a cosa ti interessa maggiormente. Utilizza il menù a tendina sottostante. __Rimuovi i colori__ con la "<:vegax:1443934876440068179>" in alto.`,
        "",
        "<a:VC_Exclamation:1482534702077444217> Massimo **1** ruolo per categoria.",
      ].join("\n"),
      rows: [dmStatus, mentionsMenu],
      ...resolveBotPhotoMedia(MENTIONS_IMAGE_NAME),
    }),
  );

  const colorsMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panel?.colorsMessageId || null,
      guildId,
      title: "<:sparkledred:1470064814502973591> Colori",
      body: [
        "Scegli il colore per personalizzare il nome del tuo profilo quando scrivi in chat.",
        "",
        "<a:VC_Exclamation:1482534702077444217> Verrà mostrato il **colore più in alto** nella lista dei ruoli nel tuo profilo.",
      ].join("\n"),
      rows: [colorsMenu],
      ...resolveBotPhotoMedia(COLORS_IMAGE_NAME),
    }),
  );

  const plusColorsMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panel?.plusColorsMessageId || null,
      guildId,
      title: "<:sparkledred:1470064814502973591> Colori+",
      body: [
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
        `<:VC_1:1482706338021642333> <@&${IDs.roles.brownPlus}>`,
        `<:VC_2:1482706376525611090> <@&${IDs.roles.orangeBlackPlus}> — livello **120**`,
        `<:VC_4:1482706432347344916> <@&${IDs.roles.greenBlackPlus}> — livello **150**`,
        `<:VC_5:1482706459765637272> <@&${IDs.roles.aquaBlackPlus}> — livello **200**`,
      ].join("\n"),
      rows: [plusColorsMenu],
      ...resolveBotPhotoMedia(PLUS_COLORS_IMAGE_NAME),
    }),
  );

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

export = { name: "ruoli", order: 30, section: "embedWithButtons", run };
