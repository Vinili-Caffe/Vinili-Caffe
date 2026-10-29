
const {
  DEFAULT_LANGUAGE,
  normalizeTenantLanguage,
  mapDiscordLocaleToTenantLanguage,
} = require("../Partner/tenantPartnershipI18n/languages") as typeof import("../Partner/tenantPartnershipI18n/languages");

const DEFAULT_TICKET_PANEL_TITLE = "Apri un ticket";
const DEFAULT_TICKET_PANEL_COLOR = "#6F4E37";
const DEFAULT_TICKET_BUTTON_EMOJI = Object.freeze({ name: "📩" });
const DEFAULT_TICKET_WELCOME_COLOR = "#6F4E37";
const FALLBACK_TICKET_PANEL_FOOTER = "© 2026 Vinili & Caffè. Tutti i diritti riservati.";

const DEFAULT_TICKET_PANEL_TITLE_BY_LANG = Object.freeze({
  it: "Apri un ticket",
  en: "Open a ticket",
  es: "Abrir un ticket",
  fr: "Ouvrir un ticket",
  de: "Ticket öffnen",
  pt: "Abrir um ticket",
});

const DEFAULT_TICKET_PANEL_DESC_BY_LANG = Object.freeze({
  it: "Assistenza e supporto dallo staff.\nScegli la categoria e descrivi la richiesta.",
  en: "Staff support and assistance.\nPick a category and describe your request.",
  es: "Asistencia y soporte del staff.\nElige una categoría y describe tu solicitud.",
  fr: "Assistance et support par le staff.\nChoisis une catégorie et décris ta demande.",
  de: "Hilfe und Support vom Staff.\nWähle eine Kategorie und beschreibe dein Anliegen.",
  pt: "Assistência e suporte da staff.\nEscolhe uma categoria e descreve o pedido.",
});

const DEFAULT_TICKET_WELCOME_BY_LANG = Object.freeze({
  it: "Grazie per aver contattato il supporto.\nDescrivi il problema e attendi una risposta.",
  en: "Thank you for contacting support.\nPlease describe your issue and wait for a response.",
  es: "Gracias por contactar con el soporte.\nDescribe tu problema y espera una respuesta.",
  fr: "Merci d'avoir contacté le support.\nDécrivez votre problème et attendez une réponse.",
  de: "Danke, dass du den Support kontaktiert hast.\nBeschreibe dein Anliegen und warte auf eine Antwort.",
  pt: "Obrigado por contactar o suporte.\nDescreva o problema e aguarde uma resposta.",
});

const DEFAULT_TICKET_WELCOME_DESCRIPTION = DEFAULT_TICKET_WELCOME_BY_LANG.it;

const DEFAULT_WELCOME_DESC_SET = new Set(
  Object.values(DEFAULT_TICKET_WELCOME_BY_LANG).map((s?) => String(s).trim()),
);

const DEFAULT_PANEL_TITLE_SET = new Set([
  ...Object.values(DEFAULT_TICKET_PANEL_TITLE_BY_LANG).map((s?) => String(s).trim()),
  "Open a ticket!",
  "Open a ticket",
  "Apri un ticket",
  "Apri un ticket!",
]);

function getDefaultTicketPanelTitle(lang = DEFAULT_LANGUAGE) {
  const code = normalizeTenantLanguage(lang);
  return (
    DEFAULT_TICKET_PANEL_TITLE_BY_LANG[code] ||
    DEFAULT_TICKET_PANEL_TITLE_BY_LANG.en ||
    DEFAULT_TICKET_PANEL_TITLE
  );
}

function getDefaultTicketPanelDescription(lang = DEFAULT_LANGUAGE) {
  const code = normalizeTenantLanguage(lang);
  return (
    DEFAULT_TICKET_PANEL_DESC_BY_LANG[code] ||
    DEFAULT_TICKET_PANEL_DESC_BY_LANG.en ||
    DEFAULT_TICKET_PANEL_DESC_BY_LANG.it
  );
}

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
    const { t } = require("../Partner/tenantPartnershipI18n") as typeof import("../Partner/tenantPartnershipI18n");
    const text = String(t(lang, "footerCopyright") || "").trim();
    if (text && text !== "footerCopyright") return text;
  } catch (_) {}
  return FALLBACK_TICKET_PANEL_FOOTER;
}

const DEFAULT_TICKET_PANEL_FOOTER = FALLBACK_TICKET_PANEL_FOOTER;

function isDefaultWelcomeDescription(text?) {
  const t = String(text || "").trim();
  if (!t) return true;
  return DEFAULT_WELCOME_DESC_SET.has(t);
}

function resolveTicketBotLanguage(guildId?, guild = null) {
  try {
    const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    const settings: any = getTicketSettingsSync(guildId) || {};
    const raw = String(settings.language || settings.lang || "server").trim().toLowerCase();
    if (raw && raw !== "server") {
      return normalizeTenantLanguage(raw);
    }
  } catch (_) {}
  const fromGuild = mapDiscordLocaleToTenantLanguage(guild?.preferredLocale);
  if (fromGuild) return fromGuild;
  return DEFAULT_LANGUAGE;
}

function wrapMentionsInSpoiler(content?) {
  const raw = String(content || "").trim();
  if (!raw) return "";
  if (raw.startsWith("||") && raw.endsWith("||")) return raw;
  return `||${raw}||`;
}

function isDefaultishSinglePanelEmbed(panel?) {
  if (!panel || typeof panel !== "object") return true;
  const title = String(panel.title || "").trim();
  const content = String(panel.content || "").trim();
  return (
    !content &&
    !panel.largeImageUrl &&
    !panel.smallImageUrl &&
    (!title || DEFAULT_PANEL_TITLE_SET.has(title))
  );
}

function isDefaultishMultiPanelEmbed(multi?) {
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

export = {
  DEFAULT_TICKET_PANEL_TITLE,
  DEFAULT_TICKET_PANEL_COLOR,
  DEFAULT_TICKET_PANEL_FOOTER,
  DEFAULT_TICKET_BUTTON_EMOJI,
  DEFAULT_TICKET_WELCOME_DESCRIPTION,
  DEFAULT_TICKET_WELCOME_COLOR,
  DEFAULT_TICKET_WELCOME_BY_LANG,
  DEFAULT_TICKET_PANEL_TITLE_BY_LANG,
  DEFAULT_TICKET_PANEL_DESC_BY_LANG,
  getDefaultWelcomeDescription,
  getDefaultTicketPanelTitle,
  getDefaultTicketPanelDescription,
  getDefaultTicketPanelFooter,
  isDefaultWelcomeDescription,
  resolveTicketBotLanguage,
  wrapMentionsInSpoiler,
  isDefaultishSinglePanelEmbed,
  isDefaultishMultiPanelEmbed,
};
