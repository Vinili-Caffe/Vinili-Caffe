(function () {
  function monthYearIt() {
    var raw = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date());
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  function apply() {
    var el = document.getElementById("resume-month-year");
    if (el) el.textContent = monthYearIt();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", apply);
  } else {
    apply();
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") apply();
  });
})();