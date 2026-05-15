(function () {
  function whenQuizReady(cb, attempt) {
    var n = typeof attempt === "number" ? attempt : 0;
    if (
      typeof window.__vcHogwartsInit === "function" &&
      typeof window.__vcHogwartsStartQuizAfterIntro === "function"
    ) {
      cb();
      return;
    }
    if (n >= 240) {
      cb();
      return;
    }
    setTimeout(function () {
      whenQuizReady(cb, n + 1);
    }, 25);
  }

  function hideLoading() {
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
    } catch (e0) {}
    var el = document.getElementById("vc-hw-loading");
    if (!el) return;
    try {
      el.style.setProperty("display", "none", "important");
    } catch (e1) {
      try {
        el.style.display = "none";
      } catch (e2) {}
    }
    try {
      el.remove();
    } catch (e3) {}
  }

  function revealApp() {
    try {
      document.body.classList.add("vc-hw-app-revealed");
      document.body.classList.add("vc-hw-intro-finished");
      window.__vcHogwartsIntroCompleted = true;
      window.__vcHogwartsBgmAllowed = true;
    } catch (eR) {}
    hideLoading();
    var cinema = document.getElementById("vc-hw-cinema");
    if (cinema) {
      cinema.hidden = true;
      cinema.setAttribute("hidden", "");
    }
    try {
      document.body.classList.remove("vc-hw-cinema-active");
      document.documentElement.classList.remove("vc-hw-cinema-active");
    } catch (eC) {}
    var app = document.getElementById("vc-hogwarts-app");
    if (app) {
      try {
        app.removeAttribute("style");
      } catch (eSt) {}
    }
    try {
      if (typeof window.__vcHogwartsYoutubeStartAfterIntro === "function") {
        window.__vcHogwartsYoutubeStartAfterIntro();
      }
    } catch (eBgm) {}
    whenQuizReady(function () {
      var initPromise = null;
      try {
        if (typeof window.__vcHogwartsInit === "function") initPromise = window.__vcHogwartsInit();
      } catch (eInit) {}
      function goQuiz() {
        try {
          if (typeof window.__vcHogwartsStartQuizAfterIntro === "function") {
            window.__vcHogwartsStartQuizAfterIntro();
          }
        } catch (eQ) {}
        try {
          var quiz = document.getElementById("vc-hw-quiz");
          if (quiz && !quiz.hidden && quiz.scrollIntoView) {
            quiz.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          var gate = document.getElementById("vc-hw-gate");
          if (gate && !gate.hidden && gate.scrollIntoView) {
            gate.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          var intro = document.getElementById("vc-hw-intro");
          if (intro && !intro.hidden && intro.scrollIntoView) {
            intro.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
          }
          var main = document.querySelector("#vc-hogwarts-app main");
          if (main && main.scrollIntoView) main.scrollIntoView({ behavior: "smooth", block: "start" });
        } catch (eSc) {}
      }
      if (initPromise && typeof initPromise.then === "function") {
        initPromise.then(goQuiz).catch(goQuiz);
      } else {
        goQuiz();
      }
    });
  }

  function run() {
    try {
      document.body.classList.remove("vc-hw-app-revealed");
      document.body.classList.remove("vc-hw-intro-finished");
      window.__vcHogwartsIntroCompleted = false;
      window.__vcHogwartsBgmAllowed = false;
    } catch (eR1) {}
    hideLoading();
    if (typeof window.__vcHogwartsIntroOpen === "function") {
      window.__vcHogwartsIntroOpen(revealApp);
      return;
    }
    revealApp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();