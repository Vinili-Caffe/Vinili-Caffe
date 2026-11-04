/**
 * Monetag — OnClick + Vignette (tag copiati dal dashboard).
 * Zone: 12194355 OnClick (al5sm.com), 12194356 Vignette (n6wxm.com).
 * Env opzionali per override: NEXT_PUBLIC_MONETAG_ONCLICK_*, NEXT_PUBLIC_MONETAG_VIGNETTE_*.
 */

export type MonetagTag = {
  id: string;
  zoneId: string;
  scriptSrc: string;
};

const DEFAULT_TAGS: MonetagTag[] = [
  {
    id: "onclick",
    zoneId: "12194355",
    scriptSrc: "https://al5sm.com/tag.min.js",
  },
  {
    id: "vignette",
    zoneId: "12194356",
    scriptSrc: "https://n6wxm.com/vignette.min.js",
  },
];

function envTag(id: string, zoneEnv: string, srcEnv: string, fallback: MonetagTag): MonetagTag {
  const zoneId = String(process.env[zoneEnv] || fallback.zoneId).trim();
  const scriptSrc = String(process.env[srcEnv] || fallback.scriptSrc).trim();
  return { id, zoneId, scriptSrc };
}

export function readMonetagTags(): MonetagTag[] {
  const onclick = envTag(
    "onclick",
    "NEXT_PUBLIC_MONETAG_ONCLICK_ZONE",
    "NEXT_PUBLIC_MONETAG_ONCLICK_SRC",
    DEFAULT_TAGS[0]!,
  );
  const vignette = envTag(
    "vignette",
    "NEXT_PUBLIC_MONETAG_VIGNETTE_ZONE",
    "NEXT_PUBLIC_MONETAG_VIGNETTE_SRC",
    DEFAULT_TAGS[1]!,
  );
  return [onclick, vignette].filter((t) => {
    if (!t.zoneId || !t.scriptSrc) return false;
    try {
      const u = new URL(t.scriptSrc);
      return u.protocol === "https:" || u.protocol === "http:";
    } catch {
      return false;
    }
  });
}

/** Config “principale” per il gate puzzle (OnClick). */
export function readMonetagConfig(): MonetagTag | null {
  return readMonetagTags().find((t) => t.id === "onclick") || readMonetagTags()[0] || null;
}

export function monetagConfigured() {
  return readMonetagTags().length > 0;
}

function scriptElId(tag: MonetagTag) {
  return `vc-monetag-${tag.id}-${tag.zoneId}`;
}

/** Inietta OnClick + Vignette una sola volta (come i tag del dashboard). */
export function ensureMonetagScripts(tags = readMonetagTags()): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  return Promise.all(
    tags.map(
      (tag) =>
        new Promise<void>((resolve) => {
          const id = scriptElId(tag);
          const existing = document.getElementById(id) as HTMLScriptElement | null;
          if (existing) {
            if (existing.dataset.ready === "1") {
              resolve();
              return;
            }
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => resolve(), { once: true });
            return;
          }
          const s = document.createElement("script");
          s.id = id;
          s.async = true;
          s.src = tag.scriptSrc;
          s.dataset.zone = tag.zoneId;
          s.onload = () => {
            s.dataset.ready = "1";
            resolve();
          };
          s.onerror = () => resolve();
          const parent = document.body || document.documentElement;
          parent.appendChild(s);
        }),
    ),
  ).then(() => undefined);
}

/** @deprecated alias — il gate usa ensureMonetagScripts */
export async function ensureMonetagScript(_cfg?: MonetagTag) {
  await ensureMonetagScripts();
}

export async function preloadMonetagAd(_cfg?: MonetagTag, _ymid?: string) {
  await ensureMonetagScripts();
  return true;
}

/**
 * OnClick/Vignette: dopo il load, il click utente sul bottone “Guarda” attiva gli ads.
 * Non c’è Promise rewarded: il gate usa il countdown.
 */
export async function showMonetagAd(_cfg?: MonetagTag, _ymid?: string): Promise<"tag"> {
  await ensureMonetagScripts();
  return "tag";
}
