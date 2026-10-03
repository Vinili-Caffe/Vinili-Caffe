/**
 * Bacheca — browse unificata + detail.
 */
(function () {
  "use strict";

  function boot(attempt) {
    var B = window.VcBoards;
    var root = document.getElementById("vc-boards-root");
    if (!root) return;
    if (!B) {
      if ((attempt || 0) < 50) {
        setTimeout(function () {
          boot((attempt || 0) + 1);
        }, 40);
        return;
      }
      if (!root.getAttribute("data-vc-boards-booted")) {
        root.setAttribute("data-vc-boards-booted", "err");
        root.innerHTML =
          '<div class="vc-boards-empty">Impossibile caricare Bacheca. Ricarica la pagina.</div>';
      }
      return;
    }
    if (root.getAttribute("data-vc-boards-booted") === "1") return;
    root.setAttribute("data-vc-boards-booted", "1");
    start(B, root);
  }

  function start(B, root) {
    var page = String((document.body && document.body.getAttribute("data-vc-boards-page")) || "")
      .trim()
      .toLowerCase();

    function setMsg(el, text, isErr) {
      /* boardsMsgToast1 */
      if (el) {
        el.hidden = true;
        el.textContent = "";
        el.classList.remove("vc-boards-msg--err");
      }
      if (B && typeof B.toastMsg === "function") B.toastMsg(text, isErr);
      else if (window.VcSiteToast) {
        if (!text) window.VcSiteToast.hide();
        else window.VcSiteToast.show(String(text || ""), !!isErr);
      }
    }

    async function loadConfig() {
      try {
        return await B.api("/config");
      } catch (_) {
        return { ok: false, publicOpen: false };
      }
    }

    async function ensurePreviewAccess(cfg) {
      if (cfg && cfg.publicOpen) return { ok: true, staff: false };
      var t = B.token();
      if (!t) return { ok: false, needLogin: true };
      try {
        var res = await fetch("/webhooks/site-staff-access", {
          headers: { Authorization: "Bearer " + t, Accept: "application/json" },
        });
        var data = await res.json().catch(function () {
          return null;
        });
        if (data && data.ok) return { ok: true, staff: true };
      } catch (_) {}
      return { ok: false, staff: false };
    }

    function readKind() {
      try {
        var params = new URLSearchParams(location.search || "");
        var k = String(params.get("kind") || "").trim().toLowerCase();
        if (k === "bot" || k === "bots") return "bot";
        if (k === "server" || k === "servers") return "server";
      } catch (_) {}
      if (page === "bots") return "bot";
      if (page === "servers") return "server";
      return "server";
    }

    function setKindInUrl(kind) {
      try {
        var u = new URL(location.href);
        u.searchParams.set("kind", kind);
        history.replaceState(null, "", u.pathname + "?" + u.searchParams.toString() + u.hash);
      } catch (_) {}
    }

    async function renderBrowse() {
      var cfg = await loadConfig();
      var access = await ensurePreviewAccess(cfg);
      if (!cfg.publicOpen && !access.ok) {
        root.innerHTML =
          '<div class="vc-boards-empty vc-boards-empty--gate" data-i18n="boards.closed">' +
          '<div class="vc-boards-empty__ico" aria-hidden="true"><i class="fa fa-lock"></i></div>' +
          "<p class=\"vc-boards-empty__title\">Bacheca non pubblica</p>" +
          "<p class=\"vc-boards-empty__sub\">Torna presto, oppure accedi con un account staff.</p>" +
          "</div>";
        return;
      }
      var kind = readKind();
      var sortVal = "score";
      var sortOpts = [
        { value: "score", label: "Score", i18n: "boards.sortScore" },
        { value: "votes", label: "Voti", i18n: "boards.sortVotes" },
        { value: "bumps", label: "Bump", i18n: "boards.sortBumps" },
        { value: "new", label: "Nuovi", i18n: "boards.sortNew" },
      ];
      /* boardsToolsIcons1: FA icons (no emoji) + i18n solo sul testo */
      root.innerHTML =
        B.navHtml("browse").replace(
          "</nav>",
          '<div class="vc-boards-seg vc-boards-chrome__kind" role="tablist" aria-label="Tipo">' +
            '<button type="button" class="vc-boards-seg__btn vc-no-sfx' +
            (kind === "server" ? " is-active" : "") +
            '" data-kind="server" id="vc-boards-kind-server">' +
            '<i class="fa fa-server" aria-hidden="true"></i>' +
            '<span data-i18n="boards.kindServer">Server</span></button>' +
            '<button type="button" class="vc-boards-seg__btn vc-no-sfx' +
            (kind === "bot" ? " is-active" : "") +
            '" data-kind="bot" id="vc-boards-kind-bot">' +
            '<i class="fa fa-android" aria-hidden="true"></i>' +
            '<span data-i18n="boards.kindBot">Bot</span></button>' +
            "</div></nav>",
        ) +
        '<div class="vc-boards-tools">' +
        '<div class="vc-boards-search">' +
        '<i class="fa fa-search" aria-hidden="true"></i>' +
        '<input type="search" id="vc-boards-q" data-i18n-placeholder="boards.search" placeholder="Cerca nome, tag, invite…" autocomplete="off" />' +
        "</div>" +
        '<div class="vc-boards-sortmenu" id="vc-boards-sortmenu">' +
        '<button type="button" class="vc-boards-sortmenu__btn vc-no-sfx" id="vc-boards-sort-btn" aria-haspopup="listbox" aria-expanded="false" aria-label="Ordina">' +
        '<span class="vc-boards-sortmenu__label" id="vc-boards-sort-label">Score</span>' +
        '<i class="fa fa-coffee vc-boards-sortmenu__cup" aria-hidden="true"></i>' +
        "</button>" +
        '<ul class="vc-boards-sortmenu__panel" id="vc-boards-sort-panel" role="listbox" hidden>' +
        sortOpts
          .map(function (o) {
            return (
              '<li role="none"><button type="button" class="vc-boards-sortmenu__opt' +
              (o.value === sortVal ? " is-active" : "") +
              '" role="option" data-value="' +
              o.value +
              '" data-i18n="' +
              o.i18n +
              '" aria-selected="' +
              (o.value === sortVal ? "true" : "false") +
              '">' +
              o.label +
              "</button></li>"
            );
          })
          .join("") +
        "</ul>" +
        '<select id="vc-boards-sort" class="vc-boards-sort" hidden aria-hidden="true" tabindex="-1">' +
        sortOpts
          .map(function (o) {
            return (
              '<option value="' +
              o.value +
              '"' +
              (o.value === sortVal ? " selected" : "") +
              ' data-i18n="' +
              o.i18n +
              '">' +
              o.label +
              "</option>"
            );
          })
          .join("") +
        "</select>" +
        "</div>" +
        "</div>" +
        '<div class="vc-boards-shell">' +
        '<div class="vc-boards-shell__head">' +
        '<p class="vc-boards-shell__count" id="vc-boards-count" aria-live="polite"></p>' +
        "</div>" +
        '<div id="vc-boards-msg" class="vc-boards-msg" hidden></div>' +
        '<div id="vc-boards-grid" class="vc-boards-grid"></div>' +
        "</div>";

      var grid = document.getElementById("vc-boards-grid");
      var msg = document.getElementById("vc-boards-msg");
      var countEl = document.getElementById("vc-boards-count");
      var sortMenu = document.getElementById("vc-boards-sortmenu");
      var sortBtn = document.getElementById("vc-boards-sort-btn");
      var sortPanel = document.getElementById("vc-boards-sort-panel");
      var sortLabel = document.getElementById("vc-boards-sort-label");
      var sortSelect = document.getElementById("vc-boards-sort");

      function syncKindButtons() {
        var s = document.getElementById("vc-boards-kind-server");
        var b = document.getElementById("vc-boards-kind-bot");
        if (s) s.classList.toggle("is-active", kind === "server");
        if (b) b.classList.toggle("is-active", kind === "bot");
      }

      function sortLabelFor(value) {
        for (var i = 0; i < sortOpts.length; i++) {
          if (sortOpts[i].value === value) return sortOpts[i].label;
        }
        return "Score";
      }

      function setSortOpen(open) {
        if (!sortMenu || !sortBtn || !sortPanel) return;
        sortMenu.classList.toggle("is-open", !!open);
        sortBtn.setAttribute("aria-expanded", open ? "true" : "false");
        sortPanel.hidden = !open;
      }

      function syncSortUi() {
        if (sortSelect) sortSelect.value = sortVal;
        if (sortLabel) sortLabel.textContent = sortLabelFor(sortVal);
        if (sortPanel) {
          var opts = sortPanel.querySelectorAll(".vc-boards-sortmenu__opt");
          for (var i = 0; i < opts.length; i++) {
            var on = opts[i].getAttribute("data-value") === sortVal;
            opts[i].classList.toggle("is-active", on);
            opts[i].setAttribute("aria-selected", on ? "true" : "false");
          }
        }
      }

      async function load() {
        var q = (document.getElementById("vc-boards-q") || {}).value || "";
        setMsg(msg, "Caricamento…");
        var qs =
          "?kind=" +
          encodeURIComponent(kind) +
          "&sort=" +
          encodeURIComponent(sortVal) +
          "&q=" +
          encodeURIComponent(q) +
          (access.staff && !cfg.publicOpen ? "&allowClosed=1" : "");
        var out = await B.api("/listings" + qs);
        if (!out.ok) {
          setMsg(msg, out.message || "Errore caricamento.", true);
          grid.innerHTML = "";
          try {
            if (B.markContentReady) B.markContentReady();
          } catch (eReady0) {}
          return;
        }
        setMsg(msg, "");
        var list = out.listings || [];
        countEl.textContent = list.length ? list.length + (list.length === 1 ? " scheda" : " schede") : "";
        if (!list.length) {
          grid.innerHTML =
            '<div class="vc-boards-empty">' +
            '<div class="vc-boards-empty__ico" aria-hidden="true"><i class="fa fa-th-large"></i></div>' +
            '<p class="vc-boards-empty__title">Nessuna scheda</p>' +
            '<p class="vc-boards-empty__sub">Prova un’altra ricerca oppure pubblica la tua.</p>' +
            '<a class="vc-boards-btn vc-boards-btn--primary" href="/bacheca/invia/">Pubblica scheda</a>' +
            "</div>";
          try {
            if (B.markContentReady) B.markContentReady();
          } catch (eReady1) {}
          return;
        }
        grid.innerHTML = list.map(B.cardHtml).join("");
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReady) {}
      }

      document.getElementById("vc-boards-kind-server").addEventListener("click", function () {
        kind = "server";
        setKindInUrl(kind);
        syncKindButtons();
        load();
      });
      document.getElementById("vc-boards-kind-bot").addEventListener("click", function () {
        kind = "bot";
        setKindInUrl(kind);
        syncKindButtons();
        load();
      });
      document.getElementById("vc-boards-q").addEventListener("keydown", function (e) {
        if (e.key === "Enter") load();
      });
      if (sortBtn) {
        sortBtn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          setSortOpen(sortPanel && sortPanel.hidden);
        });
      }
      if (sortPanel) {
        sortPanel.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest(".vc-boards-sortmenu__opt") : null;
          if (!btn) return;
          sortVal = String(btn.getAttribute("data-value") || "score");
          syncSortUi();
          setSortOpen(false);
          load();
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (!sortMenu || !sortMenu.classList.contains("is-open")) return;
          if (sortMenu.contains(e.target)) return;
          setSortOpen(false);
        },
        true,
      );
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") setSortOpen(false);
      });
      syncSortUi();
      setKindInUrl(kind);
      await load();
      try {
        if (typeof window.__vcI18nApply === "function") window.__vcI18nApply(root);
        if (sortLabel && sortSelect && sortSelect.selectedOptions && sortSelect.selectedOptions[0]) {
          sortLabel.textContent = sortSelect.selectedOptions[0].textContent || sortLabelFor(sortVal);
        }
      } catch (_) {}
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eReady2) {}
    }

    async function renderDetail() {
      var params = new URLSearchParams(location.search || "");
      var slug = String(params.get("slug") || "").trim();
      if (!slug) {
        var m = String(location.pathname || "").match(
          /^\/(?:bacheca|boards)\/(?!server|servers|bot|bots|invia|submit|le-mie|manage|mod|scheda|view)([^/]+)\/?$/i,
        );
        if (m) slug = m[1];
      }
      if (!slug) {
        root.innerHTML = '<div class="vc-boards-empty">Scheda non specificata.</div>';
        return;
      }
      var cfg = await loadConfig();
      var access = await ensurePreviewAccess(cfg);
      if (!cfg.publicOpen && !access.ok) {
        root.innerHTML =
          '<div class="vc-boards-empty vc-boards-empty--gate">' +
          '<div class="vc-boards-empty__ico" aria-hidden="true"><i class="fa fa-lock"></i></div>' +
          '<p class="vc-boards-empty__title">Accesso richiesto</p>' +
          '<p class="vc-boards-empty__sub">Accedi con Discord per continuare.</p>' +
          "</div>";
        return;
      }
      var qs = access.staff && !cfg.publicOpen ? "?allowClosed=1" : "";
      var out = await B.api("/listings/" + encodeURIComponent(slug) + qs);
      if (!out.ok || !out.listing) {
        root.innerHTML =
          '<div class="vc-boards-empty">' +
          '<p class="vc-boards-empty__title">' +
          B.esc(out.message || "Scheda non trovata.") +
          "</p></div>";
        return;
      }
      var L = out.listing;
      var invite = L.kind === "bot" ? L.botInviteUrl || L.inviteUrl : L.inviteUrl;
      var bannerStyle = L.bannerUrl
        ? ' style="background-image:url(' + B.esc(L.bannerUrl) + ')"'
        : L.accent
          ? ' style="background:linear-gradient(120deg,' + B.esc(L.accent) + '66,#1a1410)"'
          : "";
      var icon = L.iconUrl
        ? '<img class="vc-boards-detail__icon" src="' + B.esc(L.iconUrl) + '" alt="" width="84" height="84" />'
        : "";
      var tags = (L.tags || [])
        .map(function (t) {
          return '<span class="vc-boards-tag">' + B.esc(t) + "</span>";
        })
        .join("");
      var cats = (L.categories || [])
        .map(function (t) {
          return '<span class="vc-boards-tag vc-boards-tag--cat">' + B.esc(t) + "</span>";
        })
        .join("");
      var locs = (L.locales || [])
        .map(function (t) {
          return '<span class="vc-boards-tag">' + B.esc(String(t).toUpperCase()) + "</span>";
        })
        .join("");
      var socialLinks = "";
      if (L.socials && typeof L.socials === "object") {
        socialLinks = Object.keys(L.socials)
          .map(function (k) {
            return (
              '<a class="vc-boards-btn vc-boards-btn--ghost" href="' +
              B.esc(L.socials[k]) +
              '" target="_blank" rel="noopener noreferrer">' +
              B.esc(k) +
              "</a>"
            );
          })
          .join("");
      }
      if (L.siteUrl) {
        socialLinks +=
          '<a class="vc-boards-btn vc-boards-btn--ghost" href="' +
          B.esc(L.siteUrl) +
          '" target="_blank" rel="noopener noreferrer">Sito</a>';
      }
      var descHtml = B.formatDescHtml(L.description || L.markdown || "");
      root.innerHTML =
        B.navHtml("browse") +
        '<div class="vc-boards-detail">' +
        '<article class="vc-boards-detail__main">' +
        '<div class="vc-boards-detail__banner"' +
        bannerStyle +
        "></div>" +
        '<div class="vc-boards-detail__body">' +
        '<div class="vc-boards-detail__head">' +
        icon +
        '<div class="vc-boards-detail__text"><span class="vc-boards-card__kind">' +
        B.esc(B.kindLabel(L.kind)) +
        "</span>" +
        '<h1 class="mt-1 text-3xl font-extrabold text-white">' +
        B.esc(L.name) +
        "</h1>" +
        (L.tagline ? '<p class="mt-2 text-slate-200/85">' + B.esc(L.tagline) + "</p>" : "") +
        "</div></div>" +
        (cats || tags || locs
          ? '<div class="vc-boards-detail__tags mt-4">' + cats + locs + tags + "</div>"
          : "") +
        (descHtml
          ? '<div class="vc-boards-detail__desc mt-5 text-slate-100/90 leading-7">' + descHtml + "</div>"
          : '<p class="mt-5 text-slate-400">Nessuna descrizione.</p>') +
        (socialLinks ? '<div class="vc-boards-detail__actions mt-4">' + socialLinks + "</div>" : "") +
        "</div></article>" +
        '<aside class="vc-boards-detail__side">' +
        '<div class="vc-boards-stat"><span>Voti (30g)</span><strong>' +
        B.esc(B.fmtNum(L.votes30d || 0)) +
        "</strong></div>" +
        '<div class="vc-boards-stat"><span>Bump (7g)</span><strong>' +
        B.esc(B.fmtNum(L.bumps7d || 0)) +
        "</strong></div>" +
        '<div class="vc-boards-stat"><span>Punteggio</span><strong>' +
        B.esc(B.fmtNum(L.score || 0)) +
        "</strong></div>" +
        (L.stats && L.stats.members != null
          ? '<div class="vc-boards-stat"><span>Membri</span><strong>~' +
            B.esc(B.fmtNum(L.stats.members)) +
            "</strong></div>"
          : "") +
        '<div class="vc-boards-detail__actions">' +
        (invite
          ? '<a class="vc-boards-btn vc-boards-btn--primary" href="' +
            B.esc(invite) +
            '" target="_blank" rel="noopener noreferrer"><i class="fa fa-sign-in" aria-hidden="true"></i> Invita</a>'
          : "") +
        '<button type="button" class="vc-boards-btn" id="vc-boards-vote"><i class="fa fa-thumbs-up" aria-hidden="true"></i> Vota</button>' +
        '<button type="button" class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-bump"><i class="fa fa-arrow-up" aria-hidden="true"></i> Bump</button>' +
        '<button type="button" class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-report">Segnala</button>' +
        "</div>" +
        '<div id="vc-boards-msg" class="vc-boards-msg" hidden></div>' +
        "</aside></div>";

      var msg = document.getElementById("vc-boards-msg");
      document.getElementById("vc-boards-vote").addEventListener("click", async function () {
        if (!B.token()) {
          setMsg(msg, "Accedi con Discord per votare.", true);
          return;
        }
        var r = await B.api("/listings/" + encodeURIComponent(L.id) + "/vote", { method: "POST", json: {} });
        setMsg(msg, r.message || (r.ok ? "Voto registrato." : "Errore voto."), !r.ok);
      });
      document.getElementById("vc-boards-bump").addEventListener("click", async function () {
        if (!B.token()) {
          setMsg(msg, "Accedi con Discord per il bump.", true);
          return;
        }
        var r = await B.api("/listings/" + encodeURIComponent(L.id) + "/bump", { method: "POST", json: {} });
        setMsg(msg, r.message || (r.ok ? "Bump ok." : "Errore bump."), !r.ok);
      });
      document.getElementById("vc-boards-report").addEventListener("click", async function () {
        if (!B.token()) {
          setMsg(msg, "Accedi con Discord per segnalare.", true);
          return;
        }
        var reason = window.prompt("Motivo della segnalazione?");
        if (!reason) return;
        var r = await B.api("/listings/" + encodeURIComponent(L.id) + "/report", {
          method: "POST",
          json: { reason: reason },
        });
        setMsg(msg, r.message || (r.ok ? "Segnalazione inviata." : "Errore."), !r.ok);
      });
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eReady3) {}
    }

    if (page === "hub" || page === "browse" || page === "servers" || page === "bots") renderBrowse();
    else if (page === "view") renderDetail();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      boot(0);
    });
  } else {
    boot(0);
  }
})();
