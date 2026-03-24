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

Write-Host "[DISBOARD PROXY] Avvio locale su http://$($env:DISBOARD_PROXY_HOST):$($env:DISBOARD_PROXY_PORT)"
node $proxyScript
