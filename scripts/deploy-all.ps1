param(
  [string]$Server = "45.143.196.131",
  [string]$User = "root",
  [string]$SiteRemotePath = "/var/www/viniliecaffe",
  [string]$BotRemotePath = "/opt/bot",
  [string]$Pm2AppName = "bots",
  [switch]$SkipSiteBuild,
  [switch]$SkipSiteChown,
  [switch]$SkipBackend,
  [switch]$SkipBackendRestart
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando richiesto non trovato: $Name"
  }
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

Write-Host "==> [1/2] Deploy sito statico"
$siteDeployScript = Join-Path $PSScriptRoot "deploy-site.ps1"
$siteParams = @{
  Server = $Server
  User = $User
  RemotePath = $SiteRemotePath
}
if ($SkipSiteBuild) { $siteParams.SkipBuild = $true }
if ($SkipSiteChown) { $siteParams.SkipRemoteChown = $true }
& $siteDeployScript @siteParams

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
    "Vinyls" "shared" "Coffee" "scripts" "package.json" "package-lock.json"

  scp $localTgz "${User}@${Server}:${remoteTgz}"

  $remoteCmd = @(
    "set -eu"
    'OLD_LOCK_HASH=""'
    "if [ -f '$BotRemotePath/package-lock.json' ]; then OLD_LOCK_HASH=`$(sha256sum '$BotRemotePath/package-lock.json' | awk '{print `$1}'); fi"
    "mkdir -p '$BotRemotePath'"
    "tar -xzf '$remoteTgz' -C '$BotRemotePath'"
    "rm -f '$remoteTgz'"
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
    'NEED_INSTALL=0'
    'if [ ! -d node_modules ] || [ "$OLD_LOCK_HASH" != "$NEW_LOCK_HASH" ]; then NEED_INSTALL=1; fi'
    'if [ "$NEED_INSTALL" = "1" ]; then echo "Dependency install required."; "$NODE_BIN" "$NPM_CLI" ci --omit=dev --no-audit --no-fund --loglevel=error || "$NODE_BIN" "$NPM_CLI" install --omit=dev --no-audit --no-fund --loglevel=error; else echo "Dependencies unchanged, skipping npm install."; fi'
    "cd '$BotRemotePath/Vinyls'"
    "if `"$NODE_BIN`" -e 'require(`"canvas`")' >/dev/null 2>&1; then echo `"Canvas already OK.`"; else echo `"Canvas rebuild required.`"; rm -rf ../node_modules/canvas node_modules/canvas; `"$NODE_BIN`" `"$NPM_CLI`" install canvas@2.11.2 --omit=dev --foreground-scripts --no-audit --no-fund --loglevel=error; fi"
    "`"$NODE_BIN`" -e 'require(`"canvas`"); console.log(`"canvas-ok`")'"
  )
  if (-not $SkipBackendRestart) {
    $remoteCmd += "pm2 restart '$Pm2AppName' --update-env"
    $remoteCmd += "pm2 describe '$Pm2AppName'"
  } else {
    $remoteCmd += "echo 'Restart PM2 saltato (-SkipBackendRestart)'"
  }
  ssh "${User}@${Server}" ($remoteCmd -join " && ")
} finally {
  if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
}

Write-Host "Deploy completato su ${User}@${Server} (site + backend)."
