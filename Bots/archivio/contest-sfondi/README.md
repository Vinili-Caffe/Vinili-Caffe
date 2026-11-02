# Contest sfondi (archivio)

Contest unlisted swipe (Halloween 2026). **Non in calendario live.**

## Stato live

- `EVENTS` in `site/contest/siteContestApi.ts` è vuoto → list/highlight/status 404/empty
- Rotte HTTP `/webhooks/site-contest/*` restano (infra riusabile)
- **Mongo `sitecontests` + file upload: non cancellati** (voti/submission storici)

Snapshot evento: `events.sfondi-halloween.json`.

## Riattivazione

1. Rimetti la voce in `EVENTS` da questo snapshot (date/chiavi nuove).
2. Opzionale: ripubblica pagina React `/contest/<eventKey>/` in `WebSite`.
