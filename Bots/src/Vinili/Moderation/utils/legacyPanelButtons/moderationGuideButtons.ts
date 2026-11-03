const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { buildStaffGuideSectionMarkdown } = require("../../../Staff/utils/staffGuideContent") as typeof import("../../../Staff/utils/staffGuideContent");
const { buildModerationGuideStickyPayload, moderationGuideEmbedColor } = require("../moderationGuidePanelComponents") as typeof import("../moderationGuidePanelComponents");
const { PRIVATE_FLAG, logButtonErr } = require("./shared") as typeof import("./shared");

/* Guida staff Discord rimossa (solo sito). Restano sticky #sanzioni. */
async function handleStaffButtons(interaction?) {
  if (!interaction.isButton()) return false;

  /* Sticky sanzioni utenti (#sanzioni) — resta su Discord. */
  if (interaction.customId == "moderazione_staff" || interaction.customId == "regolamento") {
    const payload = buildModerationGuideStickyPayload();
    await interaction
      .reply({ embeds: payload.embeds, components: payload.components, flags: PRIVATE_FLAG })
      .catch((err?) => {
        logButtonErr(err);
        return null;
      });
    return true;
  }

  if (interaction.customId == "generalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("generalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "testualimoderazione") {
    const body = buildStaffGuideSectionMarkdown("testualimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  if (interaction.customId == "vocalimoderazione") {
    const body = buildStaffGuideSectionMarkdown("vocalimoderazione");
    const embed = new EmbedBuilder()
      .setColor(moderationGuideEmbedColor())
      .setDescription(body || "Sezione non disponibile.");
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
    return true;
  }

  return false;
}

export = { handleStaffButtons };
