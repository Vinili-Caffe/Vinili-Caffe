const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores") as typeof import("../Utils/Global/globalSettingsGuildStores");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const INFO_CHANNEL_ID = IDs.channels.info;
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime") as typeof import("../../shared/discord/panelUpsertRuntime");
const { siteTicketsPageDiscordRef, siteUserProfilePageDiscordRef } = require("../../shared/web/siteTicketsPageRef") as typeof import("../../shared/web/siteTicketsPageRef");
const { buildVcPagePayload } = require("../Utils/Embeds/vcPageEmbedV2") as typeof import("../Utils/Embeds/vcPageEmbedV2");
const { botPhotoCdnUrl } = require("../Utils/Discord/botPhotosCdn") as typeof import("../Utils/Discord/botPhotosCdn");
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
    "<a:VC_HeartsBlue:1468686100045369404> Benvenuto/a su **Vinili & Caffè**, l'unico server in Italia non tossico e __incentrato sulla socializzazione__.",
    "",
    "<a:VC_HeartBlue:1448673354751021190> **Personalizza il tuo profilo:**",
    `<:VC_Reply:1482532158080942191> Dal ${siteUserProfilePageDiscordRef()} potrai selezionare i ruoli e il colore da aggiungere al tuo profilo per completarlo: come età, menzioni, passioni e molto altro!`,
    "",
    `Dubbi o problemi? Apri un ${siteTicketsPageDiscordRef("SUPPORTO")}: lo staff vi risponderà il prima possibile!`,
  ].join("\n");
  const infoGuildTagsText = [
    "<:VC_Femboy1:1528177995095867515><:VC_Femboy2:1528178060581671084> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/E6vrm5zE6B>",
    "<:VC_666_1:1528177848890691684><:VC_666_2:1528177905404870828> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/QnTN5P578g>",
    "<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/WMuZ4EMAkc>",
    "<:VC_Cat1:1528177482807640125><:VC_Cat2:1528177684843073546> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/uqUNS9f5m5>",
    "<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/SzBwnxHXNv>",
    "<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937> <a:VC_Arrow:1482706699365257397> <https://discord.com/invite/z3EXtJwvQH>",
  ].join("\n");
  const infoLinksText = [
    "<:VC_Instagram:1482526710426767360> [Seguici su Instagram](https://www.instagram.com/viniliecaffe/)",
    "<:VC_TikTok:1498017166060949525> [Seguici su TikTok](https://www.tiktok.com/@viniliecaffe)",
    "<:VC_Link:1482460590894088222> [Sito Ufficiale](https://www.viniliecaffe.it/)",
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
      .setLabel("︲PERKS")
      .setEmoji("<:VC_PurpleFlower:1469463879149944943>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/perks"),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("︲CANDIDATURE")
      .setEmoji("<:VC_Collab:1482534540089098260>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/candidature"),
    new ButtonBuilder()
      .setLabel("︲TICKETS")
      .setEmoji("<:VC_Ticket:1482535175283019888>")
      .setStyle(ButtonStyle.Link)
      .setURL("https://viniliecaffe.it/tickets"),
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
      { heading: "<:VC_Firework:1470796227913322658> LE NOSTRE GUILD TAGS", body: infoGuildTagsText },
      { heading: "<:VC_Link:1482460590894088222> Links", body: infoLinksText },
      { heading: "<:VC_Info:1482526956703580372> Informazioni", body: infoMetaText },
    ],
    footer: "Usa i bottoni sottostanti per accedere ad altre categorie del server.",
    mediaUrl: botPhotoCdnUrl(INFO_MEDIA_NAME),
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
