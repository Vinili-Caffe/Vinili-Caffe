# Security Policy

## Reporting a Vulnerability

Se trovi una vulnerabilità di sicurezza in questo repository, nel sito [viniliecaffe.it](https://www.viniliecaffe.it) o nei bot Discord **Vinili** / **Caffè**, segnalala in modo **privato**.

**Non aprire issue pubbliche** e non pubblicare dettagli, PoC o exploit su Discord, social o forum.

### Come segnalare

1. **Preferito:** [GitHub Security Advisories](https://github.com/ignLoree/Vinili-Caffe/security/advisories/new) → *Report a vulnerability* (se abilitato sul repo).
2. **In alternativa:** ticket sul sito o messaggio allo **High Staff** su Discord ([discord.gg/viniliecaffe](https://discord.gg/viniliecaffe)), indicando chiaramente che è una segnalazione di sicurezza.

Includi, se possibile:

- descrizione del problema e impatto stimato
- passi per riprodurlo (senza dati personali di terzi)
- ambiente (browser, bot, endpoint, versione, ecc.)
- eventuale PoC minimo

### Cosa aspettarsi

- Accuseremo ricezione quando possibile.
- Risponderemo con esito (confermata / rifiutata / già nota) e, se confermata, con piano di fix.
- Se hai lasciato un contatto, ti aggiorneremo quando la correzione sarà in produzione.

Non offriamo un bug bounty monetario strutturato; le segnalazioni serie e responsabili sono comunque apprezzate.

## Scope

**In scope** (esempi):

- autenticazione / sessione sito e webhook
- escalation di privilegi (ruoli Discord ↔ sito, strumenti staff)
- injection, XSS, CSRF, IDOR su API / webhook
- esposizione di secret, token o dati personali
- abuso di endpoint interni (streaming serata film, push, ecc.)

**Fuori scope** (salvo abuso grave):

- DoS / flood senza vulnerabilità specifica
- software di terze parti non modificato da noi (Discord, Vercel, Cloudflare, …) — segnalalo al vendor
- social engineering verso utenti
- problemi puramente cosmetici o di UX

## Supported Versions

Correggiamo i problemi di sicurezza sulla **versione in produzione** (bot su VPS e sito deployato). Branch locali, fork e archivi storici non sono supportati.

| Versione        | Supportata |
| --------------- | ---------- |
| Produzione live | ✅         |
| Altro           | ❌         |

## Secret e credenziali

Se ritieni di aver trovato o esposto un secret (token bot, chiavi R2, webhook, ecc.):

1. segnalalo subito in privato come sopra
2. **non** commitarlo di nuovo né condividerlo
3. ruoteremo / invalideremo le credenziali coinvolte

## Coordinated disclosure

Chiediamo di attendere la correzione (o una finestra ragionevole dopo la nostra risposta) prima di qualsiasi disclosure pubblica.

Grazie per aiutare a tenere al sicuro la community di Vinili & Caffè.
