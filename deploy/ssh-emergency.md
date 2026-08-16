# SSH VPS — emergenza e IP dinamico

## Perché ti sei bloccato fuori

`ufw allow from UN_SOLO_IP to port 22` → ogni cambio rete (4G, altro Wi‑Fi) = **timeout SSH**.

La protezione brute-force la fa **fail2ban**, non serve chiudere SSH a un solo IP.

## Config attesa (dopo fix)

- **UFW:** `22/tcp` aperto (da ovunque)
- **fail2ban:** ban temporaneo dopo troppi tentativi falliti
- **Console PebbleHost (VNC):** backup se fail2ban ti banna

## Se cambi IP e non entri più

1. Console VNC PebbleHost → login `root`
2. Il tuo IP attuale: `curl -s https://api.ipify.org` (dal PC) o vedi nei log
3. Sulla VPS:
   ```bash
   fail2ban-client set sshd unbanip TUO_IP
   ```
4. (Opzionale) aggiungi IP a fail2ban ignoreip in `/etc/fail2ban/jail.d/sshd.local`, poi:
   ```bash
   systemctl restart fail2ban
   ```

## Aggiungere un nuovo IP “di fiducia” a fail2ban

Modifica `ignoreip` in `/etc/fail2ban/jail.d/sshd.local`:

```
ignoreip = 127.0.0.1/8 37.101.247.129 151.45.80.158 NUOVO_IP
```

```bash
systemctl restart fail2ban
```

## NON fare di nuovo

```bash
ufw allow from UN_IP to any port 22   # ti blocca al prossimo cambio IP
```
