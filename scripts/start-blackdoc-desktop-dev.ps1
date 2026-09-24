param(
  [switch]$CheckOnly
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$cargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$tauriCli = Join-Path $projectRoot "node_modules\@tauri-apps\cli"

if (Test-Path -LiteralPath $cargoBin) {
  $env:PATH = "$cargoBin;$env:PATH"
}

$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$null = Get-Command cargo.exe -ErrorAction Stop

if (-not (Test-Path -LiteralPath $tauriCli)) {
  throw "Dependencies are missing. Run 'npm install' in the BlackDoc folder first."
}

if ($CheckOnly) {
  Write-Host "BlackDoc desktop development environment is ready."
  exit 0
}

Set-Location -LiteralPath $projectRoot
Write-Host "Starting BlackDoc desktop development mode..."
Write-Host "Keep this window open while using the development build."
Write-Host ""

& $npmPath run desktop:dev
if ($LASTEXITCODE -ne 0) {
  throw "BlackDoc desktop development mode exited with code $LASTEXITCODE."
}
