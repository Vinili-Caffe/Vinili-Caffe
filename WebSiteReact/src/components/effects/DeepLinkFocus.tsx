"use client";

import { useEffect } from "react";

// classi scritte per intero qui, così Tailwind le genera
const HIGHLIGHT = ["outline-2", "outline-offset-4", "outline-ember", "shadow-[0_0_40px_-6px_rgba(240,180,110,0.75)]"];
const WAIT_MS = 16_000;

/** Elemento indicato dall'indirizzo: #id, oppure data-deeplink="…" (più chiavi separate da spazio). */
function findTarget(key: string): HTMLElement | null {
  if (!key) return null;
  const byId = document.getElementById(key);
  if (byId) return byId;
  try {
    return document.querySelector<HTMLElement>(`[data-deeplink~="${CSS.escape(key)}"]`);
  } catch {
    return null;
  }
}

/** Chiavi da cercare per l'indirizzo attuale: ancora, id query e parametri che indicano un contenuto preciso. */
export function deepLinkKeys(): string[] {
  const keys: string[] = [];
  const push = (k: string) => {
    const v = String(k || "").trim();
    if (v && !keys.includes(v)) keys.push(v);
  };

  const hash = decodeURIComponent(window.location.hash.slice(1) || "").trim();
  if (hash) {
    push(hash);
    // alias tipici delle notifiche: #vc-suggestion-<id> / #vc-conf-card-<id> / #vc-review-<id>
    const bare = hash.replace(/^(vc-suggestion-|vc-conf-card-|vc-review-|vc-bot-feedback-)/i, "");
    if (bare && bare !== hash) {
      push(bare);
      push(`vc-suggestion-${bare}`);
      push(`vc-conf-card-${bare}`);
      push(`vc-review-${bare}`);
      push(`vc-bot-feedback-${bare}`);
    }
  }

  const q = new URLSearchParams(window.location.search);
  for (const p of ["ticketId", "pauseId", "resoId", "chat", "message", "focus", "staffOpen", "id", "ticket", "suggestion"]) {
    const v = (q.get(p) || "").trim();
    if (!v) continue;
    if (p === "id" || p === "ticket" || p === "ticketId") {
      push(`ticketId:${v}`);
      push(`id:${v}`);
      push(v);
      push(`vc-suggestion-${v}`);
      push(`vc-conf-card-${v}`);
      push(`vc-review-${v}`);
      push(`vc-bot-feedback-${v}`);
    } else if (p === "suggestion") {
      push(`vc-suggestion-${v}`);
      push(v);
    } else {
      push(`${p}:${v}`);
    }
  }
  return keys;
}

function viewStateBusy(): boolean {
  try {
    return Boolean((window as Window & { __vcViewStateRestoring?: boolean }).__vcViewStateRestoring);
  } catch {
    return false;
  }
}

function focusEl(el: HTMLElement) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scroll = () => {
    try {
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth", inline: "nearest" });
    } catch {
      el.scrollIntoView(true);
    }
  };
  // più passate: il layout (sheet, gate, immagini) può spostare l'ancora subito dopo
  scroll();
  window.setTimeout(scroll, 120);
  window.setTimeout(scroll, 420);
  window.setTimeout(scroll, 900);
  el.classList.add(...HIGHLIGHT);
  window.setTimeout(() => el.classList.remove(...HIGHLIGHT), 3600);
}

/**
 * Notifiche e link condivisi portano al contenuto vero, non solo alla pagina: si aspetta che il contenuto
 * arrivi dal server, lo si porta al centro dello schermo e si illumina per qualche secondo.
 * Le pagine segnano i loro elementi con id (es. vc-review-…) o data-deeplink (es. "pauseId:…").
 */
export function DeepLinkFocus() {
  useEffect(() => {
    let timer = 0;
    let stopAt = 0;
    let lastSig = "";
    let focusedSig = "";
    let mo: MutationObserver | null = null;

    const tryFocus = () => {
      if (viewStateBusy()) return false;
      const keys = deepLinkKeys();
      if (!keys.length) return false;
      const el = keys.map(findTarget).find(Boolean) as HTMLElement | undefined;
      if (!el) return false;
      const sig = `${location.pathname}|${keys.join("|")}`;
      if (focusedSig === sig) return true;
      focusedSig = sig;
      focusEl(el);
      return true;
    };

    const run = () => {
      const keys = deepLinkKeys();
      const sig = `${location.pathname}|${keys.join("|")}`;
      if (!keys.length) return;
      if (sig === lastSig && focusedSig === sig) return;
      lastSig = sig;
      focusedSig = "";
      stopAt = Date.now() + WAIT_MS;
      window.clearInterval(timer);
      mo?.disconnect();

      const tick = () => {
        if (tryFocus()) {
          window.clearInterval(timer);
          mo?.disconnect();
          return;
        }
        if (Date.now() >= stopAt) {
          window.clearInterval(timer);
          mo?.disconnect();
        }
      };

      timer = window.setInterval(tick, 200);
      try {
        mo = new MutationObserver(() => tick());
        mo.observe(document.documentElement, { childList: true, subtree: true });
      } catch {
        /* ignore */
      }
      tick();
    };

    const onNav = () => window.setTimeout(run, 40);
    run();
    window.addEventListener("hashchange", onNav);
    window.addEventListener("popstate", onNav);
    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    nav?.addEventListener("navigatesuccess", onNav);
    return () => {
      window.clearInterval(timer);
      mo?.disconnect();
      window.removeEventListener("hashchange", onNav);
      window.removeEventListener("popstate", onNav);
      nav?.removeEventListener("navigatesuccess", onNav);
    };
  }, []);
  return null;
}
