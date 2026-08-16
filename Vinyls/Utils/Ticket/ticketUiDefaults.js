/** Shared TicketsBot-style defaults for panels and welcome embeds. */

const {
  DEFAULT_LANGUAGE,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
} = require("../Partner/tenantPartnershipI18n/languages");

const DEFAULT_TICKET_PANEL_TITLE = "Open a ticket!";
/** Colore branding Vinili (coffee). */
const DEFAULT_TICKET_PANEL_COLOR = "#6f4e37";
const DEFAULT_TICKET_BUTTON_EMOJI = Object.freeze({ name: "📩" });
const DEFAULT_TICKET_WELCOME_COLOR = "#6f4e37";
const FALLBACK_TICKET_PANEL_FOOTER = "© 2026 Vinili & Caffè. Tutti i diritti riservati.";

const DEFAULT_TICKET_WELCOME_BY_LANG = Object.freeze({
  it: "Grazie per aver contattato il supporto.\nDescrivi il problema e attendi una risposta.",
  en: "Thank you for contacting support.\nPlease describe your issue and wait for a response.",
  es: "Gracias por contactar con el soporte.\nDescribe tu problema y espera una respuesta.",
  fr: "Merci d'avoir contacté le support.\nDécrivez votre problème et attendez une réponse.",
  de: "Danke, dass du den Support kontaktiert hast.\nBeschreibe dein Anliegen und warte auf eine Antwort.",
  pt: "Obrigado por contactar o suporte.\nDescreva o problema e aguarde uma resposta.",
});

/** @deprecated prefer getDefaultWelcomeDescription(lang) */
const DEFAULT_TICKET_WELCOME_DESCRIPTION = DEFAULT_TICKET_WELCOME_BY_LANG.it;

const DEFAULT_WELCOME_DESC_SET = new Set(
  Object.values(DEFAULT_TICKET_WELCOME_BY_LANG).map((s) => String(s).trim()),
);

function getDefaultWelcomeDescription(lang = DEFAULT_LANGUAGE) {
  const code = normalizeTenantLanguage(lang);
  return (
    DEFAULT_TICKET_WELCOME_BY_LANG[code] ||
    DEFAULT_TICKET_WELCOME_BY_LANG.en ||
    DEFAULT_TICKET_WELCOME_BY_LANG.it
  );
}

function getDefaultTicketPanelFooter(lang = DEFAULT_LANGUAGE) {
  try {
    const { t } = require("../Partner/tenantPartnershipI18n");
    const text = String(t(lang, "footerCopyright") || "").trim();
    if (text && text !== "footerCopyright") return text;
  } catch (_) {}
  return FALLBACK_TICKET_PANEL_FOOTER;
}

/** @deprecated use getDefaultTicketPanelFooter(lang) */
const DEFAULT_TICKET_PANEL_FOOTER = FALLBACK_TICKET_PANEL_FOOTER;

function isDefaultWelcomeDescription(text) {
  const t = String(text || "").trim();
  if (!t) return true;
  return DEFAULT_WELCOME_DESC_SET.has(t);
}

function resolveTicketBotLanguage(guildId, guild = null) {
  try {
    const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings");
    const settings = getTicketSettingsSync(guildId) || {};
    const raw = String(settings.language || settings.lang || "server").trim().toLowerCase();
    if (raw && raw !== "server") {
      return normalizeTenantLanguage(raw);
    }
  } catch (_) {}
  const fromGuild = mapDiscordLocaleToTenantLanguage(guild?.preferredLocale);
  if (fromGuild) return fromGuild;
  return DEFAULT_LANGUAGE;
}

function wrapMentionsInSpoiler(content) {
  const raw = String(content || "").trim();
  if (!raw) return "";
  if (raw.startsWith("||") && raw.endsWith("||")) return raw;
  return `||${raw}||`;
}

function isDefaultishSinglePanelEmbed(panel) {
  if (!panel || typeof panel !== "object") return true;
  const title = String(panel.title || "").trim();
  const content = String(panel.content || "").trim();
  return (
    !content &&
    !panel.largeImageUrl &&
    !panel.smallImageUrl &&
    (!title || title === DEFAULT_TICKET_PANEL_TITLE)
  );
}

function isDefaultishMultiPanelEmbed(multi) {
  if (!multi || typeof multi !== "object") return true;
  const fields = Array.isArray(multi.fields) ? multi.fields : [];
  return !(
    String(multi.title || "").trim() ||
    String(multi.description || "").trim() ||
    String(multi.authorName || "").trim() ||
    String(multi.footerText || "").trim() ||
    multi.largeImageUrl ||
    multi.smallImageUrl ||
    fields.length
  );
}

module.exports = {
  DEFAULT_TICKET_PANEL_TITLE,
  DEFAULT_TICKET_PANEL_COLOR,
  DEFAULT_TICKET_PANEL_FOOTER,
  DEFAULT_TICKET_BUTTON_EMOJI,
  DEFAULT_TICKET_WELCOME_DESCRIPTION,
  DEFAULT_TICKET_WELCOME_COLOR,
  DEFAULT_TICKET_WELCOME_BY_LANG,
  getDefaultWelcomeDescription,
  getDefaultTicketPanelFooter,
  isDefaultWelcomeDescription,
  resolveTicketBotLanguage,
  wrapMentionsInSpoiler,
  isDefaultishSinglePanelEmbed,
  isDefaultishMultiPanelEmbed,
};
