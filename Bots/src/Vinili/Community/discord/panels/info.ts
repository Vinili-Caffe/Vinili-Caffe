const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../../services/globalSettingsGuildStores") as typeof import("../../services/globalSettingsGuildStores");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const INFO_CHANNEL_ID = IDs.channels.info;
const { getClientChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { upsertPanelMessage } = require("../../../../shared/discord/panelUpsertRuntime") as typeof import("../../../../shared/discord/panelUpsertRuntime");
const { siteTicketsPageDiscordRef, siteUserProfilePageDiscordRef } = require("../../../../shared/web/siteTicketsPageRef") as typeof import("../../../../shared/web/siteTicketsPageRef");
const { buildVcPagePayload } = require("../../../../shared/embeds/vcPageEmbedV2") as typeof import("../../../../shared/embeds/vcPageEmbedV2");
const { resolveBotPhotoMedia } = require("../../../../shared/discord/botPhotosCdn") as typeof import("../../../../shared/discord/botPhotosCdn");
const INFO_MEDIA_NAME = "info.gif";

async function deleteMessageIfPresent(channel?, messageId?) {
  const mid = String(messageId || "").trim();
  if (!mid || !channel?.messages?.fetch) return;
  const msg = await channel.messages.fetch(mid).catch(() => null);
  if (msg) await msg.delete().catch(() => null);
}

async function run(client?) {
  const channel = await getClientChannelCached(client, INFO_CHANNEL_ID);
  if (!channel?.isTextBased?.()) {
    global.logger?.warn?.("[embeds] info: channel missing or not text");
    return;
  }
  const infoIntroText = [
    `${E.VC_HeartsBlue} Benvenut* su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.`,
    "",
    `${E.VC_HeartBlue} **Personalizza il tuo profilo:**`,
    `${E.VC_Reply} Dalla pagina [PERSONALIZZA](https://viniliecaffe.it/personalizza) potrai selezionare i ruoli e il colore da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!`,
    "",
    `Dubbi o problemi? Apri un ${siteTicketsPageDiscordRef("SUPPORTO")}: lo staff vi risponderà il prima possibile!`,
  ].join("\n");
  const infoLinksText = [
    `${E.VC_Instagram} [Seguici su Instagram](https://www.instagram.com/viniliecaffe/)`,
    `${E.VC_TikTok} [Seguici su TikTok](https://www.tiktok.com/@viniliecaffe)`,
    `${E.VC_Link} [Sito Ufficiale](https://www.viniliecaffe.it/)`,
  ].join("\n");
  const infoMetaText = [
    `${E.exp} Owner: <@295500038401163264>`,
    `${E.moon} Fondazione: ||<t:1765382400:F>||`,
    `${E.nitroboost} Invite: https://discord.gg/viniliecaffe`,
  ].join("\n");
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("︲REGOLAMENTO")
      .setEmoji(E.VC_Rule)
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/regole"),
    new ButtonBuilder()
      .setLabel("︲DONAZIONI")
      .setEmoji(E.VC_Sparkles)
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/donazioni"),
    new ButtonBuilder()
      .setLabel("︲SPONSOR")
      .setEmoji(E.pinnednew)
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/sponsor")
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
    .setLabel("︲PERKS")
    .setEmoji(E.VC_PurpleFlower)
    .setStyle(ButtonStyle.Link)
    .setURL("https://viniliecaffe.it/perks"),
    new ButtonBuilder()
      .setLabel("︲CANDIDATURE")
      .setEmoji(E.VC_Collab)
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/candidature"),
    new ButtonBuilder()
      .setLabel("︲TICKETS")
      .setEmoji(E.VC_Ticket)
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/tickets")
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

  const primaryId = String(panel?.infoMessageId1 || "").trim();
  const orphanIds = [
    ...new Set(
      [panel?.infoGifMessageId, panel?.infoMessageId2]
        .map((v?) => String(v || "").trim())
        .filter((id?) => id && id !== primaryId),
    ),
  ];
  for (const mid of orphanIds) {
    await deleteMessageIfPresent(channel, mid);
  }

  const payload = buildVcPagePayload({
    messageId: primaryId || null,
    guildId,
    title: "Ti diamo il benvenuto nella nostra community!",
    body: infoIntroText,
    sections: [
      { heading: `${E.VC_Link} Links`, body: infoLinksText },
      { heading: `${E.VC_Info} Informazioni`, body: infoMetaText },
    ],
    footer: "Usa i bottoni sottostanti per accedere ad altre categorie del server.",
    ...resolveBotPhotoMedia(INFO_MEDIA_NAME),
    rows: [row1, row2],
    includeBanner: false,
  });

  const panelMessage = await upsertPanelMessage(channel, client, payload);

  if (!panelMessage?.id) {
    global.logger?.error?.("[embeds] info: upsert failed");
    return;
  }

  await personalityPanelUpdateOne(
    { guildId, channelId: INFO_CHANNEL_ID },
    {
      $set: {
        infoGifMessageId: null,
        infoMessageId1: panelMessage.id,
        infoMessageId2: null,
      },
    },
  ).catch((err?) => {
    global.logger?.warn?.("[embeds] info panel id save failed:", err?.message || err);
  });
}

export = { name: "info", order: 20, section: "embedWithButtons", run };
