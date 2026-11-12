/** Validazione compleanno (Personalizza): niente date future, età minima 13. */

export const BIRTHDAY_MIN_AGE = 13;

export type BirthdayParts = { day: number; month: number; birthYear: number };

export function isRealCalendarDate(day: number, month: number, year: number): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) return false;
  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

export function ageFromParts(day: number, month: number, birthYear: number, now = new Date()): number | null {
  if (!isRealCalendarDate(day, month, birthYear)) return null;
  let age = now.getFullYear() - birthYear;
  const before =
    now.getMonth() + 1 < month || (now.getMonth() + 1 === month && now.getDate() < day);
  if (before) age -= 1;
  if (age < 0 || age > 120) return null;
  return age;
}

export function maxBirthYearForMinAge(minAge = BIRTHDAY_MIN_AGE, now = new Date()): number {
  return Math.max(1900, now.getFullYear() - Math.max(0, minAge));
}

/** null = ok; altrimenti messaggio errore IT. */
export function birthdayInputError(
  dayRaw: string | number | null | undefined,
  monthRaw: string | number | null | undefined,
  yearRaw: string | number | null | undefined,
  minAge = BIRTHDAY_MIN_AGE,
  now = new Date(),
): string | null {
  const day = Number(dayRaw);
  const month = Number(monthRaw);
  const birthYear = Number(yearRaw);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(birthYear)) {
    return "Indica giorno, mese e anno di nascita.";
  }
  if (!isRealCalendarDate(day, month, birthYear)) {
    return "Data di nascita non valida.";
  }
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const future =
    birthYear > y || (birthYear === y && (month > m || (month === m && day > d)));
  if (future) {
    return "La data di nascita non può essere nel futuro.";
  }
  const age = ageFromParts(day, month, birthYear, now);
  if (age == null) {
    return "Data di nascita non valida.";
  }
  if (age < minAge) {
    return `Devi avere almeno ${minAge} anni per impostare il compleanno.`;
  }
  if (age > 120) {
    return "Anno di nascita non valido.";
  }
  return null;
}
