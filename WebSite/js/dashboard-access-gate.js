(function () {
  if (!window.__VC_ACCESS_PENDING_BOOT) {
    var boot = document.createElement("script");
    boot.src = "/js/vc-access-pending-boot.js?v=20260823scrollLock1";
    (document.head || document.documentElement).appendChild(boot);
  }
  if (window.__VC_ACCESS_GATE_LOADED || window.__VC_ACCESS_GATE_BOOT) return;
  window.__VC_ACCESS_GATE_BOOT = true;
  var s = document.createElement("script");
  s.src = "/js/vc-access-gate.js?v=20260824accessFix1";
  (document.head || document.documentElement).appendChild(s);
})();
