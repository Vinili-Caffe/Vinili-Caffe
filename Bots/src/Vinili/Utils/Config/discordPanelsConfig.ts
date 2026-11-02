"use strict";

/**
 * Discord channel panels (Vinili/Embeds) allowlist.
 * Site flows (ruoli, ticket, verify, candidature, pause, staff guide) are site-only —
 * no Discord panel redirects / PANEL_SITE_REPLACES.
 *
 * Override: DISCORD_PANELS_ENABLED=info,sanzioni
 */

const DEFAULT_ENABLED = Object.freeze([
  "info",
  "sanzioni",
]);

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

export = {
  getEnabledDiscordPanelNames,
  isDiscordPanelEnabled,
};
