const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../../..");

function loadDotEnv() {
  const envPath = path.join(ROOT, ".env");
  try {
    if (!fs.existsSync(envPath)) return;
    for (const line of fs.readFileSync(envPath, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq < 1) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = val;
    }
  } catch (_) {}
}

function loadVinylsConfig() {
  const configPath = path.join(ROOT, "Vinyls", "config.json");
  const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  try {
    require("../../Utils/Config/emergencyRoleIdRemap").applyEmergencyRoleRemapToConfig(cfg);
  } catch (_) {}
  return cfg;
}

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

function resolveDiscordToken() {
  return String(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL || "").trim();
}

function installConsoleLogger() {
  global.logger = {
    info: (...a) => console.log(...a),
    warn: (...a) => console.warn(...a),
    error: (...a) => console.error(...a),
    debug: (...a) => console.log(...a),
  };
}

function installWorkerEmbedPatches() {
  try {
    const discord = require("discord.js");
    const { installEmbedFooterPatch } = require("../../Utils/Embeds/defaultFooter");
    const {
      installOutgoingEditBrandingPatch,
      setTenantEmbedBrandingApplier,
    } = require("../../../shared/discord/replyRuntime");
    const { registerTenantEmbedBrandingApplier } = require("../../MultiGuild/utils/tenantEmbedBranding");
    installEmbedFooterPatch();
    installOutgoingEditBrandingPatch(discord);
    registerTenantEmbedBrandingApplier();
    setTenantEmbedBrandingApplier((payload, context) =>
      require("../../MultiGuild/utils/tenantEmbedBranding").applyTenantPayloadBranding(payload, {
        ...context,
        partnershipBranding: true,
      }),
    );
  } catch (err) {
    console.warn("[WORKER] installWorkerEmbedPatches failed:", err?.message || err);
  }
}

module.exports = {
  ROOT,
  loadDotEnv,
  loadVinylsConfig,
  resolveMongoUrl,
  resolveDiscordToken,
  installConsoleLogger,
  installWorkerEmbedPatches,
};
