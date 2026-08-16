# Backend: tarball con Vinyls/Coffee, wait-for-lavalink.js, ecosystem.config.cjs e cartella Lavalink (config + start-lavalink.sh).
# Sul server: dopo l'estrazione — scarica Lavalink.jar se manca (4.2.2), crea plugins/, normalizza CRLF su start-lavalink.sh,
# applica opzionale Lavalink/.env.lavalink caricato in /tmp prima dello script remoto (file locale non nel tarball).
# PM2: reload ecosystem (lavalink = java -jar + spring.config.additional-location; vedi ecosystem.config.cjs).
param(
  [string]$Server = "vinili",
  [string]$User = "root",
  [string]$SiteRemotePath = "/var/www/viniliecaffe",
  [string]$BotRemotePath = "/opt/bot",
  [string]$Pm2AppName = "bots",
  [switch]$SkipSiteBuild,
  [switch]$SkipSite,
  [switch]$SkipSiteChown,
  [switch]$SiteFullClean,
  [switch]$SlowSiteScpRecursive,
  [switch]$SkipBackend,
  [switch]$SkipBackendRestart,
  [switch]$SkipLargeSiteAssets
)

$SiteLargeAssetUploadSkipPatterns = @(
  '(?i)(?:^|/)images/evento-hogwarts/ven-web\.mp4$',
  '(?i)(?:^|/)images/evento-hogwarts/Watch Harry Potter.*\.mp4$',
  '(?i)(?:^|/)images/Watch Harry Potter.*\.mp4$'
)

$ErrorActionPreference = "Stop"
$ConfirmPreference = "None"

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

function Get-RemoteFileSize {
  param([string]$Target, [string]$RemoteFilePath)
  $raw = & ssh @sshArgs $Target "if [ -f '$RemoteFilePath' ]; then stat -c '%s' '$RemoteFilePath'; else echo 0; fi"
  if ($LASTEXITCODE -ne 0) { return 0L }
  $parsed = 0L
  [void][long]::TryParse((($raw | Out-String).Trim()), [ref]$parsed)
  return $parsed
}

function Test-SkipSiteLargeAssetUpload {
  param([string]$Rel)
  foreach ($pat in $SiteLargeAssetUploadSkipPatterns) {
    if ($Rel -match $pat) { return $true }
  }
  return $false
}

function Get-SiteLargeAssetRemotePaths {
  param([string]$RemotePath, [string]$Rel)
  $paths = New-Object System.Collections.Generic.List[string]
  if ($Rel -match '(?i)Harry Potter e la camera dei segreti\.mp4$') {
    [void]$paths.Add("$RemotePath/images/evento-hogwarts/harry-potter-camera-dei-segreti.mp4")
  }
  if ($Rel -match '(?i)Watch Harry Potter e il prigioniero di Azkaban\.mp4$') {
    [void]$paths.Add("$RemotePath/images/evento-hogwarts/harry-potter-prigioniero-di-azkaban.mp4")
  }
  [void]$paths.Add("$RemotePath/$Rel")
  return @($paths | Select-Object -Unique)
}

function Resolve-SiteLargeAssetUploadPath {
  param([string]$RemotePath, [string]$Rel)
  if ($Rel -match '(?i)Harry Potter e la camera dei segreti\.mp4$') {
    return "$RemotePath/images/evento-hogwarts/harry-potter-camera-dei-segreti.mp4"
  }
  if ($Rel -match '(?i)Watch Harry Potter e il prigioniero di Azkaban\.mp4$') {
    return "$RemotePath/images/evento-hogwarts/harry-potter-prigioniero-di-azkaban.mp4"
  }
  return "$RemotePath/$Rel"
}

function Get-RemoteFileSizeAny {
  param([string]$Target, [string[]]$RemoteFilePaths)
  foreach ($remotePath in $RemoteFilePaths) {
    $size = Get-RemoteFileSize $Target $remotePath
    if ($size -gt 0) { return $size }
  }
  return 0L
}

function Get-RemoteLargeAssetMatchingSize {
  param([string]$Target, [string[]]$RemoteFilePaths, [long]$LocalSize)
  foreach ($remotePath in $RemoteFilePaths) {
    $size = Get-RemoteFileSize $Target $remotePath
    if (Test-RemoteLargeAssetMatchesLocal $size $LocalSize) { return $size }
  }
  return 0L
}

