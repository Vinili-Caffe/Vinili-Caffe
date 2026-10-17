/**
 * ticketPushGate1: tutorial + attivazione push obbligatoria prima di aprire un ticket.
 * Uso: VcTicketsPushGate.ensureReady() → Promise<boolean>
 */
(function () {
  var VER = "20261011ticketPushGate1";
  if (window.VcTicketsPushGate && window.VcTicketsPushGate.ver === VER) return;

  function langEn() {
    try {
      return String(document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function waitPushApi(ms) {
    return new Promise(function (resolve) {
      if (window.VcWebPush && typeof window.VcWebPush.isReady === "function") {
        resolve(window.VcWebPush);
        return;
      }
      var t0 = Date.now();
      var iv = window.setInterval(function () {
        if (window.VcWebPush && typeof window.VcWebPush.isReady === "function") {
          window.clearInterval(iv);
          resolve(window.VcWebPush);
          return;
        }
        if (Date.now() - t0 > (ms || 4000)) {
          window.clearInterval(iv);
          resolve(null);
        }
      }, 40);
    });
  }

  function armScroll() {
    try {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (typeof window.__vcArmModalScrollLock === "function") {
        window.__vcArmModalScrollLock({ bodyClass: "vc-role-modal-open", y: y, holdMs: 280 });
      } else {
        document.body.classList.add("vc-role-modal-open");
      }
      document.body.dataset.vcTicketPushScrollY = String(y);
    } catch (e) {}
  }

  function releaseScroll() {
    try {
      var y = Number(document.body.dataset.vcTicketPushScrollY || "0") || 0;
      if (typeof window.__vcReleaseModalScrollLock === "function") {
        window.__vcReleaseModalScrollLock({ bodyClass: "vc-role-modal-open", y: y });
      } else {
        document.body.classList.remove("vc-role-modal-open");
      }
      delete document.body.dataset.vcTicketPushScrollY;
    } catch (e) {}
  }

  function stepsHtml(st) {
    var en = langEn();
    var ios = st && st.iosNeedsHomeScreen;
    var denied = st && st.permission === "denied";
    var unsupported = st && st.supported === false;
    if (unsupported) {
      return en
        ? "<ol class=\"vc-ticket-push-steps\">" +
            "<li>Web push needs Chrome, Edge or Safari (installed app).</li>" +
            "<li>Open this site in a supported browser, then come back to tickets.</li>" +
            "</ol>"
        : "<ol class=\"vc-ticket-push-steps\">" +
            "<li>Le notifiche push richiedono Chrome, Edge o Safari (app installata).</li>" +
            "<li>Apri il sito in un browser supportato e riprova ad aprire il ticket.</li>" +
            "</ol>";
    }
    if (ios) {
      return en
        ? "<ol class=\"vc-ticket-push-steps\">" +
            "<li>On iPhone/iPad, open the Share menu.</li>" +
            "<li>Tap <strong>Add to Home Screen</strong> and open Vinili from the icon.</li>" +
            "<li>Come back here and tap <strong>Enable</strong>.</li>" +
            "</ol>"
        : "<ol class=\"vc-ticket-push-steps\">" +
            "<li>Su iPhone/iPad apri il menu Condividi di Safari.</li>" +
            "<li>Tocca <strong>Aggiungi a Home</strong> e apri Vinili dall’icona.</li>" +
            "<li>Torna qui e premi <strong>Attiva</strong>.</li>" +
            "</ol>";
    }
    if (denied) {
      return en
        ? "<ol class=\"vc-ticket-push-steps\">" +
            "<li>Notifications were blocked for this site.</li>" +
            "<li>Open the lock/info icon in the address bar → Site settings → Notifications → Allow.</li>" +
            "<li>Reload the page, then tap <strong>Enable</strong>.</li>" +
            "</ol>"
        : "<ol class=\"vc-ticket-push-steps\">" +
            "<li>Le notifiche sono bloccate per questo sito.</li>" +
            "<li>Icona lucchetto nella barra → Impostazioni sito → Notifiche → Consenti.</li>" +
            "<li>Ricarica la pagina e premi <strong>Attiva</strong>.</li>" +
            "</ol>";
    }
    return en
      ? "<ol class=\"vc-ticket-push-steps\">" +
          "<li>Staff replies arrive as device notifications — without them, tickets get ignored.</li>" +
          "<li>Tap <strong>Enable</strong> and choose <strong>Allow</strong> in the browser prompt.</li>" +
          "<li>Keep notifications on while your ticket is open.</li>" +
          "</ol>"
      : "<ol class=\"vc-ticket-push-steps\">" +
          "<li>Le risposte dello staff arrivano come notifica sul dispositivo — senza, i ticket restano ignorati.</li>" +
          "<li>Premi <strong>Attiva</strong> e scegli <strong>Consenti</strong> nel prompt del browser.</li>" +
          "<li>Lascia le notifiche attive finché il ticket è aperto.</li>" +
          "</ol>";
  }

  function ensureDom() {
    var existing = document.getElementById("vc-ticket-push-gate");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "vc-ticket-push-gate";
    wrap.className = "vc-role-request-modal vc-ticket-push-gate";
    wrap.hidden = true;
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="vc-role-modal-backdrop" data-vc-ticket-push-cancel="1"></div>' +
      '<section class="vc-role-request-sheet" role="dialog" aria-modal="true" aria-labelledby="vc-ticket-push-title">' +
      '<div class="vc-role-request-head">' +
      '<div class="vc-role-request-brand">' +
      '<div class="vc-role-request-icon" aria-hidden="true"><i class="fa fa-bell"></i></div>' +
      '<div class="vc-role-request-headcopy">' +
      '<h2 class="vc-role-request-title" id="vc-ticket-push-title"></h2>' +
      '<p class="vc-role-request-sub" id="vc-ticket-push-sub"></p>' +
      "</div></div>" +
      '<button type="button" class="vc-role-request-close" data-vc-ticket-push-cancel="1" aria-label="' +
      (langEn() ? "Cancel" : "Annulla") +
      '"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-role-request-body">' +
      '<div class="vc-role-request-auth">' +
      '<div class="vc-role-request-auth-icon" aria-hidden="true"><i class="fa fa-bell"></i></div>' +
      '<p class="vc-role-request-auth-title" id="vc-ticket-push-auth-title"></p>' +
      '<div class="vc-role-request-auth-sub" id="vc-ticket-push-body"></div>' +
      '<p class="vc-ticket-push-hint" id="vc-ticket-push-hint" hidden></p>' +
      '<div class="vc-ticket-push-actions">' +
      '<button type="button" class="vc-role-request-login" id="vc-ticket-push-enable">' +
      '<i class="fa fa-bell" aria-hidden="true"></i> <span id="vc-ticket-push-enable-label"></span>' +
      "</button>" +
      '<button type="button" class="vc-ticket-push-cancel" data-vc-ticket-push-cancel="1" id="vc-ticket-push-cancel-btn"></button>' +
      "</div></div></div></section>" +
      "<style id=\"vc-ticket-push-gate-css\">" +
      ".vc-ticket-push-steps{margin:0;padding-left:1.2em;text-align:left;line-height:1.45}" +
      ".vc-ticket-push-steps li{margin:.35em 0}" +
      ".vc-ticket-push-actions{display:flex;flex-direction:column;gap:.55rem;margin-top:1rem;width:100%}" +
      ".vc-ticket-push-cancel{appearance:none;border:0;background:transparent;color:rgba(255,255,255,.72);" +
      "font:inherit;font-size:.92rem;cursor:pointer;padding:.35rem .5rem;text-decoration:underline}" +
      ".vc-ticket-push-hint{margin:.65rem 0 0;color:#f0b4a0;font-size:.9rem;line-height:1.35;text-align:left}" +
      ".vc-ticket-push-gate .vc-role-request-auth-sub{width:100%}" +
      "</style>";
    (document.body || document.documentElement).appendChild(wrap);
    return wrap;
  }

  var pendingResolve = null;

  function finish(ok) {
    var root = document.getElementById("vc-ticket-push-gate");
    if (root) {
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
    }
    releaseScroll();
    var r = pendingResolve;
    pendingResolve = null;
    if (typeof r === "function") r(ok === true);
  }

  function paint(st) {
    var en = langEn();
    var root = ensureDom();
    var title = root.querySelector("#vc-ticket-push-title");
    var sub = root.querySelector("#vc-ticket-push-sub");
    var authTitle = root.querySelector("#vc-ticket-push-auth-title");
    var body = root.querySelector("#vc-ticket-push-body");
    var hint = root.querySelector("#vc-ticket-push-hint");
    var enable = root.querySelector("#vc-ticket-push-enable");
    var enableLabel = root.querySelector("#vc-ticket-push-enable-label");
    var cancelBtn = root.querySelector("#vc-ticket-push-cancel-btn");
    if (title) title.textContent = en ? "Notifications required" : "Notifiche obbligatorie";
    if (sub) {
      sub.textContent = en ? "Tickets" : "Tickets";
      sub.hidden = false;
    }
    if (authTitle) {
      authTitle.textContent = en
        ? "Enable notifications to open a ticket"
        : "Attiva le notifiche per aprire un ticket";
    }
    if (body) body.innerHTML = stepsHtml(st);
    if (hint) {
      hint.hidden = true;
      hint.textContent = "";
    }
    if (cancelBtn) cancelBtn.textContent = en ? "Cancel" : "Annulla";
    var ios = st && st.iosNeedsHomeScreen;
    var denied = st && st.permission === "denied";
    var unsupported = st && st.supported === false;
    if (enable) {
      enable.disabled = Boolean(ios || unsupported);
      enable.style.opacity = enable.disabled ? "0.55" : "";
    }
    if (enableLabel) {
      if (ios) enableLabel.textContent = en ? "Open from Home Screen" : "Apri dall’icona Home";
      else if (denied) enableLabel.textContent = en ? "I fixed it — Enable" : "Ho sbloccato — Attiva";
      else enableLabel.textContent = en ? "Enable notifications" : "Attiva notifiche";
    }
    return root;
  }

  function wireOnce(root) {
    if (!root || root.dataset.vcTicketPushWired === "1") return;
    root.dataset.vcTicketPushWired = "1";
    root.addEventListener("click", function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.closest && t.closest("[data-vc-ticket-push-cancel]")) {
        finish(false);
        return;
      }
      var enable = t.closest ? t.closest("#vc-ticket-push-enable") : null;
      if (!enable) return;
      waitPushApi(500).then(function (api) {
        if (!api) {
          var hint = root.querySelector("#vc-ticket-push-hint");
          if (hint) {
            hint.hidden = false;
            hint.textContent = langEn()
              ? "Notifications module still loading — wait a second and try again."
              : "Modulo notifiche ancora in carico — aspetta un secondo e riprova.";
          }
          return;
        }
        var st0 = api.status();
        if (st0.iosNeedsHomeScreen) {
          paint(st0);
          return;
        }
        api.enableFromGesture(enable).then(function (res) {
          if (res && res.ok) {
            finish(true);
            return;
          }
          var st = api.status();
          paint(st);
          var hintEl = root.querySelector("#vc-ticket-push-hint");
          if (hintEl) {
            var msg =
              (res && res.hint) ||
              (res && res.reason === "denied"
                ? langEn()
                  ? "Permission denied — unlock notifications in browser settings."
                  : "Permesso negato — sblocca le notifiche dalle impostazioni del browser."
                : langEn()
                  ? "Could not enable notifications. Try again, or use Chrome/Edge."
                  : "Attivazione fallita. Riprova, oppure usa Chrome/Edge.");
            hintEl.hidden = false;
            hintEl.textContent = msg;
          }
        });
      });
    });
    document.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Escape") return;
      var m = document.getElementById("vc-ticket-push-gate");
      if (!m || m.hidden) return;
      finish(false);
    });
  }

  function openGate(st) {
    var root = paint(st || {});
    wireOnce(root);
    root.hidden = false;
    root.setAttribute("aria-hidden", "false");
    armScroll();
    window.setTimeout(function () {
      try {
        var btn = root.querySelector("#vc-ticket-push-enable");
        if (btn && !btn.disabled) btn.focus({ preventScroll: true });
      } catch (eF) {}
    }, 0);
  }

  function ensureReady(opts) {
    opts = opts || {};
    if (opts.skip === true) return Promise.resolve(true);
    return waitPushApi(4500).then(function (api) {
      if (api && api.isReady()) return true;
      return new Promise(function (resolve) {
        if (pendingResolve) {
          resolve(false);
          return;
        }
        pendingResolve = resolve;
        var st = api ? api.status() : { supported: false, permission: "default", iosNeedsHomeScreen: false };
        openGate(st);
      });
    });
  }

  window.VcTicketsPushGate = {
    ver: VER,
    ensureReady: ensureReady,
    isReady: function () {
      try {
        return Boolean(window.VcWebPush && window.VcWebPush.isReady && window.VcWebPush.isReady());
      } catch (e) {
        return false;
      }
    },
  };
})();
