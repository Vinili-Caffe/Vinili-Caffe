const { PermissionFlagsBits } = require("discord.js");

function isGuildOwner(member, guild) {
  const ownerId = String(guild?.ownerId || "").trim();
  const userId = String(member?.user?.id || member?.id || "").trim();
  return Boolean(ownerId && userId && ownerId === userId);
}

function memberCanManageTenantPartnershipSettings(member, guild) {
  if (!member) return false;
  if (isGuildOwner(member, guild)) return true;
  if (!member.permissions) return false;
  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild)
  );
}

const TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE =
  "<:vegax:1443934876440068179> Solo il **proprietario del server**, chi ha **Amministratore** o **Gestisci server** può usare questa funzione.";

module.exports = {
  isGuildOwner,
  memberCanManageTenantPartnershipSettings,
  TENANT_PARTNERSHIP_ADMIN_DENIED_MESSAGE,
};
