// Calendario pause: GET/POST /webhooks/site-staff-pause
// Handler: Vinili/Utils/Web/siteStaffPauseApi.js — UI: staff-pause-page.js

import { staffFetch, type ApiRes } from "./staff";

export const PAUSE_REASON_MIN = 8;
export const PAUSE_REASON_MAX = 500;

export type PauseRoleChoice = { value: string; label: string };

export type PauseDayEntry = {
  id: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  phase: string;
  ruolo: string;
  start: string;
  end: string;
};

export type PauseItem = {
  id: string;
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  start: string;
  end: string;
  startIso: string;
  endIso: string;
  motivazione?: string;
  ruolo: string;
  status: string;
  statusLabel?: string;
  phase: string;
  cancelled?: boolean;
};

export type PausePendingRequest = {
  dedupeKey: string;
  pauseId: string;
  status: string;
  statusLabel: string;
  preview?: string;
  start?: string;
  end?: string;
  ruoloRichiesto?: string;
  createdAt?: string | null;
};

export type PauseMe = {
  canRequest: boolean;
  roleChoices: PauseRoleChoice[];
  needsRolePick: boolean;
  minStartIso: string;
  reasonMin: number;
  reasonMax: number;
  pendingRequest?: PausePendingRequest | null;
};

export type PauseCalendar = {
  ok: true;
  year: number;
  month: number;
  today: string;
  timezone: string;
  count: number;
  pauses: PauseItem[];
  days: Record<string, PauseDayEntry[]>;
  me: PauseMe;
};

const BASE = "/webhooks/site-staff-pause";

export const MONTH_NAMES = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
] as const;

export function loadPauseMonth(token: string, year: number, month: number): Promise<ApiRes<PauseCalendar>> {
  return staffFetch<PauseCalendar>(`${BASE}?year=${year}&month=${month}`, token);
}

export function requestPause(
  token: string,
  body: { start: string; end: string; reason: string; role?: string },
): Promise<ApiRes<{ ok: true; message?: string; pauseId?: string; dedupeKey?: string }>> {
  return staffFetch(BASE, token, {
    method: "POST",
    body: {
      start: body.start,
      end: body.end,
      reason: body.reason,
      role: body.role,
    },
  });
}

export function phaseLabel(phase: string): string {
  switch (String(phase || "")) {
    case "upcoming":
    case "planned":
      return "Programmata";
    case "active":
      return "In corso";
    case "ended":
      return "Finita";
    case "cancelled":
      return "Annullata";
    default:
      return phase || "In corso";
  }
}

/** Fase relativa a un giorno del calendario (come staff-pause-page.js). */
export function phaseOnCalendarDay(startStr: string, endStr: string, dayIso: string): "planned" | "active" | "ended" {
  const parse = (s: string) => {
    const iso = String(s || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return Date.UTC(+iso[1]!, +iso[2]! - 1, +iso[3]!);
    const it = String(s || "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (it) return Date.UTC(+it[3]!, +it[2]! - 1, +it[1]!);
    return NaN;
  };
  const start = parse(startStr);
  const end = parse(endStr);
  const day = parse(dayIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(day)) return "active";
  if (day < start) return "planned";
  if (day > end) return "ended";
  return "active";
}

export function dayPhaseLabel(phase: string): string {
  if (phase === "planned") return "Quel giorno: non ancora iniziata";
  if (phase === "ended") return "Quel giorno: già terminata";
  return "Quel giorno: in pausa";
}

export const WEEKDAYS_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

/** Anno/mese correnti in Europe/Rome (come staff-pause-page.js). */
export function currentRomeYearMonth(date = new Date()): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value || date.getUTCFullYear());
  const m = Number(parts.find((p) => p.type === "month")?.value || date.getUTCMonth() + 1);
  return { year: y, month: m };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Indice lunedì=0 … domenica=6 del primo del mese (UTC). */
export function mondayIndexFirst(year: number, month: number): number {
  const dow = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0=dom
  return (dow + 6) % 7;
}

export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
}
