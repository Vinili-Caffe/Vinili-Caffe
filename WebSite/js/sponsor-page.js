(function initSponsorPromo() {
  if (!document.body.classList.contains("vc-sponsor-page")) return;
  const untilRaw = String(window.__VC_SPONSOR_PROMO_UNTIL || "").trim();
  if (!untilRaw) return;
  const until = Date.parse(untilRaw);
  if (!Number.isFinite(until) || Date.now() > until) return;
  document.body.classList.add("vc-sponsor-page--promo-active");
})();