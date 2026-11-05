/**
 * AdInPlay rewarded video — solo on-demand dal gate puzzle.
 * Mai in layout / mai click hijack. Pub ID: NEXT_PUBLIC_ADINPLAY_PUB (es. XXX/viniliecaffe.it).
 */

export type AdInPlayResult = "granted" | "canceled" | "error" | "off";

type AipPlayer = {
  startRewardedAd: () => void;
};

type AipTag = {
  cmd: {
    player: Array<() => void>;
    display: Array<() => void>;
  };
  cmp?: {
    show?: boolean;
    position?: string;
    button?: boolean;
    buttonText?: string;
    buttonPosition?: string;
  };
  adplayer?: AipPlayer;
};

declare global {
  interface Window {
    aiptag?: AipTag;
    aipPlayer?: new (opts: Record<string, unknown>) => AipPlayer;
  }
}

const SCRIPT_ID = "vc-adinplay-tag";
const PREROLL_ID = "vc-adinplay-preroll";

let loadPromise: Promise<boolean> | null = null;
let playerInited = false;
let pending: {
  resolve: (r: AdInPlayResult) => void;
  granted: boolean;
  timer: number;
} | null = null;

function readPubId(): string {
  return (process.env.NEXT_PUBLIC_ADINPLAY_PUB || "").trim().replace(/^\/+|\/+$/g, "");
}

export function adinplayConfigured() {
  return Boolean(readPubId());
}

function ensurePrerollEl() {
  let el = document.getElementById(PREROLL_ID);
  if (el) return el;
  el = document.createElement("div");
  el.id = PREROLL_ID;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;inset:0;z-index:2147483000;display:none;pointer-events:none;background:#000";
  document.body.appendChild(el);
  return el;
}

function showPreroll(on: boolean) {
  const el = ensurePrerollEl();
  el.style.display = on ? "block" : "none";
  el.style.pointerEvents = on ? "auto" : "none";
}

function settle(r: AdInPlayResult) {
  if (!pending) return;
  window.clearTimeout(pending.timer);
  const { resolve } = pending;
  pending = null;
  showPreroll(false);
  resolve(r);
}

function bootGlobals() {
  const w = window;
  w.aiptag = w.aiptag || { cmd: { player: [], display: [] } };
  w.aiptag.cmd.player = w.aiptag.cmd.player || [];
  w.aiptag.cmd.display = w.aiptag.cmd.display || [];
  w.aiptag.cmp = {
    show: true,
    position: "centered",
    button: false,
    buttonText: "Privacy",
    buttonPosition: "bottom-left",
  };
}

function initPlayerOnce() {
  if (playerInited || !window.aipPlayer) return false;
  window.aiptag!.adplayer = new window.aipPlayer({
    AD_WIDTH: 960,
    AD_HEIGHT: 540,
    AD_DISPLAY: "fullscreen",
    LOADING_TEXT: "Caricamento pubblicità…",
    PREROLL_ELEM: () => {
      showPreroll(true);
      return ensurePrerollEl();
    },
    AIP_REWARDEDGRANTED: () => {
      if (pending) pending.granted = true;
    },
    AIP_REWARDEDCOMPLETE: (evt?: string) => {
      const status = String(evt || "").toLowerCase();
      if (pending?.granted || status === "granted") settle("granted");
      else if (status === "canceled" || status === "cancelled") settle("canceled");
      else if (status === "error") settle("error");
      else settle(pending?.granted ? "granted" : "canceled");
    },
    AIP_COMPLETE: () => showPreroll(false),
  });
  playerInited = true;
  return true;
}

export function ensureAdInPlay(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const pubId = readPubId();
  if (!pubId) return Promise.resolve(false);
  if (playerInited && window.aiptag?.adplayer) return Promise.resolve(true);
  if (loadPromise) return loadPromise;

  bootGlobals();
  ensurePrerollEl();

  loadPromise = new Promise<boolean>((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      if (!ok) loadPromise = null;
      resolve(ok);
    };

    window.aiptag!.cmd.player.push(() => {
      finish(initPlayerOnce());
    });

    if (!document.getElementById(SCRIPT_ID)) {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.async = true;
      s.src = `https://api.adinplay.com/libs/aiptag/pub/${pubId}/tag.min.js`;
      s.onerror = () => finish(false);
      document.head.appendChild(s);
    }

    window.setTimeout(() => {
      if (playerInited) finish(true);
      else finish(false);
    }, 12_000);
  });

  return loadPromise;
}

/** Rewarded on-demand. Solo dopo click utente sul gate. */
export function showAdInPlayRewarded(): Promise<AdInPlayResult> {
  if (typeof window === "undefined") return Promise.resolve("off");
  if (!adinplayConfigured()) return Promise.resolve("off");

  return ensureAdInPlay().then((ok) => {
    if (!ok || !window.aiptag?.adplayer) return "error" as const;

    return new Promise<AdInPlayResult>((resolve) => {
      if (pending) {
        settle("canceled");
      }
      pending = {
        resolve,
        granted: false,
        timer: window.setTimeout(() => settle("error"), 90_000),
      };

      window.aiptag!.cmd.player.push(() => {
        try {
          if (!initPlayerOnce() && !window.aiptag?.adplayer) {
            settle("error");
            return;
          }
          showPreroll(true);
          window.aiptag!.adplayer!.startRewardedAd();
        } catch {
          settle("error");
        }
      });
    });
  });
}
