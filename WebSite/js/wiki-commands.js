(function () {
  var panel = document.getElementById("wiki-comandi-panel");
  if (!panel) return;

  var tabButtons = panel.querySelectorAll(".vc-cmd-tab");
  var panes = panel.querySelectorAll(".vc-cmd-pane");
  var search = document.getElementById("wiki-cmd-search");

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

  function filter(q) {
    var needle = String(q || "")
      .toLowerCase()
      .trim();
    var activePane = panel.querySelector(".vc-cmd-pane:not([hidden])");
    if (!activePane) return;
    activePane.querySelectorAll(".vc-cmd-acc").forEach(function (det) {
      var titleEl = det.querySelector(".vc-cmd-acc-title");
      var title = titleEl ? titleEl.textContent : "";
      var cmds = [];
      det.querySelectorAll(".vc-cmd-name").forEach(function (n) {
        cmds.push(n.textContent || "");
      });
      var hay = (title + " " + cmds.join(" ")).toLowerCase();
      var show = !needle || hay.indexOf(needle) !== -1;
      det.classList.toggle("vc-cmd-acc--hidden", !show);
    });
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

  document.querySelectorAll("[data-select-cmd-tab]").forEach(function (el) {
    el.addEventListener("click", function (ev) {
      var tab = el.getAttribute("data-select-cmd-tab");
      if (!tab) return;
      ev.preventDefault();
      setTab(tab);
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      if (search) search.value = "";
      filter("");
    });
  });

  setTab("prod");
})();