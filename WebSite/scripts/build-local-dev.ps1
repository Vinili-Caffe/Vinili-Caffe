# Build dist per provare su http://localhost:5173 con API candidature sul bot in locale.
# Dalla root del repo:
#   powershell -ExecutionPolicy Bypass -File WebSite/scripts/build-local-dev.ps1
# Se il webhook HTTP del bot non e sulla 3000, passa la porta:
#   powershell -ExecutionPolicy Bypass -File WebSite/scripts/build-local-dev.ps1 -BotHttpPort 3001

param(
  [int] $SitePort = 5173,
  [int] $BotHttpPort = 3000
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

$env:VC_SITE_URL = "http://localhost:$SitePort"
$env:VC_CANDIDATURE_SUBMIT_API_URL = "http://127.0.0.1:$BotHttpPort/webhooks/site-candidature"

Write-Host "[build-local-dev] VC_SITE_URL=$($env:VC_SITE_URL)"
Write-Host "[build-local-dev] VC_CANDIDATURE_SUBMIT_API_URL=$($env:VC_CANDIDATURE_SUBMIT_API_URL)"
node WebSite/scripts/build-site.mjs

Write-Host ""
Write-Host "Prossimi passi:"
Write-Host "  1) Sul bot (.env): WEBSITE_CANDIDATURE_HTTP=1"
Write-Host "     WEBSITE_CANDIDATURE_CORS_ORIGIN=http://localhost:$SitePort"
Write-Host ("  1b) In site.config: candidatureSubmitApiUrlLocal verso 127.0.0.1:" + $BotHttpPort + " (stessa porta del webhook HTTP del bot).")
Write-Host ("  2) Avvia il bot (Vinyls/config.json discadia.webhookPort = " + $BotHttpPort + ").")
Write-Host ("  3) Sito: npx --yes serve WebSite/dist -l " + $SitePort)
Write-Host ("  4) Discord Developer Portal, OAuth2 Redirects: http://localhost:" + $SitePort + " e http://localhost:" + $SitePort + "/candidature")
