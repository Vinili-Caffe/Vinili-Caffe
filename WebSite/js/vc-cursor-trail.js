(function () {
  var SEGMENTS = 22;
  var SEGMENT_LEN = 9;
  var TRAIL_COLOR = "rgba(234, 212, 192, 0.82)";
  var TRAIL_FADE = "rgba(234, 212, 192, 0.08)";
  var LINE_WIDTH = 1.35;

  function canRun() {
    try {
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) return false;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return false;
    } catch (e) {}
    return typeof window !== "undefined" && typeof document !== "undefined";
  }

  function initCursorTrail() {
    if (!canRun()) return;
    if (document.documentElement.classList.contains("vc-cursor-trail-off")) return;

    var canvas = document.createElement("canvas");
    canvas.className = "vc-cursor-trail";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);

    var ctx = canvas.getContext("2d");
    if (!ctx) return;

    var dpr = 1;
    var width = 0;
    var height = 0;
    var points = [];
    var mouse = { x: -9999, y: -9999, active: false };
    var rafId = 0;
    var running = false;

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function seedPoints(x, y) {
      points.length = 0;
      for (var i = 0; i < SEGMENTS; i += 1) {
        points.push({ x: x, y: y });
      }
    }

    function onMove(ev) {
      var x = ev.clientX;
      var y = ev.clientY;
      if (!mouse.active) {
        seedPoints(x, y);
        mouse.active = true;
      }
      mouse.x = x;
      mouse.y = y;
      points[0].x = x;
      points[0].y = y;
      if (!running) {
        running = true;
        rafId = window.requestAnimationFrame(tick);
      }
    }

    function onLeave() {
      mouse.active = false;
    }

    function onEnter(ev) {
      onMove(ev);
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

    function draw() {
      ctx.clearRect(0, 0, width, height);
      if (!mouse.active || points.length < 2) return;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);

      for (var i = 1; i < points.length - 2; i += 1) {
        var cx = (points[i].x + points[i + 1].x) * 0.5;
        var cy = (points[i].y + points[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(points[i].x, points[i].y, cx, cy);
      }

      var tailA = points[points.length - 2];
      var tailB = points[points.length - 1];
      ctx.quadraticCurveTo(tailA.x, tailA.y, tailB.x, tailB.y);

      var grad = ctx.createLinearGradient(points[0].x, points[0].y, tailB.x, tailB.y);
      grad.addColorStop(0, TRAIL_COLOR);
      grad.addColorStop(1, TRAIL_FADE);
      ctx.strokeStyle = grad;
      ctx.lineWidth = LINE_WIDTH;
      ctx.stroke();
    }

    function tick() {
      if (!mouse.active) {
        running = false;
        ctx.clearRect(0, 0, width, height);
        return;
      }
      simulate();
      draw();
      rafId = window.requestAnimationFrame(tick);
    }

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseenter", onEnter, { passive: true });
    document.addEventListener("mouseleave", onLeave, { passive: true });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden" && rafId) {
        window.cancelAnimationFrame(rafId);
        running = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCursorTrail);
  } else {
    initCursorTrail();
  }
})();