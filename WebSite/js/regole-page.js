(function () {
  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_REGOLE) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function resolvedApiUrl() {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    if (isLocalFrontendOrigin() && local) return local;
    var url = String(c.apiUrl || "").trim();
    /* regoleApiFix1: vecchio bake puntava a /site-community-rules (404) */
    if (!url || /site-community-rules/i.test(url)) return "/webhooks/site-rules";
    return url;
  }

  var FA_ICON = {
    shield: "fa-shield",
    "balance-scale": "fa-balance-scale",
    users: "fa-users",
    bullhorn: "fa-bullhorn",
    refresh: "fa-refresh",
    ban: "fa-ban",
    comments: "fa-comments",
    link: "fa-link",
    "align-left": "fa-align-left",
    warning: "fa-exclamation-triangle",
    "eye-slash": "fa-eye-slash",
    music: "fa-music",
    "volume-off": "fa-volume-off",
    microphone: "fa-microphone",
    "file-text-o": "fa-file-text-o",
  };

  function faClass(iconKey) {
    var k = String(iconKey || "").trim();
    return FA_ICON[k] || "fa-file-text-o";
  }

  function faForCategoryIcon(iconKey) {
    return faClass(iconKey === "shield" ? "shield" : iconKey === "comments" ? "comments" : "microphone");
  }

  var payload = null;
  var activeCategory = "generale";
  var activeItemByCat = {};

  function setState(msg, isErr) {
    var text = String(msg || "").trim();
    var el = byId("vc-regole-state");
    // toastOnlyAlerts1: niente banner in cima — toast in basso (come ruoli/classifica).
    if (el) {
      el.textContent = "";
      el.hidden = true;
      el.className = "vc-regole-state";
    }
    if (!text) {
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.hide === "function") window.VcSiteToast.hide();
      } catch (eHide) {}
      return;
    }
    function paintToast() {
      try {
        if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
          window.VcSiteToast.show(text, Boolean(isErr), {
            ms: isErr ? 4200 : 1800,
            pending: !isErr && /[…]$|\.\.\.$|caricamento/i.test(text),
          });
          return true;
        }
      } catch (eToast) {}
      return false;
    }
    if (paintToast()) return;
    window.setTimeout(function () {
      if (paintToast()) return;
      if (!el) return;
      el.textContent = text;
      el.className = "vc-regole-state" + (isErr ? " vc-regole-state--err" : "");
      el.hidden = false;
    }, 120);
  }

  function revealAccordion() {
    if (typeof window.__vcRevealRegoleAccordion === "function") {
      window.__vcRevealRegoleAccordion();
    }
  }

  function t(key, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var v = window.VcI18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (e) {}
    return fallback != null ? fallback : key;
  }

  function renderTabs() {
    var root = byId("vc-regole-tabs");
    if (!root || !payload || !payload.categories) return;
    root.innerHTML = "";
    payload.categories.forEach(function (cat) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (cat.id === activeCategory ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", cat.id === activeCategory ? "true" : "false");
      btn.setAttribute("data-cat", cat.id);
      var ic = document.createElement("i");
      ic.className = "fa " + faForCategoryIcon(cat.icon);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + String(cat.label || cat.id)));
      btn.addEventListener("click", function () {
        activeCategory = cat.id;
        renderTabs();
        renderList();
      });
      root.appendChild(btn);
    });
    revealAccordion();
  }

  function renderSubSwitcher(kids, activeId, onPick) {
    var track = document.createElement("div");
    track.className = "vc-regole-tabs vc-regole-tabs--sub";
    track.setAttribute("role", "tablist");
    track.setAttribute("aria-label", t("rules.subAria", "Regole"));
    kids.forEach(function (child) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (String(child.id) === String(activeId) ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", String(child.id) === String(activeId) ? "true" : "false");
      btn.setAttribute("data-rule-sub", String(child.id));
      var ic = document.createElement("i");
      ic.className = "fa " + faClass(child.icon);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + String(child.id || "")));
      btn.addEventListener("click", function () {
        onPick(String(child.id));
      });
      track.appendChild(btn);
    });
    return track;
  }

  function makePanelShell(opts) {
    var panel = document.createElement("section");
    panel.className = "vc-regole-panel vc-regole-card";
    panel.setAttribute("data-rule-card", opts.id || "");
    var head = document.createElement("div");
    head.className = "vc-regole-panel__head";
    var ico = document.createElement("span");
    ico.className = "vc-regole-card-ico";
    var ii = document.createElement("i");
    ii.className = "fa " + faClass(opts.icon);
    ii.setAttribute("aria-hidden", "true");
    ico.appendChild(ii);
    var title = document.createElement("p");
    title.className = "vc-regole-card-title";
    title.textContent = opts.title || "";
    head.appendChild(ico);
    head.appendChild(title);
    if (opts.tag) {
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-shield";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + opts.tag));
      head.appendChild(tag);
    }
    var body = document.createElement("div");
    body.className = "vc-regole-card-body";
    body.style.display = "block";
    var inner = document.createElement("div");
    inner.className = "vc-regole-card-body-inner";
    var lab = document.createElement("span");
    lab.className = "vc-regole-body-label";
    lab.textContent = t("rules.description", "DESCRIZIONE");
    var p = document.createElement("p");
    p.className = "vc-regole-body-text";
    p.textContent = opts.body || "";
    inner.appendChild(lab);
    inner.appendChild(p);
    body.appendChild(inner);
    var links = Array.isArray(opts.links) ? opts.links : [];
    if (links.length) {
      var row = document.createElement("div");
      row.className = "vc-regole-card-links";
      links.forEach(function (lk) {
        var href = String((lk && lk.href) || "").trim();
        var label = String((lk && lk.label) || "").trim();
        if (!label || !/^https:\/\/discord\.com\//i.test(href)) return;
        var a = document.createElement("a");
        a.className = "vc-regole-card-linkbtn";
        a.href = href;
        a.rel = "noopener noreferrer";
        a.target = "_blank";
        var ic = document.createElement("i");
        ic.className = "fa fa-file-text-o";
        ic.setAttribute("aria-hidden", "true");
        a.appendChild(ic);
        a.appendChild(document.createTextNode(" " + label));
        row.appendChild(a);
      });
      if (row.childNodes.length) body.appendChild(row);
    }
    panel.appendChild(head);
    panel.appendChild(body);
    return panel;
  }

  function paintRule(rules, ruleId) {
    var root = byId("vc-regole-list");
    if (!root) return;
    var item = null;
    for (var i = 0; i < rules.length; i++) {
      if (String(rules[i].id) === String(ruleId)) {
        item = rules[i];
        break;
      }
    }
    if (!item) item = rules[0];
    if (!item) return;
    activeItemByCat[activeCategory] = String(item.id);
    root.innerHTML = "";
    if (rules.length > 1) {
      root.appendChild(
        renderSubSwitcher(rules, item.id, function (id) {
          paintRule(rules, id);
        }),
      );
    }
    root.appendChild(
      makePanelShell({
        id: String(item.id),
        icon: item.icon,
        title: String(item.title || ""),
        tag: String(item.tag || ""),
        body: String(item.body != null ? item.body : "").trim(),
        links: item.links,
      }),
    );
    revealAccordion();
  }

  function renderList() {
    var root = byId("vc-regole-list");
    if (!root || !payload || !payload.rules) return;
    root.innerHTML = "";
    var rules = payload.rules.filter(function (r) {
      return String(r.category || "") === activeCategory;
    });
    if (!rules.length) {
      var empty = document.createElement("p");
      empty.className = "vc-regole-state";
      empty.textContent = t("rules.empty", "Nessuna regola in questa categoria.");
      root.appendChild(empty);
      return;
    }
    var wanted = activeItemByCat[activeCategory];
    if (!wanted || !rules.some(function (r) { return String(r.id) === String(wanted); })) {
      wanted = String(rules[0].id);
    }
    paintRule(rules, wanted);
  }

  function applyDisclaimer() {
    var el = byId("vc-regole-disclaimer");
    if (!el || !payload) return;
    el.textContent = String(payload.disclaimer || "").trim() || el.textContent;
  }

  async function load() {
    var url = resolvedApiUrl();
    if (!url) {
      setState(t("rules.errApi", "API regole non configurata."), true);
      return;
    }
    setState(t("rules.loading", "Caricamento regole…"), false);
    try {
      var data = {};
      var resOk = false;
      var cached = null;
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var cacheKey = window.VcApiCache.keyFor(url, { scope: "regole" });
        cached = await window.VcApiCache.fetchWithCache(cacheKey, url, {
          ttlMs: 10 * 60 * 1000,
          staleMs: 60 * 60 * 1000,
          persistMs: 24 * 60 * 60 * 1000,
          timeoutMs: 15000,
          fetchInit: { method: "GET", credentials: "omit", cache: "no-store" },
        });
        data = (cached && cached.body) || {};
        resOk = Boolean(cached && cached.ok && data.ok);
      } else {
        var res = await fetch(url, { method: "GET", credentials: "omit" });
        try {
          data = await res.json();
        } catch (e) {
          data = {};
        }
        resOk = Boolean(res.ok && data.ok);
      }
      if (!resOk && cached && cached.status === 429 && window.VcApiCache) {
        var staleKey = window.VcApiCache.keyFor(url, { scope: "regole" });
        try {
          var raw = localStorage.getItem("vc:apicache:local:" + staleKey);
          if (raw) {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.value && parsed.value.body && parsed.value.body.ok) {
              data = parsed.value.body;
              resOk = true;
            }
          }
        } catch (eStale) {}
      }
      if (!resOk) {
        setState(t("rules.errLoad", "Impossibile caricare le regole dal bot."), true);
        return;
      }
      payload = data;
      setState("", false);
      applyDisclaimer();
      renderTabs();
      renderList();
    } catch (e2) {
      setState(t("rules.errNetwork", "Errore di rete nel caricamento delle regole."), true);
    }
  }

  function init() {
    load();
  }

  document.addEventListener("vc:langchange", function () {
    if (!payload) return;
    renderTabs();
    renderList();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
