(function () {
  var panel = document.getElementById("wiki-comandi-panel");
  if (!panel) return;

  var tabButtons = panel.querySelectorAll(".vc-cmd-tab");
  var panes = panel.querySelectorAll(".vc-cmd-pane");
  var search = document.getElementById("wiki-cmd-search");
  var emptyBox = document.getElementById("wiki-cmd-empty");
  var panesWrap = panel.querySelector(".vc-cmd-panes");

  function isEconomyCategoryLocked() {
    var unlockMs = Number(window.__VC_ECONOMY_UNLOCK_MS);
    return Number.isFinite(unlockMs) && Date.now() < unlockMs;
  }

  function applyEconomyCategoryGate() {
    if (!isEconomyCategoryLocked()) return;
    panel.querySelectorAll('details.vc-cmd-grp[data-vc-cmd-cat="economy"]').forEach(function (grp) {
      grp.classList.add("vc-cmd-grp--hidden");
      grp.open = false;
    });
  }

  applyEconomyCategoryGate();

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

  function ensureGrpMetaBackup(grp) {
    var meta = grp.querySelector("[data-vc-cmd-grp-meta]");
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

    var groups = activePane.querySelectorAll("details.vc-cmd-grp");
    var anyVisible = false;

    if (!needle) {
      groups.forEach(function (grp) {
        ensureGrpMetaBackup(grp);
        grp.classList.remove("vc-cmd-grp--hidden");
        grp.open = false;
        grp.querySelectorAll(".vc-cmd-item").forEach(function (det) {
          det.classList.remove("vc-cmd-item--hidden");
          det.open = false;
        });
        var meta = grp.querySelector("[data-vc-cmd-grp-meta]");
        if (meta && meta.dataset.vcMetaBackup != null) {
          meta.textContent = meta.dataset.vcMetaBackup;
        }
      });
      if (emptyBox) emptyBox.hidden = true;
      if (panesWrap) panesWrap.classList.remove("vc-cmd-panes--search-miss");
      return;
    }

    activePane.querySelectorAll(".vc-cmd-item").forEach(function (d) {
      d.open = false;
    });

    var firstVisibleCmd = null;
    groups.forEach(function (grp) {
      ensureGrpMetaBackup(grp);
      var meta = grp.querySelector("[data-vc-cmd-grp-meta]");
      var titleEl = grp.querySelector(".vc-cmd-grp-title");
      var titleLower = titleEl ? titleEl.textContent.toLowerCase() : "";
      var titleMatch = titleLower.indexOf(needle) !== -1;
      var items = grp.querySelectorAll(".vc-cmd-item");
      var visibleInGrp = 0;

      items.forEach(function (det) {
        var attr = String(det.getAttribute("data-vc-cmd-search") || "").toLowerCase();
        var body = (det.textContent || "").toLowerCase();
        var show = titleMatch || attr.indexOf(needle) !== -1 || body.indexOf(needle) !== -1;
        det.classList.toggle("vc-cmd-item--hidden", !show);
        if (show) {
          visibleInGrp++;
          anyVisible = true;
          if (!firstVisibleCmd) firstVisibleCmd = det;
        }
      });

      grp.classList.toggle("vc-cmd-grp--hidden", visibleInGrp === 0);
      grp.open = visibleInGrp > 0;

      if (meta && visibleInGrp > 0) {
        meta.textContent = comandoMetaLabel(visibleInGrp);
      } else if (meta && meta.dataset.vcMetaBackup != null) {
        meta.textContent = meta.dataset.vcMetaBackup;
      }
    });

    if (firstVisibleCmd) {
      firstVisibleCmd.open = true;
    }

    if (anyVisible) {
      if (emptyBox) emptyBox.hidden = true;
      if (panesWrap) panesWrap.classList.remove("vc-cmd-panes--search-miss");
    } else {
      if (emptyBox) emptyBox.hidden = false;
      if (panesWrap) panesWrap.classList.add("vc-cmd-panes--search-miss");
    }
  }

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      setTab(btn.getAttribute("data-bot") || "prod");
      filter(search ? search.value : "");
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