param(
  [Parameter(Position = 0, Mandatory = $true)]
  [ValidateSet('list', 'read', 'apply')]
  [string]$Command,
  [string]$Directory,
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'
$utf8 = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = $utf8
Add-Type -AssemblyName System.Web.Extensions
$jsonSerializer = [System.Web.Script.Serialization.JavaScriptSerializer]::new()
$jsonSerializer.MaxJsonLength = [int]::MaxValue
$jsonSerializer.RecursionLimit = 256
if ($Command -eq 'list') {
  $root = Join-Path ([System.IO.Path]::GetTempPath()) 'blackdoc-ai'
  $connections = @()
  if (Test-Path -LiteralPath $root) {
    foreach ($item in Get-ChildItem -LiteralPath $root -Directory) {
      $file = Join-Path $item.FullName 'connection.json'
      if (-not (Test-Path -LiteralPath $file)) { continue }
      try {
        $connection = $jsonSerializer.DeserializeObject([IO.File]::ReadAllText($file, $utf8))
        $connections += [pscustomobject]@{ directory = $item.FullName; path = $connection.path; protocol = $connection.protocol }
      } catch { continue }
    }
  }
  ConvertTo-Json -InputObject @($connections) -Depth 5 -Compress
  exit 0
}
if (-not $Directory) { throw 'Provide -Directory with a connection returned by list.' }
$connection = $jsonSerializer.DeserializeObject([IO.File]::ReadAllText((Join-Path $Directory 'connection.json'), $utf8))
if ($connection.protocol -ne 2 -or -not $connection.token) { throw 'Unsupported AI connection protocol.' }
if ($Command -eq 'apply') {
  if (-not $InputPath) { throw 'Provide -InputPath containing revision and blocks.' }
  $request = $jsonSerializer.DeserializeObject([IO.File]::ReadAllText((Resolve-Path -LiteralPath $InputPath).Path, $utf8))
  if (-not $request.revision -or $null -eq $request.blocks) { throw 'Request requires revision and blocks.' }
} else { $request = @{} }
$request['operation'] = $Command
$request['token'] = $connection.token
$request['id'] = [guid]::NewGuid().ToString()
$lockPath = Join-Path $Directory 'client.lock'
$lock = [IO.File]::Open($lockPath, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
try {
  $requestPath = Join-Path $Directory 'request.json'
  if (Test-Path -LiteralPath $requestPath) { throw 'A request is already pending.' }
  $temporary = Join-Path $Directory ($request.id + '.tmp')
  [IO.File]::WriteAllText($temporary, $jsonSerializer.Serialize($request), $utf8)
  [IO.File]::Move($temporary, $requestPath)
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  $result = $null
  while ([DateTime]::UtcNow -lt $deadline) {
    $responsePath = Join-Path $Directory 'response.json'
    if (Test-Path -LiteralPath $responsePath) {
      try {
        $response = $jsonSerializer.DeserializeObject([IO.File]::ReadAllText($responsePath, $utf8))
        if ($response.id -eq $request.id) { $result = $response; break }
      } catch { }
    }
    Start-Sleep -Milliseconds 200
  }
  if ($null -eq $result) { throw 'Timed out; inspect the live document before retrying.' }
  $success = $result.ok
  if ($Command -eq 'read' -and $success) { $result = $result.snapshot }
  $json = $jsonSerializer.Serialize($result)
  [Console]::OutputEncoding = $utf8
  [Console]::WriteLine($json)
  if (-not $success) { exit 1 }
} finally {
  $lock.Dispose()
  Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue
}
