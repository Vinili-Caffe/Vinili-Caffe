(function initPartnerManagerRewardTiers(global) {
  var CANONICAL_TIERS = [50, 100, 150, 200, 250];
  var LABELS = {
    50: "Custom Role &amp; Custom Voc per 30 giorni",
    100: 'Ruolo <span class="vc-sponsor-mention">༄ VIP</span> per 30 giorni',
    150: "<strong>Decorazione a scelta (max 15,99 €)</strong>",
    200: "<strong>Nitro Boost</strong>",
    250: "<strong>5€ PayPal</strong>",
  };
  var DISCOUNT_START = Date.parse("2026-07-01T00:00:00+02:00");
  var DISCOUNT_END = Date.parse("2026-09-01T00:00:00+02:00");

  function isDiscountActive(now) {
    var ms = now instanceof Date ? now.getTime() : Date.now();
    return ms >= DISCOUNT_START && ms < DISCOUNT_END;
  }

  function pointCost(tier, now) {
    var base = Math.floor(Number(tier) || 0);
    if (CANONICAL_TIERS.indexOf(base) < 0) return base;
    return isDiscountActive(now) ? Math.floor(base / 2) : base;
  }

  function buildWebsiteTierHtml(now) {
    var active = isDiscountActive(now);
    var html = "";
    if (active) {
      html +=
        '<p class="mt-2 mb-0 rounded-lg border border-emerald-400/25 bg-emerald-950/35 px-3 py-2 text-emerald-100">' +
        "<strong>Sconto estate</strong> (1 luglio – 31 agosto): le ricompense costano <strong>metà punti</strong>.</p>";
    }
    for (var i = 0; i < CANONICAL_TIERS.length; i += 1) {
      var tier = CANONICAL_TIERS[i];
      var cost = pointCost(tier, now);
      var cls = i === 0 ? "mt-2 mb-0" : "mt-1 mb-0";
      var costHtml =
        active && cost < tier
          ? cost + ' partner <span class="text-slate-500 line-through">' + tier + "</span>"
          : String(cost) + " partner";
      html += '<p class="' + cls + '">' + costHtml + " → " + (LABELS[tier] || "") + "</p>";
    }
    return html;
  }

  global.VCPartnerManagerRewards = {
    isDiscountActive: isDiscountActive,
    pointCost: pointCost,
    buildWebsiteTierHtml: buildWebsiteTierHtml,
  };
})(typeof window !== "undefined" ? window : globalThis);
