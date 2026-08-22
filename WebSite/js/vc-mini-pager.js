(function vcMiniPager() {
  if (window.__vcMiniPager) return;

  function langEn() {
    try {
      return String(document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function closePop(root) {
    if (!root) return;
    var pop = root.querySelector(".vc-mini-pager__pop");
    var jump = root.querySelector("[data-pager-jump]");
    if (pop) pop.hidden = true;
    if (jump) jump.setAttribute("aria-expanded", "false");
  }

  function closeAll(except) {
    var nodes = document.querySelectorAll(".vc-mini-pager__pop:not([hidden])");
    for (var i = 0; i < nodes.length; i++) {
      var root = nodes[i].closest(".vc-mini-pager") || nodes[i].parentElement;
      if (except && root === except) continue;
      closePop(root);
    }
  }

  function clampPage(raw, total) {
    var n = parseInt(String(raw || ""), 10);
    var tp = Math.max(1, Number(total) || 1);
    if (!isFinite(n)) return 0;
    if (n < 1) n = 1;
    if (n > tp) n = tp;
    return n;
  }

  function headerOffsetPx() {
    try {
      var bar = document.querySelector(".vc-header-bar") || document.querySelector("header");
      var h = bar ? bar.getBoundingClientRect().height : 72;
      return Math.round(Math.max(64, h + 12));
    } catch (eOff) {
      return 88;
    }
  }

  function resolveScrollAnchor(root) {
    if (!root) return null;
    try {
      var custom = String(root.getAttribute("data-pager-scroll") || "").trim();
      if (custom) {
        var bySel = document.querySelector(custom);
        if (bySel) return bySel;
      }
      var wrapped = root.closest("[data-pager-anchor]");
      if (wrapped) return wrapped;
      var scope = root.closest("main") || document.body;
      if (!scope) return root;
      var candidates = scope.querySelectorAll(
        [
          "#vc-ul-toolbar",
          "#vc-ul-board-tabs",
          "#vc-ul-grid",
          "#vc-roles-toolbar",
          "#vc-roles-grid",
          "#vc-reviews-server-list",
          "#vc-suggestions-list",
          "[data-pager-list]",
          ".vc-wt-list",
          ".vc-tprof-list",
          ".vc-dash-table-wrap",
          "#vc-page-content",
        ].join(",")
      );
      var pagerY =
        root.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
      var best = null;
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        if (!c || root.contains(c)) continue;
        var y = c.getBoundingClientRect().top + (window.pageYOffset || document.documentElement.scrollTop || 0);
        if (y <= pagerY + 12) best = c;
      }
      return best || root;
    } catch (eRes) {
      return root;
    }
  }

  function scrollToPagerContent(root, behavior) {
    var anchor = resolveScrollAnchor(root);
    if (!anchor) return;
    try {
      var y =
        anchor.getBoundingClientRect().top +
        (window.pageYOffset || document.documentElement.scrollTop || 0) -
        headerOffsetPx();
      if (y < 0) y = 0;
      window.scrollTo({ top: y, behavior: behavior || "auto" });
    } catch (eScroll) {
      try {
        anchor.scrollIntoView({ block: "start", behavior: behavior || "auto" });
      } catch (e2) {}
    }
  }

  function wrapHandlers(root, handlers, opts) {
    handlers = handlers || {};
    opts = opts || {};
    if (opts.scroll === false) return handlers;
    var behavior = opts.scrollBehavior || "auto";
    function bump() {
      window.requestAnimationFrame(function () {
        scrollToPagerContent(root, behavior);
      });
      window.setTimeout(function () {
        scrollToPagerContent(root, behavior);
      }, 90);
    }
    var out = {};
    if (typeof handlers.go === "function") {
      out.go = function (page) {
        var cur = Number(root.getAttribute("data-pager-page") || 1);
        var next = Math.max(1, Number(page) || 1);
        if (next === cur) return;
        handlers.go(next);
        bump();
      };
    }
    if (typeof handlers.prev === "function") {
      out.prev = function () {
        handlers.prev();
        bump();
      };
    }
    if (typeof handlers.next === "function") {
      out.next = function () {
        handlers.next();
        bump();
      };
    }
    return out;
  }

  function html(page, total, opts) {
    opts = opts || {};
    var p = Math.max(1, Number(page) || 1);
    var tp = Math.max(1, Number(total) || 1);
    if (p > tp) p = tp;
    var prevAttr = opts.prevAttr || "data-pager-prev";
    var nextAttr = opts.nextAttr || "data-pager-next";
    var aria = opts.aria || (langEn() ? "Pagination" : "Paginazione");
    var jumpAria = langEn() ? "Go to page" : "Vai a pagina";
    var goLbl = langEn() ? "Go to" : "Vai a";
    var prevAria = langEn() ? "Previous page" : "Pagina precedente";
    var nextAria = langEn() ? "Next page" : "Pagina successiva";
    var inner =
      '<button type="button" class="vc-mini-pager__arrow" ' +
      prevAttr +
      (p <= 1 ? " disabled" : "") +
      ' aria-label="' +
      prevAria +
      '"><i class="fa fa-chevron-left" aria-hidden="true"></i></button>' +
      '<div class="vc-mini-pager__jump">' +
      '<button type="button" class="vc-mini-pager__now" data-pager-jump aria-haspopup="dialog" aria-expanded="false" aria-label="' +
      jumpAria +
      '">' +
      String(p) +
      "</button>" +
      '<div class="vc-mini-pager__pop" hidden role="dialog" aria-label="' +
      jumpAria +
      '">' +
      '<span class="vc-mini-pager__lbl">' +
      goLbl +
      "</span>" +
      '<input class="vc-mini-pager__input" type="number" inputmode="numeric" min="1" max="' +
      tp +
      '" value="' +
      p +
      '" data-pager-input>' +
      '<span class="vc-mini-pager__of">/ ' +
      tp +
      "</span>" +
      "</div></div>" +
      '<button type="button" class="vc-mini-pager__arrow" ' +
      nextAttr +
      (p >= tp ? " disabled" : "") +
      ' aria-label="' +
      nextAria +
      '"><i class="fa fa-chevron-right" aria-hidden="true"></i></button>';
    if (opts.innerOnly) return inner;
    return (
      '<nav class="vc-mini-pager" data-pager-page="' +
      p +
      '" data-pager-total="' +
      tp +
      '" aria-label="' +
      aria +
      '">' +
      inner +
      "</nav>"
    );
  }

  function commit(root, handlers) {
    if (!root || !handlers || typeof handlers.go !== "function") return;
    var input = root.querySelector("[data-pager-input]");
    var total = Number(root.getAttribute("data-pager-total") || (input && input.max) || 1);
    var current = Number(root.getAttribute("data-pager-page") || 1);
    var next = clampPage(input ? input.value : "", total);
    closePop(root);
    if (!next || next === current) return;
    handlers.go(next);
  }

  function bind(root, handlers, opts) {
    if (!root || !handlers) return;
    if (root.dataset.vcMiniPager === "1") return;
    root.dataset.vcMiniPager = "1";
    root.classList.add("vc-mini-pager");
    var h = wrapHandlers(root, handlers, opts);

    root.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("button, input") : null;
      if (!t || !root.contains(t)) return;
      if (t.matches("[data-pager-jump]")) {
        ev.preventDefault();
        var pop = root.querySelector(".vc-mini-pager__pop");
        var input = root.querySelector("[data-pager-input]");
        var open = pop && pop.hidden;
        closeAll(root);
        if (pop) pop.hidden = !open;
        t.setAttribute("aria-expanded", open ? "true" : "false");
        if (open && input) {
          input.value = String(root.getAttribute("data-pager-page") || input.value || "1");
          window.setTimeout(function () {
            try {
              input.focus();
              input.select();
            } catch (eF) {}
          }, 0);
        }
        return;
      }
      if (t.matches("[data-pager-prev]")) {
        if (t.disabled) return;
        var cur = Number(root.getAttribute("data-pager-page") || 1);
        if (typeof h.prev === "function") h.prev();
        else if (typeof h.go === "function") h.go(Math.max(1, cur - 1));
        return;
      }
      if (t.matches("[data-pager-next]")) {
        if (t.disabled) return;
        var curN = Number(root.getAttribute("data-pager-page") || 1);
        var tot = Number(root.getAttribute("data-pager-total") || 1);
        if (typeof h.next === "function") h.next();
        else if (typeof h.go === "function") h.go(Math.min(tot, curN + 1));
      }
    });

    root.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Enter") return;
      if (!ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      ev.preventDefault();
      commit(root, h);
    });
    root.addEventListener("focusout", function (ev) {
      if (!ev || !ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      window.setTimeout(function () {
        if (root.contains(document.activeElement)) return;
        commit(root, h);
      }, 0);
    });
  }

  if (!window.__vcMiniPagerDocBound) {
    window.__vcMiniPagerDocBound = true;
    document.addEventListener("pointerdown", function (ev) {
      var pop = ev.target && ev.target.closest ? ev.target.closest(".vc-mini-pager") : null;
      closeAll(pop);
    });
    document.addEventListener("keydown", function (ev) {
      if (ev && ev.key === "Escape") closeAll(null);
    });
  }

  window.__vcMiniPager = {
    html: html,
    bind: bind,
    closeAll: closeAll,
    scrollToContent: scrollToPagerContent,
    sync: function (root, page, total) {
      if (!root) return;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      if (p > tp) p = tp;
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      var now = root.querySelector("[data-pager-jump]");
      if (now) now.textContent = String(p);
      var input = root.querySelector("[data-pager-input]");
      if (input) {
        input.max = String(tp);
        input.value = String(p);
      }
      var of = root.querySelector(".vc-mini-pager__of");
      if (of) of.textContent = "/ " + tp;
      var prev = root.querySelector("[data-pager-prev]");
      var next = root.querySelector("[data-pager-next]");
      if (prev) prev.disabled = p <= 1;
      if (next) next.disabled = p >= tp;
    },
    fill: function (root, page, total, opts, handlers) {
      if (!root) return;
      opts = opts || {};
      opts.innerOnly = true;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      root.classList.add("vc-mini-pager");
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      root.innerHTML = html(p, tp, opts);
      if (handlers) bind(root, handlers, opts);
    },
  };
})();
