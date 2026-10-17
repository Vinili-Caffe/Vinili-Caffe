(function () {
  /* wikiHelpLoadFix2: parse text+JSON; render try/catch; gen lock anti-race; toast lastMsg */
  var panel = document.getElementById("wiki-comandi-panel");
  if (!panel) return;
  var loadGen = { prod: 0, test: 0 };

  var tabButtons = panel.querySelectorAll(".vc-cmd-tab");
  var panes = panel.querySelectorAll(".vc-cmd-pane");
  var search = document.getElementById("wiki-cmd-search");
  var emptyBox = document.getElementById("wiki-cmd-empty");
  var panesWrap = panel.querySelector(".vc-cmd-panes");
  var liveRootProd = null;
  var liveRootTest = null;

  /* wikiBotAvatar1: baked CDN URLs (src="#" was wiping Vinili/Caffè avatars → silhouette) */
  var BOT_AVATAR_URL = {
    prod: "https://cdn.discordapp.com/avatars/1329118940110127204/a_2f3825915a41d0f9bcbf9f2675e6d6f0.gif?size=128",
    test: "https://cdn.discordapp.com/avatars/1466495522474037463/a_22dd648e8c21d246ccca2cf395533ea8.gif?size=128",
  };

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

  function isUsableBotAvatarSrc(src) {
    var s = String(src || "").trim();
    if (!s) return false;
    if (s === "#" || s === "/" || s.indexOf("{{") !== -1) return false;
    if (s.indexOf("embed/avatars") !== -1) return false;
    if (s.indexOf("data:image/svg") === 0) return false;
    return /^https?:\/\//i.test(s);
  }

  function botAvatarUrl(bot) {
    return BOT_AVATAR_URL[bot === "test" ? "test" : "prod"] || siteAvatarFallback();
  }

  function ensureTabBotAvatars() {
    ["prod", "test"].forEach(function (bot) {
      var sel = bot === "test" ? "#wiki-tab-test .vc-cmd-tab-avatar" : "#wiki-tab-prod .vc-cmd-tab-avatar";
      var img = panel.querySelector(sel);
      if (!img) return;
      var want = botAvatarUrl(bot);
      if (!isUsableBotAvatarSrc(img.getAttribute("src"))) {
        img.setAttribute("src", want);
      }
      img.onerror = function () {
        if (img.getAttribute("src") !== want) img.setAttribute("src", want);
        else img.setAttribute("src", siteAvatarFallback());
      };
    });
  }

  function botAvatarFromTab(bot) {
    var paneBot = bot === "test" ? "test" : "prod";
    var sel =
      paneBot === "test"
        ? "#wiki-tab-test .vc-cmd-tab-avatar"
        : "#wiki-tab-prod .vc-cmd-tab-avatar";
    var img = panel.querySelector(sel);
    var src = img && img.getAttribute("src");
    if (isUsableBotAvatarSrc(src)) return src;
    return botAvatarUrl(paneBot);
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

  /* wikiCatToneSand1: tutte le icone categorie stesso sabbia (niente violet) */
  var CAT_ICON_MAP = {
    utility: { fa: "fa-wrench", tone: "" },
    music: { fa: "fa-music", tone: "" },
    musica: { fa: "fa-music", tone: "" },
    tts: { fa: "fa-microphone", tone: "" },
    level: { fa: "fa-trophy", tone: "" },
    levels: { fa: "fa-trophy", tone: "" },
    livelli: { fa: "fa-trophy", tone: "" },
    minigames: { fa: "fa-gamepad", tone: "" },
    minigiochi: { fa: "fa-gamepad", tone: "" },
    stats: { fa: "fa-bar-chart", tone: "" },
    statistiche: { fa: "fa-bar-chart", tone: "" },
    economy: { fa: "fa-money", tone: "" },
    economia: { fa: "fa-money", tone: "" },
    staff: { fa: "fa-shield", tone: "" },
    moderation: { fa: "fa-gavel", tone: "" },
    moderazione: { fa: "fa-gavel", tone: "" },
    event: { fa: "fa-calendar", tone: "" },
    events: { fa: "fa-calendar", tone: "" },
    eventi: { fa: "fa-calendar", tone: "" },
    admin: { fa: "fa-lock", tone: "" },
    dev: { fa: "fa-code", tone: "" },
    developer: { fa: "fa-code", tone: "" },
    vip: { fa: "fa-star", tone: "" },
  };

  function catIconMeta(cat) {
    var id = String((cat && cat.id) || "")
      .trim()
      .toLowerCase();
    var title = String((cat && (cat.title || cat.name)) || "")
      .trim()
      .toLowerCase();
    return (
      CAT_ICON_MAP[id] ||
      CAT_ICON_MAP[title] ||
      { fa: "fa-folder-o", tone: "" }
    );
  }

  function catIconHtml(cat) {
    var meta = catIconMeta(cat);
    var tone = meta.tone ? " vc-cmd-acc-ico--" + meta.tone : "";
    return (
      '<span class="vc-cmd-acc-ico' +
      tone +
      '" aria-hidden="true"><i class="fa ' +
      meta.fa +
      '"></i></span>'
    );
  }

  function catPillIconClass(cat) {
    return catIconMeta(cat).fa || "fa-folder-o";
  }

  function comandoMetaLabel(n) {
    if (n === 1) return t("wiki.cmdCountOne", { n: n }, "1 comando");
    return t("wiki.cmdCountMany", { n: n }, String(n) + " comandi");
  }

  function renderCatalog(catalog, bot) {
    var paneBot = bot === "test" ? "test" : "prod";
    var root = ensurePaneShell(paneBot);
    if (!root) return;
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
      var pillFa = catPillIconClass(cat);
      html +=
        '<details class="vc-cmd-acc vc-cmd-grp" name="wiki-grp-' +
        nameSuffix +
        '" data-vc-cmd-cat="' +
        cid +
        '">' +
        '<summary class="vc-cmd-acc-sum">' +
        catIconHtml(cat) +
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
          '<span class="vc-cmd-cat-pill"><i class="fa ' +
          pillFa +
          '" aria-hidden="true"></i><span>' +
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
      if (typeof window.__vcDiscordGetRealAccessToken === "function") {
        var real = String(window.__vcDiscordGetRealAccessToken() || "").trim();
        if (real) return real;
      }
    } catch (eReal) {}
    try {
      if (window.VcDiscordAuth && typeof window.VcDiscordAuth.getAccessToken === "function") {
        var t = String(window.VcDiscordAuth.getAccessToken() || "").trim();
        if (t) return t;
      }
    } catch (e) {}
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var t2 = String(window.__vcDiscordGetAccessToken() || "").trim();
        if (t2) return t2;
      }
    } catch (e2) {}
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e3) {
      return "";
    }
  }

  function readViewAsMode() {
    try {
      if (window.VcViewAs && typeof window.VcViewAs.getMode === "function") {
        return String(window.VcViewAs.getMode() || "").trim().toLowerCase();
      }
    } catch (eVa) {}
    try {
      var v = String(sessionStorage.getItem("vc_view_as") || "")
        .trim()
        .toLowerCase();
      if (!v || v === "real" || v === "none" || v === "off") return "";
      return v;
    } catch (e2) {
      return "";
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      window.setTimeout(resolve, ms);
    });
  }

  function showWikiToast(msg, isError) {
    var text = String(msg || "").trim();
    if (!text) return;
    try {
      if (window.VcSiteToast && typeof window.VcSiteToast.show === "function") {
        window.VcSiteToast.show(text, Boolean(isError), { ms: isError ? 3600 : 1600 });
        return;
      }
    } catch (eT) {}
    try {
      if (window.VcDashToast && typeof window.VcDashToast.show === "function") {
        window.VcDashToast.show(text, Boolean(isError));
      }
    } catch (eD) {}
  }

  function renderLoadError(root, bot) {
    if (!root) return;
    root.setAttribute("aria-busy", "false");
    root.innerHTML =
      '<div class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.9;display:flex;flex-direction:column;gap:.75rem;align-items:flex-start">' +
      "<span>I comandi non sono disponibili al momento.</span>" +
      '<button type="button" class="vc-cmd-retry-btn" data-vc-wiki-retry="' +
      esc(bot === "test" ? "test" : "prod") +
      '" style="appearance:none;border:1px solid rgba(212,168,136,.35);background:rgba(212,168,136,.12);color:#f4e6d6;border-radius:999px;padding:.45rem 1rem;cursor:pointer;font:inherit">Riprova</button>' +
      "</div>";
    var btn = root.querySelector("[data-vc-wiki-retry]");
    if (btn) {
      btn.addEventListener("click", function () {
        fetchOneCatalog(bot === "test" ? "test" : "prod");
      });
    }
  }

  function catalogLooksOk(data) {
    if (!data || typeof data !== "object") return false;
    if (data.catalog && typeof data.catalog === "object") {
      if (Array.isArray(data.catalog.categories)) return true;
      if (data.ok === true) return true;
    }
    if (data.ok === true && (data.catalog == null || data.catalog === false)) return true;
    return false;
  }

  async function fetchOneCatalog(bot) {
    var paneBot = bot === "test" ? "test" : "prod";
    var gen = (loadGen[paneBot] = (loadGen[paneBot] || 0) + 1);
    var root = ensurePaneShell(paneBot);
    if (root) {
      root.setAttribute("aria-busy", "true");
      if (
        !root.innerHTML.trim() ||
        root.innerHTML.indexOf("Caricamento") !== -1 ||
        root.querySelector(".vc-cmd-empty-text") ||
        root.querySelector(".vc-cmd-retry-btn")
      ) {
        root.innerHTML =
          '<p class="vc-cmd-empty-text" style="padding:1rem 0.25rem;opacity:.85">Caricamento comandi…</p>';
      }
    }
    var token = readAccessToken();
    var headers = { Accept: "application/json" };
    if (token) headers.Authorization = "Bearer " + token;
    /* viewAsNoFlash1: header esplicito (wiki gareggia col load di vc-view-as) */
    var viewAs = readViewAsMode();
    if (viewAs) headers["X-VC-View-As"] = viewAs;

    var cacheKey = "vc_wiki_help_" + paneBot + "_" + (viewAs || "real");
    function readCachedCatalog() {
      try {
        var raw = sessionStorage.getItem(cacheKey);
        if (!raw) return null;
        var parsed = JSON.parse(raw);
        if (!parsed || !parsed.at || Date.now() - Number(parsed.at) > 10 * 60 * 1000) return null;
        return parsed.data || null;
      } catch (eC) {
        return null;
      }
    }
    function writeCachedCatalog(data) {
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data: data }));
      } catch (eW) {}
    }

    var lastMsg = "";
    var lastStatus = 0;
    for (var attempt = 0; attempt < 3; attempt += 1) {
      if (gen !== loadGen[paneBot]) return false;
      try {
        /* pageTune1: VcApiCache + ETag invece di fetch no-store ogni volta */
        var wikiUrl = wikiHelpApiUrl(paneBot);
        var data = null;
        if (window.VcApiCache && typeof window.VcApiCache.fetchWithCache === "function") {
          var cacheKey = window.VcApiCache.keyFor(wikiUrl, {
            scope: "wiki",
            auth: headers.Authorization || headers.authorization || "",
            v: "pageTune1",
          });
          var wrapped = await window.VcApiCache.fetchWithCache(cacheKey, wikiUrl, {
            fetchInit: {
              method: "GET",
              headers: headers,
              credentials: "same-origin",
              cache: "default",
            },
            ttlMs: 120000,
            staleMs: 30 * 60 * 1000,
            timeoutMs: 20000,
          });
          lastStatus = Number((wrapped && wrapped.status) || 0) || (wrapped && wrapped.ok ? 200 : 0);
          data = wrapped && wrapped.body ? wrapped.body : null;
          if (!data && wrapped && wrapped.ok === false) {
            lastMsg = String((wrapped && wrapped.error) || "cache_fetch_failed");
          }
        } else {
          var res = await fetch(wikiUrl, {
            method: "GET",
            headers: headers,
            cache: "default",
            credentials: "same-origin",
          });
          lastStatus = Number(res && res.status) || 0;
          var raw = await res.text();
          if (raw && raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
          try {
            data = raw ? JSON.parse(raw) : {};
          } catch (eJson) {
            lastMsg = "invalid_json:" + String((eJson && eJson.message) || "parse");
            data = null;
          }
        }
        if (catalogLooksOk(data)) {
          if (typeof data.economyVisible === "boolean") window.__VC_ECONOMY_VISIBLE = data.economyVisible;
          if (data.memberRoleId) window.__VC_WIKI_MEMBER_ROLE_ID = data.memberRoleId;
          var cat =
            data.catalog && typeof data.catalog === "object"
              ? data.catalog
              : { categories: [] };
          try {
            if (gen !== loadGen[paneBot]) return false;
            writeCachedCatalog(data);
            renderCatalog(cat, paneBot);
            return true;
          } catch (eRender) {
            lastMsg = "render:" + String((eRender && eRender.message) || eRender);
            try {
              console.warn("[wiki-commands] render failed", paneBot, eRender);
            } catch (eLogR) {}
          }
        } else {
          lastMsg =
            (data && (data.message || data.error)) ||
            (res && !res.ok ? "HTTP " + res.status : "") ||
            (raw && raw.charAt(0) === "<" ? "html_body" : "") ||
            "catalog_missing";
          if (lastStatus === 429) {
            try {
              if (window.VcApiCache && typeof window.VcApiCache.noteWebhook429 === "function") {
                var ra = Number(res.headers && res.headers.get("Retry-After")) || 0;
                window.VcApiCache.noteWebhook429(ra, wikiHelpApiUrl(paneBot));
              }
            } catch (eNote) {}
            await sleep(Math.max(1200, (attempt + 1) * 1600));
            continue;
          }
        }
      } catch (eFetch) {
        lastMsg = (eFetch && eFetch.message) || "network";
      }
      if (attempt < 2) await sleep(lastStatus === 429 ? 1600 * (attempt + 1) : 280 * (attempt + 1));
    }

    if (gen !== loadGen[paneBot]) return false;
    var cached = readCachedCatalog();
    if (catalogLooksOk(cached)) {
      try {
        var cachedCat =
          cached.catalog && typeof cached.catalog === "object" ? cached.catalog : { categories: [] };
        renderCatalog(cachedCat, paneBot);
        showWikiToast("Comandi da cache (rete limitata). Aggiorna tra poco.", false);
        return true;
      } catch (eCacheRender) {}
    }
    var toastMsg = "Impossibile caricare i comandi. Riprova più tardi.";
    if (lastMsg && lastMsg !== "catalog_missing") {
      toastMsg = "Impossibile caricare i comandi (" + String(lastMsg).slice(0, 48) + ").";
    }
    showWikiToast(toastMsg, true);
    root = ensurePaneShell(paneBot);
    renderLoadError(root, paneBot);
    try {
      console.warn("[wiki-commands] load failed", paneBot, lastMsg);
      window.__VC_WIKI_LAST_ERR = { bot: paneBot, msg: lastMsg, at: Date.now() };
    } catch (eLog) {}
    return false;
  }

  async function refreshCatalog() {
    /* wiki429Fix1: serializza prod→coffee, evita stampede parallelo */
    await fetchOneCatalog("prod");
    await sleep(120);
    await fetchOneCatalog("test");
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
    function go() {
      var node = document.getElementById(raw);
      if (!node) return;
      try {
        var y =
          node.getBoundingClientRect().top +
          (window.pageYOffset || document.documentElement.scrollTop || 0) -
          72;
        if (typeof window.scrollTo === "function") {
          window.scrollTo({ top: Math.max(0, y), left: 0, behavior: "instant" });
        } else {
          node.scrollIntoView({ block: "start" });
        }
      } catch (eScr) {
        try {
          node.scrollIntoView({ block: "start" });
        } catch (e2) {}
      }
      stripLocationHash();
    }
    /* notifHashYoYo1: non scrollare sotto curtain/boot */
    var root = document.documentElement;
    var bootBusy =
      root.classList.contains("vc-interaction-hold") ||
      (root.classList.contains("vc-page-cine-boot") && !root.classList.contains("vc-page-cine-ready")) ||
      (document.getElementById("vc-cine-boot-curtain") && !root.classList.contains("vc-cine-curtain-off"));
    if (bootBusy) {
      document.addEventListener("vc:cine-curtain-off", go, { once: true });
      document.addEventListener("vc:page-cine-ready", go, { once: true });
      window.setTimeout(go, 900);
      return;
    }
    requestAnimationFrame(go);
  })();

  ensurePaneShell("prod");
  ensurePaneShell("test");
  ensureTabBotAvatars();
  setTab("prod");
  var refreshTimer = 0;
  var refreshInFlight = false;
  var refreshQueued = false;
  function scheduleRefresh(delayMs) {
    try {
      if (refreshTimer) window.clearTimeout(refreshTimer);
    } catch (eClr) {}
    refreshTimer = window.setTimeout(function () {
      refreshTimer = 0;
      if (refreshInFlight) {
        refreshQueued = true;
        return;
      }
      refreshInFlight = true;
      Promise.resolve(refreshCatalog())
        .catch(function () {})
        .then(function () {
          refreshInFlight = false;
          if (refreshQueued) {
            refreshQueued = false;
            scheduleRefresh(250);
          }
        });
    }, Math.max(180, Number(delayMs) || 0));
  }
  scheduleRefresh(220);
  try {
    window.addEventListener("vc:access-ok", function () {
      scheduleRefresh(400);
    });
    window.addEventListener("vc-discord-login", function () {
      scheduleRefresh(400);
    });
    window.addEventListener("vc:staff-access-ok", function () {
      scheduleRefresh(500);
    });
    window.addEventListener("vc:view-as-allowed", function () {
      scheduleRefresh(500);
    });
  } catch (eEv) {}
})();
