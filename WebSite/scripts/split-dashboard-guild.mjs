import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, "..", "js", "dashboard-guild-page.js");
const VER = process.env.VC_GUILD_SPLIT_VER || "20260901guildSplitFix4";

const lines = fs.readFileSync(SRC, "utf8").split(/\n/);

const R = {
  headEnd: 7455,
  extStart: 7456,
  extEnd: 16065,
  partnershipStart: 16067,
  partnershipEnd: 16206,
  utilStart: 16207,
  utilEnd: 16283,
  tailStart: 16284,
};

const head = lines.slice(0, R.headEnd + 1);
const extBody = lines.slice(R.extStart, R.extEnd + 1);
const partnership = lines.slice(R.partnershipStart, R.partnershipEnd + 1);
const util = lines.slice(R.utilStart, R.utilEnd + 1);
const tail = lines.slice(R.tailStart);

const fnDecl = /^  (?:async )?function ([A-Za-z_$][\w$]*)/;
const coreFns = new Set();
for (const block of [head, partnership, util, tail]) {
  for (const line of block) {
    const m = line.match(fnDecl);
    if (m) coreFns.add(m[1]);
  }
}

const extText = extBody.join("\n");
const called = new Set();
const callRe = /\b([A-Za-z_$][\w$]*)\s*\(/g;
let m;
while ((m = callRe.exec(extText))) called.add(m[1]);
const needs = [...called].filter((n) => coreFns.has(n)).sort();

console.log("ext lines", extBody.length, "needs core fns", needs.length);

const extWrapper = `/* dashboard-guild-ext — lazy chunk (${VER}) */
(function (G) {
  "use strict";
  var state = G.state;
${needs.filter((f) => f !== "state").map((f) => `  var ${f} = G.${f};`).join("\n")}

${extBody.join("\n")}

  G.loadSettings = loadSettings;
  G.loadTickets = loadTickets;
  G.wireGsDashRoles = wireGsDashRoles;
  G._extReady = true;
  if (typeof G._flushExtQueue === "function") G._flushExtQueue();
})(window.__VC_DG);
`;

const coreInject = `
  var G = (window.__VC_DG = window.__VC_DG || {});
  G.state = state;
  G._extReady = false;
  G._extQueue = [];
  G._flushExtQueue = function () {
    var q = G._extQueue || [];
    G._extQueue = [];
    q.forEach(function (fn) {
      try { fn(); } catch (e) {}
    });
  };
  function exportCoreFnsToG() {
    G.state = state;
${needs.map((f) => `    G.${f} = ${f};`).join("\n")}
  }
  exportCoreFnsToG();

  function loadGuildExtScript() {
    return new Promise(function (resolve, reject) {
      if (G._extReady) { resolve(G); return; }
      if (G._extLoading) {
        G._extQueue.push(function () { resolve(G); });
        return;
      }
      G._extLoading = true;
      var s = document.createElement("script");
      s.src = (function () {
        var scripts = document.getElementsByTagName("script");
        for (var i = 0; i < scripts.length; i++) {
          var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
          var m = src.match(/^(.*\\/js\\/)dashboard-guild-core\\.js/);
          if (m) return m[1] + "dashboard-guild-ext.js?v=${VER}";
        }
        return "/js/dashboard-guild-ext.js?v=${VER}";
      })();
      s.defer = true;
      s.onload = function () { G._extLoading = false; resolve(G); };
      s.onerror = function () { G._extLoading = false; reject(new Error("guild_ext_load_failed")); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function ensureGuildExt() { return loadGuildExtScript(); }
  async function loadSettings(seq) {
    var g = await ensureGuildExt();
    return g.loadSettings(seq);
  }
  async function loadTickets(opts) {
    var g = await ensureGuildExt();
    return g.loadTickets(opts);
  }
  G.prefetchExtChunk = function () {
    return ensureGuildExt().catch(function () {});
  };
`;

const coreOut =
  head.join("\n") +
  "\n" +
  partnership.join("\n") +
  "\n" +
  util.join("\n") +
  "\n" +
  coreInject +
  "\n" +
  tail.join("\n");

const corePath = path.join(__dirname, "..", "js", "dashboard-guild-core.js");
const extPath = path.join(__dirname, "..", "js", "dashboard-guild-ext.js");
const bootPath = path.join(__dirname, "..", "js", "dashboard-guild-boot.js");

fs.writeFileSync(corePath, coreOut, "utf8");
fs.writeFileSync(extPath, extWrapper, "utf8");

const bootJs = `(function () {
  "use strict";
  /* guildSplitFix1 boot ${VER}: lazy load guild core post access gate */
  var VER = "${VER}";
  var loaded = false;
  var loading = false;
  var queue = [];

  function scriptPrefix() {
    var scripts = document.getElementsByTagName("script");
    for (var i = 0; i < scripts.length; i++) {
      var src = String(scripts[i].getAttribute("src") || scripts[i].src || "");
      var m = src.match(/^(.*\\/js\\/)dashboard-guild-boot\\.js/);
      if (m) return m[1];
    }
    return "/js/";
  }

  function hasSessionToken() {
    try {
      var t = localStorage.getItem("vc_discord_access_token");
      var exp = Number(localStorage.getItem("vc_discord_expires_at") || "0");
      return Boolean(t && (!exp || Date.now() < exp));
    } catch (e) { return false; }
  }

  function gateDismissed() {
    try {
      return (
        window.__VC_DASHBOARD_ACCESS_OK === true ||
        window.__VC_ACCESS_OK === true ||
        document.documentElement.classList.contains("vc-dash-access-ready")
      );
    } catch (e2) { return false; }
  }

  function loadCore() {
    if (loaded) return Promise.resolve();
    if (loading) {
      return new Promise(function (resolve) { queue.push(resolve); });
    }
    loading = true;
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = scriptPrefix() + "dashboard-guild-core.js?v=" + VER;
      s.defer = true;
      s.onload = function () {
        loaded = true;
        loading = false;
        queue.splice(0).forEach(function (fn) { fn(); });
        resolve();
      };
      s.onerror = function () {
        loading = false;
        reject(new Error("guild_core_load_failed"));
      };
      (document.head || document.documentElement).appendChild(s);
    });
  }

  function maybeLoad() {
    if (!hasSessionToken() && !gateDismissed()) return;
    loadCore().catch(function () {});
  }

  function prefetchExtIdle() {
    if (!loaded) return;
    var run = function () {
      try {
        if (window.__VC_DG && typeof window.__VC_DG.prefetchExtChunk === "function") {
          window.__VC_DG.prefetchExtChunk();
        }
      } catch (eP) {}
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 5000 });
    else setTimeout(run, 1500);
  }

  window.addEventListener("vc-dashboard-access", function () {
    maybeLoad();
    setTimeout(prefetchExtIdle, 900);
  });
  window.addEventListener("vc:access-ok", function () { maybeLoad(); });
  window.addEventListener("vc-discord-profile", function (ev) {
    if (ev && ev.detail && ev.detail.user) maybeLoad();
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { maybeLoad(); });
  } else {
    maybeLoad();
  }
})();
`;

fs.writeFileSync(bootPath, bootJs, "utf8");

try {
  const { execSync } = await import("child_process");
  execSync(`node --check "${corePath}"`, { stdio: "inherit" });
  execSync(`node --check "${extPath}"`, { stdio: "inherit" });
  execSync(`node --check "${bootPath}"`, { stdio: "inherit" });
} catch (e) {
  process.exit(1);
}

const sizes = {
  core: fs.statSync(corePath).size,
  ext: fs.statSync(extPath).size,
  boot: fs.statSync(bootPath).size,
  orig: fs.statSync(SRC).size,
};
console.log("sizes KB", Object.fromEntries(Object.entries(sizes).map(([k, v]) => [k, Math.round(v / 1024)])));
console.log("ASSERT_OK", VER);
