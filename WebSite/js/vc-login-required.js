/**
 * vcLoginRequired1: modal "Login richiesto" (stesso look di Richiedi Ruolo).
 * Uso: VcLoginRequired.require({ title, sub, body }) → true se loggato, altrimenti apre modal.
 */
(function () {
  var VER = "20260923roleModalScrollStay1";
  if (window.VcLoginRequired && window.VcLoginRequired.ver === VER) return;

  function langEn() {
    try {
      return String(document.documentElement.lang || "").toLowerCase().indexOf("en") === 0;
    } catch (e) {
      return false;
    }
  }

  function hasToken() {
    try {
      if (typeof window.__vcDiscordGetAccessToken === "function") {
        var t = window.__vcDiscordGetAccessToken();
        if (t) return true;
      }
    } catch (e0) {}
    try {
      var tok = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      return Boolean(tok && (!exp || Date.now() < exp));
    } catch (e1) {
      return false;
    }
  }

  function ensureDom() {
    var existing = document.getElementById("vc-login-required-modal");
    if (existing) return existing;
    var wrap = document.createElement("div");
    wrap.id = "vc-login-required-modal";
    wrap.className = "vc-role-request-modal vc-login-required-modal";
    wrap.hidden = true;
    wrap.setAttribute("aria-hidden", "true");
    wrap.innerHTML =
      '<div class="vc-role-modal-backdrop" data-vc-login-required-close="1"></div>' +
      '<section class="vc-role-request-sheet" role="dialog" aria-modal="true" aria-labelledby="vc-login-required-title">' +
      '<div class="vc-role-request-head">' +
      '<div class="vc-role-request-brand">' +
      '<div class="vc-role-request-icon" aria-hidden="true"><i class="fa fa-lock"></i></div>' +
      '<div class="vc-role-request-headcopy">' +
      '<h2 class="vc-role-request-title" id="vc-login-required-title">Login richiesto</h2>' +
      '<p class="vc-role-request-sub" id="vc-login-required-sub"></p>' +
      "</div></div>" +
      '<button type="button" class="vc-role-request-close" id="vc-login-required-close" aria-label="' +
      (langEn() ? "Close" : "Chiudi") +
      '"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="vc-role-request-body">' +
      '<div class="vc-role-request-auth" id="vc-login-required-auth">' +
      '<div class="vc-role-request-auth-icon" aria-hidden="true"><i class="fa fa-lock"></i></div>' +
      '<p class="vc-role-request-auth-title" id="vc-login-required-auth-title">Login richiesto</p>' +
      '<p class="vc-role-request-auth-sub" id="vc-login-required-auth-sub"></p>' +
      '<button type="button" class="vc-role-request-login" id="vc-login-required-login">' +
      '<i class="fa fa-discord-alt" aria-hidden="true"></i> ' +
      (langEn() ? "Sign in with Discord" : "Accedi con Discord") +
      "</button></div></div></section>";
    (document.body || document.documentElement).appendChild(wrap);
    wire(wrap);
    return wrap;
  }

  function wire(root) {
    if (!root || root.dataset.vcLoginWired === "1") return;
    root.dataset.vcLoginWired = "1";
    function close() {
      api.close();
    }
    var closeEls = root.querySelectorAll("[data-vc-login-required-close], #vc-login-required-close");
    for (var i = 0; i < closeEls.length; i++) {
      closeEls[i].addEventListener("click", close);
    }
    var login = root.querySelector("#vc-login-required-login");
    if (login) {
      login.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(login);
          return;
        }
        var hdr = document.getElementById("discord-login-btn");
        if (hdr) hdr.click();
      });
    }
    document.addEventListener("keydown", function (ev) {
      if (!ev || ev.key !== "Escape") return;
      var m = document.getElementById("vc-login-required-modal");
      if (!m || m.hidden) return;
      api.close();
    });
  }

  var api = {
    ver: VER,
    hasToken: hasToken,
    open: function (opts) {
      opts = opts || {};
      var root = ensureDom();
      var title = root.querySelector("#vc-login-required-title");
      var sub = root.querySelector("#vc-login-required-sub");
      var authTitle = root.querySelector("#vc-login-required-auth-title");
      var authSub = root.querySelector("#vc-login-required-auth-sub");
      var headTitle = opts.title || (langEn() ? "Login required" : "Login richiesto");
      var headSub = opts.sub || "";
      var body =
        opts.body ||
        (langEn()
          ? "Sign in with Discord to continue."
          : "Accedi con Discord per continuare.");
      if (title) title.textContent = headTitle;
      if (sub) {
        sub.textContent = headSub;
        sub.hidden = !headSub;
      }
      if (authTitle) authTitle.textContent = langEn() ? "Login required" : "Login richiesto";
      if (authSub) authSub.textContent = body;
      root.hidden = false;
      root.setAttribute("aria-hidden", "false");
      root.removeAttribute("inert");
      try {
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        try {
          if (typeof window.__vcGetPinnedPageScrollY === "function") {
            var pinned = Number(window.__vcGetPinnedPageScrollY()) || 0;
            if (pinned > y) y = pinned;
          }
        } catch (ePinY) {}
        if (!document.body.classList.contains("vc-role-modal-open")) {
          document.body.dataset.vcRoleScrollY = String(y);
        } else {
          y = Number(document.body.dataset.vcRoleScrollY || y) || y;
        }
        if (typeof window.__vcArmModalScrollLock === "function") {
          window.__vcArmModalScrollLock({
            bodyClass: "vc-role-modal-open",
            y: y,
            holdMs: 280,
          });
          document.body.dataset.vcRoleScrollY = String(y);
        } else {
          document.body.classList.add("vc-role-modal-open");
          document.documentElement.classList.add("vc-scroll-soft-lock");
          try {
            if (typeof window.__vcResetPinnedPageScrollY === "function") {
              window.__vcResetPinnedPageScrollY(y);
            }
            if (typeof window.__vcPinPageScroll === "function") {
              window.__vcPinPageScroll({ soft: true, forcePhoneLock: true });
            }
            if (typeof window.__vcHoldPageScroll === "function") {
              window.__vcHoldPageScroll(280, y);
            }
          } catch (ePin) {}
        }
      } catch (eB) {}
      var loginBtn = root.querySelector("#vc-login-required-login");
      window.setTimeout(function () {
        try {
          if (loginBtn) loginBtn.focus({ preventScroll: true });
        } catch (eF) {
          try {
            if (loginBtn) loginBtn.focus();
          } catch (eF2) {}
        }
      }, 0);
    },
    close: function () {
      var root = document.getElementById("vc-login-required-modal");
      if (!root) return;
      root.hidden = true;
      root.setAttribute("aria-hidden", "true");
      try {
        var members = document.getElementById("vc-role-modal");
        var request = document.getElementById("vc-role-request-modal");
        var otherOpen =
          (members && !members.hidden) || (request && !request.hidden);
        if (!otherOpen) {
          var y = Number(document.body.dataset.vcRoleScrollY || "0") || 0;
          try {
            if (typeof window.__vcReleaseModalScrollLock === "function") {
              window.__vcReleaseModalScrollLock({
                bodyClass: "vc-role-modal-open",
                y: y,
              });
            } else {
              document.body.classList.remove("vc-role-modal-open");
              document.documentElement.classList.remove("vc-scroll-soft-lock");
              ["overflow", "overflow-x", "overflow-y", "position", "top", "left", "right", "width"].forEach(
                function (prop) {
                  document.body.style.removeProperty(prop);
                  document.documentElement.style.removeProperty(prop);
                }
              );
              if (typeof window.__vcUnpinPageScroll === "function") {
                window.__vcUnpinPageScroll();
              }
              window.scrollTo(0, y);
              if (typeof window.__vcHoldPageScroll === "function") {
                window.__vcHoldPageScroll(280, y);
              }
            }
          } catch (eU) {}
          delete document.body.dataset.vcRoleScrollY;
        }
      } catch (eC) {}
    },
    /** @returns {boolean} true se loggato */
    require: function (opts) {
      if (hasToken()) return true;
      api.open(opts || {});
      return false;
    },
  };

  window.VcLoginRequired = api;
})();
