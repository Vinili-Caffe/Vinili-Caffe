# Backend: tarball con Vinyls/Coffee, wait-for-lavalink.js, ecosystem.config.cjs e cartella Lavalink (config + start-lavalink.sh).
# Sul server: dopo l'estrazione — scarica Lavalink.jar se manca (4.2.2), crea plugins/, normalizza CRLF su start-lavalink.sh,
# applica opzionale Lavalink/.env.lavalink caricato in /tmp prima dello script remoto (file locale non nel tarball).
# PM2: reload ecosystem (lavalink = java -jar + spring.config.additional-location; vedi ecosystem.config.cjs).
param(
  [string]$Server = "45.143.196.131",
  [string]$User = "root",
  [string]$SiteRemotePath = "/var/www/viniliecaffe",
  [string]$BotRemotePath = "/opt/bot",
  [string]$Pm2AppName = "bots",
  [switch]$SkipSiteBuild,
  [switch]$SkipSiteChown,
  [switch]$SlowSiteScpRecursive,
  [switch]$SkipBackend,
  [switch]$SkipBackendRestart
)

$ErrorActionPreference = "Stop"

$sshArgs = @(
  "-o", "BatchMode=yes",
  "-o", "ConnectTimeout=15",
  "-o", "ServerAliveInterval=15",
  "-o", "ServerAliveCountMax=3"
)

function Invoke-RemoteScp([string[]]$Arguments) {
  & scp @sshArgs @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "scp terminato con exit code $LASTEXITCODE"
  }
}

function Invoke-RemoteSsh([string]$Target, [string]$Command) {
  & ssh @sshArgs -n $Target $Command
  if ($LASTEXITCODE -ne 0) {
    throw "ssh terminato con exit code $LASTEXITCODE"
  }
}

function Invoke-RemoteBashScript([string]$Target, [string]$Script) {
  $Script | & ssh @sshArgs $Target "bash -s"
  if ($LASTEXITCODE -ne 0) {
    throw "ssh terminato con exit code $LASTEXITCODE"
  }
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando richiesto non trovato: $Name"
  }
}

