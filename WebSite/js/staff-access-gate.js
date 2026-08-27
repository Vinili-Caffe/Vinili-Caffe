/** Compat: boot sincrono + gate centralizzato vc-access-gate.js */
(function () {
  if (window.__VC_ACCESS_GATE_LOADED) return;
  if (!window.__VC_ACCESS_PENDING_BOOT) {
    var boot = document.createElement("script");
    boot.src = "/js/vc-access-pending-boot.js?v=20260826androidScroll1";
    (document.head || document.documentElement).appendChild(boot);
  }
  if (window.__VC_ACCESS_GATE_BOOT) return;
  window.__VC_ACCESS_GATE_BOOT = true;
  var s = document.createElement("script");
  s.src = "/js/vc-access-gate.js?v=20260826androidScroll1";
  (document.head || document.documentElement).appendChild(s);
  if (!window.__vcPtrBooted) {
    try {
      if (!document.querySelector('script[src*="vc-ptr.js"]')) {
        var ptr = document.createElement("script");
        ptr.src = "/js/vc-ptr.js?v=20260826ptrHard1";
        ptr.defer = true;
        (document.head || document.documentElement).appendChild(ptr);
      }
    } catch (ePtr) {}
  }
})();
