# MongoDB sulla VPS (Docker)

## Se vedi `lstat .../backups: no such file`

La cartella **non è su git**. Creala una volta:

```bash
mkdir -p /opt/bot/deploy/backups
```

Da ora **`start-mongo.sh`** crea anche `backups/` da solo.

## Una tantum sulla VPS (fa quasi tutto)

```bash
cd /opt/bot/deploy
git pull
chmod +x setup-vps-mongo.sh start-mongo.sh backup-mongo.sh restore-mongo.sh
./setup-vps-mongo.sh
```

Poi nel **`.env` del bot** (stessi `MONGO_INITDB_*` usati da Docker):

```
MONGO_URL=mongodb://USER:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```

Poi: **`pm2 restart all --update-env`** (o il processo del bot).

> **PM2 e .env:** PM2 non rilegge il `.env` a ogni `restart`. Se hai cambiato il `.env` (es. MONGO_URL), usa **`pm2 restart all --update-env`** così PM2 aggiorna l’ambiente. In alternativa: `pm2 delete all` e poi riavvia i processi (es. `npm run start`), così partono con l’env fresco.

---

## Credenziali `MONGO_INITDB_*` nel `.env` del bot

Nel file `/opt/bot/.env` (niente file separato):

```bash
MONGO_INITDB_ROOT_USERNAME=vinili
MONGO_INITDB_ROOT_PASSWORD=LA_TUA_PASSWORD
```

`chmod 600 /opt/bot/.env`

---

## Script

| Script | Cosa fa |
|--------|--------|
| `start-mongo.sh` | Avvia Mongo (Docker) |
| `backup-mongo.sh` | Dump in `deploy/backups/mongo-YYYYMMDD-HHMMSS` + `prune-mongo-backups.sh` (tiene ultimi 7) |
| `prune-mongo-backups.sh [N]` | Solo prune: tiene gli N backup `mongo-*` più recenti (default 7) |
| `restore-mongo.sh /percorso/cartella_dump` | Restore da una cartella di backup |
| `setup-vps-mongo.sh` | chmod sicuri, avvio Mongo, crea `backups/`, istruzioni + cron |

### Cron backup settimanale (domenica 03:15)

```bash
(crontab -l 2>/dev/null | grep -v backup-mongo.sh; echo '15 3 * * 0 /opt/bot/deploy/backup-mongo.sh >> /opt/bot/deploy/backups/cron.log 2>&1') | crontab -
```

---

## Windows — dump Atlas senza romperti (Docker + root)

Dalla root del repo, **PowerShell** (Connection string completa da Atlas, tra virgolette):

```powershell
cd "C:\percorso\DiscordBot-1"
.\scripts\mongodump-atlas-docker.ps1 -Uri "mongodb+srv://USER:PASSWORD@cluster.mongodb.net/"
```

Esce tutto in **`deploy/atlas-dump/`** (gitignored). Poi zip o scp di **`atlas-dump`** sulla VPS e:

```bash
/opt/bot/deploy/restore-mongo.sh /percorso/atlas-dump
```

---

## Dump da Atlas → VPS (stessi dati di prima)

**Sul PC** (o sulla VPS se hai `mongodump` + rete verso Atlas):

```bash
mongodump --uri="mongodb+srv://USER:PASS@purplemoon.xxx.mongodb.net/" --out=./dump-atlas
```

La cartella `dump-atlas` deve contenere **sottocartelle con file `.bson`** (es. `dump-atlas/nomedb/*.bson`). Se pesa pochi KB e non ci sono `.bson`, il dump non e andato bene.

Copia **tutta** `dump-atlas` sulla VPS (scp/rsync), poi:

```bash
/opt/bot/deploy/restore-mongo.sh /percorso/dump-atlas
```

**Mai** passare solo `backups/` se dentro non c e un dump Atlas: spesso c e solo `cron.log` → **0 documenti**.

