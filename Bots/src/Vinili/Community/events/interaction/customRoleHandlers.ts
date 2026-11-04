/** Ruolo, vocale e reazioni personalizzati: si gestiscono dal sito (/personalizza/).
 *  Su Discord restano solo i DM di conferma (aggiunta al ruolo, richieste dal sito). */
const { getPendingRoleGrantByToken } = require("./customRolePending") as typeof import("./customRolePending");
const { createCustomRoleGrantRequest, createSiteRoleJoinRequest } = require("./customRoleRequests") as typeof import("./customRoleRequests");
const { handleGrantButtons, handleSiteRoleRequestButtons } = require("./customRoleGrants") as typeof import("./customRoleGrants");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const LEGACY_PANEL_PREFIXES = ["customrole_", "customvoc_", "customreaction_"];
const SITE_PERSONALIZZA_URL = "https://www.viniliecaffe.it/personalizza/";

/** Pulsanti/moduli dei vecchi pannelli Discord rimasti nei messaggi: rimanda al sito. */
async function handleLegacyPanelInteraction(interaction?) {
  const id = String(interaction?.customId || "");
  if (!LEGACY_PANEL_PREFIXES.some((p?) => id.startsWith(p))) return false;
  if (typeof interaction.reply !== "function") return false;
  await interaction
    .reply({
      content: `${E.VC_Attention} Ruolo, vocale e reazioni personalizzati ora si gestiscono dal sito: ${SITE_PERSONALIZZA_URL}`,
      flags: 1 << 6,
    })
    .catch(() => {});
  return true;
}

async function handleCustomRoleInteraction(interaction?) {
  if (await handleGrantButtons(interaction)) return true;
  if (await handleSiteRoleRequestButtons(interaction)) return true;
  if (await handleLegacyPanelInteraction(interaction)) return true;
  return false;
}

export = {
  handleCustomRoleInteraction,
  createCustomRoleGrantRequest,
  createSiteRoleJoinRequest,
  getPendingRoleGrantByToken,
};
