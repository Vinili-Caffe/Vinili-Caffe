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
    var wraps = root.querySelectorAll(".vc-mini-pager__jump, .vc-staff-inbox-pagination__jump");
    for (var i = 0; i < wraps.length; i += 1) {
      var wrap = wraps[i];
      var jump = wrap.querySelector("[data-pager-jump]");
      var input = wrap.querySelector("[data-pager-input]");
      var pop = wrap.querySelector(".vc-mini-pager__pop");
      if (pop) pop.hidden = true;
      if (jump) {
        jump.hidden = false;
        jump.setAttribute("aria-expanded", "false");
      }
      if (input && !pop) {
        input.hidden = true;
        input.value = "";
      }
      wrap.classList.remove("is-editing");
    }
    try {
      root.removeAttribute("data-pager-editing");
    } catch (eAttr) {}
  }

  function closeAll(except) {
    var nodes = document.querySelectorAll(
      ".vc-mini-pager__pop:not([hidden]), .vc-staff-inbox-pagination__jump.is-editing"
    );
    for (var i = 0; i < nodes.length; i++) {
      var root =
        nodes[i].closest(".vc-mini-pager") ||
        nodes[i].closest(".vc-staff-inbox-pagination") ||
        nodes[i].parentElement;
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
    /* scrollStayAll1: default = resta all'altezza attuale (no jump su freccette/tab) */
    if (opts.scroll !== true) return handlers;
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

  function pageWindow(page, totalPages, windowSize) {
    var nums = [];
    var ws = Math.max(3, Math.min(7, Number(windowSize) || 5));
    if (totalPages <= ws + 2) {
      for (var i = 1; i <= totalPages; i += 1) nums.push(i);
      return nums;
    }
    var half = Math.floor(ws / 2);
    var start = Math.max(2, page - half);
    var end = Math.min(totalPages - 1, page + half);
    if (page - half < 2) end = Math.min(totalPages - 1, ws + 1);
    if (page + half > totalPages - 1) start = Math.max(2, totalPages - ws);
    nums.push(1);
    if (start > 2) nums.push("…");
    for (var j = start; j <= end; j += 1) nums.push(j);
    if (end < totalPages - 1) nums.push("…");
    nums.push(totalPages);
    return nums;
  }

  /* publicPagerClassic1: site pubblico = frecce + pagina corrente (jump);
     staff/organico resta numerato (default). */
  function htmlClassic(page, total, opts) {
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
      '<button type="button" class="vc-mini-pager__now" data-pager-jump aria-haspopup="dialog" aria-expanded="false" title="' +
      jumpAria +
      '" aria-label="' +
      String(p) +
      " — " +
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
      '" name="vcPagerPage" id="vc-mini-pager-input" data-pager-input>' +
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

  /* organicoPagerEverywhere1: stessa pill organico/inbox (numeri + frecce) */
  function html(page, total, opts) {
    opts = opts || {};
    if (opts.classic) return htmlClassic(page, total, opts);
    var p = Math.max(1, Number(page) || 1);
    var tp = Math.max(1, Number(total) || 1);
    if (p > tp) p = tp;
    var prevAttr = opts.prevAttr || "data-pager-prev";
    var nextAttr = opts.nextAttr || "data-pager-next";
    var goAttr = opts.goAttr || "data-pager-go";
    var aria = opts.aria || (langEn() ? "Pagination" : "Paginazione");
    var prevAria = langEn() ? "Previous page" : "Pagina precedente";
    var nextAria = langEn() ? "Next page" : "Pagina successiva";

    function gap() {
      /* organicoPagerJump1: "…" → input pagina */
      return (
        '<span class="vc-mini-pager__jump vc-staff-inbox-pagination__jump">' +
        '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__gap" data-pager-jump aria-label="' +
        (langEn() ? "Go to page" : "Vai a pagina") +
        '" title="' +
        (langEn() ? "Go to page" : "Vai a pagina") +
        '">\u2026</button>' +
        '<input class="vc-staff-inbox-pagination__jump-input" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" min="1" max="' +
        tp +
        '" placeholder="' +
        (langEn() ? "page #" : "pagina") +
        '" name="vcPagerPage" data-pager-input hidden aria-label="' +
        (langEn() ? "Page number" : "Numero pagina") +
        '" />' +
        "</span>"
      );
    }
    function pageBtn(n, active) {
      return (
        '<button type="button" class="vc-staff-pt-seg__btn' +
        (active ? " is-active" : "") +
        '" ' +
        goAttr +
        '="' +
        n +
        '"' +
        (active ? ' aria-current="page"' : "") +
        ">" +
        n +
        "</button>"
      );
    }

    var pagesHtml =
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" ' +
      prevAttr +
      (p <= 1 ? " disabled" : "") +
      ' aria-label="' +
      prevAria +
      '">\u2190</button>';
    pageWindow(p, tp, opts.windowSize).forEach(function (n) {
      if (n === "…") pagesHtml += gap();
      else pagesHtml += pageBtn(n, n === p);
    });
    pagesHtml +=
      '<button type="button" class="vc-staff-pt-seg__btn vc-staff-inbox-pagination__navbtn" ' +
      nextAttr +
      (p >= tp ? " disabled" : "") +
      ' aria-label="' +
      nextAria +
      '">\u2192</button>';

    var inner =
      '<div class="vc-staff-inbox-pagination__row">' +
      '<div class="vc-staff-pt-seg vc-staff-inbox-pagination__seg" role="navigation" aria-label="' +
      aria +
      '">' +
      pagesHtml +
      "</div></div>";

    if (opts.innerOnly) return inner;
    return (
      '<nav class="vc-mini-pager vc-pill-pager vc-staff-inbox-pagination" data-pager-page="' +
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
    if (!input) return;
    var total = Number(root.getAttribute("data-pager-total") || input.max || 1);
    var current = Number(root.getAttribute("data-pager-page") || 1);
    var next = clampPage(input.value, total);
    closePop(root);
    if (!next || next === current) return;
    handlers.go(next);
  }

  function liveHandlers(root) {
    var raw = root && root.__vcPagerHandlers;
    return wrapHandlers(root, raw || {}, root.__vcPagerOpts || {});
  }

  function openJumpEditor(root, jumpBtn) {
    if (!root || !jumpBtn) return false;
    var wrap =
      jumpBtn.closest(".vc-mini-pager__jump") ||
      jumpBtn.closest(".vc-staff-inbox-pagination__jump");
    var input = wrap && wrap.querySelector("[data-pager-input]");
    var pop = wrap && wrap.querySelector(".vc-mini-pager__pop");
    closeAll(root);
    if (pop) {
      var open = pop.hidden;
      pop.hidden = !open;
      jumpBtn.setAttribute("aria-expanded", open ? "true" : "false");
      if (open && input) {
        input.value = String(root.getAttribute("data-pager-page") || input.value || "1");
        try {
          input.focus();
          input.select();
        } catch (eF) {}
      }
      return true;
    }
    if (!wrap || !input) return false;
    jumpBtn.hidden = true;
    jumpBtn.setAttribute("aria-expanded", "true");
    input.hidden = false;
    input.removeAttribute("hidden");
    wrap.classList.add("is-editing");
    root.setAttribute("data-pager-editing", "1");
    input.value = "";
    input.max = String(root.getAttribute("data-pager-total") || input.max || "1");
    /* organicoPagerJump2: focus sync + retry (iOS/Safari hide-btn nello stesso gesto) */
    function focusInput() {
      try {
        input.focus({ preventScroll: true });
      } catch (eFocus) {
        try {
          input.focus();
        } catch (eFocus2) {}
      }
      try {
        input.select();
      } catch (eSel) {}
    }
    focusInput();
    window.requestAnimationFrame(focusInput);
    window.setTimeout(focusInput, 30);
    return true;
  }

  function bind(root, handlers, opts) {
    if (!root || !handlers) return;
    root.__vcPagerHandlers = handlers;
    root.__vcPagerOpts = opts || {};
    if (root.dataset.vcMiniPager === "1") return;
    root.dataset.vcMiniPager = "1";
    if (opts && opts.classic) {
      root.classList.add("vc-mini-pager");
      root.classList.remove("vc-pill-pager", "vc-staff-inbox-pagination");
    } else {
      root.classList.add("vc-mini-pager", "vc-pill-pager");
    }
    var goAttrName = (opts && opts.goAttr) || "data-pager-go";

    /* organicoPagerJump2: click (no pointerdown preventDefault — spegneva focus su alcuni browser) */
    root.addEventListener("click", function (ev) {
      var t = ev.target && ev.target.closest ? ev.target.closest("button, input") : null;
      if (!t || !root.contains(t) || t.disabled) return;
      var h = liveHandlers(root);
      if (t.matches("[data-pager-jump]")) {
        ev.preventDefault();
        ev.stopPropagation();
        openJumpEditor(root, t);
        return;
      }
      if (t.matches("[data-pager-input]")) {
        ev.stopPropagation();
        return;
      }
      if (t.matches("[data-pager-prev]")) {
        var cur = Number(root.getAttribute("data-pager-page") || 1);
        if (typeof h.prev === "function") h.prev();
        else if (typeof h.go === "function") h.go(Math.max(1, cur - 1));
        return;
      }
      if (t.matches("[data-pager-next]")) {
        var curN = Number(root.getAttribute("data-pager-page") || 1);
        var tot = Number(root.getAttribute("data-pager-total") || 1);
        if (typeof h.next === "function") h.next();
        else if (typeof h.go === "function") h.go(Math.min(tot, curN + 1));
        return;
      }
      if (t.hasAttribute(goAttrName) || t.hasAttribute("data-pager-go")) {
        var n = Number(t.getAttribute(goAttrName) || t.getAttribute("data-pager-go") || "");
        if (!Number.isFinite(n) || n < 1) return;
        if (typeof h.go === "function") h.go(n);
      }
    });

    root.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Enter") return;
      if (!ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      ev.preventDefault();
      commit(root, liveHandlers(root));
    });
    root.addEventListener("focusout", function (ev) {
      if (!ev || !ev.target || !ev.target.matches || !ev.target.matches("[data-pager-input]")) return;
      window.setTimeout(function () {
        if (root.contains(document.activeElement)) return;
        commit(root, liveHandlers(root));
      }, 0);
    });
  }

  if (!window.__vcMiniPagerDocBound) {
    window.__vcMiniPagerDocBound = true;
    document.addEventListener("pointerdown", function (ev) {
      var t = ev.target;
      if (t && t.closest) {
        /* non chiudere mentre apri/scrivi il jump */
        if (
          t.closest(
            "[data-pager-jump], [data-pager-input], .vc-staff-inbox-pagination__jump.is-editing, .vc-mini-pager__pop:not([hidden])"
          )
        ) {
          var keep =
            t.closest(".vc-mini-pager") ||
            t.closest(".vc-staff-inbox-pagination") ||
            null;
          closeAll(keep);
          return;
        }
      }
      var pop = t && t.closest ? t.closest(".vc-mini-pager") : null;
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
    sync: function (root, page, total, opts) {
      if (!root) return;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      if (p > tp) p = tp;
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      var o = opts || {};
      if (o.classic) {
        root.classList.add("vc-mini-pager");
        root.classList.remove("vc-pill-pager", "vc-staff-inbox-pagination");
      } else {
        root.classList.add("vc-mini-pager", "vc-pill-pager", "vc-staff-inbox-pagination");
      }
      /* organicoPagerJump2: non distruggere l'input mentre l'utente digita */
      if (root.getAttribute("data-pager-editing") === "1" || root.querySelector(".is-editing")) {
        var liveIn = root.querySelector("[data-pager-input]");
        if (liveIn) liveIn.max = String(tp);
        return;
      }
      o.innerOnly = true;
      root.innerHTML = html(p, tp, o);
    },
    fill: function (root, page, total, opts, handlers) {
      if (!root) return;
      opts = opts || {};
      opts.innerOnly = true;
      var p = Math.max(1, Number(page) || 1);
      var tp = Math.max(1, Number(total) || 1);
      if (opts.classic) {
        root.classList.add("vc-mini-pager");
        root.classList.remove("vc-pill-pager", "vc-staff-inbox-pagination");
      } else {
        root.classList.add("vc-mini-pager", "vc-pill-pager", "vc-staff-inbox-pagination");
      }
      root.setAttribute("data-pager-page", String(p));
      root.setAttribute("data-pager-total", String(tp));
      if (handlers) {
        root.__vcPagerHandlers = handlers;
        root.__vcPagerOpts = opts;
      }
      /* organicoPagerJump2: fill durante editing = aggiorna solo meta, non wipe HTML */
      if (root.getAttribute("data-pager-editing") === "1" || root.querySelector(".is-editing")) {
        var liveIn2 = root.querySelector("[data-pager-input]");
        if (liveIn2) liveIn2.max = String(tp);
        if (handlers) bind(root, handlers, opts);
        return;
      }
      root.innerHTML = html(p, tp, opts);
      if (handlers) bind(root, handlers, opts);
    },
  };
})();
