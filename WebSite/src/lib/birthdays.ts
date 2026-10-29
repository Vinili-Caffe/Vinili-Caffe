// Calendario compleanni: GET /webhooks/site-users?board=birthdays&month=&year=
import { apiUrl } from "./api";

export type BirthdayEntry = {
  userId: string;
  day: number;
  month: number;
  birthYear: number | null;
  showAge: boolean;
  isToday?: boolean;
  displayName: string;
  profileUrl: string;
  label: string;
};

export type BirthdaysMonth = {
  ok: true;
  board: "birthdays";
  month: number;
  year: number;
  monthLabel: string;
  todayDay: number | null;
  total: number;
  entries: BirthdayEntry[];
};

const MONTHS_IT = [
  "",
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
];

export function shiftMonth(month: number, year: number, delta: number) {
  let m = month + delta;
  let y = year;
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  return { month: m, year: y };
}

export function daysInMonth(month: number, year: number) {
  return new Date(year, month, 0).getDate();
}

/** Lunedì=0 … Domenica=6 (come il calendario del sito vecchio). */
export function leadingBlanks(month: number, year: number) {
  const dow = new Date(year, month - 1, 1).getDay();
  return dow === 0 ? 6 : dow - 1;
}

export function groupByDay(entries: BirthdayEntry[]) {
  const map: Record<number, BirthdayEntry[]> = {};
  for (const e of entries) {
    const d = Number(e.day) || 0;
    if (!d) continue;
    (map[d] ||= []).push(e);
  }
  return map;
}

export function entryMeta(entry: BirthdayEntry, calendarYear: number) {
  let meta = String(entry.label || "").trim();
  if (!meta && entry.day) {
    meta = `${entry.day} ${String(MONTHS_IT[entry.month] || "").toLowerCase()}`;
  }
  const by = Number(entry.birthYear);
  if (entry.showAge !== false && Number.isFinite(by) && by >= 1900) {
    const turning = calendarYear - by;
    if (turning >= 0 && turning <= 120) meta += ` · compie ${turning} anni`;
  }
  return meta;
}

export async function loadBirthdaysMonth(month: number, year: number): Promise<BirthdaysMonth | null> {
  try {
    const q = new URLSearchParams({
      board: "birthdays",
      month: String(month),
      year: String(year),
    });
    const r = await fetch(apiUrl(`/webhooks/site-users?${q}`), { cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.ok || j.board !== "birthdays") return null;
    return {
      ok: true,
      board: "birthdays",
      month: Number(j.month) || month,
      year: Number(j.year) || year,
      monthLabel: String(j.monthLabel || MONTHS_IT[month] || month),
      todayDay: j.todayDay == null ? null : Number(j.todayDay),
      total: Number(j.total) || 0,
      entries: Array.isArray(j.entries) ? j.entries : [],
    };
  } catch {
    return null;
  }
}
