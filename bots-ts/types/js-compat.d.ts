// Tipi di "compatibilità JavaScript" per il codice dei bot (solo controllo dei tipi: non finisce nel JS compilato).
// Il codice viene da JavaScript e scorre oggetti di forma libera (dati Mongo, JSON, mappe costruite al volo):
// qui Object.entries/values danno valori `any` come in JS, invece di `unknown`.

interface ObjectConstructor {
  entries(o: any): [string, any][];
  values(o: any): any[];
}
