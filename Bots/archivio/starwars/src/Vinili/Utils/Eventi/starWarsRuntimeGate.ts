/**
 * Gate runtime Star Wars: pubblico OFF → niente spawn automatici in chat.
 * HS può testare via comandi staff / sito.
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { resolveStarWarsEventConfig, isStarWarsPublicWindowOpen, getTestGuildIdSafe } = require("./starWarsEventConfig") as typeof import("./starWarsEventConfig");
const { FEATURES, resolveFeatureStateNow } = require("./starWarsEventCalendar") as typeof import("./starWarsEventCalendar");
const { memberIsHighStaffEligible } = require(__eventCoreVinili("Staff/utils/staffRoleHierarchy"));

function getMainGuildIdSafe() {
  try {
    const IDs = require(__eventCoreVinili("Config/ids"));
    return String(IDs.guilds?.main || "").trim();
  } catch (_) {
    return "";
  }
}

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

/**
 * HARD GATE chat pubblica:
 * - main: SOLO se publicEnabled + finestra pubblica aperta
 * - test: SOLO se testGuildForceLive
 * Niente “preview” sul main. Mai.
 */
function canPostStarWarsToGuildChat(client?, guildId?) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  const gid = String(guildId || "").trim();
  const testId = getTestGuildIdSafe();
  const mainId = getMainGuildIdSafe();
  const cfg = resolveStarWarsEventConfig(client);
  if (testId && gid && gid === testId) return Boolean(cfg.testGuildForceLive);
  if (mainId && gid && gid === mainId) return Boolean(flags.publicEnabled && flags.publicOpen);
  /* guild sconosciuta / assente: tratta come main (niente leak) */
  return Boolean(flags.publicEnabled && flags.publicOpen);
}

/** Auto-spawn in canali pubblici: solo se pubblico aperto (+ feature on). Mai sul main in anteprima. */
function canAutoSpawnFeature(client?, featureKey?, now = new Date()) {
  const flags = getRuntimeFlags(client);
  if (!flags.enabled) return false;
  /* previewAutoSpawn: SOLO server test (mai main), anche senza calendario */
  if (flags.previewAutoSpawn && !flags.publicEnabled) {
    const testId = getTestGuildIdSafe();
    if (!testId || !Boolean(resolveStarWarsEventConfig(client)?.testGuildForceLive)) return false;
    if (!isFeatureCalendarActive(featureKey, now) && featureKey !== FEATURES.AVVENTO) return true;
    return isFeatureCalendarActive(featureKey, now) || featureKey === FEATURES.AVVENTO;
  }
  if (!(flags.publicEnabled && flags.publicOpen)) return false;
  if (!isFeatureCalendarActive(featureKey, now) && featureKey !== FEATURES.AVVENTO) return false;
  return true;
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

/** Wallet smistato = ha factionId (quiz smistamento completato). */
function hasStarWarsFaction(wallet?) {
  return Boolean(String(wallet?.factionId || "").trim());
}

export = {
  FEATURES,
  getRuntimeFlags,
  isFeatureCalendarActive,
  canPostStarWarsToGuildChat,
  canAutoSpawnFeature,
  isHighStaffMember,
  canParticipateMember,
  hasStarWarsFaction,
  getMainGuildIdSafe,
};
