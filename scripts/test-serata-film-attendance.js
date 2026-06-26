const assert = require("assert");
const {
  getRomeSaturdayKeyForWeek,
  canEditSerataFilmAttendance,
  resolveSerataFilmAttendanceForWeek,
  isSerataFilmAbsentExcused,
  parseSerataFilmAttendanceCustomId,
} = require("../Vinyls/Utils/Staff/serataFilmAttendanceUtils");

function run() {
  const fri = new Date("2026-06-19T12:00:00+02:00");
  const sat = new Date("2026-06-20T12:00:00+02:00");
  const satKey = getRomeSaturdayKeyForWeek(fri);
  assert(satKey === "2026-06-20", "saturday key from friday");
  assert(canEditSerataFilmAttendance(fri, satKey) === true, "editable on friday");
  assert(canEditSerataFilmAttendance(sat, satKey) === false, "not editable on saturday");

  const defaultState = resolveSerataFilmAttendanceForWeek({}, fri);
  assert(defaultState.willAttend === true, "default will attend");
  assert(defaultState.declaredAbsent === false, "default not absent");

  const absentStaff = { serataFilmAttendanceSaturdayKey: satKey, serataFilmWillAttend: false };
  const absentState = resolveSerataFilmAttendanceForWeek(absentStaff, fri);
  assert(absentState.willAttend === false, "declared absent");
  assert(isSerataFilmAbsentExcused(absentStaff, satKey) === true, "excused absent");
  assert(isSerataFilmAbsentExcused(absentStaff, "2026-06-13") === false, "wrong week not excused");

  const parsed = parseSerataFilmAttendanceCustomId("staff_profile_panel:sf_att:no:111:222:333");
  assert(parsed?.action === "no" && parsed.viewerId === "111" && parsed.targetId === "222", "parse sf_att");
}

module.exports = run;
if (require.main === module) {
  run();
  console.log("SERATA_FILM_ATTENDANCE_TEST_OK");
}