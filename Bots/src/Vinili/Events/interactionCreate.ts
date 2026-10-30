const { InteractionType } = require("discord.js") as typeof import("discord.js");
const{handleAutocomplete,handleSlashCommand,}=require("./interaction/commandHandlers") as typeof import("./interaction/commandHandlers");
const { handleButtonInteraction } = require("./interaction/buttonHandlers") as typeof import("./interaction/buttonHandlers");
const { handlePartnerModal } = require("./interaction/partnerModal") as typeof import("./interaction/partnerModal");
const { handlePartnerPointContextModal } = require("./interaction/partnerPointContextHandlers") as typeof import("./interaction/partnerPointContextHandlers");
const { handleSanzionaModal } = require("./interaction/sanzionaHandlers") as typeof import("./interaction/sanzionaHandlers");
const { handleCustomRoleInteraction } = require("./interaction/customRoleHandlers") as typeof import("./interaction/customRoleHandlers");
const{acquireButtonSpamGuard,runPermissionGate,}=require("../Utils/Interaction/interactionRuntimeGuards") as typeof import("../Utils/Interaction/interactionRuntimeGuards");
const{logInteractionError,}=require("../Utils/Interaction/interactionErrorHandler") as typeof import("../Utils/Interaction/interactionErrorHandler");

function extractProfilePanelOwnerIdFromMessage(message?) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const comp of comps) {
      const customId = String(comp?.customId || "");
      if (!customId.startsWith("profile_panel:select:")) continue;
      const parts = customId.split(":");
      const ownerId = String(parts[2] || "");
      if (/^\d{16,20}$/.test(ownerId)) return ownerId;
    }
  }
  return null;
}

function extractProfileSectionFromMessage(message?) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const comp of comps) {
      const customId = String(comp?.customId || "");
      if (!customId.startsWith("profile_panel:select:")) continue;
      const options = Array.isArray(comp?.options) ? comp.options : [];
      const selected = options.find((opt?) => opt?.default === true);
      const value = String(selected?.value || "");
      if (value) return value;
    }
  }
  return "home";
}

async function refreshProfilePanelIfPresent(interaction?, client?) {
  const { isDiscordProfileEnabled } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
  if (!isDiscordProfileEnabled()) return;
  const msg = interaction?.message;
  if (!msg?.edit || !interaction?.guild) return;
  const ownerId = extractProfilePanelOwnerIdFromMessage(msg);
  if (!ownerId) return;
  const section = extractProfileSectionFromMessage(msg);
  const profileButton = require("../Buttons/profile") as typeof import("../Buttons/profile");
  const payload = await profileButton
    .buildPanelPayload(interaction.guild, ownerId, client, section)
    .catch(() => null);
  if (!payload) return;
  await msg.edit(payload).catch(() => {});
}

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
          (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.() || interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.())
        ) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }

            try {
        const topChannel = require("../Buttons/topChannelHandler") as typeof import("../Buttons/topChannelHandler");
        if (
          typeof topChannel.isTopChannelInteraction === "function" &&
          topChannel.isTopChannelInteraction(interaction) &&
          !interaction.replied &&
          !interaction.deferred
        ) {
                    const id = String(interaction.customId || "");
          const isPageModalOpen = id === "top_channel_page_modal_open" || id.startsWith("top_channel_page_modal_open:");
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

      /* perfP2: non passare i modal handler su ogni click bottone */
      const isModal = Boolean(interaction.isModalSubmit?.());
      const isComponent =
        Boolean(interaction.isButton?.()) ||
        Boolean(interaction.isStringSelectMenu?.()) ||
        Boolean(interaction.isUserSelectMenu?.()) ||
        Boolean(interaction.isChannelSelectMenu?.()) ||
        Boolean(interaction.isRoleSelectMenu?.());

      if (isModal) {
        if (await handleSanzionaModal(interaction, resolvedClient)) return;
        if (await handlePartnerPointContextModal(interaction)) return;
        if (await handlePartnerModal(interaction)) return;
        if (await handleCustomRoleInteraction(interaction)) {
          await refreshProfilePanelIfPresent(interaction, resolvedClient);
          return;
        }
        if (await handleButtonInteraction(interaction, resolvedClient)) return;
        return;
      }

      if (isComponent) {
        if (await handleCustomRoleInteraction(interaction)) {
          await refreshProfilePanelIfPresent(interaction, resolvedClient);
          return;
        }
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