function Test-RemoteLargeAssetMatchesLocal {
  param([long]$RemoteSize, [long]$LocalSize)
  if ($RemoteSize -le 0 -or $LocalSize -le 0) { return $false }
  if ($RemoteSize -eq $LocalSize) { return $true }
  $diff = [math]::Abs($RemoteSize - $LocalSize)
  $maxDiff = [math]::Max(5242880L, [long]($LocalSize * 0.01))
  return $diff -le $maxDiff
}

function Get-ProcessArgumentString([string[]]$Parts) {
  ($Parts | ForEach-Object {
    if ($_ -match '[\s"]') {
      '"' + ($_.Replace('"', '\"')) + '"'
    } else {
      $_
    }
  }) -join ' '
}

function Invoke-RemoteBashScript([string]$Target, [string]$Script) {
  # Drain stdout/stderr while ssh runs. Waiting first then reading deadlocks once
  # the OS pipe buffer fills (common on long remote deploy scripts with lots of output).
  $normalized = ($Script -replace "`r`n", "`n" -replace "`r", "`n").TrimEnd() + "`n"
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
  $argParts = @($sshArgs) + @($Target, "bash -s")
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "ssh"
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  if ($psi.PSObject.Properties.Name -contains "ArgumentList") {
    $psi.ArgumentList = [System.Collections.ObjectModel.Collection[string]]::new([string[]]$argParts)
  } else {
    $psi.Arguments = Get-ProcessArgumentString $argParts
  }
  $proc = [System.Diagnostics.Process]::Start($psi)
  $stdoutBuilder = New-Object System.Text.StringBuilder
  $stderrBuilder = New-Object System.Text.StringBuilder
  $outHandler = [System.Diagnostics.DataReceivedEventHandler] {
    param($sender, $e)
    if ($null -ne $e.Data) { [void]$stdoutBuilder.AppendLine($e.Data) }
  }
  $errHandler = [System.Diagnostics.DataReceivedEventHandler] {
    param($sender, $e)
    if ($null -ne $e.Data) { [void]$stderrBuilder.AppendLine($e.Data) }
  }
  $proc.add_OutputDataReceived($outHandler)
  $proc.add_ErrorDataReceived($errHandler)
  $proc.BeginOutputReadLine()
  $proc.BeginErrorReadLine()
  try {
    $stdin = $proc.StandardInput.BaseStream
    $stdin.Write($bytes, 0, $bytes.Length)
    $stdin.Flush()
  } finally {
    $proc.StandardInput.Close()
  }
  $proc.WaitForExit()
  try { $proc.CancelOutputRead() } catch {}
  try { $proc.CancelErrorRead() } catch {}
  $stdout = $stdoutBuilder.ToString().TrimEnd()
  $stderr = $stderrBuilder.ToString().TrimEnd()
  if ($stdout) { Write-Host $stdout }
  if ($stderr -and $proc.ExitCode -ne 0) { Write-Host $stderr }
  if ($proc.ExitCode -ne 0) {
    throw "ssh terminato con exit code $($proc.ExitCode)"
  }
}

function Clear-DistDirectory {
  param([string]$DistPath)
  if (-not (Test-Path $DistPath)) { return }
  $largeMinBytes = 40MB
  $lockedLargeFiles = @(Get-ChildItem -Recurse -Force -File $DistPath -ErrorAction SilentlyContinue | Where-Object { $_.Length -gt $largeMinBytes })
  if ($lockedLargeFiles.Count -gt 0) {
    Write-Host "Pulizia dist/ conservativa: preservo $($lockedLargeFiles.Count) asset >40MB (es. video Hogwarts)."
    $files = @(Get-ChildItem -Recurse -Force -File $DistPath | Sort-Object { $_.FullName.Length } -Descending)
    foreach ($file in $files) {
      if ($file.Length -gt $largeMinBytes) { continue }
      try {
        Remove-Item -LiteralPath $file.FullName -Force -Confirm:$false -ErrorAction Stop
      } catch {
        throw "Impossibile rimuovere $($file.FullName): $_"
      }
    }
    $dirs = @(Get-ChildItem -Recurse -Force -Directory $DistPath | Sort-Object { $_.FullName.Length } -Descending)
    foreach ($dir in $dirs) {
      if ((Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
        continue
      }
      Remove-Item -LiteralPath $dir.FullName -Force -Confirm:$false -ErrorAction SilentlyContinue
    }
    return
  }
  try {
    Remove-Item -Recurse -Force -Confirm:$false -LiteralPath $DistPath -ErrorAction Stop
  } catch {
    Write-Warning "dist/ bloccato (file in uso): pulizia selettiva..."
    $files = @(Get-ChildItem -Recurse -Force -File $DistPath | Sort-Object { $_.FullName.Length } -Descending)
    foreach ($file in $files) {
      if ($file.Length -gt $largeMinBytes) {
        Write-Warning "Preservo asset grande: $($file.FullName)"
        continue
      }
      try {
        Remove-Item -LiteralPath $file.FullName -Force -Confirm:$false -ErrorAction Stop
      } catch {
        throw "Impossibile rimuovere $($file.FullName): $_"
      }
    }
    $dirs = @(Get-ChildItem -Recurse -Force -Directory $DistPath | Sort-Object { $_.FullName.Length } -Descending)
    foreach ($dir in $dirs) {
      if ((Get-ChildItem -LiteralPath $dir.FullName -Force -ErrorAction SilentlyContinue | Measure-Object).Count -gt 0) {
        Write-Warning "Mantengo cartella non vuota: $($dir.FullName)"
        continue
      }
      Remove-Item -LiteralPath $dir.FullName -Force -Confirm:$false -ErrorAction SilentlyContinue
    }
  }
}

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Comando richiesto non trovato: $Name"
  }
}

