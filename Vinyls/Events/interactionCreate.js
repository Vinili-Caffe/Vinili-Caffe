const { InteractionType } = require("discord.js");
const{handleAutocomplete,handleSlashCommand,}=require("./interaction/commandHandlers");
const { handleButtonInteraction } = require("./interaction/buttonHandlers");
const { handlePartnerModal } = require("./interaction/partnerModal");
const { handleDmBroadcastModal } = require("./interaction/dmBroadcastModal");
const { handleVerifyInteraction } = require("./interaction/verifyHandlers");
const { handleCustomRoleInteraction } = require("./interaction/customRoleHandlers");
const{acquireButtonSpamGuard,runPermissionGate,}=require("../Utils/Interaction/interactionRuntimeGuards");
const{logInteractionError,}=require("../Utils/Interaction/interactionErrorHandler");

function extractProfilePanelOwnerIdFromMessage(message) {
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

function extractProfileSectionFromMessage(message) {
  const rows = Array.isArray(message?.components) ? message.components : [];
  for (const row of rows) {
    const comps = Array.isArray(row?.components) ? row.components : [];
    for (const comp of comps) {
      const customId = String(comp?.customId || "");
      if (!customId.startsWith("profile_panel:select:")) continue;
      const options = Array.isArray(comp?.options) ? comp.options : [];
      const selected = options.find((opt) => opt?.default === true);
      const value = String(selected?.value || "");
      if (value) return value;
    }
  }
  return "home";
}

async function refreshProfilePanelIfPresent(interaction, client) {
  const msg = interaction?.message;
  if (!msg?.edit || !interaction?.guild) return;
  const ownerId = extractProfilePanelOwnerIdFromMessage(msg);
  if (!ownerId) return;
  const section = extractProfileSectionFromMessage(msg);
  const profileButton = require("../Buttons/profile");
  const payload = await profileButton
    .buildPanelPayload(interaction.guild, ownerId, client, section)
    .catch(() => null);
  if (!payload) return;
  await msg.edit(payload).catch(() => {});
}

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
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
          (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isUserSelectMenu?.())
        ) {
          await interaction.deferUpdate().catch(() => {});
        }
        return;
      }

      if (await handleVerifyInteraction(interaction)) return;
      if (await handleDmBroadcastModal(interaction, resolvedClient)) return;

      if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
        await handleAutocomplete(interaction, resolvedClient);
        return;
      }

      if (interaction.isMessageContextMenuCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      if (interaction.isChatInputCommand?.()) {
        await handleSlashCommand(interaction, resolvedClient);
        return;
      }

      const allowedByGate = await runPermissionGate(interaction);
      if (!allowedByGate) return;

      if (await handlePartnerModal(interaction)) return;
      if (await handleCustomRoleInteraction(interaction)) {
        await refreshProfilePanelIfPresent(interaction, resolvedClient);
        return;
      }
      if (await handleButtonInteraction(interaction, resolvedClient)) return;
    } catch (err) {
      await logInteractionError(interaction, resolvedClient, err);
    } finally {
      if (typeof releaseButtonGuard === "function") {
        releaseButtonGuard();
      }
    }
  },
};