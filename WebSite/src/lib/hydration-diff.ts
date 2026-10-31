/**
 * Errore React #418 (pagina del server diversa da quella del browser): in produzione React non dice
 * quale testo cambia. Uno script in fondo al <body> salva il testo visibile della pagina (header e footer
 * compresi) come arriva dal server; all'errore lo si confronta con quello disegnato dal browser.
 * Il testo che c'è solo nel browser (parti disegnate dopo, come elenchi caricati dall'API) viene saltato:
 * si cerca il primo pezzo del server che nel browser è cambiato o sparito. Si mandano solo pochi caratteri.
 */

/* stesso giro di visibleText qui sotto: nodi di testo del body, senza script, stili e template */
const WALK =
  'function(r){var o="",w=document.createTreeWalker(r,4,{acceptNode:function(n){for(var p=n.parentNode;p&&p!==r;p=p.parentNode){var t=p.nodeName;if(t==="SCRIPT"||t==="STYLE"||t==="NOSCRIPT"||t==="TEMPLATE")return 2}return 1}}),n;while(n=w.nextNode())o+=n.nodeValue;return o}';

/* lo script è l'ultimo elemento del body: quando gira, tutto quello che sta sopra è già letto e React non ha ancora toccato niente */
export const SSR_TEXT_SNAPSHOT_BOOT = `try{if(window.__VC_SSR_TEXT==null&&document.body)window.__VC_SSR_TEXT=(${WALK})(document.body)}catch(e){}`;

const AROUND = 60;
/* quanto testo del server deve ritrovarsi uguale nel browser per dire "qui c'è solo un'aggiunta" */
const KEY = 24;
const MAX_ADDED = 20000;

export function isHydrationMismatch(message: string) {
  return /Minified React error #4(18|19|23|25)\b|Hydration failed|hydrat/i.test(String(message || ""));
}

function visibleText(root: Node) {
  let out = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      for (let p = node.parentNode; p && p !== root; p = p.parentNode) {
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) out += n.nodeValue || "";
  return out;
}

const clip = (s: string, from: number, to: number) => s.slice(Math.max(0, from), to).replace(/\s+/g, " ");

/**
 * Primo punto in cui il testo del server cambia nel browser, oppure null.
 * kind "change": un pezzo del server è diverso o sparito (è lì il #418).
 * kind "added": il server c'è tutto, il browser ha solo aggiunto testo (il #418 è altrove, es. attributi).
 */
export function describeHydrationDiff(): string | null {
  try {
    const ssr = String((window as unknown as { __VC_SSR_TEXT?: string }).__VC_SSR_TEXT ?? "");
    const live = visibleText(document.body);
    if (!ssr || ssr === live) return null;
    let i = 0;
    let j = 0;
    let added: { at: number; text: string } | null = null;
    while (i < ssr.length) {
      if (j < live.length && ssr[i] === live[j]) {
        i += 1;
        j += 1;
        continue;
      }
      const key = ssr.slice(i, i + KEY);
      const k = live.indexOf(key, j);
      if (key.length >= Math.min(8, ssr.length - i) && k !== -1 && k - j <= MAX_ADDED) {
        if (!added) added = { at: i, text: clip(live, j, Math.min(k, j + AROUND * 2)) };
        j = k;
        continue;
      }
      return JSON.stringify({
        kind: "change",
        at: i,
        ssrLen: ssr.length,
        liveLen: live.length,
        before: clip(ssr, i - AROUND, i),
        server: clip(ssr, i, i + AROUND),
        browser: clip(live, j, j + AROUND),
      });
    }
    if (!added) return null;
    return JSON.stringify({ kind: "added", at: added.at, ssrLen: ssr.length, liveLen: live.length, before: clip(ssr, added.at - AROUND, added.at), browser: added.text });
  } catch {
    return null;
  }
}
