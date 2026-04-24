# Playbook moderazione

## Purge

- `+purge 50` elimina fino a 50 messaggi.
- `+purge @utente 50` filtra per utente.
- Per messaggi vecchi, il bot può cancellare in singolo (più lento).

## Warn e sanzioni

- Usare warn con motivazione chiara.
- Escalation: warn -> timeout -> ban, secondo policy staff.
- Evitare sanzioni senza evidenze in log.

## Verifica problemi comuni

- "Permesso negato": controllare ruoli richiesti.
- "Comando bloccato": verificare lock sicurezza attivi.
- "Bot non risponde": controllare rate limit, coda e stato processo.