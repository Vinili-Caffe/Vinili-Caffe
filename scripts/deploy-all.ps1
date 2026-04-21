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
    "set -e"
    "mkdir -p '$BotRemotePath'"
    "tar -xzf '$remoteTgz' -C '$BotRemotePath'"
    "rm -f '$remoteTgz'"
    "cd '$BotRemotePath'"
    "if [ -f package-lock.json ]; then npm ci --omit=dev || npm install --omit=dev; else npm install --omit=dev; fi"
  )
  if (-not $SkipBackendRestart) {
    $remoteCmd += "pm2 restart '$Pm2AppName'"
    $remoteCmd += "pm2 logs '$Pm2AppName' --lines 12 --nostream"
  } else {
    $remoteCmd += "echo 'Restart PM2 saltato (-SkipBackendRestart)'"
  }
  ssh "${User}@${Server}" ($remoteCmd -join " && ")
} finally {
  if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
}

Write-Host "Deploy completato su ${User}@${Server} (site + backend)."
