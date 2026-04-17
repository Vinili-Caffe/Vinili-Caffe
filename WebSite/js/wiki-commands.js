(function () {
  var panel = document.getElementById("wiki-comandi-panel");
  if (!panel) return;

  var tabButtons = panel.querySelectorAll(".vc-cmd-tab");
  var panes = panel.querySelectorAll(".vc-cmd-pane");
  var search = document.getElementById("wiki-cmd-search");
  var emptyBox = document.getElementById("wiki-cmd-empty");
  var panesWrap = panel.querySelector(".vc-cmd-panes");

  function stripLocationHash() {
    try {
      if (!location.hash || !window.history || !window.history.replaceState) return;
      window.history.replaceState(null, "", location.pathname + location.search);
    } catch (e) {}
  }

  function scrollToId(id) {
    var el = id ? document.getElementById(id) : null;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setTab(bot) {
    tabButtons.forEach(function (btn) {
      var on = btn.getAttribute("data-bot") === bot;
      btn.classList.toggle("vc-cmd-tab--on", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    panes.forEach(function (pane) {
      pane.hidden = pane.getAttribute("data-pane") !== bot;
    });
  }

  function ensureMetaBackup(det) {
    var meta = det.querySelector(".vc-cmd-acc-meta");
    if (meta && meta.dataset.vcMetaBackup == null) {
      meta.dataset.vcMetaBackup = meta.textContent || "";
    }
  }

  function comandoMetaLabel(n) {
    if (n === 1) return "1 comando";
    return String(n) + " comandi";
  }

  function filter(q) {
    var needle = String(q || "")
      .toLowerCase()
      .trim();
    var activePane = panel.querySelector(".vc-cmd-pane:not([hidden])");
    if (!activePane) return;

    var accs = activePane.querySelectorAll(".vc-cmd-acc");
    var anyVisible = false;

    accs.forEach(function (det, idx) {
      ensureMetaBackup(det);
      var meta = det.querySelector(".vc-cmd-acc-meta");
      var titleEl = det.querySelector(".vc-cmd-acc-title");
      var title = titleEl ? titleEl.textContent : "";
      var titleLower = title.toLowerCase();
      var titleMatch = Boolean(needle && titleLower.indexOf(needle) !== -1);

      var lis = det.querySelectorAll(".vc-cmd-list li");
      lis.forEach(function (li) {
        if (!needle) {
          li.classList.remove("vc-cmd-li--hidden");
          return;
        }
        var liHay = (li.textContent || "").toLowerCase();
        var liMatch = liHay.indexOf(needle) !== -1;
        var showLi = titleMatch || liMatch;
        li.classList.toggle("vc-cmd-li--hidden", !showLi);
      });

      var visibleCount = det.querySelectorAll(".vc-cmd-list li:not(.vc-cmd-li--hidden)").length;
      var showAcc = !needle || visibleCount > 0;

      det.classList.toggle("vc-cmd-acc--hidden", !showAcc);
      if (showAcc) anyVisible = true;

      if (needle) {
        if (showAcc) {
          det.open = true;
          if (meta) meta.textContent = comandoMetaLabel(visibleCount);
        } else {
          det.open = false;
        }
      } else {
        det.open = idx === 0;
        if (meta && meta.dataset.vcMetaBackup != null) {
          meta.textContent = meta.dataset.vcMetaBackup;
        }
      }
    });

    if (needle) {
      if (anyVisible) {
        if (emptyBox) emptyBox.hidden = true;
        if (panesWrap) panesWrap.classList.remove("vc-cmd-panes--search-miss");
      } else {
        if (emptyBox) emptyBox.hidden = false;
        if (panesWrap) panesWrap.classList.add("vc-cmd-panes--search-miss");
      }
    } else {
      if (emptyBox) emptyBox.hidden = true;
      if (panesWrap) panesWrap.classList.remove("vc-cmd-panes--search-miss");
    }
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTab(btn.getAttribute("data-bot") || "prod");
      if (search) search.value = "";
      filter("");
    });
  });

  if (search) {
    search.addEventListener("input", function () {
      filter(search.value);
    });
  }

  document.querySelectorAll("[data-vc-wiki-scroll]").forEach(function (el) {
    el.addEventListener("click", function (ev) {
      var sid = el.getAttribute("data-vc-wiki-scroll");
      if (!sid) return;
      ev.preventDefault();
      var tab = el.getAttribute("data-select-cmd-tab");
      if (tab) setTab(tab);
      scrollToId(sid);
      if (search) search.value = "";
      filter("");
      stripLocationHash();
    });
  });

  (function applyInitialHash() {
    var raw = String(location.hash || "")
      .replace(/^#/, "")
      .trim();
    if (!raw) return;
    var node = document.getElementById(raw);
    if (node) {
      requestAnimationFrame(function () {
        node.scrollIntoView({ block: "start" });
      });
    }
    stripLocationHash();
  })();

  setTab("prod");
})();