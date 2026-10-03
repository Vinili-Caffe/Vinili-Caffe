(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var state = {
    sections: [],
    intro: null,
    activeTab: "",
    activeChild: "",
    cache: {},
    loading: false,
  };

  var TAB_ICONS = {
    regolamento: "fa-gavel",
    regole_staff: "fa-id-badge",
    limiti: "fa-calendar-check-o",
    moderazione_staff: "fa-shield",
    compiti_fissi: "fa-check-square-o",
    pause: "fa-pause-circle-o",
    lineeguida: "fa-compass",
    comandi: "fa-terminal",
    valutazioni: "fa-star",
    pex: "fa-level-up",
    warnstaff: "fa-ban",
    guidapartners: "fa-handshake-o",
    guidamiddle: "fa-users",
  };

  var TAB_LABELS = {
    regolamento: "Regolamento",
    regole_staff: "Staff",
    limiti: "Limiti",
    compiti_fissi: "Compiti",
    pause: "Pause",
    lineeguida: "Linee guida",
    comandi: "Comandi",
    valutazioni: "Valutazioni",
    pex: "Pex",
    warnstaff: "Warn",
    guidapartners: "Partners",
    guidamiddle: "Middle",
  };

  var CARD_ICONS = {
    generalimoderazione: "fa-list",
    testualimoderazione: "fa-commenting-o",
    vocalimoderazione: "fa-microphone",
    middle_ticket: "fa-ticket",
    middle_selfie: "fa-camera",
    middle_follower: "fa-heart-o",
    middle_partnership: "fa-handshake-o",
  };

  function apiUrl(sectionId) {
    var base = T.resolveApiUrl(window.__VC_STAFF_GUIDE, "/webhooks/site-staff-guide");
    if (!sectionId) return base;
    var sep = base.indexOf("?") >= 0 ? "&" : "?";
    return base + sep + "section=" + encodeURIComponent(sectionId);
  }

  function topLevelSections() {
    return (state.sections || []).filter(function (s) {
      return !s.parent;
    });
  }

  function childrenOf(parentId) {
    return (state.sections || []).filter(function (s) {
      return s.parent === parentId;
    });
  }

  function findSection(id) {
    return (state.sections || []).find(function (s) {
      return s.id === id;
    });
  }

  function tabIcon(id) {
    return TAB_ICONS[id] || "fa-file-text-o";
  }

  function cardIcon(id) {
    return CARD_ICONS[id] || tabIcon(id) || "fa-book";
  }

  function syncUrl(sectionId) {
    try {
      var u = new URL(location.href);
      if (sectionId) u.searchParams.set("section", sectionId);
      else u.searchParams.delete("section");
      history.replaceState(null, "", u.pathname + u.search);
    } catch (e) {}
  }

  function sectionAllowed(id) {
    var key = String(id || "").trim();
    if (!key) return false;
    return (state.sections || []).some(function (s) {
      return s && s.id === key;
    });
  }

  function seedCacheFromStaticPack(allowedIds) {
    var out = {};
    try {
      var pack = window.__VC_STAFF_GUIDE_STATIC;
      var byId = pack && pack.byId && typeof pack.byId === "object" ? pack.byId : null;
      if (!byId) return out;
      Object.keys(allowedIds || {}).forEach(function (id) {
        if (byId[id]) out[id] = byId[id];
      });
    } catch (eSeed) {}
    return out;
  }

  function fetchSection(id) {
    var key = String(id || "").trim();
    if (!key) return Promise.resolve(null);
    /* pmGuideOnly1: niente contenuto statico per sezioni fuori dai permessi API */
    if (!sectionAllowed(key)) {
      return Promise.reject(new Error("Non hai i permessi per leggere questa sezione della guida."));
    }
    if (state.cache[key]) return Promise.resolve(state.cache[key]);
    /* contentStatic1: prefer baked pack, skip webhook per section (solo se allowed) */
    try {
      var pack = window.__VC_STAFF_GUIDE_STATIC;
      if (pack && pack.byId && pack.byId[key]) {
        state.cache[key] = pack.byId[key];
        return Promise.resolve(state.cache[key]);
      }
    } catch (eBake) {}
    return T.fetchJson(apiUrl(key), {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(45000) : 45000,
    }).then(function (out) {
      if (!out.res.ok || !out.data || !out.data.ok || !out.data.section) {
        throw new Error((out.data && out.data.message) || "Sezione non disponibile.");
      }
      state.cache[key] = out.data.section;
      return out.data.section;
    });
  }

  function revealAccordion() {
    if (typeof window.__vcRevealRegoleAccordion === "function") {
      window.__vcRevealRegoleAccordion();
    }
  }

  function renderTabs() {
    var root = T.byId("vc-staff-guide-tabs");
    if (!root) return;
    var tabs = topLevelSections().map(function (s) {
      return { id: s.id, label: TAB_LABELS[s.id] || s.label };
    });
    root.innerHTML = "";
    tabs.forEach(function (tab) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (tab.id === state.activeTab ? " vc-regole-tab--on" : "");
      btn.setAttribute("data-guide-tab", tab.id);
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", tab.id === state.activeTab ? "true" : "false");
      var ic = document.createElement("i");
      ic.className = "fa " + tabIcon(tab.id);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + tab.label));
      btn.addEventListener("click", function () {
        selectTab(tab.id);
      });
      root.appendChild(btn);
    });
    revealAccordion();
  }

  function makeCard(opts) {
    var det = document.createElement("details");
    det.className = "vc-regole-card";
    det.setAttribute("data-guide-card", opts.id || "");
    if (opts.open) det.open = true;

    var sum = document.createElement("summary");
    var ico = document.createElement("span");
    ico.className = "vc-regole-card-ico";
    var ii = document.createElement("i");
    ii.className = "fa " + cardIcon(opts.id);
    ii.setAttribute("aria-hidden", "true");
    ico.appendChild(ii);

    var main = document.createElement("div");
    main.className = "vc-regole-card-main";
    var h = document.createElement("p");
    h.className = "vc-regole-card-title";
    h.textContent = opts.title || "";
    main.appendChild(h);
    if (opts.tag) {
      var tag = document.createElement("div");
      tag.className = "vc-regole-card-tag";
      var ti = document.createElement("i");
      ti.className = "fa fa-book";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + opts.tag));
      main.appendChild(tag);
    }

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
    inner.className = "vc-regole-card-body-inner vc-staff-guide-faq-body";
    var lab = document.createElement("span");
    lab.className = "vc-regole-body-label";
    lab.textContent = "GUIDA";
    var content = document.createElement("div");
    content.className = "vc-regole-body-text vc-staff-guide-prose";
    content.innerHTML = opts.html
      ? opts.html
      : '<p class="vc-staff-guide-p">Caricamento\u2026</p>';
    inner.appendChild(lab);
    inner.appendChild(content);
    body.appendChild(inner);

    det.appendChild(sum);
    det.appendChild(body);
    det._guideContent = content;
    det._guideId = opts.id || "";
    det._guideLoaded = Boolean(opts.html);
    return det;
  }

  function bindExclusiveOpen(cards) {
    cards.forEach(function (det) {
      det.addEventListener("toggle", function () {
        if (!det.open) return;
        cards.forEach(function (other) {
          if (other !== det) other.open = false;
        });
        if (!det._guideLoaded && det._guideId) {
          loadCardContent(det);
        }
        if (det._guideId) syncUrl(det._guideId);
        else if (state.activeTab) syncUrl(state.activeTab);
        else syncUrl("");
      });
    });
  }

  function loadCardContent(det) {
    var id = det._guideId;
    if (!id || !det._guideContent) return;
    det._guideContent.innerHTML = '<p class="vc-staff-guide-p">Caricamento\u2026</p>';
    fetchSection(id)
      .then(function (section) {
        det._guideLoaded = true;
        det._guideContent.innerHTML = (section && section.html) || '<p class="vc-staff-guide-p">Contenuto non disponibile.</p>';
      })
      .catch(function (err) {
        det._guideContent.innerHTML =
          '<p class="vc-staff-guide-p">' + T.esc((err && err.message) || "Errore di rete.") + "</p>";
      });
  }

  function makePanelShell(opts) {
    var panel = document.createElement("section");
    panel.className = "vc-staff-guide-panel vc-regole-card";
    panel.setAttribute("data-guide-card", opts.id || "");
    var head = document.createElement("div");
    head.className = "vc-staff-guide-panel__head";
    var ico = document.createElement("span");
    ico.className = "vc-regole-card-ico";
    var ii = document.createElement("i");
    ii.className = "fa " + cardIcon(opts.id);
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
      ti.className = "fa fa-book";
      ti.setAttribute("aria-hidden", "true");
      tag.appendChild(ti);
      tag.appendChild(document.createTextNode(" " + opts.tag));
      head.appendChild(tag);
    }
    var body = document.createElement("div");
    body.className = "vc-regole-card-body";
    body.style.display = "block";
    var inner = document.createElement("div");
    inner.className = "vc-regole-card-body-inner vc-staff-guide-faq-body";
    var lab = document.createElement("span");
    lab.className = "vc-regole-body-label";
    lab.textContent = "GUIDA";
    var content = document.createElement("div");
    content.className = "vc-regole-body-text vc-staff-guide-prose";
    content.innerHTML = opts.html
      ? opts.html
      : '<p class="vc-staff-guide-p">Caricamento\u2026</p>';
    inner.appendChild(lab);
    inner.appendChild(content);
    body.appendChild(inner);
    panel.appendChild(head);
    panel.appendChild(body);
    panel._guideContent = content;
    panel._guideId = opts.id || "";
    panel._guideLoaded = Boolean(opts.html);
    return panel;
  }

  function renderSubSwitcher(kids, activeId, onPick) {
    var track = document.createElement("div");
    track.className = "vc-regole-tabs vc-regole-tabs--sub";
    track.setAttribute("role", "tablist");
    track.setAttribute("aria-label", "Sottosezioni");
    kids.forEach(function (child) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "vc-regole-tab" + (child.id === activeId ? " vc-regole-tab--on" : "");
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", child.id === activeId ? "true" : "false");
      btn.setAttribute("data-guide-sub", child.id);
      var ic = document.createElement("i");
      ic.className = "fa " + cardIcon(child.id);
      ic.setAttribute("aria-hidden", "true");
      btn.appendChild(ic);
      btn.appendChild(document.createTextNode(" " + (child.label || child.id)));
      btn.addEventListener("click", function () {
        onPick(child.id);
      });
      track.appendChild(btn);
    });
    return track;
  }

  function renderList() {
    var root = T.byId("vc-staff-guide-list");
    if (!root) return;
    root.innerHTML = "";

    var tabId = state.activeTab;

    if (!tabId) {
      root.innerHTML = '<p class="vc-regole-state">Seleziona una sezione della guida.</p>';
      return;
    }

    var meta = findSection(tabId);
    var kids = childrenOf(tabId);
    if (kids.length) {
      var wanted = "";
      try {
        wanted = String(new URL(location.href).searchParams.get("section") || "").trim();
      } catch (eWanted) {}
      var activeChild = kids[0].id;
      if (wanted && kids.some(function (k) { return k.id === wanted; })) activeChild = wanted;
      else if (state.activeChild && kids.some(function (k) { return k.id === state.activeChild; })) {
        activeChild = state.activeChild;
      }
      state.activeChild = activeChild;

      function paintChild(childId) {
        state.activeChild = childId;
        root.innerHTML = "";
        root.appendChild(
          renderSubSwitcher(kids, childId, function (id) {
            syncUrl(id);
            paintChild(id);
          }),
        );
        var childMeta = findSection(childId);
        var panel = makePanelShell({
          id: childId,
          title: childMeta ? childMeta.label : childId,
          tag: meta ? meta.label : "Sezione",
          html: "",
        });
        root.appendChild(panel);
        loadCardContent(panel);
        revealAccordion();
      }

      paintChild(activeChild);
      return;
    }

    state.activeChild = "";
    var placeholder = makePanelShell({
      id: tabId,
      title: meta ? meta.label : tabId,
      tag: meta && meta.description ? meta.description : "Sezione",
      html: "",
    });
    root.appendChild(placeholder);
    loadCardContent(placeholder);
    revealAccordion();
  }

  function selectTab(tabId, opts) {
    opts = opts || {};
    state.activeTab = String(tabId || "");
    state.activeChild = "";
    renderTabs();
    renderList();
    if (!opts.keepUrl) {
      if (state.activeTab && childrenOf(state.activeTab).length) {
        var first = childrenOf(state.activeTab)[0];
        syncUrl(first ? first.id : state.activeTab);
      } else {
        syncUrl(state.activeTab);
      }
    }
  }

  function resolveInitialTab() {
    var wanted = "";
    try {
      wanted = String(new URL(location.href).searchParams.get("section") || "").trim();
    } catch (e) {}
    /* guideMdMiddleTrim1: sezioni middle disattivate → apri Middle */
    if (wanted === "middle_follower" || wanted === "middle_partnership") return "guidamiddle";
    if (wanted) {
      var sec = findSection(wanted);
      if (sec) {
        if (sec.parent) return sec.parent;
        return sec.id;
      }
    }
    var tops = topLevelSections();
    return tops.length ? tops[0].id : "";
  }

  function openWantedCard() {
    var wanted = "";
    try {
      wanted = String(new URL(location.href).searchParams.get("section") || "").trim();
    } catch (e) {}
    if (!wanted) return;
    var list = T.byId("vc-staff-guide-list");
    if (!list) return;
    var subBtn = list.querySelector('[data-guide-sub="' + wanted.replace(/"/g, "") + '"]');
    if (subBtn && typeof subBtn.click === "function") {
      subBtn.click();
      return;
    }
    var card = list.querySelector('[data-guide-card="' + wanted.replace(/"/g, "") + '"]');
    if (!card) return;
    if (!card._guideLoaded) loadCardContent(card);
  }

  function loadIndex(attempt) {
    var tries = Number(attempt) || 0;
    if (!T.getToken()) {
      T.setStatus("vc-staff-guide-status", "Accedi per continuare.", true);
      return;
    }
    var list = T.byId("vc-staff-guide-list");
    if (list) {
      list.innerHTML = '<p class="vc-regole-state">Caricamento guida\u2026</p>';
    }

    /* pmGuideOnly1: index SEMPRE dall'API (lista filtrata per ruolo).
       Il pack statico è solo cache contenuto delle sezioni già consentite —
       prima bypassava i permessi e i PM-only vedevano tutta la guida. */
    T.fetchJson(apiUrl(), {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(45000) : 45000,
      cache: false,
    })
      .then(function (out) {
        var st = Number((out.res && out.res.status) || 0);
        var err = out.data && out.data.error ? String(out.data.error) : "";
        var msg = out.data && out.data.message ? String(out.data.message) : "";
        var ok = Boolean(out.res && out.res.ok && out.data && out.data.ok);
        if (!ok) {
          var retryable =
            st === 502 ||
            st === 503 ||
            st === 408 ||
            st === 0 ||
            err === "timeout" ||
            err === "discord_unreachable" ||
            err === "discord_timeout" ||
            err === "empty_body" ||
            (!msg && st >= 500);
          if (retryable && tries < 2) {
            window.setTimeout(function () {
              loadIndex(tries + 1);
            }, 700 + tries * 900);
            return;
          }
          T.setStatus(
            "vc-staff-guide-status",
            msg ||
              (st === 502 || st === 503
                ? "Discord non raggiungibile. Riprova tra poco."
                : "Impossibile caricare la guida."),
            true,
          );
          if (list) list.innerHTML = "";
          return;
        }
        state.sections = out.data.sections || [];
        state.intro = null;
        var allowed = {};
        (state.sections || []).forEach(function (s) {
          if (s && s.id) allowed[s.id] = true;
        });
        state.cache = seedCacheFromStaticPack(allowed);
        if (!state.sections.length) {
          T.setStatus("vc-staff-guide-status", "Nessuna sezione disponibile.", true);
          if (list) list.innerHTML = "";
          return;
        }
        T.setStatus("vc-staff-guide-status", "", false);
        var initial = resolveInitialTab();
        selectTab(initial, { keepUrl: true });
        openWantedCard();
      })
      .catch(function () {
        if (tries < 2) {
          window.setTimeout(function () {
            loadIndex(tries + 1);
          }, 900 + tries * 900);
          return;
        }
        T.setStatus("vc-staff-guide-status", "Errore di rete.", true);
        if (list) list.innerHTML = "";
      });
  }

  T.bootPage(function () {
    T.registerPtrRefresh(function () {
      loadIndex(0);
    });
    if (T.whenDiscordSessionReady) {
      T.whenDiscordSessionReady(function () {
        loadIndex(0);
      }, T.isCoarseMobile && T.isCoarseMobile() ? 5000 : 2500);
    } else {
      loadIndex(0);
    }
  });
})();
