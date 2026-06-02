(function () {
  var ACCESS_TOKEN_KEY = "vc_discord_access_token";
  var EXPIRES_AT_KEY = "vc_discord_expires_at";
  var CATEGORY_BOOST_HINTS = {
    wand: "Boost duello: più chance di vincere i duelli.",
    broom: "Boost economia: più chance di furto riuscito.",
    pet: "Boost minigiochi: moltiplica i punti casa nei minigame.",
  };
  var CONSUMABLE_CATEGORY_HINTS = {
    "consumable-house-points": "Boost ×2 sui punti casa guadagnati. Attivazione immediata.",
    "consumable-exp": "Boost ×2 sull'EXP guadagnata. Attivazione immediata.",
  };
  var state = { loaded: false, buying: "", data: null };

  function byId(id) {
    return document.getElementById(id);
  }

  function cfg() {
    return (typeof window !== "undefined" && window.__VC_HOGWARTS_SHOP) || {};
  }

  function isLocalFrontendOrigin() {
    try {
      var h = String(window.location.hostname || "").toLowerCase();
      return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
    } catch (e) {
      return false;
    }
  }

  function isTemplatePlaceholder(value) {
    return /\{\{.*\}\}/.test(String(value || ""));
  }

  function apiUrl(path) {
    var c = cfg();
    var local = String(c.apiUrlLocal || "").trim();
    var direct = String(c.apiUrl || "").trim();
    var base = isLocalFrontendOrigin() && local && !isTemplatePlaceholder(local) ? local : direct;
    if (!base || isTemplatePlaceholder(base)) base = "/webhooks/site-hogwarts-sorting/shop";
    return base.replace(/\/+$/, "") + (path || "");
  }

  function getToken() {
    try {
      var token = String(localStorage.getItem(ACCESS_TOKEN_KEY) || "").trim();
      var exp = Number(localStorage.getItem(EXPIRES_AT_KEY) || "0");
      if (!token || !exp || Date.now() >= exp) return "";
      return token;
    } catch (e) {
      return "";
    }
  }

  function setHidden(el, hidden) {
    if (!el) return;
    if (hidden) el.setAttribute("hidden", "");
    else el.removeAttribute("hidden");
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function numberOf(value) {
    var n = Math.floor(Number(value) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  function showLoading(show) {
    var el = byId("vc-hw-loading");
    if (!el) return;
    if (show) {
      el.style.display = "";
      return;
    }
    try {
      document.documentElement.classList.add("vc-hw-loading-done");
      el.style.setProperty("display", "none", "important");
    } catch (e) {
      el.style.display = "none";
    }
  }

  function showGate(message, mode) {
    setHidden(byId("vc-hw-shop-shell"), true);
    var gate = byId("vc-hw-shop-gate");
    var msg = byId("vc-hw-shop-gate-msg");
    var login = byId("vc-hw-shop-gate-login");
    var sort = byId("vc-hw-shop-sort-link");
    if (msg) msg.textContent = message || "Shop non disponibile.";
    setHidden(login, mode !== "login");
    setHidden(sort, mode !== "sort");
    setHidden(gate, false);
  }

  function showToast(message, kind) {
    var el = byId("vc-hw-shop-toast");
    if (!el) return;
    el.textContent = message || "";
    el.className = "vc-hw-shop-toast mt-6" + (kind ? " vc-hw-shop-toast--" + kind : "");
    setHidden(el, !message);
  }

  function ownedTierPrice(owned) {
    if (!owned || !owned.id) return 0;
    return Math.max(numberOf(owned.price), numberOf(owned.pricePaid));
  }

  function purchaseOffer(owned, item) {
    var itemPrice = numberOf(item.price);
    if (!owned || !owned.id) return { mode: "buy", pay: itemPrice };
    if (owned.id === item.id) return { mode: "owned", pay: 0 };
    var tier = ownedTierPrice(owned);
    if (itemPrice > tier) return { mode: "upgrade", pay: itemPrice - tier };
    return { mode: "below", pay: itemPrice };
  }

  function itemVisual(item) {
    var key = String(item.imageKey || "");
    if (item.imageFile) {
      var src = "../../images/evento-hogwarts/" + String(item.imageFile).split("/").map(encodeURIComponent).join("/");
      return (
        '<div class="vc-hw-shop-card__frame" aria-hidden="true">' +
        '<img class="vc-hw-shop-card__image" src="' +
        esc(src) +
        '" alt="" loading="lazy" decoding="async" />' +
        "</div>"
      );
    }
    var icon = key.indexOf("broom") === 0 ? "fa-rocket" : key.indexOf("pet") === 0 ? "fa-paw" : "fa-magic";
    return '<span class="vc-hw-shop-card__sigil vc-hw-shop-card__sigil--' + esc(key) + '"><i class="fa ' + icon + '" aria-hidden="true"></i></span>';
  }

  function consumableVisual(item) {
    var icon = String(item.icon || "fa-flask");
    return '<span class="vc-hw-shop-card__sigil vc-hw-shop-card__sigil--consumable"><i class="fa ' + esc(icon) + '" aria-hidden="true"></i></span>';
  }

  function formatRemainingMs(ms) {
    var total = Math.max(0, Math.ceil(Number(ms) / 1000));
    var h = Math.floor(total / 3600);
    var m = Math.floor((total % 3600) / 60);
    if (h > 0) return h + "h " + String(m).padStart(2, "0") + "m";
    return m + "m";
  }

  function activeBoostForItem(activeBoosts, item) {
    var scope = String(item.scope || "").trim();
    var boostType = String(item.boostType || "").trim() === "exp" ? "exp" : "housePoints";
    var bucket = activeBoosts && activeBoosts[boostType] ? activeBoosts[boostType] : null;
    if (!bucket) return null;
    var row = scope === "global" ? bucket.global : scope === "house" ? bucket.house : bucket.personal;
    if (!row || !Number(row.remainingMs)) return null;
    return row;
  }

  function renderEquipmentCategory(cat, inventory, balance) {
    var category = String(cat.id || "");
    var owned = inventory[category] || null;
    var items = Array.isArray(cat.items) ? cat.items : [];
    var boostHint = String(cat.boostHint || CATEGORY_BOOST_HINTS[category] || "").trim();
    var ownedNote = owned && owned.name
      ? '<p class="vc-hw-shop-category__owned">In uso: <strong>' + esc(owned.name) + "</strong></p>"
      : "";
    var metaHtml = boostHint || ownedNote
      ? '<div class="vc-hw-shop-category__meta">' +
          (boostHint ? '<p class="vc-hw-shop-category__hint">' + esc(boostHint) + "</p>" : "") +
          ownedNote +
        "</div>"
      : "";
    return (
      '<section class="vc-hw-shop-category vc-hw-shop-category--' + esc(category) + '">' +
        '<div class="vc-hw-shop-category__head">' +
          '<h2>' + esc(cat.label || category) + "</h2>" +
          metaHtml +
        "</div>" +
        '<div class="vc-hw-shop-items">' +
          items.map(function (item) {
            var offer = purchaseOffer(owned, item);
            var isOwned = offer.mode === "owned";
            var isUpgrade = offer.mode === "upgrade";
            var isBelow = offer.mode === "below";
            var affordable = balance >= offer.pay;
            var disabled = state.buying || isOwned || isBelow || !affordable;
            var label = isOwned
              ? "In uso"
              : isUpgrade
                ? (affordable ? "Migliora" : "Galeoni insufficienti")
                : isBelow
                  ? "Già superato"
                  : affordable
                    ? "Acquista"
                    : "Galeoni insufficienti";
            var priceText = isUpgrade
              ? "+" + offer.pay.toLocaleString("it-IT") + " Galeoni"
              : numberOf(item.price).toLocaleString("it-IT") + " Galeoni";
            return (
              '<article class="vc-hw-shop-card' + (isOwned ? " vc-hw-shop-card--owned" : "") + (isBelow ? " vc-hw-shop-card--locked" : "") + (isUpgrade ? " vc-hw-shop-card--upgrade" : "") + '" style="--shop-accent:' + esc(item.accent || "#d4af37") + '">' +
                '<div class="vc-hw-shop-card__art">' + itemVisual(item) + '<span class="vc-hw-shop-card__glow"></span></div>' +
                '<div class="vc-hw-shop-card__body">' +
                  '<p class="vc-hw-shop-card__rarity">' + esc(item.rarity || "") + "</p>" +
                  '<h3>' + esc(item.name || "") + "</h3>" +
                  '<p class="vc-hw-shop-card__desc">' + esc(item.description || "") + "</p>" +
                  '<p class="vc-hw-shop-card__detail">' + esc(item.detail || "") + "</p>" +
                "</div>" +
                '<div class="vc-hw-shop-card__foot">' +
                  '<span class="vc-hw-shop-card__price">' + esc(priceText) + (isUpgrade ? ' <span class="vc-hw-shop-card__price-full">(' + numberOf(item.price).toLocaleString("it-IT") + " totali)</span>" : "") + "</span>" +
                  '<button type="button" class="vc-hw-btn vc-hw-btn--primary vc-hw-shop-buy" data-category="' + esc(category) + '" data-item-id="' + esc(item.id) + '"' + (disabled ? " disabled" : "") + ">" + esc(label) + "</button>" +
                "</div>" +
              "</article>"
            );
          }).join("") +
        "</div>" +
      "</section>"
    );
  }

  function previewModeActive() {
    var nav = typeof window !== "undefined" && window.__VC_HOGWARTS_EVENT_NAV;
    if (nav && nav.previewMode === true) return true;
    var cal = typeof window !== "undefined" && window.__VC_HOGWARTS_EVENT_CALENDAR;
    return Boolean(cal && cal.previewMode);
  }

  function consumablesVisible(data) {
    if (!data) return false;
    if (data.consumablesUnlocked === true) return true;
    if (data.consumablesPreviewVisible === true) return true;
    return previewModeActive() && window.__VC_HOGWARTS_STAFF_PREVIEW === true;
  }

  function renderConsumableCategory(cat, balance, activeBoosts, purchasable) {
    var category = String(cat.id || "");
    var items = Array.isArray(cat.items) ? cat.items : [];
    var boostHint = String(cat.boostHint || CONSUMABLE_CATEGORY_HINTS[category] || "").trim();
    return (
      '<section class="vc-hw-shop-category vc-hw-shop-category--' + esc(category) + '">' +
        '<div class="vc-hw-shop-category__head">' +
          '<h2>' + esc(cat.label || category) + "</h2>" +
          (boostHint
            ? '<div class="vc-hw-shop-category__meta"><p class="vc-hw-shop-category__hint">' + esc(boostHint) + "</p></div>"
            : "") +
        "</div>" +
        '<div class="vc-hw-shop-items">' +
          items.map(function (item) {
            var price = numberOf(item.price);
            var affordable = balance >= price;
            var ownActive = activeBoostForItem(activeBoosts, item);
            var blocked = item.purchaseBlocked === true;
            var disabled = state.buying || !purchasable || blocked || !affordable;
            var label = !purchasable
              ? "In anteprima"
              : ownActive
              ? "Boost attivo"
              : blocked
                ? "Non disponibile"
                : affordable
                  ? "Attiva"
                  : "Galeoni insufficienti";
            var activeNote = ownActive
              ? '<p class="vc-hw-shop-card__active">Attivo: ' + esc(formatRemainingMs(ownActive.remainingMs)) + " rimasti</p>"
              : blocked && item.purchaseBlockedReason
                ? '<p class="vc-hw-shop-card__active">' + esc(item.purchaseBlockedReason) + "</p>"
                : "";
            return (
              '<article class="vc-hw-shop-card vc-hw-shop-card--consumable' + (ownActive || blocked ? " vc-hw-shop-card--owned" : "") + '" style="--shop-accent:' + esc(item.accent || "#d4af37") + '">' +
                '<div class="vc-hw-shop-card__art">' + consumableVisual(item) + '<span class="vc-hw-shop-card__glow"></span></div>' +
                '<div class="vc-hw-shop-card__body">' +
                  '<p class="vc-hw-shop-card__rarity">' + esc(item.rarity || "") + "</p>" +
                  '<h3>' + esc(item.name || "") + "</h3>" +
                  '<p class="vc-hw-shop-card__desc">' + esc(item.description || "") + "</p>" +
                  '<p class="vc-hw-shop-card__detail">' + esc(item.detail || "") + "</p>" +
                  activeNote +
                "</div>" +
                '<div class="vc-hw-shop-card__foot">' +
                  '<span class="vc-hw-shop-card__price">' + price.toLocaleString("it-IT") + " Galeoni</span>" +
                  '<button type="button" class="vc-hw-btn vc-hw-btn--primary vc-hw-shop-buy" data-category="' + esc(category) + '" data-item-id="' + esc(item.id) + '"' + (disabled ? " disabled" : "") + ">" + esc(label) + "</button>" +
                "</div>" +
              "</article>"
            );
          }).join("") +
        "</div>" +
      "</section>"
    );
  }

  function scrollToConsumables() {
    var target = byId("vc-hw-shop-consumables");
    if (!target) return;
    try {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (e) {
      target.scrollIntoView(true);
    }
  }

  function scrollToConsumablesIfRequested() {
    var hash = String(window.location.hash || "").toLowerCase();
    if (hash === "#vc-hw-shop-consumables" || hash === "#boost" || hash === "#consumabili") scrollToConsumables();
  }

  function render() {
    var data = state.data || {};
    var app = byId("vc-hw-shop-app");
    var shell = byId("vc-hw-shop-shell");
    var gate = byId("vc-hw-shop-gate");
    setHidden(app, false);
    setHidden(gate, true);
    setHidden(shell, false);

    var balance = numberOf(data.gringott && data.gringott.balance);
    var inventory = data.inventory || {};
    var activeBoosts = data.activeBoosts || {};
    var consumablesUnlocked = data.consumablesUnlocked === true;
    var showConsumables = consumablesVisible(data);
    var balanceEl = byId("vc-hw-shop-balance");
    if (balanceEl) balanceEl.textContent = balance.toLocaleString("it-IT");

    setHidden(byId("vc-hw-shop-consumables-cta"), !showConsumables);

    var grid = byId("vc-hw-shop-grid");
    if (!grid) return;
    var equipmentCategories = data.catalog && Array.isArray(data.catalog.categories) ? data.catalog.categories : [];
    var consumableCategories = data.consumables && Array.isArray(data.consumables.categories) ? data.consumables.categories : [];
    var html = equipmentCategories.map(function (cat) {
      return renderEquipmentCategory(cat, inventory, balance);
    }).join("");
    if (showConsumables && consumableCategories.length) {
      html +=
        '<div id="vc-hw-shop-consumables" class="vc-hw-shop-divider mt-12 mb-4">' +
          '<h2 class="vc-hw-shop-divider__title">Boost consumabili</h2>' +
          '<p class="vc-hw-shop-divider__note">' +
            esc(consumablesUnlocked
              ? "Boost ×2 attivabili subito con i Galeoni d'Oro."
              : "Anteprima staff: si attivano dal 10 agosto con l'economia Galeoni.") +
          "</p>" +
        "</div>";
      html += consumableCategories.map(function (cat) {
        return renderConsumableCategory(cat, balance, activeBoosts, consumablesUnlocked);
      }).join("");
    }
    grid.innerHTML = html;
    scrollToConsumablesIfRequested();
  }

  function request(method, path, body) {
    var token = getToken();
    if (!token) return Promise.reject({ error: "missing_token", message: "Accedi con Discord per aprire lo shop." });
    return fetch(apiUrl(path), {
      method: method,
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok || !data || data.ok !== true) throw data || {};
        return data;
      });
    });
  }

  function mergeShopState(data, err) {
    var base = state.data || {};
    state.data = Object.assign({}, base, data || {}, {
      catalog: (base.catalog || (data && data.catalog)),
      consumables: (data && data.consumables) || base.consumables,
      activeBoosts: (data && data.activeBoosts) || base.activeBoosts,
    });
    if (data && data.gringott) state.data.gringott = data.gringott;
    if (data && data.inventory) state.data.inventory = data.inventory;
    if (err && (err.inventory || err.gringott || err.activeBoosts || err.consumables)) {
      state.data = Object.assign({}, state.data, {
        inventory: err.inventory || state.data.inventory,
        gringott: err.gringott || state.data.gringott,
        activeBoosts: err.activeBoosts || state.data.activeBoosts,
        consumables: err.consumables || state.data.consumables,
      });
    }
  }

  function loadShop() {
    var app = byId("vc-hw-shop-app");
    setHidden(app, false);
    showToast("", "");
    var token = getToken();
    if (!token) {
      showLoading(false);
      showGate("Accedi con Discord e completa lo smistamento per usare lo shop.", "login");
      return;
    }
    showLoading(true);
    request("GET", "")
      .then(function (data) {
        state.loaded = true;
        state.data = data;
        showLoading(false);
        render();
      })
      .catch(function (err) {
        showLoading(false);
        var code = String(err && err.error || "");
        if (code === "not_sorted") showGate(err.message || "Completa prima lo smistamento per accedere allo shop.", "sort");
        else if (code === "missing_token") showGate(err.message || "Accedi con Discord per aprire lo shop.", "login");
        else showGate(err && err.message ? err.message : "Shop non disponibile al momento.", "");
      });
  }

  function buy(category, itemId) {
    if (state.buying) return;
    state.buying = itemId;
    showToast("Acquisto in corso…", "");
    render();
    request("POST", "/purchase", { category: category, itemId: itemId })
      .then(function (data) {
        mergeShopState(data);
        state.buying = "";
        showToast(data.message || "Acquisto completato.", "success");
        render();
      })
      .catch(function (err) {
        mergeShopState(null, err);
        state.buying = "";
        showToast(err && err.message ? err.message : "Acquisto non completato.", "error");
        render();
      });
  }

  function bind() {
    var grid = byId("vc-hw-shop-grid");
    if (grid) {
      grid.addEventListener("click", function (ev) {
        var btn = ev.target && ev.target.closest ? ev.target.closest(".vc-hw-shop-buy") : null;
        if (!btn || btn.disabled) return;
        buy(btn.getAttribute("data-category"), btn.getAttribute("data-item-id"));
      });
    }
    var cta = byId("vc-hw-shop-consumables-cta");
    if (cta) {
      cta.addEventListener("click", function (ev) {
        ev.preventDefault();
        scrollToConsumables();
      });
    }
    window.addEventListener("hashchange", scrollToConsumablesIfRequested);
  }

  function init() {
    bind();
    loadShop();
  }

  window.addEventListener("vc-discord-profile", loadShop);
  document.addEventListener("vc-hogwarts-staff-preview-unlock", function () {
    if (state.loaded) render();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();