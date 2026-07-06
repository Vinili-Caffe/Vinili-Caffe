const { resolveGuildContext } = require("../core/guildContext");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds");

function requireTenantGuild(guildOrId) {
  const guildId = typeof guildOrId === "string" ? guildOrId : guildOrId?.id;
  if (isViniliProtectedGuild(guildId)) {
    const err = new Error(
      `[MultiGuild] guild protetta (main/test/sponsor): ${guildId}. Usa i servizi Vinyls diretti, non il bridge MultiGuild.`,
    );
    err.code = "MULTI_GUILD_PROTECTED";
    throw err;
  }
  const ctx = resolveGuildContext(guildId);
  if (!ctx.managed) {
    const err = new Error(`[MultiGuild] guild non gestita dal tenant layer: ${guildId} (${ctx.reason})`);
    err.code = "MULTI_GUILD_NOT_MANAGED";
    err.guildContext = ctx;
    throw err;
  }
  if (!ctx.allowed) {
    const err = new Error(`[MultiGuild] tenant disabilitato: ${guildId} (${ctx.reason})`);
    err.code = "MULTI_GUILD_DENIED";
    err.guildContext = ctx;
    throw err;
  }
  return ctx;
}

function assertFeature(ctx, featureKey) {
  if (ctx.features.isEnabled(featureKey)) return;
  const err = new Error(`[MultiGuild] feature disabled: ${featureKey}`);
  err.code = "MULTI_GUILD_FEATURE_DISABLED";
  err.guildContext = ctx;
  throw err;
}

async function addExpWithLevelGuarded(guild, userId, amount, applyMultiplier = false, includeWeekly = true, options = {}) {
  const ctx = requireTenantGuild(guild);
  assertFeature(ctx, "level");
  const { addExpWithLevel } = require("../../Services/Community/expService");
  return addExpWithLevel(guild, userId, amount, applyMultiplier, includeWeekly, options);
}

async function getGuildExpSettingsGuarded(guildId) {
  const ctx = requireTenantGuild(guildId);
  assertFeature(ctx, "level");
  const { getGuildExpSettings } = require("../../Services/Community/expService");
  return getGuildExpSettings(guildId);
}

async function ensureGuildFeatureBucketGuarded(guildId) {
  const ctx = requireTenantGuild(guildId);
  assertFeature(ctx, "ticket");
  const { ensureGuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema");
  return ensureGuildFeatureBucket(guildId);
}

function getSecurityProfileGuarded(guildId) {
  const ctx = requireTenantGuild(guildId);
  assertFeature(ctx, "security");
  const { getSecurityProfilesSnapshot } = require("../../Services/Moderation/securityProfilesService");
  return getSecurityProfilesSnapshot(guildId);
}

module.exports = { requireTenantGuild, assertFeature, addExpWithLevelGuarded, getGuildExpSettingsGuarded, ensureGuildFeatureBucketGuarded, getSecurityProfileGuarded };