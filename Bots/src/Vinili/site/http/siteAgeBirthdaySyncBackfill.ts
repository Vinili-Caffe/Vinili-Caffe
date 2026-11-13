"use strict";

/**
 * Pass una tantum: allinea autodichiarazione età ↔ compleanno profilo
 * per chi ha già usato il sito (chrome prefs) e/o ha già una data di nascita.
 */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/siteDocumentSchema") as typeof import("../../Community/schemas/siteDocumentSchema");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const {
  syncAgeAndBirthdayForUser,
  STAFF_UNDERAGE_THREAD_ID,
  MIN_AGE,
} = require("./siteAgeAttestApi") as typeof import("./siteAgeAttestApi");

const JOB_USER_ID = "__age_birthday_sync_v2__";
const DOC_TYPE = SITE_DOCUMENT_TYPE.SITE_AGE_ATTESTATION;
const BATCH = 80;

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

async function claimJob(force?) {
  const existing = await SiteDocument.findOne({ docType: DOC_TYPE, userId: JOB_USER_ID }).lean().catch(() => null);
  if (existing && !force) {
    const st = String(existing.status || "").trim();
    if (st === "done") return { ok: false, reason: "already_done", doc: existing };
    if (st === "running") {
      const started = Number(existing?.payload?.startedAtMs) || 0;
      if (started && Date.now() - started < 30 * 60_000) {
        return { ok: false, reason: "already_running", doc: existing };
      }
    }
  }
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, userId: JOB_USER_ID },
    {
      $set: {
        status: "running",
        payload: {
          kind: "age_birthday_sync_v2",
          startedAt: new Date().toISOString(),
          startedAtMs: Date.now(),
        },
      },
      $setOnInsert: { docType: DOC_TYPE, userId: JOB_USER_ID },
    },
    { upsert: true },
  ).catch(() => null);
  return { ok: true };
}

async function finishJob(stats?) {
  await SiteDocument.findOneAndUpdate(
    { docType: DOC_TYPE, userId: JOB_USER_ID },
    {
      $set: {
        status: "done",
        payload: {
          kind: "age_birthday_sync_v2",
          finishedAt: new Date().toISOString(),
          finishedAtMs: Date.now(),
          stats: stats || {},
        },
      },
    },
  ).catch(() => null);
}

async function collectCandidateUserIds(guildId?) {
  const ids = new Set();

  const withDobOrLogin = await ActivityUserProfile.find({
    guildId: String(guildId),
    $or: [
      { "profile.birthday.birthYear": { $gte: 1900 } },
      { "profile.siteChromePrefs": { $exists: true, $ne: null } },
    ],
  })
    .select("userId")
    .lean()
    .catch(() => []);

  for (const row of withDobOrLogin) {
    const uid = String(row?.userId || "").trim();
    if (/^\d{17,22}$/.test(uid)) ids.add(uid);
  }

  const attests = await SiteDocument.find({
    docType: DOC_TYPE,
    userId: { $type: "string", $regex: /^\d{17,22}$/ },
  })
    .select("userId")
    .lean()
    .catch(() => []);

  for (const row of attests) {
    const uid = String(row?.userId || "").trim();
    if (/^\d{17,22}$/.test(uid)) ids.add(uid);
  }

  return [...ids];
}

async function notifyBackfillSummary(client?, stats?) {
  try {
    const channel =
      client?.channels?.cache?.get?.(STAFF_UNDERAGE_THREAD_ID) ||
      (await client?.channels?.fetch?.(STAFF_UNDERAGE_THREAD_ID).catch(() => null));
    if (!channel || typeof channel.send !== "function") return;
    const underage = Array.isArray(stats?.underageIds) ? stats.underageIds : [];
    const unblocked = Array.isArray(stats?.unblockedIds) ? stats.unblockedIds : [];
    const resetFuture = Array.isArray(stats?.resetFutureIds) ? stats.resetFutureIds : [];
    if (
      !underage.length &&
      !unblocked.length &&
      !resetFuture.length &&
      !stats?.attestFromBirthday &&
      !stats?.birthdaySeeded
    ) {
      return;
    }
    const lines = [
      "**Sincronizzazione età / compleanno (sito) v2**",
      `Candidati: **${Number(stats?.candidates) || 0}**`,
      `Autodichiarazione da compleanno: **${Number(stats?.attestFromBirthday) || 0}**`,
      `Compleanno da autodichiarazione: **${Number(stats?.birthdaySeeded) || 0}**`,
      `Sbloccati (≥${MIN_AGE}): **${Number(stats?.unblockedEligible) || 0}**`,
      `Reset data futura: **${Number(stats?.resetFuture) || 0}**`,
      `Già allineati / skip: **${Number(stats?.skipped) || 0}**`,
      `Bloccati underage (<${MIN_AGE}): **${Number(stats?.blockedUnderage) || 0}**`,
    ];
    if (unblocked.length) {
      lines.push("", "Sbloccati (ID):");
      lines.push(unblocked.slice(0, 40).map((id?) => `\`${id}\``).join(", "));
      if (unblocked.length > 40) lines.push(`… e altri ${unblocked.length - 40}`);
    }
    if (resetFuture.length) {
      lines.push("", "Reset data futura (ID):");
      lines.push(resetFuture.slice(0, 40).map((id?) => `\`${id}\``).join(", "));
      if (resetFuture.length > 40) lines.push(`… e altri ${resetFuture.length - 40}`);
    }
    if (underage.length) {
      lines.push("", "Utenti bloccati in questo pass (ID):");
      lines.push(underage.slice(0, 40).map((id?) => `\`${id}\``).join(", "));
      if (underage.length > 40) lines.push(`… e altri ${underage.length - 40}`);
    }
    await channel.send({ content: lines.join("\n"), allowedMentions: { parse: [] } });
  } catch (err) {
    global.logger?.warn?.("[SITE-API] age-birthday sync notify:", err?.message || err);
  }
}

