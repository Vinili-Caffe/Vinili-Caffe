const path = require("path");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const {
  isDiscordWorkflowUiEnabled,
  buildSiteLinkRow,
  siteWorkflowPath,
} = require("../Utils/Web/discordWorkflowUiGate");
const { buildVcPagePayload } = require("../Utils/Embeds/vcPageEmbedV2");
const CANDIDATURE_MEDIA_NAME = "candidature.gif";
const CANDIDATURE_MEDIA_PATH = path.join(__dirname, "..", "Photos", CANDIDATURE_MEDIA_NAME);

async function run(client) {
  const candidatureChannel =
    client.channels.cache.get(IDs.channels.candidatureStaff) ||
    (await getClientChannelCached(client, IDs.channels.candidatureStaff));
  const logPanels = String(process.env.LOG_PANELS || "0") === "1";
  if (!candidatureChannel?.isTextBased?.()) {
    if (logPanels) {
      global.logger.warn(
        "[CLIENT READY] Candidature panel channel missing/unusable:",
        IDs.channels.candidatureStaff,
      );
    }
    return;
  }
  const discordUi = isDiscordWorkflowUiEnabled();
  const body = discordUi
    ? `<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**.
> <:5751attentionfromvega:1443651874032062505> Per **candidarti** dovrai __cliccare__ il bottone in base al **ruolo** che vuoi __ricoprire__

Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
<:1_:1444099163116535930> Avere almeno **__14 anni__**
<:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
<:3_:1444099160294031471> Essere **maturi** e **attivi**
<:4_:1444099158859321435> Non essere mai stato **sanzionato** nel server.`
    : `<:7871discordstaff:1443651872258003005> Su **__Vinili & Caffè__** ci si può candidare a **__\`2\`__** _ruoli_: **__\`Helper\`__** e **__\`Partner Manager\`__**.
> <:5751attentionfromvega:1443651874032062505> Le candidature si inviano **solo dal sito** (link qui sotto).

Per candidarsi, è necessario **soddisfare** i seguenti __requisiti__:
<:1_:1444099163116535930> Avere almeno **__14 anni__**
<:2_:1444099161673826368> Rispettare i **[ToS](https://discord.com/terms)** e le **[Linee Guida](https://discord.com/guidelines)** di **Discord**
<:3_:1444099160294031471> Essere **maturi** e **attivi**
<:4_:1444099158859321435> Non essere mai stato **sanzionato** nel server.`;

  const candidatureAttachment = new AttachmentBuilder(CANDIDATURE_MEDIA_PATH, {
    name: CANDIDATURE_MEDIA_NAME,
  });
  const infoPaid = new ButtonBuilder()
    .setLabel("︲STAFF PAGATO")
    .setEmoji("<:partneredserverowner:1443651871125409812>")
    .setStyle(ButtonStyle.Secondary)
    .setCustomId("candidature_premi_partner");
  const rowCandidature = discordUi
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel("︲HELPER")
          .setEmoji("<:VC_Helper:1502328751638450426>")
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("apply_helper"),
        new ButtonBuilder()
          .setLabel("︲PARTNER MANAGER")
          .setEmoji("<:VC_PartnerManager:1494286911286808576>")
          .setStyle(ButtonStyle.Secondary)
          .setCustomId("apply_partnermanager"),
        infoPaid,
      )
    : (() => {
        const linkRow = buildSiteLinkRow("Candidati sul sito", siteWorkflowPath("candidature"));
        return new ActionRowBuilder().addComponents(...linkRow.components, infoPaid);
      })();

  await upsertPanelMessage(
    candidatureChannel,
    client,
    buildVcPagePayload({
      guildId: candidatureChannel.guild?.id,
      title: "Candidature staff",
      body,
      mediaName: CANDIDATURE_MEDIA_NAME,
      files: [candidatureAttachment],
      rows: [rowCandidature],
    }),
  );
}

module.exports = { name: "candidature", order: 10, section: "embedWithButtons", run };
