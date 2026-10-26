const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { buildStaffGuideMenuRow } = require("../Utils/Staff/staffGuideMenuComponents");
const { upsertPanelMessage } = require("../../shared/discord/panelUpsertRuntime");
const { DEFAULT_FOOTER_TEXT } = require("../Utils/Embeds/defaultFooter");
const { buildVcPagePayload } = require("../Utils/Embeds/vcPageEmbedV2");

function buildStaffGuideBody() {
  const ch = IDs.channels;
  return [
    "<:discordstaff:1443651872258003005> La **guida staff** è il manuale ufficiale di **Vinili & Caffè**: qui trovi regole, obiettivi di attività, procedure di moderazione e criteri di carriera.",
    "",
    "<a:VC_Alert:1482706673176150077> Ogni membro dello staff deve **conoscerla e rispettarla**. In caso di violazioni si possono ricevere **valutazioni negative**, **warn staff** e, nei casi più gravi, il **depex**.",
    "",
    "> <a:VC_Rule:1482706839928967280> Apri una sezione dal **menu qui sotto** per leggere il capitolo completo.",
    "",
    "### <:VC_Attention:1482534443632558151> Canali e sito di riferimento",
    `<:VC_Dot:1482532364222595303> Sanzioni utenti: <#${ch.sanzioniUtenti}>`,
    `<:VC_Dot:1482532364222595303> Pause / profilo / organico: sul **sito staff**`,
    `<:VC_Dot:1482532364222595303> Valutazioni / warn / organico: sul **sito staff**`,
  ].join("\n");
}

function buildStaffGuidePanelPayload(extra = {}) {
  return {
    ...buildVcPagePayload({
      guildId: String(IDs.guilds?.main || ""),
      title: "Guida staff",
      body: buildStaffGuideBody(),
      footer: DEFAULT_FOOTER_TEXT,
      rows: [buildStaffGuideMenuRow()],
      includeBanner: false,
    }),
    ...extra,
  };
}

/** @deprecated classic — prefer buildStaffGuidePanelPayload (V2) */
function buildStaffGuideEmbed() {
  const { EmbedBuilder } = require("discord.js");
  return new EmbedBuilder()
    .setColor("#826bc2")
    .setDescription(buildStaffGuideBody())
    .setFooter({ text: DEFAULT_FOOTER_TEXT });
}

async function run(client) {
  const guideChannel =
    client.channels.cache.get(IDs.channels.guidaStaff) ||
    (await getClientChannelCached(client, IDs.channels.guidaStaff));
  if (guideChannel?.isTextBased?.()) {
    await upsertPanelMessage(guideChannel, client, buildStaffGuidePanelPayload());
  }
}

module.exports = {
  name: "staff",
  order: 30,
  section: "embedWithButtons",
  run,
  buildStaffGuideEmbed,
  buildStaffGuidePanelPayload,
};
