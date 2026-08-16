const { MessageFlags } = require("discord.js");
const { safeMessageReply, safeReply } = require("../../../shared/discord/replyRuntime");
const { EPHEMERAL_TTL_NORMAL_MS, scheduleMessageDeletion } = require("../Config/ephemeralMessageTtl");
const { buildSettingsNotReadyEmbed } = require("./partnershipSettingsComponents");
const {
  resolveTenantLanguageForMessage,
  resolveTenantLanguageForInteraction,
} = require("./tenantPartnershipPrefixMessages");

const EPHEMERAL = MessageFlags.Ephemeral;

function buildSetupRequiredPayload(lang, options = {}) {
  return {
    embeds: [buildSettingsNotReadyEmbed(lang)],
    allowedMentions: { repliedUser: false },
    keepCommandMessage: options.keepCommandMessage !== false,
    skipAutoCleanup: true,
  };
}

async function replyPrefixSetupRequired(message, options = {}) {
  if (!message) return null;
  const lang = options.lang || (await resolveTenantLanguageForMessage(message));
  const reply = await safeMessageReply(message, buildSetupRequiredPayload(lang, options));
  const ttl = Number(options.ttlMs) > 0 ? options.ttlMs : EPHEMERAL_TTL_NORMAL_MS;
  if (reply) scheduleMessageDeletion(reply, ttl);
  return reply;
}

async function replyInteractionSetupRequired(interaction, options = {}) {
  if (!interaction) return null;
  const lang =
    options.lang ||
    (await resolveTenantLanguageForInteraction(interaction, options.userId));
  return safeReply(interaction, {
    embeds: [buildSettingsNotReadyEmbed(lang)],
    flags: options.ephemeral === false ? undefined : EPHEMERAL,
  });
}

module.exports = {
  buildSetupRequiredPayload,
  replyPrefixSetupRequired,
  replyInteractionSetupRequired,
};
