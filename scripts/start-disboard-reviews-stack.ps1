$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$proxyScript = Join-Path $root "scripts\disboard-reviews-proxy.js"
$envFile = Join-Path $root ".env"

if (!(Test-Path $proxyScript)) {
  throw "File non trovato: $proxyScript"
}

if (Test-Path $envFile) {
  Get-Content $envFile | ForEach-Object {
    $line = $_.Trim()
    if (!$line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) { return }
    $name = $parts[0].Trim()
    $value = $parts[1]
    [Environment]::SetEnvironmentVariable($name, $value, "Process")
  }
}

if (-not $env:DISBOARD_PROXY_PORT) { $env:DISBOARD_PROXY_PORT = "8787" }
if (-not $env:DISBOARD_PROXY_HOST) { $env:DISBOARD_PROXY_HOST = "127.0.0.1" }
if (-not $env:DISBOARD_PROXY_TIMEOUT_MS) { $env:DISBOARD_PROXY_TIMEOUT_MS = "15000" }
if (-not $env:DISBOARD_REVIEW_URL) { $env:DISBOARD_REVIEW_URL = "https://disboard.org/it/server/reviews/1329080093599076474" }

$port = $env:DISBOARD_PROXY_PORT
$localUrl = "http://$($env:DISBOARD_PROXY_HOST):$port"

$cloudflared = $env:CLOUDFLARED_EXE
if (-not $cloudflared) { $cloudflared = "C:\Tools\cloudflared\cloudflared.exe" }
if (!(Test-Path $cloudflared)) {
  throw "cloudflared non trovato: $cloudflared. Imposta CLOUDFLARED_EXE nel .env o installa in C:\Tools\cloudflared\"
}

Write-Host "[DISBOARD STACK] Avvio proxy su $localUrl"
$proxyProc = Start-Process -FilePath "node" -ArgumentList "`"$proxyScript`"" -WorkingDirectory $root -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 2

try {
  if ($env:CLOUDFLARED_NAMED_TUNNEL) {
    $name = $env:CLOUDFLARED_NAMED_TUNNEL.Trim()
    Write-Host "[DISBOARD STACK] Tunnel nominato: cloudflared tunnel run $name (URL fisso, vedi guida scripts/DISBOARD_PROXY_WINDOWS_SETUP.md)"
    & $cloudflared tunnel run $name
  } else {
    Write-Host "[DISBOARD STACK] Quick tunnel (URL cambia a ogni avvio). Per URL fisso usa CLOUDFLARED_NAMED_TUNNEL nel .env."
    & $cloudflared tunnel --url $localUrl
  }
} finally {
  if ($proxyProc -and !$proxyProc.HasExited) {
    Stop-Process -Id $proxyProc.Id -Force -ErrorAction SilentlyContinue
  }
  Write-Host "[DISBOARD STACK] Proxy fermato."
}
