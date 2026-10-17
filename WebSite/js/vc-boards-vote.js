/**
 * boardsVoteFlow1 — pagina /bacheca/vota/ : countdown → sponsor → Turnstile → voto → reminder
 * boardsVoteNoCountdown1 — countdown 0: Vota subito (ad + Cloudflare restano)
 * boardsVoteNoAdCountdown1 — adSeconds 0: niente timer sponsor, Continua subito
 * boardsVoteTurnstileCsp1 — load Turnstile robusto (errore/retry) + CSP challenges.cloudflare.com
 * boardsVoteSchedaLayout1 — layout shell come scheda (banner/accent), contenuto voto
 */
(function () {
  "use strict";

  var B = window.VcBoards;
  if (!B) return;

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function esc(s) {
    return B.esc ? B.esc(s) : String(s == null ? "" : s);
  }
  function t(key, vars, fallback) {
    try {
      if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var out = window.VcI18n.t(key, vars || {});
        if (out && out !== key) return out;
      }
    } catch (_) {}
    var fb = fallback != null ? String(fallback) : String(key);
    if (vars && typeof vars === "object") {
      fb = fb.replace(/\{(\w+)\}/g, function (_, k) {
        return vars[k] != null ? String(vars[k]) : "";
      });
    }
    return fb;
  }
  function param(name) {
    try {
      return String(new URLSearchParams(location.search || "").get(name) || "").trim();
    } catch (_) {
      return "";
    }
  }
  function setStep(root, name) {
    root.querySelectorAll("[data-vote-step]").forEach(function (el) {
      el.hidden = el.getAttribute("data-vote-step") !== name;
    });
  }
  function flash(el, msg, err) {
    if (!el) return;
    el.textContent = msg || "";
    el.hidden = !msg;
    el.classList.toggle("is-err", Boolean(err));
  }

  async function resolveListingId() {
    var id = param("id");
    if (id && /^[a-f0-9]{24}$/i.test(id)) return id;
    var slug = param("slug");
    if (!slug) return "";
    var out = await B.api("/listings/" + encodeURIComponent(slug));
    if (out && out.ok && out.listing && out.listing.id) return String(out.listing.id);
    return "";
  }

  function loadTurnstile(siteKey, mount, onToken) {
    if (!siteKey || !mount) {
      onToken("");
      return;
    }
    var rendered = false;
    function showFail(msg) {
      mount.innerHTML =
        '<p class="vc-boards-vote__skip-captcha">' +
        esc(msg || t("boards.voteCaptchaFail", null, "Verifica Cloudflare non caricata. Riprova.")) +
        '</p><button type="button" class="vc-boards-btn vc-boards-btn--ghost" data-ts-retry>' +
        esc(t("boards.voteCaptchaRetry", null, "Ricarica verifica")) +
        "</button>";
      var retry = mount.querySelector("[data-ts-retry]");
      if (retry) {
        retry.addEventListener("click", function () {
          loadTurnstile(siteKey, mount, onToken);
        });
      }
      onToken("");
    }
    function render() {
      if (rendered) return;
      if (!window.turnstile || typeof window.turnstile.render !== "function") {
        showFail();
        return;
      }
      try {
        mount.innerHTML = "";
        rendered = true;
        window.turnstile.render(mount, {
          sitekey: siteKey,
          theme: "dark",
          callback: function (token) {
            onToken(token || "");
          },
          "expired-callback": function () {
            onToken("");
          },
          "error-callback": function () {
            rendered = false;
            showFail(t("boards.voteCaptchaFail", null, "Verifica Cloudflare non caricata. Riprova."));
          },
        });
      } catch (_) {
        rendered = false;
        showFail();
      }
    }
    if (window.turnstile && typeof window.turnstile.render === "function") {
      render();
      return;
    }
    var existing = document.querySelector('script[data-vc-turnstile="1"]');
    if (existing) {
      existing.addEventListener("load", render);
      existing.addEventListener("error", function () {
        showFail();
      });
      setTimeout(function () {
        if (!rendered) render();
      }, 1200);
      return;
    }
    var s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    s.setAttribute("data-vc-turnstile", "1");
    s.onload = function () {
      requestAnimationFrame(render);
    };
    s.onerror = function () {
      showFail(
        t(
          "boards.voteCaptchaBlocked",
          null,
          "Impossibile caricare Cloudflare (rete o blocco script). Disattiva adblock e riprova.",
        ),
      );
    };
    document.head.appendChild(s);
  }

  function ensureAdConsent() {
    try {
      if (localStorage.getItem("vc_cookie_consent") !== "accepted") return false;
      if (typeof window.gtag === "function") {
        window.gtag("consent", "update", {
          ad_storage: "granted",
          ad_user_data: "granted",
          ad_personalization: "granted",
        });
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  function loadAdsenseScript(clientId, onReady) {
    var client = String(clientId || "").trim();
    if (!client) {
      if (onReady) onReady(false);
      return;
    }
    if (window.adsbygoogle && document.querySelector('script[src*="adsbygoogle.js"]')) {
      if (onReady) onReady(true);
      return;
    }
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(client);
    s.crossOrigin = "anonymous";
    s.onload = function () {
      if (onReady) onReady(true);
    };
    s.onerror = function () {
      if (onReady) onReady(false);
    };
    document.head.appendChild(s);
  }

  function runAdSlot(box, ads, seconds, onDone) {
    var provider = String((ads && ads.provider) || "mock").toLowerCase();
    /* boardsVoteNoAdCountdown1: 0 = niente timer, Continua subito */
    var wait = Math.max(0, Number(seconds) || 0);
    var client = String((ads && ads.adsenseClient) || "").trim();
    var slot = String((ads && ads.adsenseSlot) || "").trim();
    box.innerHTML = "";
    if (provider === "none") {
      onDone();
      return;
    }
    function appendContinue() {
      var acts = document.createElement("div");
      acts.className = "vc-boards-vote__acts";
      acts.innerHTML =
        '<button type="button" class="vc-boards-btn vc-boards-btn--primary" data-ad-continue>' +
        '<i class="fa fa-arrow-right" aria-hidden="true"></i> ' +
        esc(t("boards.voteAdContinue", null, "Continua")) +
        "</button>";
      box.appendChild(acts);
      var btn = acts.querySelector("[data-ad-continue]");
      if (btn) {
        btn.addEventListener("click", function () {
          btn.disabled = true;
          onDone();
        });
      }
    }
    /* boardsAdsense1: ca-pub anche senza slot (Auto Ads) */
    if (provider === "adsense" && client) {
      ensureAdConsent();
      var wrap = document.createElement("div");
      wrap.className = "vc-boards-vote__ad-frame";
      if (slot) {
        wrap.innerHTML =
          '<ins class="adsbygoogle" style="display:block;min-height:250px" data-ad-client="' +
          esc(client) +
          '" data-ad-slot="' +
          esc(slot) +
          '" data-ad-format="auto" data-full-width-responsive="true"></ins>';
      } else {
        wrap.innerHTML =
          '<div class="vc-boards-vote__ad-mock-badge">AdSense</div>' +
          "<p>" +
          esc(t("boards.voteAdAuto", null, "Caricamento annunci Google…")) +
          "</p>";
      }
      if (wait > 0) {
        wrap.innerHTML +=
          '<div class="vc-boards-vote__ad-bar"><i style="--ad-sec:' +
          wait +
          's"></i></div>' +
          '<p class="vc-boards-vote__ad-note">' +
          esc(t("boards.voteAdWatch", null, "Attendi lo sponsor…")) +
          ' <strong data-ad-left>' +
          wait +
          "</strong>s</p>";
      }
      box.appendChild(wrap);
      loadAdsenseScript(client, function () {
        if (!slot) return;
        try {
          (window.adsbygoogle = window.adsbygoogle || []).push({});
        } catch (_) {}
      });
    } else {
      var mock =
        '<div class="vc-boards-vote__ad-mock" role="status">' +
        '<div class="vc-boards-vote__ad-mock-badge">Sponsor</div>' +
        "<p>" +
        esc(t("boards.voteAdMock", null, "Spazio pubblicitario — a breve con AdSense.")) +
        "</p>";
      if (wait > 0) {
        mock +=
          '<div class="vc-boards-vote__ad-bar"><i style="--ad-sec:' +
          wait +
          's"></i></div>' +
          '<p class="vc-boards-vote__ad-note">' +
          esc(t("boards.voteAdWatch", null, "Attendi lo sponsor…")) +
          ' <strong data-ad-left>' +
          wait +
          "</strong>s</p>";
      }
      mock += "</div>";
      box.innerHTML = mock;
    }
    if (wait <= 0) {
      appendContinue();
      return;
    }
    var left = wait;
    var label = box.querySelector("[data-ad-left]");
    var tick = setInterval(function () {
      left -= 1;
      if (label) label.textContent = String(Math.max(0, left));
      if (left <= 0) {
        clearInterval(tick);
        onDone();
      }
    }, 1000);
  }

  async function boot() {
    var root = document.getElementById("vc-boards-root");
    if (!root) return;
    /* bootExtMatch1: /vota/ non usa browse fetch — alza subito il sipario boards */
    try {
      if (B && typeof B.markContentReady === "function") B.markContentReady();
    } catch (_) {}
    try {
      if (B && typeof B.installBoardsHeaderNav === "function") {
        B.installBoardsHeaderNav("vote");
      }
    } catch (_) {}
    root.innerHTML =
      '<div class="vc-boards-listing vc-boards-listing--page-bg vc-boards-listing--vote">' +
      '<div class="vc-boards-listing__stage">' +
      '<div class="vc-boards-vote" id="vc-boards-vote-app">' +
      '<p class="vc-boards-vote__msg" id="vc-boards-vote-msg" hidden></p>' +
      '<div class="vc-boards-vote__card" data-vote-step="boot">' +
      '<p class="vc-boards-vote__loading">' +
      esc(t("boards.voteLoading", null, "Preparazione voto…")) +
      "</p></div>" +
      '<div class="vc-boards-vote__card" data-vote-step="login" hidden>' +
      "<h1>" +
      esc(t("boards.voteLoginTitle", null, "Accedi per votare")) +
      "</h1><p>" +
      esc(t("boards.voteLoginBody", null, "Serve l’accesso Discord per registrare il voto.")) +
      '</p><button type="button" class="vc-boards-btn vc-boards-btn--primary" data-vote-login>' +
      esc(t("boards.loginDiscord", null, "Accedi con Discord")) +
      "</button></div>" +
      '<div class="vc-boards-vote__card" data-vote-step="countdown" hidden>' +
      '<div class="vc-boards-vote__head" id="vc-boards-vote-head"></div>' +
      '<p class="vc-boards-vote__lead">' +
      esc(t("boards.voteCountdownLead", null, "Tra pochi secondi potrai votare questa scheda.")) +
      '</p><div class="vc-boards-vote__count" id="vc-boards-vote-count">10</div>' +
      '<button type="button" class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-vote-go" disabled>' +
      '<i class="fa fa-thumbs-up" aria-hidden="true"></i> ' +
      esc(t("boards.voteCta", null, "Vota")) +
      "</button></div>" +
      /* boardsVoteIconDisabled1 */
      '<div class="vc-boards-vote__card" data-vote-step="ad" hidden>' +
      "<h2>" +
      esc(t("boards.voteAdTitle", null, "Sponsor")) +
      '</h2><div id="vc-boards-vote-ad"></div></div>' +
      '<div class="vc-boards-vote__card" data-vote-step="captcha" hidden>' +
      "<h2>" +
      esc(t("boards.voteCaptchaTitle", null, "Verifica anti-robot")) +
      "</h2><p>" +
      esc(t("boards.voteCaptchaBody", null, "Completa il controllo Cloudflare per confermare il voto.")) +
      '</p><div id="vc-boards-vote-turnstile" class="vc-boards-vote__turnstile"></div>' +
      '<button type="button" class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-vote-confirm" disabled>' +
      '<i class="fa fa-check" aria-hidden="true"></i> ' +
      esc(t("boards.voteConfirm", null, "Conferma voto")) +
      "</button></div>" +
      '<div class="vc-boards-vote__card" data-vote-step="thanks" hidden>' +
      '<div class="vc-boards-vote__thanks-ico" aria-hidden="true"><i class="fa fa-heart"></i></div>' +
      "<h1>" +
      esc(t("boards.voteThanksTitle", null, "Grazie per il voto!")) +
      '</h1><p id="vc-boards-vote-thanks-body"></p>' +
      '<label class="vc-boards-vote__remind"><input type="checkbox" id="vc-boards-vote-remind" checked /> ' +
      esc(t("boards.voteRemindLabel", null, "Ricordami di votare di nuovo (notifica in-app + push)")) +
      '</label><div class="vc-boards-vote__acts">' +
      '<a class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-vote-back" href="/bacheca/">' +
      esc(t("boards.voteBack", null, "Torna alla bacheca")) +
      '</a><a class="vc-boards-btn vc-boards-btn--ghost" id="vc-boards-vote-scheda" href="#">' +
      esc(t("boards.voteOpenListing", null, "Apri scheda")) +
      "</a></div></div>" +
      '<div class="vc-boards-vote__card" data-vote-step="error" hidden>' +
      "<h1>" +
      esc(t("boards.voteErrTitle", null, "Non posso votare")) +
      '</h1><p id="vc-boards-vote-err"></p>' +
      '<a class="vc-boards-btn vc-boards-btn--primary" href="/bacheca/">' +
      esc(t("boards.voteBack", null, "Torna alla bacheca")) +
      "</a></div></div></div></div>";

    var app = qs("#vc-boards-vote-app", root);
    var msgEl = qs("#vc-boards-vote-msg", app);
    var loginBtn = qs("[data-vote-login]", app);
    if (loginBtn) {
      loginBtn.addEventListener("click", function () {
        try {
          if (window.VcDiscordAuth && typeof window.VcDiscordAuth.login === "function") {
            window.VcDiscordAuth.login();
            return;
          }
        } catch (_) {}
        var btn = document.getElementById("discord-login-btn");
        if (btn) btn.click();
      });
    }

    if (!B.token || !B.token()) {
      setStep(app, "login");
      return;
    }

    var listingId = await resolveListingId();
    if (!listingId) {
      setStep(app, "error");
      qs("#vc-boards-vote-err", app).textContent = t(
        "boards.voteMissingListing",
        null,
        "Scheda non trovata. Torna alla bacheca e riprova.",
      );
      return;
    }

    var session = await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-session", {
      method: "POST",
      json: {},
    });
    if (!session || !session.ok) {
      setStep(app, "error");
      qs("#vc-boards-vote-err", app).textContent =
        (session && session.message) || t("boards.voteSessionErr", null, "Impossibile avviare il voto.");
      return;
    }

    var L = session.listing || {};
    try {
      if (typeof B.applyListingPageBg === "function") B.applyListingPageBg(L);
    } catch (_) {}
    var head = qs("#vc-boards-vote-head", app);
    var iconRaw = String(L.iconUrl || "").trim();
    var icon = B.animMediaUrl ? B.animMediaUrl(iconRaw) : iconRaw;
    head.innerHTML =
      (icon
        ? '<img class="vc-boards-vote__icon" src="' +
          esc(icon) +
          '" alt="" width="56" height="56" decoding="async" data-vc-anim-media="1" draggable="false" />'
        : '<span class="vc-boards-vote__icon vc-boards-vote__icon--empty"><i class="fa fa-server"></i></span>') +
      /* boardsVoteQuoteFix1: no nested " inside "…class=…" */
      '<div><p class="vc-boards-vote__kicker">' +
      esc(t("boards.voteFor", null, "Stai votando")) +
      "</p><h1>" +
      esc(L.name || "Scheda") +
      '</h1><p class="vc-boards-vote__meta">' +
      esc(t("boards.voteMonthCount", { n: L.votesMonth || 0 }, "{n} voti questo mese")) +
      "</p></div>";

    var schedaLink = qs("#vc-boards-vote-scheda", app);
    if (schedaLink) {
      /* boardsPrettyPath1 */
      schedaLink.href = B.listingUrl
        ? B.listingUrl(L || { id: listingId, kind: L && L.kind })
        : "/bacheca/server/" + encodeURIComponent((L && (L.id || L.slug)) || listingId) + "/";
    }

    var sessionId = session.sessionId;
    /* boardsVoteNoCountdown1: 0 = bottone Vota subito */
    var countdownSec = Math.max(0, Number(session.countdownSeconds) || 0);
    /* boardsVoteNoAdCountdown1 */
    var adSec = Math.max(0, Number(session.adSeconds) || 0);
    var ads = session.ads || { provider: "mock" };
    var turnstileKey = String(session.turnstileSiteKey || "").trim();
    var turnstileRequired = Boolean(session.turnstileRequired);
    var turnstileToken = "";
    var remindWanted = true;

    setStep(app, "countdown");
    var countEl = qs("#vc-boards-vote-count", app);
    var goBtn = qs("#vc-boards-vote-go", app);
    var leadEl = qs(".vc-boards-vote__lead", app);
    if (countdownSec <= 0) {
      if (countEl) {
        countEl.hidden = true;
        countEl.setAttribute("hidden", "");
        countEl.textContent = "";
      }
      if (leadEl) {
        leadEl.textContent = t(
          "boards.voteReadyLead",
          null,
          "Clicca Vota: poi sponsor e verifica Cloudflare.",
        );
      }
      if (goBtn) goBtn.disabled = false;
    } else {
      var left = countdownSec;
      if (countEl) {
        countEl.hidden = false;
        countEl.removeAttribute("hidden");
        countEl.textContent = String(left);
      }
      if (goBtn) goBtn.disabled = true;
      var cd = setInterval(function () {
        left -= 1;
        if (countEl) countEl.textContent = String(Math.max(0, left));
        if (left <= 0) {
          clearInterval(cd);
          if (goBtn) goBtn.disabled = false;
        }
      }, 1000);
    }

    async function afterCountdown() {
      goBtn.disabled = true;
      var prog = await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-progress", {
        method: "POST",
        json: { sessionId: sessionId, step: "countdown" },
      });
      if (!prog || !prog.ok) {
        flash(msgEl, (prog && prog.message) || "Errore countdown.", true);
        goBtn.disabled = false;
        return;
      }
      if (String(ads.provider || "mock") === "none") {
        await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-progress", {
          method: "POST",
          json: { sessionId: sessionId, step: "ad", markStart: true },
        });
        await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-progress", {
          method: "POST",
          json: { sessionId: sessionId, step: "ad" },
        });
        enterCaptcha();
        return;
      }
      setStep(app, "ad");
      await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-progress", {
        method: "POST",
        json: { sessionId: sessionId, step: "ad", markStart: true },
      });
      runAdSlot(qs("#vc-boards-vote-ad", app), ads, adSec, async function () {
        var adProg = await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-progress", {
          method: "POST",
          json: { sessionId: sessionId, step: "ad" },
        });
        if (!adProg || !adProg.ok) {
          flash(msgEl, (adProg && adProg.message) || "Sponsor non completato.", true);
          return;
        }
        enterCaptcha();
      });
    }

    function enterCaptcha() {
      setStep(app, "captcha");
      var confirmBtn = qs("#vc-boards-vote-confirm", app);
      confirmBtn.disabled = true;
      if (!turnstileRequired && !turnstileKey) {
        turnstileToken = "";
        confirmBtn.disabled = false;
        qs("#vc-boards-vote-turnstile", app).innerHTML =
          '<p class="vc-boards-vote__skip-captcha">' +
          esc(t("boards.voteCaptchaSkip", null, "Verifica Cloudflare non ancora configurata — puoi confermare.")) +
          "</p>";
        return;
      }
      loadTurnstile(turnstileKey, qs("#vc-boards-vote-turnstile", app), function (tok) {
        turnstileToken = tok || "";
        confirmBtn.disabled = turnstileRequired ? !turnstileToken : false;
      });
    }

    goBtn.addEventListener("click", afterCountdown);

    qs("#vc-boards-vote-confirm", app).addEventListener("click", async function () {
      var btn = qs("#vc-boards-vote-confirm", app);
      if (turnstileRequired && !turnstileToken) {
        flash(msgEl, t("boards.voteNeedCaptcha", null, "Completa la verifica anti-robot."), true);
        return;
      }
      btn.disabled = true;
      var remindEl = qs("#vc-boards-vote-remind", app);
      remindWanted = !remindEl || remindEl.checked;
      var out = await B.api("/listings/" + encodeURIComponent(listingId) + "/vote", {
        method: "POST",
        json: {
          sessionId: sessionId,
          turnstileToken: turnstileToken,
          remind: remindWanted,
        },
      });
      if (!out || !out.ok) {
        btn.disabled = false;
        flash(msgEl, (out && out.message) || "Errore voto.", true);
        return;
      }
      setStep(app, "thanks");
      qs("#vc-boards-vote-thanks-body", app).textContent = t(
        "boards.voteThanksBody",
        { n: out.votesMonth != null ? out.votesMonth : L.votesMonth || 0, h: out.cooldownHours || 12 },
        "Voto registrato. Questa scheda ha {n} voti nel mese. Potrai votare di nuovo tra circa {h} ore.",
      );
      var rem = qs("#vc-boards-vote-remind", app);
      if (rem) {
        rem.checked = Boolean(out.remindAt) || remindWanted;
        rem.addEventListener("change", async function () {
          rem.disabled = true;
          var r = await B.api("/listings/" + encodeURIComponent(listingId) + "/vote-reminder", {
            method: "POST",
            json: { enable: rem.checked, remind: rem.checked },
          });
          rem.disabled = false;
          flash(
            msgEl,
            r && r.ok
              ? rem.checked
                ? t("boards.voteRemindOn", null, "Promemoria attivo.")
                : t("boards.voteRemindOff", null, "Promemoria disattivato.")
              : (r && r.message) || "Errore reminder.",
            !(r && r.ok),
          );
        });
      }
    });
  }

  function start() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
  }
  start();
})();
/* boardsVoteFlow1 + boardsAdsense1 */
