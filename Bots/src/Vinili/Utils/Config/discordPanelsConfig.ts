"use strict";

/**
 * Discord channel panels (Vinili/Embeds) allowlist.
 * Site flows (ruoli, ticket, verify, candidature, pause, staff guide) stay on the website.
 *
 * Override: DISCORD_PANELS_ENABLED=info,sanzioni,sponsor
 */

const DEFAULT_ENABLED = Object.freeze([
  "info",
  "sanzioni",
  "sponsor",
]);

const PANEL_SITE_REPLACES = Object.freeze({
  /* pannelli Discord rimossi: redirect solo se qualcuno ripubblica */
  ruoli: "/ruoli/",
  ticket: "/tickets/",
  candidature: "/candidature/",
  pause: "/staff/pause/",
  staffList: "/staff/organico/",
  /* guida staff resta anche su Discord (Embeds/staff) */
  staff: "/staff/guida/",
  sponsor: null,
});

function parseEnabledFromEnv() {
  const raw = String(process.env.DISCORD_PANELS_ENABLED || "").trim();
  if (!raw) return null;
  const list = raw
    .split(/[,;\s]+/)
    .map((x?) => String(x || "").trim())
    .filter(Boolean);
  return list.length ? [...new Set(list)] : null;
}

function getEnabledDiscordPanelNames() {
  return parseEnabledFromEnv() || [...DEFAULT_ENABLED];
}

function isDiscordPanelEnabled(name?) {
  const key = String(name || "").trim();
  if (!key) return false;
  return getEnabledDiscordPanelNames().includes(key);
}

function siteReplacesForPanel(name?) {
  const key = String(name || "").trim();
  return Object.prototype.hasOwnProperty.call(PANEL_SITE_REPLACES, key)
    ? PANEL_SITE_REPLACES[key]
    : null;
}

export = {
  DEFAULT_ENABLED,
  PANEL_SITE_REPLACES,
  getEnabledDiscordPanelNames,
  isDiscordPanelEnabled,
  siteReplacesForPanel,
};
