// Tipi di "compatibilità JavaScript" per il codice dei bot (solo controllo dei tipi: non finisce nel JS compilato).
import "discord.js";

declare global {
  // Il codice scorre oggetti di forma libera (dati Mongo, JSON, mappe costruite al volo):
  // Object.entries/values danno valori `any` come in JS, invece di `unknown`.
  interface ObjectConstructor {
    entries(o: any): [string, any][];
    values(o: any): any[];
  }
}

// Il client Discord dei bot porta campi propri (config, commands, collezioni, timer…) aggiunti a runtime.
declare module "discord.js" {
  interface Client {
    [key: string]: any;
  }
}
