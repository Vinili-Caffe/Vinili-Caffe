(function () {
  var TIP_CLASS = "vc-field-validation-tip";
  var DEFAULT_MSG = "Compila questo campo.";

  function escapeHtml(s) {
    return String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function anchorFor(control) {
    if (!control || !control.closest) return null;
    var a = control.closest(".vc-candidature-field");
    if (a) return a;
    a = control.closest(".vc-unban-rules-wrap");
    if (a) return a;
    return control.closest(".vc-field-tip-anchor");
  }

  function hideAll() {
    var nodes = document.querySelectorAll("." + TIP_CLASS);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      try {
        if (n.parentNode) n.parentNode.removeChild(n);
      } catch (e) {}
    }
  }

  function show(control, message) {
    hideAll();
    if (!control) return;
    var anchor = anchorFor(control);
    if (!anchor) return;
    var tip = document.createElement("div");
    tip.className = TIP_CLASS;
    tip.setAttribute("role", "alert");
    tip.innerHTML =
      '<span class="vc-field-validation-tip-pointer" aria-hidden="true"></span>' +
      '<div class="vc-field-validation-tip-row">' +
      '<span class="vc-field-validation-tip-icon" aria-hidden="true">!</span>' +
      '<span class="vc-field-validation-tip-text">' +
      escapeHtml(message || DEFAULT_MSG) +
      "</span></div>";
    anchor.appendChild(tip);
    try {
      control.focus({ preventScroll: true });
      control.scrollIntoView({ block: "nearest", behavior: "smooth" });
    } catch (e2) {}
    function dismiss() {
      if (tip.parentNode) tip.parentNode.removeChild(tip);
      control.removeEventListener("input", dismiss);
      control.removeEventListener("change", dismiss);
    }
    control.addEventListener("input", dismiss);
    control.addEventListener("change", dismiss);
  }

  window.vcFieldValidationTip = { show: show, hideAll: hideAll };
})();