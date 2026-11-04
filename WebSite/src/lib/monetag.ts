/**
 * Monetag (ex-PropellerAds family) — provider scelto per il gate puzzle.
 * Motivo: rewarded/onclick adatto a “guarda e sblocca”, accetta siti piccoli/IT,
 * più realistico di Taboola/Mediavine dopo un no di AdSense.
 *
 * Dashboard: https://monetag.com → crea zona Website (OnClick / Vignette / Interstitial)
 * oppure Rewarded Interstitial se ti danno l’SDK `show_ZONE`.
 *
 * Env Vercel:
 * - NEXT_PUBLIC_MONETAG_ZONE_ID
 * - NEXT_PUBLIC_MONETAG_SCRIPT_SRC  (URL completo dello script copiato dal dashboard)
 */

export type MonetagConfig = {
  zoneId: string;
  scriptSrc: string;
  showFn: string;
};

export function readMonetagConfig(): MonetagConfig | null {
  const zoneId = String(process.env.NEXT_PUBLIC_MONETAG_ZONE_ID || "").trim();
  const scriptSrc = String(process.env.NEXT_PUBLIC_MONETAG_SCRIPT_SRC || "").trim();
  if (!zoneId || !scriptSrc) return null;
  try {
    const u = new URL(scriptSrc, "https://example.com");
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  } catch {
    return null;
  }
  const showFn =
    String(process.env.NEXT_PUBLIC_MONETAG_SHOW_FN || "").trim() || `show_${zoneId}`;
  return { zoneId, scriptSrc, showFn };
}

export function monetagConfigured() {
  return readMonetagConfig() != null;
}

declare global {
  interface Window {
    [key: `show_${string}`]: ((opts?: Record<string, unknown>) => Promise<unknown>) | undefined;
  }
}

/** Carica il tag Monetag una sola volta. */
export function ensureMonetagScript(cfg: MonetagConfig): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const existing = document.getElementById("vc-monetag-sdk") as HTMLScriptElement | null;
  if (existing) {
    if ((existing as HTMLScriptElement & { dataset: DOMStringMap }).dataset.ready === "1") {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("monetag_script_error")), { once: true });
    });
  }

  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.id = "vc-monetag-sdk";
    s.async = true;
    s.src = cfg.scriptSrc;
    s.dataset.zone = cfg.zoneId;
    s.dataset.sdk = cfg.showFn;
    s.onload = () => {
      s.dataset.ready = "1";
      resolve();
    };
    s.onerror = () => reject(new Error("monetag_script_error"));
    document.head.appendChild(s);
  });
}

function getShowFn(cfg: MonetagConfig) {
  const fn = (window as unknown as Record<string, unknown>)[cfg.showFn];
  return typeof fn === "function" ? (fn as (opts?: Record<string, unknown>) => Promise<unknown>) : null;
}

/** Preload se l’SDK rewarded è disponibile (no-op altrimenti). */
export async function preloadMonetagAd(cfg: MonetagConfig, ymid?: string) {
  await ensureMonetagScript(cfg);
  const show = getShowFn(cfg);
  if (!show) return false;
  try {
    await show({ type: "preload", timeout: 8, ymid, requestVar: "puzzle" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Mostra l’annuncio.
 * - Se c’è `show_ZONE` (Rewarded SDK) → Promise al close/verify.
 * - Altrimenti (tag Website OnClick/Vignette) → true dopo load; il click del bottone
 *   attiva il formato OnClick del network.
 */
export async function showMonetagAd(cfg: MonetagConfig, ymid?: string): Promise<"sdk" | "tag"> {
  await ensureMonetagScript(cfg);
  const show = getShowFn(cfg);
  if (show) {
    const result = (await show({ ymid, requestVar: "puzzle" })) as { reward_event_type?: string } | undefined;
    // Con postback: premio solo se valued; senza postback resolve al close.
    if (result && typeof result === "object" && "reward_event_type" in result) {
      if (result.reward_event_type !== "valued") {
        throw new Error("monetag_not_valued");
      }
    }
    return "sdk";
  }
  return "tag";
}
