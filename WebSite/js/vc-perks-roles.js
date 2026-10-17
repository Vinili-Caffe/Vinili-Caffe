/**
 * perksIcoNoFlash1: MO/i18n non devono ripaintare chip già stabili (style thrash = flash icone).
 * perksVerifyIcoKeep3: verify selfie fuori i18n-html + sync su vc:langchange.
 * perksRoleIcoKeep2: mai remount img ruolo.
 */
(function () {
  var VER = "20261014perksIcoNoFlash1";
  if (window.__VC_PERKS_ROLES === VER) return;
  window.__VC_PERKS_ROLES = VER;

  var API = "/webhooks/site-roles?catalog=mentions";
  var catalog = null;
  var byId = Object.create(null);
  var byKey = Object.create(null);
  var painting = false;

  function ensureCss() {
    var st = document.getElementById("vc-perks-roles-css");
    if (!st) {
      st = document.createElement("style");
      st.id = "vc-perks-roles-css";
      (document.head || document.documentElement).appendChild(st);
    }
    st.setAttribute("data-vc", VER);
    st.textContent =
      ".vc-sponsor-mention{display:inline-flex!important;align-items:center!important;gap:.28em!important}" +
      ".vc-perks-tier-acc__and{opacity:.75;font-weight:700}" +
      ".vc-sponsor-mention .vc-perks-role-ico," +
      ".vc-sponsor-mention img.vc-perks-role-ico," +
      "img.vc-perks-role-ico{" +
      "width:1.15em!important;height:1.15em!important;max-width:1.25em!important;max-height:1.25em!important;" +
      "border-radius:.22em!important;object-fit:contain!important;object-position:center!important;" +
      "flex:0 0 auto!important;display:inline-block!important;vertical-align:-.15em!important;margin:0!important;" +
      "background:transparent!important;background-color:transparent!important;background-image:none!important;" +
      "opacity:1!important;box-shadow:none!important;filter:none!important;" +
      "transition:none!important;animation:none!important;transform:none!important;" +
      "image-rendering:auto!important;content-visibility:visible!important}" +
      ".vc-sponsor-mention .vc-perks-role-swatch{" +
      "width:.72em!important;height:.72em!important;border-radius:999px!important;flex:0 0 auto!important;" +
      "display:inline-block!important;box-shadow:inset 0 0 0 1px rgba(255,247,236,.22)!important}" +
      ".vc-sponsor-mention .vc-perks-role-label{min-width:0}" +
      ".vc-perks-tier-acc__headline .vc-sponsor-mention{max-width:100%}" +
      "body.vc-donazioni-page .vc-support-donate-role__head{flex-direction:column!important;align-items:center!important;justify-content:center!important;text-align:center!important;gap:.55rem!important}" +
      "body.vc-donazioni-page .vc-support-donate-role__title{display:flex!important;align-items:center!important;justify-content:center!important;flex-wrap:wrap!important;gap:.4rem!important;min-width:0!important;width:100%!important;text-align:center!important;font-size:1.55rem!important}" +
      "body.vc-donazioni-page .vc-support-donate-role__title .vc-sponsor-mention{" +
      "font-size:1.22rem!important;font-weight:800!important;line-height:1.2!important;" +
      "padding:.34rem .9rem!important;border-radius:.65rem!important;" +
      "max-width:100%!important;min-width:0!important;justify-content:center!important;margin:0 auto!important}" +
      "body.vc-donazioni-page .vc-support-donate-role__head .vc-support-donate-role__price{margin-left:0!important;align-self:center!important;text-align:center!important;transform:none!important}" +
      "body.vc-donazioni-page .vc-support-donate-role__title .vc-perks-role-label{" +
      "overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}" +
      "body.vc-donazioni-page .vc-support-donate-role__title .vc-perks-role-ico," +
      "body.vc-donazioni-page .vc-support-donate-role__title img.vc-perks-role-ico{" +
      "width:1.35em!important;height:1.35em!important;max-width:1.5em!important;max-height:1.5em!important}";
  }

  function esc(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function foldKey(name) {
    var s = String(name || "");
    try {
      s = s.normalize("NFKC");
    } catch (eN) {}
    s = s.replace(/^@+/, "");
    s = s.replace(/[\u0F00-\u0FFF]/g, "");
    s = s.replace(/[\u200B-\u200F\uFEFF]/g, "");
    s = s.replace(/\s+/g, " ").trim().toLowerCase();
    return s;
  }

  function indexCatalog(roles) {
    byId = Object.create(null);
    byKey = Object.create(null);
    for (var i = 0; i < roles.length; i++) {
      var r = roles[i];
      if (!r) continue;
      var id = String(r.id || "").trim();
      var name = String(r.name || "").trim();
      if (id) byId[id] = r;
      var k = foldKey(name);
      if (k && !byKey[k]) byKey[k] = r;
    }
  }

  function matchRole(el) {
    if (!el) return null;
    var rid = String(el.getAttribute("data-vc-role-id") || "").trim();
    if (rid && byId[rid]) return byId[rid];
    var parent = el.closest && el.closest("[data-vc-role-id]");
    if (parent) {
      rid = String(parent.getAttribute("data-vc-role-id") || "").trim();
      if (rid && byId[rid]) return byId[rid];
    }
    var label = el.querySelector(".vc-perks-role-label");
    var text = String((label && label.textContent) || el.textContent || "").replace(/\s+/g, " ").trim();
    var k = foldKey(text);
    if (k && byKey[k]) return byKey[k];
    return null;
  }

  function roleIconUrl(role) {
    return String((role && role.iconUrl) || "").trim();
  }

  function applyChipStyles(el, role) {
    try {
      var roleColor = String((role && role.color) || "").trim();
      if (!roleColor) return;
      var roleId = String((role && role.id) || "").trim();
      var sig = roleId + "|" + roleColor;
      if (el.getAttribute("data-vc-role-style") === sig) return;
      el.setAttribute("data-vc-role-style", sig);
      el.style.setProperty("--vc-role-chip", roleColor);
      el.style.color = roleColor;
      el.style.background =
        "color-mix(in srgb, " + roleColor + " 26%, rgba(15, 23, 42, 0.55))";
      el.style.border = "1px solid color-mix(in srgb, " + roleColor + " 48%, transparent)";
      el.style.boxShadow = "none";
    } catch (eCol) {}
  }

  function iconHtml(role) {
    var url = roleIconUrl(role);
    var emoji = String((role && role.emoji) || "").trim();
    if (/^https?:\/\//i.test(url)) {
      return (
        /* loadSyncPack1: no data-vc-anim-media — keep still frame */
      '<img class="vc-perks-role-ico" src="' +
        esc(url) +
        '" alt="" width="16" height="16" decoding="sync" fetchpriority="low" referrerpolicy="no-referrer" data-vc-emoji-skip="1" data-vc-avatar="0" />'
      );
    }
    if (emoji) {
      return (
        '<span class="vc-perks-role-ico" aria-hidden="true" data-vc-emoji-skip="1">' +
        esc(emoji) +
        "</span>"
      );
    }
    var color = String((role && role.color) || "").trim() || "#f7ecdf";
    return (
      '<span class="vc-perks-role-swatch" aria-hidden="true" style="background:' +
      esc(color) +
      '"></span>'
    );
  }

  function stripAvatarClasses(root) {
    try {
      var imgs = (root || document).querySelectorAll("img.vc-perks-role-ico");
      for (var i = 0; i < imgs.length; i++) {
        var img = imgs[i];
        img.setAttribute("data-vc-avatar", "0");
        img.removeAttribute("loading");
        img.classList.remove("vc-avatar", "vc-avatar--pending", "vc-avatar--ready", "vc-avatar-fallback-img");
      }
    } catch (eStrip) {}
  }

  function hasRoleGlyph(el) {
    return !!(
      el.querySelector("img.vc-perks-role-ico") ||
      el.querySelector(".vc-perks-role-swatch") ||
      el.querySelector("span.vc-perks-role-ico")
    );
  }

  function paintMention(el, role) {
    if (!el || !role) return;
    el.setAttribute("data-vc-emoji-skip", "1");
    var roleId = String(role.id || "").trim();
    var prevRoleId = String(el.getAttribute("data-vc-role-id") || "").trim();
    if (roleId) el.setAttribute("data-vc-role-id", roleId);
    var name = String(role.name || "").trim();
    if (!name) return;
    var wantAt =
      /^@/.test(String(el.getAttribute("data-vc-role-label") || "").trim()) ||
      el.getAttribute("data-vc-role-at") === "1";
    if (!wantAt) {
      var rawTxt = String(el.textContent || "").trim();
      if (/^@/.test(rawTxt) && !el.querySelector(".vc-perks-role-label")) wantAt = true;
    }
    var label = (wantAt && name.charAt(0) !== "@" ? "@" : "") + name;
    var existingImg = el.querySelector("img.vc-perks-role-ico");
    var existingLabel = el.querySelector(".vc-perks-role-label");
    var sameRole = !roleId || !prevRoleId || prevRoleId === roleId;
    var already =
      el.getAttribute("data-vc-perks-role") === VER &&
      sameRole &&
      hasRoleGlyph(el) &&
      existingLabel &&
      String(existingLabel.textContent || "") === label;

    /* perksIcoNoFlash1: chip stabile → zero touch (niente style/strip = no flash) */
    if (already) return;

    if (sameRole && hasRoleGlyph(el) && existingLabel) {
      if (String(existingLabel.textContent || "") !== label) existingLabel.textContent = label;
      el.setAttribute("data-vc-role-label", label);
      el.setAttribute("data-vc-perks-role", VER);
      if (existingImg) {
        existingImg.setAttribute("data-vc-avatar", "0");
        /* loadSyncPack1: no anim-media attr on existing img — keep still */
        existingImg.removeAttribute("loading");
        var wantSrc = roleIconUrl(role);
        var curSrc = String(existingImg.getAttribute("src") || "");
        if (
          wantSrc &&
          curSrc &&
          curSrc !== wantSrc &&
          curSrc.replace(/\.webp(\?|$)/i, ".gif$1") !== wantSrc.replace(/\.webp(\?|$)/i, ".gif$1")
        ) {
          existingImg.setAttribute("src", wantSrc);
        }
      }
      applyChipStyles(el, role);
      stripAvatarClasses(el);
      return;
    }

    el.setAttribute("data-vc-role-label", label);
    painting = true;
    try {
      el.innerHTML =
        iconHtml(role) +
        '<span class="vc-perks-role-label" data-vc-emoji-skip="1">' +
        esc(label) +
        "</span>";
      stripAvatarClasses(el);
      el.setAttribute("data-vc-perks-role", VER);
      applyChipStyles(el, role);
    } finally {
      painting = false;
    }
  }

  function expandCompoundMentions() {
    if (!catalog || !catalog.length) return;
    var nodes = document.querySelectorAll(
      "body.vc-perks-page .vc-sponsor-mention, .vc-perks-page .vc-sponsor-mention, .vc-sponsor-mention",
    );
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el || el.getAttribute("data-vc-perks-role") === VER) continue;
      if (el.querySelector(".vc-perks-role-label")) continue;
      var raw = String(el.textContent || "").replace(/\s+/g, " ").trim();
      if (raw.indexOf("&") < 0) continue;
      if (matchRole(el)) continue;
      var parts = raw.split(/\s*&\s*/);
      if (parts.length < 2) continue;
      var roles = [];
      var ok = true;
      for (var p = 0; p < parts.length; p++) {
        var role = byKey[foldKey(parts[p])];
        if (!role) {
          ok = false;
          break;
        }
        roles.push(role);
      }
      if (!ok || roles.length < 2) continue;
      var parent = el.parentNode;
      if (!parent) continue;
      painting = true;
      try {
        var frag = document.createDocumentFragment();
        for (var r = 0; r < roles.length; r++) {
          if (r > 0) {
            var sep = document.createElement("span");
            sep.className = "vc-perks-tier-acc__and";
            sep.setAttribute("aria-hidden", "true");
            sep.textContent = " & ";
            frag.appendChild(sep);
          }
          var chip = document.createElement("span");
          chip.className = "vc-sponsor-mention";
          chip.setAttribute("data-vc-emoji-skip", "1");
          var nm = String(roles[r].name || "");
          chip.textContent = nm;
          frag.appendChild(chip);
          paintMention(chip, roles[r]);
        }
        parent.replaceChild(frag, el);
      } finally {
        painting = false;
      }
    }
  }

  function pageWantsRolePaint() {
    try {
      var path = String(location.pathname || "");
      if (/\/perks\/?$/i.test(path) || document.body.classList.contains("vc-perks-page")) return true;
      if (/\/donazioni\/?$/i.test(path) || document.body.classList.contains("vc-donazioni-page")) return true;
    } catch (eP) {}
    return false;
  }

  function needsPaint(el) {
    if (!el) return false;
    if (el.getAttribute("data-vc-perks-role") !== VER) return true;
    if (!hasRoleGlyph(el)) return true;
    if (!el.querySelector(".vc-perks-role-label")) return true;
    return false;
  }

  function applyAll() {
    if (!catalog || !catalog.length) return;
    if (painting) return;
    ensureCss();
    if (!pageWantsRolePaint()) return;
    expandCompoundMentions();
    var nodes = document.querySelectorAll(
      "body.vc-perks-page .vc-sponsor-mention, .vc-perks-page .vc-sponsor-mention," +
        "body.vc-donazioni-page .vc-sponsor-mention, .vc-donazioni-page .vc-sponsor-mention," +
        ".vc-sponsor-mention",
    );
    var touched = false;
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (!el) continue;
      if (!needsPaint(el)) continue;
      var role = matchRole(el);
      if (!role) continue;
      paintMention(el, role);
      touched = true;
    }
    if (touched) stripAvatarClasses(document);
  }

  function loadCatalog() {
    return fetch(API, { credentials: "omit", cache: "default" })
      .then(function (r) {
        if (!r || !r.ok) throw new Error("roles");
        return r.json();
      })
      .then(function (data) {
        var roles = (data && data.roles) || [];
        if (!Array.isArray(roles) || !roles.length) return;
        catalog = roles;
        indexCatalog(roles);
        applyAll();
      })
      .catch(function () {});
  }

  function boot() {
    ensureCss();
    try {
      document.querySelectorAll(".vc-sponsor-mention, .vc-perks-tier-acc__headline").forEach(function (el) {
        el.setAttribute("data-vc-emoji-skip", "1");
      });
    } catch (eSkip) {}
    loadCatalog();
    function onI18n() {
      applyAll();
    }
    document.addEventListener("vc:i18n", onI18n);
    document.addEventListener("vc:i18n-ready", onI18n);
    document.addEventListener("vc:langchange", onI18n);
    try {
      var moT = 0;
      var mo = new MutationObserver(function (muts) {
        if (painting) return;
        var dirty = false;
        for (var mi = 0; mi < muts.length && !dirty; mi++) {
          var m = muts[mi];
          if (!m) continue;
          var nodes = m.addedNodes;
          for (var ni = 0; ni < nodes.length; ni++) {
            var n = nodes[ni];
            if (!n || n.nodeType !== 1) continue;
            if (n.classList && n.classList.contains("vc-sponsor-mention") && needsPaint(n)) {
              dirty = true;
              break;
            }
            if (n.querySelectorAll) {
              var found = n.querySelectorAll(".vc-sponsor-mention");
              for (var fi = 0; fi < found.length; fi++) {
                if (needsPaint(found[fi])) {
                  dirty = true;
                  break;
                }
              }
            }
          }
        }
        if (!dirty) return;
        if (moT) return;
        moT = window.setTimeout(function () {
          moT = 0;
          applyAll();
        }, 160);
      });
      mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
    } catch (eMo) {}
  }

  window.VcPerksRoles = {
    ver: VER,
    apply: applyAll,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
