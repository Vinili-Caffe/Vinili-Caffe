const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl") as typeof import("../Config/ephemeralMessageTtl");
const { isViniliFullFeatureGuild } = require("../../MultiGuild/core/guildFeatureScope") as typeof import("../../MultiGuild/core/guildFeatureScope");
const { userWantsTenantEphemeralCommands } = require("../../Services/Partner/tenantProfilePreferencesService") as typeof import("../../Services/Partner/tenantProfilePreferencesService");

const TENANT_EPHEMERAL_REPLY_MS = 45_000;

const MAIN_PARTNERSHIP_PRIVACY_PREFIX = new Set([
  "points",
  "leaderboard",
  "lb",
  "history",
  "blacklist",
  "description",
  "desc",
  "badges",
  "notify",
  "random",
  "settings",
  "setup",
  "server",
  "user",
]);

function isMainPartnershipPrivacyPrefixCommand(commandName?, message?) {
  const name = String(commandName || "").toLowerCase().trim();
  if (MAIN_PARTNERSHIP_PRIVACY_PREFIX.has(name)) return true;
  if (name === "profile") {
    const parts = String(message?.content || "")
      .trim()
      .split(/\s+/);
    return parts.slice(1).some((part?) => String(part || "").toLowerCase() === "pm");
  }
  return false;
}

async function resolvePartnershipDeferOptions(guildId?, userId?) {
  const wants = await userWantsTenantEphemeralCommands(guildId, userId).catch(() => false);
  return wants ? { flags: MessageFlags.Ephemeral } : {};
}

async function userWantsPartnershipCommandPrivacy(guildId?, userId?) {
  return userWantsTenantEphemeralCommands(guildId, userId).catch(() => false);
}

async function maybeApplyTenantEphemeralCommandCleanup(message?, commandName?) {
  const guildId = String(message?.guild?.id || "").trim();
  const userId = String(message?.author?.id || "").trim();
  if (!guildId || !userId || message.author?.bot) return;

  const wants = await userWantsTenantEphemeralCommands(guildId, userId).catch(() => false);
  if (!wants) return;

  if (isViniliFullFeatureGuild(guildId)) {
    if (!isMainPartnershipPrivacyPrefixCommand(commandName, message)) return;
  }

  scheduleMessageDeletion(message, TENANT_EPHEMERAL_REPLY_MS);

  const channel = message.channel;
  const botId = String(message.client?.user?.id || "");
  if (!channel?.messages?.fetch || !botId) return;

  setTimeout(async () => {
    const recent = await channel.messages.fetch({ limit: 12 }).catch(() => null);
    if (!recent) return;
    const reply = recent.find(
      (msg?) =>
        String(msg.author?.id || "") === botId &&
        String(msg.reference?.messageId || "") === String(message.id || ""),
    );
    if (reply) scheduleMessageDeletion(reply, TENANT_EPHEMERAL_REPLY_MS);
  }, 1500);
}

export = {
  maybeApplyTenantEphemeralCommandCleanup,
  resolvePartnershipDeferOptions,
  userWantsPartnershipCommandPrivacy,
};
