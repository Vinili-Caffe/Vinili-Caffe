(function () {
  /* SVG (non canvas): Brave Shields/farbling non spegne la scia. */
  var SEGMENTS = 18;
  var SEGMENT_LEN = 11;
  var LINE_WIDTH = 2.8;
  var MOVE_SQ = 1;
  var IDLE_MS = 240;
  var NS = "http://www.w3.org/2000/svg";

  function canRun() {
    if (typeof window === "undefined" || typeof document === "undefined") return false;
    try {
      if (document.documentElement.classList.contains("vc-cursor-trail-off")) return false;
      if (document.documentElement.classList.contains("vc-perf-lite")) return false;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return false;
      if (
        window.matchMedia &&
        window.matchMedia("(hover: none)").matches &&
        Number(navigator.maxTouchPoints || 0) > 0
      ) {
        return false;
      }
    } catch (eCan) {}
    return true;
  }

  function initCursorTrail() {
    if (!canRun()) return;
    if (window.__VC_CURSOR_TRAIL_INIT) return;
    if (document.documentElement.classList.contains("vc-cursor-trail-off")) return;
    window.__VC_CURSOR_TRAIL_INIT = true;

    var svg = document.createElementNS(NS, "svg");
    svg.setAttribute("class", "vc-cursor-trail");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.cssText =
      "position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:2147483645;display:block;margin:0;padding:0;border:0;overflow:visible;";

    var defs = document.createElementNS(NS, "defs");
    var grad = document.createElementNS(NS, "linearGradient");
    grad.setAttribute("id", "vc-cursor-trail-grad");
    grad.setAttribute("gradientUnits", "userSpaceOnUse");
    var stopA = document.createElementNS(NS, "stop");
    stopA.setAttribute("offset", "0%");
    stopA.setAttribute("stop-color", "#f4e2cc");
    stopA.setAttribute("stop-opacity", "0.95");
    var stopB = document.createElementNS(NS, "stop");
    stopB.setAttribute("offset", "100%");
    stopB.setAttribute("stop-color", "#f4e2cc");
    stopB.setAttribute("stop-opacity", "0.08");
    grad.appendChild(stopA);
    grad.appendChild(stopB);
    defs.appendChild(grad);

    var path = document.createElementNS(NS, "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "url(#vc-cursor-trail-grad)");
    path.setAttribute("stroke-width", String(LINE_WIDTH));
    path.setAttribute("stroke-linecap", "round");
    path.setAttribute("stroke-linejoin", "round");
    path.setAttribute("d", "");

    svg.appendChild(defs);
    svg.appendChild(path);
    (document.body || document.documentElement).appendChild(svg);

    var points = [];
    var mouse = { x: -9999, y: -9999, active: false };
    var lastMoveAt = 0;
    var rafId = 0;
    var running = false;
    var lastPointerType = "";

    function resize() {
      svg.setAttribute("viewBox", "0 0 " + window.innerWidth + " " + window.innerHeight);
    }

    function seedPoints(x, y) {
      points.length = 0;
      for (var i = 0; i < SEGMENTS; i += 1) {
        points.push({ x: x, y: y });
      }
    }

    function clearTrail() {
      running = false;
      path.setAttribute("d", "");
      mouse.active = false;
    }

    function isIdle() {
      return performance.now() - lastMoveAt > IDLE_MS;
    }

    function shouldIgnorePointer(type) {
      if (type === "touch") return true;
      /* dopo un touch, i fake mousemove del mobile non devono creare la scia */
      if (lastPointerType === "touch" && (!type || type === "mouse")) return true;
      return false;
    }

    function onMove(ev, pointerType) {
      var type = pointerType || ev.pointerType || "";
      if (type) lastPointerType = type;
      if (shouldIgnorePointer(type || lastPointerType)) return;

      var x = ev.clientX;
      var y = ev.clientY;
      if (typeof x !== "number" || typeof y !== "number") return;
      var dx = x - mouse.x;
      var dy = y - mouse.y;
      if (mouse.active && dx * dx + dy * dy < MOVE_SQ) return;

      lastMoveAt = performance.now();
      if (!mouse.active) {
        seedPoints(x, y);
        mouse.active = true;
      }
      mouse.x = x;
      mouse.y = y;
      if (!points.length) seedPoints(x, y);
      points[0].x = x;
      points[0].y = y;
      if (!running) {
        running = true;
        rafId = window.requestAnimationFrame(tick);
      }
    }

    function onLeave() {
      clearTrail();
    }

    function simulate() {
      if (!points.length) return;
      for (var i = 1; i < points.length; i += 1) {
        var prev = points[i - 1];
        var cur = points[i];
        var dx = cur.x - prev.x;
        var dy = cur.y - prev.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
        var ratio = SEGMENT_LEN / dist;
        cur.x = prev.x + dx * ratio;
        cur.y = prev.y + dy * ratio;
      }
    }

    function buildPathD() {
      if (points.length < 2) return "";
      var d = "M " + points[0].x + " " + points[0].y;
      for (var i = 1; i < points.length - 2; i += 1) {
        var cx = (points[i].x + points[i + 1].x) * 0.5;
        var cy = (points[i].y + points[i + 1].y) * 0.5;
        d += " Q " + points[i].x + " " + points[i].y + " " + cx + " " + cy;
      }
      var tailA = points[points.length - 2];
      var tailB = points[points.length - 1];
      d += " Q " + tailA.x + " " + tailA.y + " " + tailB.x + " " + tailB.y;
      return d;
    }

    function draw() {
      if (!mouse.active || points.length < 2) {
        path.setAttribute("d", "");
        return;
      }
      var head = points[0];
      var tail = points[points.length - 1];
      grad.setAttribute("x1", String(head.x));
      grad.setAttribute("y1", String(head.y));
      grad.setAttribute("x2", String(tail.x));
      grad.setAttribute("y2", String(tail.y));
      path.setAttribute("d", buildPathD());
    }

    function tick() {
      if (!mouse.active) {
        clearTrail();
        return;
      }
      simulate();
      draw();
      if (isIdle()) {
        clearTrail();
        return;
      }
      rafId = window.requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener(
      "pointermove",
      function (ev) {
        onMove(ev, ev.pointerType || "");
      },
      { passive: true, capture: true },
    );
    document.addEventListener(
      "mousemove",
      function (ev) {
        onMove(ev, lastPointerType === "touch" ? "touch" : "mouse");
      },
      { passive: true, capture: true },
    );
    document.documentElement.addEventListener("mouseleave", onLeave, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && rafId) {
        window.cancelAnimationFrame(rafId);
        clearTrail();
      }
    });
  }

  function boot() {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", initCursorTrail);
      return;
    }
    initCursorTrail();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
