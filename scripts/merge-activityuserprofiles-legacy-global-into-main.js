/**
 * Unisce i documenti `activityuserprofiles` con guildId legacy `__global__` nel documento della guild principale
 * (`ACTIVITY_MAIN_GUILD_ID` = ids.guilds.main o env ACTIVITY_MAIN_GUILD_ID), poi elimina i duplicati `__global__`.
 *
 * Campi uniti: moderation.automodBadUser, moderation.joinGateSuspicious, profile.globalOneTimeReminder.entries,
 * profile.sponsorMainLeave (merge non distruttivo: max contatori, date più recenti, dedup promemoria per key).
 *
 * Ordine consigliato dopo deploy del codice che usa ACTIVITY_MAIN_GUILD_ID:
 *   1) node scripts/merge-activityuserprofiles-legacy-global-into-main.js --apply
 *   2) (opzionale) node scripts/migrate-moderation-into-activityuserprofiles.js --apply
 *
 * Uso:
 *   node scripts/merge-activityuserprofiles-legacy-global-into-main.js
 *   node scripts/merge-activityuserprofiles-legacy-global-into-main.js --apply
 *   node scripts/merge-activityuserprofiles-legacy-global-into-main.js --apply --limit 10
 *
 * Richiede .env: MONGO_URL_LOCAL | MONGODB_URI_LOCAL | MONGO_URL | MONGODB_URI
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const mongoose = require("mongoose");
const {
  ActivityUserProfile,
  ACTIVITY_MAIN_GUILD_ID,
} = require("../Vinyls/Schemas/Community/communitySchemas");
const { automodBadUser, joinGateSuspicious, sponsorMainLeave } = require("../Vinyls/Utils/Community/activityUserProfilePaths");

const LEGACY_GLOBAL_GUILD_ID = "__global__";

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

const REMINDER_MAX = Math.max(
  50,
  Number(process.env.ONE_TIME_REMINDER_MAX_ENTRIES_PER_USER) || 500,
);

function argHas(flag) {
  return process.argv.includes(flag);
}

function argNum(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function pickLater(a, b) {
  const ta = a ? new Date(a).getTime() : 0;
  const tb = b ? new Date(b).getTime() : 0;
  return ta >= tb ? a : b;
}

function mergeStrArrays(a, b) {
  return [
    ...new Set([
      ...(Array.isArray(a) ? a : []).map(String),
      ...(Array.isArray(b) ? b : []).map(String),
    ]),
  ];
}

function mergeAutomod(a, b) {
  if (!a && !b) return null;
  const x = a || {};
  const y = b || {};
  return {
    totalTriggers: Math.max(Number(x.totalTriggers || 0), Number(y.totalTriggers || 0)),
    warnPoints: Math.max(Number(x.warnPoints || 0), Number(y.warnPoints || 0)),
    activeStrikes: Math.max(Number(x.activeStrikes || 0), Number(y.activeStrikes || 0)),
    timeoutActions: Math.max(Number(x.timeoutActions || 0), Number(y.timeoutActions || 0)),
    lastTriggerAt: pickLater(x.lastTriggerAt, y.lastTriggerAt),
    lastActionAt: pickLater(x.lastActionAt, y.lastActionAt),
    lastGuildId: x.lastGuildId || y.lastGuildId || null,
    lastHeat: Math.max(Number(x.lastHeat || 0), Number(y.lastHeat || 0)),
    lastAction: x.lastAction || y.lastAction || null,
    activeStrikeReasons: mergeStrArrays(x.activeStrikeReasons, y.activeStrikeReasons),
    reasons: mergeStrArrays(x.reasons, y.reasons),
  };
}

function mergeJoinGate(a, b) {
  if (!a && !b) return null;
  if (!a) return { ...b };
  if (!b) return { ...a };
  const ea = a.expiresAt ? new Date(a.expiresAt).getTime() : 0;
  const eb = b.expiresAt ? new Date(b.expiresAt).getTime() : 0;
  return ea >= eb ? { ...a } : { ...b };
}

function normalizeSponsor(s) {
  return {
    leftAt: s.leftAt ?? null,
    kickAt: s.kickAt ?? null,
    dmSent: Boolean(s.dmSent),
    dmFailed: Boolean(s.dmFailed),
  };
}

function mergeSponsorLeave(a, b) {
  if (!a && !b) return null;
  if (!a) return normalizeSponsor(b);
  if (!b) return normalizeSponsor(a);
  const ka = a.kickAt ? new Date(a.kickAt).getTime() : 0;
  const kb = b.kickAt ? new Date(b.kickAt).getTime() : 0;
  return ka >= kb ? normalizeSponsor(a) : normalizeSponsor(b);
}

function mergeReminderEntries(a, b) {
  const list = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])];
  const byKey = new Map();
  for (const e of list) {
    if (!e || e.key == null) continue;
    const k = String(e.key);
    const prev = byKey.get(k);
    if (!prev) {
      byKey.set(k, e);
      continue;
    }
    const prevSent = prev.sentAt != null;
    const eSent = e.sentAt != null;
    if (prevSent && !eSent) {
      byKey.set(k, e);
    } else if (prevSent === eSent) {
      const pt = new Date(prev.sendAt || 0).getTime();
      const et = new Date(e.sendAt || 0).getTime();
      if (et >= pt) byKey.set(k, e);
    }
  }
  return [...byKey.values()].slice(-REMINDER_MAX);
}

async function mergeOneLegacyDoc(legacyDoc, apply) {
  const userId = String(legacyDoc.userId || "").trim();
  if (!userId) return { skipped: true, reason: "no_user_id" };

  const mainG = ACTIVITY_MAIN_GUILD_ID;
  if (!mainG || mainG === LEGACY_GLOBAL_GUILD_ID) {
    return { error: true, reason: "bad_main_guild", userId };
  }

  const mainDoc = await ActivityUserProfile.findOne({ guildId: mainG, userId }).lean();

  const mergedAm = mergeAutomod(
    legacyDoc.moderation?.automodBadUser,
    mainDoc?.moderation?.automodBadUser,
  );
  const mergedJg = mergeJoinGate(
    legacyDoc.moderation?.joinGateSuspicious,
    mainDoc?.moderation?.joinGateSuspicious,
  );
  const mergedEntries = mergeReminderEntries(
    legacyDoc.profile?.globalOneTimeReminder?.entries,
    mainDoc?.profile?.globalOneTimeReminder?.entries,
  );
  const mergedSponsor = mergeSponsorLeave(
    legacyDoc.profile?.sponsorMainLeave,
    mainDoc?.profile?.sponsorMainLeave,
  );

  const $set = {};
  if (mergedAm) $set[automodBadUser()] = mergedAm;
  if (mergedJg) $set[joinGateSuspicious()] = mergedJg;
  if (mergedEntries.length) {
    $set["profile.globalOneTimeReminder.entries"] = mergedEntries;
  }
  if (mergedSponsor) {
    $set[sponsorMainLeave()] = mergedSponsor;
  }

  if (!apply) {
    return {
      ok: true,
      dryRun: true,
      userId,
      keys: Object.keys($set),
    };
  }

  if (Object.keys($set).length) {
    await ActivityUserProfile.updateOne(
      { guildId: mainG, userId },
      { $set, $setOnInsert: { guildId: mainG, userId } },
      { upsert: true, setDefaultsOnInsert: true },
    ).catch((e) => ({ error: String(e?.message || e) }));
  }

  const del = await ActivityUserProfile.deleteOne({
    guildId: LEGACY_GLOBAL_GUILD_ID,
    userId,
  });
  return { ok: true, userId, deletedLegacy: del.deletedCount || 0 };
}

async function main() {
  const apply = argHas("--apply");
  const limit = argNum("--limit", 0);

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL_LOCAL|MONGODB_URI_LOCAL|MONGO_URL|MONGODB_URI in .env");
    process.exit(1);
  }

  if (!ACTIVITY_MAIN_GUILD_ID || ACTIVITY_MAIN_GUILD_ID === LEGACY_GLOBAL_GUILD_ID) {
    console.error(
      "ACTIVITY_MAIN_GUILD_ID mancante o non valido (ids.guilds.main o env ACTIVITY_MAIN_GUILD_ID)",
    );
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URL);

    const filter = { guildId: LEGACY_GLOBAL_GUILD_ID };
    const cursor = ActivityUserProfile.find(filter).cursor();
    const report = {
      mode: apply ? "apply" : "dry-run",
      mainGuildId: ACTIVITY_MAIN_GUILD_ID,
      legacyGuildId: LEGACY_GLOBAL_GUILD_ID,
      scanned: 0,
      merged: 0,
      deletedLegacy: 0,
      errors: [],
    };

    for await (const doc of cursor) {
      if (limit > 0 && report.scanned >= limit) break;
      report.scanned += 1;
      const plain = typeof doc.toObject === "function" ? doc.toObject() : doc;
      const r = await mergeOneLegacyDoc(plain, apply);
      if (r.error) {
        report.errors.push(r);
        continue;
      }
      if (r.ok && !r.skipped) report.merged += 1;
      if (r.deletedLegacy) report.deletedLegacy += r.deletedLegacy;
    }

    console.log(JSON.stringify(report, null, 2));
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});