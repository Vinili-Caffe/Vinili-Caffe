(function () {
  function injectRankCustomizeFixes() {
    try {
      var path = String(window.location.pathname || "");
      if (!/^\/user\/(personalizza|customize)\/?$/i.test(path)) return;
      if (document.getElementById("vc-rank-customize-layout-fixes")) return;
      var css =
        ".vc-rank-editor-colorrow{display:grid!important;grid-template-columns:minmax(5.5rem,6.2rem) minmax(6.75rem,8rem) auto!important;align-items:center!important;justify-content:start!important;gap:.45rem!important;}" +
        ".vc-rank-editor-colorrow__hex{width:100%!important;min-width:6.75rem!important;max-width:8rem!important;height:3rem!important;box-sizing:border-box!important;text-align:center!important;font-weight:800!important;letter-spacing:.04em!important;color:#f8fafc!important;opacity:1!important;}" +
        ".vc-rank-editor-updatebtn{width:auto!important;min-width:0!important;white-space:nowrap!important;justify-self:start!important;}" +
        ".vc-rank-editor-previewcard{overflow:hidden!important;}" +
        ".vc-rank-editor-preview__card{width:100%!important;max-width:43rem!important;margin-inline:auto!important;box-sizing:border-box!important;overflow:hidden!important;}" +
        ".vc-rank-editor-preview__hero{display:grid!important;grid-template-columns:auto minmax(0,1fr) auto!important;align-items:center!important;gap:clamp(1rem,2vw,2rem)!important;}" +
        ".vc-rank-editor-preview__copy,.vc-rank-editor-preview__topline{min-width:0!important;}" +
        ".vc-rank-editor-preview__topline{flex-wrap:wrap!important;row-gap:.35rem!important;}" +
        ".vc-rank-editor-preview__bar{width:100%!important;min-width:0!important;}" +
        ".vc-rank-editor-preview__stats{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:1rem!important;}" +
        ".vc-rank-editor-preview__stat{min-width:0!important;}" +
        "@media(max-width:860px){.vc-rank-editor-colorrow{grid-template-columns:minmax(5.5rem,6.2rem) minmax(6.75rem,8rem)!important;justify-content:start!important;gap:.45rem!important}.vc-rank-editor-updatebtn{grid-column:1/-1!important;justify-self:stretch!important}.vc-rank-editor-preview__hero{grid-template-columns:1fr!important;justify-items:center!important;text-align:center!important}.vc-rank-editor-preview__rankbox{justify-self:center!important}.vc-rank-editor-preview__stats{grid-template-columns:1fr!important}}";
      var style = document.createElement("style");
      style.id = "vc-rank-customize-layout-fixes";
      style.textContent = css;
      document.head.appendChild(style);
    } catch (e) {}
  }

  injectRankCustomizeFixes();

  function isBlockingSessionVerifyPage() {
    try {
      return Boolean(window.__VC_REQUIRE_BLOCKING_SESSION_VERIFY);
    } catch (e) {
      return false;
    }
  }

  if (!isBlockingSessionVerifyPage()) return;

  try {
    var h = window.location.hash || "";
    if (h.indexOf("access_token=") !== -1) {
      document.documentElement.classList.add("vc-session-verify-pending");
      return;
    }
  } catch (e) {}
  try {
    var t = localStorage.getItem("vc_discord_access_token");
    var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
    if (t && exp && Date.now() < exp) {
      document.documentElement.classList.add("vc-session-verify-pending");
    }
  } catch (e) {}
})();