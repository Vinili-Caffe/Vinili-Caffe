const path = require("path");

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function run() {
  const root = path.resolve(__dirname, "..", "Vinyls");
  process.chdir(root);

  const utils = require(path.join(root, "Utils", "Community", "customVocWeeklyActivityUtils"));
  const service = require(path.join(root, "Services", "Community", "customVocWeeklyActivityService"));
  const {
    CUSTOM_VOC_WEEKLY_MIN_SECONDS,
    CUSTOM_VOC_MAX_FAILED_WEEKS,
    sumCustomVocVoiceSecondsFromHourly,
    sumCustomVocVoiceSecondsForWeek,
    listCompletedWeekEndMsForBackfill,
    buildCustomVocWeeklyActivityPanelState,
    buildCustomVocWeeklyActivityEmbedLines,
    formatCustomVocHoursFromSeconds,
  } = utils;
  const { isCustomVocRecreationBlocked } = service;

  assert(CUSTOM_VOC_WEEKLY_MIN_SECONDS === 18000, "min seconds should be 5h");
  assert(CUSTOM_VOC_MAX_FAILED_WEEKS === 3, "max failed weeks should be 3");

  const channelId = "123456789012345678";
  const weekEndMs = Date.UTC(2026, 5, 21, 19, 0, 0);
  const hourKey = "2026-06-21T18";
  const hourly = {
    [hourKey]: { voiceChannels: { [channelId]: 3600 } },
    "2026-06-20T10": { voiceChannels: { [channelId]: 7200 } },
  };
  const partial = sumCustomVocVoiceSecondsFromHourly(hourly, channelId, weekEndMs);
  assert(partial >= 3600, "should count at least one hour bucket");

  const profile = {
    profile: { totals: { hourly } },
    sessionChannelId: channelId,
    sessionStartedAt: new Date(Date.now() - 30 * 60 * 1000),
  };
  const withLive = sumCustomVocVoiceSecondsForWeek(profile, channelId, Date.now() + 3 * 24 * 60 * 60 * 1000, { includeLiveSession: true });
  assert(withLive >= 1800, "live session should add seconds");

  const weeks = listCompletedWeekEndMsForBackfill(Date.UTC(2026, 5, 21, 19, 0, 0), 0, 4);
  assert(Array.isArray(weeks) && weeks.length === 4, "backfill should return week boundaries");

  const panel = buildCustomVocWeeklyActivityPanelState(
    { customVocChannelId: channelId, customVocFailedWeekStreak: 2 },
    profile,
  );
  assert(panel.failedWeekStreak === 2, "panel should expose streak");
  assert(panel.weeksUntilDeletion === 1, "panel should compute weeks until deletion");
  const lines = buildCustomVocWeeklyActivityEmbedLines(panel);
  assert(lines.some((line) => line.includes("5h")), "embed should mention 5h requirement");

  const blocked = isCustomVocRecreationBlocked({ customVocRecreationBlockedUntil: new Date(Date.now() + 86400000) });
  assert(blocked === true, "recreation should be blocked when until is future");
  const unblocked = isCustomVocRecreationBlocked({ customVocRecreationBlockedUntil: new Date(Date.now() - 86400000) });
  assert(unblocked === false, "recreation should be open when until is past");

  assert(formatCustomVocHoursFromSeconds(5400) === "1.5h", "hours format");

  console.log("test-custom-voc-weekly-activity: ok");
}

try {
  run();
} catch (err) {
  console.error("test-custom-voc-weekly-activity: FAIL", err?.message || err);
  process.exit(1);
}