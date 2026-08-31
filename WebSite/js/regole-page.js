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
    return String(c.apiUrl || "").trim();
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

  function setState(msg, isErr) {
    var el = byId("vc-regole-state");
    if (!el) return;
    el.textContent = msg || "";
    el.className = "vc-regole-state" + (isErr ? " vc-regole-state--err" : "");
    el.hidden = !msg;
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
      empty.textContent = window.VcI18n && typeof window.VcI18n.t === "function"
        ? window.VcI18n.t("rules.empty")
        : "Nessuna regola in questa categoria.";
      root.appendChild(empty);
      return;
    }
    var cards = [];
    rules.forEach(function (r) {
      var det = document.createElement("details");
      det.className = "vc-regole-card";
      var sum = document.createElement("summary");
      var ico = document.createElement("span");
      ico.className = "vc-regole-card-ico";
      var ii = document.createElement("i");
      ii.className = "fa " + faClass(r.icon);
      ii.setAttribute("aria-hidden", "true");
      ico.appendChild(ii);
      var main = document.createElement("div");
      main.className = "vc-regole-card-main";
      var h = document.createElement("p");
      h.className = "vc-regole-card-title";
      h.textContent = String(r.title || "");
      var bodyStr = String(r.body != null ? r.body : "").trim();
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-shield";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + String(r.tag || "")));
      main.appendChild(h);
      main.appendChild(tag);
      var chev = document.createElement("span");
      chev.className = "vc-regole-card-chev";
      chev.setAttribute("aria-hidden", "true");
      chev.innerHTML = '<i class="fa fa-chevron-down"></i>';
      sum.appendChild(ico);
      sum.appendChild(main);
      sum.appendChild(chev);
      var body = document.createElement("div");
      body.className = "vc-regole-card-body";
      var inner = document.createElement("div");
      inner.className = "vc-regole-card-body-inner";
      var lab = document.createElement("span");
      lab.className = "vc-regole-body-label";
      lab.textContent = window.VcI18n && typeof window.VcI18n.t === "function"
        ? window.VcI18n.t("rules.description")
        : "DESCRIZIONE";
      var p = document.createElement("p");
      p.className = "vc-regole-body-text";
      p.textContent = bodyStr;
      inner.appendChild(lab);
      inner.appendChild(p);
      body.appendChild(inner);
      var links = Array.isArray(r.links) ? r.links : [];
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
      det.appendChild(sum);
      det.appendChild(body);
      cards.push(det);
      root.appendChild(det);
    });
    cards.forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (!det.open) return;
        cards.forEach(function (other) {
          if (other !== det) other.open = false;
        });
      });
    });
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
      if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
        var cacheKey = window.VcApiCache.keyFor(url, { scope: "regole" });
        var cached = await window.VcApiCache.fetchWithCache(cacheKey, url, {
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