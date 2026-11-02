const { MessageFlags } = require("discord.js") as typeof import("discord.js");
const { safeMessageReply, safeReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../../../shared/utils/ephemeralMessageTtl") as typeof import("../../../shared/utils/ephemeralMessageTtl");
const { buildSettingsNotReadyEmbed } = require("../runtime/partnershipSettingsComponents") as typeof import("../runtime/partnershipSettingsComponents");
const {
  resolveTenantLanguageForMessage,
  resolveTenantLanguageForInteraction,
} = require("./tenantPartnershipPrefixMessages") as typeof import("./tenantPartnershipPrefixMessages");

const EPHEMERAL = MessageFlags.Ephemeral;

function buildSetupRequiredPayload(lang?, options: Record<string, any> = {}) {
  return {
    embeds: [buildSettingsNotReadyEmbed(lang)],
    allowedMentions: { repliedUser: false },
    keepCommandMessage: options.keepCommandMessage !== false,
    skipAutoCleanup: true,
  };
}

async function replyPrefixSetupRequired(message?, options: Record<string, any> = {}) {
  if (!message) return null;
  const lang = options.lang || (await resolveTenantLanguageForMessage(message));
  const reply = await safeMessageReply(message, buildSetupRequiredPayload(lang, options));
  const ttl = Number(options.ttlMs) > 0 ? options.ttlMs : EPHEMERAL_TTL_NORMAL_MS;
  if (reply) scheduleMessageDeletion(reply, ttl);
  return reply;
}

async function replyInteractionSetupRequired(interaction?, options: Record<string, any> = {}) {
  if (!interaction) return null;
  const lang =
    options.lang ||
    (await resolveTenantLanguageForInteraction(interaction, options.userId));
  return safeReply(interaction, {
    embeds: [buildSettingsNotReadyEmbed(lang)],
    flags: options.ephemeral === false ? undefined : EPHEMERAL,
  });
}

export = {
  replyPrefixSetupRequired,
  replyInteractionSetupRequired,
};