function Invoke-SiteDeploy {
  param(
    [string]$Server,
    [string]$User,
    [string]$RemotePath,
    [switch]$SkipBuild,
    [switch]$SkipRemoteChown,
    [switch]$SlowScpRecursive
  )

  $webRoot = Join-Path $repoRoot "WebSite"
  Set-Location $webRoot

  $env:VC_SITE_URL = "https://www.viniliecaffe.it/"
  $env:VC_CANDIDATURE_SUBMIT_API_URL = "https://www.viniliecaffe.it/webhooks/site-candidature"
  $env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL = ""
  $previousBuildQuiet = $env:VC_BUILD_QUIET
  $env:VC_BUILD_QUIET = "1"

  try {
    if (-not $SkipBuild) {
      if (Test-Path ".\dist") { Remove-Item -Recurse -Force ".\dist" }
      npm run build
    } else {
      if (-not (Test-Path ".\dist\index.html")) {
        Write-Error "dist/ non pronto (manca index.html). Esegui la build senza -SkipBuild oppure crea dist prima."
      }
      Write-Host "Saltata la build (-SkipBuild): uso dist/ esistente."
    }
  } finally {
    if ($null -eq $previousBuildQuiet) {
      Remove-Item Env:VC_BUILD_QUIET -ErrorAction SilentlyContinue
    } else {
      $env:VC_BUILD_QUIET = $previousBuildQuiet
    }
  }

  $hits = Get-ChildItem -Recurse -File ".\dist" | Select-String -Pattern "http://localhost:3000"
  if ($hits) {
    Write-Error "Build contiene ancora localhost. Deploy annullato."
  }

  $hasTar = $null -ne (Get-Command tar -ErrorAction SilentlyContinue)

  if ($SlowScpRecursive) {
    Write-Host "Upload ricorsivo file-per-file (lento)..."
    Invoke-RemoteScp @("-r", ".\dist\*", "${User}@${Server}:${RemotePath}/")
  } elseif ($hasTar) {
    $localTgz = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
    $remoteTgz = "/tmp/vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz"
    try {
      Write-Host "Archivio tar.gz + un solo upload (di solito molto più veloce di centinaia di scp)..."
      & tar -czf $localTgz -C dist .
      Write-Host "Upload archivio sito su ${User}@${Server}:${remoteTgz}"
      Invoke-RemoteScp @($localTgz, "${User}@${Server}:${remoteTgz}")
      $extract = "mkdir -p '$RemotePath' && tar -xzf '$remoteTgz' -C '$RemotePath' && rm -f '$remoteTgz'"
      Write-Host "Estrazione archivio sito in $RemotePath sul server..."
      Invoke-RemoteSsh "${User}@${Server}" $extract
      Write-Host "Estrazione sito completata."
    } finally {
      if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
    }
  } else {
    Write-Warning "Comando tar non trovato: fallback a scp ricorsivo (lento)."
    Invoke-RemoteScp @("-r", ".\dist\*", "${User}@${Server}:${RemotePath}/")
  }

  if (-not $SkipRemoteChown) {
    $remoteShell = "chown -R www-data:www-data '$RemotePath' && find '$RemotePath' -type d -exec chmod 755 {} + && find '$RemotePath' -type f -exec chmod 644 {} +"
    Write-Host "Aggiornamento permessi docroot..."
    Invoke-RemoteSsh "${User}@${Server}" $remoteShell
    Write-Host "Permessi docroot aggiornati (www-data, 755/644)."
  } else {
    Write-Host "Saltato chown/chmod remoto (-SkipRemoteChown)."
  }

  Write-Host "Deploy completato su ${User}@${Server}:${RemotePath}"
  Set-Location $repoRoot
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"
Require-Command "npm"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "==> [1/2] Deploy sito statico"
$siteArgs = @{
  Server = $Server
  User = $User
  RemotePath = $SiteRemotePath
  SkipBuild = $SkipSiteBuild
  SkipRemoteChown = $SkipSiteChown
  SlowScpRecursive = $SlowSiteScpRecursive
}
Invoke-SiteDeploy @siteArgs

if ($SkipBackend) {
  Write-Host "==> [2/2] Deploy backend saltato (-SkipBackend)"
  Write-Host "Deploy completato (solo sito)."
  exit 0
}

Write-Host "==> [2/2] Deploy backend bot"
$localTgz = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-bot-src-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
$remoteTgz = "/tmp/vc-bot-src-" + [guid]::NewGuid().ToString("N") + ".tar.gz"

try {
  Set-Location $repoRoot
  & tar -czf $localTgz `
    --exclude ".git" `
    --exclude "node_modules" `
    --exclude ".cursor" `
    --exclude "WebSite/dist" `
    --exclude "Lavalink/plugins" `
    --exclude "Lavalink/Lavalink.jar" `
    --exclude "Lavalink/.env.lavalink" `
    "Vinyls" "shared" "Coffee" "scripts" "package.json" "package-lock.json" `
    "wait-for-lavalink.js" "loader.js" "ecosystem.config.cjs" "Lavalink"

  Write-Host "Upload archivio backend su ${User}@${Server}:${remoteTgz}"
  Invoke-RemoteScp @($localTgz, "${User}@${Server}:${remoteTgz}")

  $lavalinkEnvLocal = Join-Path $repoRoot "Lavalink\.env.lavalink"
  $lavalinkEnvRemoteTmp = "/tmp/vc-deploy-lavalink.env"
  if (-not (Test-Path $lavalinkEnvLocal)) {
    Invoke-RemoteSsh "${User}@${Server}" "rm -f $lavalinkEnvRemoteTmp"
  }
  if (Test-Path $lavalinkEnvLocal) {
    Write-Host "Upload Lavalink/.env.lavalink -> server (tmp, poi spostato in deploy remoto)..."
    Invoke-RemoteScp @($lavalinkEnvLocal, "${User}@${Server}:${lavalinkEnvRemoteTmp}")
  }

  $remoteCmd = @(
    "set -eu"
    "mkdir -p '$BotRemotePath'"
    "OLD_LAVALINK_CONFIG_HASH=`$(if [ -d '$BotRemotePath/Lavalink' ]; then find '$BotRemotePath/Lavalink' -maxdepth 1 -type f \( -name 'application.yml' -o -name 'start-lavalink.sh' -o -name '.env.lavalink' \) -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print `$1}'; fi)"
    "tar -xzf '$remoteTgz' -C '$BotRemotePath'"
    "rm -f '$remoteTgz'"
    "LAVALINK_DIR='$BotRemotePath/Lavalink'"
    'LAVALINK_JAR_URL=https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/Lavalink.jar'
    'mkdir -p "$LAVALINK_DIR/plugins"'
    'if [ -f /tmp/vc-deploy-lavalink.env ]; then mkdir -p "$LAVALINK_DIR"; cp /tmp/vc-deploy-lavalink.env "$LAVALINK_DIR/.env.lavalink"; chmod 600 "$LAVALINK_DIR/.env.lavalink"; rm -f /tmp/vc-deploy-lavalink.env; echo "[deploy] Lavalink/.env.lavalink da upload locale"; fi'
    'if [ ! -f "$LAVALINK_DIR/Lavalink.jar" ]; then echo "[deploy] Scarico Lavalink.jar (4.2.2)..."; if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$LAVALINK_DIR/Lavalink.jar.part" "$LAVALINK_JAR_URL" && mv -f "$LAVALINK_DIR/Lavalink.jar.part" "$LAVALINK_DIR/Lavalink.jar"; elif command -v wget >/dev/null 2>&1; then wget -q -O "$LAVALINK_DIR/Lavalink.jar.part" "$LAVALINK_JAR_URL" && mv -f "$LAVALINK_DIR/Lavalink.jar.part" "$LAVALINK_DIR/Lavalink.jar"; else echo "[deploy] ERRORE: serve curl o wget per scaricare Lavalink.jar" >&2; exit 1; fi; fi'
    'if [ -f "$LAVALINK_DIR/start-lavalink.sh" ]; then chmod +x "$LAVALINK_DIR/start-lavalink.sh"; fi'
    "NEW_LAVALINK_CONFIG_HASH=`$(find '$BotRemotePath/Lavalink' -maxdepth 1 -type f \( -name 'application.yml' -o -name 'start-lavalink.sh' -o -name '.env.lavalink' \) -print0 | sort -z | xargs -0 sha256sum 2>/dev/null | sha256sum | awk '{print `$1}')"
    'if [ "$OLD_LAVALINK_CONFIG_HASH" != "$NEW_LAVALINK_CONFIG_HASH" ]; then LAVALINK_CONFIG_CHANGED=1; echo "[deploy] Lavalink config cambiata: reload lavalink richiesto."; else LAVALINK_CONFIG_CHANGED=0; echo "[deploy] Lavalink config invariata: reload lavalink saltato."; fi'
    'if [ "$LAVALINK_CONFIG_CHANGED" = "1" ]; then rm -f "$LAVALINK_DIR"/plugins/youtube-plugin-*.jar "$LAVALINK_DIR"/plugins/lavasrc-plugin-*.jar; fi'
    'NEW_LOCK_HASH=""'
    "if [ -f '$BotRemotePath/package-lock.json' ]; then NEW_LOCK_HASH=`$(sha256sum '$BotRemotePath/package-lock.json' | awk '{print `$1}'); fi"
    ('APP_PID=$(pm2 pid ''{0}'' 2>/dev/null | head -n 1 | tr -d ''[:space:]'')' -f $Pm2AppName)
    'if [ -n "$APP_PID" ] && [ "$APP_PID" != "0" ] && [ -e "/proc/$APP_PID/exe" ]; then NODE_BIN=$(readlink -f "/proc/$APP_PID/exe"); else NODE_BIN=$(command -v node); fi'
    'if [ -z "$NODE_BIN" ] || [ ! -x "$NODE_BIN" ]; then echo ''Node non trovato sul server'' >&2; exit 1; fi'
    'NODE_DIR=$(dirname "$NODE_BIN")'
    'NPM_CLI=$(dirname "$(dirname "$NODE_BIN")")/lib/node_modules/npm/bin/npm-cli.js'
    'if [ ! -f "$NPM_CLI" ]; then echo ''npm-cli.js non trovato per il runtime selezionato'' >&2; exit 1; fi'
    'export PATH="$NODE_DIR:$PATH"'
    'echo "Using Node: $NODE_BIN"'
    'echo "Using npm-cli: $NPM_CLI"'
    '"$NODE_BIN" -v'
    '"$NODE_BIN" "$NPM_CLI" -v'
    "cd '$BotRemotePath'"
    'NODE_ABI=$("$NODE_BIN" -p "process.versions.modules")'
    'echo "Using Node ABI: $NODE_ABI"'
    'NEED_INSTALL=0'
    'if [ ! -d node_modules ]; then NEED_INSTALL=1'
    'elif [ -z "$NEW_LOCK_HASH" ]; then NEED_INSTALL=1'
    'elif [ ! -f node_modules/.vc-installed-lock.sha256 ]; then NEED_INSTALL=1'
    'elif [ "$(cat node_modules/.vc-installed-lock.sha256)" != "$NEW_LOCK_HASH" ]; then NEED_INSTALL=1'
    'elif [ ! -f node_modules/.vc-installed-node-abi ]; then NEED_INSTALL=1'
    'elif [ "$(cat node_modules/.vc-installed-node-abi)" != "$NODE_ABI" ]; then echo "Node ABI changed: $(cat node_modules/.vc-installed-node-abi) -> $NODE_ABI"; NEED_INSTALL=1'
    'fi'
    'if [ "$NEED_INSTALL" = "1" ]; then echo "Dependency install required."; rm -rf node_modules/canvas Vinyls/node_modules/canvas Coffee/node_modules/canvas; "$NODE_BIN" "$NPM_CLI" ci --omit=dev --no-audit --no-fund --loglevel=error || "$NODE_BIN" "$NPM_CLI" install --omit=dev --no-audit --no-fund --loglevel=error; printf %s "$NEW_LOCK_HASH" > node_modules/.vc-installed-lock.sha256; printf %s "$NODE_ABI" > node_modules/.vc-installed-node-abi; else echo "Dependencies unchanged, skipping npm install."; fi'
    "cd '$BotRemotePath/Vinyls'"
    "if `"`$NODE_BIN`" -e 'require(`"canvas`")' >/dev/null 2>&1; then echo `"Canvas already OK.`"; else echo `"Canvas rebuild required.`"; rm -rf ../node_modules/canvas node_modules/canvas; `"`$NODE_BIN`" `"`$NPM_CLI`" install canvas@2.11.2 --omit=dev --foreground-scripts --no-audit --no-fund --loglevel=error; fi"
    "`"`$NODE_BIN`" -e 'require(`"canvas`"); console.log(`"canvas-ok`")'"
  )
  if (-not $SkipBackendRestart) {
    $reloadEcosystem = "cd '$BotRemotePath' && if [ -f ecosystem.config.cjs ]; then if ! pm2 describe lavalink >/dev/null 2>&1 || ! pm2 describe '$Pm2AppName' >/dev/null 2>&1; then pm2 start ecosystem.config.cjs --update-env; elif [ ""`$LAVALINK_CONFIG_CHANGED"" = ""1"" ]; then pm2 reload ecosystem.config.cjs --update-env; else pm2 reload '$Pm2AppName' --update-env; fi; else pm2 restart '$Pm2AppName' --update-env || true; fi"
    $remoteCmd += $reloadEcosystem
    $remoteCmd += "pm2 list"
    $remoteCmd += "pm2 pid '$Pm2AppName'"
  } else {
    $remoteCmd += "echo 'Restart PM2 saltato (-SkipBackendRestart)'"
  }
  Write-Host "Esecuzione deploy backend remoto..."
  Invoke-RemoteBashScript "${User}@${Server}" ($remoteCmd -join "`n")
} finally {
  if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
}

Write-Host "Deploy completato su ${User}@${Server} (site + backend)."
