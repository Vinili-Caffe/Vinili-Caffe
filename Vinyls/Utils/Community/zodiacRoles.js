const IDs = require("../Config/ids");
const { listBirthdayProfilesForZodiacSync } = require("../../Services/Community/profileStore");

const ZODIAC_ORDER_KEYS = [
  "zodiacAries",
  "zodiacTaurus",
  "zodiacGemini",
  "zodiacCancer",
  "zodiacLeo",
  "zodiacVirgo",
  "zodiacLibra",
  "zodiacScorpio",
  "zodiacSagittarius",
  "zodiacCapricorn",
  "zodiacAquarius",
  "zodiacPisces",
];

const ZODIAC_ROLE_IDS = ZODIAC_ORDER_KEYS.map((k) => String(IDs.roles?.[k] || "").trim()).filter(Boolean);

function getZodiacRoleIdForBirthday(month, day) {
  const m = Math.floor(Number(month));
  const d = Math.floor(Number(day));
  if (!Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const R = (k) => String(IDs.roles?.[k] || "").trim();
  if (m === 12 && d >= 22) return R("zodiacCapricorn") || null;
  if (m === 1 && d <= 19) return R("zodiacCapricorn") || null;
  if (m === 1 && d >= 20) return R("zodiacAquarius") || null;
  if (m === 2 && d <= 18) return R("zodiacAquarius") || null;
  if (m === 2 && d >= 19) return R("zodiacPisces") || null;
  if (m === 3 && d <= 20) return R("zodiacPisces") || null;
  if (m === 3 && d >= 21) return R("zodiacAries") || null;
  if (m === 4 && d <= 19) return R("zodiacAries") || null;
  if (m === 4 && d >= 20) return R("zodiacTaurus") || null;
  if (m === 5 && d <= 20) return R("zodiacTaurus") || null;
  if (m === 5 && d >= 21) return R("zodiacGemini") || null;
  if (m === 6 && d <= 20) return R("zodiacGemini") || null;
  if (m === 6 && d >= 21) return R("zodiacCancer") || null;
  if (m === 7 && d <= 22) return R("zodiacCancer") || null;
  if (m === 7 && d >= 23) return R("zodiacLeo") || null;
  if (m === 8 && d <= 22) return R("zodiacLeo") || null;
  if (m === 8 && d >= 23) return R("zodiacVirgo") || null;
  if (m === 9 && d <= 22) return R("zodiacVirgo") || null;
  if (m === 9 && d >= 23) return R("zodiacLibra") || null;
  if (m === 10 && d <= 22) return R("zodiacLibra") || null;
  if (m === 10 && d >= 23) return R("zodiacScorpio") || null;
  if (m === 11 && d <= 21) return R("zodiacScorpio") || null;
  if (m === 11 && d >= 22) return R("zodiacSagittarius") || null;
  if (m === 12 && d <= 21) return R("zodiacSagittarius") || null;
  return null;
}

async function applyZodiacRoleFromBirthday(guild, userId, month, day) {
  const uid = String(userId || "").trim();
  if (!uid || !guild) return { ok: false, reason: "bad_args" };
  const targetId = getZodiacRoleIdForBirthday(month, day);
  const member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
  if (!member) return { ok: false, reason: "member" };
  const reason = "Compleanno: segno zodiacale";
  const had = ZODIAC_ROLE_IDS.filter((rid) => member.roles.cache.has(rid));
  if (had.length) await member.roles.remove(had, reason).catch(() => {});
  if (!targetId) return { ok: true, stripped: true };
  const fresh = await guild.members.fetch({ user: uid, force: true }).catch(() => member);
  if (!fresh.roles.cache.has(targetId)) {
    await fresh.roles.add(targetId, reason).catch(() => {});
  }
  return { ok: true };
}

async function stripAllZodiacRoles(guild, userId) {
  const uid = String(userId || "").trim();
  if (!uid || !guild) return;
  const member = await guild.members.fetch({ user: uid, force: true }).catch(() => null);
  if (!member) return;
  const had = ZODIAC_ROLE_IDS.filter((rid) => member.roles.cache.has(rid));
  if (!had.length) return;
  await member.roles.remove(had, "Compleanno: profilo rimosso").catch(() => {});
}

const ZODIAC_STARTUP_SYNC_BATCH = 5;
const ZODIAC_STARTUP_SYNC_BATCH_DELAY_MS = 1200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * All'avvio: riallinea il ruolo segno zodiacale per chi ha già il compleanno nel profilo.
 * Disabilitabile con ZODIAC_BIRTHDAY_ROLE_SYNC_ON_STARTUP=0|false|off|no
 */
async function syncZodiacRolesFromStoredBirthdays(client) {
  const envRaw = String(process.env.ZODIAC_BIRTHDAY_ROLE_SYNC_ON_STARTUP || "").trim().toLowerCase();
  if (["0", "false", "off", "no"].includes(envRaw)) {
    return { skipped: true, reason: "env_disabled", processed: 0, applied: 0, guildMissing: 0, badTarget: 0, errors: 0 };
  }
  if (!client) {
    return { ok: false, processed: 0, applied: 0, guildMissing: 0, badTarget: 0, errors: 0 };
  }
  const rows = await listBirthdayProfilesForZodiacSync();
  let applied = 0;
  let guildMissing = 0;
  let badTarget = 0;
  let errors = 0;
  for (let offset = 0; offset < rows.length; offset += ZODIAC_STARTUP_SYNC_BATCH) {
    const slice = rows.slice(offset, offset + ZODIAC_STARTUP_SYNC_BATCH);
    const batchStats = await Promise.all(
      slice.map(async (row) => {
        try {
          if (!getZodiacRoleIdForBirthday(row.month, row.day)) return { kind: "badTarget" };
          const guild =
            client.guilds.cache.get(row.guildId) ||
            (await client.guilds.fetch(row.guildId).catch(() => null));
          if (!guild) return { kind: "guildMissing" };
          const result = await applyZodiacRoleFromBirthday(guild, row.userId, row.month, row.day);
          if (result?.ok) return { kind: "applied" };
          return { kind: "noop" };
        } catch {
          return { kind: "error" };
        }
      }),
    );
    for (const s of batchStats) {
      if (s.kind === "badTarget") badTarget += 1;
      else if (s.kind === "guildMissing") guildMissing += 1;
      else if (s.kind === "applied") applied += 1;
      else if (s.kind === "error") errors += 1;
    }
    if (offset + ZODIAC_STARTUP_SYNC_BATCH < rows.length) {
      await sleep(ZODIAC_STARTUP_SYNC_BATCH_DELAY_MS);
    }
  }
  return {
    ok: true,
    processed: rows.length,
    applied,
    guildMissing,
    badTarget,
    errors,
  };
}

module.exports = {
  ZODIAC_ROLE_IDS,
  getZodiacRoleIdForBirthday,
  applyZodiacRoleFromBirthday,
  stripAllZodiacRoles,
  syncZodiacRolesFromStoredBirthdays,
};