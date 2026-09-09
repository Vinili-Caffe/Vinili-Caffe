(function () {
  var WD_EN = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };
  var IT_MONTHS = [
    "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
    "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
  ];

  function eventCfg() {
    try {
      return window.__VC_SERATAFILM_EVENT || {};
    } catch (e) {
      return {};
    }
  }

  var zonedDtfCache = {};

  function getZonedDtf(tz) {
    var key = String(tz || "Europe/Rome");
    if (!zonedDtfCache[key]) {
      zonedDtfCache[key] = new Intl.DateTimeFormat("en-US", {
        timeZone: key,
        weekday: "long",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      });
    }
    return zonedDtfCache[key];
  }

  function getZonedParts(utcMs, tz) {
    var o = {};
    var parts = getZonedDtf(tz).formatToParts(new Date(utcMs));
    for (var i = 0; i < parts.length; i += 1) {
      var x = parts[i];
      if (x.type !== "literal") o[x.type] = x.value;
    }
    var wd = WD_EN[o.weekday];
    return {
      weekday: typeof wd === "number" ? wd : -1,
      year: +o.year,
      month: +o.month,
      day: +o.day,
      hour: +o.hour,
      minute: +o.minute,
      second: +o.second,
    };
  }

  function toDateKey(year, month, day) {
    return (
      String(year).padStart(4, "0") +
      "-" +
      String(month).padStart(2, "0") +
      "-" +
      String(day).padStart(2, "0")
    );
  }

  function getRomeSaturdayDateKey(nowMs, tz) {
    var p = getZonedParts(nowMs, tz);
    var daysBack = (p.weekday - 6 + 7) % 7;
    var utcDate = Date.UTC(p.year, p.month - 1, p.day) - daysBack * 86400000;
    var sp = getZonedParts(utcDate, tz);
    return toDateKey(sp.year, sp.month, sp.day);
  }

  function getRomeOffsetMs(utcDate) {
    var formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Rome",
      timeZoneName: "shortOffset",
      hour: "2-digit",
    });
    var zoneName = formatter.formatToParts(utcDate).find(function (part) {
      return part.type === "timeZoneName";
    });
    var match = String((zoneName && zoneName.value) || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
    if (!match) return 0;
    var sign = match[1] === "-" ? -1 : 1;
    var hours = Number(match[2] || 0);
    var minutes = Number(match[3] || 0);
    return sign * (hours * 60 + minutes) * 60 * 1000;
  }

  function createUtcFromRomeLocal(year, month, day, hour, minute, tz) {
    var baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, 0);
    var firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
    var utcMs = baseUtcMs - firstOffsetMs;
    var secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
    if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
    return utcMs;
  }

  function nextWeeklyMatchMs(tz, wantWd, wantH, wantM, nowMs) {
    var p = getZonedParts(nowMs, tz);
    var daysAhead = (wantWd - p.weekday + 7) % 7;
    var targetDate = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead));
    var targetMs = createUtcFromRomeLocal(
      targetDate.getUTCFullYear(),
      targetDate.getUTCMonth() + 1,
      targetDate.getUTCDate(),
      wantH,
      wantM,
      tz,
    );
    if (targetMs <= nowMs) {
      targetDate = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead + 7));
      targetMs = createUtcFromRomeLocal(
        targetDate.getUTCFullYear(),
        targetDate.getUTCMonth() + 1,
        targetDate.getUTCDate(),
        wantH,
        wantM,
        tz,
      );
    }
    return targetMs;
  }

  function resolveFilmAtMs(nowMs, bump) {
    var cfg = eventCfg();
    var iso = String(cfg.overrideIso || "").trim();
    if (iso) {
      var t0 = Date.parse(iso);
      if (Number.isFinite(t0)) return t0;
    }
    var tz = String(cfg.timezone || "Europe/Rome").trim() || "Europe/Rome";
    var rec = cfg.recurring || cfg.weekly || {};
    var wdn = Number.isFinite(Number(rec.weekday))
      ? Math.max(0, Math.min(6, Math.floor(Number(rec.weekday))))
      : 6;
    var h = Number.isFinite(Number(rec.hour)) ? Math.max(0, Math.min(23, Math.floor(Number(rec.hour)))) : 21;
    var m = Number.isFinite(Number(rec.minute)) ? Math.max(0, Math.min(59, Math.floor(Number(rec.minute)))) : 0;
    return nextWeeklyMatchMs(tz, wdn, h, m, bump ? nowMs + 1000 : nowMs);
  }

  function normalizeSchedule(cfg) {
    var raw = Array.isArray(cfg.schedule) ? cfg.schedule : [];
    var out = [];
    for (var i = 0; i < raw.length; i += 1) {
      var row = raw[i];
      if (!row || typeof row !== "object") continue;
      var date = String(row.date || "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (row.skip) {
        out.push({ date: date, skip: true, title: "" });
        continue;
      }
      var title = String(row.title || "").trim();
      if (!title) continue;
      out.push({ date: date, skip: false, title: title });
    }
    out.sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    return out;
  }

  function resolveCurrentScreeningDateKey(nowMs) {
    var cfg = eventCfg();
    var tz = String(cfg.timezone || "Europe/Rome").trim() || "Europe/Rome";
    var iso = String(cfg.overrideIso || "").trim();
    if (iso) {
      var t0 = Date.parse(iso);
      if (Number.isFinite(t0)) {
        var p = getZonedParts(t0, tz);
        return toDateKey(p.year, p.month, p.day);
      }
    }
    return getRomeSaturdayDateKey(nowMs, tz);
  }

  function resolveNextScreening(nowMs) {
    var cfg = eventCfg();
    var tz = String(cfg.timezone || "Europe/Rome").trim() || "Europe/Rome";
    var rec = cfg.recurring || cfg.weekly || {};
    var hour = Number.isFinite(Number(rec.hour)) ? Math.max(0, Math.min(23, Math.floor(Number(rec.hour)))) : 21;
    var minute = Number.isFinite(Number(rec.minute)) ? Math.max(0, Math.min(59, Math.floor(Number(rec.minute)))) : 0;
    var schedule = normalizeSchedule(cfg);
    var currentKey = resolveCurrentScreeningDateKey(nowMs);
    var nextRow = null;
    for (var i = 0; i < schedule.length; i += 1) {
      var row = schedule[i];
      if (row.skip) continue;
      if (row.date > currentKey) {
        nextRow = row;
        break;
      }
    }
    if (!nextRow) {
      var fallbackMs = resolveFilmAtMs(nowMs, true);
      var fp = getZonedParts(fallbackMs, tz);
      return {
        title: String(cfg.nextFilmTitle || cfg.filmTitle || "il prossimo film").trim() || "il prossimo film",
        dateKey: toDateKey(fp.year, fp.month, fp.day),
        atMs: fallbackMs,
        hour: hour,
        minute: minute,
      };
    }
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(nextRow.date);
    var atMs = createUtcFromRomeLocal(Number(m[1]), Number(m[2]), Number(m[3]), hour, minute, tz);
    return {
      title: nextRow.title,
      dateKey: nextRow.date,
      atMs: atMs,
      hour: hour,
      minute: minute,
    };
  }

  function formatScreeningDateLabel(dateKey, hour, minute) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || "").trim());
    if (!m) return "presto";
    var day = Number(m[3]);
    var monthName = IT_MONTHS[Math.max(0, Number(m[2]) - 1)] || "";
    var year = m[1];
    var hh = String(hour).padStart(2, "0");
    var mm = String(minute).padStart(2, "0");
    return "sabato " + day + " " + monthName + " " + year + ", alle " + hh + ":" + mm;
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resolveHogwartsEventWindow() {
    try {
      var bgm = window.__VC_SERATAFILM_BGM || {};
      var w = bgm.hogwartsEventWindow;
      if (w && w.enabled === false) return null;
      if (w && Number.isFinite(Number(w.startMs)) && Number.isFinite(Number(w.endMs))) {
        return w;
      }
      var ev = eventCfg();
      w = ev.hogwartsEventWindow;
      if (w && w.enabled === false) return null;
      if (w && Number.isFinite(Number(w.startMs)) && Number.isFinite(Number(w.endMs))) {
        return w;
      }
      /* No silent Hogwarts fallback from theme video URL when window is off. */
    } catch (eW) {}
    return null;
  }

  function isHogwartsEventWindowActive(nowMs) {
    var w = resolveHogwartsEventWindow();
    if (!w || w.enabled === false) return false;
    var now = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
    var start = Number(w.startMs);
    var end = Number(w.endMs);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
    return now >= start && now < end;
  }

  window.__vcSeratafilmEventUtils = {
    eventCfg: eventCfg,
    resolveHogwartsEventWindow: resolveHogwartsEventWindow,
    isHogwartsEventWindowActive: isHogwartsEventWindowActive,
    resolveCurrentScreeningDateKey: resolveCurrentScreeningDateKey,
    resolveNextScreening: resolveNextScreening,
    formatScreeningDateLabel: formatScreeningDateLabel,
    escapeHtml: escapeHtml,
    resolveThanksPageUrl: function () {
      try {
        return new URL("grazie/", window.location.href).href;
      } catch (eU) {
        return "grazie/";
      }
    },
  };
})();