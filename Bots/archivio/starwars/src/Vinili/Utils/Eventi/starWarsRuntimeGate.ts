/**
 * Gate runtime Star Wars: pubblico OFF → niente spawn automatici in chat.
 * HS può testare via comandi staff / sito.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { resolveStarWarsEventConfig, isStarWarsPublicWindowOpen } = require("./starWarsEventConfig") as typeof import("./starWarsEventConfig");
const { FEATURES, resolveFeatureStateNow } = require("./starWarsEventCalendar") as typeof import("./starWarsEventCalendar");
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Utils/Staff/staffRoleHierarchy"));

function readBool(v?, fallback?) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(s)) return true;
  if (["0", "false", "no", "off"].includes(s)) return false;
  return fallback;
}

function getRuntimeFlags(client?) {
  const cfg = resolveStarWarsEventConfig(client);
  const raw = (client?.config?.starWarsEvent && typeof client.config.starWarsEvent === "object"
    ? client.config.starWarsEvent
    : {}) || {};
  return {
    enabled: Boolean(cfg.enabled),
    publicEnabled: Boolean(cfg.publicEnabled),
    publicOpen: isStarWarsPublicWindowOpen(client),
    /** Se true con publicEnabled=false: loops seguono calendario anche in anteprima (ATTENZIONE chat). Default false. */
    previewAutoSpawn: readBool(process.env.STARWARS_PREVIEW_AUTO_SPAWN ?? raw.previewAutoSpawn, false),
    staffChannelId: String(raw.staffChannelId || "").trim(),
    chatChannelId: String(raw.chatChannelId || "").trim(),
    eventKey: cfg.eventKey,
  };
}

function isFeatureCalendarActive(featureKey?, now = new Date()) {
  const state = resolveFeatureStateNow(now);
  return Boolean(state.features?.includes(featureKey));
}

/** Auto-spawn in canali pubblici: solo se pubblico aperto (+ feature on). */
function canAutoSpawnFeature(client?, featureKey?, now = new Date()) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  if (!isFeatureCalendarActive(featureKey, now) && featureKey !== FEATURES.AVVENTO) {
    /* previewAutoSpawn: ignora calendario ma richiede comunque !public? no — solo se flag */
    if (!(flags.previewAutoSpawn && !flags.publicEnabled)) return false;
  }
  if (flags.publicEnabled && flags.publicOpen) return isFeatureCalendarActive(featureKey, now);
  if (flags.previewAutoSpawn && !flags.publicEnabled) return true;
  return false;
}

function isHighStaffMember(member?) {
  return Boolean(member && memberIsHighStaffEligible(member));
}

/** Sito / API: partecipare = HS oppure pubblico aperto. */
function canParticipateMember(client?, member?) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  if (isHighStaffMember(member)) return true;
  return flags.publicEnabled && flags.publicOpen;
}

export = {
  FEATURES,
  getRuntimeFlags,
  isFeatureCalendarActive,
  canAutoSpawnFeature,
  isHighStaffMember,
  canParticipateMember,
};
