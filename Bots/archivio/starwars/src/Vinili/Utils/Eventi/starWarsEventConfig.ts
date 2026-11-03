/**
 * Evento Star Wars 2026/27 — finestra globale + eventKey.
 * Calendario giorno-per-giorno: starWarsEventCalendar.js
 */
"use strict";


const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { parseEventDateMs } = require(__eventCoreVinili("Community/utils/eventDates"));

const DEFAULT_EVENT_KEY = "starwars_2026";

function readBool(v?, fallback?) {
  if (v === true || v === false) return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "1" || s === "true" || s === "yes") return true;
  if (s === "0" || s === "false" || s === "no") return false;
  return fallback;
}

function resolveStarWarsEventConfig(client?) {
  const raw =
    (client?.config?.starWarsEvent && typeof client.config.starWarsEvent === "object"
      ? client.config.starWarsEvent
      : null) || {};
  const enabled = readBool(process.env.STARWARS_EVENT_ENABLED ?? raw.enabled, true);
  /* publicEnabled=false → NESSUN accesso pubblico (solo High Staff), anche dopo il 1° dic. */
  const publicEnabled = readBool(process.env.STARWARS_EVENT_PUBLIC ?? raw.publicEnabled, false);
  const timezone = String(process.env.STARWARS_EVENT_TZ || raw.timezone || "Europe/Rome").trim() || "Europe/Rome";
  const startDate = String(process.env.STARWARS_EVENT_START || raw.startDate || "2026-12-01T00:00:00").trim();
  const endDate = String(process.env.STARWARS_EVENT_END || raw.endDate || "2027-02-28T23:59:59").trim();
  const publicOpenDate = String(
    process.env.STARWARS_EVENT_PUBLIC_OPEN || raw.publicOpenDate || "2026-12-01T00:00:00",
  ).trim();
  const eventKey = String(process.env.STARWARS_EVENT_KEY || raw.eventKey || DEFAULT_EVENT_KEY).trim() || DEFAULT_EVENT_KEY;
  return {
    enabled,
    publicEnabled,
    timezone,
    startDate,
    endDate,
    publicOpenDate,
    startMs: parseEventDateMs(startDate, timezone, "00:00:00"),
    endMs: parseEventDateMs(endDate, timezone, "23:59:59"),
    publicOpenMs: parseEventDateMs(publicOpenDate, timezone, "00:00:00"),
    eventKey,
  };
}

function isStarWarsEventEnabled(client?) {
  return Boolean(resolveStarWarsEventConfig(client)?.enabled);
}

/** Pubblico solo se `publicEnabled` + dopo publicOpenDate. Di default OFF (solo HS). */
function isStarWarsPublicWindowOpen(client?, now = new Date()) {
  const cfg = resolveStarWarsEventConfig(client);
  if (!cfg.enabled || !cfg.publicEnabled) return false;
  const t = now instanceof Date ? now.getTime() : Date.now();
  if (!Number.isFinite(cfg.publicOpenMs)) return false;
  return t >= cfg.publicOpenMs && t <= cfg.endMs;
}

function isStarWarsEventLive(client?, now = new Date()) {
  const cfg = resolveStarWarsEventConfig(client);
  if (!cfg.enabled) return false;
  const t = now instanceof Date ? now.getTime() : Date.now();
  return t >= cfg.startMs && t <= cfg.endMs;
}

/** Parts Rome Y/M/D. */
function romeYmd(now = new Date(), timeZone = "Europe/Rome") {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((p?) => p.type !== "literal")
      .map((p?) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    iso: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export = {
  DEFAULT_EVENT_KEY,
  resolveStarWarsEventConfig,
  isStarWarsEventEnabled,
  isStarWarsPublicWindowOpen,
  isStarWarsEventLive,
  romeYmd,
};
