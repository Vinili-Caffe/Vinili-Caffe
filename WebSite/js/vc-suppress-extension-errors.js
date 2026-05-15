(function () {
  if (window.__vcExtensionNoiseFilterInstalled) return;
  window.__vcExtensionNoiseFilterInstalled = true;

  function isExtensionNoise(reason) {
    var msg = "";
    try {
      if (reason && typeof reason === "object" && reason.message != null) msg = String(reason.message);
      else msg = String(reason || "");
    } catch (e) {
      return false;
    }
    return (
      /message channel closed before a response was received/i.test(msg) ||
      /extension context invalidated/i.test(msg) ||
      /the message port closed before a response was received/i.test(msg)
    );
  }

  window.addEventListener(
    "unhandledrejection",
    function (ev) {
      if (!isExtensionNoise(ev.reason)) return;
      try {
        ev.preventDefault();
      } catch (e0) {}
    },
    true,
  );
})();