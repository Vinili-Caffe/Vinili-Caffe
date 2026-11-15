const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { listBirthdayProfilesForAgeBracketSync } = require("../services/profileStore") as typeof import("../services/profileStore");

const ROME_TZ = "Europe/Rome";

function getRomeDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

const AGE_BRACKET_ORDER_KEYS = ["1314", "1516", "1718", "19"];

const AGE_BRACKET_ROLE_IDS = AGE_BRACKET_ORDER_KEYS.map((k?) => String(IDs.roles?.[k] || "").trim()).filter(Boolean);

function computeAgeFromBirthParts(day?, month?, birthYear?, now = new Date()) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(birthYear)) return null;
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  if (birthYear < 1900 || birthYear > 2100) return null;
  const today = getRomeDateParts(now);
  if (birthYear > today.year) return null;
  const hasBirthdayPassed = today.month > month || (today.month === month && today.day >= day);
  return Math.max(0, today.year - Number(birthYear) - (hasBirthdayPassed ? 0 : 1));
}

async function resolveAgeBracketsConfig() {
  try {
    const BDAY = require("../../../MultiGuild/services/birthdaysRuntime") as typeof import("../../../MultiGuild/services/birthdaysRuntime");
    const cfg = await BDAY.getConfig(String(IDs.guilds?.main || ""));
    if (cfg && (cfg.userSaved || cfg.seedVersion > 0) && cfg.ageBrackets) return cfg.ageBrackets;
  } catch (_) {}
  return null;
}

function getAgeBracketRoleIdForAge(age?, ageBrackets?) {
  if (!Number.isFinite(age)) return { targetId: null, stripOnly: false, roleIds: AGE_BRACKET_ROLE_IDS };
  const ab = ageBrackets && typeof ageBrackets === "object" ? ageBrackets : null;
  if (ab && ab.enabled === false) return { targetId: null, stripOnly: false, roleIds: [] };
  const brackets = Array.isArray(ab?.brackets) && ab.brackets.length
    ? [...ab.brackets].sort((a?, b?) => Number(a.maxAge) - Number(b.maxAge))
    : null;
  const roleIds = brackets
    ? brackets.map((b?) => String(b.roleId || "").trim()).filter(Boolean)
    : AGE_BRACKET_ROLE_IDS;
  const minAge = Number.isFinite(Number(ab?.minAge)) ? Number(ab.minAge) : 13;
  if (age < minAge) return { targetId: null, stripOnly: true, roleIds };
  if (brackets?.length) {
    for (const row of brackets) {
      if (age <= Number(row.maxAge)) return { targetId: String(row.roleId || "").trim() || null, stripOnly: false, roleIds };
    }
    const last = brackets[brackets.length - 1];
    return { targetId: String(last?.roleId || "").trim() || null, stripOnly: false, roleIds };
  }
  if (age <= 14) return { targetId: String(IDs.roles?.["1314"] || "").trim() || null, stripOnly: false, roleIds };
  if (age <= 16) return { targetId: String(IDs.roles?.["1516"] || "").trim() || null, stripOnly: false, roleIds };
  if (age <= 18) return { targetId: String(IDs.roles?.["1718"] || "").trim() || null, stripOnly: false, roleIds };
  return { targetId: String(IDs.roles?.["19"] || "").trim() || null, stripOnly: false, roleIds };
}

async function applyAgeBracketRoleFromBirthday(guild?, userId?, day?, month?, birthYear?, now = new Date()) {
  const uid = String(userId || "").trim();
  if (!uid || !guild) return { ok: false, reason: "bad_args" };
  const age = computeAgeFromBirthParts(day, month, birthYear, now);
  if (age == null) return { ok: false, reason: "bad_age_inputs" };
  const ageBrackets = await resolveAgeBracketsConfig();
  const { targetId, stripOnly, roleIds } = getAgeBracketRoleIdForAge(age, ageBrackets);
  const member = await guild.members.fetch({ user: uid, force: false }).catch(() => null);
  if (!member) return { ok: false, reason: "member" };
  const reason = "Profilo: fascia d'età (compleanno)";
  const ids = Array.isArray(roleIds) && roleIds.length ? roleIds : AGE_BRACKET_ROLE_IDS;
  const had = ids.filter((rid?) => member.roles.cache.has(rid));

  if (stripOnly || !targetId) {
    if (!had.length) return { ok: true, unchanged: true };
    await member.roles.remove(had, reason).catch(() => {});
    return { ok: true, stripped: true };
  }

  if (had.length === 1 && had[0] === targetId) {
    return { ok: true, unchanged: true };
  }

  const toRemove = had.filter((rid?) => rid !== targetId);
  if (toRemove.length) await member.roles.remove(toRemove, reason).catch(() => {});
  const m2 = toRemove.length ? await guild.members.fetch({ user: uid, force: true }).catch(() => member) : member;
  if (!m2.roles.cache.has(targetId)) {
    await m2.roles.add(targetId, reason).catch(() => {});
  }
  return { ok: true };
}

const AGE_BRACKET_STARTUP_SYNC_BATCH = 5;
const AGE_BRACKET_STARTUP_SYNC_BATCH_DELAY_MS = 1200;

function sleep(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

async function syncAgeBracketRolesFromStoredBirthdays(client?) {
  const envRaw = String(process.env.AGE_BRACKET_BIRTHDAY_ROLE_SYNC_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(envRaw)) {
    return { skipped: true, reason: "env_disabled", processed: 0, applied: 0, guildMissing: 0, errors: 0 };
  }
  if (!client) {
    return { ok: false, processed: 0, applied: 0, guildMissing: 0, errors: 0 };
  }
  const rows = await listBirthdayProfilesForAgeBracketSync();
  let applied = 0;
  let guildMissing = 0;
  let errors = 0;
  for (let offset = 0; offset < rows.length; offset += AGE_BRACKET_STARTUP_SYNC_BATCH) {
    const slice = rows.slice(offset, offset + AGE_BRACKET_STARTUP_SYNC_BATCH);
    const batchStats = await Promise.all(
      slice.map(async (row?) => {
        try {
          const guild =
            client.guilds.cache.get(row.guildId) || (await client.guilds.fetch(row.guildId).catch(() => null));
          if (!guild) return { kind: "guildMissing" };
          const result = await applyAgeBracketRoleFromBirthday(
            guild,
            row.userId,
            row.day,
            row.month,
            row.birthYear,
          );
          if (result?.ok) return { kind: "applied" };
          return { kind: "noop" };
        } catch {
          return { kind: "error" };
        }
      }),
    );
    for (const s of batchStats) {
      if (s.kind === "guildMissing") guildMissing += 1;
      else if (s.kind === "applied") applied += 1;
      else if (s.kind === "error") errors += 1;
    }
    if (offset + AGE_BRACKET_STARTUP_SYNC_BATCH < rows.length) {
      await sleep(AGE_BRACKET_STARTUP_SYNC_BATCH_DELAY_MS);
    }
  }
  return {
    ok: true,
    processed: rows.length,
    applied,
    guildMissing,
    errors,
  };
}

export = {
  applyAgeBracketRoleFromBirthday,
  syncAgeBracketRolesFromStoredBirthdays,
};