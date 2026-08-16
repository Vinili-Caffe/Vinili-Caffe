# Deploy rapido: solo file toccati (SCP diretto, niente tarball / build sito completa).
param(
  [string]$Server = "vinili",
  [string]$User = "root",
  [string]$SiteRemotePath = "/var/www/viniliecaffe",
  [string]$BotRemotePath = "/opt/bot",
  [switch]$SkipSite,
  [switch]$SkipBackend,
  [switch]$NoReload
)

$ErrorActionPreference = "Stop"
$sshArgs = @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Set-Location $repoRoot

function Scp-File([string]$Local, [string]$Remote) {
  if (-not (Test-Path $Local)) {
    Write-Warning "File mancante, skip: $Local"
    return
  }
  $dest = "${User}@${Server}:$Remote"
  Write-Host "  -> $Remote"
  & scp @sshArgs $Local $dest
  if ($LASTEXITCODE -ne 0) { throw "scp fallito: $Local" }
}

$sw = [System.Diagnostics.Stopwatch]::StartNew()

if (-not $SkipSite) {
  Write-Host "[site] Upload ticket UI..."
  Scp-File "WebSite\js\web-tickets-page.js" "$SiteRemotePath/js/web-tickets-page.js"
  Scp-File "WebSite\css\vc-landing.css" "$SiteRemotePath/css/vc-landing.css"
}

if (-not $SkipBackend) {
  Write-Host "[backend] Upload API ticket + permessi..."
  Scp-File "Vinyls\Utils\Web\siteWebTicketsApi.js" "$BotRemotePath/Vinyls/Utils/Web/siteWebTicketsApi.js"
  Scp-File "Vinyls\Schemas\Web\siteWebTicketSchemas.js" "$BotRemotePath/Vinyls/Schemas/Web/siteWebTicketSchemas.js"
  Scp-File "Vinyls\Services\Web\siteWebhookRoutes.js" "$BotRemotePath/Vinyls/Services/Web/siteWebhookRoutes.js"
  Scp-File "Vinyls\Utils\Moderation\commandPermissions.js" "$BotRemotePath/Vinyls/Utils/Moderation/commandPermissions.js"
  Scp-File "Vinyls\Utils\Prefix\officialPrefixDispatcher.js" "$BotRemotePath/Vinyls/Utils/Prefix/officialPrefixDispatcher.js"
  Scp-File "Vinyls\Prefix\Staff\description.js" "$BotRemotePath/Vinyls/Prefix/Staff/description.js"
  Scp-File "Vinyls\Utils\Pause\pauseHandlersUtils.js" "$BotRemotePath/Vinyls/Utils/Pause/pauseHandlersUtils.js"
  Scp-File "Vinyls\Utils\Staff\staffGuideContent.js" "$BotRemotePath/Vinyls/Utils/Staff/staffGuideContent.js"
  Scp-File "Vinyls\Triggers\buttons.js" "$BotRemotePath/Vinyls/Triggers/buttons.js"
  if (-not $NoReload) {
    Write-Host "[backend] pm2 reload site-api + bots..."
    & ssh @sshArgs "${User}@${Server}" "pm2 reload site-api --update-env && pm2 reload bots --update-env"
    if ($LASTEXITCODE -ne 0) { throw "pm2 reload fallito" }
  }
}

$sw.Stop()
Write-Host ("Deploy veloce completato in {0:N1}s." -f $sw.Elapsed.TotalSeconds)
