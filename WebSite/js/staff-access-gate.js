(function () {
  if (window.__VC_ACCESS_GATE_LOADED) return;
  if (!window.__VC_ACCESS_PENDING_BOOT) {
    var boot = document.createElement("script");
    boot.src = "/js/vc-access-pending-boot.js?v=20260921pmOpsNavHide1";
    (document.head || document.documentElement).appendChild(boot);
  }
  if (window.__VC_ACCESS_GATE_BOOT) return;
  window.__VC_ACCESS_GATE_BOOT = true;
  var s = document.createElement("script");
  s.src = "/js/vc-access-gate.js?v=20260921pmOpsNavHide1";
  (document.head || document.documentElement).appendChild(s);
  if (!window.__vcPtrBooted) {
    try {
      if (
        !document.querySelector(
          'script[src*="/vc-ptr.js"], script[src*="/vc-ptr."]',
        )
      ) {
        var ptr = document.createElement("script");
        ptr.src = "/js/vc-ptr.20261017ptrScrollRestore2.js?v=20261017ptrScrollRestore2";
        ptr.defer = true;
        (document.head || document.documentElement).appendChild(ptr);
      }
    } catch (ePtr) {}
  }
})();
