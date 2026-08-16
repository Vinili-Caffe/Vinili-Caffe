/**
 * Discord Store entitlement handling — DISATTIVATO.
 * Migrazione completata: Premium/Donator/VIP/VIP+ ora si acquistano con crediti
 * (vedi premiumCreditsService.js + tenantPremium.revokeAllPremiumBySource).
 * Le funzioni restano esportate come no-op per non rompere i require/eventi esistenti
 * (entitlementCreate/Delete/Update, guildCreate, guildMemberAdd, ready.js).
 */

function entitlementIsActive() {
  return false;
}

async function handleEntitlementCreate() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function handleEntitlementDelete() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function handleEntitlementUpdate() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function restoreDiscordStoreRolesForMember() {
  return { ok: true, skipped: "discord_store_disabled", granted: 0 };
}

async function reconcileDiscordStoreRolesOnStartup() {
  return { ok: true, skipped: "discord_store_disabled", granted: 0, scanned: 0 };
}

async function reconcileDiscordStoreGuildPremiumOnStartup() {
  return { ok: true, skipped: "discord_store_disabled", granted: 0, revoked: 0, scanned: 0 };
}

async function syncDiscordStorePremiumForGuild() {
  return { ok: true, skipped: "discord_store_disabled" };
}

async function listAndSyncUserGuildPremiumEntitlements() {
  return { ok: true, skipped: "discord_store_disabled", guildIds: [], entitlements: [] };
}

async function listUserStoreRoleEntitlements() {
  return { ok: true, skipped: "discord_store_disabled", entitlements: [] };
}

module.exports = {
  handleEntitlementCreate,
  handleEntitlementDelete,
  handleEntitlementUpdate,
  restoreDiscordStoreRolesForMember,
  reconcileDiscordStoreRolesOnStartup,
  reconcileDiscordStoreGuildPremiumOnStartup,
  syncDiscordStorePremiumForGuild,
  listAndSyncUserGuildPremiumEntitlements,
  listUserStoreRoleEntitlements,
  entitlementIsActive,
};
