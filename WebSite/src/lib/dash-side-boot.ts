/**
 * Boot sincrono (head): sidebar della dashboard fissata con la puntina → `data-dash-pin` su <html>
 * prima del primo disegno, così lo spazio a sinistra c'è già e il contenuto non salta (CLS).
 * La chiave è la stessa che scrive DashboardShell.
 */
export const DASH_PIN_KEY = "vc-dash-side-pin";
export const DASH_SIDE_BOOT = `(function(){try{if(localStorage.getItem("${DASH_PIN_KEY}")==="1")document.documentElement.setAttribute("data-dash-pin","")}catch(e){}})();`;
