"use strict";

const DEFAULT_SITE_ORIGIN = "https://www.viniliecaffe.it";
const LEGACY_TICKET_PANEL_CHANNEL_ID = "1442569095068254219";

function sitePublicOrigin() {
  const raw = String(
    process.env.WEBSITE_PUBLIC_ORIGIN ||
      process.env.WEBSITE_PUBLIC_URL ||
      process.env.VC_SITE_URL ||
      process.env.SITE_URL ||
      DEFAULT_SITE_ORIGIN,
  ).trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return u.origin.replace("://viniliecaffe.it", "://www.viniliecaffe.it");
  } catch {
    return DEFAULT_SITE_ORIGIN;
  }
}

function siteTicketsPageUrl() {
  return `${sitePublicOrigin().replace(/\/+$/, "")}/tickets/`;
}

function siteTicketsPageDiscordRef(category?) {
  const cat = String(category || "").trim();
  const url = siteTicketsPageUrl();
  if (!cat) return `[ticket sul sito](${url})`;
  return `[ticket \`${cat.toUpperCase()}\` sul sito](${url})`;
}

function siteTicketsPagePlainRef(category?) {
  const cat = String(category || "").trim();
  const url = siteTicketsPageUrl();
  if (!cat) return `ticket sul sito: ${url}`;
  return `ticket \`${cat.toUpperCase()}\` sul sito: ${url}`;
}

function siteUserProfilePageUrl() {
  return `${sitePublicOrigin().replace(/\/+$/, "")}/personalizza/`;
}

function siteUserProfilePageDiscordRef() {
  return `[Personalizza](${siteUserProfilePageUrl()})`;
}

function siteUserProfilePagePlainRef() {
  return `Personalizza: ${siteUserProfilePageUrl()}`;
}

function isLegacyTicketPanelChannelId(channelId?) {
  return String(channelId || "").trim() === LEGACY_TICKET_PANEL_CHANNEL_ID;
}

export = {
  LEGACY_TICKET_PANEL_CHANNEL_ID,
  sitePublicOrigin,
  siteTicketsPageUrl,
  siteTicketsPageDiscordRef,
  siteTicketsPagePlainRef,
  siteUserProfilePageUrl,
  siteUserProfilePageDiscordRef,
  siteUserProfilePagePlainRef,
  isLegacyTicketPanelChannelId,
};
