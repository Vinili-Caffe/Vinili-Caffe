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
  // Safari iOS in modalità desktop: Macintosh + touch
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
    const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Chrome|Firefox/i.test(ua);
    // Con UA desktop spoofato spesso manca Safari “pulito”: resta comunque iOS
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua)) return "ios-other";
    return safari || /Macintosh/i.test(ua) ? "ios-safari" : "ios-other";
  }

  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

export function markPwaInstalled() {
  try {
    localStorage.setItem(LS_INSTALLED, "1");
  } catch {
    /* ignore */
  }
}

export function rememberedPwaInstalled(): boolean {
  try {
    return localStorage.getItem(LS_INSTALLED) === "1";
  } catch {
    return false;
  }
}

/** Standalone, related apps Chromium, o flag locale dopo install precedente. */
export async function detectPwaAlreadyInstalled(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (isStandalone()) {
    markPwaInstalled();
    return true;
  }
  try {
    const nav = navigator as Navigator & {
      getInstalledRelatedApps?: () => Promise<Array<{ platform?: string; url?: string }>>;
    };
    if (typeof nav.getInstalledRelatedApps === "function") {
      const apps = await nav.getInstalledRelatedApps();
      if (Array.isArray(apps) && apps.length > 0) {
        markPwaInstalled();
        return true;
      }
    }
  } catch {
    /* ignore */
  }
  return rememberedPwaInstalled();
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

export async function promptHeldBip(): Promise<"accepted" | "dismissed" | "unavailable"> {
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
export function ensurePwaInstallCapture() {
  if (typeof window === "undefined" || captureStarted) return;
  captureStarted = true;

  if (isStandalone()) markPwaInstalled();

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    bipHeld = e as BIPEvent;
    bipListeners.forEach((l) => l(bipHeld));
  });

  window.addEventListener("appinstalled", () => {
    markPwaInstalled();
    bipHeld = null;
    bipListeners.forEach((l) => l(null));
  });
}
