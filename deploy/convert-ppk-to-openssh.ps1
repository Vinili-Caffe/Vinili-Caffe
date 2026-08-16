param(
  [string]$PpkPath = "$env:USERPROFILE\.ssh\vinili.ppk",
  [string]$OutPath = "$env:USERPROFILE\.ssh\vinili-from-ppk"
)

function Write-U32BE([uint32]$Value) {
  $v = [uint32]$Value
  [byte[]]@(
    [byte](($v -shr 24) -band 0xFF),
    [byte](($v -shr 16) -band 0xFF),
    [byte](($v -shr 8) -band 0xFF),
    [byte](($v -band 0xFF))
  )
}

function Write-SshString([byte[]]$Data) {
  $len = Write-U32BE ([uint32]$Data.Length)
  $len + $Data
}

if (-not (Test-Path $PpkPath)) {
  throw "PPK non trovato: $PpkPath"
}

$pubLines = @()
$privLines = @()
$comment = "vinili"
$mode = ""

foreach ($line in Get-Content $PpkPath) {
  if ($line -match '^Comment:\s*(.+)$') { $comment = $matches[1].Trim() }
  elseif ($line -match '^Public-Lines:\s*\d+') { $mode = 'pub'; continue }
  elseif ($line -match '^Private-Lines:\s*\d+') { $mode = 'priv'; continue }
  elseif ($line -match '^(Private-MAC|PuTTY-|Encryption|Comment):') { $mode = ''; continue }

  if ($mode -eq 'pub' -and $line.Trim()) { $pubLines += $line.Trim() }
  if ($mode -eq 'priv' -and $line.Trim()) { $privLines += $line.Trim() }
}

$pubWire = [Convert]::FromBase64String(($pubLines -join ''))
$privRaw = [Convert]::FromBase64String(($privLines -join ''))
$seedLen = ($privRaw[0] -shl 24) -bor ($privRaw[1] -shl 16) -bor ($privRaw[2] -shl 8) -bor $privRaw[3]
$seed = $privRaw[4..(3 + $seedLen)]
$pubKey = $pubWire[($pubWire.Length - 32)..($pubWire.Length - 1)]
$priv64 = $seed + $pubKey

$check = [uint32](Get-Random -Minimum 1 -Maximum 2147483647)
$checkBytes = Write-U32BE $check
$typeBytes = [Text.Encoding]::ASCII.GetBytes('ssh-ed25519')
$commentBytes = [Text.Encoding]::UTF8.GetBytes($comment)

$privPlain = [byte[]]@()
$privPlain += $checkBytes
$privPlain += $checkBytes
$privPlain += Write-SshString $typeBytes
$privPlain += Write-SshString $pubKey
$privPlain += Write-SshString $priv64
$privPlain += Write-SshString $commentBytes

$padLen = (8 - ($privPlain.Length % 8)) % 8
for ($i = 1; $i -le $padLen; $i++) { $privPlain += [byte]$i }

$magic = [Text.Encoding]::ASCII.GetBytes("openssh-key-v1`0")
$cipher = [Text.Encoding]::ASCII.GetBytes('none')
$kdf = [Text.Encoding]::ASCII.GetBytes('none')
$kdfOpt = [byte[]]@()

$outer = [byte[]]@()
$outer += $magic
$outer += Write-SshString $cipher
$outer += Write-SshString $kdf
$outer += Write-SshString $kdfOpt
$outer += Write-U32BE 1
$outer += Write-SshString $pubWire
$outer += Write-U32BE ([uint32]$privPlain.Length)
$outer += $privPlain

$b64 = [Convert]::ToBase64String($outer)
$wrapped = for ($i = 0; $i -lt $b64.Length; $i += 70) {
  $b64.Substring($i, [Math]::Min(70, $b64.Length - $i))
}

$keyText = "-----BEGIN OPENSSH PRIVATE KEY-----`n$($wrapped -join "`n")`n-----END OPENSSH PRIVATE KEY-----`n"
Set-Content -Path $OutPath -Value $keyText -Encoding ascii -NoNewline

Write-Host "Convertito: $OutPath"
& ssh-keygen -y -f $OutPath
