/**
 * Guida staff — layout stile /faq (tab categorie + accordion).
 */
(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var state = {
    sections: [],
    intro: null,
    activeTab: "",
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

  function fetchSection(id) {
    var key = String(id || "").trim();
    if (!key) return Promise.resolve(null);
    if (state.cache[key]) return Promise.resolve(state.cache[key]);
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

  function renderTabs() {
    var root = T.byId("vc-staff-guide-tabs");
    if (!root) return;
    var tabs = topLevelSections().map(function (s) {
      return { id: s.id, label: s.label };
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

  function renderList() {
    var root = T.byId("vc-staff-guide-list");
    if (!root) return;
    root.innerHTML = "";

    var tabId = state.activeTab;
    var cards = [];

    if (!tabId) {
      root.innerHTML = '<p class="vc-regole-state">Seleziona una sezione della guida.</p>';
      return;
    }

    var meta = findSection(tabId);
    var kids = childrenOf(tabId);
    if (kids.length) {
      kids.forEach(function (child, idx) {
        var card = makeCard({
          id: child.id,
          title: child.label,
          tag: meta ? meta.label : "Sezione",
          html: "",
          open: idx === 0,
        });
        cards.push(card);
        root.appendChild(card);
      });
      bindExclusiveOpen(cards);
      if (cards[0]) loadCardContent(cards[0]);
      return;
    }

    var placeholder = makeCard({
      id: tabId,
      title: meta ? meta.label : tabId,
      tag: meta && meta.description ? meta.description : "Sezione",
      html: "",
      open: true,
    });
    cards.push(placeholder);
    root.appendChild(placeholder);
    bindExclusiveOpen(cards);
    loadCardContent(placeholder);
  }

  function selectTab(tabId, opts) {
    opts = opts || {};
    state.activeTab = String(tabId || "");
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
    var card = list.querySelector('[data-guide-card="' + wanted.replace(/"/g, "") + '"]');
    if (!card) return;
    list.querySelectorAll("details.vc-regole-card").forEach(function (d) {
      d.open = d === card;
    });
    if (!card._guideLoaded) loadCardContent(card);
  }

  function loadIndex() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-guide-status", "Accedi per continuare.", true);
      return;
    }
    var list = T.byId("vc-staff-guide-list");
    if (list) {
      list.innerHTML = '<p class="vc-regole-state">Caricamento guida\u2026</p>';
    }
    T.fetchJson(apiUrl(), {
      timeoutMs: T.resolveFetchTimeoutMs ? T.resolveFetchTimeoutMs(45000) : 45000,
    })
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-guide-status",
            (out.data && out.data.message) || "Impossibile caricare la guida.",
            true,
          );
          if (list) list.innerHTML = "";
          return;
        }
        state.sections = out.data.sections || [];
        state.intro = null;
        state.cache = {};
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
        T.setStatus("vc-staff-guide-status", "Errore di rete.", true);
        if (list) list.innerHTML = "";
      });
  }

  T.bootPage(function () {
    T.registerPtrRefresh(loadIndex);
    loadIndex();
  });
})();
