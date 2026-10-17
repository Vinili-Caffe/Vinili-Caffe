/**
 * Bacheca — browse unificata + detail.
 * boardsCineRestore2: cine kill solo scheda server (view)
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

  /* boardsRevCustomDialog1: confirm/prompt site (VcDialog), non window.confirm */
  function ensureBoardsDialog() {
    if (window.VcDialog && typeof window.VcDialog.confirm === "function") {
      return Promise.resolve(window.VcDialog);
    }
    if (typeof window.__vcEnsureDialog === "function") {
      return window.__vcEnsureDialog().then(function (D) {
        return D || window.VcDialog || null;
      });
    }
    return Promise.resolve(window.VcDialog || null);
  }

  function boardsConfirm(opts) {
    return ensureBoardsDialog().then(function (D) {
      if (D && typeof D.confirm === "function") return D.confirm(opts || {});
      try {
        return window.confirm(String((opts && (opts.message || opts.title)) || "Confermi?"));
      } catch (_) {
        return true;
      }
    });
  }

  function boardsPrompt(opts) {
    return ensureBoardsDialog().then(function (D) {
      if (D && typeof D.prompt === "function") return D.prompt(opts || {});
      try {
        var v = window.prompt(String((opts && (opts.label || opts.title)) || "Inserisci"), String((opts && opts.defaultValue) || ""));
        return v;
      } catch (_) {
        return null;
      }
    });
  }

  /* boardsSideActivity1: curva 24h stabile (seed server) + insight stile top.gg */
  function tBoard(key, vars, fallback) {
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

  /* boardsCreatorMarquee1: PC only, solo se il nome non entra nella pill */
  function isBoardsCreatorMarqueeDesktop() {
    try {
      if (window.matchMedia && window.matchMedia("(max-width: 899.98px)").matches) return false;
      if (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) {
        if (!(window.matchMedia("(min-width: 1100px)").matches)) return false;
      }
    } catch (_) {
      return true;
    }
    return true;
  }

  function clearBoardsCreatorMarquee(nameEl, trackEl, textEl) {
    if (!nameEl) return;
    if (trackEl) {
      var clones = trackEl.querySelectorAll(".vc-marquee__text.is-clone");
      for (var i = 0; i < clones.length; i++) {
        if (clones[i].parentNode) clones[i].parentNode.removeChild(clones[i]);
      }
      trackEl.style.transform = "";
      trackEl.style.removeProperty("display");
      trackEl.style.removeProperty("width");
      trackEl.style.removeProperty("max-width");
      trackEl.style.removeProperty("overflow");
    }
    if (textEl) textEl.style.removeProperty("padding-inline-end");
    nameEl.classList.remove("is-marquee");
    nameEl.style.removeProperty("--vc-marquee-distance");
    nameEl.style.removeProperty("--vc-marquee-duration");
    nameEl.removeAttribute("data-vc-marquee-sig");
  }

  function applyBoardsCreatorMarquee(nameEl) {
    if (!nameEl) return false;
    var trackEl = nameEl.querySelector(".vc-marquee__track");
    var textEl = trackEl && trackEl.querySelector(".vc-marquee__text:not(.is-clone)");
    if (!trackEl || !textEl) return false;

    var reduceMotion = false;
    try {
      reduceMotion = !!(
        window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (_) {}

    if (!isBoardsCreatorMarqueeDesktop() || reduceMotion) {
      clearBoardsCreatorMarquee(nameEl, trackEl, textEl);
      return false;
    }

    var containerW = Math.floor(nameEl.clientWidth || 0);
    if (containerW <= 8) {
      clearBoardsCreatorMarquee(nameEl, trackEl, textEl);
      return false;
    }

    var rawText = String(textEl.textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!rawText) {
      clearBoardsCreatorMarquee(nameEl, trackEl, textEl);
      return false;
    }

    var cloneNodes = trackEl.querySelectorAll(".vc-marquee__text.is-clone");
    var cloneDisplay = [];
    for (var h = 0; h < cloneNodes.length; h++) {
      cloneDisplay.push(cloneNodes[h].style.display);
      cloneNodes[h].style.display = "none";
    }
    var prevPad = textEl.style.paddingInlineEnd;
    textEl.style.paddingInlineEnd = "";
    var prevDisp = trackEl.style.display;
    var prevW = trackEl.style.width;
    var prevMax = trackEl.style.maxWidth;
    var prevOv = trackEl.style.overflow;
    trackEl.style.display = "inline-flex";
    trackEl.style.width = "max-content";
    trackEl.style.maxWidth = "none";
    trackEl.style.overflow = "visible";
    var textW = Math.ceil(
      Math.max(
        textEl.scrollWidth || 0,
        textEl.getBoundingClientRect().width || 0,
        textEl.offsetWidth || 0,
      ),
    );
    trackEl.style.display = prevDisp;
    trackEl.style.width = prevW;
    trackEl.style.maxWidth = prevMax;
    trackEl.style.overflow = prevOv;
    textEl.style.paddingInlineEnd = prevPad;
    for (var r = 0; r < cloneNodes.length; r++) {
      cloneNodes[r].style.display = cloneDisplay[r] || "";
    }

    if (textW <= containerW + 2) {
      clearBoardsCreatorMarquee(nameEl, trackEl, textEl);
      return false;
    }

    var gapPx = 28;
    var segmentW = Math.max(textW + gapPx, containerW + gapPx);
    var duration = Math.max(7, Math.min(18, segmentW / 30)).toFixed(1) + "s";
    var sig = rawText + "|" + segmentW + "|" + duration + "|" + containerW;
    if (
      nameEl.getAttribute("data-vc-marquee-sig") === sig &&
      nameEl.classList.contains("is-marquee") &&
      trackEl.querySelector(".vc-marquee__text.is-clone")
    ) {
      return true;
    }

    clearBoardsCreatorMarquee(nameEl, trackEl, textEl);
    var clone = textEl.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    clone.classList.add("is-clone");
    trackEl.appendChild(clone);
    textEl.style.setProperty(
      "padding-inline-end",
      Math.max(gapPx, segmentW - textW) + "px",
      "important",
    );
    nameEl.style.setProperty("--vc-marquee-distance", segmentW + "px");
    nameEl.style.setProperty("--vc-marquee-duration", duration);
    nameEl.setAttribute("data-vc-marquee-sig", sig);
    nameEl.classList.add("is-marquee");
    return true;
  }

  function syncBoardsCreatorMarquees(scope) {
    var rootEl = scope || document;
    var nodes;
    try {
      nodes = rootEl.querySelectorAll
        ? rootEl.querySelectorAll("[data-vc-creator-marquee]")
        : [];
    } catch (_) {
      nodes = [];
    }
    for (var i = 0; i < nodes.length; i++) {
      applyBoardsCreatorMarquee(nodes[i]);
    }
  }

  try {
    window.__vcBoardsCreatorMarqueeSync = function () {
      syncBoardsCreatorMarquees(document);
    };
  } catch (_) {}

  function wireBoardsCreatorMarquee() {
    if (typeof window === "undefined" || window.__vcBoardsCreatorMarqueeWired) return;
    window.__vcBoardsCreatorMarqueeWired = true;
    var timer = null;
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(function () {
        timer = null;
        syncBoardsCreatorMarquees(document);
      }, 80);
    }
    window.addEventListener("resize", schedule, { passive: true });
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) schedule();
    });
    try {
      if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === "function") {
        document.fonts.ready.then(schedule);
      }
    } catch (_) {}
  }

  /* boardsOwnerTools1 */
  function currentDiscordUserId() {
    try {
      if (window.__VC_DISCORD_PROFILE && window.__VC_DISCORD_PROFILE.id) {
        return String(window.__VC_DISCORD_PROFILE.id).trim();
      }
    } catch (_) {}
    function fromCache(raw) {
      try {
        var o = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!o) return "";
        if (o.user && o.user.id) return String(o.user.id).trim();
        if (o.id) return String(o.id).trim();
        if (o.userId) return String(o.userId).trim();
      } catch (_) {}
      return "";
    }
    try {
      var a = fromCache(sessionStorage.getItem("vc_discord_me_cache_v1"));
      if (a) return a;
    } catch (_) {}
    try {
      var b = fromCache(localStorage.getItem("vc_discord_me_cache_local_v1"));
      if (b) return b;
    } catch (_) {}
    return "";
  }

  function starsHtml(rating, opts) {
    opts = opts || {};
    var n = Math.max(0, Math.min(5, Number(rating) || 0));
    var full = Math.floor(n);
    var html = '<span class="vc-boards-stars' + (opts.lg ? " vc-boards-stars--lg" : "") + '" aria-hidden="true">';
    var i;
    for (i = 1; i <= 5; i++) {
      html +=
        '<i class="fa ' +
        (i <= full ? "fa-star" : "fa-star-o") +
        '"></i>';
    }
    return html + "</span>";
  }

  function relativeTime(iso) {
    try {
      var t = new Date(iso).getTime();
      if (!t) return "";
      var sec = Math.max(0, Math.round((Date.now() - t) / 1000));
      var lang =
        (window.VcI18n && window.VcI18n.getLang && window.VcI18n.getLang()) ||
        document.documentElement.lang ||
        "it";
      var en = String(lang).toLowerCase().indexOf("en") === 0;
      if (sec < 60) return en ? "just now" : "adesso";
      var min = Math.round(sec / 60);
      if (min < 60) return en ? min + "m ago" : min + " min fa";
      var hr = Math.round(min / 60);
      if (hr < 48) return en ? hr + "h ago" : hr + " ore fa";
      var day = Math.round(hr / 24);
      if (day < 45) return en ? day + " days ago" : day + " giorni fa";
      var mo = Math.round(day / 30);
      if (mo < 18) return en ? mo + " months ago" : mo + " mesi fa";
      var yr = Math.round(day / 365);
      return en ? yr + "y ago" : yr + " anni fa";
    } catch (_) {
      return "";
    }
  }

  function viewerAvatarUrl() {
    try {
      var p = window.__VC_DISCORD_PROFILE;
      if (p && p.avatarUrl) return String(p.avatarUrl);
      if (p && p.id && p.avatar) {
        var ext = /^a_/i.test(String(p.avatar)) ? "gif" : "png";
        return (
          "https://cdn.discordapp.com/avatars/" +
          p.id +
          "/" +
          p.avatar +
          "." +
          ext +
          "?size=64"
        );
      }
    } catch (_) {}
    return "";
  }

  function initialsFromName(name) {
    var s = String(name || "").trim();
    if (!s) return "?";
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return s.slice(0, 2).toUpperCase();
  }

  /* boardsFeatures1 + boardsListingReviews1 + boardsReviewReply1 + boardsReviewsUiPager1 + boardsReviewsUiPolish1 + boardsReviewsOwnerGuard1 */
  async function mountListingReviews(B, listing) {
    var box = document.getElementById("vc-boards-reviews");
    if (!box || !listing || !listing.id) return;
    var sort = "relevant";
    var reviewPage = 1;
    var reviewPerPage = 8;
    function flash(text, isErr) {
      var el = document.getElementById("vc-boards-msg");
      if (el) {
        el.hidden = !text;
        el.textContent = text || "";
        el.classList.toggle("is-error", Boolean(isErr));
      }
      try {
        if (B.toastMsg) B.toastMsg(text || "", Boolean(isErr));
      } catch (_) {}
    }

    function distBars(dist, total) {
      var html = '<div class="vc-boards-reviews__dist">';
      var star;
      for (star = 5; star >= 1; star--) {
        var c = Number(dist && dist[star]) || 0;
        var pct = total > 0 ? Math.round((c / total) * 100) : 0;
        html +=
          '<div class="vc-boards-reviews__dist-row">' +
          '<span class="vc-boards-reviews__dist-star">' +
          star +
          ' <i class="fa fa-star" aria-hidden="true"></i></span>' +
          '<span class="vc-boards-reviews__dist-track"><span class="vc-boards-reviews__dist-fill" style="width:' +
          pct +
          '%"></span></span>' +
          '<span class="vc-boards-reviews__dist-n">' +
          c +
          "</span></div>";
      }
      return html + "</div>";
    }

    function reviewCard(r, ctx) {
      ctx = ctx || {};
      var name = String(r.authorName || "Utente");
      var uid = String(r.userId || "").trim();
      var av = String(r.authorAvatarUrl || "").trim();
      var avHash = "";
      try {
        var hm = av.match(/\/avatars\/\d+\/(a_[^/?#.]+|[a-f0-9]{32})\./i);
        if (hm) avHash = hm[1];
      } catch (_) {}
      var avHtml = "";
      try {
        if (
          window.VcDiscordAvatar &&
          typeof window.VcDiscordAvatar.imgHtml === "function" &&
          (uid || av)
        ) {
          avHtml = window.VcDiscordAvatar.imgHtml({
            url: av,
            userId: uid,
            avatarHash: avHash,
            size: 40,
            className: "vc-boards-reviews__av vc-avatar",
            loading: "lazy",
            alt: "",
          });
        }
      } catch (_) {}
      if (!avHtml) {
        avHtml = av
          ? '<img class="vc-boards-reviews__av vc-avatar" data-vc-avatar="1"' +
            (uid ? ' data-user-id="' + B.esc(uid) + '"' : "") +
            (avHash ? ' data-avatar-hash="' + B.esc(avHash) + '"' : "") +
            ' src="' +
            B.esc(av) +
            '" alt="" width="40" height="40" loading="lazy" />'
          : '<span class="vc-boards-reviews__av vc-boards-reviews__av--fallback" aria-hidden="true">' +
            B.esc(initialsFromName(name)) +
            "</span>";
      }
      var body = String(r.content || "");
      var long = body.length > 320;
      var short = long ? body.slice(0, 300).trim() + "…" : body;
      var reply = r.reply && r.reply.content ? r.reply : null;
      var canReply = Boolean(ctx.canReply);
      var serverName = String((ctx.listing && ctx.listing.name) || listing.name || "").trim() || "Server";
      var serverIcon = String(
        (ctx.listing && ctx.listing.iconUrl) || listing.iconUrl || "",
      ).trim();
      var serverIconHtml = serverIcon
        ? '<img class="vc-boards-reviews__av" src="' +
          B.esc(B.animMediaUrl ? B.animMediaUrl(serverIcon) : serverIcon) +
          '" alt="" width="40" height="40" loading="lazy" />'
        : '<span class="vc-boards-reviews__av vc-boards-reviews__av--fallback" aria-hidden="true"><i class="fa fa-server"></i></span>';
      /* boardsReviewsUiPager1: niente tag categorie dopo il nome server */
      var replyBlock = "";
      if (reply) {
        replyBlock =
          '<div class="vc-boards-reviews__reply" data-reply-view="' +
          B.esc(r.id) +
          '">' +
          '<div class="vc-boards-reviews__reply-head">' +
          serverIconHtml +
          '<div class="vc-boards-reviews__reply-meta">' +
          '<div class="vc-boards-reviews__reply-title-row">' +
          '<strong class="vc-boards-reviews__reply-server">' +
          B.esc(serverName) +
          "</strong>" +
          '<span class="vc-boards-reviews__replying">' +
          B.esc(tBoard("boards.reviewsReplyingTo", { name: name }, "In risposta a {name}")) +
          "</span></div>" +
          '<p class="vc-boards-reviews__reply-text">' +
          B.esc(reply.content) +
          "</p>" +
          (canReply
            ? '<button type="button" class="vc-boards-btn vc-boards-btn--ghost vc-boards-reviews__reply-edit" data-reply-edit="' +
              B.esc(r.id) +
              '"><i class="fa fa-pencil" aria-hidden="true"></i> ' +
              B.esc(tBoard("boards.reviewsEditReply", null, "Modifica risposta")) +
              "</button>"
            : "") +
          "</div></div></div>";
      } else if (canReply) {
        replyBlock =
          '<div class="vc-boards-reviews__reply-cta">' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--ghost vc-boards-reviews__reply-open" data-reply-edit="' +
          B.esc(r.id) +
          '"><i class="fa fa-reply" aria-hidden="true"></i> ' +
          B.esc(tBoard("boards.reviewsReply", null, "Rispondi")) +
          "</button></div>";
      }
      var draft = reply ? String(reply.content || "") : "";
      var formBlock =
        '<div class="vc-boards-reviews__reply-form" data-reply-form="' +
        B.esc(r.id) +
        '" hidden>' +
        '<div class="vc-boards-reviews__reply-head">' +
        serverIconHtml +
        '<div class="vc-boards-reviews__reply-meta">' +
        '<div class="vc-boards-reviews__reply-title-row">' +
        '<strong class="vc-boards-reviews__reply-server">' +
        B.esc(serverName) +
        "</strong>" +
        '<span class="vc-boards-reviews__replying">' +
        B.esc(tBoard("boards.reviewsReplyingTo", { name: name }, "In risposta a {name}")) +
        "</span></div>" +
        '<textarea class="vc-boards-reviews__textarea vc-boards-reviews__reply-ta" maxlength="2000" rows="3">' +
        B.esc(draft) +
        "</textarea>" +
        '<div class="vc-boards-reviews__compose-foot">' +
        '<span class="vc-boards-reviews__hint">' +
        B.esc(tBoard("boards.reviewsReplyHint", null, "Lascia un feedback!")) +
        '</span><span class="vc-boards-reviews__count">' +
        String(Math.max(0, 2000 - draft.length)) +
        "</span></div>" +
        '<div class="vc-boards-reviews__reply-acts">' +
        '<button type="button" class="vc-boards-btn vc-boards-btn--primary vc-boards-reviews__reply-save" data-reply-save="' +
        B.esc(r.id) +
        '">' +
        B.esc(
          reply
            ? tBoard("boards.reviewsReplySaveEdit", null, "Modifica")
            : tBoard("boards.reviewsReplySave", null, "Pubblica"),
        ) +
        "</button>" +
        '<button type="button" class="vc-boards-btn vc-boards-btn--ghost vc-boards-reviews__reply-cancel" data-reply-cancel="' +
        B.esc(r.id) +
        '">' +
        B.esc(tBoard("boards.reviewsReplyCancel", null, "Annulla")) +
        "</button>" +
        (reply
          ? '<button type="button" class="vc-boards-btn vc-boards-reviews__reply-delete" data-reply-delete="' +
            B.esc(r.id) +
            '">' +
            B.esc(tBoard("boards.reviewsReplyDelete", null, "Elimina")) +
            "</button>"
          : "") +
        "</div></div></div></div>";

      /* boardsReviewsActsRight1: like/segnala a destra del nome, flush bordo destro */
      return (
        '<article class="vc-boards-reviews__card" data-review-id="' +
        B.esc(r.id) +
        '">' +
        '<div class="vc-boards-reviews__card-head">' +
        avHtml +
        '<div class="vc-boards-reviews__card-meta">' +
        '<strong class="vc-boards-reviews__author">' +
        B.esc(name) +
        "</strong>" +
        '<div class="vc-boards-reviews__card-sub">' +
        starsHtml(r.rating) +
        '<span class="vc-boards-reviews__dot">·</span>' +
        '<span class="vc-boards-reviews__when">' +
        B.esc(relativeTime(r.createdAt)) +
        "</span></div></div>" +
        '<div class="vc-boards-reviews__card-acts">' +
        '<button type="button" class="vc-boards-reviews__like' +
        (r.likedByMe ? " is-on" : "") +
        '" data-like="' +
        B.esc(r.id) +
        '"><i class="fa fa-thumbs-up" aria-hidden="true"></i> <span>' +
        B.esc(String(r.likeCount || 0)) +
        "</span></button>" +
        '<button type="button" class="vc-boards-reviews__report" data-report="' +
        B.esc(r.id) +
        '"><i class="fa fa-flag" aria-hidden="true"></i> ' +
        B.esc(tBoard("boards.reviewsReport", null, "Segnala")) +
        "</button></div></div>" +
        '<p class="vc-boards-reviews__text" data-full="' +
        B.esc(body) +
        '">' +
        B.esc(short) +
        (long
          ? ' <button type="button" class="vc-boards-reviews__more">' +
            B.esc(tBoard("boards.reviewsReadMore", null, "Leggi tutto")) +
            "</button>"
          : "") +
        "</p>" +
        replyBlock +
        (canReply ? formBlock : "") +
        "</article>"
      );
    }

    function reviewsPagerHtml(total, page, perPage) {
      var tot = Math.max(0, Number(total) || 0);
      var pp = Math.max(1, Number(perPage) || reviewPerPage);
      var pages = Math.max(1, Math.ceil(tot / pp) || 1);
      var cur = Math.max(1, Math.min(pages, Number(page) || 1));
      if (tot <= pp) return "";
      return (
        '<div class="vc-boards-reviews__pager" role="navigation" aria-label="' +
        B.esc(tBoard("boards.reviewsPagerAria", null, "Paginazione recensioni")) +
        '">' +
        '<div class="vc-boards-reviews__pager-bar">' +
        '<button type="button" class="vc-boards-btn vc-boards-btn--ghost vc-boards-reviews__pager-btn" data-reviews-page-prev' +
        (cur <= 1 ? " disabled" : "") +
        ">" +
        B.esc(tBoard("boards.reviewsPagerPrev", null, "Precedente")) +
        "</button>" +
        '<span class="vc-boards-reviews__pager-meta" aria-live="polite">' +
        '<span class="vc-boards-reviews__pager-meta-label">' +
        B.esc(tBoard("boards.reviewsPagerPage", null, "Pagina")) +
        "</span>" +
        '<span class="vc-boards-reviews__pager-meta-page">' +
        B.esc(String(cur)) +
        '<span class="vc-boards-reviews__pager-meta-sep" aria-hidden="true">/</span>' +
        B.esc(String(pages)) +
        "</span></span>" +
        '<button type="button" class="vc-boards-btn vc-boards-btn--ghost vc-boards-reviews__pager-btn" data-reviews-page-next' +
        (cur >= pages ? " disabled" : "") +
        ">" +
        B.esc(tBoard("boards.reviewsPagerNext", null, "Successiva")) +
        "</button>" +
        "</div></div>"
      );
    }

    async function paint() {
      var out = await B.api(
        "/listings/" +
          encodeURIComponent(listing.id) +
          "/reviews?sort=" +
          encodeURIComponent(sort) +
          "&page=" +
          encodeURIComponent(String(reviewPage)) +
          "&perPage=" +
          encodeURIComponent(String(reviewPerPage)),
      );
      if (!out || !out.ok) {
        box.innerHTML =
          '<div class="vc-boards-reviews__empty" role="alert">' +
          '<i class="fa fa-exclamation-circle vc-boards-reviews__empty-ico" aria-hidden="true"></i>' +
          "<p>" +
          B.esc((out && out.message) || tBoard("boards.reviewsLoadErr", null, "Impossibile caricare le recensioni.")) +
          "</p></div>";
        return;
      }
      var avg = Number(out.ratingAvg) || 0;
      var total = Number(out.reviewsCount) || (out.reviews || []).length;
      var pageNow = Math.max(1, Number(out.page) || reviewPage);
      var perNow = Math.max(1, Number(out.perPage) || reviewPerPage);
      reviewPage = pageNow;
      reviewPerPage = perNow;
      /* boardsReviewsScoreEmpty1: no "—" a 3rem (pareva barra bianca); 0 muto */
      var avgLabel = total
        ? String(Math.round(avg * 10) / 10).replace(/\.0$/, "")
        : "0";
      var scoreEmptyClass = total ? "" : " is-empty";
      var rows = Array.isArray(out.reviews) ? out.reviews : [];
      var cardCtx = {
        canReply: Boolean(out.canReply),
        listing: out.listing || {
          name: listing.name,
          iconUrl: listing.iconUrl,
          categories: listing.categories || [],
        },
      };
      var avUrl = viewerAvatarUrl();
      var formAv = avUrl
        ? '<img class="vc-boards-reviews__av" src="' + B.esc(avUrl) + '" alt="" width="44" height="44" />'
        : '<span class="vc-boards-reviews__av vc-boards-reviews__av--fallback" aria-hidden="true">+</span>';
      var logged = Boolean(B.token && B.token());
      var canReview = Boolean(out.canReview);
      var isOwner = Boolean(out.isOwner);
      var formHtml = "";
      if (logged && canReview) {
        formHtml =
          '<div class="vc-boards-reviews__compose">' +
          formAv +
          '<div class="vc-boards-reviews__compose-main">' +
          '<div class="vc-boards-reviews__compose-stars" id="vc-boards-review-stars">' +
          [1, 2, 3, 4, 5]
            .map(function (n) {
              return (
                '<button type="button" class="vc-boards-reviews__star-btn" data-star="' +
                n +
                '" aria-label="' +
                n +
                '"><i class="fa fa-star-o" aria-hidden="true"></i></button>'
              );
            })
            .join("") +
          '<span class="vc-boards-reviews__rating-pill" id="vc-boards-review-pill">' +
          B.esc(tBoard("boards.reviewsSelectRating", null, "Seleziona una valutazione")) +
          "</span></div>" +
          '<textarea id="vc-boards-review-text" class="vc-boards-reviews__textarea" maxlength="2048" rows="4" placeholder="' +
          B.esc(
            tBoard(
              "boards.reviewsPlaceholder",
              { name: listing.name || "" },
              "Hai provato {name}? Lascia una recensione.",
            ),
          ) +
          '"></textarea>' +
          '<div class="vc-boards-reviews__compose-foot">' +
          '<span class="vc-boards-reviews__hint">' +
          B.esc(
            tBoard(
              "boards.reviewsHint",
              { name: listing.name || "" },
              "Hai provato {name}? Lascia una recensione.",
            ),
          ) +
          '</span><span class="vc-boards-reviews__count" id="vc-boards-review-count">2048</span></div>' +
          '<button type="button" class="vc-boards-btn vc-boards-btn--primary vc-boards-reviews__submit" id="vc-boards-review-submit">' +
          B.esc(tBoard("boards.reviewsPost", null, "Pubblica recensione")) +
          "</button></div></div>";
      } else if (!logged) {
        formHtml =
          '<p class="vc-boards-reviews__login-hint">' +
          B.esc(
            tBoard(
              "boards.reviewsLogin",
              null,
              "Accedi con Discord per lasciare una recensione.",
            ),
          ) +
          "</p>";
      } else if (isOwner) {
        /* boardsReviewsOwnerGuard1: creatore non recensisce la propria scheda */
        formHtml =
          '<p class="vc-boards-reviews__login-hint" role="status">' +
          B.esc(
            tBoard(
              "boards.reviewsOwnListing",
              null,
              "Come creatore di questa scheda non puoi lasciare una recensione. Puoi solo rispondere alle recensioni degli altri.",
            ),
          ) +
          "</p>";
      } else if (out.mine) {
        /* boardsReviewsDistCompact1: niente banner "Hai già recensito…" */
        formHtml = "";
      }

      box.innerHTML =
        '<div class="vc-boards-reviews__head">' +
        "<div>" +
        '<h2 class="vc-boards-reviews__title">' +
        B.esc(tBoard("boards.reviewsTitle", null, "Valutazioni e recensioni")) +
        "</h2>" +
        /* boardsReviewsGuidelines1: layout score come Top.gg + link linee guida */
        '<div class="vc-boards-reviews__summary">' +
        '<div class="vc-boards-reviews__score">' +
        '<div class="vc-boards-reviews__score-top">' +
        '<div class="vc-boards-reviews__score-n' +
        scoreEmptyClass +
        '">' +
        B.esc(avgLabel) +
        "</div>" +
        '<div class="vc-boards-reviews__score-side">' +
        starsHtml(avg, { lg: true }) +
        '<div class="vc-boards-reviews__score-count">' +
        B.esc(
          total === 1
            ? "1 " + tBoard("boards.reviewsOne", null, "recensione")
            : total + " " + tBoard("boards.reviewsMany", { n: total }, "recensioni"),
        ) +
        "</div></div></div></div>" +
        distBars(out.distribution || {}, total) +
        "</div>" +
        '<p class="vc-boards-reviews__modnote">' +
        B.esc(
          tBoard(
            "boards.reviewsModNoteBefore",
            null,
            "Le recensioni possono essere lasciate solo da utenti registrati. Tutte le recensioni sono moderate dallo staff di Vinili & Caffè. Controlla",
          ),
        ) +
        ' <a class="vc-boards-reviews__guidelines-link" href="/bacheca/linee-guida-recensioni/">' +
        B.esc(tBoard("boards.reviewsGuidelinesLink", null, "le nostre linee guida")) +
        "</a> " +
        B.esc(tBoard("boards.reviewsModNoteAfter", null, "prima di pubblicare.")) +
        "</p></div></div>" +
        formHtml +
        '<div class="vc-boards-reviews__toolbar">' +
        '<label class="vc-boards-reviews__sort">' +
        "<span>" +
        B.esc(tBoard("boards.reviewsSort", null, "Ordina per")) +
        "</span>" +
        '<select id="vc-boards-reviews-sort">' +
        '<option value="relevant"' +
        (sort === "relevant" ? " selected" : "") +
        ">" +
        B.esc(tBoard("boards.reviewsSortRelevant", null, "Più rilevanti")) +
        "</option>" +
        '<option value="newest"' +
        (sort === "newest" ? " selected" : "") +
        ">" +
        B.esc(tBoard("boards.reviewsSortNewest", null, "Più recenti")) +
        "</option>" +
        '<option value="highest"' +
        (sort === "highest" ? " selected" : "") +
        ">" +
        B.esc(tBoard("boards.reviewsSortHighest", null, "Voto più alto")) +
        "</option></select></label></div>" +
        '<div class="vc-boards-reviews__list">' +
        (rows.length
          ? rows
              .map(function (r) {
                return reviewCard(r, cardCtx);
              })
              .join("")
          : '<div class="vc-boards-reviews__empty" role="status">' +
            '<i class="fa fa-comments-o vc-boards-reviews__empty-ico" aria-hidden="true"></i>' +
            "<p>" +
            B.esc(tBoard("boards.reviewsEmpty", null, "Nessuna recensione ancora. Sii il primo!")) +
            "</p></div>") +
        "</div>" +
        reviewsPagerHtml(total, pageNow, perNow);

      try {
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.scan === "function") {
          window.VcDiscordAvatar.scan(box);
        }
      } catch (_) {}

      var sortEl = document.getElementById("vc-boards-reviews-sort");
      if (sortEl) {
        sortEl.addEventListener("change", function () {
          sort = String(sortEl.value || "relevant");
          reviewPage = 1;
          paint();
        });
      }
      var prevBtn = box.querySelector("[data-reviews-page-prev]");
      var nextBtn = box.querySelector("[data-reviews-page-next]");
      if (prevBtn) {
        prevBtn.addEventListener("click", function () {
          if (reviewPage <= 1) return;
          reviewPage -= 1;
          paint().then(function () {
            try {
              box.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (_) {}
          });
        });
      }
      if (nextBtn) {
        nextBtn.addEventListener("click", function () {
          reviewPage += 1;
          paint().then(function () {
            try {
              box.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (_) {}
          });
        });
      }
      box.querySelectorAll(".vc-boards-reviews__more").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var p = btn.closest(".vc-boards-reviews__text");
          if (!p) return;
          p.textContent = p.getAttribute("data-full") || p.textContent;
        });
      });
      box.querySelectorAll("[data-like]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!B.token()) {
            flash(tBoard("boards.loginRequired", null, "Accedi con Discord per continuare."), true);
            return;
          }
          var id = btn.getAttribute("data-like");
          var r = await B.api("/reviews/" + encodeURIComponent(id) + "/like", {
            method: "POST",
            json: {},
          });
          if (r && r.ok && r.review) {
            btn.classList.toggle("is-on", Boolean(r.review.likedByMe));
            var span = btn.querySelector("span");
            if (span) span.textContent = String(r.review.likeCount || 0);
          }
        });
      });
      box.querySelectorAll("[data-report]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!B.token()) {
            flash(tBoard("boards.loginRequired", null, "Accedi con Discord per continuare."), true);
            return;
          }
          var reason = window.prompt(tBoard("boards.reviewsReportPrompt", null, "Motivo della segnalazione?"));
          if (!reason) return;
          var r = await B.api("/reviews/" + encodeURIComponent(btn.getAttribute("data-report")) + "/report", {
            method: "POST",
            json: { reason: reason },
          });
          flash(
            r.message || (r.ok ? tBoard("boards.reviewsReported", null, "Segnalazione inviata.") : "Errore."),
            !r.ok,
          );
        });
      });

      function openReplyForm(id) {
        var card = box.querySelector('.vc-boards-reviews__card[data-review-id="' + id + '"]');
        if (!card) return;
        var form = card.querySelector('[data-reply-form="' + id + '"]');
        var view = card.querySelector('[data-reply-view="' + id + '"]');
        var cta = card.querySelector(".vc-boards-reviews__reply-cta");
        if (form) form.hidden = false;
        if (view) view.hidden = true;
        if (cta) cta.hidden = true;
      }
      function closeReplyForm(id) {
        var card = box.querySelector('.vc-boards-reviews__card[data-review-id="' + id + '"]');
        if (!card) return;
        var form = card.querySelector('[data-reply-form="' + id + '"]');
        var view = card.querySelector('[data-reply-view="' + id + '"]');
        var cta = card.querySelector(".vc-boards-reviews__reply-cta");
        if (form) form.hidden = true;
        if (view) view.hidden = false;
        if (cta) cta.hidden = false;
      }
      box.querySelectorAll("[data-reply-edit]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openReplyForm(btn.getAttribute("data-reply-edit"));
        });
      });
      box.querySelectorAll("[data-reply-cancel]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          closeReplyForm(btn.getAttribute("data-reply-cancel"));
        });
      });
      box.querySelectorAll(".vc-boards-reviews__reply-ta").forEach(function (ta) {
        ta.addEventListener("input", function () {
          var foot = ta.parentNode && ta.parentNode.querySelector(".vc-boards-reviews__count");
          if (foot) foot.textContent = String(Math.max(0, 2000 - String(ta.value || "").length));
        });
      });
      box.querySelectorAll("[data-reply-save]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var id = btn.getAttribute("data-reply-save");
          var card = box.querySelector('.vc-boards-reviews__card[data-review-id="' + id + '"]');
          var ta = card && card.querySelector(".vc-boards-reviews__reply-ta");
          var content = ta ? String(ta.value || "").trim() : "";
          btn.disabled = true;
          var r = await B.api("/reviews/" + encodeURIComponent(id) + "/reply", {
            method: "POST",
            json: { content: content },
          });
          btn.disabled = false;
          if (!r || !r.ok) {
            flash((r && r.message) || "Errore.", true);
            return;
          }
          flash(r.message || tBoard("boards.reviewsReplySaved", null, "Risposta pubblicata."), false);
          await paint();
        });
      });
      box.querySelectorAll("[data-reply-delete]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          if (!window.confirm(tBoard("boards.reviewsReplyDeleteConfirm", null, "Eliminare la risposta?"))) {
            return;
          }
          var id = btn.getAttribute("data-reply-delete");
          btn.disabled = true;
          var r = await B.api("/reviews/" + encodeURIComponent(id) + "/reply", {
            method: "POST",
            json: { clear: true },
          });
          btn.disabled = false;
          if (!r || !r.ok) {
            flash((r && r.message) || "Errore.", true);
            return;
          }
          flash(r.message || tBoard("boards.reviewsReplyDeleted", null, "Risposta rimossa."), false);
          await paint();
        });
      });

      var starWrap = document.getElementById("vc-boards-review-stars");
      var selected = 0;
      function paintStars(n) {
        if (!starWrap) return;
        starWrap.querySelectorAll(".vc-boards-reviews__star-btn").forEach(function (btn) {
          var v = Number(btn.getAttribute("data-star")) || 0;
          var ico = btn.querySelector("i");
          if (ico) ico.className = "fa " + (v <= n ? "fa-star" : "fa-star-o");
          btn.classList.toggle("is-on", v <= n);
        });
        var pill = document.getElementById("vc-boards-review-pill");
        if (pill) {
          pill.textContent =
            n > 0
              ? n + "/5"
              : tBoard("boards.reviewsSelectRating", null, "Seleziona una valutazione");
        }
      }
      if (starWrap) {
        starWrap.querySelectorAll(".vc-boards-reviews__star-btn").forEach(function (btn) {
          btn.addEventListener("click", function () {
            selected = Number(btn.getAttribute("data-star")) || 0;
            paintStars(selected);
          });
          btn.addEventListener("mouseenter", function () {
            paintStars(Number(btn.getAttribute("data-star")) || 0);
          });
        });
        starWrap.addEventListener("mouseleave", function () {
          paintStars(selected);
        });
      }
      var ta = document.getElementById("vc-boards-review-text");
      var cnt = document.getElementById("vc-boards-review-count");
      if (ta && cnt) {
        function syncCount() {
          cnt.textContent = String(Math.max(0, 2048 - String(ta.value || "").length));
        }
        ta.addEventListener("input", syncCount);
        syncCount();
      }
      var submit = document.getElementById("vc-boards-review-submit");
      if (submit) {
        submit.addEventListener("click", async function () {
          if (!selected) {
            flash(tBoard("boards.reviewsNeedRating", null, "Seleziona una valutazione."), true);
            return;
          }
          submit.disabled = true;
          var r = await B.api("/listings/" + encodeURIComponent(listing.id) + "/reviews", {
            method: "POST",
            json: { rating: selected, content: ta ? ta.value : "" },
          });
          submit.disabled = false;
          if (!r || !r.ok) {
            flash((r && r.message) || "Errore.", true);
            return;
          }
          flash(tBoard("boards.reviewsPosted", null, "Recensione pubblicata."), false);
          var ratingEl = document.querySelector(".vc-boards-detail__rating strong");
          if (ratingEl && r.ratingAvg != null) {
            ratingEl.textContent = String(Math.round(Number(r.ratingAvg) * 10) / 10).replace(/\.0$/, "");
          }
          reviewPage = 1;
          await paint();
        });
      }
    }

    await paint();
  }

  function activityHash(id) {
    var s = String(id || "");
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function activityHoursForListing(L) {
    var seed = activityHash(L.discordId || L.id || L.slug || L.name);
    var state = seed;
    function rnd() {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 4294967296;
    }
    var peak = 18 + Math.floor(rnd() * 4); /* 18–21 */
    var hours = [];
    var h;
    for (h = 0; h < 24; h++) {
      var d = Math.min(Math.abs(h - peak), 24 - Math.abs(h - peak));
      var base = Math.exp(-(d * d) / 18);
      var night = h >= 1 && h <= 7 ? 0.18 : 1;
      var noise = 0.72 + rnd() * 0.55;
      hours.push(Math.max(0.07, base * night * noise));
    }
    var mx = 0;
    for (h = 0; h < hours.length; h++) if (hours[h] > mx) mx = hours[h];
    if (mx <= 0) mx = 1;
    return hours.map(function (v) {
      return Math.max(8, Math.round((v / mx) * 100));
    });
  }

  function activityInsightsForListing(L) {
    var seed = activityHash(L.discordId || L.id || "x");
    var members = L.stats && L.stats.members != null ? Number(L.stats.members) : 0;
    var votes = Number(L.votes30d) || 0;
    var top = 25;
    if (members >= 80000) top = 1;
    else if (members >= 25000) top = 2;
    else if (members >= 10000) top = 5;
    else if (members >= 4000) top = 10;
    else if (members >= 1200) top = 15;
    else if (members >= 400) top = 20;
    var delta = 8 + (seed % 34);
    if (votes >= 40) delta = Math.min(48, delta + 8);
    else if (votes >= 10) delta = Math.min(42, delta + 4);
    return { top: top, delta: delta };
  }

  /* boardsSchedaOgTitle1 + langI18nOg1: og/document title localizzato */
  function applySchedaDocTitle(L) {
    if (!L) return;
    var name = String(L.name || "").trim().replace(/\s+/g, " ");
    if (!name) return;
    var joinPrefix = "Entra su ";
    try {
      if (typeof tBoard === "function") joinPrefix = String(tBoard("boards.joinOn", null, "Entra su ")) || joinPrefix;
      else if (window.VcI18n && typeof window.VcI18n.t === "function") {
        var jp = window.VcI18n.t("boards.joinOn");
        if (jp && jp !== "boards.joinOn") joinPrefix = jp;
      }
    } catch (eJoin) {}
    if (joinPrefix && joinPrefix.charAt(joinPrefix.length - 1) !== " ") joinPrefix += " ";
    var page = L.kind === "server" ? joinPrefix + name : name;
    var want = "Vinili & Caffè | " + page;
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.format === "function") {
        want = window.VcPageTitle.format(page);
      }
    } catch (_) {}
    try {
      if (window.VcPageTitle && typeof window.VcPageTitle.set === "function") {
        window.VcPageTitle.set(page);
      } else if (document.title !== want) {
        document.title = want;
      }
    } catch (_) {}
    try {
      var og = document.querySelector('meta[property="og:title"]');
      if (og && og.getAttribute("content") !== want) og.setAttribute("content", want);
      var tw = document.querySelector('meta[name="twitter:title"]');
      if (tw && tw.getAttribute("content") !== want) tw.setAttribute("content", want);
    } catch (_) {}
  }

  function sideActivityHtml(B, L) {
    if (!L || L.kind !== "server") return "";
    var hours = activityHoursForListing(L);
    var ins = activityInsightsForListing(L);
    var bars = hours
      .map(function (pct, idx) {
        return (
          '<span class="vc-boards-activity__bar" style="--h:' +
          pct +
          '%" title="' +
          idx +
          ':00"></span>'
        );
      })
      .join("");
    return (
      '<section class="vc-boards-side__sec vc-boards-side-activity">' +
      '<h3 class="vc-boards-side__h"><i class="fa fa-bar-chart" aria-hidden="true"></i> Attività server</h3>' +
      '<div class="vc-boards-activity" aria-label="Andamento attività nelle 24 ore">' +
      '<div class="vc-boards-activity__bars" role="img" aria-hidden="true">' +
      bars +
      "</div>" +
      '<div class="vc-boards-activity__axis"><span>0:00</span><span>23:00</span></div>' +
      "</div>" +
      '<ul class="vc-boards-activity__insights">' +
      '<li><i class="fa fa-trophy" aria-hidden="true"></i> Top ' +
      B.esc(String(ins.top)) +
      "% server più attivi</li>" +
      '<li><i class="fa fa-line-chart" aria-hidden="true"></i> Attività aumentata del ' +
      B.esc(String(ins.delta)) +
      "%</li>" +
      "</ul></section>"
    );
  }

  function start(B, root) {
    var page = String((document.body && document.body.getAttribute("data-vc-boards-page")) || "")
      .trim()
      .toLowerCase();
    /* boardsSchedaMissBg1: su view non killare cine al boot — solo dopo listing ok (applyListingPageBg) */
    try {
      var isServerUi = page === "view";
      if (isServerUi) {
        if (document.body) document.body.classList.add("vc-boards-page");
        document.querySelectorAll(".vc-home-scrollcue").forEach(function (el) {
          try {
            el.remove();
          } catch (_) {}
        });
        /* nascondi solo chrome/hero; cine resta per miss page */
        document
          .querySelectorAll(".vc-support-page-hero, .vc-page-cine-hero, .vc-boards-chrome")
          .forEach(function (el) {
            try {
              el.style.setProperty("display", "none", "important");
              el.setAttribute("hidden", "");
            } catch (_) {}
          });
      } else if (document.body) {
        document.body.classList.add("vc-boards-page");
      }
    } catch (_) {}

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
        /* apiStaleFirst1: config da cache sync → niente round-trip prima della lista */
        try {
          if (B.peekCachedGet) {
            var cachedCfg = B.peekCachedGet("/config");
            if (cachedCfg && cachedCfg.ok) {
              B.api("/config").catch(function () {});
              return cachedCfg;
            }
          }
        } catch (_c) {}
        return await B.api("/config", {
          onStale: function () {},
        });
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

    /* boardsExploreChipFilter1: filtri da URL (?tag|category|locale|guildTag|&q=) */
    /* boardsExploreFiltersPanelPersist1: pannello filtri (collapsed) in localStorage */
    var EXPLORE_FILTERS_PANEL_KEY = "vc_boards_explore_filters_panel_v1";

    function readExploreFiltersPanelState() {
      try {
        var raw = localStorage.getItem(EXPLORE_FILTERS_PANEL_KEY);
        if (raw) {
          var j = JSON.parse(raw);
          if (j && typeof j === "object") return j;
        }
      } catch (_) {}
      /* migrate session → local */
      try {
        var legacy = sessionStorage.getItem("vc_boards_filters_collapsed");
        if (legacy === "1" || legacy === "0") {
          var migrated = { collapsed: legacy === "1" };
          try {
            localStorage.setItem(EXPLORE_FILTERS_PANEL_KEY, JSON.stringify(migrated));
            sessionStorage.removeItem("vc_boards_filters_collapsed");
          } catch (_m) {}
          return migrated;
        }
      } catch (_s) {}
      return {};
    }

    function writeExploreFiltersPanelState(patch) {
      try {
        var cur = readExploreFiltersPanelState() || {};
        var next = {
          collapsed: patch && Object.prototype.hasOwnProperty.call(patch, "collapsed")
            ? !!patch.collapsed
            : !!cur.collapsed,
        };
        if (patch && patch.filters && typeof patch.filters === "object") {
          next.filters = {
            q: String(patch.filters.q || "").trim(),
            tag: String(patch.filters.tag || "").trim(),
            category: String(patch.filters.category || "").trim(),
            locale: String(patch.filters.locale || "").trim(),
            guildTag: String(patch.filters.guildTag || "").trim(),
          };
        } else if (cur.filters && typeof cur.filters === "object") {
          next.filters = cur.filters;
        }
        if (patch && typeof patch.sort === "string" && patch.sort) {
          next.sort = String(patch.sort);
        } else if (cur.sort) {
          next.sort = String(cur.sort);
        }
        localStorage.setItem(EXPLORE_FILTERS_PANEL_KEY, JSON.stringify(next));
      } catch (_) {}
    }

    function readExploreFilters() {
      var out = { q: "", tag: "", category: "", locale: "", guildTag: "" };
      var fromUrl = false;
      try {
        var params = new URLSearchParams(location.search || "");
        out.q = String(params.get("q") || "").trim();
        out.tag = String(params.get("tag") || "").trim();
        out.category = String(params.get("category") || "").trim();
        out.locale = String(params.get("locale") || "").trim();
        out.guildTag = String(params.get("guildTag") || params.get("guildtag") || "").trim();
        fromUrl = !!(out.q || out.tag || out.category || out.locale || out.guildTag);
      } catch (_) {}
      if (!fromUrl) {
        try {
          var saved = readExploreFiltersPanelState();
          var sf = saved && saved.filters;
          if (sf && typeof sf === "object") {
            out.q = String(sf.q || "").trim();
            out.tag = String(sf.tag || "").trim();
            out.category = String(sf.category || "").trim();
            out.locale = String(sf.locale || "").trim();
            out.guildTag = String(sf.guildTag || "").trim();
          }
        } catch (_r) {}
      }
      return out;
    }

    function exploreSearchLabel(f) {
      if (!f) return "";
      if (f.q) return f.q;
      if (f.tag) return "#" + f.tag.replace(/^#/, "");
      if (f.category) return f.category;
      if (f.locale) return f.locale;
      if (f.guildTag) return f.guildTag;
      return "";
    }

    function syncExploreFiltersUrl(kind, filters, sortVal) {
      try {
        var u = new URL(location.href);
        u.searchParams.set("kind", kind);
        ["tag", "category", "locale", "guildTag", "guildtag", "q"].forEach(function (k) {
          u.searchParams.delete(k);
        });
        if (filters.tag) u.searchParams.set("tag", filters.tag);
        if (filters.category) u.searchParams.set("category", filters.category);
        if (filters.locale) u.searchParams.set("locale", filters.locale);
        if (filters.guildTag) u.searchParams.set("guildTag", filters.guildTag);
        if (filters.q) u.searchParams.set("q", filters.q);
        history.replaceState(null, "", u.pathname + "?" + u.searchParams.toString() + u.hash);
      } catch (_) {}
      writeExploreFiltersPanelState({ filters: filters, sort: sortVal });
    }

    async function renderBrowse() {
      var cfg = await loadConfig();
      var access = await ensurePreviewAccess(cfg);
      if (!cfg.publicOpen && !access.ok) {
        /* boardsNoStaticHub1: niente hub directory — gate o empty */
        var gated = false;
        try {
          gated = Boolean(
            B.showBoardsGate &&
              B.showBoardsGate({ mode: access.needLogin ? "login" : "staff" }),
          );
        } catch (_) {
          gated = false;
        }
        if (!gated) {
          root.innerHTML =
            '<div class="vc-boards-empty vc-boards-empty--gate">' +
            '<p class="vc-boards-empty__title">Accesso richiesto</p>' +
            '<p class="vc-boards-empty__sub">La Bacheca è in anteprima staff: accedi con Discord per continuare.</p></div>';
        } else {
          try {
            root.innerHTML = "";
          } catch (_) {}
        }
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eGateReady) {}
        return;
      }
      if (B.dismissBoardsGate) B.dismissBoardsGate();
      var kind = readKind();
      /* boardsExploreChipFilter1: stato filtri da chip / URL */
      var filters = readExploreFilters();
      var panelState = readExploreFiltersPanelState();
      /* boardsNoScore1: niente sort/score */
      /* boardsSortReviews1: filtro Recensioni (rating + count) */
      var sortVal = "new";
      try {
        var savedSort = String((panelState && panelState.sort) || "").trim();
        if (/^(new|votes|bumps|reviews)$/.test(savedSort)) sortVal = savedSort;
      } catch (_sort) {}
      var filtersCollapsedBoot = !!(panelState && panelState.collapsed);
      var sortOpts = [
        { value: "new", label: "Nuovi", i18n: "boards.sortNew" },
        { value: "votes", label: "Voti", i18n: "boards.sortVotes" },
        { value: "bumps", label: "Bump", i18n: "boards.sortBumps" },
        { value: "reviews", label: "Recensioni", i18n: "boards.sortReviews" },
      ];
      /* boardsExploreFiltersPanel1 + boardsExploreFilterSearch1:
         menu ricercabili per categorie / lingue / tag (+ tag Discord) */
      var catLabels = (cfg && cfg.categoryLabels) || {};
      var locLabels = (cfg && cfg.localeLabels) || {};
      var allCats = Array.isArray(cfg && cfg.categories) ? cfg.categories.slice() : [];
      var allLocs = Array.isArray(cfg && cfg.locales) ? cfg.locales.slice() : [];

      function filterOptBtn(type, value, label, optHtml) {
        var v = String(value || "").trim();
        var lab = String(label || v);
        return (
          '<button type="button" class="vc-boards-fsel__opt" role="option" data-filter-type="' +
          B.esc(type) +
          '" data-filter-value="' +
          B.esc(v) +
          '" data-filter-label="' +
          B.esc(lab) +
          '" data-filter-search="' +
          B.esc((lab + " " + v).toLowerCase()) +
          '">' +
          (optHtml || B.esc(lab)) +
          "</button>"
        );
      }

      function localeOptBtn(code) {
        var key = String(code || "")
          .toLowerCase()
          .replace(/[^a-z0-9\-]/g, "");
        if (!key) return "";
        var lab = locLabels[key] || key.toUpperCase();
        return filterOptBtn(
          "locale",
          key,
          lab,
          '<span class="vc-lang-flag vc-lang-flag--' +
            B.esc(key) +
            '" aria-hidden="true"></span><span>' +
            B.esc(lab) +
            "</span>",
        );
      }

      function filterSelectHtml(type, ico, title, placeholder, listHtml) {
        return (
          '<div class="vc-boards-fsel" data-fsel="' +
          B.esc(type) +
          '">' +
          '<span class="vc-boards-fsel__caption">' +
          B.esc(title) +
          "</span>" +
          '<button type="button" class="vc-boards-fsel__btn vc-no-sfx" data-fsel-btn aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="vc-boards-fsel__ico" aria-hidden="true"><i class="fa ' +
          B.esc(ico) +
          '"></i></span>' +
          '<span class="vc-boards-fsel__label is-placeholder" data-fsel-label>' +
          B.esc(placeholder) +
          "</span>" +
          '<i class="fa fa-chevron-down vc-boards-fsel__chev" aria-hidden="true"></i></button>' +
          '<div class="vc-boards-fsel__panel" data-fsel-panel hidden>' +
          '<input type="search" class="vc-boards-fsel__q" data-fsel-q placeholder="Cerca…" autocomplete="off" />' +
          '<div class="vc-boards-fsel__list" role="listbox" data-fsel-list>' +
          '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--clear" role="option" data-filter-type="' +
          B.esc(type) +
          '" data-filter-value="" data-filter-label="" data-filter-search="tutte tutte all clear">' +
          "Tutte</button>" +
          listHtml +
          "</div></div></div>"
        );
      }

      var catOptsHtml = allCats
        .map(function (k) {
          return filterOptBtn("category", k, catLabels[k] || k);
        })
        .join("");
      var locOptsHtml = allLocs.map(localeOptBtn).join("");

      /* boardsHeaderNav1: chrome = solo Server|Bot centrato; pagine in header */
      root.innerHTML =
        B.navHtml("browse", { kind: kind, idPrefix: "vc-boards-kind" }) +
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
        /* boardsFloatSearch1 + boardsExploreFiltersPanelPersist1: filtri rimpicciolibili */
        '<section class="vc-boards-filters' +
        (filtersCollapsedBoot ? " is-collapsed" : "") +
        '" id="vc-boards-filters" aria-label="Filtri bacheca">' +
        '<div class="vc-boards-filters__top">' +
        '<div class="vc-boards-filters__title">' +
        '<i class="fa fa-sliders" aria-hidden="true"></i>' +
        "<div><strong>Filtri</strong><span>Categorie, lingue, tag e tag Discord</span></div>" +
        "</div>" +
        '<div class="vc-boards-filters__top-acts">' +
        '<div class="vc-boards-filters__active" id="vc-boards-filters-active" hidden></div>' +
        '<button type="button" class="vc-boards-filters__clear vc-no-sfx" id="vc-boards-filters-clear" hidden>Azzera</button>' +
        '<button type="button" class="vc-boards-filters__fold vc-no-sfx" id="vc-boards-filters-fold" aria-expanded="' +
        (filtersCollapsedBoot ? "false" : "true") +
        '" aria-controls="vc-boards-filters-body" title="' +
        (filtersCollapsedBoot ? "Espandi filtri" : "Rimpicciolisci filtri") +
        '">' +
        '<i class="fa fa-chevron-up" aria-hidden="true"></i></button>' +
        "</div></div>" +
        '<div class="vc-boards-filters__body vc-boards-filters__body--menus" id="vc-boards-filters-body">' +
        filterSelectHtml("category", "fa-tag", "Categorie", "Cerca categoria…", catOptsHtml) +
        filterSelectHtml("locale", "fa-globe", "Lingue", "Cerca lingua…", locOptsHtml) +
        filterSelectHtml(
          "tag",
          "fa-hashtag",
          "Tag",
          "Cerca tag…",
          '<span class="vc-boards-filters__loading" data-fsel-tags-loading>Caricamento tag…</span>',
        ) +
        /* boardsGuildTagFsel1: Tag Discord come gli altri menu (no input+Applica full-width) */
        /* boardsGuildTagTutteDup1: Tutte già in filterSelectHtml — non riduplicarla qui */
        filterSelectHtml(
          "guildTag",
          "fa-hashtag",
          "Tag Discord",
          "Cerca tag Discord…",
          '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--create" role="option" data-filter-type="guildTag" data-filter-value="" data-filter-label="" data-filter-search="" data-guild-create hidden>Usa tag</button>' +
            '<span class="vc-boards-filters__empty" data-guild-hint>Digita fino a 4 caratteri (es. VC)</span>',
        ) +
        "</div></section>" +
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
      var filtersRoot = document.getElementById("vc-boards-filters");
      var filtersActiveEl = document.getElementById("vc-boards-filters-active");
      var filtersClearBtn = document.getElementById("vc-boards-filters-clear");
      var fselPlaceholders = {
        category: "Cerca categoria…",
        locale: "Cerca lingua…",
        tag: "Cerca tag…",
        guildTag: "Cerca tag Discord…",
      };

      function normalizeGuildTag(raw) {
        return String(raw || "")
          .replace(/^#/, "")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 4)
          .toUpperCase();
      }

      function syncGuildCreateOpt(sel, typed) {
        if (!sel) return;
        var create = sel.querySelector("[data-guild-create]");
        var hint = sel.querySelector("[data-guild-hint]");
        var g = normalizeGuildTag(typed);
        if (create) {
          if (g) {
            create.hidden = false;
            create.setAttribute("data-filter-value", g);
            create.setAttribute("data-filter-label", g);
            create.setAttribute("data-filter-search", g.toLowerCase());
            create.textContent = "Usa " + g;
          } else {
            create.hidden = true;
            create.setAttribute("data-filter-value", "");
            create.setAttribute("data-filter-label", "");
            create.textContent = "Usa tag";
          }
        }
        if (hint) hint.hidden = !!g;
      }

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

      function activeFilterCount() {
        var n = 0;
        if (filters.category) n += 1;
        if (filters.locale) n += 1;
        if (filters.tag) n += 1;
        if (filters.guildTag) n += 1;
        return n;
      }

      function closeAllFsel(except) {
        if (!filtersRoot) return;
        var sels = filtersRoot.querySelectorAll(".vc-boards-fsel[data-fsel]");
        for (var i = 0; i < sels.length; i++) {
          if (except && sels[i] === except) continue;
          sels[i].classList.remove("is-open");
          var btn = sels[i].querySelector("[data-fsel-btn]");
          var panel = sels[i].querySelector("[data-fsel-panel]");
          if (btn) btn.setAttribute("aria-expanded", "false");
          if (panel) panel.hidden = true;
        }
      }

      function filterFselOpts(sel, q) {
        if (!sel) return;
        var needle = String(q || "")
          .trim()
          .toLowerCase();
        var opts = sel.querySelectorAll(".vc-boards-fsel__opt");
        for (var i = 0; i < opts.length; i++) {
          var hay = opts[i].getAttribute("data-filter-search") || opts[i].textContent || "";
          opts[i].hidden = !!(needle && String(hay).toLowerCase().indexOf(needle) < 0);
        }
      }

      function setFselOpen(sel, open) {
        if (!sel || !sel.querySelector("[data-fsel-btn]")) return;
        if (open) closeAllFsel(sel);
        sel.classList.toggle("is-open", !!open);
        var btn = sel.querySelector("[data-fsel-btn]");
        var panel = sel.querySelector("[data-fsel-panel]");
        if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
        if (panel) {
          panel.hidden = !open;
          if (open) {
            var q = sel.querySelector("[data-fsel-q]");
            if (q) {
              var isGuild = sel.getAttribute("data-fsel") === "guildTag";
              if (isGuild) {
                q.setAttribute("maxlength", "4");
                q.setAttribute("spellcheck", "false");
                q.setAttribute("autocomplete", "off");
                q.placeholder = "es. VC";
                q.value = filters.guildTag || "";
                syncGuildCreateOpt(sel, q.value);
              } else {
                q.removeAttribute("maxlength");
                q.placeholder = "Cerca…";
                q.value = "";
                filterFselOpts(sel, "");
              }
              setTimeout(function () {
                try {
                  q.focus();
                  if (isGuild && q.value) q.select();
                } catch (_) {}
              }, 0);
            }
          }
        }
      }

      function syncFilterPanelUi() {
        try {
          if (filtersRoot) {
            var opts = filtersRoot.querySelectorAll(".vc-boards-fsel__opt[data-filter-type]");
            for (var i = 0; i < opts.length; i++) {
              var opt = opts[i];
              var t = opt.getAttribute("data-filter-type");
              var v = String(opt.getAttribute("data-filter-value") || "");
              var on =
                (t === "category" && ((v && v === filters.category) || (!v && !filters.category))) ||
                (t === "locale" && ((v && v === filters.locale) || (!v && !filters.locale))) ||
                (t === "tag" && ((v && v === filters.tag) || (!v && !filters.tag))) ||
                (t === "guildTag" &&
                  ((v && v.toUpperCase() === String(filters.guildTag || "").toUpperCase()) ||
                    (!v && !filters.guildTag)));
              opt.classList.toggle("is-on", on);
              opt.setAttribute("aria-selected", on ? "true" : "false");
            }
            var sels = filtersRoot.querySelectorAll(".vc-boards-fsel[data-fsel]");
            for (var si = 0; si < sels.length; si++) {
              var sel = sels[si];
              var key = sel.getAttribute("data-fsel");
              var labEl = sel.querySelector("[data-fsel-label]");
              if (!labEl || !fselPlaceholders[key]) continue;
              var cur = "";
              var show = "";
              if (key === "category") {
                cur = filters.category;
                show = cur ? catLabels[cur] || cur : "";
              } else if (key === "locale") {
                cur = filters.locale;
                show = cur ? locLabels[cur] || cur : "";
              } else if (key === "tag") {
                cur = filters.tag;
                show = cur ? "#" + cur : "";
              } else if (key === "guildTag") {
                cur = filters.guildTag;
                show = cur ? cur : "";
              }
              if (show) {
                labEl.textContent = show;
                labEl.classList.remove("is-placeholder");
              } else {
                labEl.textContent = fselPlaceholders[key];
                labEl.classList.add("is-placeholder");
              }
            }
          }
          var parts = [];
          if (filters.category) {
            parts.push(
              '<span class="vc-boards-filters__pill">' +
                B.esc(catLabels[filters.category] || filters.category) +
                "</span>",
            );
          }
          if (filters.locale) {
            parts.push(
              '<span class="vc-boards-filters__pill">' +
                B.esc(locLabels[filters.locale] || filters.locale) +
                "</span>",
            );
          }
          if (filters.tag) {
            parts.push('<span class="vc-boards-filters__pill">#' + B.esc(filters.tag) + "</span>");
          }
          if (filters.guildTag) {
            parts.push(
              '<span class="vc-boards-filters__pill">Discord ' + B.esc(filters.guildTag) + "</span>",
            );
          }
          if (filtersActiveEl) {
            filtersActiveEl.innerHTML = parts.join("");
            filtersActiveEl.hidden = !parts.length;
          }
          if (filtersClearBtn) filtersClearBtn.hidden = !parts.length;
          if (filtersRoot) filtersRoot.classList.toggle("has-active", parts.length > 0);
        } catch (_) {}
      }

      function applyExactFilter(type, value, label) {
        var v = String(value || "").trim();
        var lab = String(label || v).trim();
        if (type === "category") {
          filters.category = !v || filters.category === v ? "" : v;
          if (!v) filters.category = "";
        } else if (type === "locale") {
          filters.locale = !v || filters.locale === v ? "" : v;
          if (!v) filters.locale = "";
        } else if (type === "tag") {
          filters.tag = !v || filters.tag === v ? "" : v;
          if (!v) filters.tag = "";
        } else if (type === "guildTag") {
          var g = normalizeGuildTag(v);
          filters.guildTag =
            !g || String(filters.guildTag || "").toUpperCase() === g ? "" : g;
          if (!g) filters.guildTag = "";
        }
        var qEl = document.getElementById("vc-boards-q");
        var qParts = [];
        if (filters.category) qParts.push(catLabels[filters.category] || filters.category);
        if (filters.locale) qParts.push(locLabels[filters.locale] || filters.locale);
        if (filters.tag) qParts.push("#" + filters.tag);
        if (filters.guildTag) qParts.push(filters.guildTag);
        if (!qParts.length && lab && type === "guildTag" && !filters.guildTag) {
          /* cleared */
        }
        if (qEl) qEl.value = qParts.join(" · ");
        filters.q = qEl ? String(qEl.value || "").trim() : qParts.join(" · ");
        syncFilterPanelUi();
        load();
      }

      function clearExactFilters() {
        filters.tag = "";
        filters.category = "";
        filters.locale = "";
        filters.guildTag = "";
        filters.q = "";
        var qEl = document.getElementById("vc-boards-q");
        if (qEl) qEl.value = "";
        syncFilterPanelUi();
        load();
      }

      async function loadPopularTags() {
        var tagList =
          filtersRoot && filtersRoot.querySelector('[data-fsel="tag"] [data-fsel-list]');
        if (!tagList) return;
        try {
          var out = await B.api("/tags?limit=80");
          var items = (out && (out.items || out.tags || out.results)) || [];
          if (!Array.isArray(items) || !items.length) {
            var suggested = Array.isArray(cfg && cfg.suggestedTags) ? cfg.suggestedTags.slice(0, 48) : [];
            items = suggested.map(function (t) {
              return { tag: t, count: 0 };
            });
          }
          items = items
            .map(function (it) {
              if (typeof it === "string") return { tag: it, count: 0 };
              return { tag: String(it.tag || it._id || "").trim(), count: Number(it.count) || 0 };
            })
            .filter(function (it) {
              return !!it.tag;
            })
            .slice(0, 80);
          var clearOpt =
            '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--clear" role="option" data-filter-type="tag" data-filter-value="" data-filter-label="" data-filter-search="tutte tutte all clear">Tutte</button>';
          if (!items.length) {
            tagList.innerHTML =
              clearOpt + '<span class="vc-boards-filters__empty">Nessun tag ancora</span>';
            return;
          }
          tagList.innerHTML =
            clearOpt +
            items
              .map(function (it) {
                return filterOptBtn("tag", it.tag, "#" + it.tag);
              })
              .join("");
          syncFilterPanelUi();
        } catch (_) {
          tagList.innerHTML =
            '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--clear" role="option" data-filter-type="tag" data-filter-value="" data-filter-label="" data-filter-search="tutte tutte all clear">Tutte</button>' +
            '<span class="vc-boards-filters__empty">Tag non disponibili</span>';
        }
      }

      function paintListings(out) {
        if (!out || !out.ok) return false;
        setMsg(msg, "");
        var list = out.listings || [];
        var nActive = activeFilterCount();
        countEl.textContent = list.length
          ? list.length +
            (list.length === 1 ? " scheda" : " schede") +
            (nActive ? " · filtro attivo" : "")
          : "";
        if (!list.length) {
          grid.innerHTML =
            '<div class="vc-boards-empty">' +
            '<div class="vc-boards-empty__ico" aria-hidden="true"><i class="fa fa-th-large"></i></div>' +
            '<p class="vc-boards-empty__title">Nessuna scheda</p>' +
            '<p class="vc-boards-empty__sub">Prova altri filtri oppure pubblica la tua.</p>' +
            '<a class="vc-boards-btn vc-boards-btn--primary" href="/bacheca/invia/">Pubblica scheda</a>' +
            "</div>";
        } else {
          grid.innerHTML = list.map(B.cardHtml).join("");
        }
        try {
          if (B.markContentReady) B.markContentReady();
        } catch (eReady) {}
        return true;
      }

      async function load() {
        var qEl = document.getElementById("vc-boards-q");
        var q = (qEl && qEl.value) || "";
        filters.q = String(q || "").trim();
        /* boardsLoadHold1: niente toast/box "Caricamento…" al primo paint (sipario cine) */
        if (window.__vcBoardsContentReady) setMsg(msg, tBoard("boards.loading", null, "Caricamento…"));
        else setMsg(msg, "");
        var qs =
          "?kind=" +
          encodeURIComponent(kind) +
          "&sort=" +
          encodeURIComponent(sortVal) +
          (access.staff && !cfg.publicOpen ? "&allowClosed=1" : "");
        if (filters.tag) qs += "&tag=" + encodeURIComponent(filters.tag);
        if (filters.category) qs += "&category=" + encodeURIComponent(filters.category);
        if (filters.locale) qs += "&locale=" + encodeURIComponent(filters.locale);
        if (filters.guildTag) qs += "&guildTag=" + encodeURIComponent(filters.guildTag);
        if (filters.q) qs += "&q=" + encodeURIComponent(filters.q);
        syncExploreFiltersUrl(kind, filters, sortVal);
        syncFilterPanelUi();

        /* apiStaleFirst2 + apiStaleFirst1: paint immediato da cache, poi revalidate */
        var listPath = "/listings" + qs;
        var painted = false;
        try {
          if (B.peekCachedGet) {
            var early = B.peekCachedGet(listPath);
            if (early && early.ok) painted = paintListings(early);
          }
        } catch (ePeek) {}

        var out = await B.api(listPath, {
          onStale: function (body) {
            if (painted) return;
            try {
              painted = paintListings(body);
            } catch (eSt) {}
          },
        });
        if (!out || !out.ok) {
          if (painted) return;
          setMsg(msg, (out && out.message) || "Errore caricamento.", true);
          grid.innerHTML = "";
          try {
            if (B.markContentReady) B.markContentReady();
          } catch (eReady0) {}
          return;
        }
        paintListings(out);
      }

      document.getElementById("vc-boards-kind-server").addEventListener("click", function () {
        kind = "server";
        syncExploreFiltersUrl(kind, filters, sortVal);
        syncKindButtons();
        load();
      });
      document.getElementById("vc-boards-kind-bot").addEventListener("click", function () {
        kind = "bot";
        syncExploreFiltersUrl(kind, filters, sortVal);
        syncKindButtons();
        load();
      });
      /* wsShell1: quiet refresh lista quando muta bacheca */
      try {
        var boardsWsTimer = 0;
        window.addEventListener("vc:boards-changed", function () {
          if (document.hidden) return;
          if (boardsWsTimer) clearTimeout(boardsWsTimer);
          boardsWsTimer = setTimeout(function () {
            boardsWsTimer = 0;
            try {
              load();
            } catch (eLoad) {}
          }, 220);
        });
      } catch (eBdWs) {}
      document.getElementById("vc-boards-q").addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        /* nuova ricerca libera: togli filtri chip esatti */
        filters.tag = "";
        filters.category = "";
        filters.locale = "";
        filters.guildTag = "";
        syncFilterPanelUi();
        load();
      });
      if (filtersRoot) {
        filtersRoot.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-fsel-btn]") : null;
          if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var sel = btn.closest(".vc-boards-fsel");
            setFselOpen(sel, !(sel && sel.classList.contains("is-open")));
            return;
          }
          var opt =
            e.target && e.target.closest
              ? e.target.closest(".vc-boards-fsel__opt[data-filter-type]")
              : null;
          if (opt) {
            e.preventDefault();
            e.stopPropagation();
            applyExactFilter(
              opt.getAttribute("data-filter-type"),
              opt.getAttribute("data-filter-value"),
              opt.getAttribute("data-filter-label"),
            );
            closeAllFsel();
            return;
          }
        });
        filtersRoot.addEventListener("input", function (e) {
          var q = e.target && e.target.closest ? e.target.closest("[data-fsel-q]") : null;
          if (!q) return;
          var sel = q.closest(".vc-boards-fsel");
          if (sel && sel.getAttribute("data-fsel") === "guildTag") {
            var cleaned = normalizeGuildTag(q.value);
            if (q.value !== cleaned) q.value = cleaned;
            syncGuildCreateOpt(sel, cleaned);
            return;
          }
          filterFselOpts(sel, q.value);
        });
        filtersRoot.addEventListener("keydown", function (e) {
          if (e.key === "Escape") {
            closeAllFsel();
            return;
          }
          if (e.key !== "Enter") return;
          var q = e.target && e.target.closest ? e.target.closest("[data-fsel-q]") : null;
          if (!q) return;
          var sel = q.closest(".vc-boards-fsel");
          if (!sel || sel.getAttribute("data-fsel") !== "guildTag") return;
          e.preventDefault();
          var g = normalizeGuildTag(q.value);
          if (!g) {
            applyExactFilter("guildTag", "", "");
          } else {
            /* forza set (non toggle) su Enter */
            filters.guildTag = "";
            applyExactFilter("guildTag", g, g);
          }
          closeAllFsel();
        });
      }
      if (filtersClearBtn) {
        filtersClearBtn.addEventListener("click", function () {
          clearExactFilters();
        });
      }
      /* boardsExploreFiltersPanelPersist1: collapse filtri Esplora (localStorage) */
      var filtersFoldBtn = document.getElementById("vc-boards-filters-fold");
      function setExploreFiltersCollapsed(on, opts) {
        if (!filtersRoot) return;
        filtersRoot.classList.toggle("is-collapsed", !!on);
        if (filtersFoldBtn) {
          filtersFoldBtn.setAttribute("aria-expanded", on ? "false" : "true");
          filtersFoldBtn.setAttribute(
            "title",
            on ? "Espandi filtri" : "Rimpicciolisci filtri",
          );
        }
        if (!(opts && opts.skipPersist)) {
          writeExploreFiltersPanelState({ collapsed: !!on, filters: filters, sort: sortVal });
        }
      }
      if (filtersFoldBtn && filtersRoot) {
        if (filtersCollapsedBoot) setExploreFiltersCollapsed(true, { skipPersist: true });
        filtersFoldBtn.addEventListener("click", function (e) {
          e.preventDefault();
          setExploreFiltersCollapsed(!filtersRoot.classList.contains("is-collapsed"));
        });
      }
      loadPopularTags();
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
          sortVal = String(btn.getAttribute("data-value") || "new");
          syncSortUi();
          setSortOpen(false);
          load();
        });
      }
      document.addEventListener(
        "click",
        function (e) {
          if (sortMenu && sortMenu.classList.contains("is-open") && !sortMenu.contains(e.target)) {
            setSortOpen(false);
          }
          if (filtersRoot && filtersRoot.querySelector(".vc-boards-fsel.is-open")) {
            var openSel = filtersRoot.querySelector(".vc-boards-fsel.is-open");
            if (openSel && !openSel.contains(e.target)) closeAllFsel();
          }
        },
        true,
      );
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          setSortOpen(false);
          closeAllFsel();
        }
      });
      syncSortUi();
      try {
        var qBoot = document.getElementById("vc-boards-q");
        if (qBoot) {
          var bootParts = [];
          if (filters.category) bootParts.push(catLabels[filters.category] || filters.category);
          if (filters.locale) bootParts.push(locLabels[filters.locale] || filters.locale);
          if (filters.tag) bootParts.push("#" + filters.tag);
          if (filters.guildTag) bootParts.push(filters.guildTag);
          qBoot.value = bootParts.length ? bootParts.join(" · ") : exploreSearchLabel(filters);
        }
      } catch (_) {}
      syncFilterPanelUi();
      syncExploreFiltersUrl(kind, filters, sortVal);
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

    /* boardsPageBannerBg1 + boardsVoteSchedaLayout1: shell in VcBoards.applyListingPageBg */
    function applyListingPageBg(L) {
      if (B && typeof B.applyListingPageBg === "function") {
        B.applyListingPageBg(L);
      }
    }

    /* boardsPendingRedirect1: link diretto a scheda in attesa → hub bacheca (no owner/staff) */
    function redirectPendingNotPublic(kind) {
      var hub =
        String(kind || "").toLowerCase() === "bot" ? "/bacheca/bot/" : "/bacheca/server/";
      try {
        location.replace(hub);
      } catch (_) {
        location.href = hub;
      }
    }

    /* boardsSchedaMissBg1: empty scheda con sfondo cine/foto normale (come le altre pagine) */
    function renderMissingListing(message, opts) {
      opts = opts || {};
      try {
        document.documentElement.classList.remove(
          "vc-boards-scheda-ui",
          "vc-boards-detail-live",
          "vc-boards-page-banner-bg",
          "vc-boards-listing-ui",
          "vc-boards-page-banner-bg--has",
          "vc-boards-page-banner-bg--none",
          "vc-boards-detail-live--banner",
          "vc-boards-detail-live--default",
        );
        document.documentElement.classList.add("vc-site-photo-bg", "vc-boards-scheda-miss");
        if (document.body) {
          document.body.classList.remove(
            "vc-boards-scheda-ui",
            "vc-boards-detail-live",
            "vc-boards-page-banner-bg",
            "vc-boards-listing-ui",
          );
          document.body.classList.add("vc-page-cine-layout", "vc-boards-scheda-miss");
          document.body.style.removeProperty("background-color");
          document.body.style.removeProperty("background-image");
          document.body.style.removeProperty("transition");
          document.body.style.removeProperty("transition-property");
        }
        var layer = document.getElementById("vc-boards-page-bg");
        if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
        var runtime = document.getElementById("vc-boards-page-bg-runtime");
        if (runtime && runtime.parentNode) runtime.parentNode.removeChild(runtime);
        document.documentElement.style.removeProperty("--vc-boards-page-banner");
        document.documentElement.style.removeProperty("--vc-boards-page-accent");
        document.documentElement.style.removeProperty("--vc-boards-page-base");
      } catch (eCls) {}
      var title = String(message || "Scheda non trovata.").trim() || "Scheda non trovata.";
      var sub = opts.review
        ? "Questa scheda non è più disponibile (ritirata o rimossa). Torna all’inbox o esplora la bacheca."
        : "Il link non punta a una scheda attiva. Può essere stata ritirata o non è ancora pubblica.";
      var actions =
        '<div class="vc-boards-empty__actions">' +
        '<a class="vc-boards-btn vc-boards-btn--primary" href="/bacheca/">Esplora</a>' +
        (opts.review
          ? '<a class="vc-boards-btn vc-boards-btn--ghost" href="/notifications/?view=staff&amp;inbox=revisione&amp;scope=pending">Inbox revisione</a>'
          : '<a class="vc-boards-btn vc-boards-btn--ghost" href="/bacheca/le-mie/">Le mie</a>') +
        "</div>";
      root.innerHTML =
        '<div class="vc-boards-empty vc-boards-empty--miss">' +
        '<div class="vc-boards-empty__ico" aria-hidden="true"><i class="fa fa-search"></i></div>' +
        '<p class="vc-boards-empty__title">' +
        B.esc(title) +
        "</p>" +
        '<p class="vc-boards-empty__sub">' +
        B.esc(sub) +
        "</p>" +
        actions +
        "</div>";
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eMiss) {}
    }

    /* boardsPrettyPath1 + boardsRevLangPath1: /bacheca/server|<bots>/<id> anche con /en/… */
    function boardsPathname() {
      var path = String(location.pathname || "/") || "/";
      try {
        if (window.VcI18n && typeof window.VcI18n.stripLangPrefix === "function") {
          path = String(window.VcI18n.stripLangPrefix(path) || path);
        } else {
          path = path.replace(
            /^\/(it|en|es|fr|de|pt|ru|zh|ja|ko|ar|nl|pl|tr|hi|id|uk|vi|ro|sv)(?=\/|$)/i,
            "",
          ) || "/";
        }
      } catch (_) {}
      if (path.charAt(0) !== "/") path = "/" + path;
      return path;
    }

    function parsePrettyListingPath() {
      var path = boardsPathname();
      /* boardsSchedaIdFix1: accetta anche /servers/ (plurale) → server */
      var mServer = path.match(/^\/(?:bacheca|boards)\/servers?\/([^/]+)\/?$/i);
      if (mServer) {
        return { kind: "server", id: String(mServer[1] || "").trim() };
      }
      var mBot = path.match(/^\/(?:bacheca|boards)\/bots\/([^/]+)\/?$/i);
      if (mBot) {
        return { kind: "bot", id: String(mBot[1] || "").trim() };
      }
      return null;
    }

    function waitForBoardsToken(ms) {
      var budget = Math.max(0, Number(ms) || 0);
      var started = Date.now();
      return new Promise(function (resolve) {
        function tick() {
          var t = "";
          try {
            t = B.token && B.token() ? String(B.token() || "").trim() : "";
          } catch (_) {
            t = "";
          }
          if (t) {
            resolve(t);
            return;
          }
          if (Date.now() - started >= budget) {
            resolve("");
            return;
          }
          window.setTimeout(tick, 80);
        }
        tick();
      });
    }

    function canonicalListingHref(L, opts) {
      opts = opts || {};
      if (!L || !B.listingUrl) return "";
      return B.listingUrl({
        kind: L.kind,
        id: L.id || L.slug,
        review: Boolean(opts.review),
        preview: Boolean(opts.preview),
      });
    }

    function maybeCanonicalizeListingUrl(L, reviewMode, ownerPreview) {
      if (!L) return;
      var want = canonicalListingHref(L, { review: reviewMode, preview: ownerPreview && !reviewMode });
      if (!want) return;
      var curPath = boardsPathname();
      var onLegacyScheda = /^\/(?:bacheca|boards)\/scheda\/?$/i.test(curPath);
      var pretty = parsePrettyListingPath();
      var kindKey = B.listingKindKey
        ? B.listingKindKey(L.kind)
        : String(L.kind || "").toLowerCase() === "bot"
          ? "bot"
          : "server";
      var wrongKind = Boolean(pretty && pretty.kind !== kindKey);
      var idKey = String(L.id || "").trim();
      var slugKey = String(L.slug || "").trim();
      var prettyId = pretty ? String(pretty.id || "").trim() : "";
      var wrongId = Boolean(
        pretty && prettyId && idKey && prettyId !== idKey && (!slugKey || prettyId !== slugKey),
      );
      if (!onLegacyScheda && !wrongKind && !wrongId) return;
      try {
        history.replaceState(null, "", want);
      } catch (_) {
        try {
          location.replace(want);
        } catch (__) {}
      }
    }

    async function renderDetail() {
      var params = new URLSearchParams(location.search || "");
      var slug = String(params.get("slug") || "").trim();
      var listingId = String(params.get("id") || "").trim();
      var reviewMode =
        params.get("review") === "1" ||
        params.get("review") === "true" ||
        String(params.get("mode") || "").toLowerCase() === "review";
      var ownerPreview =
        params.get("preview") === "1" ||
        params.get("preview") === "true" ||
        String(params.get("mode") || "").toLowerCase() === "preview";
      var pretty = parsePrettyListingPath();
      if (pretty && pretty.id) {
        if (/^[a-f0-9]{24}$/i.test(pretty.id)) listingId = listingId || pretty.id;
        else if (!slug) slug = pretty.id;
        else listingId = listingId || pretty.id;
      }
      if (!slug && !listingId) {
        var m = boardsPathname().match(
          /^\/(?:bacheca|boards)\/(?!server|servers|bot|bots|invia|submit|le-mie|manage|mod|scheda|view)([^/]+)\/?$/i,
        );
        if (m) slug = m[1];
      }
      if (!slug && !listingId) {
        renderMissingListing("Scheda non specificata.", { review: reviewMode });
        return;
      }
      var cfg = await loadConfig();
      var access = await ensurePreviewAccess(cfg);
      var out = null;
      /* boardsRevLangPath1: in review aspetta il token Discord (race login/PWA) */
      var tokStr = "";
      if (reviewMode || ownerPreview) {
        tokStr = await waitForBoardsToken(2200);
      } else {
        try {
          tokStr = B.token && B.token() ? String(B.token() || "").trim() : "";
        } catch (_) {
          tokStr = "";
        }
      }
      var tok = Boolean(tokStr);
      var key = listingId || slug;

      /* boardsSchedaMissUi1 + boardsRevLangPath1: review → sempre /mod prima del pubblico */
      if (reviewMode && listingId) {
        if (tok) {
          out = await B.api("/mod/listings/" + encodeURIComponent(listingId));
          if (out && out.ok && out.listing) {
            reviewMode = true;
            ownerPreview = false;
          } else {
            var mineRev = await B.api("/me/listings/" + encodeURIComponent(listingId));
            if (mineRev && mineRev.ok && mineRev.listing) {
              out = mineRev;
              ownerPreview = true;
              reviewMode = false;
            } else if (out && (out.error || out.status)) {
              /* conserva errore mod (not_found / forbidden) */
            } else if (mineRev && (mineRev.error || mineRev.status)) {
              out = mineRev;
            } else {
              out = null;
            }
          }
        }
        /* ancora niente: prova pubblico solo come fallback (pending → non redirect in review) */
        if (!(out && out.ok && out.listing)) {
          var pubRev = await B.api("/listings/" + encodeURIComponent(listingId));
          if (pubRev && pubRev.ok && pubRev.listing) {
            out = pubRev;
            if (pubRev.ownerPreview) ownerPreview = true;
          } else if (pubRev && pubRev.error === "pending_not_public") {
            /* scheda c’è ma serve staff token — non “non trovata” */
            if (!tok) {
              if (B.showBoardsGate) B.showBoardsGate({ mode: "login" });
              try {
                if (B.markContentReady) B.markContentReady();
              } catch (_) {}
              return;
            }
            if (!(out && out.error)) out = pubRev;
          } else if (!(out && out.error) && pubRev) {
            out = pubRev;
          }
        }
      } else if (ownerPreview && listingId && tok) {
        out = await B.api("/me/listings/" + encodeURIComponent(listingId));
        if (out && out.ok && out.listing) ownerPreview = true;
        else if (!(out && out.error)) out = null;
      } else if (key) {
        var qs = access.staff && !cfg.publicOpen ? "?allowClosed=1" : "";
        out = await B.api("/listings/" + encodeURIComponent(key) + qs);
        if (out && out.error === "pending_not_public") {
          if (listingId && tok) {
            var mine = await B.api("/me/listings/" + encodeURIComponent(listingId));
            if (mine && mine.ok && mine.listing) {
              out = mine;
              ownerPreview = true;
            } else {
              var modPend = await B.api("/mod/listings/" + encodeURIComponent(listingId));
              if (modPend && modPend.ok && modPend.listing) {
                out = modPend;
                reviewMode = true;
                ownerPreview = false;
              } else {
                redirectPendingNotPublic(out.kind);
                return;
              }
            }
          } else {
            redirectPendingNotPublic(out.kind);
            return;
          }
        } else if (out && out.ok && out.listing && out.ownerPreview) {
          ownerPreview = true;
        } else if (!(out && out.ok && out.listing) && listingId && tok && !slug) {
          /* staff senza ?review=1 su id diretto */
          var modTry = await B.api("/mod/listings/" + encodeURIComponent(listingId));
          if (modTry && modTry.ok && modTry.listing) {
            out = modTry;
            reviewMode = true;
            ownerPreview = false;
          }
        }
      }

      if (out && out.error === "pending_not_public") {
        if (reviewMode) {
          /* boardsRevLangPath1: in review non buttare fuori — gate o miss esplicito */
          if (!tok) {
            if (B.showBoardsGate) B.showBoardsGate({ mode: "login" });
            try {
              if (B.markContentReady) B.markContentReady();
            } catch (_) {}
            return;
          }
          out = null;
        } else {
          redirectPendingNotPublic(out.kind);
          return;
        }
      }
      /* boardsSchedaMissUi1/2: miss definitivo prima del gate (anche guest / review link morto) */
      var outErr = out ? String(out.error || "").trim() : "";
      var outStatus = out ? Number(out.status) || 0 : 0;
      var isListingMiss =
        Boolean(out) &&
        out.ok !== true &&
        !out.listing &&
        (outErr === "not_found" ||
          (outStatus === 404 && outErr !== "boards_preview" && outErr !== "pending_not_public"));
      if (isListingMiss) {
        if (B.dismissBoardsGate) B.dismissBoardsGate();
        renderMissingListing((out && out.message) || "Scheda non trovata.", { review: reviewMode });
        return;
      }
      if (!out || !out.ok || !out.listing) {
        /* review/mod fallito (out null) ma id noto → prova pubblico 1 volta prima del gate */
        if (!out && listingId) {
          out = await B.api("/listings/" + encodeURIComponent(listingId));
          outErr = out ? String(out.error || "").trim() : "";
          outStatus = out ? Number(out.status) || 0 : 0;
          if (out && out.error === "pending_not_public") {
            if (reviewMode) {
              if (!tok) {
                if (B.showBoardsGate) B.showBoardsGate({ mode: "login" });
                try {
                  if (B.markContentReady) B.markContentReady();
                } catch (_) {}
                return;
              }
              if (B.dismissBoardsGate) B.dismissBoardsGate();
              renderMissingListing(
                "Non riesco ad aprire l’anteprima staff. Riprova tra un attimo.",
                { review: true },
              );
              return;
            }
            redirectPendingNotPublic(out.kind);
            return;
          }
          if (
            out &&
            !out.ok &&
            !out.listing &&
            (outErr === "not_found" || outStatus === 404)
          ) {
            if (B.dismissBoardsGate) B.dismissBoardsGate();
            renderMissingListing((out && out.message) || "Scheda non trovata.", { review: reviewMode });
            return;
          }
          if (out && out.ok && out.listing) {
            /* continue paint below */
          } else if (!cfg.publicOpen && !access.ok) {
            if (B.showBoardsGate) {
              B.showBoardsGate({ mode: access.needLogin ? "login" : "staff" });
            }
            try {
              if (B.markContentReady) B.markContentReady();
            } catch (_) {}
            return;
          } else {
            if (B.dismissBoardsGate) B.dismissBoardsGate();
            renderMissingListing("Scheda non trovata.", { review: reviewMode });
            return;
          }
        } else if (!cfg.publicOpen && !access.ok) {
          if (B.showBoardsGate) {
            B.showBoardsGate({ mode: access.needLogin ? "login" : "staff" });
          }
          try {
            if (B.markContentReady) B.markContentReady();
          } catch (_) {}
          return;
        } else {
          if (B.dismissBoardsGate) B.dismissBoardsGate();
          renderMissingListing((out && out.message) || "Scheda non trovata.", { review: reviewMode });
          return;
        }
      }
      if (B.dismissBoardsGate) B.dismissBoardsGate();
      var L = out.listing;
      if (out.ownerPreview) ownerPreview = true;
      /* boardsPrettyPath1: legacy scheda/?id|slug → /server/<id>/ o /bots/<id> */
      maybeCanonicalizeListingUrl(L, reviewMode, ownerPreview);
      var statusKeyEarly = String(L.status || "").toLowerCase();
      var meIdEarly = currentDiscordUserId();
      var ownerIdEarly = String(L.ownerUserId || L.userId || "").trim();
      var isOwnerEarly =
        Boolean(meIdEarly && ownerIdEarly && meIdEarly === ownerIdEarly) ||
        Boolean(ownerPreview && B.token && B.token());
      /* boardsPendingRedirect1: pending visibile solo owner o staff review */
      if (
        (statusKeyEarly === "pending" || statusKeyEarly === "draft" || statusKeyEarly === "") &&
        !isOwnerEarly &&
        !reviewMode
      ) {
        redirectPendingNotPublic(L.kind);
        return;
      }
      applyListingPageBg(L);
      applySchedaDocTitle(L);
      try {
        /* boardsOwnerPendingTools1: barra sticky solo staff; owner usa controlli laterali */
        if (reviewMode && !ownerPreview) {
          document.documentElement.classList.add("vc-boards-has-review-bar");
          if (document.body) document.body.classList.add("vc-boards-has-review-bar");
        } else {
          document.documentElement.classList.remove("vc-boards-has-review-bar");
          if (document.body) document.body.classList.remove("vc-boards-has-review-bar");
        }
      } catch (_) {}
      var invite = L.kind === "bot" ? L.botInviteUrl || L.inviteUrl : L.inviteUrl;
      var statusKey = String(L.status || "").toLowerCase();
      var waitingAccept =
        ownerPreview && (statusKey === "pending" || statusKey === "draft" || statusKey === "");
      var canDecide = reviewMode && !ownerPreview && (statusKey === "pending" || statusKey === "");
      /* boardsOwnerTools1 + boardsOwnerPendingTools1: creator anche in revisione (ask-review off) */
      var meId = currentDiscordUserId();
      var ownerIdOfListing = String(L.ownerUserId || L.userId || "").trim();
      var isListingOwner =
        Boolean(meId && ownerIdOfListing && meId === ownerIdOfListing) ||
        (ownerPreview && Boolean(B.token && B.token()));
      var showOwnerTools =
        isListingOwner &&
        !reviewMode &&
        (statusKey === "approved" ||
          statusKey === "pending" ||
          statusKey === "draft" ||
          statusKey === "");
      var ownerAskReviewEnabled = statusKey === "approved";
      /* boardsFloatSearch1: GIF a_* size 256 + anello animato */
      var detailIconUrl = B.animMediaUrl
        ? B.animMediaUrl(L.iconUrl, { size: 256 })
        : L.iconUrl;
      var icon = detailIconUrl
        ? '<span class="vc-boards-detail__icon-ring vc-no-sfx" data-vc-boards-icon-ring="1">' +
          '<img class="vc-boards-detail__icon" src="' +
          B.esc(detailIconUrl) +
          '" alt="" width="112" height="112" decoding="async" data-vc-anim-media="1" draggable="false" />' +
          "</span>"
        : '<span class="vc-boards-detail__icon-ring vc-boards-detail__icon-ring--empty vc-no-sfx" data-vc-boards-icon-ring="1" aria-hidden="true">' +
          '<span class="vc-boards-detail__icon vc-boards-detail__icon--empty"><i class="fa fa-server"></i></span></span>';
      var catLabels = (cfg && cfg.categoryLabels) || {};
      var locLabels = (cfg && cfg.localeLabels) || {};
      var allCatsDetail = Array.isArray(cfg && cfg.categories) ? cfg.categories.slice() : [];
      var allLocsDetail = Array.isArray(cfg && cfg.locales) ? cfg.locales.slice() : [];
      var exploreKind = String(L.kind || "server").toLowerCase() === "bot" ? "bot" : "server";
      var chipHref =
        B.exploreFilterUrl ||
        function (o) {
          return (
            "/bacheca/?kind=" +
            encodeURIComponent(o.kind || "server") +
            (o.type === "tag" ? "&tag=" + encodeURIComponent(o.value || "") : "") +
            (o.type === "category" ? "&category=" + encodeURIComponent(o.value || "") : "") +
            (o.type === "locale" ? "&locale=" + encodeURIComponent(o.value || "") : "") +
            (o.type === "guildTag" ? "&guildTag=" + encodeURIComponent(o.value || "") : "") +
            "&q=" +
            encodeURIComponent(o.q || o.value || "")
          );
        };
      var chipHtml =
        B.filterChipHtml ||
        function (cls, href, inner, title, meta) {
          meta = meta && typeof meta === "object" ? meta : {};
          return (
            '<a class="' +
            B.esc(cls) +
            ' vc-boards-filter-chip vc-no-sfx" href="' +
            B.esc(href) +
            '"' +
            (title ? ' title="' + B.esc(title) + '"' : "") +
            (meta.type ? ' data-filter-type="' + B.esc(meta.type) + '"' : "") +
            (meta.value ? ' data-filter-value="' + B.esc(meta.value) + '"' : "") +
            ">" +
            inner +
            "</a>"
          );
        };
      /* boardsExploreChipFilter1: chip → Esplora con filtro in barra ricerca */
      var sideCats = (L.categories || [])
        .map(function (t) {
          var key = String(t || "").trim();
          if (!key) return "";
          var lab = catLabels[key] || key;
          var href = chipHref({
            kind: exploreKind,
            type: "category",
            value: key,
            q: lab,
          });
          return chipHtml(
            "vc-boards-side-pill vc-boards-side-pill--hash",
            href,
            "#" + B.esc(lab),
            "Cerca categoria " + lab,
            { type: "category", value: key },
          );
        })
        .join("");
      var detailTagsHtml = (L.tags || [])
        .map(function (t) {
          var raw = String(t || "").trim();
          if (!raw) return "";
          var href = chipHref({
            kind: exploreKind,
            type: "tag",
            value: raw,
            q: "#" + raw,
          });
          return chipHtml("vc-boards-tag", href, "#" + B.esc(raw), "Cerca tag #" + raw, {
            type: "tag",
            value: raw,
          });
        })
        .join("");
      var sideLocs = (L.locales || [])
        .map(function (t) {
          var key = String(t || "")
            .toLowerCase()
            .replace(/[^a-z0-9\-]/g, "");
          if (!key) return "";
          var lab = locLabels[key] || String(t).toUpperCase();
          var href = chipHref({
            kind: exploreKind,
            type: "locale",
            value: key,
            q: lab,
          });
          return chipHtml(
            "vc-boards-side-pill vc-boards-side-pill--lang",
            href,
            '<span class="vc-lang-flag vc-lang-flag--' +
              B.esc(key) +
              '" aria-hidden="true"></span><span>' +
              B.esc(lab) +
              "</span>",
            "Cerca lingua " + lab,
            { type: "locale", value: key },
          );
        })
        .join("");
      /* boardsSocialRealIco1: logo SVG ufficiali (TikTok ecc.), non fa-music */
      var socialSvg =
        '<svg class="vc-boards-social-svg" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="';
      var socialMeta = {
        instagram: {
          label: "Instagram",
          svg:
            socialSvg +
            'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>',
        },
        tiktok: {
          label: "TikTok",
          svg:
            socialSvg +
            'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>',
        },
        youtube: {
          label: "YouTube",
          svg:
            socialSvg +
            'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>',
        },
        twitch: {
          label: "Twitch",
          svg:
            socialSvg +
            'M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z"/></svg>',
        },
        x: {
          label: "X",
          svg:
            socialSvg +
            'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        },
        twitter: {
          label: "X",
          svg:
            socialSvg +
            'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
        },
        github: {
          label: "GitHub",
          svg:
            socialSvg +
            'M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
        },
        discord: {
          label: "Discord",
          ico: "fa-comments",
        },
      };
      var sideSocials = "";
      if (L.siteUrl) {
        var siteHost = String(L.siteUrl)
          .replace(/^https?:\/\//i, "")
          .replace(/\/$/, "");
        sideSocials +=
          '<a class="vc-boards-side-link" href="' +
          B.esc(L.siteUrl) +
          '" target="_blank" rel="noopener noreferrer"><i class="fa fa-link" aria-hidden="true"></i><span>' +
          B.esc(siteHost || "Sito") +
          "</span></a>";
      }
      if (L.socials && typeof L.socials === "object") {
        sideSocials += Object.keys(L.socials)
          .map(function (k) {
            var key = String(k || "").toLowerCase();
            var meta = socialMeta[key] || { ico: "fa-link", label: k };
            var icoHtml = meta.svg
              ? meta.svg
              : '<i class="fa ' + (meta.ico || "fa-link") + '" aria-hidden="true"></i>';
            return (
              '<a class="vc-boards-side-link" href="' +
              B.esc(L.socials[k]) +
              '" target="_blank" rel="noopener noreferrer">' +
              icoHtml +
              "<span>" +
              B.esc(meta.label) +
              "</span></a>"
            );
          })
          .join("");
      }
      var ownerId = String(L.ownerUserId || "").trim();
      var creatorName = String(L.authorName || "").trim() || "Creator";
      var creatorAvatarUrl = String(L.authorAvatarUrl || "").trim();
      if (
        !creatorAvatarUrl &&
        ownerId &&
        L.authorAvatar &&
        window.VcDiscordAvatar &&
        typeof window.VcDiscordAvatar.buildFromParts === "function"
      ) {
        try {
          creatorAvatarUrl = window.VcDiscordAvatar.buildFromParts(ownerId, L.authorAvatar, 64) || "";
        } catch (_) {}
      }
      if (
        !creatorAvatarUrl &&
        window.VcDiscordAvatar &&
        typeof window.VcDiscordAvatar.siteFallbackAvatarUrl === "function"
      ) {
        try {
          creatorAvatarUrl = window.VcDiscordAvatar.siteFallbackAvatarUrl();
        } catch (_) {}
      }
      var creatorAvHtml = "";
      try {
        if (window.VcDiscordAvatar && typeof window.VcDiscordAvatar.imgHtml === "function") {
          creatorAvHtml = window.VcDiscordAvatar.imgHtml({
            url: creatorAvatarUrl,
            userId: ownerId,
            avatarHash: L.authorAvatar || "",
            size: 28,
            className: "vc-boards-creator__av vc-avatar",
            loading: "eager",
            alt: "",
          });
        }
      } catch (_) {}
      if (!creatorAvHtml) {
        creatorAvHtml =
          '<img class="vc-boards-creator__av vc-avatar" data-vc-avatar="1" src="' +
          B.esc(creatorAvatarUrl || "") +
          '" alt="" width="28" height="28" loading="eager" decoding="async"' +
          (ownerId ? ' data-user-id="' + B.esc(ownerId) + '"' : "") +
          (L.authorAvatar ? ' data-avatar-hash="' + B.esc(String(L.authorAvatar)) + '"' : "") +
          " />";
      }
      /* boardsCreatorMarquee1: nome in track marquee (PC, solo se overflow) */
      var creatorHtml = ownerId
        ? '<a class="vc-boards-creator" href="/user/?id=' +
          encodeURIComponent(ownerId) +
          '" title="' +
          B.esc(creatorName) +
          '">' +
          creatorAvHtml +
          '<span class="vc-boards-creator__name vc-marquee" data-vc-creator-marquee>' +
          '<span class="vc-marquee__track">' +
          '<span class="vc-marquee__text">' +
          B.esc(creatorName) +
          "</span></span></span></a>"
        : "";
      var membersRaw =
        L.stats && L.stats.members != null && L.stats.members !== ""
          ? Number(L.stats.members)
          : NaN;
      var membersN = Number.isFinite(membersRaw) ? B.fmtNum(membersRaw) : "";
      /* boardsMembersAboveTags1 + boardsListingReviews1: membri + rating medio */
      var ratingAvgN = Number(L.ratingAvg);
      var reviewsCountN = Number(L.reviewsCount) || 0;
      var hasRating = Number.isFinite(ratingAvgN) && ratingAvgN > 0 && reviewsCountN > 0;
      var ratingLabel = hasRating
        ? String(Math.round(ratingAvgN * 10) / 10).replace(/\.0$/, "")
        : "";
      var membersMetaHtml =
        membersN || hasRating
          ? '<div class="vc-boards-detail__meta">' +
            (membersN
              ? '<div class="vc-boards-detail__members" title="Membri">' +
                '<i class="fa fa-users" aria-hidden="true"></i>' +
                "<strong>" +
                B.esc(membersN) +
                "</strong>" +
                "<span>membri</span></div>"
              : "") +
            (hasRating
              ? '<div class="vc-boards-detail__rating" title="' +
                B.esc(
                  tBoard("boards.reviewsTitle", null, "Valutazioni e recensioni"),
                ) +
                '">' +
                '<i class="fa fa-star" aria-hidden="true"></i>' +
                "<strong>" +
                B.esc(ratingLabel) +
                "</strong>" +
                "<span>" +
                B.esc(
                  reviewsCountN === 1
                    ? tBoard("boards.reviewsOne", null, "recensione")
                    : tBoard("boards.reviewsMany", { n: reviewsCountN }, "recensioni"),
                ) +
                "</span></div>"
              : "") +
            "</div>"
          : "";
      /* boardsGuildTagUi2: chip Discord reale (badge CDN + colori profile) · no soft-fx */
      var guildTag = String((L.stats && L.stats.guildTag) || L.guildTag || "").trim().slice(0, 4);
      var guildTagBadgeUrl = String(
        (L.stats && (L.stats.guildTagBadgeUrl || L.stats.guildTagBadge)) ||
          L.guildTagBadgeUrl ||
          "",
      ).trim();
      if (guildTagBadgeUrl && !/^https?:\/\//i.test(guildTagBadgeUrl) && L.discordId) {
        guildTagBadgeUrl =
          "https://cdn.discordapp.com/guild-tag-badges/" +
          encodeURIComponent(String(L.discordId)) +
          "/" +
          encodeURIComponent(guildTagBadgeUrl) +
          ".png?size=64";
      }
      /* boardsGuildTagSide1: badge senza sfondo colorato sotto l’icona */
      var guildTagBadgeInner = guildTagBadgeUrl
        ? '<img class="vc-boards-guild-tag__badge" src="' +
          B.esc(guildTagBadgeUrl) +
          '" alt="" width="16" height="16" loading="lazy" decoding="async" />'
        : "";
      var guildTagChip = guildTag
        ? chipHtml(
            "vc-boards-guild-tag vc-no-sfx",
            chipHref({
              kind: exploreKind,
              type: "guildTag",
              value: guildTag,
              q: guildTag,
            }),
            (guildTagBadgeInner
              ? '<span class="vc-boards-guild-tag__badge-wrap" aria-hidden="true">' +
                guildTagBadgeInner +
                "</span>"
              : "") +
              '<span class="vc-boards-guild-tag__text">' +
              B.esc(guildTag) +
              "</span>",
            "Cerca tag Discord " + guildTag,
            { type: "guildTag", value: guildTag },
          )
        : "";
      var descHtml = B.formatDescHtml(L.description || L.markdown || "");
      /* boardsPendingWaitTxt1: titolo con classe — niente strong block su «24–48 ore» */
      var disclaimerHtml = waitingAccept
        ? '<div class="vc-boards-detail__disclaimer" role="status">' +
          '<span class="vc-boards-detail__disclaimer-ico" aria-hidden="true"><i class="fa fa-hourglass-half"></i></span>' +
          '<div class="vc-boards-detail__disclaimer-body">' +
          '<strong class="vc-boards-detail__disclaimer-title">Ancora da accettare</strong>' +
          "<p>Questa scheda è in anteprima e non è ancora pubblica in bacheca. Lo staff deve accettarla prima che sia visibile a tutti.</p>" +
          '<p>Attendi al massimo <strong class="vc-boards-detail__disclaimer-em">24–48 ore</strong>. Se non viene accettata, apri un <a href="/tickets/" class="vc-boards-detail__disclaimer-link">ticket Amministratore</a>.</p>' +
          "</div></div>"
        : "";
      var reviewBar = "";
      if (reviewMode && !ownerPreview) {
        reviewBar =
          '<div class="vc-boards-review-bar" id="vc-boards-review-bar">' +
          '<div class="vc-boards-review-bar__inner">' +
          '<div class="vc-boards-review-bar__meta">' +
          '<span class="vc-boards-review-bar__kicker">Anteprima revisione</span>' +
          "<strong>" +
          B.esc(L.name || "Scheda") +
          "</strong>" +
          "</div>" +
          '<div class="vc-boards-review-bar__acts">' +
          /* boardsReviewInboxBtn1: stesso peso di Rifiuta/Approva (niente ghost) */
          '<a class="vc-boards-btn vc-boards-btn--secondary" href="/notifications/?view=staff&amp;inbox=revisione&amp;scope=pending">' +
          '<i class="fa fa-inbox" aria-hidden="true"></i> Inbox</a>' +
          (canDecide
            ? '<button type="button" class="vc-boards-btn vc-boards-btn--danger" id="vc-boards-reject"><i class="fa fa-times" aria-hidden="true"></i> Rifiuta</button>' +
              '<button type="button" class="vc-boards-btn vc-boards-btn--primary" id="vc-boards-approve"><i class="fa fa-check" aria-hidden="true"></i> Approva</button>'
            : '<span class="vc-boards-review-bar__done">Già ' +
              B.esc(statusKey === "approved" ? "approvata" : statusKey === "rejected" ? "rifiutata" : "gestita") +
              "</span>") +
          "</div></div></div>";
      } else if (ownerPreview && waitingAccept) {
        /* boardsOwnerPendingTools1: niente barra Anteprima — controlli creator in side */
        reviewBar = "";
      }
      var hidePublicActs = reviewMode || ownerPreview;
      var bannerUrl = B.animMediaUrl
        ? B.animMediaUrl(L.bannerUrl)
        : String(L.bannerUrl || "").trim();
      /* boardsSchedaClean1: cat only side · tags sotto tagline · CTA alte · no tipo/kindrow */
      var sideCatsBlock = sideCats
        ? '<section class="vc-boards-side__sec">' +
          '<h3 class="vc-boards-side__h"><i class="fa fa-tag" aria-hidden="true"></i> Categorie</h3>' +
          '<div class="vc-boards-side__pills">' +
          sideCats +
          "</div></section>"
        : "";
      var sideLocsBlock = sideLocs
        ? '<section class="vc-boards-side__sec">' +
          '<h3 class="vc-boards-side__h"><i class="fa fa-globe" aria-hidden="true"></i> Lingue</h3>' +
          '<div class="vc-boards-side__pills">' +
          sideLocs +
          "</div></section>"
        : "";
      var sideCreatorsBlock = creatorHtml
        ? '<section class="vc-boards-side__sec">' +
          '<h3 class="vc-boards-side__h"><i class="fa fa-user" aria-hidden="true"></i> Creator</h3>' +
          '<div class="vc-boards-side__creators">' +
          creatorHtml +
          "</div></section>"
        : "";
      /* boardsFeatures1: sotto Creator */
      var feat = L.features && typeof L.features === "object" ? L.features : {};
      var featRows = [];
      featRows.push({
        label: tBoard("boards.featPaidTier", null, "Funzionalità a pagamento"),
        value:
          String(feat.paidTier || "free").toLowerCase() === "paid"
            ? tBoard("boards.featPaid", null, "A pagamento")
            : tBoard("boards.featFree", null, "Gratuito"),
      });
      if (feat.paidFeaturesAvailable) {
        featRows.push({
          label: tBoard("boards.featPaidExtra", null, "Funzioni premium opzionali"),
          value: tBoard("boards.featSupported", null, "Supportato"),
        });
      }
      if (feat.acceptsPartnerships) {
        featRows.push({
          label: tBoard("boards.featPartnerships", null, "Accetta partnership"),
          value: tBoard("boards.featSupported", null, "Supportato"),
        });
      }
      if (feat.requireVerification && String(L.kind || "") !== "bot") {
        featRows.push({
          label: tBoard("boards.featVerify", null, "Verifica all’ingresso"),
          value: tBoard("boards.featSupported", null, "Supportato"),
        });
      }
      var sideFeaturesBlock =
        '<section class="vc-boards-side__sec vc-boards-side-features">' +
        '<h3 class="vc-boards-side__h"><i class="fa fa-magic" aria-hidden="true"></i> ' +
        B.esc(tBoard("boards.featTitle", null, "Funzionalità")) +
        "</h3>" +
        '<div class="vc-boards-side__facts">' +
        featRows
          .map(function (row) {
            return (
              '<div class="vc-boards-side__fact"><span>' +
              B.esc(row.label) +
              "</span><strong>" +
              B.esc(row.value) +
              "</strong></div>"
            );
          })
          .join("") +
        "</div></section>";
      var sideSocialsBlock = sideSocials
        ? '<section class="vc-boards-side__sec">' +
          '<h3 class="vc-boards-side__h"><i class="fa fa-external-link" aria-hidden="true"></i> Social</h3>' +
          '<div class="vc-boards-side__links">' +
          sideSocials +
          "</div></section>"
        : "";
      /* boardsGuildTagSide1: guild tag in Dettagli sotto Membri */
      var sideDetailsBlock =
        membersN || guildTagChip
          ? '<section class="vc-boards-side__sec">' +
            '<h3 class="vc-boards-side__h"><i class="fa fa-info-circle" aria-hidden="true"></i> Dettagli</h3>' +
            '<div class="vc-boards-side__facts">' +
            (membersN
              ? '<div class="vc-boards-side__fact"><span>Membri</span><strong>' +
                B.esc(membersN) +
                "</strong></div>"
              : "") +
            (guildTagChip
              ? '<div class="vc-boards-side__fact vc-boards-side__fact--guild-tag"><span>Guild tag</span>' +
                guildTagChip +
                "</div>"
              : "") +
            "</div></section>"
          : "";
      var sideActivityBlock = sideActivityHtml(B, L);
      /* boardsSideCta1 + boardsShareCta1: Entra/Vota/Condividi in barra destra */
      /* boardsSharePendingOff1: Condividi off se scheda in revisione */
      var shareDisabled = statusKey === "pending";
      var shareTitle = shareDisabled
        ? B.esc(
            tBoard(
              "boards.sharePending",
              null,
              "Disponibile dopo l’approvazione della scheda",
            ),
          )
        : "";
      var sideCtaBlock =
        '<section class="vc-boards-side__sec vc-boards-side-cta">' +
        '<div class="vc-boards-side-cta__acts">' +
        /* boardsSideCtaColors1: Entra/Vota/Condividi colori distinti */
        (invite
          ? '<a class="vc-boards-btn vc-boards-btn--cta vc-boards-btn--side-join vc-no-sfx" href="' +
            B.esc(invite) +
            '" target="_blank" rel="noopener noreferrer"><i class="fa fa-sign-in" aria-hidden="true"></i> Entra</a>'
          : '<span class="vc-boards-btn vc-boards-btn--ghost vc-boards-btn--cta vc-boards-btn--side-join is-disabled" aria-disabled="true"><i class="fa fa-sign-in" aria-hidden="true"></i> Nessun invito</span>') +
        (!hidePublicActs
          ? '<a class="vc-boards-btn vc-boards-btn--cta vc-boards-btn--side-vote vc-no-sfx" id="vc-boards-vote" href="/bacheca/vota/?id=' +
            B.esc(L.id) +
            '"><i class="fa fa-thumbs-up" aria-hidden="true"></i> Vota <span>(' +
            B.esc(String(Math.max(0, Math.round(Number(L.votesMonth) || 0)))) +
            ")</span></a>"
          : '<span class="vc-boards-btn vc-boards-btn--ghost vc-boards-btn--cta vc-boards-btn--side-vote is-disabled" aria-disabled="true"><i class="fa fa-thumbs-up" aria-hidden="true"></i> Vota</span>') +
        (shareDisabled
          ? '<span class="vc-boards-btn vc-boards-btn--cta vc-boards-btn--share is-disabled" aria-disabled="true" title="' +
            shareTitle +
            '"><i class="fa fa-share-alt" aria-hidden="true"></i> Condividi</span>'
          : '<button type="button" class="vc-boards-btn vc-boards-btn--cta vc-boards-btn--share vc-no-sfx" id="vc-boards-share"><i class="fa fa-share-alt" aria-hidden="true"></i> Condividi</button>') +
        (!hidePublicActs
          ? '<button type="button" class="vc-boards-btn vc-boards-btn--cta vc-boards-btn--side-report vc-no-sfx" id="vc-boards-report"><i class="fa fa-flag" aria-hidden="true"></i> Segnala</button>'
          : "") +
        "</div></section>";
      /* boardsOwnerTools2: Creator Controls sotto CTA, sopra il resto (no Promote) */
      var sideOwnerToolsBlock = "";
      if (showOwnerTools) {
        var editHref = "/bacheca/le-mie/?id=" + encodeURIComponent(L.id);
        var isServerListing = String(L.kind || "") !== "bot";
        var ownerTitle = tBoard("boards.ownerTools", null, "Controlli creator");
        sideOwnerToolsBlock =
          '<section class="vc-boards-side__sec vc-boards-owner-tools" aria-label="' +
          B.esc(ownerTitle) +
          '">' +
          '<h3 class="vc-boards-owner-tools__title">' +
          '<i class="fa fa-sliders vc-boards-owner-tools__ico" aria-hidden="true"></i>' +
          "<span>" +
          B.esc(ownerTitle) +
          "</span></h3>" +
          /* boardsOwnerToolsIco1 */
          '<div class="vc-boards-owner-tools__acts">' +
          '<a class="vc-boards-owner-tools__btn" id="vc-boards-owner-edit" href="' +
          B.esc(editHref) +
          '"><i class="fa fa-pencil" aria-hidden="true"></i><span>' +
          B.esc(tBoard("boards.ownerEdit", null, "Modifica")) +
          "</span></a>" +
          (isServerListing
            ? '<button type="button" class="vc-boards-owner-tools__btn" id="vc-boards-owner-refresh">' +
              '<i class="fa fa-refresh" aria-hidden="true"></i><span>' +
              B.esc(tBoard("boards.ownerRefresh", null, "Aggiorna dati")) +
              "</span></button>"
            : '<button type="button" class="vc-boards-owner-tools__btn is-disabled" disabled aria-disabled="true" title="' +
              B.esc(tBoard("boards.ownerRefreshServerOnly", null, "Disponibile solo per i server")) +
              '"><i class="fa fa-refresh" aria-hidden="true"></i><span>' +
              B.esc(tBoard("boards.ownerRefresh", null, "Aggiorna dati")) +
              "</span></button>") +
          '<button type="button" class="vc-boards-owner-tools__btn' +
          (ownerAskReviewEnabled ? "" : " is-disabled") +
          '" id="vc-boards-owner-ask-review"' +
          (ownerAskReviewEnabled
            ? ""
            : ' disabled aria-disabled="true" title="' +
              B.esc(
                tBoard(
                  "boards.ownerAskReviewPending",
                  null,
                  "Disponibile dopo l’approvazione della scheda",
                ),
              ) +
              '"') +
          ">" +
          '<i class="fa fa-star-o" aria-hidden="true"></i><span>' +
          B.esc(tBoard("boards.ownerAskReview", null, "Chiedi una recensione")) +
          "</span></button>" +
          "</div></section>";
      }

      /* boardsFloatSearch1 + boardsFloatSearchMid1: barra flottante ricerca+filtri sopra banner */
      function floatOptBtn(type, value, label, optHtml) {
        var v = String(value || "").trim();
        var lab = String(label || v);
        return (
          '<button type="button" class="vc-boards-fsel__opt" role="option" data-filter-type="' +
          B.esc(type) +
          '" data-filter-value="' +
          B.esc(v) +
          '" data-filter-label="' +
          B.esc(lab) +
          '" data-filter-search="' +
          B.esc((lab + " " + v).toLowerCase()) +
          '">' +
          (optHtml || B.esc(lab)) +
          "</button>"
        );
      }
      function floatSelectHtml(type, ico, title, placeholder, listHtml) {
        return (
          '<div class="vc-boards-fsel" data-fsel="' +
          B.esc(type) +
          '">' +
          '<span class="vc-boards-fsel__caption">' +
          B.esc(title) +
          "</span>" +
          '<button type="button" class="vc-boards-fsel__btn vc-no-sfx" data-fsel-btn aria-haspopup="listbox" aria-expanded="false">' +
          '<span class="vc-boards-fsel__ico" aria-hidden="true"><i class="fa ' +
          B.esc(ico) +
          '"></i></span>' +
          '<span class="vc-boards-fsel__label is-placeholder" data-fsel-label>' +
          B.esc(placeholder) +
          "</span>" +
          '<i class="fa fa-chevron-down vc-boards-fsel__chev" aria-hidden="true"></i></button>' +
          '<div class="vc-boards-fsel__panel" data-fsel-panel hidden>' +
          '<input type="search" class="vc-boards-fsel__q" data-fsel-q placeholder="Cerca…" autocomplete="off" />' +
          '<div class="vc-boards-fsel__list" role="listbox" data-fsel-list>' +
          '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--clear" role="option" data-filter-type="' +
          B.esc(type) +
          '" data-filter-value="" data-filter-label="" data-filter-search="tutte tutte all clear">Tutte</button>' +
          listHtml +
          "</div></div></div>"
        );
      }
      var floatCatOpts = allCatsDetail
        .map(function (k) {
          return floatOptBtn("category", k, catLabels[k] || k);
        })
        .join("");
      var floatLocOpts = allLocsDetail
        .map(function (code) {
          var key = String(code || "")
            .toLowerCase()
            .replace(/[^a-z0-9\-]/g, "");
          if (!key) return "";
          var lab = locLabels[key] || key.toUpperCase();
          return floatOptBtn(
            "locale",
            key,
            lab,
            '<span class="vc-lang-flag vc-lang-flag--' +
              B.esc(key) +
              '" aria-hidden="true"></span><span>' +
              B.esc(lab) +
              "</span>",
          );
        })
        .join("");
      var floatTagSeed = (L.tags || [])
        .map(function (t) {
          var raw = String(t || "").trim();
          return raw ? floatOptBtn("tag", raw, "#" + raw) : "";
        })
        .join("");
      var floatSearchHtml =
        '<div class="vc-boards-float-search" id="vc-boards-float-search">' +
        '<div class="vc-boards-float-search__inner">' +
        '<div class="vc-boards-float-search__bar">' +
        '<i class="fa fa-search" aria-hidden="true"></i>' +
        '<input type="search" id="vc-boards-float-q" placeholder="Cerca server, tag, categorie…" autocomplete="off" />' +
        '<button type="button" class="vc-boards-float-search__filters-btn vc-no-sfx" id="vc-boards-float-filters-btn" aria-expanded="false" aria-controls="vc-boards-float-filters">' +
        '<i class="fa fa-sliders" aria-hidden="true"></i> Filtri</button>' +
        '<button type="button" class="vc-boards-float-search__go vc-no-sfx" id="vc-boards-float-go">Esplora <i class="fa fa-arrow-right" aria-hidden="true"></i></button>' +
        "</div>" +
        '<section class="vc-boards-filters vc-boards-filters--float is-collapsed" id="vc-boards-float-filters" aria-label="Filtri ricerca">' +
        '<div class="vc-boards-filters__top">' +
        '<div class="vc-boards-filters__title">' +
        '<i class="fa fa-sliders" aria-hidden="true"></i>' +
        "<div><strong>Filtri</strong><span>Categorie, lingue, tag e tag Discord</span></div></div>" +
        '<div class="vc-boards-filters__top-acts">' +
        '<div class="vc-boards-filters__active" id="vc-boards-float-filters-active" hidden></div>' +
        '<button type="button" class="vc-boards-filters__clear vc-no-sfx" id="vc-boards-float-filters-clear" hidden>Azzera</button>' +
        '<button type="button" class="vc-boards-filters__fold vc-no-sfx" id="vc-boards-float-filters-fold" aria-expanded="false" title="Espandi filtri">' +
        '<i class="fa fa-chevron-up" aria-hidden="true"></i></button>' +
        "</div></div>" +
        '<div class="vc-boards-filters__body vc-boards-filters__body--menus" id="vc-boards-float-filters-body">' +
        floatSelectHtml("category", "fa-tag", "Categorie", "Cerca categoria…", floatCatOpts) +
        floatSelectHtml("locale", "fa-globe", "Lingue", "Cerca lingua…", floatLocOpts) +
        floatSelectHtml(
          "tag",
          "fa-hashtag",
          "Tag",
          "Cerca tag…",
          floatTagSeed ||
            '<span class="vc-boards-filters__loading" data-fsel-tags-loading>Caricamento tag…</span>',
        ) +
        floatSelectHtml(
          "guildTag",
          "fa-hashtag",
          "Tag Discord",
          "Cerca tag Discord…",
          '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--create" role="option" data-filter-type="guildTag" data-filter-value="" data-filter-label="" data-filter-search="" data-guild-create hidden>Usa tag</button>' +
            '<span class="vc-boards-filters__empty" data-guild-hint>Digita fino a 4 caratteri (es. VC)</span>',
        ) +
        "</div></section></div></div>";

      root.innerHTML =
        '<div class="vc-boards-listing vc-boards-listing--scheda vc-boards-listing--page-bg vc-boards-listing--wide' +
        (reviewMode || ownerPreview ? " vc-boards-listing--review" : "") +
        (ownerPreview ? " vc-boards-listing--owner" : "") +
        (bannerUrl ? " vc-boards-listing--has-banner" : " vc-boards-listing--no-banner") +
        '">' +
        floatSearchHtml +
        '<div class="vc-boards-listing__stage">' +
        '<div class="vc-boards-detail vc-boards-detail--solid vc-boards-detail--scheda">' +
        '<article class="vc-boards-detail__main">' +
        '<div class="vc-boards-detail__body">' +
        disclaimerHtml +
        '<div class="vc-boards-detail__identity">' +
        icon +
        '<h1 class="vc-boards-detail__title">' +
        B.esc(L.name) +
        "</h1>" +
        /* boardsNoTitleGuildTag1: guild tag solo in Dettagli (side), non sotto/accanto al titolo */
        (L.tagline
          ? '<p class="vc-boards-detail__tagline vc-boards-md">' +
            B.formatDescHtml(L.tagline, { inline: true }) +
            "</p>"
          : "") +
        membersMetaHtml +
        (detailTagsHtml
          ? '<div class="vc-boards-detail__tags">' + detailTagsHtml + "</div>"
          : "") +
        "</div>" +
        (descHtml
          ? '<div class="vc-boards-detail__desc vc-boards-md">' + descHtml + "</div>"
          : '<p class="vc-boards-detail__empty">Nessuna descrizione.</p>') +
        /* boardsListingReviews1: recensioni sotto descrizione (solo approvate) */
        (statusKey === "approved" && !reviewMode
          ? '<section class="vc-boards-reviews" id="vc-boards-reviews" data-listing-id="' +
            B.esc(L.id) +
            '" aria-label="' +
            B.esc(tBoard("boards.reviewsTitle", null, "Valutazioni e recensioni")) +
            '">' +
            '<div class="vc-boards-reviews__loading" aria-hidden="true">…</div>' +
            "</section>"
          : "") +
        '<div id="vc-boards-msg" class="vc-boards-msg" hidden></div>' +
        "</div></article>" +
        '<aside class="vc-boards-detail__side vc-boards-side" aria-label="Dettagli server">' +
        /* boardsGuildTagSide1 + boardsOwnerTools1: CTA → gestione owner → … */
        sideCtaBlock +
        sideOwnerToolsBlock +
        sideActivityBlock +
        sideSocialsBlock +
        sideDetailsBlock +
        sideCatsBlock +
        sideLocsBlock +
        sideCreatorsBlock +
        sideFeaturesBlock +
        "</aside></div></div></div>" +
        reviewBar;

      var msg = document.getElementById("vc-boards-msg");
      /* boardsFloatSearch1: wire barra flottante + chip → filtro */
      (function wireSchedaFloatSearch() {
        var floatRoot = document.getElementById("vc-boards-float-search");
        var floatFilters = document.getElementById("vc-boards-float-filters");
        var floatQ = document.getElementById("vc-boards-float-q");
        var floatGo = document.getElementById("vc-boards-float-go");
        var floatFiltersBtn = document.getElementById("vc-boards-float-filters-btn");
        var floatFold = document.getElementById("vc-boards-float-filters-fold");
        var floatActive = document.getElementById("vc-boards-float-filters-active");
        var floatClear = document.getElementById("vc-boards-float-filters-clear");
        if (!floatRoot || !floatFilters) return;
        var floatState = { category: "", locale: "", tag: "", guildTag: "", q: "" };
        var floatPlaceholders = {
          category: "Cerca categoria…",
          locale: "Cerca lingua…",
          tag: "Cerca tag…",
          guildTag: "Cerca tag Discord…",
        };
        function normalizeGuildTagFloat(raw) {
          return String(raw || "")
            .replace(/^#/, "")
            .replace(/[^a-zA-Z0-9]/g, "")
            .slice(0, 4)
            .toUpperCase();
        }
        function syncGuildCreateFloat(sel, typed) {
          if (!sel) return;
          var create = sel.querySelector("[data-guild-create]");
          var hint = sel.querySelector("[data-guild-hint]");
          var g = normalizeGuildTagFloat(typed);
          if (create) {
            if (g) {
              create.hidden = false;
              create.setAttribute("data-filter-value", g);
              create.setAttribute("data-filter-label", g);
              create.setAttribute("data-filter-search", g.toLowerCase());
              create.textContent = "Usa " + g;
            } else {
              create.hidden = true;
              create.setAttribute("data-filter-value", "");
              create.setAttribute("data-filter-label", "");
              create.textContent = "Usa tag";
            }
          }
          if (hint) hint.hidden = !!g;
        }
        function closeFloatFsel() {
          var open = floatFilters.querySelectorAll(".vc-boards-fsel.is-open");
          for (var i = 0; i < open.length; i++) {
            open[i].classList.remove("is-open");
            var btn = open[i].querySelector("[data-fsel-btn]");
            var panel = open[i].querySelector("[data-fsel-panel]");
            if (btn) btn.setAttribute("aria-expanded", "false");
            if (panel) panel.hidden = true;
          }
        }
        function setFloatPanelOpen(on) {
          floatFilters.classList.toggle("is-open-panel", !!on);
          if (on) {
            floatFilters.classList.remove("is-collapsed");
            if (floatFold) {
              floatFold.setAttribute("aria-expanded", "true");
              floatFold.setAttribute("title", "Rimpicciolisci filtri");
            }
          }
          if (floatFiltersBtn) floatFiltersBtn.setAttribute("aria-expanded", on ? "true" : "false");
        }
        function setFloatCollapsed(on) {
          floatFilters.classList.toggle("is-collapsed", !!on);
          if (floatFold) {
            floatFold.setAttribute("aria-expanded", on ? "false" : "true");
            floatFold.setAttribute("title", on ? "Espandi filtri" : "Rimpicciolisci filtri");
          }
          if (!on) floatFilters.classList.add("is-open-panel");
        }
        function syncFloatFilterUi() {
          var opts = floatFilters.querySelectorAll(".vc-boards-fsel__opt[data-filter-type]");
          for (var i = 0; i < opts.length; i++) {
            var opt = opts[i];
            var t = opt.getAttribute("data-filter-type");
            var v = String(opt.getAttribute("data-filter-value") || "");
            var on =
              (t === "category" &&
                ((v && v === floatState.category) || (!v && !floatState.category))) ||
              (t === "locale" &&
                ((v && v === floatState.locale) || (!v && !floatState.locale))) ||
              (t === "tag" && ((v && v === floatState.tag) || (!v && !floatState.tag))) ||
              (t === "guildTag" &&
                ((v && v.toUpperCase() === String(floatState.guildTag || "").toUpperCase()) ||
                  (!v && !floatState.guildTag)));
            opt.classList.toggle("is-on", on);
            opt.setAttribute("aria-selected", on ? "true" : "false");
          }
          var sels = floatFilters.querySelectorAll(".vc-boards-fsel[data-fsel]");
          for (var si = 0; si < sels.length; si++) {
            var sel = sels[si];
            var key = sel.getAttribute("data-fsel");
            var labEl = sel.querySelector("[data-fsel-label]");
            if (!labEl || !floatPlaceholders[key]) continue;
            var cur = "";
            var show = "";
            if (key === "category") {
              cur = floatState.category;
              show = cur ? catLabels[cur] || cur : "";
            } else if (key === "locale") {
              cur = floatState.locale;
              show = cur ? locLabels[cur] || cur : "";
            } else if (key === "tag") {
              cur = floatState.tag;
              show = cur ? "#" + cur : "";
            } else if (key === "guildTag") {
              cur = floatState.guildTag;
              show = cur || "";
            }
            if (show) {
              labEl.textContent = show;
              labEl.classList.remove("is-placeholder");
            } else {
              labEl.textContent = floatPlaceholders[key];
              labEl.classList.add("is-placeholder");
            }
          }
          var parts = [];
          if (floatState.category) {
            parts.push(
              '<span class="vc-boards-filters__pill">' +
                B.esc(catLabels[floatState.category] || floatState.category) +
                "</span>",
            );
          }
          if (floatState.locale) {
            parts.push(
              '<span class="vc-boards-filters__pill">' +
                B.esc(locLabels[floatState.locale] || floatState.locale) +
                "</span>",
            );
          }
          if (floatState.tag) {
            parts.push(
              '<span class="vc-boards-filters__pill">#' + B.esc(floatState.tag) + "</span>",
            );
          }
          if (floatState.guildTag) {
            parts.push(
              '<span class="vc-boards-filters__pill">Discord ' +
                B.esc(floatState.guildTag) +
                "</span>",
            );
          }
          if (floatActive) {
            floatActive.innerHTML = parts.join("");
            floatActive.hidden = !parts.length;
          }
          if (floatClear) floatClear.hidden = !parts.length;
          floatFilters.classList.toggle("has-active", parts.length > 0);
          var qParts = [];
          if (floatState.category) qParts.push(catLabels[floatState.category] || floatState.category);
          if (floatState.locale) qParts.push(locLabels[floatState.locale] || floatState.locale);
          if (floatState.tag) qParts.push("#" + floatState.tag);
          if (floatState.guildTag) qParts.push(floatState.guildTag);
          if (floatQ && qParts.length) floatQ.value = qParts.join(" · ");
          floatState.q = floatQ ? String(floatQ.value || "").trim() : qParts.join(" · ");
        }
        function applyFloatFilter(type, value, label) {
          var v = String(value || "").trim();
          if (type === "category") {
            floatState.category = !v || floatState.category === v ? "" : v;
            if (!v) floatState.category = "";
          } else if (type === "locale") {
            floatState.locale = !v || floatState.locale === v ? "" : v;
            if (!v) floatState.locale = "";
          } else if (type === "tag") {
            floatState.tag = !v || floatState.tag === v ? "" : v;
            if (!v) floatState.tag = "";
          } else if (type === "guildTag") {
            var g = normalizeGuildTagFloat(v);
            floatState.guildTag =
              !g || String(floatState.guildTag || "").toUpperCase() === g ? "" : g;
            if (!g) floatState.guildTag = "";
          }
          void label;
          syncFloatFilterUi();
        }
        function exploreHrefFromFloat() {
          var params = new URLSearchParams();
          params.set("kind", exploreKind);
          if (floatState.category) params.set("category", floatState.category);
          if (floatState.locale) params.set("locale", floatState.locale);
          if (floatState.tag) params.set("tag", floatState.tag);
          if (floatState.guildTag) params.set("guildTag", floatState.guildTag);
          var qVal = floatQ ? String(floatQ.value || "").trim() : "";
          if (qVal) params.set("q", qVal);
          else if (floatState.tag) params.set("q", "#" + floatState.tag);
          else if (floatState.category) {
            params.set("q", catLabels[floatState.category] || floatState.category);
          } else if (floatState.guildTag) params.set("q", floatState.guildTag);
          return "/bacheca/?" + params.toString();
        }
        function goExplore() {
          try {
            window.location.href = exploreHrefFromFloat();
          } catch (_) {}
        }
        function pulseFloat() {
          floatRoot.classList.add("is-pulse");
          window.setTimeout(function () {
            floatRoot.classList.remove("is-pulse");
          }, 1200);
        }
        function openFloatWithFilter(type, value, qLabel) {
          setFloatPanelOpen(true);
          setFloatCollapsed(false);
          floatState.category = "";
          floatState.locale = "";
          floatState.tag = "";
          floatState.guildTag = "";
          var t = String(type || "").toLowerCase();
          var v = String(value || "").trim();
          if (t === "category") floatState.category = v;
          else if (t === "locale") floatState.locale = v;
          else if (t === "tag") floatState.tag = v;
          else if (t === "guildtag" || t === "guild_tag" || t === "discord") {
            floatState.guildTag = normalizeGuildTagFloat(v);
          }
          if (floatQ && qLabel) floatQ.value = String(qLabel);
          syncFloatFilterUi();
          try {
            floatRoot.scrollIntoView({ behavior: "smooth", block: "start" });
          } catch (_) {
            try {
              floatRoot.scrollIntoView(true);
            } catch (__) {}
          }
          try {
            if (floatQ) floatQ.focus({ preventScroll: true });
          } catch (_) {
            try {
              if (floatQ) floatQ.focus();
            } catch (__) {}
          }
          pulseFloat();
        }
        if (floatFiltersBtn) {
          floatFiltersBtn.addEventListener("click", function (e) {
            e.preventDefault();
            var open = !floatFilters.classList.contains("is-open-panel");
            setFloatPanelOpen(open);
            if (open) setFloatCollapsed(false);
          });
        }
        if (floatFold) {
          floatFold.addEventListener("click", function (e) {
            e.preventDefault();
            if (!floatFilters.classList.contains("is-open-panel")) {
              setFloatPanelOpen(true);
              setFloatCollapsed(false);
              return;
            }
            setFloatCollapsed(!floatFilters.classList.contains("is-collapsed"));
          });
        }
        if (floatClear) {
          floatClear.addEventListener("click", function () {
            floatState.category = "";
            floatState.locale = "";
            floatState.tag = "";
            floatState.guildTag = "";
            if (floatQ) floatQ.value = "";
            syncFloatFilterUi();
          });
        }
        if (floatGo) {
          floatGo.addEventListener("click", function (e) {
            e.preventDefault();
            goExplore();
          });
        }
        if (floatQ) {
          floatQ.addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
              e.preventDefault();
              goExplore();
            }
          });
        }
        floatFilters.addEventListener("click", function (e) {
          var btn = e.target && e.target.closest ? e.target.closest("[data-fsel-btn]") : null;
          if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var sel = btn.closest(".vc-boards-fsel");
            var open = sel && sel.classList.contains("is-open");
            closeFloatFsel();
            if (sel && !open) {
              sel.classList.add("is-open");
              btn.setAttribute("aria-expanded", "true");
              var panel = sel.querySelector("[data-fsel-panel]");
              if (panel) panel.hidden = false;
              var q = sel.querySelector("[data-fsel-q]");
              if (q) {
                try {
                  q.focus();
                } catch (_) {}
              }
            }
            return;
          }
          var opt =
            e.target && e.target.closest
              ? e.target.closest(".vc-boards-fsel__opt[data-filter-type]")
              : null;
          if (opt) {
            e.preventDefault();
            e.stopPropagation();
            applyFloatFilter(
              opt.getAttribute("data-filter-type"),
              opt.getAttribute("data-filter-value"),
              opt.getAttribute("data-filter-label"),
            );
            closeFloatFsel();
          }
        });
        floatFilters.addEventListener("input", function (e) {
          var q = e.target && e.target.closest ? e.target.closest("[data-fsel-q]") : null;
          if (!q) return;
          var sel = q.closest(".vc-boards-fsel");
          if (sel && sel.getAttribute("data-fsel") === "guildTag") {
            var cleaned = normalizeGuildTagFloat(q.value);
            if (q.value !== cleaned) q.value = cleaned;
            syncGuildCreateFloat(sel, cleaned);
            return;
          }
          var list = sel && sel.querySelector("[data-fsel-list]");
          if (!list) return;
          var needle = String(q.value || "")
            .trim()
            .toLowerCase();
          var items = list.querySelectorAll(".vc-boards-fsel__opt");
          for (var i = 0; i < items.length; i++) {
            var search = String(items[i].getAttribute("data-filter-search") || "").toLowerCase();
            items[i].hidden = !!(needle && search.indexOf(needle) < 0);
          }
        });
        root.addEventListener("click", function (e) {
          var a =
            e.target && e.target.closest
              ? e.target.closest("a.vc-boards-filter-chip, a.vc-boards-guild-tag")
              : null;
          if (!a || !root.contains(a)) return;
          e.preventDefault();
          var type = String(a.getAttribute("data-filter-type") || "").trim();
          var value = String(a.getAttribute("data-filter-value") || "").trim();
          var qLabel = "";
          if (!type || !value) {
            try {
              var u = new URL(a.getAttribute("href") || "", window.location.origin);
              if (u.searchParams.get("category")) {
                type = "category";
                value = u.searchParams.get("category");
              } else if (u.searchParams.get("tag")) {
                type = "tag";
                value = u.searchParams.get("tag");
              } else if (u.searchParams.get("guildTag")) {
                type = "guildTag";
                value = u.searchParams.get("guildTag");
              } else if (u.searchParams.get("locale")) {
                type = "locale";
                value = u.searchParams.get("locale");
              }
              qLabel = u.searchParams.get("q") || "";
            } catch (_) {}
          }
          if (!qLabel) {
            if (type === "tag") qLabel = "#" + value;
            else if (type === "category") qLabel = catLabels[value] || value;
            else if (type === "locale") qLabel = locLabels[value] || value;
            else qLabel = value;
          }
          if (type && value) openFloatWithFilter(type, value, qLabel);
          else {
            setFloatPanelOpen(true);
            setFloatCollapsed(false);
            if (floatQ && qLabel) floatQ.value = qLabel;
            pulseFloat();
            try {
              floatRoot.scrollIntoView({ behavior: "smooth", block: "start" });
            } catch (_) {}
          }
        });
        document.addEventListener(
          "click",
          function (e) {
            if (floatFilters.querySelector(".vc-boards-fsel.is-open")) {
              var openSel = floatFilters.querySelector(".vc-boards-fsel.is-open");
              if (openSel && !openSel.contains(e.target)) closeFloatFsel();
            }
          },
          true,
        );
        /* popola tag popolari in background */
        (async function loadFloatTags() {
          var tagList = floatFilters.querySelector('[data-fsel="tag"] [data-fsel-list]');
          if (!tagList) return;
          try {
            var out = await B.api("/tags?limit=80");
            var items = (out && (out.items || out.tags || out.results)) || [];
            if (!Array.isArray(items) || !items.length) {
              var suggested = Array.isArray(cfg && cfg.suggestedTags)
                ? cfg.suggestedTags.slice(0, 48)
                : [];
              items = suggested.map(function (t) {
                return { tag: t };
              });
            }
            items = items
              .map(function (it) {
                if (typeof it === "string") return { tag: it };
                return { tag: String(it.tag || it._id || "").trim() };
              })
              .filter(function (it) {
                return !!it.tag;
              })
              .slice(0, 80);
            var clearOpt =
              '<button type="button" class="vc-boards-fsel__opt vc-boards-fsel__opt--clear" role="option" data-filter-type="tag" data-filter-value="" data-filter-label="" data-filter-search="tutte tutte all clear">Tutte</button>';
            var seed = (L.tags || []).slice();
            var seen = {};
            var html = clearOpt;
            seed.concat(items.map(function (it) { return it.tag; })).forEach(function (raw) {
              var t = String(raw || "").trim();
              if (!t || seen[t.toLowerCase()]) return;
              seen[t.toLowerCase()] = 1;
              html += floatOptBtn("tag", t, "#" + t);
            });
            tagList.innerHTML = html;
            syncFloatFilterUi();
          } catch (_) {}
        })();
        /* assicurati GIF icona */
        try {
          var iconImg = root.querySelector(".vc-boards-detail__icon[data-vc-anim-media]");
          if (iconImg && B.animMediaUrl) {
            var cur = iconImg.getAttribute("src") || "";
            var next = B.animMediaUrl(cur, { size: 256 });
            if (next && next !== cur) iconImg.setAttribute("src", next);
          }
        } catch (_) {}
      })();
      /* boardsVoteFlow1: Vota apre /bacheca/vota/ (countdown → ad → turnstile) */
      function listingPageAbsUrl() {
        var path =
          B.listingUrl
            ? B.listingUrl(L)
            : "/bacheca/server/" + encodeURIComponent(L.id || L.slug || "") + "/";
        var origin = "";
        try {
          origin = String(window.location.origin || "").replace(/\/+$/, "");
        } catch (_) {}
        if (!origin || origin === "null" || origin.indexOf("http") !== 0) {
          origin = "https://www.viniliecaffe.it";
        }
        try {
          return new URL(path, origin + "/").href;
        } catch (_) {
          return origin + path;
        }
      }
      /* boardsShareCopy1: Condividi = copia link diretto (no share sheet che blocca il fallback) */
      async function copyTextToClipboard(text) {
        var value = String(text || "");
        if (!value) return false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(value);
            return true;
          }
        } catch (_) {}
        try {
          var ta = document.createElement("textarea");
          ta.value = value;
          ta.setAttribute("readonly", "");
          ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0;";
          document.body.appendChild(ta);
          ta.focus();
          ta.select();
          ta.setSelectionRange(0, value.length);
          var ok = document.execCommand("copy");
          document.body.removeChild(ta);
          return Boolean(ok);
        } catch (_) {}
        return false;
      }
      var shareBtn = document.getElementById("vc-boards-share");
      if (shareBtn && !shareDisabled) {
        shareBtn.addEventListener("click", async function () {
          var abs = listingPageAbsUrl();
          var copied = await copyTextToClipboard(abs);
          if (copied) {
            setMsg(msg, tBoard("boards.shareCopied", null, "Link della scheda copiato."), false);
            return;
          }
          try {
            window.prompt(tBoard("boards.shareCopyPrompt", null, "Copia il link della scheda:"), abs);
          } catch (_) {
            setMsg(msg, abs, false);
          }
        });
      }
      var reportBtn = document.getElementById("vc-boards-report");
      if (reportBtn) {
        reportBtn.addEventListener("click", async function () {
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
      }
      var ownerRefreshBtn = document.getElementById("vc-boards-owner-refresh");
      if (ownerRefreshBtn) {
        ownerRefreshBtn.addEventListener("click", async function () {
          if (!B.token()) {
            setMsg(msg, tBoard("boards.loginRequired", null, "Accedi con Discord per continuare."), true);
            return;
          }
          if (ownerRefreshBtn.getAttribute("aria-busy") === "true") return;
          ownerRefreshBtn.setAttribute("aria-busy", "true");
          ownerRefreshBtn.disabled = true;
          var prevHtml = ownerRefreshBtn.innerHTML;
          ownerRefreshBtn.innerHTML =
            '<i class="fa fa-refresh fa-spin" aria-hidden="true"></i> ' +
            B.esc(tBoard("boards.ownerRefreshBusy", null, "Aggiornamento…"));
          var r = await B.api("/me/listings/" + encodeURIComponent(L.id) + "/refresh", {
            method: "POST",
            json: {},
          });
          ownerRefreshBtn.removeAttribute("aria-busy");
          ownerRefreshBtn.disabled = false;
          ownerRefreshBtn.innerHTML = prevHtml;
          if (!r || !r.ok) {
            setMsg(msg, (r && r.message) || "Errore aggiornamento.", true);
            return;
          }
          setMsg(msg, r.message || tBoard("boards.ownerRefreshOk", null, "Dati Discord aggiornati."), false);
          try {
            await renderDetail();
          } catch (_) {
            try {
              location.reload();
            } catch (__) {}
          }
        });
      }
      var ownerAskBtn = document.getElementById("vc-boards-owner-ask-review");
      if (ownerAskBtn) {
        ownerAskBtn.addEventListener("click", async function () {
          if (ownerAskBtn.disabled || ownerAskBtn.getAttribute("aria-disabled") === "true") return;
          var abs = listingPageAbsUrl();
          var name = String(L.name || "server").trim() || "server";
          /* askReviewI18n1: aspetta pack lingua, fallback IT (non EN hardcodato) */
          try {
            if (window.VcI18n && typeof window.VcI18n.ensureLocaleBundle === "function") {
              var lang =
                typeof window.VcI18n.getLang === "function" ? window.VcI18n.getLang() : "";
              await window.VcI18n.ensureLocaleBundle(lang);
            }
          } catch (_) {}
          var text = tBoard(
            "boards.ownerAskReviewMsg",
            { name: name, url: abs },
            "Se ti piace {name}, lascia una recensione su Vinili & Caffè!\n{url}",
          );
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(text);
              setMsg(
                msg,
                tBoard("boards.ownerAskReviewCopied", null, "Messaggio copiato."),
                false,
              );
              return;
            }
          } catch (_) {}
          try {
            window.prompt(tBoard("boards.ownerAskReview", null, "Chiedi una recensione"), text);
          } catch (_) {
            setMsg(msg, text, false);
          }
        });
      }
      if (canDecide) {
        var busy = false;
        async function decide(decision) {
          if (busy) return;
          var reason = "";
          var nameLabel = String(L.name || "questa scheda").trim() || "questa scheda";
          if (decision === "reject") {
            var reasonVal = await boardsPrompt({
              title: "Rifiuta scheda",
              label: "Motivo del rifiuto (opzionale)",
              message: "Rifiutare «" + nameLabel + "»?",
              confirmLabel: "Rifiuta",
              cancelLabel: "Annulla",
              danger: true,
              icon: "fa-times-circle",
              placeholder: "Motivo…",
              defaultValue: "",
            });
            if (reasonVal == null) return;
            reason = String(reasonVal || "").trim();
          } else {
            var okApprove = await boardsConfirm({
              title: "Approva scheda",
              message: "Approvare «" + nameLabel + "» e pubblicarla in bacheca?",
              confirmLabel: "Approva",
              cancelLabel: "Annulla",
              danger: false,
              icon: "fa-check-circle",
            });
            if (!okApprove) return;
          }
          busy = true;
          var approveBtn = document.getElementById("vc-boards-approve");
          var rejectBtn = document.getElementById("vc-boards-reject");
          if (approveBtn) approveBtn.disabled = true;
          if (rejectBtn) rejectBtn.disabled = true;
          var r = await B.api("/mod/listings/" + encodeURIComponent(L.id), {
            method: "POST",
            json: { decision: decision, reason: reason },
          });
          busy = false;
          if (!r.ok) {
            if (approveBtn) approveBtn.disabled = false;
            if (rejectBtn) rejectBtn.disabled = false;
            setMsg(msg, r.message || "Errore decisione.", true);
            return;
          }
          setMsg(msg, decision === "approve" ? "Scheda approvata." : "Scheda rifiutata.", false);
          setTimeout(function () {
            try {
              location.href = "/notifications/?view=staff&inbox=revisione&scope=pending";
            } catch (_) {}
          }, 700);
        }
        var approveEl = document.getElementById("vc-boards-approve");
        var rejectEl = document.getElementById("vc-boards-reject");
        if (approveEl) {
          approveEl.addEventListener("click", function () {
            decide("approve");
          });
        }
        if (rejectEl) {
          rejectEl.addEventListener("click", function () {
            decide("reject");
          });
        }
      }
      /* boardsListingUi1: barra anteprima su body → sopra footer, fuori stacking context */
      try {
        var bar = document.getElementById("vc-boards-review-bar");
        if (bar && document.body && bar.parentNode !== document.body) {
          document.body.appendChild(bar);
        }
      } catch (_) {}
      try {
        if (document.getElementById("vc-boards-reviews")) {
          mountListingReviews(B, L);
        }
      } catch (_) {}
      /* boardsCreatorMarquee1 */
      try {
        wireBoardsCreatorMarquee();
        syncBoardsCreatorMarquees(root);
        setTimeout(function () {
          syncBoardsCreatorMarquees(root);
        }, 120);
        setTimeout(function () {
          syncBoardsCreatorMarquees(root);
        }, 500);
      } catch (_) {}
      try {
        if (B.markContentReady) B.markContentReady();
      } catch (eReady3) {}
    }

    try {
      if (B.installBoardsHeaderNav) B.installBoardsHeaderNav(page);
    } catch (_) {}

    if (page === "hub" || page === "browse" || page === "servers" || page === "bots") renderBrowse();
    else if (page === "view") renderDetail();
  }

  /* apiStaleFirst2: sync in fondo — root già nel DOM, non aspettare DCL/defer */
  try {
    if (
      document.getElementById("vc-boards-root") ||
      document.getElementById("vc-boards-grid") ||
      document.querySelector("[data-vc-boards-page]")
    ) {
      boot(0);
    } else if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        boot(0);
      });
    } else {
      boot(0);
    }
  } catch (eBoot) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        boot(0);
      });
    } else {
      boot(0);
    }
  }
})();
/* apiStaleFirst2 */

