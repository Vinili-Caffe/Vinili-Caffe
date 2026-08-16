(function () {
  function ensureTrustedTypesPolicy() {
    try {
      if (!window.trustedTypes) return null;
      if (window.trustedTypes.defaultPolicy) return window.trustedTypes.defaultPolicy;
      return window.trustedTypes.createPolicy("default", {
        createHTML: function (s) {
          return String(s);
        },
        createScript: function (s) {
          return String(s);
        },
        createScriptURL: function (s) {
          return String(s);
        },
      });
    } catch (ePolicy) {
      return null;
    }
  }

  ensureTrustedTypesPolicy();

  window.__vcTrustedScriptURL = function (url) {
    var u = String(url || "");
    try {
      var policy = ensureTrustedTypesPolicy() || window.trustedTypes?.defaultPolicy;
      if (policy && typeof policy.createScriptURL === "function") return policy.createScriptURL(u);
    } catch (eUrl) {}
    return u;
  };

  try {
    ensureTrustedTypesPolicy();
  } catch (ePolicy2) {}

  if (window.__vcExtensionNoiseFilterInstalled) return;
  window.__vcExtensionNoiseFilterInstalled = true;

  function msgOf(reason, depth) {
    try {
      if (depth == null) depth = 0;
      if (reason && typeof reason === "object") {
        var parts = [];
        if (reason.message != null) parts.push(String(reason.message));
        if (reason.stack != null) parts.push(String(reason.stack));
        if (reason.name != null) parts.push(String(reason.name));
        if (depth < 2 && reason.reason != null) parts.push(msgOf(reason.reason, depth + 1));
        if (depth < 2 && reason.error != null) parts.push(msgOf(reason.error, depth + 1));
        if (parts.length) return parts.join(" ");
      }
      return String(reason || "");
    } catch (e) {
      return "";
    }
  }

  function isExtensionNoise(reason) {
    var msg = msgOf(reason);
    return (
      /requires ['"]?TrustedScript['"]? assignment/i.test(msg) ||
      /trustedscript/i.test(msg) ||
      /injectscript\.js/i.test(msg) ||
      /message channel closed before a response was received/i.test(msg) ||
      /message channel closed/i.test(msg) ||
      /channel closed before a response was received/i.test(msg) ||
      /closed before a response was received/i.test(msg) ||
      /could not establish connection\.?\s*receiving end does not exist/i.test(msg) ||
      /extension context invalidated/i.test(msg) ||
      /the message port closed before a response was received/i.test(msg) ||
      /message port closed/i.test(msg) ||
      /listener indicated an asynchronous response/i.test(msg) ||
      /listener.*returning true.*(?:message )?channel closed/i.test(msg) ||
      /asynchronous response by returning true/i.test(msg) ||
      /unchecked runtime\.lasterror/i.test(msg) ||
      /wrappedSendMessageCallback/i.test(msg) ||
      /cookieCrumbler\.js/i.test(msg) ||
      /chrome-extension:\/\//i.test(msg) ||
      /moz-extension:\/\//i.test(msg) ||
      (/cannot read properties of undefined/i.test(msg) && /useCache/i.test(msg)) ||
      (/failed to execute ['"]?removechild['"]?/i.test(msg) && /content(?:_script)?\.js|chrome-extension|moz-extension/i.test(msg)) ||
      (/notfounderror/i.test(msg) && /node to be removed is not a child/i.test(msg)) ||
      // Cloudflare Turnstile / challenge noise (non app errors)
      (/font-size:\s*0;\s*color:\s*transparent/i.test(msg) && /NaN/i.test(msg)) ||
      /challenges\.cloudflare\.com/i.test(msg)
    );
  }

  function isYoutubeBlockedNoise(args) {
    try {
      var s = "";
      for (var i = 0; i < args.length; i += 1) {
        if (args[i] != null) s += " " + String(args[i]);
      }
      if (!/ERR_BLOCKED_BY_CLIENT|ERR_BLOCKED_BY_ORB/i.test(s)) return false;
      return /youtube|googlevideo|ytimg|gstatic|iframe_api/i.test(s);
    } catch (e) {
      return false;
    }
  }

  function isTurnstileFormatNoise(args) {
    try {
      var first = String(args[0] || "");
      if (/font-size:\s*0;\s*color:\s*transparent/i.test(first)) return true;
      if (/%c%d/i.test(first) && (args[1] !== args[1] || args[1] == null)) return true;
    } catch (e) {}
    return false;
  }

  window.addEventListener(
    "error",
    function (ev) {
      var src = "";
      try {
        src = String(ev.filename || ev.target?.src || "");
      } catch (e0) {}
      if (!isExtensionNoise(ev.message) && !isExtensionNoise(src) && !isExtensionNoise(ev.error)) return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      } catch (e1) {}
    },
    true,
  );

  window.addEventListener(
    "securitypolicyviolation",
    function (ev) {
      var text = "";
      try {
        text = [ev.blockedURI, ev.violatedDirective, ev.originalPolicy, ev.sourceFile].join(" ");
      } catch (e2) {}
      if (!isExtensionNoise(text)) return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      } catch (e3) {}
    },
    true,
  );

  window.addEventListener(
    "unhandledrejection",
    function (ev) {
      if (!isExtensionNoise(ev.reason)) return;
      try {
        ev.preventDefault();
        ev.stopImmediatePropagation();
      } catch (e0) {}
    },
    true,
  );

  window.onunhandledrejection = function (ev) {
    if (!isExtensionNoise(ev && ev.reason)) return;
    try {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    } catch (e4) {}
  };

  ["error", "warn", "log", "info", "debug"].forEach(function (level) {
    var orig = console[level];
    if (typeof orig !== "function") return;
    console[level] = function () {
      if (isYoutubeBlockedNoise(arguments)) return;
      if (isTurnstileFormatNoise(arguments)) return;
      var all = "";
      for (var i = 0; i < arguments.length; i += 1) all += " " + msgOf(arguments[i]);
      if (isExtensionNoise(all)) return;
      /forced reflow while executing javascript took/i.test(all) ||
      /failed to execute ['"]?postmessage['"]? on ['"]?domwindow['"]?/i.test(all) ||
      (/target origin provided/i.test(all) && /youtube(-nocookie)?\.com/i.test(all))
    ) return;
      return orig.apply(console, arguments);
    };
  });
})();
