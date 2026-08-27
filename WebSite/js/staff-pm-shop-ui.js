(function (global) {
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function resolveShopApiUrl(cfg) {
    var c = cfg || global.__VC_STAFF_PM_SHOP || {};
    var T = global.VCStaffTools;
    if (T && typeof T.resolveApiUrl === "function") {
      return T.resolveApiUrl(c, "/webhooks/site-staff-pm-shop");
    }
    var local = String(c.apiUrlLocal || "").trim();
    var base = String(c.apiUrl || "/webhooks/site-staff-pm-shop").trim();
    try {
      var h = String(global.location.hostname || "").toLowerCase();
      var isLocal = h === "localhost" || h === "127.0.0.1" || h === "[::1]";
      if (isLocal && local && !/\{\{/.test(local)) return local;
    } catch (eL) {}
    return base && !/\{\{/.test(base) ? base : "/webhooks/site-staff-pm-shop";
  }

  function getToken() {
    try {
      var t = global.localStorage.getItem("vc_discord_access_token");
      if (!t) return "";
      var exp = Number(global.localStorage.getItem("vc_discord_expires_at") || "0");
      if (exp && Date.now() >= exp) return "";
      return t;
    } catch (e) {
      return "";
    }
  }

  function renderShopSection(shop, opts) {
    opts = opts || {};
    if (!shop || !Array.isArray(shop.tiers) || !shop.tiers.length) return "";
    var html =
      '<section class="vc-user-profile-block vc-staff-pm-shop" data-vc-pm-shop>' +
      '<div class="vc-user-profile-block__head">' +
      '<span class="vc-user-profile-block__title">Shop premi</span>' +
      "</div>";
    if (shop.discountBanner) {
      html += '<p class="vc-staff-pm-shop__banner">' + esc(shop.discountBanner) + "</p>";
    }
    html += '<ul class="vc-staff-pm-shop__tiers">';
    shop.tiers.forEach(function (tier) {
      var costHtml =
        tier.discountActive && tier.baseCost > tier.cost
          ? esc(tier.cost) + ' <span class="vc-staff-pm-shop__was">' + esc(tier.baseCost) + "</span>"
          : esc(tier.cost);
      var modeLabel = tier.blocked
        ? "Bloccato"
        : tier.mode === "ticket"
          ? "Ticket HS"
          : "Immediato";
      var disabled = tier.blocked || !tier.canAfford;
      var btnLabel = tier.blocked
        ? "Bloccato"
        : tier.mode === "ticket"
          ? "Apri ticket"
          : "Riscatta";
      html +=
        '<li class="vc-staff-pm-shop__tier' +
        (tier.canAfford && !tier.blocked ? " is-affordable" : "") +
        (tier.blocked ? " is-blocked" : "") +
        '">' +
        '<div class="vc-staff-pm-shop__tier-main">' +
        '<p class="vc-staff-pm-shop__tier-reward"><strong>' +
        esc(tier.reward) +
        "</strong></p>" +
        '<p class="vc-staff-pm-shop__tier-meta">' +
        costHtml +
        " pt · " +
        esc(modeLabel) +
        (tier.blocked && tier.blockedReason
          ? ' · <span class="vc-staff-pm-shop__blocked-why">' + esc(tier.blockedReason) + "</span>"
          : "") +
        "</p></div>" +
        '<button type="button" class="vc-staff-pm-shop__btn' +
        (tier.blocked ? " is-blocked" : "") +
        '" data-pm-shop-tier="' +
        esc(tier.tier) +
        '"' +
        (disabled ? " disabled" : "") +
        (tier.blocked && tier.blockedReason ? ' title="' + esc(tier.blockedReason) + '"' : "") +
        ">" +
        esc(btnLabel) +
        "</button></li>";
    });
    html += "</ul></section>";
    return html;
  }

  function bindShop(root, options) {
    options = options || {};
    if (!root) return;
    var shopRoot = root.querySelector("[data-vc-pm-shop]");
    if (!shopRoot) return;
    var apiUrl = resolveShopApiUrl(options.cfg);
    var onReload = typeof options.onReload === "function" ? options.onReload : function () {};
    var setStatus =
      typeof options.setStatus === "function"
        ? options.setStatus
        : function (msg, err) {
            var el = global.document.getElementById(options.statusId || "vc-staff-profile-status");
            if (!el) return;
            el.textContent = String(msg || "");
            el.hidden = !msg;
            el.classList.toggle("is-error", Boolean(err));
          };

    shopRoot.querySelectorAll("[data-pm-shop-tier]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var tier = Number(btn.getAttribute("data-pm-shop-tier"));
        if (!Number.isFinite(tier)) return;
        var token = getToken();
        if (!token) {
          setStatus("Accedi per riscattare.", true);
          return;
        }
        btn.disabled = true;
        var isTicket = String(btn.textContent || "").toLowerCase().indexOf("ticket") !== -1;
        setStatus(isTicket ? "Apertura ticket High Staff sul sito…" : "Elaborazione riscatto…", false);
        fetch(apiUrl, {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          mode: "cors",
          credentials: "omit",
          cache: "no-store",
          body: JSON.stringify({ tier: tier }),
        })
          .then(function (res) {
            return res
              .json()
              .catch(function () {
                return {};
              })
              .then(function (data) {
                return { res: res, data: data };
              });
          })
          .then(function (out) {
            var data = out.data || {};
            if (!out.res.ok || !data.ok) {
              setStatus(data.message || "Riscatto non riuscito.", true);
              btn.disabled = false;
              if (data.ticketUrl || data.ticketId) {
                var existing =
                  String(data.ticketUrl || "").trim() ||
                  "/tickets/?ticketId=" + encodeURIComponent(data.ticketId) + "#" + data.ticketId;
                window.setTimeout(function () {
                  try {
                    global.location.assign(existing);
                  } catch (eEx) {}
                }, 600);
              }
              return;
            }
            var msg = data.message || "Operazione completata.";
            if (data.mode === "ticket") {
              var dest =
                String(data.ticketUrl || "").trim() ||
                (data.ticketId
                  ? "/tickets/?ticketId=" + encodeURIComponent(data.ticketId) + "#" + data.ticketId
                  : "/tickets/");
              msg = data.message || "Ticket High Staff aperto sul sito.";
              setStatus(msg, false);
              onReload(data);
              try {
                global.location.assign(dest);
              } catch (eGo) {
                try {
                  global.open(dest, "_blank", "noopener,noreferrer");
                } catch (eOpen) {}
              }
              return;
            }
            setStatus(msg, false);
            onReload(data);
          })
          .catch(function () {
            setStatus("Errore di rete sullo shop.", true);
            btn.disabled = false;
          });
      });
    });
  }

  global.VCStaffPmShop = {
    renderShopSection: renderShopSection,
    bindShop: bindShop,
    resolveShopApiUrl: resolveShopApiUrl,
  };
})(typeof window !== "undefined" ? window : globalThis);
