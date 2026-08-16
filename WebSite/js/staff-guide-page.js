(function () {
  var T = window.VCStaffTools;
  if (!T) return;

  var state = {
    sections: [],
    intro: null,
    activeId: "",
    loadingSection: false,
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

  function renderShell() {
    var root = T.byId("vc-staff-guide");
    if (!root) return;

    var navHtml = '<nav class="vc-staff-guide-nav" aria-label="Sezioni guida">';
    navHtml +=
      '<button type="button" class="vc-staff-guide-nav__item' +
      (!state.activeId ? " is-active" : "") +
      '" data-guide-section="">Introduzione</button>';

    topLevelSections().forEach(function (sec) {
      var kids = childrenOf(sec.id);
      navHtml +=
        '<button type="button" class="vc-staff-guide-nav__item' +
        (state.activeId === sec.id ? " is-active" : "") +
        '" data-guide-section="' +
        T.esc(sec.id) +
        '">' +
        T.esc(sec.label) +
        "</button>";
      if (kids.length) {
        navHtml += '<div class="vc-staff-guide-nav__children">';
        kids.forEach(function (child) {
          navHtml +=
            '<button type="button" class="vc-staff-guide-nav__item vc-staff-guide-nav__item--child' +
            (state.activeId === child.id ? " is-active" : "") +
            '" data-guide-section="' +
            T.esc(child.id) +
            '">' +
            T.esc(child.label) +
            "</button>";
        });
        navHtml += "</div>";
      }
    });
    navHtml += "</nav>";

    root.innerHTML =
      '<div class="vc-staff-guide-layout">' +
      navHtml +
      '<div class="vc-staff-guide-panel">' +
      '<div id="vc-staff-guide-body" class="vc-staff-guide-body" aria-live="polite"></div>' +
      "</div></div>";
    root.hidden = false;

    root.querySelectorAll("[data-guide-section]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.getAttribute("data-guide-section") || "";
        selectSection(id);
      });
    });
  }

  function setNavActive() {
    var root = T.byId("vc-staff-guide");
    if (!root) return;
    root.querySelectorAll("[data-guide-section]").forEach(function (btn) {
      var id = btn.getAttribute("data-guide-section") || "";
      btn.classList.toggle("is-active", id === state.activeId);
    });
  }

  function renderIntro() {
    var body = T.byId("vc-staff-guide-body");
    if (!body) return;
    var intro = state.intro || {};
    body.innerHTML =
      '<header class="vc-staff-guide-header">' +
      '<h2 class="vc-staff-guide-header__title">' +
      T.esc(intro.title || "Guida staff") +
      "</h2>" +
      '<p class="vc-staff-guide-header__lead">Sezioni disponibili in base ai tuoi ruoli Discord.</p>' +
      "</header>" +
      '<div class="vc-staff-guide-prose">' +
      (intro.html || "") +
      "</div>";
  }

  function renderSection(section) {
    var body = T.byId("vc-staff-guide-body");
    if (!body || !section) return;
    var childLinks = "";
    if (section.children && section.children.length) {
      childLinks = '<div class="vc-staff-guide-child-links">';
      section.children.forEach(function (c) {
        childLinks +=
          '<button type="button" class="vc-staff-guide-child-link" data-guide-jump="' +
          T.esc(c.id) +
          '">' +
          T.esc(c.label) +
          "</button>";
      });
      childLinks += "</div>";
    }
    var parentCrumb = "";
    if (section.parent) {
      var parent = findSection(section.parent);
      if (parent) {
        parentCrumb =
          '<p class="vc-staff-guide-header__crumb"><button type="button" class="vc-staff-guide-crumb-btn" data-guide-jump="' +
          T.esc(parent.id) +
          '">' +
          T.esc(parent.label) +
          "</button> · " +
          T.esc(section.label) +
          "</p>";
      }
    }
    body.innerHTML =
      '<header class="vc-staff-guide-header">' +
      parentCrumb +
      '<h2 class="vc-staff-guide-header__title">' +
      T.esc(section.label) +
      "</h2>" +
      (section.description
        ? '<p class="vc-staff-guide-header__lead">' + T.esc(section.description) + "</p>"
        : "") +
      childLinks +
      "</header>" +
      '<div class="vc-staff-guide-prose">' +
      (section.html || "") +
      "</div>";

    body.querySelectorAll("[data-guide-jump]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        selectSection(btn.getAttribute("data-guide-jump") || "");
      });
    });
  }

  function selectSection(sectionId) {
    var id = String(sectionId || "").trim();
    state.activeId = id;
    setNavActive();

    if (!id) {
      renderIntro();
      T.setStatus("vc-staff-guide-status", "", false);
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (e) {}
      return;
    }

    if (state.loadingSection) return;
    state.loadingSection = true;
    T.setStatus("vc-staff-guide-status", "Caricamento sezione…", false);
    T.fetchJson(apiUrl(id))
      .then(function (out) {
        state.loadingSection = false;
        if (!out.res.ok || !out.data || !out.data.ok || !out.data.section) {
          T.setStatus(
            "vc-staff-guide-status",
            (out.data && out.data.message) || "Sezione non disponibile.",
            true,
          );
          return;
        }
        T.setStatus("vc-staff-guide-status", "", false);
        renderSection(out.data.section);
        try {
          history.replaceState(null, "", "?section=" + encodeURIComponent(id));
        } catch (e2) {}
      })
      .catch(function () {
        state.loadingSection = false;
        T.setStatus("vc-staff-guide-status", "Errore di rete.", true);
      });
  }

  function loadIndex() {
    if (!T.getToken()) {
      T.setStatus("vc-staff-guide-status", "Sessione Discord assente.", true);
      return;
    }
    T.setStatus("vc-staff-guide-status", "Caricamento guida…", false);
    T.fetchJson(apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data || !out.data.ok) {
          T.setStatus(
            "vc-staff-guide-status",
            (out.data && out.data.message) || "Impossibile caricare la guida.",
            true,
          );
          return;
        }
        state.sections = out.data.sections || [];
        state.intro = out.data.intro || null;
        if (!state.sections.length) {
          T.setStatus("vc-staff-guide-status", "Nessuna sezione disponibile per i tuoi ruoli.", true);
          return;
        }
        renderShell();
        T.setStatus("vc-staff-guide-status", "", false);

        var wanted = "";
        try {
          wanted = String(new URL(location.href).searchParams.get("section") || "").trim();
        } catch (e) {}
        if (wanted && findSection(wanted)) {
          selectSection(wanted);
        } else {
          selectSection("");
        }
      })
      .catch(function () {
        T.setStatus("vc-staff-guide-status", "Errore di rete.", true);
      });
  }

  var pageInited = false;
  function initAfterAccess() {
    if (pageInited) return;
    pageInited = true;
    loadIndex();
  }
  function boot() {
    if (document.documentElement.classList.contains("vc-staff-app-revealed")) {
      initAfterAccess();
      return;
    }
    window.addEventListener("vc:staff-access-ok", function once() {
      window.removeEventListener("vc:staff-access-ok", once);
      initAfterAccess();
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
