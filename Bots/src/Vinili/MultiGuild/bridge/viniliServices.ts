const { resolveGuildContext } = require("../core/guildContext") as typeof import("../core/guildContext");
const { isViniliProtectedGuild } = require("../core/viniliProtectedGuilds") as typeof import("../core/viniliProtectedGuilds");

function requireTenantGuild(guildOrId?) {
  const guildId = typeof guildOrId === "string" ? guildOrId : guildOrId?.id;
  if (isViniliProtectedGuild(guildId)) {
    const err: any = new Error(
      `[MultiGuild] guild protetta (main/test): ${guildId}. Usa i servizi Vinyls diretti, non il bridge MultiGuild.`,
    );
    err.code = "MULTI_GUILD_PROTECTED";
    throw err;
  }
  const ctx = resolveGuildContext(guildId);
  if (!ctx.managed) {
    const err: any = new Error(`[MultiGuild] guild non gestita dal tenant layer: ${guildId} (${ctx.reason})`);
    err.code = "MULTI_GUILD_NOT_MANAGED";
    err.guildContext = ctx;
    throw err;
  }
  if (!ctx.allowed) {
    const err: any = new Error(`[MultiGuild] tenant disabilitato: ${guildId} (${ctx.reason})`);
    err.code = "MULTI_GUILD_DENIED";
    err.guildContext = ctx;
    throw err;
  }
  return ctx;
}

function assertFeature(ctx?, featureKey?) {
  if (ctx.features.isEnabled(featureKey)) return;
  const err: any = new Error(`[MultiGuild] feature disabled: ${featureKey}`);
  err.code = "MULTI_GUILD_FEATURE_DISABLED";
  err.guildContext = ctx;
  throw err;
}

async function ensureGuildFeatureBucketGuarded(guildId?) {
  const ctx = requireTenantGuild(guildId);
  assertFeature(ctx, "ticket");
  const { ensureGuildFeatureBucket } = require("../../Schemas/Guild/guildFeatureBucketSchema") as typeof import("../../Schemas/Guild/guildFeatureBucketSchema");
  return ensureGuildFeatureBucket(guildId);
}

export = { ensureGuildFeatureBucketGuarded };