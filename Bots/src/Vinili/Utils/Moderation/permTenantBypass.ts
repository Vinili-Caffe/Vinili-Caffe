/** Permessi: eccezioni per i server esterni (partnership, help, utilità, media). */
const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../Config/ids") as typeof import("../Config/ids");
const { isPartnershipOperational, memberHasPartnerManagerRole, SETUP_REQUIRED_REPLY } = require("../Partner/partnershipConfigResolver") as typeof import("../Partner/partnershipConfigResolver");

function getMainGuildIdFallback() {
  try {
    const configPath = path.join(__dirname, "..", "..", "config.json");
    const raw = fs.readFileSync(configPath, "utf8");
    const c = JSON.parse(raw);
    return c.mainGuildId || c.guildMain || null;
  } catch {
    return null;
  }
}
const CONFIG_MAIN_GUILD_ID = getMainGuildIdFallback();
const CATALOG_MAIN_GUILD_ID = IDs?.guilds?.main || null;
const MAIN_GUILD_ID = CONFIG_MAIN_GUILD_ID || CATALOG_MAIN_GUILD_ID || null;
const ALLOWED_GUILD_IDS = new Set(
  [
    CONFIG_MAIN_GUILD_ID,
    CATALOG_MAIN_GUILD_ID,
    MAIN_GUILD_ID,
    IDs?.guilds?.test,
  ]
    .filter(Boolean)
    .map(String),
);
function isAllowedGuildUfficiale(guildId?) {
  return !guildId || ALLOWED_GUILD_IDS.has(String(guildId));
}
function isAllowedGuildForComponents(guildId?) {
  if (!guildId) return true;
  const s = String(guildId);
  if (MAIN_GUILD_ID && s === String(MAIN_GUILD_ID)) return true;
  if (ALLOWED_GUILD_IDS.has(s)) return true;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    const { shouldApplyMultiGuildLayer } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
    if (isMultiGuildLayerEnabled() && shouldApplyMultiGuildLayer(s)) return true;
  } catch {
      }
  return false;
}

const TENANT_UTILITY_COMPONENT_PREFIXES = [
  "repost_btn:",
  "repost_src:",
  "repost_remove:",
  "quote_remove:",
  "myrepost_page_",
  "myrepost_del:",
  "myrepost_close:",
  "myclip_page_",
  "myclip_del:",
  "myclip_close:",
  "myquote_page_",
  "myquote_del:",
  "myquote_close:",
];

const TENANT_PARTNERSHIP_SETUP_PREFIXES = [
  "psetup:",
  "psetup_modal:",
  "psettings:",
  "psettings_modal:",
  "tprof:",
];

const TENANT_HELP_NAV_PREFIXES = [
  "help_home_",
  "help_prev_",
  "help_next_",
  "help_page_",
  "badges_prev_",
  "badges_next_",
  "badges_page_",
];

function isPartnershipModalInteraction(customId?) {
  const id = String(customId || "");
  return id.startsWith("partnershipModal_");
}

function isTenantUtilityComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_UTILITY_COMPONENT_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function isPartnershipSetupComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_PARTNERSHIP_SETUP_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function isTenantHelpNavComponentInteraction(customId?) {
  const id = String(customId || "");
  return TENANT_HELP_NAV_PREFIXES.some((prefix?) => id.startsWith(prefix));
}

function tryTenantHelpNavComponentBypass(guildId?, customId?) {
  if (!guildId || !isTenantHelpNavComponentInteraction(customId)) return null;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    const { resolveGuildAccess } = require("../../MultiGuild/core/guildRegistry") as typeof import("../../MultiGuild/core/guildRegistry");
    const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
    if (!isMultiGuildLayerEnabled()) return null;
    if (isViniliFullFeatureGuild(guildId)) return null;
    const access = resolveGuildAccess(guildId);
    if (access?.managed && access?.allowed) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
  } catch (err) {
    global.logger?.warn?.(
      "[commandPermissions] tenant help nav component bypass:",
      err?.message || err,
    );
  }
  return null;
}

function tryTenantManagedComponentBypass(guildId?, customId?, category?) {
  if (!guildId || isAllowedGuildForComponents(guildId)) return null;
  try {
    const { isMultiGuildLayerEnabled } = require("../../MultiGuild/core/env") as typeof import("../../MultiGuild/core/env");
    if (!isMultiGuildLayerEnabled()) return null;
    const { canInvokePrefixCommand } = require("../../MultiGuild/core/accessPolicy") as typeof import("../../MultiGuild/core/accessPolicy");
    const gate = canInvokePrefixCommand(guildId, category);
    if (gate.managed && gate.ok) {
      return { allowed: true, reason: null, requiredRoles: null, ownerId: null };
    }
  } catch (err) {
    global.logger?.warn?.(
      `[commandPermissions] tenant ${category} component bypass:`,
      err?.message || err,
    );
  }
  return null;
}

function tryTenantUtilityComponentBypass(guildId?, customId?) {
  if (!isTenantUtilityComponentInteraction(customId)) return null;
  return tryTenantManagedComponentBypass(guildId, customId, "utility");
}

function isTenantLeaderboardComponentInteraction(customId?) {
  const id = String(customId || "");
  return id.startsWith("tlb:");
}

