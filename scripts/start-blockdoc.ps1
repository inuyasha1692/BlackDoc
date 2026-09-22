param(
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$url = "http://127.0.0.1:5173/"
$pidFile = Join-Path $projectRoot ".blockdoc-server.pid"
$viteScript = Join-Path $projectRoot "node_modules\vite\bin\vite.js"

function Test-BlockDocServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 1
    return $response.StatusCode -eq 200 -and $response.Content -match "<title>BlockDoc</title>"
  } catch {
    return $false
  }
}

if (-not (Test-Path -LiteralPath $viteScript)) {
  throw "Dependencies are missing. Run 'npm install' in the BlockDoc folder first."
}

if (-not (Test-BlockDocServer)) {
  $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
  $serverProcess = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @("`"$viteScript`"", "--host", "127.0.0.1", "--port", "5173", "--strictPort") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -PassThru

  Set-Content -LiteralPath $pidFile -Value $serverProcess.Id -Encoding ascii

  $deadline = (Get-Date).AddSeconds(20)
  while ((Get-Date) -lt $deadline -and -not (Test-BlockDocServer)) {
    Start-Sleep -Milliseconds 250
  }

  if (-not (Test-BlockDocServer)) {
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
    throw "BlockDoc did not start within 20 seconds."
  }
}

if (-not $NoOpen) {
  Start-Process $url
}

