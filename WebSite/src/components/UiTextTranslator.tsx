"use client";

import { useEffect } from "react";
import { useI18n } from "@/lib/i18n";
import { loadUiDict, translateWith, uiTextLang } from "@/lib/i18n-text";

/**
 * Traduce sul posto i testi italiani dell'interfaccia quando la lingua non è l'italiano:
 * testi, segnaposto, suggerimenti (title) ed etichette accessibili. Osserva la pagina, quindi
 * copre anche menu, notifiche e finestre aperte dopo. Tornando all'italiano rimette i testi originali.
 *
 * Non tocca: campi in cui si scrive, codice, e tutto quello dentro [translate="no"] o
 * [data-vc-no-translate] (anteprime di messaggi, nomi di server/canali/utenti).
 */
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "CODE", "PRE", "KBD", "SAMP", "SVG"]);
/* dei campi si traducono solo segnaposto e suggerimenti, mai quello che c'è scritto dentro */
const FIELD_TAGS = new Set(["INPUT", "TEXTAREA"]);

type Orig = { original: string; shown: string };

export function UiTextTranslator() {
  const { locale } = useI18n();

  useEffect(() => {
    const lang = uiTextLang(locale);
    const textOrig = new WeakMap<Text, Orig>();
    const attrOrig = new WeakMap<Element, Map<string, Orig>>();
    let dict: Record<string, string> | null = null;
    let stopped = false;
    let applying = false;

    const skipped = (el: Element | null): boolean => {
      for (let e = el; e; e = e.parentElement) {
        if (SKIP_TAGS.has(e.tagName.toUpperCase())) return true;
        if (e.getAttribute("translate") === "no" || e.hasAttribute("data-vc-no-translate")) return true;
        if ((e as HTMLElement).isContentEditable) return true;
      }
      return false;
    };

    const doText = (node: Text) => {
      if (!dict) return;
      const cur = node.nodeValue || "";
      const prev = textOrig.get(node);
      /* se React ha cambiato il testo, quello nuovo è il nuovo originale */
      const original = prev && cur === prev.shown ? prev.original : cur;
      const next = translateWith(dict, original);
      if (next == null) {
        if (prev && cur === prev.shown && prev.shown !== prev.original) node.nodeValue = prev.original;
        textOrig.delete(node);
        return;
      }
      textOrig.set(node, { original, shown: next });
      if (cur !== next) node.nodeValue = next;
    };

    const doAttrs = (el: Element) => {
      if (!dict) return;
      for (const a of ATTRS) {
        const cur = el.getAttribute(a);
        if (cur == null) continue;
        const map = attrOrig.get(el) || new Map<string, Orig>();
        const prev = map.get(a);
        const original = prev && cur === prev.shown ? prev.original : cur;
        const next = translateWith(dict, original);
        if (next == null) {
          map.delete(a);
          continue;
        }
        map.set(a, { original, shown: next });
        attrOrig.set(el, map);
        if (cur !== next) el.setAttribute(a, next);
      }
    };

    const walk = (root: Node) => {
      if (root.nodeType === Node.TEXT_NODE) {
        if (!skipped((root as Text).parentElement)) doText(root as Text);
        return;
      }
      if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
      const el = root as Element;
      if (root.nodeType === Node.ELEMENT_NODE && FIELD_TAGS.has(el.tagName.toUpperCase())) {
        if (!skipped(el.parentElement)) doAttrs(el);
        return;
      }
      if (root.nodeType === Node.ELEMENT_NODE && skipped(el)) return;
      if (root.nodeType === Node.ELEMENT_NODE) doAttrs(el);
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          if (n.nodeType === Node.ELEMENT_NODE) {
            const e = n as Element;
            if (FIELD_TAGS.has(e.tagName.toUpperCase())) {
              doAttrs(e);
              return NodeFilter.FILTER_REJECT;
            }
            if (SKIP_TAGS.has(e.tagName.toUpperCase()) || e.getAttribute("translate") === "no" || e.hasAttribute("data-vc-no-translate") || (e as HTMLElement).isContentEditable) {
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) doText(n as Text);
        else doAttrs(n as Element);
      }
    };

    let queued = new Set<Node>();
    let raf = 0;
    const flush = () => {
      raf = 0;
      const nodes = queued;
      queued = new Set();
      applying = true;
      try {
        nodes.forEach((n) => n.isConnected && walk(n));
      } finally {
        applying = false;
      }
    };
    const observer = new MutationObserver((list) => {
      if (applying || !dict) return;
      for (const m of list) {
        if (m.type === "characterData") queued.add(m.target);
        else if (m.type === "attributes") queued.add(m.target);
        else m.addedNodes.forEach((n) => queued.add(n));
      }
      if (queued.size && !raf) raf = requestAnimationFrame(flush);
    });

    if (lang) {
      void loadUiDict(lang).then((d) => {
        if (stopped) return;
        dict = d;
        applying = true;
        try {
          walk(document.body);
        } finally {
          applying = false;
        }
        observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] });
      });
    }

    return () => {
      stopped = true;
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
      /* rimetti l'italiano dove avevamo tradotto (cambio lingua o uscita dalla pagina) */
      if (!dict) return;
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) {
          const o = textOrig.get(n as Text);
          if (o && n.nodeValue === o.shown) n.nodeValue = o.original;
        } else {
          const map = attrOrig.get(n as Element);
          map?.forEach((o, a) => {
            if ((n as Element).getAttribute(a) === o.shown) (n as Element).setAttribute(a, o.original);
          });
        }
      }
    };
  }, [locale]);

  return null;
}
