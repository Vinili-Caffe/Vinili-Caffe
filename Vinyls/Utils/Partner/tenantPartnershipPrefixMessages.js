const { t, resolveTenantLanguage } = require("./tenantPartnershipI18n");
const { buildSimpleNoticePayload } = require("../Embeds/simpleNoticeEmbed");

function localeOptionsFromMessage(message, userId) {
  const uid = String(userId || message.author?.id || "").trim();
  return {
    discordLocale: message.author?.locale,
    guildPreferredLocale: message.guild?.preferredLocale,
    client: message.client,
    userId: uid,
  };
}

function localeOptionsFromInteraction(interaction, userId) {
  const uid = String(userId || interaction.user?.id || "").trim();
  return {
    discordLocale: interaction.locale ?? interaction.user?.locale,
    guildPreferredLocale: interaction.guild?.preferredLocale,
    client: interaction.client,
    userId: uid,
  };
}

async function resolveTenantLanguageForMessage(message, userId) {
  return resolveTenantLanguage(message.guild?.id, userId || message.author?.id, localeOptionsFromMessage(message, userId));
}

async function resolveTenantLanguageForInteraction(interaction, userId) {
  return resolveTenantLanguage(interaction.guild?.id, userId || interaction.user?.id, localeOptionsFromInteraction(interaction, userId));
}

function rewritePrefixInText(text, guildId, client) {
  let out = String(text || "");
  try {
    const { resolveCommandPrefixForGuild, rewriteDefaultCommandPrefix } = require("../../MultiGuild/core/tenantGuildSettings");
    const prefix = resolveCommandPrefixForGuild(guildId, client);
    out = rewriteDefaultCommandPrefix(out, prefix);
  } catch (_) {}
  return out;
}

/** Resolve i18n string (no Discord payload). */
async function replyTenantMessage(message, key, vars = {}) {
  const lang = await resolveTenantLanguageForMessage(message);
  return rewritePrefixInText(t(lang, key, vars), message.guild?.id, message.client);
}

/** Branded notice embed payload for prefix replies. */
async function tenantNoticePayload(message, key, vars = {}, options = {}) {
  const text = await replyTenantMessage(message, key, vars);
  return buildSimpleNoticePayload(text, message.guild, {
    allowedMentions: { repliedUser: false },
    ...options,
  });
}

/** Branded notice embed for interactions (ephemeral by default). */
async function interactionTenantNoticePayload(interaction, key, vars = {}, options = {}) {
  const lang = await resolveTenantLanguageForInteraction(interaction);
  const text = rewritePrefixInText(t(lang, key, vars), interaction.guild?.id, interaction.client);
  return buildSimpleNoticePayload(text, interaction.guild, {
    ephemeral: options.ephemeral !== false,
    allowedMentions: { parse: [] },
    ...options,
  });
}

/** Sync helper when lang is already resolved. */
function tenantI18nNoticePayload(lang, key, guild, vars = {}, options = {}) {
  const text = rewritePrefixInText(t(lang, key, vars), guild?.id, guild?.client || options.client);
  return buildSimpleNoticePayload(text, guild, {
    allowedMentions: { parse: [] },
    ...options,
  });
}

async function tenantOnlyError(message, command) {
  return tenantNoticePayload(message, "errors_tenantOnly", { command });
}

async function tenantNotConfiguredError(message) {
  return tenantNoticePayload(message, "errors_notConfigured");
}

async function tenantNoPermissionError(message, command) {
  return tenantNoticePayload(message, "errors_noPermission", { command });
}

module.exports = {
  replyTenantMessage,
  tenantNoticePayload,
  interactionTenantNoticePayload,
  tenantI18nNoticePayload,
  tenantOnlyError,
  tenantNotConfiguredError,
  tenantNoPermissionError,
  resolveTenantLanguage,
  resolveTenantLanguageForMessage,
  resolveTenantLanguageForInteraction,
  localeOptionsFromMessage,
  localeOptionsFromInteraction,
};
