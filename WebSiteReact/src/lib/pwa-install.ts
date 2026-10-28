/** Detection + install PWA — condivisa tra /app/ e banner. */

export type InstallSurface =
  | "standalone"
  | "ios-safari"
  | "ios-other"
  | "android"
  | "desktop"
  | "in-app";

export type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};

const LS_INSTALLED = "vc_pwa_installed_v1";
/** Stesso flag del resume-boot: messo a 1 alla prima apertura dall’icona Home. */
const LS_SHELL = "vc-pwa-shell";
const CHROME_PREFS = "/webhooks/site-chrome-prefs";

type BipListener = (evt: BIPEvent | null) => void;

let captureStarted = false;
let bipHeld: BIPEvent | null = null;
const bipListeners = new Set<BipListener>();

export function isStandalone(): boolean {
  try {
    if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
    const modes = ["standalone", "fullscreen", "minimal-ui", "window-controls-overlay"] as const;
    return modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches);
  } catch {
    return false;
  }
}

/** iPhone / iPad anche con “Sito desktop” o iPadOS che si spaccia per Mac. */
export function isAppleTouchDevice(): boolean {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  try {
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  } catch {
    /* ignore */
  }
  if (/Macintosh/i.test(ua) && typeof document !== "undefined" && "ontouchend" in document) return true;
  return false;
}

export function detectInstallSurface(): InstallSurface {
  if (typeof window === "undefined") return "desktop";
  if (isStandalone()) return "standalone";
  const ua = navigator.userAgent || "";
  const inApp =
    /Instagram|FBAN|FBAV|Line\/|TikTok|Twitter|LinkedInApp|Snapchat|Pinterest|MicroMessenger|; wv\)|WebView/i.test(
      ua,
    );
  if (inApp) return "in-app";

  if (isAppleTouchDevice()) {
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) return "ios-other";
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Chrome|Firefox/i.test(ua);
    return safari || /Macintosh/i.test(ua) ? "ios-safari" : "ios-other";
  }

  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function markPwaInstalled() {
  try {
    localStorage.setItem(LS_INSTALLED, "1");
    localStorage.setItem(LS_SHELL, "1");
  } catch {
    /* ignore */
  }
}

export function rememberedPwaInstalled(): boolean {
  try {
    return localStorage.getItem(LS_INSTALLED) === "1" || localStorage.getItem(LS_SHELL) === "1";
  } catch {
    return false;
  }
}

/** Push sul profilo Discord: Safari e PWA iOS non condividono localStorage. */
export async function syncPwaInstalledToChromePrefs(token: string | null | undefined) {
  if (!token || typeof window === "undefined") return;
  try {
    await fetch(CHROME_PREFS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ prefs: { pwaInstalled: true, pwaInstalledAt: Date.now() } }),
    });
  } catch {
    /* ignore */
  }
}

async function pullPwaInstalledFromChromePrefs(token: string | null | undefined): Promise<boolean> {
  if (!token || typeof window === "undefined") return false;
  try {
    const r = await fetch(CHROME_PREFS, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    if (!r.ok) return false;
    const body = (await r.json()) as { ok?: boolean; anonymous?: boolean; prefs?: { pwaInstalled?: boolean } };
    if (body.anonymous) return false;
    if (body.prefs?.pwaInstalled === true) {
      markPwaInstalled();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/**
 * Standalone / related apps / flag locale / account chrome-prefs.
 * Su iOS Safari↔PWA lo storage è isolato: senza login o tap «Ce l'ho già» Safari non può saperlo.
 */
export async function detectPwaAlreadyInstalled(token?: string | null): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isStandalone()) {
    markPwaInstalled();
    void syncPwaInstalledToChromePrefs(token);
    return true;
  }
  try {
    if (/[?&]app=/.test(String(location.search || ""))) {
      markPwaInstalled();
      void syncPwaInstalledToChromePrefs(token);
      return true;
    }
    if (sessionStorage.getItem("vc-pwa-cold-app")) {
      markPwaInstalled();
      void syncPwaInstalledToChromePrefs(token);
      return true;
    }
  } catch {
    /* ignore */
  }
  if (rememberedPwaInstalled()) return true;
  if (await pullPwaInstalledFromChromePrefs(token)) return true;
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps === "function") {
      const apps = await nav.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0) {
        markPwaInstalled();
        void syncPwaInstalledToChromePrefs(token);
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return false;
}

/** Conferma manuale (Safari iOS): marca locale + account. */
export async function confirmPwaInstalledByUser(token?: string | null) {
  markPwaInstalled();
  await syncPwaInstalledToChromePrefs(token);
}

export function getHeldBip(): BIPEvent | null {
  return bipHeld;
}

export function subscribeBip(listener: BipListener): () => void {
  ensurePwaInstallCapture();
  bipListeners.add(listener);
  if (bipHeld) listener(bipHeld);
  return () => {
    bipListeners.delete(listener);
  };
}

export async function promptHeldBip(token?: string | null): Promise<"accepted" | "dismissed" | "unavailable"> {
  ensurePwaInstallCapture();
  const evt = bipHeld;
  if (!evt) return "unavailable";
  try {
    await evt.prompt();
    const choice = await evt.userChoice;
    bipHeld = null;
    bipListeners.forEach((l) => l(null));
    if (choice.outcome === "accepted") {
      markPwaInstalled();
      void syncPwaInstalledToChromePrefs(token);
      return "accepted";
    }
    return "dismissed";
  } catch {
    bipHeld = null;
    bipListeners.forEach((l) => l(null));
    return "unavailable";
  }
}

/** Cattura BIP al primo import client — evita di perdere l'evento prima di /app/. */
export function ensurePwaInstallCapture(token?: string | null) {
  if (typeof window === "undefined" || captureStarted) return;
  captureStarted = true;

  if (isStandalone()) {
    markPwaInstalled();
    void syncPwaInstalledToChromePrefs(token);
  }

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    bipHeld = e as BIPEvent;
    bipListeners.forEach((l) => l(bipHeld));
  });

  window.addEventListener("appinstalled", () => {
    markPwaInstalled();
    void syncPwaInstalledToChromePrefs(token);
    bipHeld = null;
    bipListeners.forEach((l) => l(null));
  });
}
