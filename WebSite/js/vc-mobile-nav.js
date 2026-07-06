(function () {
  var DRAWER_ID = "vc-mobile-nav-drawer";
  var TOGGLE_ID = "vc-mobile-nav-toggle";
  var BODY_OPEN_CLASS = "vc-mobile-nav-open";
  var mq = null;
  var drawer = null;
  var toggle = null;
  var backdrop = null;
  var focusPrev = null;
  var onEscapeDrawer = null;

  function getMq() {
    if (!mq) {
      mq = window.matchMedia("(max-width: 639.98px)");
    }
    return mq;
  }

  function isMobile() {
    try {
      return getMq().matches;
    } catch (e) {
      return (window.innerWidth || 999) <= 640;
    }
  }

  function closeNotifDropdown() {
    var d = document.getElementById("vc-notif-dropdown");
    if (d) d.removeAttribute("open");
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "true");
    if (toggle) toggle.setAttribute("aria-expanded", "false");
    try {
      document.documentElement.classList.remove(BODY_OPEN_CLASS);
    } catch (e0) {}
    if (onEscapeDrawer) {
      document.removeEventListener("keydown", onEscapeDrawer);
      onEscapeDrawer = null;
    }
    if (focusPrev && typeof focusPrev.focus === "function") {
      try {
        focusPrev.focus();
      } catch (e1) {}
    }
    focusPrev = null;
  }

  function openDrawer() {
    if (!drawer) return;
    closeNotifDropdown();
    rebuildGrid();
    syncDrawerFooter();
    drawer.classList.add("vc-mobile-nav-drawer--open");
    drawer.setAttribute("aria-hidden", "false");
    if (toggle) toggle.setAttribute("aria-expanded", "true");
    focusPrev = document.activeElement;
    try {
      document.documentElement.classList.add(BODY_OPEN_CLASS);
    } catch (e2) {}
    onEscapeDrawer = function (ev) {
      if (ev.key === "Escape") {
        ev.preventDefault();
        closeDrawer();
      }
    };
    document.addEventListener("keydown", onEscapeDrawer);
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) {
      window.requestAnimationFrame(function () {
        try {
          closeBtn.focus();
        } catch (e3) {}
      });
    }
  }

  function mobileAvatarUrl(u) {
    if (!u || !u.id) return "";
    if (u.avatar) {
      var ext = String(u.avatar).indexOf("a_") === 0 ? "gif" : "png";
      return "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + "." + ext + "?size=64";
    }
    if (typeof BigInt === "undefined") return "";
    try {
      var bi = BigInt(String(u.id));
      var idx = Number((bi >> 22n) % 6n);
      return "https://cdn.discordapp.com/embed/avatars/" + idx + ".png";
    } catch (e4) {
      return "";
    }
  }

  function mobileProfileHref(userId) {
    var id = String(userId || "").trim();
    return id ? "/users/" + encodeURIComponent(id) : "/user";
  }

  function syncDrawerFooter() {
    var foot = document.getElementById("vc-mobile-nav-drawer-footer");
    if (!foot) return;
    foot.innerHTML = "";
    var profile = window.__VC_DISCORD_PROFILE;
    var logoutBtn = document.getElementById("discord-logout-btn");
    var loginBtn = document.getElementById("discord-login-btn");
    if (profile && logoutBtn) {
      var wrap = document.createElement("div");
      wrap.className = "vc-mobile-nav-footer__account";
      var imgUrl = mobileAvatarUrl(profile);
      var name = String(profile.username || "Utente").trim() || "Utente";
      var left = document.createElement("div");
      left.className = "vc-mobile-nav-footer__account-start";
      if (imgUrl) {
        var im = document.createElement("img");
        im.className = "vc-mobile-nav-footer__avatar";
        im.src = imgUrl;
        im.alt = "";
        im.width = 40;
        im.height = 40;
        im.decoding = "async";
        left.appendChild(im);
      } else {
        var fb = document.createElement("span");
        fb.className = "vc-mobile-nav-footer__avatar vc-mobile-nav-footer__avatar--fb";
        fb.setAttribute("aria-hidden", "true");
        fb.innerHTML = '<i class="fa fa-user"></i>';
        left.appendChild(fb);
      }
      var meta = document.createElement("div");
      meta.className = "vc-mobile-nav-footer__meta";
      var nm = document.createElement("span");
      nm.className = "vc-mobile-nav-footer__name";
      nm.textContent = name;
      meta.appendChild(nm);
      var prof = document.createElement("a");
      prof.className = "vc-mobile-nav-footer__profile";
      prof.href = mobileProfileHref(profile.id);
      prof.textContent = "Profilo";
      meta.appendChild(prof);
      var lo = document.createElement("button");
      lo.type = "button";
      lo.className = "vc-mobile-nav-footer__logout";
      lo.textContent = "Logout";
      lo.addEventListener("click", function () {
        logoutBtn.click();
        closeDrawer();
      });
      wrap.appendChild(left);
      wrap.appendChild(meta);
      wrap.appendChild(lo);
      foot.appendChild(wrap);
      return;
    }
    if (loginBtn && !loginBtn.hidden) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "vc-mobile-nav-footer__login";
      b.textContent = "LOGIN";
      b.addEventListener("click", function () {
        if (typeof window.__vcDiscordStartOAuthRedirect === "function") {
          window.__vcDiscordStartOAuthRedirect(b);
          closeDrawer();
          return;
        }
        loginBtn.click();
      });
      foot.appendChild(b);
    }
  }

  function sectionLabel(text) {
    return String(text || "")
      .trim()
      .toUpperCase();
  }

  function navItemHidden(el) {
    return !el || el.hidden || el.hasAttribute("hidden");
  }

  function createTileFromRow(row) {
    if (navItemHidden(row)) return null;
    var href = row.getAttribute("href");
    if (!href) return null;
    var target = row.getAttribute("target");
    var rel = row.getAttribute("rel");
    var dvl = row.getAttribute("data-vc-loading");
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    if (target) a.setAttribute("target", target);
    if (rel) a.setAttribute("rel", rel);
    if (dvl) a.setAttribute("data-vc-loading", dvl);
    var icoWrap = row.querySelector(".vc-snav-row-ico");
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    if (icoWrap) ico.innerHTML = icoWrap.innerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var spans = row.querySelectorAll("span");
    var labelText = "";
    var j;
    for (j = 0; j < spans.length; j += 1) {
      if (spans[j].classList.contains("vc-snav-row-ico")) continue;
      labelText = spans[j].textContent || "";
      if (labelText) break;
    }
    if (!labelText) labelText = String(row.textContent || "").trim();
    lab.textContent = labelText;
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function createTileFromItem(item) {
    if (navItemHidden(item)) return null;
    var href = item.getAttribute("href");
    if (!href) return null;
    var a = document.createElement("a");
    a.className = "vc-mobile-nav-tile";
    a.href = href;
    var ico = document.createElement("span");
    ico.className = "vc-mobile-nav-tile-ico";
    ico.setAttribute("aria-hidden", "true");
    var fi = item.querySelector("i.fa");
    if (fi) ico.innerHTML = fi.outerHTML;
    var lab = document.createElement("span");
    lab.className = "vc-mobile-nav-tile-label";
    var innerSpan = item.querySelector("span");
    lab.textContent = innerSpan ? String(innerSpan.textContent || "").trim() : String(item.textContent || "").trim();
    a.appendChild(ico);
    a.appendChild(lab);
    a.addEventListener("click", function () {
      closeDrawer();
    });
    return a;
  }

  function groupSectionTitle(nav, groupIndex) {
    var aria = nav && nav.getAttribute("aria-label");
    if (aria && /evento/i.test(String(aria))) {
      return groupIndex === 0 ? "SITO" : sectionLabel(aria);
    }
    return "PRINCIPALE";
  }

  function rebuildGrid() {
    var gridRoot = document.getElementById("vc-mobile-nav-drawer-grid");
    var nav = document.querySelector("nav.vc-header-snav");
    if (!gridRoot || !nav) return;
    gridRoot.innerHTML = "";
    var kids = nav.children;
    var groupIndex = 0;
    var i = 0;
    while (i < kids.length) {
      var el = kids[i];
      if (!el || el.tagName === "SPAN") {
        i += 1;
        continue;
      }
      if (el.tagName === "A" && el.classList.contains("vc-snav-item")) {
        var sec = document.createElement("section");
        sec.className = "vc-mobile-nav-section";
        var h = document.createElement("h3");
        h.className = "vc-mobile-nav-section-title";
        h.textContent = groupSectionTitle(nav, groupIndex);
        groupIndex += 1;
        var g = document.createElement("div");
        g.className = "vc-mobile-nav-grid";
        while (i < kids.length) {
          var el2 = kids[i];
          if (!el2 || el2.tagName === "SPAN") {
            i += 1;
            continue;
          }
          if (!(el2.tagName === "A" && el2.classList.contains("vc-snav-item"))) break;
          var t = createTileFromItem(el2);
          if (t) g.appendChild(t);
          i += 1;
        }
        if (!g.children.length) continue;
        sec.appendChild(h);
        sec.appendChild(g);
        gridRoot.appendChild(sec);
        continue;
      }
      if (el.tagName === "DETAILS" && el.classList.contains("vc-snav-details")) {
        var sum = el.querySelector(".vc-snav-summary");
        var titleTxt = "MENU";
        if (sum) {
          var sp = sum.querySelector("span");
          titleTxt = sectionLabel(sp ? sp.textContent : sum.textContent);
        }
        var sec2 = document.createElement("section");
        sec2.className = "vc-mobile-nav-section";
        var h2 = document.createElement("h3");
        h2.className = "vc-mobile-nav-section-title";
        h2.textContent = titleTxt;
        var g2 = document.createElement("div");
        g2.className = "vc-mobile-nav-grid";
        var rows = el.querySelectorAll(".vc-snav-panel .vc-snav-row");
        var r;
        for (r = 0; r < rows.length; r += 1) {
          var tile = createTileFromRow(rows[r]);
          if (tile) g2.appendChild(tile);
        }
        if (!g2.children.length) {
          i += 1;
          continue;
        }
        sec2.appendChild(h2);
        sec2.appendChild(g2);
        gridRoot.appendChild(sec2);
      }
      i += 1;
    }
  }

  function cloneBrand(intoEl) {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar || !intoEl) return;
    var brandSource = bar.children[0];
    intoEl.innerHTML = "";
    if (!brandSource) return;
    var clone = brandSource.cloneNode(true);
    var walks = clone.querySelectorAll("[id]");
    var w;
    for (w = 0; w < walks.length; w += 1) {
      walks[w].removeAttribute("id");
    }
    intoEl.appendChild(clone);
  }

  function onMqChange() {
    if (!isMobile()) closeDrawer();
  }

  function ensure() {
    if (document.getElementById(TOGGLE_ID)) return;
    var quick = document.getElementById("header-quick-actions");
    var bar = document.querySelector(".vc-header-bar");
    if (!quick || !bar) return;
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = TOGGLE_ID;
    toggle.className = "vc-mobile-nav-toggle vc-icon-btn";
    toggle.setAttribute("aria-label", "Apri menu di navigazione");
    toggle.setAttribute("aria-controls", DRAWER_ID);
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML =
      '<span class="vc-mobile-nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>';
    var notif = document.getElementById("vc-notif-dropdown");
    if (notif) {
      if (notif.nextSibling) quick.insertBefore(toggle, notif.nextSibling);
      else quick.appendChild(toggle);
    } else {
      quick.insertBefore(toggle, quick.firstChild);
    }
    drawer = document.createElement("div");
    drawer.id = DRAWER_ID;
    drawer.className = "vc-mobile-nav-drawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Menu di navigazione");
    drawer.setAttribute("aria-hidden", "true");
    drawer.innerHTML =
      '<div class="vc-mobile-nav-drawer__backdrop" tabindex="-1"></div>' +
      '<div class="vc-mobile-nav-drawer__panel">' +
      '<div class="vc-mobile-nav-drawer__top">' +
      '<div class="vc-mobile-nav-drawer__brand" id="vc-mobile-nav-drawer-brand"></div>' +
      '<div class="vc-mobile-nav-drawer__top-actions">' +
      '<button type="button" class="vc-mobile-nav-drawer__close vc-icon-btn" id="vc-mobile-nav-close" aria-label="Chiudi menu"><i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</div></div>" +
      '<div class="vc-mobile-nav-drawer__scroll" id="vc-mobile-nav-drawer-grid"></div>' +
      '<div class="vc-mobile-nav-drawer__footer" id="vc-mobile-nav-drawer-footer"></div>' +
      "</div>";
    document.body.appendChild(drawer);
    backdrop = drawer.querySelector(".vc-mobile-nav-drawer__backdrop");
    cloneBrand(document.getElementById("vc-mobile-nav-drawer-brand"));
    rebuildGrid();
    toggle.addEventListener("click", function () {
      if (drawer.classList.contains("vc-mobile-nav-drawer--open")) closeDrawer();
      else openDrawer();
    });
    var closeBtn = document.getElementById("vc-mobile-nav-close");
    if (closeBtn) closeBtn.addEventListener("click", closeDrawer);
    if (backdrop) backdrop.addEventListener("click", closeDrawer);
    window.addEventListener("vc-discord-profile", function () {
      syncDrawerFooter();
    });
    document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
      if (drawer && drawer.classList.contains("vc-mobile-nav-drawer--open")) rebuildGrid();
    });
  }

  function init() {
    ensure();
    var m = getMq();
    if (m.addEventListener) m.addEventListener("change", onMqChange);
    else if (m.addListener) m.addListener(onMqChange);
    syncDrawerFooter();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();