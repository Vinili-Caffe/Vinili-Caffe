const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../shared/scheduling/cronDetached") as typeof import("../../../shared/scheduling/cronDetached");
const { TIME_ZONE } = require("./movieNightSchedule") as typeof import("./movieNightSchedule");
const { ensureMovieNightReviewThreadTracking, closeMovieNightReviewThreadIfDue } = require("./movieNightReviewThread") as typeof import("./movieNightReviewThread");
const { runExtraMovieNightFinalAnnouncementCheck } = require("./movieNightExtraChecks") as typeof import("./movieNightExtraChecks");
const { runMovieNightStageCloseRecoveryCheck } = require("./movieNightStageCloseFlow") as typeof import("./movieNightStageCloseFlow");
const { ensureWatchedMovieNightTitlesReady } = require("../../Utils/Community/movieNightWatchedTitles") as typeof import("../../Utils/Community/movieNightWatchedTitles");
const ANNOUNCE_CRON = "0 15 * * 1";
const CLOSE_THREAD_CRON = "0 20 * * 5";
const FINAL_ANNOUNCEMENT_FRIDAY_CRON = "0 21 * * 5";
const FINAL_ANNOUNCEMENT_SATURDAY_CRON = "0 12 * * 6";
const EVENT_START_SWEEP_CRON = "*/2 * * * 3,6";
const STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4,6,0";
const REVIEW_THREAD_SWEEP_MS = 5 * 60 * 1000;
const EXTRA_FINAL_EVE_CRON = "0 21 * * 2";
const EXTRA_FINAL_DAY_CRON = "0 12 * * 3";
const EXTRA_EVENT_START_SWEEP_CRON = "*/2 * * * 3";
const EXTRA_STAGE_CLOSE_SWEEP_CRON = "*/5 * * * 3,4";

let movieNightAnnouncementTasks = null;
let movieNightReviewCloseSweep = null;
let lastStageCloseSweepReason = "";

function startMovieNightAnnouncementLoop(client?, checks?) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return null;
  if (!client || movieNightAnnouncementTasks) return movieNightAnnouncementTasks;
  if (!checks?.runMovieNightAnnouncementCheck) {
    throw new Error("[MOVIE NIGHT ANNOUNCE] loop checks missing");
  }
  const {
    runMovieNightAnnouncementCheck,
    runMovieNightThreadCloseCheck,
    runMovieNightFinalAnnouncementCheck,
    runMovieNightEventStartCheck,
  } = checks;

  ensureMovieNightReviewThreadTracking(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread tracking on loop start failed:", err?.message || err);
  });
  closeMovieNightReviewThreadIfDue(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close on loop start failed:", err?.message || err);
  });
  ensureWatchedMovieNightTitlesReady(client).catch((err?) => {
    global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] watched titles bootstrap failed:", err?.message || err);
  });
  const announceTask = cron.schedule(
    ANNOUNCE_CRON,
    runCronDetached("[MOVIE NIGHT ANNOUNCE]", () => runMovieNightAnnouncementCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const closeTask = cron.schedule(
    CLOSE_THREAD_CRON,
    runCronDetached("[MOVIE NIGHT THREAD CLOSE]", () => runMovieNightThreadCloseCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementFridayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_FRIDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE FRIDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "friday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const finalAnnouncementSaturdayTask = cron.schedule(
    FINAL_ANNOUNCEMENT_SATURDAY_CRON,
    runCronDetached("[MOVIE NIGHT FINAL ANNOUNCE SATURDAY]", () =>
      runMovieNightFinalAnnouncementCheck(client, { slot: "saturday" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalEveTask = cron.schedule(
    EXTRA_FINAL_EVE_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL EVE]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "eve" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const extraFinalDayTask = cron.schedule(
    EXTRA_FINAL_DAY_CRON,
    runCronDetached("[MOVIE NIGHT EXTRA FINAL DAY]", () =>
      runExtraMovieNightFinalAnnouncementCheck(client, { slot: "day" }),
    ),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const eventStartSweepTask = cron.schedule(
    EVENT_START_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT EVENT START]", () => runMovieNightEventStartCheck(client)),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  const stageCloseSweepTask = cron.schedule(
    STAGE_CLOSE_SWEEP_CRON,
    runCronDetached("[MOVIE NIGHT STAGE CLOSE]", async () => {
      /* serataCloseLog1: senza questo non si capiva perché la fine serata non partiva */
      const res = await runMovieNightStageCloseRecoveryCheck(client);
      const reason = String(res?.reason || (res?.ok ? "ok" : ""));
      if (reason !== "outside_window" && reason !== "close_already_done" && reason !== lastStageCloseSweepReason) {
        lastStageCloseSweepReason = reason;
        global.logger?.warn?.("[MOVIE NIGHT STAGE CLOSE] sweep:", JSON.stringify(res || null).slice(0, 300));
      }
      return res;
    }),
    { timezone: TIME_ZONE, noOverlap: true },
  );
  // keep EXTRA_EVENT_START/STAGE cron constants for documentation; sweeps already cover Wed via EVENT_START_SWEEP_CRON
  void EXTRA_EVENT_START_SWEEP_CRON;
  void EXTRA_STAGE_CLOSE_SWEEP_CRON;
  movieNightReviewCloseSweep = setInterval(() => {
    closeMovieNightReviewThreadIfDue(client).catch((err?) => {
      global.logger?.warn?.("[MOVIE NIGHT ANNOUNCE] review thread close sweep failed:", err?.message || err);
    });
  }, REVIEW_THREAD_SWEEP_MS);
  movieNightReviewCloseSweep.unref?.();
  movieNightAnnouncementTasks = {
    announceTask,
    closeTask,
    finalAnnouncementFridayTask,
    finalAnnouncementSaturdayTask,
    extraFinalEveTask,
    extraFinalDayTask,
    eventStartSweepTask,
    stageCloseSweepTask,
  };
  return movieNightAnnouncementTasks;
}

export = { startMovieNightAnnouncementLoop };
