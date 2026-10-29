const path = require("path") as typeof import("path");
const fs = require("fs") as typeof import("fs");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { personalityPanelFindOneAndUpdate, personalityPanelUpdateOne } = require("../Utils/Global/globalSettingsGuildStores") as typeof import("../Utils/Global/globalSettingsGuildStores");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime") as typeof import("../../shared/discord/panelUpsertRuntime");
const { buildSiteVerifyOAuthStartUrl } = require("../Utils/Web/verifyOauthPublicUrl") as typeof import("../Utils/Web/verifyOauthPublicUrl");
const { siteTicketsPageDiscordRef } = require("../../shared/web/siteTicketsPageRef") as typeof import("../../shared/web/siteTicketsPageRef");
const { buildVcPagePayload } = require("../Utils/Embeds/vcPageEmbedV2") as typeof import("../Utils/Embeds/vcPageEmbedV2");
const { TENANT_EMBED_COLOR } = require("../MultiGuild/utils/tenantEmbedBranding") as typeof import("../MultiGuild/utils/tenantEmbedBranding");

const VERIFY_CHANNEL_ID = IDs.channels.verify;
const VERIFY_MEDIA_NAME = "verifica.gif";
const VERIFY_MEDIA_PATH = path.join(__dirname, "..", "Photos", VERIFY_MEDIA_NAME);
const VERIFY_OAUTH_IMAGE_NAME = "image0.jpg";
const VERIFY_OAUTH_IMAGE_PATH = path.join(__dirname, "..", "Photos", VERIFY_OAUTH_IMAGE_NAME);

function maybeAttachment(filePath?, fileName?, fallbackPath?, fallbackName?) {
  try {
    if (fs.existsSync(filePath)) return new AttachmentBuilder(filePath, { name: fileName });
    if (fallbackPath && fallbackName && fs.existsSync(fallbackPath)) {
      return new AttachmentBuilder(fallbackPath, { name: fallbackName });
    }
  } catch (_) {}
  return null;
}

function buildWebsiteVerifyUrl(guildId?) {
  return buildSiteVerifyOAuthStartUrl(guildId);
}

async function run(client?) {
  const channel = client.channels.cache.get(VERIFY_CHANNEL_ID) || (await getClientChannelCached(client, VERIFY_CHANNEL_ID));
  if (!channel?.isTextBased?.()) return;
  const guildId = channel.guild?.id;
  if (!guildId) return;

  const attachment = new AttachmentBuilder(VERIFY_MEDIA_PATH, { name: VERIFY_MEDIA_NAME });
  const serverName = channel.guild?.name || "this server";
  const color = client?.config?.embedVerify || TENANT_EMBED_COLOR;

  const verifyPanelAttachment = maybeAttachment(
    VERIFY_OAUTH_IMAGE_PATH,
    VERIFY_OAUTH_IMAGE_NAME,
    VERIFY_MEDIA_PATH,
    VERIFY_MEDIA_NAME,
  );

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

  const infoMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panelDoc?.verifyInfoMessageId || null,
      guildId,
      accentColor: TENANT_EMBED_COLOR,
      title: "<a:VC_HeartsPink:1468685897389052008> **__Benvenutx su Vinili & Caffè__**",
      body:
        "<:vegacheckmark:1443666279058772028> Per **verificarti** premi il pulsante **__`Verify`__**: si aprirà il flusso sul sito.\n" +
        "<:VC_Ticket:1482535175283019888> Per **qualsiasi** problema, non **esitate** ad aprire un **__" +
        siteTicketsPageDiscordRef("SUPPORTO") +
        "__**",
      mediaName: VERIFY_MEDIA_NAME,
      files: [attachment],
    }),
  );

  const panelMessage = await upsertPanelMessage(
    channel,
    client,
    buildVcPagePayload({
      messageId: panelDoc?.verifyPanelMessageId || null,
      guildId,
      accentColor: color,
      title: "<:verification:1461725843125571758> **`Verification Required!`**",
      body: [
        "<:VC_Space:1482459974667075685> <:alarm:1461725841451909183> **Per accedere a `" +
          serverName +
          "` devi prima verificarti.**",
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:rightSort:1461726104422453298> Clicca il pulsante **Verify** qui sotto per iniziare.",
        "<:VC_Space:1482459974667075685><:VC_Space:1482459974667075685> <:VC_Reply:1482532158080942191> Gli unici dati a cui avremo accesso saranno, come indicato direttamente da Discord, nome utente, avatar e banner del tuo profilo.",
      ].join("\n"),
      rows: [verifyRow],
      ...(verifyPanelAttachment
        ? { mediaName: verifyPanelAttachment.name, files: [verifyPanelAttachment] }
        : {}),
    }),
  );

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

export = { name: "verify", order: 40, section: "embedWithButtons", run };