(Se `mongodump` non c’è: pacchetto **mongodb-database-tools**, oppure  
`docker run --rm -v "$PWD:/out" mongo:7 mongodump --uri="mongodb+srv://..." -o /out/dump-atlas`)

### Perchè prima vedevi "0 documenti"

- Argomento sbagliato (cartella senza `.bson`).
- Oppure dump fatto su DB vuoto / URI senza auth.

---

## Perché a volte "env file not found"

`env_file` nel compose è relativo alla **cwd** da cui lanci compose, non alla cartella del yml. Qui si usa **`--env-file`** + path assoluto / script in `deploy/`.

---

## Auth fallisce ancora — reset HARD (solo docker run)

Compose a volte passa variabili **vuote** (altro `.env` nella cartella). Questo **non** usa compose:

```bash
cd /opt/bot/deploy
chmod +x reset-mongo-hard.sh
sudo ./reset-mongo-hard.sh TUOUSER TUOPASS
```

Se ancora FAIL, lo script stampa `MONGO_*` visti da Docker e i log. Dopo **non** usare `start-mongo.sh` (usa solo `docker start vc-mongodb` se serve).

---

## Reset root senza file (se auth fallisce sempre)

**Un comando solo.** Sostituisci `USER` e `PASS` con quelli che vuoi (anche i vecchi, se li vuoi identici):

```bash
cd /opt/bot/deploy
sudo chmod +x reset-mongo-root.sh
sudo ./reset-mongo-root.sh USER PASS
```

Lo script fa `down -v`, esporta user/pass **in shell**, `up -d`, testa il ping, aggiorna `MONGO_INITDB_*` nel `.env` del bot. Poi **restore** del dump se ti servono i dati.

---

## Authentication failed anche con password giusta

Spesso **CRLF** nel `.env` (creato su Windows): la password nel container ha un `\r` in coda.

```bash
cat -A /opt/bot/.env   # se vedi ^M = CRLF
sudo apt install -y dos2unix && sudo dos2unix /opt/bot/.env
```

Poi **sempre** `docker compose down -v` e `up -d` (altrimenti il vecchio root resta).

Oppure: `./fix-env-mongo-crlf.sh` in deploy.

---

## Compass dal PC (tunnel SSH)

Sulla VPS Mongo deve essere su (start-mongo.sh). Sul PC hai tre modi:

### A) Automatico con `ssh vinili-ca` (consigliato)

In `~/.ssh/config` sotto `Host vinili-ca` (la VPS attuale; `vinili` è quella vecchia):

```sshconfig
LocalForward 27018 127.0.0.1:27017
```

Ogni sessione `ssh vinili-ca` (anche quella che tieni aperta per il deploy) espone Mongo su `127.0.0.1:27018` — **non serve un terminale tunnel separato**.

Dopo aver aggiunto la riga, riconnetti `ssh vinili-ca` (o avvia `ssh -N vinili-ca` e lascialo aperto).

### B) Script dedicato

```bash
./deploy/compass-tunnel.sh
```

PowerShell: `.\deploy\compass-tunnel.ps1` (di default usa `vinili-ca`)

### C) Tunnel SSH integrato in Compass

In Compass → Edit connection → **SSH Tunnel**: host `vinili-ca` (167.114.71.27), user `ubuntu`, chiave `~/.ssh/vinili`.  
Hostname Mongo: `127.0.0.1`, porta `27017` (lato VPS). Nessun tunnel esterno.

Compass URI (stessi user/password di `MONGO_INITDB_*` nel `.env`):

```text
mongodb://USER:PASS@127.0.0.1:27018/?authSource=admin
```

**Porta 27018** in locale, non 27017 (quella è solo sulla VPS o se hai Mongo installato in locale).

---

## Stringa nel `.env` del bot

```
MONGO_URL=mongodb://vinili:PASSWORD@127.0.0.1:27017/nomedb?authSource=admin
```