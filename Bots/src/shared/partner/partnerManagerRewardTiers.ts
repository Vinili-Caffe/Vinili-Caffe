const PARTNER_REWARD_CANONICAL_TIERS = Object.freeze([50, 100, 150, 200, 250]);

const PARTNER_REWARD_LABELS = Object.freeze({
  50: "Custom Role e Custom Voc per 30 giorni",
  100: "Ruolo VIP per 30 giorni",
  150: "Decorazione a scelta (max 15,99 €)",
  200: "Nitro Boost",
  250: "5 € PayPal",
});

const PARTNER_REWARD_DISCOUNT_WINDOW = Object.freeze({
  startIso: "2026-07-01T00:00:00+02:00",
  endIso: "2026-09-01T00:00:00+02:00",
});

function resolveNowMs(now?) {
  if (now == null) return Date.now();
  if (now instanceof Date) return now.getTime();
  const n = Number(now);
  return Number.isFinite(n) ? n : Date.now();
}

function isPartnerRewardDiscountActive(now?) {
  const ms = resolveNowMs(now);
  const start = Date.parse(PARTNER_REWARD_DISCOUNT_WINDOW.startIso);
  const end = Date.parse(PARTNER_REWARD_DISCOUNT_WINDOW.endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  return ms >= start && ms < end;
}

function getPartnerRewardPointCost(canonicalTier?, now?) {
  const base = Math.floor(Number(canonicalTier) || 0);
  if (!PARTNER_REWARD_CANONICAL_TIERS.includes(base)) return base;
  return isPartnerRewardDiscountActive(now) ? Math.floor(base / 2) : base;
}

function partnerManagerRedeemButtonLabel(canonicalTier?, now?) {
  const tier = Math.floor(Number(canonicalTier) || 0);
  const cost = getPartnerRewardPointCost(tier, now);
  const label = PARTNER_REWARD_LABELS[tier];
  if (!label) return `Riscatto ${cost} punti partner`;
  if (isPartnerRewardDiscountActive(now) && cost < tier) {
    return `${cost} partner · ${label} (era ${tier})`;
  }
  return `${cost} partner · ${label}`;
}

function buildPartnerRewardDiscountBanner(now?) {
  if (!isPartnerRewardDiscountActive(now)) return null;
  return (
    "🎉 **Sconto estate Partner Manager** (1 luglio – 31 agosto): le ricompense costano **metà punti** " +
    "(25 · 50 · 75 · 100 · 125)."
  );
}

function buildPartnerRewardDiscordEmbedLines(now?) {
  const lines = [];
  const banner = buildPartnerRewardDiscountBanner(now);
  if (banner) lines.push(banner, "");
  for (const tier of PARTNER_REWARD_CANONICAL_TIERS) {
    const cost = getPartnerRewardPointCost(tier, now);
    const label = PARTNER_REWARD_LABELS[tier];
    const costText =
      isPartnerRewardDiscountActive(now) && cost < tier
        ? `**__\`${cost}\`__** partner ~~${tier}~~`
        : `**__\`${cost}\`__** partner`;
    lines.push(`<:VC_Dot:1482532364222595303> ${costText} <a:vegarightarrow:1443673039156936837> **${label}**`);
  }
  return lines;
}

export = {
  PARTNER_REWARD_CANONICAL_TIERS,
  PARTNER_REWARD_LABELS,
  isPartnerRewardDiscountActive,
  getPartnerRewardPointCost,
  partnerManagerRedeemButtonLabel,
  buildPartnerRewardDiscountBanner,
  buildPartnerRewardDiscordEmbedLines,
};
