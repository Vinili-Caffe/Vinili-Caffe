/**
 * Modale gestione staff — sostituisce /staff/gestione/ con sheet sul profilo.
 */
(function (global) {
  "use strict";

  var ASSET_VER = "20260830selfNeg1";
  var scriptsLoaded = false;
  var scriptsLoading = null;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function closeManageSheet() {
    var sheet = global.document.getElementById("vc-staff-manage-sheet");
    if (sheet) sheet.remove();
    try {
      global.document.documentElement.classList.remove("vc-staff-manage-sheet-open");
    } catch (e) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcUnpinPageScroll === "function") global.__vcUnpinPageScroll();
    } catch (eUnpin) {}
    if (global.VCStaffManagePanel && typeof global.VCStaffManagePanel.closeModal === "function") {
      global.VCStaffManagePanel.closeModal();
    }
  }

  function loadScript(src, attr) {
    return new Promise(function (resolve, reject) {
      if (global.document.querySelector("script[" + attr + "]")) {
        resolve();
        return;
      }
      var s = global.document.createElement("script");
      s.src = src;
      s.async = false;
      s.setAttribute(attr, "1");
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        reject(new Error("script " + src));
      };
      (global.document.head || global.document.documentElement).appendChild(s);
    });
  }

  function ensureManageScripts() {
    if (scriptsLoaded && global.VCStaffManagePanel) return Promise.resolve();
    if (scriptsLoading) return scriptsLoading;
    scriptsLoading = Promise.resolve()
      .then(function () {
        if (!global.VCStaffTools) {
          return loadScript("/js/staff-tools-common.js?v=" + ASSET_VER, "data-vc-staff-tools-common");
        }
      })
      .then(function () {
        if (!global.VcDialog && !global.document.querySelector('script[data-vc-dialog="1"]')) {
          return loadScript("/js/vc-dialog.js?v=" + ASSET_VER, "data-vc-dialog");
        }
      })
      .then(function () {
        if (!global.VCStaffManagePanel) {
          return loadScript("/js/staff-manage-page.js?v=" + ASSET_VER, "data-vc-staff-manage-page");
        }
      })
      .then(function () {
        scriptsLoaded = true;
      });
    return scriptsLoading;
  }

  function openManageSheet(userId, opts) {
    opts = opts || {};
    var uid = String(userId || "").trim();
    if (!/^\d{17,20}$/.test(uid)) return Promise.reject(new Error("invalid user"));

    closeManageSheet();

    var wrap = global.document.createElement("div");
    wrap.id = "vc-staff-manage-sheet";
    wrap.className = "vc-staff-manage-sheet";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.setAttribute("aria-label", "Gestione staff");
    wrap.innerHTML =
      '<button type="button" class="vc-staff-manage-sheet__backdrop" data-manage-close="1" aria-label="Chiudi"></button>' +
      '<div class="vc-staff-manage-sheet__panel">' +
      '<header class="vc-staff-manage-sheet__head">' +
      '<div class="vc-staff-manage-sheet__head-copy">' +
      '<span class="vc-staff-manage-sheet__kicker"><i class="fa fa-sliders" aria-hidden="true"></i> Gestione carriera</span>' +
      '<h2 class="vc-staff-manage-sheet__title">Pex &amp; Depex</h2>' +
      "</div>" +
      '<button type="button" class="vc-staff-manage-sheet__close" data-manage-close="1" aria-label="Chiudi">' +
      '<i class="fa fa-times" aria-hidden="true"></i></button>' +
      "</header>" +
      '<div class="vc-staff-manage-sheet__body">' +
      '<div id="vc-staff-manage-detail" class="vc-staff-manage-detail vc-staff-manage-detail--modal"></div>' +
      "</div></div>";

    wrap.addEventListener("click", function (ev) {
      if (ev.target && ev.target.closest && ev.target.closest("[data-manage-close]")) {
        closeManageSheet();
      }
    });

    global.document.body.appendChild(wrap);
    try {
      global.document.documentElement.classList.add("vc-staff-manage-sheet-open");
    } catch (eOpen) {}
    try {
      if (typeof global.__vcSyncLoaderScrollLock === "function") global.__vcSyncLoaderScrollLock();
      else if (typeof global.__vcPinPageScroll === "function") global.__vcPinPageScroll();
    } catch (ePin) {}
    global.requestAnimationFrame(function () {
      wrap.classList.add("is-in");
    });

    var panel = wrap.querySelector("#vc-staff-manage-detail");
    return ensureManageScripts().then(function () {
      if (!global.VCStaffManagePanel || typeof global.VCStaffManagePanel.openMember !== "function") {
        panel.innerHTML =
          '<div class="vc-staff-manage-modal-error"><p>Modulo gestione non caricato. Ricarica la pagina.</p></div>';
        return Promise.reject(new Error("VCStaffManagePanel missing"));
      }
      if (typeof opts.onUpdated === "function") {
        global.VCStaffManagePanel.onMemberUpdated = opts.onUpdated;
      } else {
        global.VCStaffManagePanel.onMemberUpdated = null;
      }
      return global.VCStaffManagePanel.openMember(uid, panel).then(function (data) {
        return data;
      });
    });
  }

  function viewerCanManageProfile(payload) {
    var p = global.__VC_STAFF_PERMS || {};
    var staffOk = Boolean(p.ok) || global.__VC_STAFF_MENU_ALLOWED === true;
    if (!staffOk) return false;
    var isSelf = payload && payload.isSelf !== false;
    if (p.canManage || p.isHighStaff || p.highStaff) return true;
    if (p.isPmGestore || p.canManagePm) return true;
    if (isSelf && staffOk) return true;
    return false;
  }

  global.VCStaffManageModal = {
    open: openManageSheet,
    close: closeManageSheet,
    viewerCanManageProfile: viewerCanManageProfile,
    ensureScripts: ensureManageScripts,
  };
})(typeof window !== "undefined" ? window : globalThis);
