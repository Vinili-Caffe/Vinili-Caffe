(function () {
  var btn = document.getElementById("vc-mobile-menu-btn");
  var nav = document.getElementById("mobile-nav");
  if (!btn || !nav) return;
  btn.addEventListener("click", function () {
    var open = nav.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
})();
(function () {
  function initHeaderNavAccordion() {
    var bar = document.querySelector(".vc-header-bar");
    if (!bar) return;
    var detailsList = bar.querySelectorAll("details.vc-snav-details");
    var notif = bar.querySelector("details.vc-notif-dropdown");
    detailsList.forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (!d.open) return;
        detailsList.forEach(function (other) {
          if (other !== d) other.open = false;
        });
        if (notif) notif.open = false;
      });
    });
    if (notif) {
      notif.addEventListener("toggle", function () {
        if (!notif.open) return;
        detailsList.forEach(function (other) {
          other.open = false;
        });
      });
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHeaderNavAccordion);
  } else {
    initHeaderNavAccordion();
  }
})();