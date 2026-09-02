(function () {
  if (!window.__VC_ACCESS_PENDING_BOOT) {
    var boot = document.createElement("script");
    boot.src = "/js/vc-access-pending-boot.js?v=20260824sfGate1";
    (document.head || document.documentElement).appendChild(boot);
  }
  if (!window.__VC_ACCESS_GATE_LOADED && !window.__VC_ACCESS_GATE_BOOT) {
    window.__VC_ACCESS_GATE_BOOT = true;
    var s = document.createElement("script");
    s.src = "/js/vc-access-gate.js?v=20260829sfStream1";
    (document.head || document.documentElement).appendChild(s);
  }

  function revealLocal() {
    try {
      document.documentElement.classList.remove("vc-dash-access-pending");
      document.documentElement.classList.add("vc-dash-access-ready");
      document.documentElement.classList.add("vc-seratafilm-loading-done");
      if (document.body) document.body.classList.add("vc-seratafilm-app-revealed");
      var loading = document.getElementById("vc-seratafilm-loading");
      if (loading) {
        loading.hidden = true;
        loading.setAttribute("hidden", "");
      }
      var app = document.getElementById("vc-seratafilm-app");
      if (app) app.style.display = "";
      if (typeof window.__vcSeratafilmApplyHogwartsTheme === "function") {
        window.__vcSeratafilmApplyHogwartsTheme();
      }
      if (typeof window.__vcSeratafilmInit === "function" && !window.__vcSeratafilmInitDone) {
        window.__vcSeratafilmInitDone = true;
        window.__vcSeratafilmInit();
      }
    } catch (e) {}
  }

  window.addEventListener("vc:access-ok", revealLocal);
  if (window.__VC_ACCESS_OK) revealLocal();
})();
