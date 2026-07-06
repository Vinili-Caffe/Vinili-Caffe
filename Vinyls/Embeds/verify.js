const path = require("path");
const fs = require("fs");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { buildSiteVerifyOAuthStartUrl } = require("../Utils/Web/verifyOauthPublicUrl");

const VERIFY_CHANNEL_ID = IDs.channels.verify;
const VERIFY_MEDIA_NAME = "verifica.gif";
const VERIFY_MEDIA_PATH = path.join(__dirname, "..", "Photos", VERIFY_MEDIA_NAME);
const VERIFY_OAUTH_IMAGE_NAME = "image0.jpg";
const VERIFY_OAUTH_IMAGE_PATH = path.join(__dirname, "..", "Photos", VERIFY_OAUTH_IMAGE_NAME);
const { DIVIDER_URL } = require("../../shared/discord/constants");

function maybeAttachment(filePath, fileName, fallbackPath, fallbackName) {
  try {
    if (fs.existsSync(filePath)) return new AttachmentBuilder(filePath, { name: fileName });
    if (fallbackPath && fallbackName && fs.existsSync(fallbackPath)) {
      return new AttachmentBuilder(fallbackPath, { name: fallbackName });
    }
  } catch (_) {}
  return null;
}

function buildWebsiteVerifyUrl(guildId) {
  return buildSiteVerifyOAuthStartUrl(guildId);
}

async function run(client) {
  const channel = client.channels.cache.get(VERIFY_CHANNEL_ID) || (await getClientChannelCached(client, VERIFY_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;

  const attachment = new AttachmentBuilder(VERIFY_MEDIA_PATH, { name: VERIFY_MEDIA_NAME });
  const serverName = channel.guild?.name || "this server";

  const verifyInfoEmbed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_HeartsPink:1468685897389052008> **__Benvenutx su Vinili & Caffè__**")
    .setDescription(
      "<:vegacheckmark:1443666279058772028> Per **verificarti** premi il pulsante **__`Verify`__**: si aprirà il flusso sul sito.\n" +
      "<:VC_Ticket:1482535175283019888> Per **qualsiasi** problema, non **esitate** ad aprire un **__<#1442569095068254219> `SUPPORTO`__**",
    )

  const color = client?.config?.embedVerify || "#6f4e37";
  const verifyPanelEmbed = new EmbedBuilder()
    .setColor(color)
    .setTitle("<:verification:1461725843125571758> **`Verification Required!`**")
    .setDescription(
      "<:VC_Space:1482459974667075685> <:alarm:1461725841451909183> **Per accedere a `" +
        serverName +
        "` devi prima verificarti.**\n" +
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.\n" +
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:VC_Reply:1482532158080942191> Gli unici dati a cui avremo accesso saranno, come indicato direttamente da Discord, nome utente, avatar e banner del tuo profilo.",
    );

  const verifyPanelAttachment = maybeAttachment(
    VERIFY_OAUTH_IMAGE_PATH,
    VERIFY_OAUTH_IMAGE_NAME,
    VERIFY_MEDIA_PATH,
    VERIFY_MEDIA_NAME,
  );
  if (verifyPanelAttachment) {
    verifyPanelEmbed.setImage(`attachment://${verifyPanelAttachment.name}`);
  }

  const verifyRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(buildWebsiteVerifyUrl(guildId))
      .setEmoji(`<a:VC_Verified:1482532479637127188>`)
      .setLabel("︲VERIFY"),
  );

  let panelDoc = null;
  try {
    panelDoc = await personalityPanelFindOneAndUpdate(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      { $setOnInsert: { guildId, channelId: VERIFY_CHANNEL_ID } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[embeds] ", err?.message || err);
  }

  const infoMessage = await upsertPanelMessage(channel, client, { messageId: panelDoc?.verifyInfoMessageId || null, files: [attachment], embeds: [verifyInfoEmbed], components: [], attachmentName: VERIFY_MEDIA_NAME });
  const panelMessage = await upsertPanelMessage(channel, client, {
    messageId: panelDoc?.verifyPanelMessageId || null,
    embeds: [verifyPanelEmbed],
    ...(verifyPanelAttachment ? { files: [verifyPanelAttachment], attachmentName: verifyPanelAttachment.name } : {}),
    components: [verifyRow],
  });

  if (infoMessage?.id || panelMessage?.id) {
    await personalityPanelUpdateOne(
      { guildId, channelId: VERIFY_CHANNEL_ID },
      {
        $set: {
          verifyInfoMessageId: infoMessage?.id || panelDoc?.verifyInfoMessageId || null,
          verifyPanelMessageId: panelMessage?.id || panelDoc?.verifyPanelMessageId || null,
        },
      },
    ).catch(() => {});
  }
}

module.exports = { name: "verify", order: 40, section: "embedWithButtons", run };