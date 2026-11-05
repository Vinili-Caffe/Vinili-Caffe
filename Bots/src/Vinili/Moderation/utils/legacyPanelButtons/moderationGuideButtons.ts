const { PRIVATE_FLAG, logButtonErr } = require("./shared") as typeof import("./shared");
const { siteWorkflowUrl } = require("../../../site/http/discordWorkflowUiGate") as typeof import("../../../site/http/discordWorkflowUiGate");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");

const GUIDE_BUTTON_IDS = new Set([
  "moderazione_staff",
  "regolamento",
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "sanzioni",
]);

/* Guida sanzioni solo sul sito (sticky Discord rimosso). */
async function handleStaffButtons(interaction?) {
  if (!interaction.isButton()) return false;
  if (!GUIDE_BUTTON_IDS.has(String(interaction.customId || ""))) return false;

  const url = siteWorkflowUrl("guida");
  await interaction
    .reply({
      content: `${E.VC_Info} La guida sanzioni è **solo sul sito**:\n${url}`,
      flags: PRIVATE_FLAG,
    })
    .catch((err?) => {
      logButtonErr(err);
      return null;
    });
  return true;
}

export = { handleStaffButtons };
