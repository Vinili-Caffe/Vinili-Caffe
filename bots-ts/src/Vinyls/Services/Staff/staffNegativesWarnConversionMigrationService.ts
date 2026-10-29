"use strict";

const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getBotState, setBotState } = require("../../Utils/BotState/botStateStore") as typeof import("../../Utils/BotState/botStateStore");
const { isMongoReady } = require("../../Utils/Database/mongoConnect") as typeof import("../../Utils/Database/mongoConnect");
const { ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { consumeOldestNegativesFromStaff } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const {
  NEGATIVES_PER_STAFF_WARN,
  STAFF_WARN_THREE_NEGATIVES_REASON,
} = require("./staffWarnService") as typeof import("./staffWarnService");

const BOT_STATE_KEY = "staffNegativesWarnConversionMigrationV1";

function isAutoWarnFromNegativesReason(reasonText?) {
  const n = String(reasonText || "").trim().toLowerCase();
  if (!n) return false;
  const canonical = String(STAFF_WARN_THREE_NEGATIVES_REASON || "").trim().toLowerCase();
  if (n === canonical) return true;
  if (n === "3 valutazioni negative") return true;
  if (n === "assegna per aver raggiunto le 3 valutazioni negative") return true;
  if (n.includes("3 valutazioni negative") && (n.includes("warn assegnato") || n.includes("assegn"))) {
    return true;
  }
  return false;
}

function resolveConvertibleWarnCount(staff?) {
  const warnCount = Math.max(0, Math.floor(Number(staff?.warnCount) || 0));
  const reasons = Array.isArray(staff?.warnReasons) ? staff.warnReasons : [];
  const matched = reasons.filter((r?) => isAutoWarnFromNegativesReason(r)).length;
  if (matched > 0) return matched;
  return warnCount;
}

async function migrateStaffNegativesAlreadyConvertedToWarn(opts: Record<string, any> = {}) {
  const guildId = String(opts.guildId || IDs.guilds?.main || "").trim();
  if (!guildId) return { skipped: true, reason: "missing_guild" };
  if (!isMongoReady()) return { skipped: true, reason: "mongo_not_ready" };

  const force = Boolean(opts.force);
  const dryRun = opts.dryRun === true;
  const stateKey = String(opts.stateKey || BOT_STATE_KEY);

  if (!force && !dryRun) {
    const existing = await getBotState(stateKey, null);
    if (existing?.completedAt) {
      return {
        skipped: true,
        reason: "already_completed",
        profilesUpdated: Number(existing.profilesUpdated || 0),
        negativesHidden: Number(existing.negativesHidden || 0),
      };
    }
  }

  const docs = await ActivityUserProfile.find({
    guildId,
    "staff.warnCount": { $gte: 1 },
    "staff.negativeCount": { $gte: 1 },
  })
    .select("userId guildId staff")
    .catch(() => []);

  let profilesUpdated = 0;
  let negativesHidden = 0;
  const samples = [];

  for (const doc of Array.isArray(docs) ? docs : []) {
    const s = ensureStaff(doc);
    if (!s) continue;
    const convertibleWarns = resolveConvertibleWarnCount(s);
    if (convertibleWarns <= 0) continue;
    const owed = convertibleWarns * NEGATIVES_PER_STAFF_WARN;
    const toHide = Math.min(
      owed,
      Math.max(0, Math.floor(Number(s.negativeCount) || 0)),
      Array.isArray(s.negativeReasons) ? s.negativeReasons.length : 0,
    );
    if (toHide <= 0) continue;

    if (!dryRun) {
      const consumed = consumeOldestNegativesFromStaff(s, toHide);
      if (consumed.removed <= 0) continue;
      doc.markModified("staff");
      const saved = await doc.save().catch((err?) => {
        global.logger?.warn?.(
          "[STAFF NEG→WARN MIGRATION] save failed:",
          doc.userId,
          err?.message || err,
        );
        return null;
      });
      if (!saved) continue;
      profilesUpdated += 1;
      negativesHidden += consumed.removed;
      if (samples.length < 15) {
        samples.push({
          userId: String(doc.userId),
          hidden: consumed.removed,
          remainingNeg: consumed.finalNeg,
          warns: convertibleWarns,
        });
      }
    } else {
      profilesUpdated += 1;
      negativesHidden += toHide;
      if (samples.length < 15) {
        samples.push({
          userId: String(doc.userId),
          wouldHide: toHide,
          warns: convertibleWarns,
        });
      }
    }
  }

  if (!dryRun) {
    await setBotState(stateKey, {
      completedAt: new Date().toISOString(),
      guildId,
      profilesUpdated,
      negativesHidden,
      samples,
    });
  }

  global.logger?.info?.(
    `[STAFF NEG→WARN MIGRATION] guild=${guildId} dryRun=${dryRun} profiles=${profilesUpdated} negativesHidden=${negativesHidden}`,
  );
  return { ok: true, dryRun, profilesUpdated, negativesHidden, samples };
}

async function runStaffNegativesWarnConversionMigrationOnStartup(client?) {
  const envValue = String(process.env.MIGRATE_STAFF_NEG_WARN_CONVERSION_ON_STARTUP || "")
    .trim()
    .toLowerCase();
  if (["0", "false", "no", "off"].includes(envValue)) {
    return { skipped: true, reason: "disabled" };
  }
  void client;
  return migrateStaffNegativesAlreadyConvertedToWarn({ dryRun: false });
}

export = {
  BOT_STATE_KEY,
  migrateStaffNegativesAlreadyConvertedToWarn,
  runStaffNegativesWarnConversionMigrationOnStartup,
  resolveConvertibleWarnCount,
  isAutoWarnFromNegativesReason,
};