/* boardsListingUi1 */

/* boardsAnimIcon1 */

/* boardsPageBannerBg1 */

/* boardsSchedaClean1 */

/* boardsPageBgScroll1 */

/* boardsPageAccentFill1 */

/* boardsNoTitleGuildTag1 */

/* boardsGuildTagReal1 */

/* boardsListingReviews1 */

/* boardsReviewReply1 */

/* boardsSideCta1 */
/* boardsReportCtaRed1 */
/* boardsReviewsEmptyCard1 */

/* boardsAnimIcon2 */

/* boardsSocialRealIco1 */

/* boardsMembersAboveTags1 */

/* boardsSideActivity1 */

/* boardsOwnerPendingTools1 */

/* boardsOwnerToolsIco1 */

/* boardsSchedaBgFade1 */
/* boardsSchedaBgFade2 */

/* boardsPendingRedirect1 */
/* boardsPendingRedirect2 */

/* boardsAccentApply2 */
/* boardsExploreChipFilter1 */
/* boardsExploreFiltersPanel1 */
/* boardsExploreFilterSearch1 */
/* boardsExploreFiltersPanelPersist1 */
/* boardsGuildTagFsel1 */
/* boardsHubGateFix1 */
/* boardsGuildTagTutteDup1 */
/* boardsNoStaticHub1 */
