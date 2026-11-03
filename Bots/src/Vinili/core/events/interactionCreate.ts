const { InteractionType } = require("discord.js") as typeof import("discord.js");
const {
  handleAutocomplete,
  handleSlashCommand,
} = require("./interaction/commandHandlers") as typeof import("./interaction/commandHandlers");
const { handleButtonInteraction } = require("./interaction/buttonHandlers") as typeof import("./interaction/buttonHandlers");
const { handlePartnerModal } = require("../../Partner/discord/modals/partnerModal") as typeof import("../../Partner/discord/modals/partnerModal");
const { handleSanzionaModal } = require("../../Moderation/events/interaction/sanzionaHandlers") as typeof import("../../Moderation/events/interaction/sanzionaHandlers");
const { handleCustomRoleInteraction } = require("../../Community/events/interaction/customRoleHandlers") as typeof import("../../Community/events/interaction/customRoleHandlers");
const {
  acquireButtonSpamGuard,
  runPermissionGate,
} = require("./interaction/interactionRuntimeGuards") as typeof import("./interaction/interactionRuntimeGuards");
const { logInteractionError } = require("./interaction/interactionErrorHandler") as typeof import("./interaction/interactionErrorHandler");

export = {
  name: "interactionCreate",
  async execute(interaction?, client?) {
    if (!interaction) return;
    const resolvedClient = client || interaction.client;

    let releaseButtonGuard = null;

    try {
      const buttonGuard = acquireButtonSpamGuard(interaction, resolvedClient);
      releaseButtonGuard = buttonGuard.release;
      if (buttonGuard.blocked) {
        if (
          !interaction.replied &&
          !interaction.deferred &&
          (interaction.isButton?.() ||
            interaction.isStringSelectMenu?.() ||
            interaction.isUserSelectMenu?.() ||
            interaction.isChannelSelectMenu?.() ||
            interaction.isRoleSelectMenu?.())
        ) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }

      try {
        const topChannel = require("../../Stats/discord/buttons/topChannelHandler") as typeof import("../../Stats/discord/buttons/topChannelHandler");
        if (
          typeof topChannel.isTopChannelInteraction === "function" &&
          topChannel.isTopChannelInteraction(interaction) &&
          !interaction.replied &&
          !interaction.deferred
        ) {
          const id = String(interaction.customId || "");
          const isPageModalOpen =
            id === "top_channel_page_modal_open" || id.startsWith("top_channel_page_modal_open:");
          if (!isPageModalOpen) {
            await interaction.deferUpdate().catch(() => {});
          }
        }
      } catch (_) {}

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        await handleAutocomplete(interaction, resolvedClient);
        return;
      }

      if (interaction.isMessageContextMenuCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      if (interaction.isUserContextMenuCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      const isModal = Boolean(interaction.isModalSubmit?.());
      const isComponent =
        Boolean(interaction.isButton?.()) ||
        Boolean(interaction.isStringSelectMenu?.()) ||
        Boolean(interaction.isUserSelectMenu?.()) ||
        Boolean(interaction.isChannelSelectMenu?.()) ||
        Boolean(interaction.isRoleSelectMenu?.());

      if (isModal) {
        if (await handleSanzionaModal(interaction, resolvedClient)) return;
        if (await handlePartnerModal(interaction)) return;
        if (await handleCustomRoleInteraction(interaction)) return;
        if (await handleButtonInteraction(interaction, resolvedClient)) return;
        return;
      }

      if (isComponent) {
        if (await handleCustomRoleInteraction(interaction)) return;
        if (await handleButtonInteraction(interaction, resolvedClient)) return;
      }
    } catch (err) {
      await logInteractionError(interaction, resolvedClient, err);
    } finally {
      if (typeof releaseButtonGuard === "function") {
        releaseButtonGuard();
      }
    }
  },
};
