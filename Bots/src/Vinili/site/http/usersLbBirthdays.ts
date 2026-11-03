/** Classifiche utenti: compleanni del mese. */
const { readCachedWebsiteMember } = require("./websiteGuildMemberFetch") as typeof import("./websiteGuildMemberFetch");
const { listBirthdaysForMonth } = require("../../Community/services/profileStore") as typeof import("../../Community/services/profileStore");
const { getRomeDateParts } = require("../../Community/services/birthdayService") as typeof import("../../Community/services/birthdayService");
const { fetchUserIdentity } = require("./usersLbIdentity") as typeof import("./usersLbIdentity");

const IT_MONTH_NAMES = [
  "",
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

function computeAgeFromBirthYear(day?, month?, birthYear?, romeToday?) {
  const y = Number(birthYear);
  if (!Number.isFinite(y) || y < 1900) return null;
  let age = Number(romeToday.year) - y;
  if (romeToday.month < month || (romeToday.month === month && romeToday.day < day)) age -= 1;
  return age >= 0 ? age : null;
}

function formatPublicBirthdayLabel(day?, month?, birthYear?, showAge?) {
  const d = Number(day);
  const m = Number(month);
  if (!d || !m || m < 1 || m > 12) return "";
  const monthName = IT_MONTH_NAMES[m] || String(m);
  const canShowYear = showAge !== false && Number.isFinite(Number(birthYear)) && Number(birthYear) >= 1900;
  return canShowYear ? `${d} ${monthName} ${Number(birthYear)}` : `${d} ${monthName}`;
}

function buildPublicBirthdayPayload(birthdayRaw?, romeToday?) {
  const day = Number(birthdayRaw?.day || 0);
  const month = Number(birthdayRaw?.month || 0);
  if (!day || !month || day < 1 || day > 31 || month < 1 || month > 12) return null;
  const showAge = birthdayRaw?.showAge !== false;
  const birthYear =
    showAge && Number.isFinite(Number(birthdayRaw?.birthYear)) && Number(birthdayRaw.birthYear) >= 1900
      ? Number(birthdayRaw.birthYear)
      : null;
  const isToday = romeToday.month === month && romeToday.day === day;
  const age = birthYear != null ? computeAgeFromBirthYear(day, month, birthYear, romeToday) : null;
  return {
    day,
    month,
    birthYear,
    showAge,
    isToday,
    age: showAge && age != null ? age : null,
    label: formatPublicBirthdayLabel(day, month, birthYear, showAge),
    shortLabel: `${day} ${(IT_MONTH_NAMES[month] || "").slice(0, 3)}`,
  };
}

async function buildBirthdaysMonthPayload(client?, guildId?, month?, year?) {
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const romeToday = getRomeDateParts();
  const rows = await listBirthdaysForMonth(guildId, month);
  const entries = [];
  for (const row of rows) {
    const userId = String(row.userId || "").trim();
    if (!userId) continue;
    const member = guild?.members?.cache?.get?.(userId) || readCachedWebsiteMember(userId) || null;
    const identity = await fetchUserIdentity(client, guild, userId, {
      member,
      skipUserFetch: Boolean(member),
    });
    const displayName = String(identity?.displayName || identity?.username || userId).trim() || userId;
    entries.push({
      userId,
      day: row.day,
      month: row.month,
      birthYear: row.showAge ? row.birthYear : null,
      showAge: row.showAge !== false,
      isToday: row.month === romeToday.month && row.day === romeToday.day,
      displayName,
      profileUrl: `/user/?id=${encodeURIComponent(userId)}`,
      label: formatPublicBirthdayLabel(row.day, row.month, row.birthYear, row.showAge),
    });
  }
  entries.sort((a?, b?) => {
    if (a.day !== b.day) return a.day - b.day;
    return String(a.displayName || "").localeCompare(String(b.displayName || ""), "it", { sensitivity: "base" });
  });
  return {
    ok: true,
    board: "birthdays",
    month,
    year,
    monthLabel: IT_MONTH_NAMES[month] || String(month),
    todayDay: romeToday.month === month ? romeToday.day : null,
    total: entries.length,
    entries,
  };
}

export = { buildPublicBirthdayPayload, buildBirthdaysMonthPayload };
