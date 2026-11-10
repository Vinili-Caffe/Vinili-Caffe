param(
  # alias di ~/.ssh/config (utente e chiave li prende da lì)
  [string] $VpsHost = "vinili-ca",
  [int] $LocalPort = 27018
)
Write-Host "Tunnel: 127.0.0.1:$LocalPort -> Mongo su $VpsHost. Chiudi con Ctrl+C."
ssh -N -L "${LocalPort}:127.0.0.1:27017" $VpsHost
