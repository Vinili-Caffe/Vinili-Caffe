/** Pause: sync messaggi Discord dismesso (solo sito). Resta cancel su leave → DB/workflow. */
const { ActivityUserProfile } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { getPausePhase } = require("./pauseMessages") as typeof import("./pauseMessages");
const { getStaffPauseRecord } = require("./pauseMessages") as typeof import("./pauseMessages");
const { updatePauseInDb, computeConsumedDaysForCancelledPause } = require("./pauseDb") as typeof import("./pauseDb");

async function syncSingleAcceptedPauseMessage(_guild?, _userId?, _pause?) {
  return false;
}

async function scheduleAcceptedPauseMessagesRefreshAfterRankChange(_guild?, _userId?) {
  return;
}

async function rewriteStaleCancelledPauseMessages(_client?) {
  return { ok: true, examined: 0, rewritten: 0 };
}

async function cancelOpenPausesOnMemberLeave(guild?, userId?, options: Record<string, any> = {}) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  if (!guildId || !uid) return { cancelled: 0 };
  const stafferRecord = await getStaffPauseRecord(guildId, uid);
  if (!stafferRecord) return { cancelled: 0 };
  const pauses = Array.isArray(stafferRecord.staff?.pauses) ? stafferRecord.staff.pauses : [];
  if (!pauses.length) return { cancelled: 0 };

  let cancelled = 0;

  for (const pause of pauses) {
    const status = String(pause?.status || "");
    const pauseId = String(pause?._id || "").trim();
    if (!pauseId) continue;

    if (status === "pending") {
      await updatePauseInDb(guildId, uid, pauseId, { status: "cancelled", cancelledAt: new Date() });
      pause.status = "cancelled";
      pause.cancelledAt = new Date();
      cancelled += 1;
      try {
        const { updateStaffWorkflowFromPause } = require("../../workflow/siteStaffWorkflowStore") as typeof import("../../workflow/siteStaffWorkflowStore");
        await updateStaffWorkflowFromPause(guildId, uid, pauseId, "cancelled", {
          statusLabel: String(options.reason || "Annullato (uscita)").slice(0, 200),
          staffReason: String(options.reason || "Annullato (uscita)").slice(0, 200),
          decidedBy: "system",
        });
      } catch (_) {}
      continue;
    }

    if (status !== "accepted") continue;
    if (getPausePhase(pause.dataRichiesta, pause.dataRitorno) === "ended") continue;

    const consumed = computeConsumedDaysForCancelledPause(pause);
    await updatePauseInDb(guildId, uid, pauseId, {
      status: "cancelled",
      giorniUsati: consumed,
      cancelledAt: new Date(),
    });
    pause.status = "cancelled";
    pause.giorniUsati = consumed;
    pause.cancelledAt = new Date();
    cancelled += 1;
  }

  if (cancelled > 0) {
    try {
      const { broadcastSiteStaffPausesChanged } = require("../../suggestions/siteSuggestionsBroadcast") as typeof import("../../suggestions/siteSuggestionsBroadcast");
      broadcastSiteStaffPausesChanged();
    } catch {
    }
    try {
      if (/^\d{16,22}$/.test(uid)) {
        require("../siteStaffProfileApi").clearStaffProfileCacheForUser(uid, { action: "pause" });
      }
    } catch {
    }
  }
  return { cancelled };
}

export = {
  syncSingleAcceptedPauseMessage,
  scheduleAcceptedPauseMessagesRefreshAfterRankChange,
  cancelOpenPausesOnMemberLeave,
  rewriteStaleCancelledPauseMessages,
};
