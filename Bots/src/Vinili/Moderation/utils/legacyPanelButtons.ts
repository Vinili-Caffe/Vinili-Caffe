const { applyDefaultFooterToEmbeds } = require("../../../shared/embeds/defaultFooter") as typeof import("../../../shared/embeds/defaultFooter");
const { PRIVATE_FLAG, logButtonErr } = require("./legacyPanelButtons/shared") as typeof import("./legacyPanelButtons/shared");
const { enforceInteractionPermissions } = require("./legacyPanelButtons/permissions") as typeof import("./legacyPanelButtons/permissions");
const { handleStaffButtons } = require("./legacyPanelButtons/moderationGuideButtons") as typeof import("./legacyPanelButtons/moderationGuideButtons");
const { handleLegacyPanelInfoButtons } = require("./legacyPanelButtons/panelInfoHandlers") as typeof import("./legacyPanelButtons/panelInfoHandlers");

export = {
  async execute(interaction?, client?) {
    if (!interaction.guild) return;
    if (!interaction.message) return;
    if (interaction.replied || interaction.deferred) return;
    const allowed = await enforceInteractionPermissions(interaction);
    if (!allowed) return;
    const levelPanelIds = ["info_boost_levels", "info_levels", "torna_indietro"];
    let levelPanelDeferred = false;
    if (interaction.isButton() && interaction.customId === "info_boost_levels") {
      const deferred = await interaction.deferReply({ flags: PRIVATE_FLAG }).catch((err?) => { logButtonErr(err); return null; });
      levelPanelDeferred = !!deferred && !!interaction.deferred;
    }
    const guild = interaction.guild;
    const withFooter = (p?) => (p && typeof p === "object" && Array.isArray(p.embeds) && p.embeds.length ? applyDefaultFooterToEmbeds(p, guild) : p);
    const origReply = interaction.reply.bind(interaction);
    interaction.reply = (p?) => origReply(withFooter(p));
    const origEditReply = interaction.editReply.bind(interaction);
    interaction.editReply = (p?) => origEditReply(withFooter(p));
    const origUpdate = interaction.update?.bind(interaction);
    if (origUpdate) interaction.update = (p?) => origUpdate(withFooter(p));
    if (await handleStaffButtons(interaction)) return;
    if (!interaction.isButton()) return;
    return handleLegacyPanelInfoButtons(interaction, { levelPanelDeferred, levelPanelIds, client });
  },
};