function Ensure-NodePathInSession {
  if ((Get-Command node -ErrorAction SilentlyContinue) -and (Get-Command npm -ErrorAction SilentlyContinue)) {
    return
  }
  $candidates = @(
    "$env:ProgramFiles\nodejs",
    "${env:ProgramFiles(x86)}\nodejs",
    "$env:LOCALAPPDATA\Programs\node"
  ) | Where-Object { $_ -and (Test-Path $_) }
  foreach ($dir in $candidates) {
    if ($env:Path -notlike "*$dir*") {
      $env:Path = "$dir;$env:Path"
    }
  }
}

function Invoke-BackendConfigValidation([string]$Root) {
  if (Get-Command node -ErrorAction SilentlyContinue) {
    $script = "const fs=require('fs'); const path=require('path'); for (const f of ['Vinyls/config.json','Coffee/config.json']) JSON.parse(fs.readFileSync(path.join(process.argv[1], f), 'utf8')); console.log('Config JSON OK.');"
    & node -e $script $Root
    if ($LASTEXITCODE -ne 0) {
      throw "Validazione config JSON fallita"
    }
    return
  }
  foreach ($rel in @("Vinyls/config.json", "Coffee/config.json")) {
    $path = Join-Path $Root $rel
    if (-not (Test-Path $path)) { throw "Config mancante: $rel" }
    $null = Get-Content -Raw -Path $path | ConvertFrom-Json
  }
  Write-Host "Config JSON OK (validazione PowerShell)."
}

function Write-DeployPhase([string]$Message) {
  if (-not $script:DeployStopwatch) {
    $script:DeployStopwatch = [System.Diagnostics.Stopwatch]::StartNew()
  }
  Write-Host ("[{0:mm\:ss}] {1}" -f $script:DeployStopwatch.Elapsed, $Message)
}

function Get-BackendTarStaticExcludes {
  return @(
    "WebSite/images/evento-hogwarts/harry-potter-camera-dei-segreti.mp4",
    "WebSite/images/evento-hogwarts/Watch Harry Potter e il prigioniero di Azkaban.mp4",
    "WebSite/images/evento-hogwarts/inizio.mp4",
    "WebSite/images/evento-hogwarts/smistamento.mp4"
  )
}

