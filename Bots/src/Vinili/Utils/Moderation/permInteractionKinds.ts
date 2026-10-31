/** Permessi: riconoscimento del tipo di interazione (ticket, backup, profilo, ruoli, candidature). */
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const { parseProfilePanelOwnerIdFromCustomId, resolveProfilePanelControl } = require("../Community/profilePanelControl") as typeof import("../Community/profilePanelControl");

const CANDIDATURE_BLACKLIST_ROLE_ID = String(
  IDs?.roles?.blacklistModuli || "1463248874725576879",
).trim();

const TICKET_INTERACTION_IDS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_perks",
  "ticket_supporto",
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_confirm",
  "close_ticket_cancel",
  "close_ticket_motivo",
  "ticket_open_menu",
  "ticket_panel_add_member",
  "ticket_panel_remove_member",
  "ticket_panel_transfer_user",
  "ticket_panel_switch_category",
  "ticket_panel_nav_add",
  "ticket_panel_nav_remove",
  "ticket_panel_nav_switch",
  "ticket_panel_nav_rename",
  "ticket_panel_nav_closerequest",
  "ticket_panel_nav_transfer",
  "ticket_panel_reopen_pick",
  "ticket_panel_reopen_search",
  "ticket_panel_reopen_prev",
  "ticket_panel_reopen_next",
  "ticket_panel_reopen_close",
  "modal_ticket_panel_rename",
  "modal_ticket_panel_closerequest",
  "modal_ticket_panel_reopen_search",
]);
function isBackupInteraction(customId?) {
  const id = String(customId || "").trim();
  if (!id) return false;
  return (
    id.startsWith("backup_") ||
    id.startsWith("backup-load_") ||
    id.startsWith("backup_list_")
  );
}
function isTicketInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id.startsWith("pm_shop_ack:")) return true;
  if (id.startsWith("tkp:")) return true;
  if (TICKET_INTERACTION_IDS.has(id)) return true;
  if (id.startsWith("modal_close_ticket"))
    return true;
  if (
    id.startsWith("ticket_panel_add_member:") ||
    id.startsWith("ticket_panel_remove_member:") ||
    id.startsWith("ticket_panel_switch_category:") ||
    id.startsWith("ticket_panel_transfer_user:")
  )
    return true;
  return false;
}

function isProfilePanelInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  return String(customId).trim().startsWith("profile_panel:") || String(customId).trim().startsWith("staff_profile_panel:") || String(customId).trim().startsWith("staff_pm_shop:") || String(customId).trim().startsWith("staff_val_neg_trade:");
}

function checkTenantProfilePanelPermission(interaction?, customId?) {
  const id = String(customId || "");
  if (!id.startsWith("tprof:")) return null;
  const parts = id.split(":");
  const ownerId = String(parts[3] || "");
  if (!/^\d{16,20}$/.test(ownerId)) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  const ok = String(interaction?.user?.id || "") === ownerId;
  return {
    allowed: ok,
    reason: ok ? null : "tenant_profile_not_owner",
    requiredRoles: null,
    ownerId: ok ? null : ownerId,
  };
}

async function checkProfilePanelControlPermission(interaction?, customId?) {
  const id = String(customId || "");
  if (!id.startsWith("profile_panel:")) return null;
  const control = await resolveProfilePanelControl(interaction);
  if (control.ok) {
    return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
  }
  return {
    allowed: false,
    reason: "not_owner",
    requiredRoles: null,
    ownerId: control.ownerId || parseProfilePanelOwnerIdFromCustomId(id) || null,
  };
}

function isCustomRoleSystemInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (!id) return false;
  return (
    id.startsWith("customrole_") ||
    id.startsWith("customvoc_") ||
    id.startsWith("customreaction_") ||
    id.startsWith("siterolerequest:")
  );
}

function isApplyOrCandidatureInteraction(customId?) {
  if (!customId || typeof customId !== "string") return false;
  const id = String(customId).trim();
  if (id === "apply_helper" || id === "apply_partnermanager") return true;
  if (id.startsWith("apply_start:") || id.startsWith("apply_back:") || id.startsWith("apply_page:")) return true;
  if (id.startsWith("apply_form:")) return true;
  if (id === "candidature_premi_partner") return true;
  return false;
}

function getPendingCustomRoleGrant(token?) {
  try {
    const mod = require("../../Events/interaction/customRoleHandlers") as typeof import("../../Events/interaction/customRoleHandlers");
    if (typeof mod?.getPendingRoleGrantByToken !== "function") return null;
    return mod.getPendingRoleGrantByToken(token);
  } catch {
    return null;
  }
}

function extractOwnerIdFromMessageMention(message?) {
  if (!message) return null;

  const scan = (text?) => { const match = String(text || "").match(/<@!?(\d{16,20})>/); return match?.[1] || null; };

  const fromContent = scan(message.content);
  if (fromContent) return fromContent;

  const embeds = Array.isArray(message.embeds) ? message.embeds : [];
  for (const embed of embeds) {
    const fromDescription = scan(embed?.description);
    if (fromDescription) return fromDescription;
    const fromTitle = scan(embed?.title);
    if (fromTitle) return fromTitle;
    const fields = Array.isArray(embed?.fields) ? embed.fields : [];
    for (const field of fields) {
      const fromFieldName = scan(field?.name);
      if (fromFieldName) return fromFieldName;
      const fromFieldValue = scan(field?.value);
      if (fromFieldValue) return fromFieldValue;
    }
  }

  return null;
}

export = { CANDIDATURE_BLACKLIST_ROLE_ID, isTicketInteraction, isProfilePanelInteraction, checkTenantProfilePanelPermission, checkProfilePanelControlPermission, isCustomRoleSystemInteraction, isApplyOrCandidatureInteraction, getPendingCustomRoleGrant, extractOwnerIdFromMessageMention };
