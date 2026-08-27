(function () {
  if (window.__vcLoadYoutubeIframeApi) return;

  // Prefer nocookie first when browsers block third-party youtube.com cookies.
  var API_SOURCES = [
    { api: "https://www.youtube-nocookie.com/iframe_api", host: "https://www.youtube-nocookie.com" },
    { api: "https://www.youtube.com/iframe_api", host: "https://www.youtube.com" },
  ];

  window.__vcYoutubePlayerHost = "https://www.youtube-nocookie.com";

  function hasIframeApiScript() {
    try {
      var nodes = document.getElementsByTagName("script");
      for (var i = 0; i < nodes.length; i += 1) {
        var s = String(nodes[i].src || "");
        if (/youtube(-nocookie)?\.com\/iframe_api/i.test(s)) return true;
      }
    } catch (e) {}
    return false;
  }

  function detectPlayerHostFromDom() {
    try {
      var nodes = document.getElementsByTagName("script");
      for (var i = 0; i < nodes.length; i += 1) {
        var s = String(nodes[i].src || "");
        if (/youtube-nocookie\.com\/iframe_api/i.test(s)) return "https://www.youtube-nocookie.com";
        if (/youtube\.com\/iframe_api/i.test(s)) return "https://www.youtube.com";
      }
    } catch (eD) {}
    return "https://www.youtube.com";
  }

  window.__vcLoadYoutubeIframeApi = function () {
    return new Promise(function (resolve, reject) {
      if (window.YT && window.YT.Player) {
        try {
          window.__vcYoutubePlayerHost = detectPlayerHostFromDom();
        } catch (eH) {}
        resolve();
        return;
      }
      var prev = window.onYouTubeIframeAPIReady;
      var settled = false;
      var pollIv = null;
      var activeHost = window.__vcYoutubePlayerHost;

      function finish(err) {
        if (settled) return;
        settled = true;
        try {
          if (pollIv) clearInterval(pollIv);
        } catch (eCl) {}
        if (err) {
          try {
            window.__vcYoutubeApiBlocked = true;
          } catch (eB) {}
          reject(err);
        } else {
          try {
            window.__vcYoutubeApiBlocked = false;
            window.__vcYoutubePlayerHost = activeHost || detectPlayerHostFromDom();
          } catch (eOk) {}
          resolve();
        }
      }

      window.onYouTubeIframeAPIReady = function () {
        try {
          if (typeof prev === "function") prev();
        } catch (eP) {}
        finish();
      };

      function waitForYt(onTimeout) {
        var n = 0;
        pollIv = setInterval(function () {
          if (window.YT && window.YT.Player) {
            finish();
            return;
          }
          n += 1;
          if (n >= 400) onTimeout();
        }, 25);
      }

      function injectSource(idx) {
        if (idx >= API_SOURCES.length) {
          finish(new Error("yt_api"));
          return;
        }
        if (hasIframeApiScript()) {
          activeHost = detectPlayerHostFromDom();
          waitForYt(function () {
            finish(new Error("yt_api_timeout"));
          });
          return;
        }
        var entry = API_SOURCES[idx];
        activeHost = entry.host;
        var tag = document.createElement("script");
        tag.src =
          typeof window.__vcTrustedScriptURL === "function"
            ? window.__vcTrustedScriptURL(entry.api)
            : entry.api;
        tag.async = true;
        tag.onerror = function () {
          try {
            if (pollIv) clearInterval(pollIv);
          } catch (e0) {}
          try {
            if (tag.parentNode) tag.parentNode.removeChild(tag);
          } catch (e1) {}
          injectSource(idx + 1);
        };
        document.head.appendChild(tag);
        waitForYt(function () {
          try {
            if (tag.parentNode) tag.parentNode.removeChild(tag);
          } catch (e2) {}
          injectSource(idx + 1);
        });
      }

      injectSource(0);
    });
  };
})();
