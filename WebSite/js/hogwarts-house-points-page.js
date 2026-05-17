(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var HOUSE_ORDER = ["gryffindor", "ravenclaw", "hufflepuff", "slytherin"];
  var dynamicPoints = null;
  var FALLBACK = {
    gryffindor: { label: "Grifondoro", points: 0, color: "#b9202a", accent: "#f5c542" },
    ravenclaw: { label: "Corvonero", points: 0, color: "#1f5fbf", accent: "#b98a4b" },
    hufflepuff: { label: "Tassorosso", points: 0, color: "#e3b22f", accent: "#1c1710" },
    slytherin: { label: "Serpeverde", points: 0, color: "#1f7a4d", accent: "#c9d2d0" },
  };

  function byId(id) {
    return document.getElementById(id);
  }

  function isLocalFrontendOrigin() {
    try {
      var h = window.location.hostname;
      return h === "localhost" || h === "127.0.0.1" || h === "";
    } catch (_) {
      return false;
    }
  }

  function accessApiUrl() {
    var direct = String(window.__VC_HOGWARTS_POINTS_ACCESS_API || "").trim();
    var local = String(window.__VC_HOGWARTS_POINTS_ACCESS_API_LOCAL || "").trim();
    if (isLocalFrontendOrigin() && local && local !== "/access") return local;
    return direct || "/webhooks/site-hogwarts-sorting/access";
  }

  function pointsApiUrl() {
    var direct = String(window.__VC_HOGWARTS_POINTS_API || "").trim();
    var local = String(window.__VC_HOGWARTS_POINTS_API_LOCAL || "").trim();
    if (isLocalFrontendOrigin() && local && local !== "/points") return local;
    return direct || "/webhooks/site-hogwarts-sorting/points";
  }

  function getToken() {
    try {
      var t = localStorage.getItem(ACCESS_TOKEN_KEY);
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!t || !exp || Date.now() >= exp) return "";
      return t;
    } catch (_) {
      return "";
    }
  }

  function setHidden(el, hidden) {
    if (!el) return;
    el.hidden = Boolean(hidden);
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function hideLoading() {
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
    } catch (_) {}
    var loading = byId("vc-hw-loading");
    if (loading) {
      try {
        loading.remove();
      } catch (_) {
        loading.style.display = "none";
      }
    }
  }

  function revealShell() {
    var app = byId("vc-hw-points-app");
    setHidden(app, false);
    hideLoading();
  }

  function showGate(message, showLogin) {
    revealShell();
    setHidden(byId("vc-hw-points-school-board"), true);
    setHidden(byId("vc-hw-points-event-board"), true);
    var gate = byId("vc-hw-points-gate");
    var msg = byId("vc-hw-points-gate-msg");
    var login = byId("vc-hw-points-gate-login");
    if (msg) msg.textContent = String(message || "Accesso non disponibile.");
    setHidden(login, !showLogin);
    setHidden(gate, false);
  }

  function showBoard() {
    revealShell();
    setHidden(byId("vc-hw-points-gate"), true);
    setHidden(byId("vc-hw-points-school-board"), false);
    setHidden(byId("vc-hw-points-event-board"), false);
    render();
  }

  function numberOf(v) {
    var n = Math.floor(Number(v) || 0);
    return n > 0 ? n : 0;
  }

  function getBoardConfig(key) {
    var cfg = window.__VC_HOGWARTS_POINTS || {};
    var boards = cfg.boards && typeof cfg.boards === "object" ? cfg.boards : {};
    var board = boards[key] && typeof boards[key] === "object" ? boards[key] : null;
    return board || cfg;
  }

  function readItems(boardCfg) {
    var houses = boardCfg.houses && typeof boardCfg.houses === "object" ? boardCfg.houses : {};
    return HOUSE_ORDER.map(function (id) {
      var row = houses[id] && typeof houses[id] === "object" ? houses[id] : {};
      var fb = FALLBACK[id];
      return {
        id: id,
        label: String(row.label || fb.label),
        motto: String(row.motto || ""),
        points: numberOf(row.points),
        color: String(row.color || fb.color),
        accent: String(row.accent || fb.accent),
        crestUrl: String(row.crestUrl || ""),
      };
    });
  }

  function readMaxPoints(boardCfg) {
    var n = Math.floor(Number(boardCfg.maxPoints) || 10000);
    return n > 0 ? n : 10000;
  }

  function readScaleStops(boardCfg) {
    var raw = Array.isArray(boardCfg.scaleStops) ? boardCfg.scaleStops : [];
    var out = raw.map(numberOf).filter(Boolean);
    if (!out.length) out = [500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    return out.sort(function (a, b) {
      return a - b;
    });
  }

  function resolveScaleMax(items, boardCfg) {
    var top = Math.max.apply(null, items.map(function (x) { return x.points; }).concat([0]));
    if (top <= 0) return readMaxPoints(boardCfg);
    var target = top * 4;
    var stops = readScaleStops(boardCfg);
    for (var i = 0; i < stops.length; i += 1) {
      if (stops[i] >= target) return stops[i];
    }
    return Math.ceil(target / 10000) * 10000;
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parsePeriodDate(value, endOfDay) {
    var s = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
    var d = new Date(s + (endOfDay ? "T23:59:59.999" : "T00:00:00"));
    var ms = d.getTime();
    return Number.isFinite(ms) ? ms : null;
  }

  function getActivePeriod(periods) {
    var list = Array.isArray(periods) ? periods : [];
    var now = Date.now();
    for (var i = 0; i < list.length; i += 1) {
      var period = list[i];
      if (!period || typeof period !== "object") continue;
      var start = parsePeriodDate(period.startDate, false);
      var end = parsePeriodDate(period.endDate, true);
      if (Number.isFinite(start) && Number.isFinite(end) && now >= start && now <= end) return period;
    }
    return null;
  }

  function periodKey(period) {
    if (!period || typeof period !== "object") return "";
    var start = String(period.startDate || "").trim();
    var end = String(period.endDate || "").trim();
    return start && end ? start + "_" + end : "";
  }

  function renderActivePeriod(el, periods) {
    if (!el) return;
    var period = getActivePeriod(periods);
    if (!period) {
      setHidden(el, true);
      el.innerHTML = "";
      return;
    }
    var label = String(period.label || "").trim();
    var range = String(period.range || period.duration || "").trim();
    el.innerHTML = '<span>' + esc("Fascia attiva: " + label + (label && range ? " · " : "") + range) + "</span>";
    setHidden(el, false);
  }

  function renderBoard(key, ids) {
    var grid = byId(ids.grid);
    if (!grid) return;
    var boardCfg = getBoardConfig(key);
    var title = byId(ids.title);
    var subtitle = byId(ids.subtitle);
    if (title && boardCfg.title) title.textContent = String(boardCfg.title);
    if (subtitle && boardCfg.subtitle) subtitle.textContent = String(boardCfg.subtitle);
    renderActivePeriod(byId(ids.periods), boardCfg.periods);
    var items = readItems(boardCfg);
    var dynamicTotals = null;
    if (dynamicPoints && key === "eventTotal") dynamicTotals = dynamicPoints.totals;
    if (dynamicPoints && key === "schoolYear") {
      var active = getActivePeriod(boardCfg.periods);
      var activeKey = periodKey(active);
      dynamicTotals = activeKey && dynamicPoints.byPeriod ? dynamicPoints.byPeriod[activeKey] : null;
    }
    if (dynamicTotals && typeof dynamicTotals === "object") {
      items = items.map(function (house) {
        var next = Object.assign({}, house);
        next.points += numberOf(dynamicTotals[house.id]);
        return next;
      });
    }
    var scaleMax = resolveScaleMax(items, boardCfg);
    var sorted = items.slice().sort(function (a, b) {
      return b.points - a.points;
    });
    grid.innerHTML = items.map(function (house) {
      var pct = house.points > 0 ? Math.min(86, Math.max(4, Math.round((house.points / scaleMax) * 94))) : 0;
      var rank = sorted.findIndex(function (x) { return x.id === house.id; }) + 1;
      var crest = house.crestUrl
        ? '<img class="vc-hw-hourglass__crest" src="' + esc(house.crestUrl) + '" alt="" width="72" height="72" decoding="async">'
        : "";
      return (
        '<article class="vc-hw-hourglass vc-hw-hourglass--' + esc(house.id) + '" data-fill="' + pct + '%" style="--house-color:' + esc(house.color) + ';--house-accent:' + esc(house.accent) + ';--fill:0%;--top-fill:92%">' +
          '<div class="vc-hw-hourglass__rank">#' + rank + "</div>" +
          '<div class="vc-hw-hourglass__top">' +
            crest +
            '<h2>' + esc(house.label) + "</h2>" +
            (house.motto ? '<p>' + esc(house.motto) + "</p>" : "") +
          "</div>" +
          '<div class="vc-hw-hourglass__glass" aria-hidden="true">' +
            '<div class="vc-hw-hourglass__cap vc-hw-hourglass__cap--top"></div>' +
            '<div class="vc-hw-hourglass__bulb vc-hw-hourglass__bulb--top"><span class="vc-hw-hourglass__sand vc-hw-hourglass__sand--top"></span></div>' +
            (house.points > 0 ? '<div class="vc-hw-hourglass__stream"></div>' : "") +
            '<div class="vc-hw-hourglass__neck"></div>' +
            '<div class="vc-hw-hourglass__bulb vc-hw-hourglass__bulb--bottom"><span class="vc-hw-hourglass__sand vc-hw-hourglass__sand--bottom"></span></div>' +
            '<div class="vc-hw-hourglass__cap vc-hw-hourglass__cap--bottom"></div>' +
          "</div>" +
          '<p class="vc-hw-hourglass__points"><strong>' + house.points.toLocaleString("it-IT") + "</strong> punti</p>" +
        "</article>"
      );
    }).join("");

    requestAnimationFrame(function () {
      var cards = grid.querySelectorAll(".vc-hw-hourglass");
      for (var i = 0; i < cards.length; i += 1) {
        cards[i].style.setProperty("--fill", cards[i].getAttribute("data-fill") || "0%");
        cards[i].classList.add("vc-hw-hourglass--pouring");
      }
      setTimeout(function () {
        for (var j = 0; j < cards.length; j += 1) {
          cards[j].classList.remove("vc-hw-hourglass--pouring");
        }
      }, 3800);
    });
  }

  function render() {
    renderBoard("schoolYear", {
      grid: "vc-hw-points-school-grid",
      title: "vc-hw-points-school-title",
      subtitle: "vc-hw-points-school-subtitle",
      periods: "vc-hw-points-school-periods",
    });
    renderBoard("eventTotal", {
      grid: "vc-hw-points-event-grid",
      title: "vc-hw-points-event-title",
      subtitle: "vc-hw-points-event-subtitle",
      periods: "vc-hw-points-event-periods",
    });
  }

  async function checkAccess() {
    var token = getToken();
    var headers = token ? { Authorization: "Bearer " + token } : {};
    var res = await fetch(accessApiUrl(), { method: "GET", headers: headers, cache: "no-store" });
    var data = await res.json().catch(function () {
      return {};
    });
    if (res.ok && data && data.ok) {
      showBoard();
      refreshDynamicPoints(headers).catch(function () {});
      return;
    }
    if (res.status === 401) {
      showGate("Accedi con Discord per visualizzare questa pagina in anteprima.", true);
      return;
    }
    showGate((data && data.message) || "In anteprima questa pagina è riservata all'High Staff del server.", false);
  }

  async function refreshDynamicPoints(headers) {
    var res = await fetch(pointsApiUrl(), { method: "GET", headers: headers || {}, cache: "no-store" });
    var data = await res.json().catch(function () {
      return {};
    });
    if (!res.ok || !data || !data.ok || !data.points) return;
    dynamicPoints = data.points;
    render();
  }

  function boot() {
    revealShell();
    checkAccess().catch(function () {
      showGate("Impossibile verificare l'accesso. Riprova tra poco.", false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();