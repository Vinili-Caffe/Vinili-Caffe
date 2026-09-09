(function () {
  /* wikiHelpCatalogCoffee1: Vinili + Caffè = stesso accordion di +help / ,help via API */
  var panel = document.getElementById("wiki-comandi-panel");
  if (!panel) return;

  var tabButtons = panel.querySelectorAll(".vc-cmd-tab");
  var panes = panel.querySelectorAll(".vc-cmd-pane");
  var search = document.getElementById("wiki-cmd-search");
  var emptyBox = document.getElementById("wiki-cmd-empty");
  var panesWrap = panel.querySelector(".vc-cmd-panes");
  var liveRootProd = null;
  var liveRootTest = null;

  function siteAvatarFallback() {
    try {
      if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function") {
        return window.VcDiscordAvatar.siteFallbackAvatarUrl();
      }
    } catch (eFb) {}
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#6f4e37"/><stop offset="1" stop-color="#2a1712"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="48" cy="36" r="17" fill="#f4dcc2" opacity=".92"/><path d="M20 82c4-18 16-28 28-28s24 10 28 28" fill="#f4dcc2" opacity=".92"/></svg>';
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  function botAvatarFromTab(bot) {
    var sel =
      bot === "test"
        ? "#wiki-tab-test .vc-cmd-tab-avatar"
        : "#wiki-tab-prod .vc-cmd-tab-avatar";
    var img = panel.querySelector(sel);
    var src = img && img.getAttribute("src");
    if (src && src.indexOf("{{") === -1 && src.indexOf("embed/avatars") === -1) return src;
    return siteAvatarFallback();
  }

  function ensurePaneShell(bot) {
    var paneId = bot === "test" ? "wiki-cmd-pane-test" : "wiki-cmd-pane-prod";
    var rootId = bot === "test" ? "wiki-cmd-live-root-test" : "wiki-cmd-live-root";
    var tabId = bot === "test" ? "wiki-tab-test" : "wiki-tab-prod";
    var pane = document.getElementById(paneId);
    if (!pane) {
      if (!panesWrap) return null;
      pane = document.createElement("div");
      pane.className = "vc-cmd-pane";
      pane.id = paneId;
      pane.setAttribute("role", "tabpanel");
      pane.setAttribute("aria-labelledby", tabId);
      pane.setAttribute("data-pane", bot);
      if (bot === "test") pane.hidden = true;
      panesWrap.appendChild(pane);
      panes = panel.querySelectorAll(".vc-cmd-pane");
    }
    var root = document.getElementById(rootId);
    if (!root) {
      root = document.createElement("div");
      root.id = rootId;
      root.className = "vc-cmd-live-root";
      root.setAttribute("aria-busy", "true");
      pane.innerHTML = "";
      pane.appendChild(root);
    }
    if (bot === "test") liveRootTest = root;
    else liveRootProd = root;
    return root;
  }

  function esc(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function t(key, vars, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key, vars);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback;
  }

  function comandoMetaLabel(n) {
    if (n === 1) return t("wiki.cmdCountOne", { n: n }, "1 comando");
    return t("wiki.cmdCountMany", { n: n }, String(n) + " comandi");
  }

  function renderCatalog(catalog, bot) {
    var paneBot = bot === "test" ? "test" : "prod";
    var root = ensurePaneShell(paneBot);
    if (!root) return;
    var avatar = botAvatarFromTab(paneBot);
    var nameSuffix = paneBot === "test" ? "test" : "prod";
    var cats = catalog && Array.isArray(catalog.categories) ? catalog.categories : [];
    if (!cats.length) {
      root.setAttribute("aria-busy", "false");
      root.innerHTML =
        '<p class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.85">Nessun comando disponibile per il tuo ruolo.</p>';
      return;
    }
    var html = "";
    cats.forEach(function (cat) {
      var cmds = Array.isArray(cat.commands) ? cat.commands : [];
      if (!cmds.length) return;
      var cid = esc(cat.id || "");
      var ctitle = esc(cat.title || cat.id || "");
      html +=
        '<details class="vc-cmd-acc vc-cmd-grp" name="wiki-grp-' +
        nameSuffix +
        '" data-vc-cmd-cat="' +
        cid +
        '">' +
        '<summary class="vc-cmd-acc-sum">' +
        '<img class="vc-cmd-acc-avatar" src="' +
        esc(avatar) +
        '" alt="" width="32" height="32" decoding="async" />' +
        '<span class="vc-cmd-acc-text">' +
        '<span class="vc-cmd-acc-title vc-cmd-grp-title">' +
        ctitle +
        "</span>" +
        '<span class="vc-cmd-acc-meta" data-vc-cmd-grp-meta>' +
        esc(comandoMetaLabel(cmds.length)) +
        "</span>" +
        "</span>" +
        '<i class="fa fa-chevron-down vc-cmd-acc-chev" aria-hidden="true"></i>' +
        "</summary>" +
        '<div class="vc-cmd-acc-body vc-cmd-grp-list">';

      cmds.forEach(function (cmd) {
        var invoke = String(cmd.invoke || "").trim();
        var desc = String(cmd.description || "").trim() || "—";
        var blurb = String(cmd.blurb || desc).trim();
        var usage = String(cmd.usage || invoke).trim();
        var example = String(cmd.example || invoke).trim();
        var aliases = Array.isArray(cmd.aliases) ? cmd.aliases : [];
        var aliasLine = aliases.length ? "Alias: " + aliases.join(", ") : "";
        var searchBits = String(cmd.search || [invoke, desc, cat.title, aliases.join(" ")].join(" ")).toLowerCase();
        html +=
          '<details class="vc-cmd-item" name="wiki-item-' +
          nameSuffix +
          '" data-vc-cmd-search="' +
          esc(searchBits) +
          '" data-vc-cmd-roles="' +
          esc(cmd.rolesCsv || "") +
          '">' +
          '<summary class="vc-cmd-item-sum">' +
          '<div class="vc-cmd-item-sum-text">' +
          '<span class="vc-cmd-item-name">' +
          esc(invoke) +
          "</span>" +
          '<span class="vc-cmd-item-blurb">' +
          esc(blurb) +
          "</span>" +
          "</div>" +
          '<i class="fa fa-chevron-down vc-cmd-item-chev" aria-hidden="true"></i>' +
          "</summary>" +
          '<div class="vc-cmd-item-body">' +
          '<div class="vc-cmd-field"><div class="vc-cmd-field-label">Descrizione</div><div class="vc-cmd-field-text">' +
          esc(desc) +
          (aliasLine ? "<br><span style=\"opacity:.75\">" + esc(aliasLine) + "</span>" : "") +
          "</div></div>" +
          '<div class="vc-cmd-field"><div class="vc-cmd-field-label">Utilizzo</div><pre class="vc-cmd-code vc-cmd-code--usage" translate="no">' +
          esc(usage) +
          "</pre></div>" +
          '<div class="vc-cmd-field"><div class="vc-cmd-field-label">Esempio</div><pre class="vc-cmd-code vc-cmd-code--example" translate="no">' +
          esc(example) +
          "</pre></div>" +
          '<div class="vc-cmd-field vc-cmd-field--category"><div class="vc-cmd-field-label">Categoria</div>' +
          '<span class="vc-cmd-cat-pill"><i class="fa fa-diamond" aria-hidden="true"></i><span>' +
          ctitle +
          "</span></span></div>" +
          "</div></details>";
      });

      html += "</div></details>";
    });
    root.setAttribute("aria-busy", "false");
    root.innerHTML = html;
  }

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
    panes = panel.querySelectorAll(".vc-cmd-pane");
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

    var groups = activePane.querySelectorAll("details.vc-cmd-grp");
    var anyVisible = false;

    if (!needle) {
      groups.forEach(function (grp) {
        grp.classList.remove("vc-cmd-grp--hidden");
        grp.open = false;
        var visibleInGrp = 0;
        grp.querySelectorAll(".vc-cmd-item").forEach(function (det) {
          det.open = false;
          det.classList.remove("vc-cmd-item--hidden");
          visibleInGrp++;
        });
        if (visibleInGrp === 0) grp.classList.add("vc-cmd-grp--hidden");
        else {
          anyVisible = true;
          var meta = grp.querySelector("[data-vc-cmd-grp-meta]");
          if (meta) meta.textContent = comandoMetaLabel(visibleInGrp);
        }
      });
      if (emptyBox) emptyBox.hidden = anyVisible || groups.length === 0;
      if (panesWrap) panesWrap.classList.toggle("vc-cmd-panes--search-miss", !anyVisible && groups.length > 0);
      return;
    }

    var firstVisibleCmd = null;
    groups.forEach(function (grp) {
      var meta = grp.querySelector("[data-vc-cmd-grp-meta]");
      var titleEl = grp.querySelector(".vc-cmd-grp-title");
      var titleLower = titleEl ? titleEl.textContent.toLowerCase() : "";
      var titleMatch = titleLower.indexOf(needle) !== -1;
      var visibleInGrp = 0;
      grp.querySelectorAll(".vc-cmd-item").forEach(function (det) {
        var attr = String(det.getAttribute("data-vc-cmd-search") || "").toLowerCase();
        var body = (det.textContent || "").toLowerCase();
        var show = titleMatch || attr.indexOf(needle) !== -1 || body.indexOf(needle) !== -1;
        det.classList.toggle("vc-cmd-item--hidden", !show);
        det.open = false;
        if (show) {
          visibleInGrp++;
          anyVisible = true;
          if (!firstVisibleCmd) firstVisibleCmd = det;
        }
      });
      grp.classList.toggle("vc-cmd-grp--hidden", visibleInGrp === 0);
      grp.open = visibleInGrp > 0;
      if (meta && visibleInGrp > 0) meta.textContent = comandoMetaLabel(visibleInGrp);
    });
    if (firstVisibleCmd) firstVisibleCmd.open = true;
    if (emptyBox) emptyBox.hidden = anyVisible;
    if (panesWrap) panesWrap.classList.toggle("vc-cmd-panes--search-miss", !anyVisible);
  }

  function wikiHelpApiUrl(bot) {
    var base = "/webhooks/site-wiki-help";
    try {
      var cfg = window.__VC_SITE_WIKI_HELP || {};
      if (cfg.apiUrl) base = String(cfg.apiUrl);
    } catch (e) {}
    var paneBot = bot === "test" ? "test" : "prod";
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "bot=" + encodeURIComponent(paneBot === "test" ? "coffee" : "prod");
  }

  function readAccessToken() {
    try {
      if (window.VcDiscordAuth && typeof window.VcDiscordAuth.getAccessToken === "function") {
        return String(window.VcDiscordAuth.getAccessToken() || "").trim();
      }
    } catch (e) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e2) {
      return "";
    }
  }

  async function fetchOneCatalog(bot) {
    var root = ensurePaneShell(bot);
    if (root) {
      root.setAttribute("aria-busy", "true");
      if (!root.innerHTML.trim() || root.innerHTML.indexOf("Caricamento") !== -1 || root.querySelector(".vc-cmd-empty-text")) {
        root.innerHTML =
          '<p class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.85">Caricamento comandi…</p>';
      }
    }
    var token = readAccessToken();
    var headers = {};
    if (token) headers.Authorization = "Bearer " + token;
    try {
      var res = await fetch(wikiHelpApiUrl(bot), { headers: headers, cache: "no-store" });
      var data = await res.json().catch(function () {
        return {};
      });
      if (data && data.ok && data.catalog) {
        if (typeof data.economyVisible === "boolean") window.__VC_ECONOMY_VISIBLE = data.economyVisible;
        if (data.memberRoleId) window.__VC_WIKI_MEMBER_ROLE_ID = data.memberRoleId;
        renderCatalog(data.catalog, bot);
        return true;
      }
      if (root) {
        root.setAttribute("aria-busy", "false");
        root.innerHTML =
          '<p class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.85">Impossibile caricare i comandi. Riprova più tardi.</p>';
      }
    } catch (eFetch) {
      if (root) {
        root.setAttribute("aria-busy", "false");
        root.innerHTML =
          '<p class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.85">Impossibile caricare i comandi. Riprova più tardi.</p>';
      }
    }
    return false;
  }

  async function refreshCatalog() {
    await Promise.all([fetchOneCatalog("prod"), fetchOneCatalog("test")]);
    filter(search ? search.value : "");
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

  ensurePaneShell("prod");
  ensurePaneShell("test");
  setTab("prod");
  refreshCatalog();
  try {
    window.addEventListener("vc:access-ok", function () {
      refreshCatalog();
    });
    window.addEventListener("vc-discord-login", function () {
      refreshCatalog();
    });
  } catch (eEv) {}
})();
