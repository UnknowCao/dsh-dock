# verify-health-gate.ps1 — regression check for the HTTP-200 health gate.
#
# Scenario under test: the server answers HTTP (the REAL running DSH, probed
# read-only) and the log contains a token URL line that never serves 200 — the
# demo log holds a stale token line, which the real server answers with 401.
# The OLD four-layer launcher would treat the log line as ready and open Edge
# into a fake 401 window; the NEW launcher must keep waiting — quick-path
# retries exhaust, then the card keeps polling (process stays alive, no window
# opens).
#
# Uses a temporary launcher.ini (restored afterwards) and the throwaway demo
# log with demo-only marker paths; the real dsh-server.log and the running
# server are never modified.
#
# Usage: pwsh -NoProfile -File scripts/verify-health-gate.ps1

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms

$repo = Join-Path $PSScriptRoot '..'
$launcher = Join-Path $env:USERPROFILE '.dsh\launcher'
$exe = Join-Path $repo 'assets\dsh-dock-launcher.exe'
$ini = Join-Path $launcher 'launcher.ini'
if (-not (Test-Path $exe)) { throw "prebuilt launcher not found: $exe" }

$Port = 3080
$demoLog = Join-Path $launcher 'dsh-card-demo.log'
$demoLock = Join-Path $launcher '.starting-lock-demo'
$demoStopping = Join-Path $launcher '.stopping-demo'
$demoProfile = Join-Path $env:TEMP 'dsh-dock-demo-profile'
$demoBatch = Join-Path $env:TEMP 'dsh-dock-demo-never.cmd'

function To-B64([string]$s) { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($s)) }
function Write-DemoIni {
  $lines = New-Object 'System.Collections.Generic.List[string]'
  $lines.Add('URL=' + (To-B64 "http://127.0.0.1:$Port/"))
  $lines.Add('LOG=' + (To-B64 $demoLog))
  $lines.Add('BATCH=' + (To-B64 $demoBatch))
  $lines.Add('PROFILE=' + (To-B64 $demoProfile))
  $lines.Add('STOPPING=' + (To-B64 $demoStopping))
  $lines.Add('LOCK=' + (To-B64 $demoLock))
  $lines.Add('WHALE=' + (To-B64 (Join-Path $launcher 'whale.png')))
  # UTF-8 WITHOUT BOM — a BOM would corrupt the first key.
  [System.IO.File]::WriteAllLines($ini, [string[]]$lines,
    (New-Object System.Text.UTF8Encoding($false)))
}

$origIni = $null
if (Test-Path $ini) { $origIni = Get-Content -Raw -Encoding UTF8 $ini }
$proc = $null
try {
  Write-DemoIni
  Remove-Item -Force $demoLog, $demoLock, $demoStopping -ErrorAction SilentlyContinue
  # The trap: a token line whose URL only ever answers 401.
  Set-Content -Path $demoLog -Value "dsh web: http://127.0.0.1:$Port/?token=stale-demo-only" -Encoding UTF8

  $proc = Start-Process -FilePath $exe -PassThru
  # Quick path: 10 x 500ms retries, then the card appears and keeps polling.
  Start-Sleep -Seconds 11
  if ($proc.HasExited) {
    Write-Host "FAIL: launcher exited within 11s — it opened a window for a 401 token URL."
    exit 1
  }
  Write-Host "PASS: launcher stayed alive 11s with a 401-only token line — health gate held, no fake window."
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  if ($origIni -ne $null) { Set-Content -Path $ini -Value $origIni -Encoding UTF8 }
  else { Remove-Item -Force $ini -ErrorAction SilentlyContinue }
  Remove-Item -Force $demoLog, $demoLock, $demoStopping -ErrorAction SilentlyContinue
  Remove-Item -Force $demoProfile -Recurse -ErrorAction SilentlyContinue
}
