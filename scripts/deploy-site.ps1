param(
  [string]$Server = "45.143.196.131",
  [string]$User = "root",
  [string]$RemotePath = "/var/www/viniliecaffe"
)

$ErrorActionPreference = "Stop"

Set-Location "$PSScriptRoot\..\WebSite"

# Build produzione (forzata)
$env:VC_SITE_URL = "https://www.viniliecaffe.it/"
$env:VC_CANDIDATURE_SUBMIT_API_URL = "https://www.viniliecaffe.it/webhooks/site-candidature"
$env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL = ""

if (Test-Path ".\dist") { Remove-Item -Recurse -Force ".\dist" }
npm run build

# Verifica anti-localhost
$hits = Get-ChildItem -Recurse -File ".\dist" | Select-String -Pattern "http://localhost:3000"
if ($hits) {
  Write-Error "Build contiene ancora localhost. Deploy annullato."
}

# Upload
scp -r .\dist\* "${User}@${Server}:${RemotePath}/"

Write-Host "Deploy completato su ${User}@${Server}:${RemotePath}"