function tryTenantPartnershipSetupBypass(guildId?, customId?, interaction = null) {
  if (isTenantLeaderboardComponentInteraction(customId)) {
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  if (isPartnershipSetupComponentInteraction(customId)) {
    try {
      const {
        memberCanManageTenantPartnershipSettings,
      } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
      if (
        !memberCanManageTenantPartnershipSettings(interaction?.member, interaction?.guild)
      ) {
        return {
          allowed: false,
          reason: "missing_permission",
          requiredRoles: null,
          ownerId: null,
        };
      }
    } catch (err) {
      global.logger?.warn?.(
        "[commandPermissions] tenant partnership admin gate:",
        err?.message || err,
      );
      return {
        allowed: false,
        reason: "missing_permission",
        requiredRoles: null,
        ownerId: null,
      };
    }
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  if (isPartnershipModalInteraction(customId)) {
    return tryTenantManagedComponentBypass(guildId, customId, "partnership");
  }
  return null;
}

function isMainGuild(guildId?) {
  if (!guildId) return false;
  const s = String(guildId);
  if (MAIN_GUILD_ID && s === String(MAIN_GUILD_ID)) return true;
  // Server di test = stesso set comandi del main (niente gate "solo partnership")
  const testId = IDs?.guilds?.test;
  if (testId && s === String(testId)) return true;
  return false;
}

async function checkTenantPartnershipSlashAccess(interaction?, options: Record<string, any> = {}) {
  const guildId = interaction?.guildId || interaction?.guild?.id || null;
  const cmd = String(interaction?.commandName || "").toLowerCase();
  const tenantPartnerCommands = new Set([
    "partnership",
    "delete",
    "elimina partnership",
    "aggiungi punti",
    "rimuovi punti",
  ]);
  if (!guildId || isMainGuild(guildId) || !tenantPartnerCommands.has(cmd)) return null;
  if (!isPartnershipOperational(guildId)) {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "partnership_not_configured",
        requiredRoles: null,
        channels: null,
        message: SETUP_REQUIRED_REPLY,
      };
    }
    return false;
  }
  if (cmd === "partnership") {
    const member = interaction.member;
    const isOwner = String(interaction.guild?.ownerId || "") === String(interaction.user?.id || "");
    const hasManageGuild = Boolean(
      member?.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        member?.permissions?.has?.(PermissionFlagsBits.ManageGuild),
    );
    const allowed =
      memberHasPartnerManagerRole(member, guildId) || isOwner || hasManageGuild;
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed
          ? null
          : "<:vegax:1443934876440068179> Ti serve il **ruolo Partner Manager** (o **Gestisci server**) per usare `/partnership`.",
      };
    }
    return allowed;
  }
  if (cmd === "elimina partnership") {
    const {
      memberCanManageTenantPartnershipSettings,
      TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
    } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
    const allowed = memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed ? null : TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
      };
    }
    return allowed;
  }
  if (cmd === "aggiungi punti" || cmd === "rimuovi punti") {
    const allowed = Boolean(
      interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator),
    );
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_permission",
        requiredRoles: null,
        channels: null,
        message: allowed
          ? null
          : "<a:VC_Cross:1482532424570376253> Solo un **Amministratore** può usare questo comando.",
      };
    }
    return allowed;
  }
  if (cmd === "delete") {
    const sub = String(interaction.options?.getSubcommand?.(false) || "").toLowerCase();
    if (sub !== "partnership") {
      if (options.returnDetails) {
        return {
          allowed: false,
          reason: "tenant_partnership_only",
          requiredRoles: null,
          channels: null,
          message:
            "<:vegax:1443934876440068179> Su questo server è disponibile solo `/delete partnership`.",
        };
      }
      return false;
    }
    const {
      memberCanManageTenantPartnershipSettings,
      TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
    } = require("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess") as typeof import("../../MultiGuild/utils/Partner/tenantPartnershipAdminAccess");
    const allowed = memberCanManageTenantPartnershipSettings(interaction.member, interaction.guild);
    if (options.returnDetails) {
      return {
        allowed,
        reason: allowed ? null : "missing_role",
        requiredRoles: null,
        channels: null,
        message: allowed ? null : TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
      };
    }
    return allowed;
  }
  if (cmd === "segnala") {
    if (options.returnDetails) {
      return {
        allowed: false,
        reason: "main_guild_only",
        requiredRoles: null,
        channels: null,
        message: "<:vegax:1443934876440068179> Questo comando è disponibile solo sul server principale.",
      };
    }
    return false;
  }
}

function tryResolveMultiGuildOpenMediaBypass(guildId?, commandName?, options?) {
  try {
    const { resolveOpenMediaPrefixBypass } = require("../../MultiGuild/core/openMediaCommands") as typeof import("../../MultiGuild/core/openMediaCommands");
    return resolveOpenMediaPrefixBypass(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild open media bypass:", err?.message || err);
    return null;
  }
}

function tryResolveMultiGuildTenantPrefixRestriction(guildId?, commandName?, options?) {
  try {
    const { resolveTenantPrefixRestriction } = require("../../MultiGuild/core/tenantPrefixGate") as typeof import("../../MultiGuild/core/tenantPrefixGate");
    return resolveTenantPrefixRestriction(guildId, commandName, options);
  } catch (err) {
    global.logger?.warn?.("[commandPermissions] MultiGuild tenant prefix gate:", err?.message || err);
    return null;
  }
}

export = { isAllowedGuildUfficiale, isAllowedGuildForComponents, tryTenantHelpNavComponentBypass, tryTenantUtilityComponentBypass, tryTenantPartnershipSetupBypass, isMainGuild, checkTenantPartnershipSlashAccess, tryResolveMultiGuildOpenMediaBypass, tryResolveMultiGuildTenantPrefixRestriction };
