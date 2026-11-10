/**
 * Errore → frase per chi usa il bot, senza dettagli tecnici (quelli restano nei log).
 * Copre i codici di Discord più comuni; il resto diventa un messaggio generico.
 */
const DISCORD_CODES: Record<number, string> = {
  10003: "Quel canale non esiste più.",
  10004: "Il server non è raggiungibile.",
  10007: "Quella persona non è nel server.",
  10008: "Quel messaggio non esiste più.",
  10011: "Quel ruolo non esiste più.",
  10013: "Utente non trovato.",
  10026: "Quella persona non è bannata.",
  30005: "Il server ha già il numero massimo di ruoli.",
  30013: "Il server ha già il numero massimo di canali.",
  40007: "Quella persona è bannata da questo server.",
  50001: "Il bot non può accedere a quel canale.",
  50007: "Non posso mandare messaggi privati a quella persona.",
  50013: "Al bot mancano i permessi per farlo (o il suo ruolo è più in basso di quello da gestire).",
  50028: "Quel ruolo non è valido.",
  50035: "Alcuni dati non sono validi.",
};

function friendlyError(err?, fallback = "Qualcosa è andato storto. Riprova tra poco.") {
  const code = Number(err?.code ?? err?.rawError?.code);
  if (Number.isFinite(code) && DISCORD_CODES[code]) return DISCORD_CODES[code];
  const status = Number(err?.status ?? err?.httpStatus);
  if (status === 429) return "Troppe richieste in poco tempo: riprova tra qualche secondo.";
  if (status === 403) return DISCORD_CODES[50013];
  return fallback;
}

export = { friendlyError };