function Get-BackendTarLargeExcludes {
  param(
    [string]$Root,
    [long]$MinBytes = 41943040
  )
  $scanPaths = @(
    (Join-Path $Root "Vinyls"),
    (Join-Path $Root "WebSite\images\evento-hogwarts"),
    (Join-Path $Root "shared"),
    (Join-Path $Root "Coffee"),
    (Join-Path $Root "scripts"),
    (Join-Path $Root "Lavalink")
  )
  $excludes = New-Object System.Collections.Generic.HashSet[string]
  foreach ($rel in Get-BackendTarStaticExcludes) { [void]$excludes.Add($rel) }
  foreach ($scanPath in $scanPaths) {
    if (-not (Test-Path $scanPath)) { continue }
    foreach ($file in @(Get-ChildItem -Recurse -Force -File $scanPath -ErrorAction SilentlyContinue)) {
      if ($file.Length -le $MinBytes) { continue }
      $rel = $file.FullName.Substring($Root.Length).TrimStart("\", "/") -replace "\\", "/"
      if ($rel) { [void]$excludes.Add($rel) }
    }
  }
  return @($excludes) | Sort-Object
}

function New-BackendTarArchive {
  param(
    [string]$Root,
    [string]$OutPath
  )
  $backendLargeExcludes = @(Get-BackendTarLargeExcludes $Root) + @(Get-BackendTarStaticExcludes)
  $backendLargeExcludes = @($backendLargeExcludes | Select-Object -Unique | Sort-Object)
  if ($backendLargeExcludes.Count -gt 0) {
    Write-DeployPhase "Backend tar: esclusi $($backendLargeExcludes.Count) file pesanti / solo-sito:"
    foreach ($rel in $backendLargeExcludes) {
      Write-Host "  - $rel"
    }
  }
  $backendTarArgs = @(
    "-czf", $OutPath,
    "--exclude", ".git",
    "--exclude", "node_modules",
    "--exclude", ".cursor",
    "--exclude", "WebSite/dist",
    "--exclude", "Lavalink/plugins",
    "--exclude", "Lavalink/Lavalink.jar",
    "--exclude", "Lavalink/.env.lavalink"
  )
  foreach ($rel in $backendLargeExcludes) {
    $backendTarArgs += "--exclude=$rel"
  }
  $backendTarArgs += @(
    "Vinyls", "WebSite/images/evento-hogwarts", "shared", "Coffee", "scripts", "package.json", "package-lock.json",
    "wait-for-lavalink.js", "loader.js", "ecosystem.config.cjs", "Lavalink"
  )
  Push-Location $Root
  try {
    & tar @backendTarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar backend terminato con exit code $LASTEXITCODE" }
  } finally {
    Pop-Location
  }
  $backendTgzMb = [math]::Round((Get-Item $OutPath).Length / 1MB, 1)
  Write-DeployPhase "Archivio backend pronto: ${backendTgzMb} MB"
  if ($backendTgzMb -gt 200) {
    Write-Warning "Archivio backend anormalmente grande (${backendTgzMb} MB): verifica che i video del sito non siano inclusi."
  }
  return $OutPath
}

function Invoke-ParallelScp {
  param(
    [string[]]$LeftArgs,
    [string[]]$RightArgs
  )
  Invoke-RemoteScp $LeftArgs
  Invoke-RemoteScp $RightArgs
}

function Get-DistTarPlan {
  param(
    [string]$DistPath,
    [long]$LargeMinBytes = 41943040
  )
  $distRoot = (Resolve-Path $DistPath).Path
  $largeFiles = @()
  $relativePaths = New-Object System.Collections.Generic.List[string]
  foreach ($item in @(Get-ChildItem -Recurse -Force $DistPath)) {
    $rel = $item.FullName.Substring($distRoot.Length).TrimStart("\", "/") -replace "\\", "/"
    if (-not $rel) { continue }
    if ($item.PSIsContainer) {
      [void]$relativePaths.Add($rel)
      continue
    }
    if ($item.Length -gt $LargeMinBytes) {
      $largeFiles += $item
      continue
    }
    [void]$relativePaths.Add($rel)
  }
  return @{
    DistRoot = $distRoot
    LargeFiles = $largeFiles
    RelativePaths = @($relativePaths | Sort-Object -Unique)
  }
}

function Test-DistHasLocalhost {
  param([string]$DistPath)
  $checker = Join-Path $PSScriptRoot "check-dist-no-localhost.js"
  if (-not (Test-Path $checker)) { throw "Script mancante: $checker" }
  $absDist = (Resolve-Path $DistPath).Path
  & node $checker $absDist
  return $LASTEXITCODE -eq 0
}

function Invoke-SiteDeploy {
  param(
    [string]$Server,
    [string]$User,
    [string]$RemotePath,
    [switch]$SkipBuild,
    [switch]$SkipRemoteChown,
    [switch]$FullClean,
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
      Clear-DistDirectory ".\dist"
      Write-DeployPhase "Build sito (tailwind + copy + offuscamento)..."
      npm run build
      if ($LASTEXITCODE -ne 0) {
        throw "Build sito fallita (npm run build exit code $LASTEXITCODE)"
      }
      Write-DeployPhase "Build sito completata."
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

  if (-not (Test-DistHasLocalhost ".\dist")) {
    Write-Error "Build contiene ancora localhost. Deploy annullato."
  }

  $hasTar = $null -ne (Get-Command tar -ErrorAction SilentlyContinue)
  $remoteFileList = ""

  if ($SlowScpRecursive) {
    Write-Host "Upload ricorsivo file-per-file (lento)..."
    Invoke-RemoteScp @("-r", ".\dist\*", "${User}@${Server}:${RemotePath}/")
  } elseif ($hasTar) {
    $localTgz = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
    $remoteTgz = "/tmp/vc-site-dist-" + [guid]::NewGuid().ToString("N") + ".tar.gz"
    $remoteFileList = "/tmp/vc-site-files-" + [guid]::NewGuid().ToString("N") + ".list"
    $localFileList = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-site-files-" + [guid]::NewGuid().ToString("N") + ".list")
    try {
      Write-DeployPhase "Archivio tar.gz sito..."
      $tarPlan = Get-DistTarPlan ".\dist"
      $distRoot = $tarPlan.DistRoot
      $largeFiles = @($tarPlan.LargeFiles)
      $tarArgs = @("-czf", $localTgz)
      foreach ($lf in $largeFiles) {
        $rel = $lf.FullName.Substring($distRoot.Length).TrimStart("\", "/") -replace "\\", "/"
        $tarArgs += "--exclude=$rel"
      }
      $tarArgs += "-C", "dist", "."
      & tar @tarArgs
      if ($LASTEXITCODE -ne 0) { throw "tar terminato con exit code $LASTEXITCODE" }
      $tgzMb = [math]::Round((Get-Item $localTgz).Length / 1MB, 1)
      Write-DeployPhase "Upload archivio sito (${tgzMb} MB, esclusi $($largeFiles.Count) file >40MB)..."
      if (-not $SkipRemoteChown) {
        $listBody = ($tarPlan.RelativePaths | ForEach-Object { [string]$_ }) -join "`n"
        [System.IO.File]::WriteAllText($localFileList, $listBody, [System.Text.UTF8Encoding]::new($false))
        Invoke-ParallelScp @($localTgz, "${User}@${Server}:${remoteTgz}") @($localFileList, "${User}@${Server}:${remoteFileList}")
      } else {
        Invoke-RemoteScp @($localTgz, "${User}@${Server}:${remoteTgz}")
      }
      $largeMinBytesBash = 41943040
      $extractParts = @(
        "REMOTE='$RemotePath'"
        "LARGE=$largeMinBytesBash"
        "mkdir -p `"`$REMOTE`""
      )
      if ($FullClean) {
        $extractParts += "find `"`$REMOTE`" -depth \( -type f -size +`${LARGE}c \) -prune -o \( -type f \) -delete -o \( -type d \) -empty -delete"
      }
      $extractParts += @(
        "tar -xzf '$remoteTgz' -C `"`$REMOTE`""
        "rm -f '$remoteTgz'"
      )
      $extract = ($extractParts -join " && ")
      Write-DeployPhase "Estrazione archivio sito in $RemotePath..."
      Invoke-RemoteSsh "${User}@${Server}" $extract
      Write-DeployPhase "Estrazione sito completata."
      foreach ($lf in $largeFiles) {
        $rel = $lf.FullName.Substring($distRoot.Length).TrimStart("\", "/") -replace "\\", "/"
        if ($SkipLargeSiteAssets -or (Test-SkipSiteLargeAssetUpload $rel)) {
          Write-Host "Skip upload asset grande: $rel"
          continue
        }
        $remoteCandidates = @(Get-SiteLargeAssetRemotePaths $RemotePath $rel)
        $remoteFile = Resolve-SiteLargeAssetUploadPath $RemotePath $rel
        $remoteDir = ($remoteFile -replace "/[^/]+$", "")
        $remoteSize = Get-RemoteLargeAssetMatchingSize "${User}@${Server}" $remoteCandidates $lf.Length
        if ($remoteSize -gt 0) {
          Write-Host "Asset grande già presente ($([math]::Round($remoteSize / 1MB, 1)) MB), skip upload: $rel"
          if ($rel -match '(?i)Harry Potter e la camera dei segreti\.mp4$') {
            $wrongRemote = "$RemotePath/$rel"
            Invoke-RemoteSsh "${User}@${Server}" "if [ -f '$wrongRemote' ]; then rm -f '$wrongRemote'; fi"
          }
          if ($rel -match '(?i)Watch Harry Potter e il prigioniero di Azkaban\.mp4$') {
            $wrongRemote = "$RemotePath/$rel"
            Invoke-RemoteSsh "${User}@${Server}" "if [ -f '$wrongRemote' ]; then rm -f '$wrongRemote'; fi"
          }
          continue
        }
        Write-Host "Upload asset grande: $rel ($([math]::Round($lf.Length / 1MB, 1)) MB)..."
        Invoke-RemoteSsh "${User}@${Server}" "mkdir -p '$remoteDir'"
        Invoke-RemoteScp @($lf.FullName, "${User}@${Server}:${remoteFile}")
      }
    } finally {
      if (Test-Path $localTgz) { Remove-Item $localTgz -Force }
      if (Test-Path $localFileList) { Remove-Item $localFileList -Force }
    }
  } else {
    Write-Warning "Comando tar non trovato: fallback a scp ricorsivo (lento)."
    Invoke-RemoteSsh "${User}@${Server}" "mkdir -p '$RemotePath' && find '$RemotePath' -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +"
    Invoke-RemoteScp @("-r", ".\dist\*", "${User}@${Server}:${RemotePath}/")
  }

  if (-not $SkipRemoteChown) {
    if ($remoteFileList) {
      $largeMinBytesBash = 41943040
      $remoteShell = @(
        "set -eu"
        "REMOTE='$RemotePath'"
        "LIST='$remoteFileList'"
        "LARGE=$largeMinBytesBash"
        'if [ -f "$LIST" ]; then'
        '  while IFS= read -r rel || [ -n "$rel" ]; do'
        '    [ -z "$rel" ] && continue'
        '    target="$REMOTE/$rel"'
        '    if [ -f "$target" ]; then'
        '      sz=$(stat -c %s "$target" 2>/dev/null || echo 0)'
        '      if [ "$sz" -gt "$LARGE" ]; then continue; fi'
        '      chown www-data:www-data "$target" && chmod 644 "$target"'
        '    elif [ -d "$target" ]; then'
        '      chown www-data:www-data "$target" && chmod 755 "$target"'
        '    fi'
        '  done < "$LIST"'
        '  rm -f "$LIST"'
        'fi'
      ) -join "`n"
      Write-DeployPhase "Permessi docroot (solo file nel tarball, skip >40MB)..."
      Invoke-RemoteBashScript "${User}@${Server}" $remoteShell
    } else {
      $largeMinBytesBash = 41943040
      $remoteShell = @(
        "REMOTE='$RemotePath'"
        "LARGE=$largeMinBytesBash"
        "find `"`$REMOTE`" -xdev -type d -exec chown www-data:www-data {} + -exec chmod 755 {} +"
        "find `"`$REMOTE`" -xdev -type f ! -size +`${LARGE}c -exec chown www-data:www-data {} + -exec chmod 644 {} +"
      ) -join " && "
      Write-DeployPhase "Permessi docroot (fallback find, skip file >40MB)..."
      Invoke-RemoteSsh "${User}@${Server}" $remoteShell
    }
    Write-DeployPhase "Permessi docroot aggiornati (www-data, 755/644)."
  } else {
    Write-Host "Saltato chown/chmod remoto (-SkipRemoteChown)."
  }

  Write-DeployPhase "Deploy sito completato su ${User}@${Server}:${RemotePath}"
  Set-Location $repoRoot
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"
Ensure-NodePathInSession
if (-not $SkipSite -and -not $SkipSiteBuild) {
  Require-Command "npm"
  Require-Command "node"
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:DeployStopwatch = [System.Diagnostics.Stopwatch]::StartNew()

if (-not $SkipSite) {
  Write-DeployPhase "==> [1/2] Deploy sito statico"
  $siteArgs = @{
    Server = $Server
    User = $User
    RemotePath = $SiteRemotePath
    SkipBuild = $SkipSiteBuild
    SkipRemoteChown = $SkipSiteChown
    FullClean = $SiteFullClean
    SlowScpRecursive = $SlowSiteScpRecursive
  }
} else {
  Write-DeployPhase "==> [1/2] Deploy sito saltato (-SkipSite)"
}

$localTgz = $null
$remoteTgz = $null
$backendTarJob = $null
if (-not $SkipBackend) {
  Write-DeployPhase "Validazione config backend..."
  Invoke-BackendConfigValidation $repoRoot
  $localTgz = Join-Path ([System.IO.Path]::GetTempPath()) ("vc-bot-src-" + [guid]::NewGuid().ToString("N") + ".tar.gz")
  $remoteTgz = "/tmp/vc-bot-src-" + [guid]::NewGuid().ToString("N") + ".tar.gz"
  $backendTarJob = Start-Job -ArgumentList $repoRoot, $localTgz -ScriptBlock {
    param($Root, $OutPath)
    Set-Location $Root
    $staticExcludes = @(
      "WebSite/images/evento-hogwarts/harry-potter-pietra-filosofale.mp4",
      "WebSite/images/evento-hogwarts/inizio.mp4",
      "WebSite/images/evento-hogwarts/smistamento.mp4"
    )
    $minBytes = 41943040
    $scanPaths = @("Vinyls", "WebSite/images/evento-hogwarts", "shared", "Coffee", "scripts", "Lavalink")
    $excludes = New-Object System.Collections.Generic.HashSet[string]
    foreach ($rel in $staticExcludes) { [void]$excludes.Add($rel) }
    foreach ($scanPath in $scanPaths) {
      $full = Join-Path $Root ($scanPath -replace "/", [IO.Path]::DirectorySeparatorChar)
      if (-not (Test-Path $full)) { continue }
      foreach ($file in @(Get-ChildItem -Recurse -Force -File $full -ErrorAction SilentlyContinue)) {
        if ($file.Length -le $minBytes) { continue }
        $rel = $file.FullName.Substring($Root.Length).TrimStart("\", "/") -replace "\\", "/"
        if ($rel) { [void]$excludes.Add($rel) }
      }
    }
    $backendTarArgs = @(
      "-czf", $OutPath,
      "--exclude", ".git", "--exclude", "node_modules", "--exclude", ".cursor",
      "--exclude", "WebSite/dist", "--exclude", "Lavalink/plugins",
      "--exclude", "Lavalink/Lavalink.jar", "--exclude", "Lavalink/.env.lavalink"
    )
    foreach ($rel in @($excludes)) { $backendTarArgs += "--exclude=$rel" }
    $backendTarArgs += @(
      "Vinyls", "WebSite/images/evento-hogwarts", "shared", "Coffee", "scripts",
      "package.json", "package-lock.json", "wait-for-lavalink.js", "loader.js",
      "ecosystem.config.cjs", "Lavalink"
    )
    & tar @backendTarArgs
    if ($LASTEXITCODE -ne 0) { throw "tar backend terminato con exit code $LASTEXITCODE" }
    $mb = [math]::Round((Get-Item $OutPath).Length / 1MB, 1)
    Write-Output $mb
  }
  Write-DeployPhase "Archivio backend in background (in parallelo con build/upload sito)..."
}

if (-not $SkipSite) {
  Invoke-SiteDeploy @siteArgs
}

if ($SkipBackend) {
  if ($backendTarJob) {
    Stop-Job $backendTarJob -ErrorAction SilentlyContinue
    Remove-Job $backendTarJob -Force -ErrorAction SilentlyContinue
    if ($localTgz -and (Test-Path $localTgz)) { Remove-Item $localTgz -Force }
  }
  Write-DeployPhase "==> [2/2] Deploy backend saltato (-SkipBackend)"
  Write-DeployPhase "Deploy completato (solo sito)."
  exit 0
}

Write-DeployPhase "==> [2/2] Deploy backend bot"
try {
  Set-Location $repoRoot
  if ($backendTarJob) {
    Write-DeployPhase "Attendo completamento archivio backend..."
    Wait-Job $backendTarJob | Out-Null
    if ($backendTarJob.State -eq "Failed") {
      Receive-Job $backendTarJob 2>&1 | ForEach-Object { Write-Host $_ }
      throw "Creazione archivio backend fallita"
    }
    $backendTgzMb = Receive-Job $backendTarJob
    Remove-Job $backendTarJob -Force
    $backendTarJob = $null
    if (-not (Test-Path $localTgz)) { throw "Archivio backend mancante: $localTgz" }
    if (-not $backendTgzMb) {
      $backendTgzMb = [math]::Round((Get-Item $localTgz).Length / 1MB, 1)
    }
    Write-DeployPhase "Archivio backend: ${backendTgzMb} MB"
    if ([double]$backendTgzMb -gt 200) {
      Write-Warning "Archivio backend anormalmente grande (${backendTgzMb} MB): verifica che i video del sito non siano inclusi."
    }
  } else {
    Invoke-BackendConfigValidation $repoRoot
    New-BackendTarArchive $repoRoot $localTgz | Out-Null
  }

  Write-DeployPhase "Upload archivio backend su ${User}@${Server}:${remoteTgz}"
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
    ". '$BotRemotePath/scripts/lib/resolve-bot-node.sh'"
    "NODE_BIN=`$(resolve_bot_node_bin '$BotRemotePath' '$Pm2AppName')"
    'setup_bot_npm_cli "$NODE_BIN"'
    'echo "Using Node (bot runtime): $NODE_BIN"'
    'echo "Using npm-cli: $NPM_CLI"'
    '"$NODE_BIN" -v'
    '"$NODE_BIN" "$NPM_CLI" -v'
    "cd '$BotRemotePath'"
    '"$NODE_BIN" -e ''for (const f of ["Vinyls/config.json","Coffee/config.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("[deploy] Bot config JSON OK.")'''
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
    "ensure_vinyls_native_modules '$BotRemotePath' `"`$NODE_BIN`" `"`$NPM_CLI`""
  )
  if (-not $SkipBackendRestart) {
    $reloadEcosystem = "cd '$BotRemotePath' && if [ -f ecosystem.config.cjs ]; then if ! pm2 describe lavalink >/dev/null 2>&1 || ! pm2 describe '$Pm2AppName' >/dev/null 2>&1; then pm2 start ecosystem.config.cjs --update-env; elif [ ""`$LAVALINK_CONFIG_CHANGED"" = ""1"" ]; then pm2 reload ecosystem.config.cjs --update-env; else pm2 start ecosystem.config.cjs --only '$Pm2AppName' --update-env; fi; else pm2 restart '$Pm2AppName' --update-env || true; fi; for only_app in site-api partnership-migration discadia-votes topgg-votes vote-drain bot-scheduler auto-backup; do if pm2 describe `"`$only_app`" >/dev/null 2>&1; then pm2 reload `"`$only_app`" --update-env || pm2 restart `"`$only_app`" --update-env || true; else pm2 start ecosystem.config.cjs --only `"`$only_app`" --update-env || true; fi; done; echo '[deploy] Attendo site-api…'; for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do if curl -sf --max-time 2 http://127.0.0.1:3020/webhooks/status >/dev/null; then echo '[deploy] site-api ok'; break; fi; sleep 1; done"
    $remoteCmd += $reloadEcosystem
    $remoteCmd += 'printf "[deploy] PM2 status:\n"'
    $remoteCmd += 'if command -v pm2 >/dev/null 2>&1; then'
    $remoteCmd += "  for pm2_name in lavalink '$Pm2AppName' site-api partnership-migration discadia-votes topgg-votes vote-drain bot-scheduler auto-backup; do"
    $remoteCmd += '    pm2_pid=$(pm2 pid "$pm2_name" 2>/dev/null | head -n 1 | tr -d "[:space:]")'
    $remoteCmd += '    if [ -n "$pm2_pid" ] && [ "$pm2_pid" != "0" ]; then'
    $remoteCmd += '      echo "  $pm2_name: online pid=$pm2_pid"'
    $remoteCmd += '    else'
    $remoteCmd += '      echo "  $pm2_name: offline"'
    $remoteCmd += '    fi'
    $remoteCmd += '  done'
    $remoteCmd += 'fi'
  } else {
    $remoteCmd += "echo 'Restart PM2 saltato (-SkipBackendRestart)'"
  }
  Write-DeployPhase "Esecuzione deploy backend remoto..."
  Invoke-RemoteBashScript "${User}@${Server}" ($remoteCmd -join "`n")
} finally {
  if ($backendTarJob) {
    Stop-Job $backendTarJob -ErrorAction SilentlyContinue
    Remove-Job $backendTarJob -Force -ErrorAction SilentlyContinue
  }
  if ($localTgz -and (Test-Path $localTgz)) { Remove-Item $localTgz -Force }
}

Write-DeployPhase "Deploy completato su ${User}@${Server} (site + backend)."
Write-Host "Suggerimenti: solo bot -> -SkipSite ; solo bot senza Node locale -> -SkipSite ; solo sito -> -SkipBackend ; salta video grandi -> -SkipLargeSiteAssets ; salta chown -> -SkipSiteChown ; pulizia completa docroot -> -SiteFullClean"
