(function () {
  var VER = "20260909confessionale6";
  var MAX = 1500;
  /* Intro a ogni visita (niente skip session). Solo ?skipIntro=1 salta. */
  var CURTAIN_OPEN_MS = 3500;
  var SMOKE_AUTO_MS = 0;
  var apiCfg = window.__VC_CONFESSIONALE || {};
  var canModerate = false;
  var loadedOnce = false;
  var curtainDone = false;
  var smokeTimer = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function token() {
    try {
      return String(localStorage.getItem("vc_discord_access_token") || "").trim();
    } catch (e) {
      return "";
    }
  }

  function apiUrl() {
    var base = String(apiCfg.apiUrl || "/webhooks/site-confessionale").trim();
    if (!base || /\{\{/.test(base)) base = "/webhooks/site-confessionale";
    try {
      if (location.hostname === "127.0.0.1" || location.hostname === "localhost") {
        var loc = String(apiCfg.apiUrlLocal || "").trim();
        if (loc && !/\{\{/.test(loc)) return loc;
      }
    } catch (eL) {}
    return base;
  }

  function toast(msg, kind) {
    try {
      if (typeof window.vcSiteToast === "function") {
        window.vcSiteToast(msg, kind || "info");
        return;
      }
    } catch (e) {}
  }

  function setFeedback(el, text, isError) {
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("is-error", Boolean(isError));
  }

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatWhen(iso) {
    try {
      var d = new Date(iso);
      if (!Number.isFinite(d.getTime())) return "";
      return d.toLocaleString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return "";
    }
  }

  function fetchJson(method, path, body) {
    var t = token();
    var opts = {
      method: method || "GET",
      headers: {
        Authorization: "Bearer " + t,
        Accept: "application/json",
      },
      mode: "cors",
      credentials: "omit",
    };
    if (body != null) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    return fetch(path, opts).then(function (res) {
      return res
        .json()
        .catch(function () {
          return {};
        })
        .then(function (data) {
          return { res: res, data: data || {} };
        });
    });
  }

  function switchTab(name) {
    var writeTab = byId("vc-conf-tab-write");
    var readTab = byId("vc-conf-tab-read");
    var writePanel = byId("vc-conf-panel-write");
    var readPanel = byId("vc-conf-panel-read");
    var isRead = name === "read";
    if (writeTab) writeTab.classList.toggle("is-active", !isRead);
    if (readTab) readTab.classList.toggle("is-active", isRead);
    if (writeTab) writeTab.setAttribute("aria-selected", String(!isRead));
    if (readTab) readTab.setAttribute("aria-selected", String(isRead));
    if (writePanel) writePanel.hidden = isRead;
    if (readPanel) readPanel.hidden = !isRead;
    if (isRead) loadList(false);
  }

  function renderList(items) {
    var root = byId("vc-conf-list");
    if (!root) return;
    var list = Array.isArray(items) ? items : [];
    if (!list.length) {
      root.innerHTML = '<p class="vc-confessionale-empty">Nessun messaggio per ora. Sii il primo a scrivere nel confessionale.</p>';
      return;
    }
    var html = "";
    for (var i = 0; i < list.length; i += 1) {
      var it = list[i] || {};
      var id = String(it.id || "");
      var when = formatWhen(it.createdAt);
      html +=
        '<article class="vc-confessionale-item" data-id="' +
        escapeHtml(id) +
        '">' +
        '<div class="vc-confessionale-item__head">' +
        '<span class="vc-confessionale-item__when">' +
        escapeHtml(when || "Anonimo") +
        "</span>" +
        (canModerate
          ? '<button type="button" class="vc-confessionale-item__del" data-conf-del="' +
            escapeHtml(id) +
            '">Archivia</button>'
          : "") +
        "</div>" +
        '<p class="vc-confessionale-item__body">' +
        escapeHtml(it.content || "") +
        "</p>" +
        "</article>";
    }
    root.innerHTML = html;
  }

  function loadList(force) {
    if (loadedOnce && !force) return;
    var root = byId("vc-conf-list");
    if (root) root.innerHTML = '<p class="vc-confessionale-empty">Caricamento…</p>';
    fetchJson("GET", apiUrl())
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          if (root) {
            root.innerHTML =
              '<p class="vc-confessionale-empty">' +
              escapeHtml(out.data.message || "Impossibile caricare i messaggi.") +
              "</p>";
          }
          return;
        }
        canModerate = Boolean(out.data.canModerate);
        loadedOnce = true;
        renderList(out.data.items);
      })
      .catch(function () {
        if (root) root.innerHTML = '<p class="vc-confessionale-empty">Errore di rete.</p>';
      });
  }

  function submitMessage(e) {
    if (e && e.preventDefault) e.preventDefault();
    var ta = byId("vc-conf-text");
    var fb = byId("vc-conf-feedback");
    var btn = byId("vc-conf-submit");
    var content = ta ? String(ta.value || "").trim() : "";
    if (content.length < 8) {
      setFeedback(fb, "Scrivi almeno 8 caratteri.", true);
      return;
    }
    if (btn) btn.disabled = true;
    setFeedback(fb, "Invio in corso…", false);
    fetchJson("POST", apiUrl(), { content: content })
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          setFeedback(fb, out.data.message || "Invio non riuscito.", true);
          toast(out.data.message || "Invio non riuscito", "error");
          return;
        }
        if (ta) ta.value = "";
        syncCounter();
        setFeedback(fb, "Inviato in anonimo. Nessuno sa chi sei.", false);
        toast("Messaggio anonimo inviato", "success");
        loadedOnce = false;
      })
      .catch(function () {
        setFeedback(fb, "Errore di rete.", true);
      })
      .finally(function () {
        if (btn) btn.disabled = false;
      });
  }

  function deleteItem(id) {
    if (!id || !canModerate) return;
    var path = apiUrl().replace(/\/+$/, "") + "/" + encodeURIComponent(id) + "/delete";
    fetchJson("POST", path, {})
      .then(function (out) {
        if (!out.res.ok || !out.data.ok) {
          toast(out.data.message || "Archiviazione non riuscita", "error");
          return;
        }
        toast("Messaggio archiviato", "success");
        loadedOnce = false;
        loadList(true);
      })
      .catch(function () {
        toast("Errore di rete", "error");
      });
  }

  function syncCounter() {
    var ta = byId("vc-conf-text");
    var c = byId("vc-conf-count");
    if (!c) return;
    var n = ta ? String(ta.value || "").length : 0;
    c.textContent = String(Math.min(n, MAX));
  }

  function hideCurtainEl() {
    var el = byId("vc-confessionale-curtain");
    if (!el) return;
    el.classList.add("is-done");
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
  }

  function hideSmokeEl() {
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) return;
    smoke.classList.remove("is-visible");
    smoke.classList.add("is-done");
    smoke.hidden = true;
    smoke.setAttribute("aria-hidden", "true");
  }

  function clearSmokeTimer() {
    if (smokeTimer) {
      window.clearTimeout(smokeTimer);
      smokeTimer = null;
    }
  }

  function markSequenceDone() {
    if (curtainDone) return;
    curtainDone = true;
    clearSmokeTimer();
    hideCurtainEl();
    hideSmokeEl();
    try {
      document.documentElement.classList.remove("vc-confessionale-intro-active");
      document.documentElement.classList.add("vc-confessionale-curtain-done");
      document.body.classList.add("vc-confessionale-curtain-done");
    } catch (e2) {}
    try {
      window.dispatchEvent(new CustomEvent("vc:confessionale-curtain-done"));
    } catch (e3) {}
  }

  function introAlreadyDone() {
    try {
      var sp = new URLSearchParams(location.search || "");
      if (sp.get("skipIntro") === "1" || sp.get("skip") === "1") return true;
    } catch (eQ) {}
    return false;
  }

  function primeIntroOverlay() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return false;
    }
    try {
      document.documentElement.classList.add("vc-confessionale-intro-active");
      document.documentElement.classList.remove("vc-confessionale-curtain-done");
    } catch (ePrime) {}
    var el = byId("vc-confessionale-curtain");
    if (el) {
      el.hidden = false;
      el.removeAttribute("hidden");
      el.setAttribute("aria-hidden", "false");
      el.classList.remove("is-done", "is-open");
    }
    return true;
  }

  function showSmokeBeat() {
    hideCurtainEl();
    var smoke = byId("vc-confessionale-smoke");
    if (!smoke) {
      markSequenceDone();
      return;
    }
    smoke.hidden = false;
    smoke.removeAttribute("hidden");
    smoke.setAttribute("aria-hidden", "false");
    smoke.classList.remove("is-done");
    void smoke.offsetWidth;
    requestAnimationFrame(function () {
      smoke.classList.add("is-visible");
    });
    clearSmokeTimer();
    if (SMOKE_AUTO_MS > 0) {
      smokeTimer = window.setTimeout(markSequenceDone, SMOKE_AUTO_MS);
    }
  }

  function openCurtain() {
    if (curtainDone || introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    if (!primeIntroOverlay()) return;
    var el = byId("vc-confessionale-curtain");
    if (!el) {
      markSequenceDone();
      return;
    }

    void el.offsetWidth;
    requestAnimationFrame(function () {
      el.classList.add("is-open");
    });
    window.setTimeout(function () {
      if (curtainDone) return;
      showSmokeBeat();
    }, CURTAIN_OPEN_MS);
  }

  function bootCurtainWhenReady() {
    if (introAlreadyDone()) {
      markSequenceDone();
      return;
    }
    primeIntroOverlay();
    openCurtain();
  }

  function bind() {
    var writeTab = byId("vc-conf-tab-write");
    var readTab = byId("vc-conf-tab-read");
    var form = byId("vc-conf-form");
    var ta = byId("vc-conf-text");
    var list = byId("vc-conf-list");
    var skip = byId("vc-confessionale-curtain-skip");
    var smokeContinue = byId("vc-confessionale-smoke-continue");
    var smokeRoot = byId("vc-confessionale-smoke");

    if (writeTab) writeTab.addEventListener("click", function () { switchTab("write"); });
    if (readTab) readTab.addEventListener("click", function () { switchTab("read"); });
    if (form) form.addEventListener("submit", submitMessage);
    if (ta) {
      ta.addEventListener("input", syncCounter);
      syncCounter();
    }
    if (list) {
      list.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest("[data-conf-del]") : null;
        if (!btn) return;
        deleteItem(String(btn.getAttribute("data-conf-del") || ""));
      });
    }
    if (skip) {
      skip.addEventListener("click", function () {
        var el = byId("vc-confessionale-curtain");
        if (el) el.classList.add("is-open");
        showSmokeBeat();
      });
    }
    function onSmokeContinue(ev) {
      if (ev) {
        try {
          ev.preventDefault();
          ev.stopPropagation();
        } catch (e0) {}
      }
      markSequenceDone();
    }
    if (smokeContinue) smokeContinue.addEventListener("click", onSmokeContinue);
    if (smokeRoot) smokeRoot.addEventListener("click", onSmokeContinue);

    bootCurtainWhenReady();
  }

  if (!introAlreadyDone()) {
    primeIntroOverlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bind);
  } else {
    bind();
  }

  window.__vcConfessionaleVer = VER;
})();
