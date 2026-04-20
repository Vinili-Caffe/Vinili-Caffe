(function () {
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