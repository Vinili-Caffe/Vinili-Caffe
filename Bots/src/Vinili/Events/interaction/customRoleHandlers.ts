
const { getPendingRoleGrantByToken } = require("./customRolePending") as typeof import("./customRolePending");
const { createCustomRoleGrantRequest, createSiteRoleJoinRequest } = require("./customRoleRequests") as typeof import("./customRoleRequests");
const { clearProfilePrompt, cancelProfilePrompt, handleCustomProfilePromptMessage } = require("./customRoleProfilePrompt") as typeof import("./customRoleProfilePrompt");
const { handleRoleActionButton, handleRoleColorTypeSelect } = require("./customRoleActions") as typeof import("./customRoleActions");
const { handleRoleActionModal } = require("./customRoleModal") as typeof import("./customRoleModal");
const { handleAddRemoveSelectMenus } = require("./customRoleSelects") as typeof import("./customRoleSelects");
const { handleCustomReactionButton, handleCustomReactionModal, handleCustomReactionSelect } = require("./customReactionHandlers") as typeof import("./customReactionHandlers");
const { handleCustomVocButton, handleCustomVocModal } = require("./customVocHandlers") as typeof import("./customVocHandlers");
const { handleGrantButtons, handleSiteRoleRequestButtons } = require("./customRoleGrants") as typeof import("./customRoleGrants");


async function handleCustomRoleInteraction(interaction?) {
  if (await handleCustomReactionButton(interaction)) return true;
  if (await handleCustomReactionModal(interaction)) return true;
  if (await handleCustomReactionSelect(interaction)) return true;
  if (await handleCustomVocButton(interaction)) return true;
  if (await handleCustomVocModal(interaction)) return true;
  if (await handleAddRemoveSelectMenus(interaction)) return true;
  if (await handleGrantButtons(interaction)) return true;
  if (await handleSiteRoleRequestButtons(interaction)) return true;
  if (await handleRoleColorTypeSelect(interaction)) return true;
  if (await handleRoleActionButton(interaction)) return true;
  if (await handleRoleActionModal(interaction)) return true;
  return false;
}

export = {
  handleCustomRoleInteraction,
  handleCustomProfilePromptMessage,
  createCustomRoleGrantRequest,
  createSiteRoleJoinRequest,
  getPendingRoleGrantByToken,
  clearProfilePrompt,
  cancelProfilePrompt,
};