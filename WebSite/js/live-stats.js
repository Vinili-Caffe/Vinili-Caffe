(function () {
  var cfg = typeof window !== "undefined" ? window.__VC_LIVE : null;
  if (!cfg || cfg.enabled !== true) return;

  function el(key) {
    return document.querySelector('[data-live-stat="' + key + '"]');
  }

  function setText(key, value) {
    var node = el(key);
    if (!node || value === undefined || value === null) return;
    var n = Number(value);
    if (!Number.isFinite(n)) return;
    node.textContent = String(Math.floor(n));
  }

  function fetchNoStore(url) {
    return fetch(url, { cache: "no-store", credentials: "omit" }).then(function (r) {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    });
  }

  function inviteUrls() {
    var code = String(cfg.inviteCode || "").trim();
    if (!code) return [];
    var list = [];
    var proxy = cfg.inviteProxyPath;
    if (proxy && String(proxy).trim()) {
      try {
        list.push(new URL(String(proxy).trim(), location.origin).toString());
      } catch (e) {
        /* ignore */
      }
    }
    list.push(
      "https://discord.com/api/v10/invites/" + encodeURIComponent(code) + "?with_counts=true",
    );
    return list;
  }

  function refreshInvite() {
    var urls = inviteUrls();
    if (!urls.length) return Promise.resolve();

    function tryOne(i) {
      if (i >= urls.length) return Promise.reject(new Error("invite_exhausted"));
      return fetchNoStore(urls[i]).then(function (data) {
        return data;
      }).catch(function () {
        return tryOne(i + 1);
      });
    }

    return tryOne(0).then(function (data) {
      setText("members", data.approximate_member_count);
      var boosts = data.guild && data.guild.premium_subscription_count;
      setText("boosts", boosts);
    });
  }

  function refreshExtraStaff() {
    var p = cfg.extraStatsPath;
    if (p == null || String(p).trim() === "") return Promise.resolve();
    var url;
    try {
      url = new URL(String(p).trim(), location.origin).toString();
    } catch (e) {
      return Promise.resolve();
    }
    return fetchNoStore(url).then(function (j) {
      setText("staff", j.staffNoPm);
    }).catch(function () {
      /* file opzionale */
    });
  }

  function tick() {
    refreshInvite().catch(function () {});
    refreshExtraStaff().catch(function () {});
  }

  function isLocalDevHost() {
    var h = String(location.hostname || "").toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }

  tick();
  var ms = Number(cfg.pollIntervalMs) || 45000;
  if (ms >= 5000 && !isLocalDevHost()) setInterval(tick, ms);
})();