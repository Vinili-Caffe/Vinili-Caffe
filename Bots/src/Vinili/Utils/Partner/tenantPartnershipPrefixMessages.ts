const { t, resolveTenantLanguage } = require("./tenantPartnershipI18n/index") as typeof import("./tenantPartnershipI18n/index");
const { buildSimpleNoticePayload } = require("../Embeds/simpleNoticeEmbed") as typeof import("../Embeds/simpleNoticeEmbed");

function localeOptionsFromMessage(message?, userId?) {
  const uid = String(userId || message.author?.id || "").trim();
  return {
    discordLocale: message.author?.locale,
    guildPreferredLocale: message.guild?.preferredLocale,
    client: message.client,
    userId: uid,
  };
}

function localeOptionsFromInteraction(interaction?, userId?) {
  const uid = String(userId || interaction.user?.id || "").trim();
  return {
    discordLocale: interaction.locale ?? interaction.user?.locale,
    guildPreferredLocale: interaction.guild?.preferredLocale,
    client: interaction.client,
    userId: uid,
  };
}

async function resolveTenantLanguageForMessage(message?, userId?) {
  return resolveTenantLanguage(message.guild?.id, userId || message.author?.id, localeOptionsFromMessage(message, userId));
}

async function resolveTenantLanguageForInteraction(interaction?, userId?) {
  return resolveTenantLanguage(interaction.guild?.id, userId || interaction.user?.id, localeOptionsFromInteraction(interaction, userId));
}

function rewritePrefixInText(text?, guildId?, client?) {
  let out = String(text || "");
  try {
    const { resolveCommandPrefixForGuild, rewriteDefaultCommandPrefix } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
    const prefix = resolveCommandPrefixForGuild(guildId, client);
    out = rewriteDefaultCommandPrefix(out, prefix);
  } catch (_) {}
  return out;
}

async function replyTenantMessage(message?, key?, vars: Record<string, any> = {}) {
  const lang = await resolveTenantLanguageForMessage(message);
  return rewritePrefixInText(t(lang, key, vars), message.guild?.id, message.client);
}

async function tenantNoticePayload(message?, key?, vars: Record<string, any> = {}, options: Record<string, any> = {}) {
  const text = await replyTenantMessage(message, key, vars);
  return buildSimpleNoticePayload(text, message.guild, {
    allowedMentions: { repliedUser: false },
    ...options,
  });
}

async function interactionTenantNoticePayload(interaction?, key?, vars: Record<string, any> = {}, options: Record<string, any> = {}) {
  const lang = await resolveTenantLanguageForInteraction(interaction);
  const text = rewritePrefixInText(t(lang, key, vars), interaction.guild?.id, interaction.client);
  return buildSimpleNoticePayload(text, interaction.guild, {
    ephemeral: options.ephemeral !== false,
    allowedMentions: { parse: [] },
    ...options,
  });
}

function tenantI18nNoticePayload(lang?, key?, guild?, vars: Record<string, any> = {}, options: Record<string, any> = {}) {
  const text = rewritePrefixInText(t(lang, key, vars), guild?.id, guild?.client || options.client);
  return buildSimpleNoticePayload(text, guild, {
    allowedMentions: { parse: [] },
    ...options,
  });
}

async function tenantOnlyError(message?, command?) {
  return tenantNoticePayload(message, "errors_tenantOnly", { command });
}

async function tenantNotConfiguredError(message?) {
  return tenantNoticePayload(message, "errors_notConfigured");
}

async function tenantNoPermissionError(message?, command?) {
  return tenantNoticePayload(message, "errors_noPermission", { command });
}

export = {
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
