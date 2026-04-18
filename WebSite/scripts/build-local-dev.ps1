# Build dist per provare su http://localhost:3000 (default) con API candidature.
# Dalla root del repo (senza incollare il prompt "PS ...>" della console; path con & tra virgolette in cd).
#   powershell -ExecutionPolicy Bypass -File WebSite/scripts/build-local-dev.ps1
# Bot in locale sulla STESSA macchina: porta sito diversa dalla webhook del bot, es. -SitePort 5173 -BotHttpPort 3000
# Se il webhook HTTP del bot non e sulla 3000, passa la porta:
#   powershell -ExecutionPolicy Bypass -File WebSite/scripts/build-local-dev.ps1 -BotHttpPort 3001

param(
  [int] $SitePort = 3000,
  [int] $BotHttpPort = 3000,
  # Se il bot e su un VPS: es. "http://203.0.113.10:3000/webhooks/site-candidature" (stessa stringa in site.config candidatureSubmitApiUrlLocal).
  [string] $CandidatureSubmitApiUrlLocal = ""
)

$ErrorActionPreference = "Stop"
if ($SitePort -eq $BotHttpPort) {
  Write-Host "[build-local-dev] Nota: SitePort = BotHttpPort = $SitePort . OK se il bot gira solo sul VPS (API in site.config o -CandidatureSubmitApiUrlLocal verso il VPS). Se il bot Express e in locale su questo PC, usa porte diverse (es. -SitePort 5173)." -ForegroundColor Yellow
}
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $repoRoot

$env:VC_SITE_URL = "http://localhost:$SitePort"
$env:VC_CANDIDATURE_SUBMIT_API_URL = "http://localhost:$BotHttpPort/webhooks/site-candidature"
if ($CandidatureSubmitApiUrlLocal -ne "") {
  $env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL = $CandidatureSubmitApiUrlLocal
} else {
  Remove-Item Env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL -ErrorAction SilentlyContinue
}

Write-Host "[build-local-dev] VC_SITE_URL=$($env:VC_SITE_URL)"
Write-Host "[build-local-dev] VC_CANDIDATURE_SUBMIT_API_URL=$($env:VC_CANDIDATURE_SUBMIT_API_URL)"
if ($env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL) {
  Write-Host "[build-local-dev] VC_CANDIDATURE_SUBMIT_API_URL_LOCAL=$($env:VC_CANDIDATURE_SUBMIT_API_URL_LOCAL)"
}
node WebSite/scripts/build-site.mjs

Write-Host ""
Write-Host "Prossimi passi:"
Write-Host "  1) Sul bot (.env): WEBSITE_CANDIDATURE_HTTP=1"
Write-Host "     WEBSITE_CANDIDATURE_CORS_ORIGIN=http://localhost:$SitePort"
Write-Host ("  1b) Bot sul VPS e problemi CORS: avvia node WebSite/scripts/dev-candidature-proxy.mjs --target http://IP:" + $BotHttpPort + " poi candidatureSubmitApiUrlLocal http://127.0.0.1:3042/webhooks/site-candidature e rebuild (vedi script, porta proxy default 3042).")
Write-Host ("  1c) Bot in locale su questo PC -> http://localhost:" + $BotHttpPort + "; bot solo VPS -> IP pubblico (non localhost).")
Write-Host ("  2) Avvia il bot (Vinyls/config.json discadia.webhookPort = " + $BotHttpPort + ").")
Write-Host ("  3) Sito: npx --yes serve WebSite/dist -l " + $SitePort)
Write-Host ("  3b) Se il bot Express e in locale su questa macchina sulla " + $BotHttpPort + ", non usare quella porta per npx serve: usa -SitePort diversa (es. 5173).")
Write-Host ("  4) Discord Developer Portal, OAuth2 Redirects: http://localhost:" + $SitePort + " e http://localhost:" + $SitePort + "/candidature")
