$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot ".blockdoc-server.pid"

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host "No BlockDoc background server started by the launcher was found."
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process) {
  Stop-Process -Id $serverPid
}

Remove-Item -LiteralPath $pidFile -Force
Write-Host "BlockDoc has stopped."