async function runAgeBirthdaySyncBackfill(client?, opts: Record<string, any> = {}) {
  const force =
    opts.force === true ||
    ["1", "true", "yes", "on"].includes(String(process.env.VC_AGE_BIRTHDAY_SYNC_FORCE || "").trim().toLowerCase());
  const claim = await claimJob(force);
  if (!claim.ok) {
    /* already_done = pass una tantum già fatto: niente log a ogni restart di site-api */
    if (claim.reason !== "already_done") {
      global.logger?.info?.(`[SITE-API] age-birthday sync skip: ${claim.reason}`);
    }
    return { ok: false, reason: claim.reason };
  }

  const guildId = resolveGuildId(client);
  if (!guildId) {
    await finishJob({ error: "missing_guild" });
    return { ok: false, reason: "missing_guild" };
  }

  const candidates = await collectCandidateUserIds(guildId);
  const stats = {
    candidates: candidates.length,
    attestFromBirthday: 0,
    birthdaySeeded: 0,
    okSynced: 0,
    unblockedEligible: 0,
    resetFuture: 0,
    blockedUnderage: 0,
    skipped: 0,
    errors: 0,
    underageIds: [],
    unblockedIds: [],
    resetFutureIds: [],
  };

  global.logger?.info?.(`[SITE-API] age-birthday sync v2 start: ${candidates.length} candidati`);

  for (let i = 0; i < candidates.length; i += BATCH) {
    const chunk = candidates.slice(i, i + BATCH);
    for (const userId of chunk) {
      try {
        const out = await syncAgeAndBirthdayForUser(client, userId);
        if (out.action === "attest_from_birthday") stats.attestFromBirthday += 1;
        else if (out.action === "birthday_seeded") stats.birthdaySeeded += 1;
        else if (out.action === "ok_synced") stats.okSynced += 1;
        else if (out.action === "unblocked_eligible") {
          stats.unblockedEligible += 1;
          stats.unblockedIds.push(userId);
        } else if (out.action === "reset_future") {
          stats.resetFuture += 1;
          stats.resetFutureIds.push(userId);
        } else if (out.action === "blocked_underage") {
          stats.blockedUnderage += 1;
          stats.underageIds.push(userId);
        } else stats.skipped += 1;
      } catch (err) {
        stats.errors += 1;
        global.logger?.warn?.(`[SITE-API] age-birthday sync user ${userId}:`, err?.message || err);
      }
    }
    /* yield event loop */
    await new Promise((r) => setTimeout(r, 25));
  }

  await finishJob(stats);
  void notifyBackfillSummary(client, stats);
  global.logger?.info?.("[SITE-API] age-birthday sync done:", stats);
  return { ok: true, stats };
}

function scheduleAgeBirthdaySyncBackfill(client?) {
  const disabled = ["0", "false", "no", "off"].includes(
    String(process.env.VC_AGE_BIRTHDAY_SYNC || "1").trim().toLowerCase(),
  );
  if (disabled) return;
  const delayMs = Math.max(5_000, Number(process.env.VC_AGE_BIRTHDAY_SYNC_DELAY_MS || 20_000) || 20_000);
  setTimeout(() => {
    runAgeBirthdaySyncBackfill(client).catch((err?) => {
      global.logger?.warn?.("[SITE-API] age-birthday sync failed:", err?.message || err);
    });
  }, delayMs).unref?.();
}

export = {
  runAgeBirthdaySyncBackfill,
  scheduleAgeBirthdaySyncBackfill,
  JOB_USER_ID,
};
