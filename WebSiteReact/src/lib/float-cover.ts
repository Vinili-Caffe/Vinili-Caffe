/** Hide float UI quando overlap reale con footer/card (parity floatCoverFix1). */

export const FLOAT_COVER_SEL =
  "footer, [data-vc-float-cover], [data-vc-cookie-banner], .vc-cookie-banner";

const FLOAT_PEERS =
  "#vc-site-back-top, [data-vc-float], [data-vc-live-corner], [data-vc-social-phone]";

function overlapArea(a: DOMRect, b: DOMRect) {
  const left = Math.max(a.left, b.left);
  const right = Math.min(a.right, b.right);
  const top = Math.max(a.top, b.top);
  const bottom = Math.min(a.bottom, b.bottom);
  const w = right - left;
  const h = bottom - top;
  if (w <= 0 || h <= 0) return 0;
  return w * h;
}

function floatHitsCoverRects(r: DOMRect) {
  const nodes = document.querySelectorAll(FLOAT_COVER_SEL);
  const floatA = Math.max(1, r.width * r.height);
  for (let i = 0; i < nodes.length; i++) {
    const fr = nodes[i]!.getBoundingClientRect();
    const area = overlapArea(r, fr);
    if (area < 1) continue;
    /* overlap sostanziale (≥28% del float o ≥36px²) — non solo bordo vicino */
    if (area >= 36 && area / floatA >= 0.28) return true;
  }
  return false;
}

function pointHitsSolid(x: number, y: number) {
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
  let under: Element | null = null;
  try {
    under = document.elementFromPoint(x, y);
  } catch {
    return false;
  }
  if (!under || under === document.documentElement || under === document.body) return false;
  if (under.closest("header, [data-vc-float], #vc-site-back-top, [data-vc-live-corner]")) return false;
  return Boolean(under.closest(FLOAT_COVER_SEL));
}

/** True se `el` copre footer/card in modo sostanziale. */
export function floatCoversContent(el: HTMLElement | null): boolean {
  if (!el || el.hidden) return false;
  const alreadyHidden = el.dataset.vcFloatHidden === "1";
  const cs = window.getComputedStyle(el);
  if (!alreadyHidden && (cs.display === "none" || cs.visibility === "hidden")) return false;

  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return false;
  const vh = window.innerHeight || 0;
  if (r.bottom < 0 || r.top > vh) return false;

  if (floatHitsCoverRects(r)) return true;

  const peers = document.querySelectorAll<HTMLElement>(FLOAT_PEERS);
  const restored: string[] = [];
  peers.forEach((p) => {
    restored.push(p.style.pointerEvents);
    p.style.pointerEvents = "none";
  });

  let hits = 0;
  if (pointHitsSolid(r.left + r.width * 0.5, r.top + r.height * 0.5)) hits += 1;
  if (pointHitsSolid(r.left + r.width * 0.35, r.top + r.height * 0.72)) hits += 1;
  if (pointHitsSolid(r.left + r.width * 0.65, r.top + r.height * 0.72)) hits += 1;

  peers.forEach((p, i) => {
    p.style.pointerEvents = restored[i] || "";
  });

  return hits >= 2;
}
