# Troubleshooting rapido

## Reminder bump non arriva

- Verificare canale reminder configurato.
- Verificare detection messaggi Disboard/Discadia.
- Verificare che il salvataggio stato bump/vote avvenga senza errori.

## Ticket claim dice già claimato

- Controllare valore `claimedBy` nel ticket.
- Se ticket non claimato ma errore persiste, rifare fetch ticket e riprovare.
- High Staff può forzare l'override sul claim.

## TTS warning connection destroyed

- Evitare destroy doppio su stessa voice connection.
- Usare guard sullo stato della connessione prima di destroy.

## AI lenta

- Su VPS CPU 4GB usare modello piccolo.
- Limitare `num_predict` e `num_ctx`.
- Tenere modello caldo con `keep_alive`.