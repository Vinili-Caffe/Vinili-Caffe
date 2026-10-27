"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  clearPwaUiRestorePending,
  forceScrollTop,
  isPwaUiRestorePending,
  markPwaShell,
  navType,
  normalizePath,
  readPathScroll,
  readViewState,
  chaseScroll,
  resumePathFromLocation,
  shouldRestore,
  writePwaResume,
  writeViewState,
} from "@/lib/view-state";

/**
 * Salva scroll/hash + path PWA. Ripristina su F5 / back-forward / PTR / reopen PWA.
 * Su cambio path client → sempre top (telefono non deve ripartire dal basso).
 */
function navEntryKey(): string {
  try {
    const nav = (window as Window & { navigation?: { currentEntry?: { key?: string } | null } }).navigation;
    return String(nav?.currentEntry?.key || "");
  } catch {
    return "";
  }
}

/**
 * Stato del documento, FUORI dal componente: ViewState sta in SiteShell, che ogni pagina rimonta.
 * Con dei ref si perdeva tutto a ogni cambio pagina (e il "primo caricamento" azzerava la posizione).
 * Indietro/avanti = si torna su una voce di cronologia già vista: con la Navigation API ogni voce ha una
 * chiave stabile; senza l'API (vecchi Safari) basta popstate, che lì arriva prima del render.
 */
const DOC = { booted: false, lastPath: "", seen: new Set<string>(), pop: false, popBound: false };

export function ViewState() {
  const pathname = usePathname();

  useEffect(() => {
    if (DOC.popBound) return;
    DOC.popBound = true;
    window.addEventListener(
      "popstate",
      () => {
        DOC.pop = true;
      },
      { capture: true },
    );
  }, []);

  // Mount documento: eventuale restore una sola volta
  useEffect(() => {
    if (DOC.booted) return;
    DOC.booted = true;
    const firstKey = navEntryKey();
    if (firstKey) DOC.seen.add(firstKey);
    markPwaShell();
    const path = normalizePath(pathname);
    DOC.lastPath = path;
    /* Evento/puzzle: mai ripartire a meta pagina (restore → "carica dal fondo"). */
    const eventoPath = path === "/evento/" || path.startsWith("/evento/") || path === "/puzzle/" || path.startsWith("/puzzle/");
    if (eventoPath) {
      forceScrollTop();
      writeViewState({ path, y: 0, hash: "" });
      return;
    }
    // indietro/avanti o ricarica: la posizione di QUESTA pagina (memoria per pagina), altrimenti l'ultima salvata
    const nt = navType();
    const saved = ((nt === "back_forward" || nt === "reload") && readPathScroll(path)) || readViewState();
    const restore = shouldRestore(saved, path);

    if (!restore || !saved) {
      // non cancellare lo snapshot se stiamo per redirect PWA (home cold-start)
      if (!(path === "/" && isPwaUiRestorePending())) {
        forceScrollTop();
        writeViewState({ path, y: 0, hash: "" });
      }
      return;
    }

    // blocca ScrollToTop subito (prima dei timeout)
    window.__vcViewStateRestoring = true;
    window.__vcDiscardScrollRestore = 0;

    let cancelled = false;
    const finish = () => {
      window.setTimeout(() => {
        window.__vcViewStateRestoring = false;
        clearPwaUiRestorePending();
      }, 180);
    };
    const apply = () => {
      if (cancelled) return;
      if (saved.hash && saved.hash.startsWith("#")) {
        const id = decodeURIComponent(saved.hash.slice(1));
        const el = id ? document.getElementById(id) : null;
        if (el) {
          el.scrollIntoView({ block: "start" });
          finish();
          return;
        }
      }
      chaseScroll(saved.y, finish);
    };

    window.setTimeout(apply, 60);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al primo mount documento
  }, []);

  // Navigazione SPA / cambio path: sempre top (no mid da LS) — salvo resume PWA in corso
  useEffect(() => {
    const path = normalizePath(pathname);
    if (!DOC.lastPath) {
      DOC.lastPath = path;
      return;
    }
    if (DOC.lastPath === path) return;
    DOC.lastPath = path;
    const eventoPath =
      path === "/evento/" || path.startsWith("/evento/") || path === "/puzzle/" || path.startsWith("/puzzle/");
    const key = navEntryKey();
    const traverse = key ? DOC.seen.has(key) : DOC.pop;
    if (key) DOC.seen.add(key);
    DOC.pop = false;
    if (eventoPath) {
      window.__vcViewStateRestoring = false;
      forceScrollTop();
      writeViewState({ path, y: 0, hash: "" });
      window.requestAnimationFrame(() => forceScrollTop());
      window.setTimeout(() => forceScrollTop(), 50);
      window.setTimeout(() => forceScrollTop(), 200);
      return;
    }
    if (traverse && !window.location.hash) {
      window.__vcViewStateRestoring = true;
      const st = readPathScroll(path);
      const y = st?.y ?? 0;
      const apply = () =>
        chaseScroll(y, () => {
          window.setTimeout(() => {
            window.__vcViewStateRestoring = false;
          }, 180);
        });
      window.requestAnimationFrame(apply);
      return;
    }
    if (window.location.hash) return;
    if (window.__vcViewStateRestoring || isPwaUiRestorePending()) return;
    forceScrollTop();
    writeViewState({ path, y: 0, hash: "" });
    writePwaResume(resumePathFromLocation(window.location.pathname, window.location.search, window.location.hash));
    window.requestAnimationFrame(() => forceScrollTop());
    window.setTimeout(() => forceScrollTop(), 50);
    window.setTimeout(() => forceScrollTop(), 200);
  }, [pathname]);

  useEffect(() => {
    const path = normalizePath(pathname);
    let ticking = false;

    const persist = () => {
      if (window.__vcViewStateRestoring) return;
      // cambio pagina in corso: il router di Next porta già in cima la pagina nuova, quello scroll non va
      // salvato come posizione della pagina vecchia (altrimenti "indietro" la riapre in cima)
      if (normalizePath(window.location.pathname) !== path) return;
      if (window.__vcDiscardScrollRestore) {
        const y = Math.max(0, Math.floor(window.scrollY || window.pageYOffset || 0));
        if (y < 8) return;
        window.__vcDiscardScrollRestore = 0;
      }
      writeViewState({
        path,
        y: Math.max(0, Math.floor(window.scrollY || window.pageYOffset || 0)),
        hash: String(window.location.hash || ""),
      });
      writePwaResume(resumePathFromLocation(window.location.pathname, window.location.search, window.location.hash));
    };

    const onScroll = () => {
      if (window.__vcViewStateRestoring) return;
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        persist();
      });
    };

    const onHide = () => persist();
    const onVis = () => {
      if (document.visibilityState === "hidden") onHide();
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onHide);
    window.addEventListener("freeze", onHide as EventListener);
    document.addEventListener("visibilitychange", onVis);

    // salva subito il path corrente in PWA (anche senza scroll)
    writePwaResume(resumePathFromLocation(window.location.pathname, window.location.search, window.location.hash));

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("freeze", onHide as EventListener);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [pathname]);

  return null;
}
