// Tipi di "compatibilità JavaScript" per il codice dei bot (solo IDE: non finisce nel JS compilato).
// Nessun import reale: in locale non c’è node_modules (compile sulla VPS).

declare global {
  // Il codice scorre oggetti di forma libera (dati Mongo, JSON, mappe costruite al volo):
  // Object.entries/values danno valori `any` come in JS, invece di `unknown`.
  interface ObjectConstructor {
    entries(o: any): [string, any][];
    values(o: any): any[];
  }
}

export {};
