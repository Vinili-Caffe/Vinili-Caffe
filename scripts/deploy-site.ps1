param(
  [string]$Server = "45.143.196.131",
  [string]$User = "root",
  [string]$RemotePath = "/var/www/viniliecaffe",
  [switch]$SkipRemoteChown,
  [switch]$SkipBuild,
  [switch]$SlowScpRecursive
)

$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\WebSite"

$env:VC_SITE_URL = "https://www.viniliecaffe.it/"
$env:VC_CANDIDATURE_SUBMIT_API_URL = "https://www.viniliecaffe.it/webhooks/site-candidature"
$env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL = ""

if (-not $SkipBuild) {
  if (Test-Path ".\dist") { Remove-Item -Recurse -Force ".\dist" }
  npm run build
} else {
  if (-not (Test-Path ".\dist\index.html")) {
    Write-Error "dist/ non pronto (manca index.html). Esegui la build senza -SkipBuild oppure crea dist prima."
  }
  Write-Host "Saltata la build (-SkipBuild): uso dist/ esistente."
}

$hits = Get-ChildItem -Recurse -File ".\dist" | Select-String -Pattern "http://localhost:3000"
if ($hits) {
  Write-Error "Build contiene ancora localhost. Deploy annullato."
}

$hasTar = $null -ne (Get-Command tar -ErrorAction SilentlyContinue)

if ($SlowScpRecursive) {
  Write-Host "Upload ricorsivo file-per-file (lento)..."
  scp -r .\dist\* "${User}@${Server}:${RemotePath}/"
} elseif ($hasTar) {
  $localTgz = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
  $remoteTgz = "/tmp/vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz"
  try {
    Write-Host "Archivio tar.gz + un solo upload (di solito molto più veloce di centinaia di scp)..."
    & tar -czf $localTgz -C dist .
    scp $localTgz "${User}@${Server}:${remoteTgz}"
    $extract = "mkdir -p '$RemotePath' && tar -xzf '$remoteTgz' -C '$RemotePath' && rm -f '$remoteTgz'"
    ssh "${User}@${Server}" $extract
  } finally {
    if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
  }
} else {
  Write-Warning "Comando tar non trovato: fallback a scp ricorsivo (lento)."
  scp -r .\dist\* "${User}@${Server}:${RemotePath}/"
}

if (-not $SkipRemoteChown) {
  $remoteShell = "chown -R www-data:www-data '$RemotePath' && find '$RemotePath' -type d -exec chmod 755 {} + && find '$RemotePath' -type f -exec chmod 644 {} +"
  ssh "${User}@${Server}" $remoteShell
  Write-Host "Permessi docroot aggiornati (www-data, 755/644)."
} else {
  Write-Host "Saltato chown/chmod remoto (-SkipRemoteChown)."
}

Write-Host "Deploy completato su ${User}@${Server}:${RemotePath}"