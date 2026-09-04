# capture-demo-card.ps1 — reproduce the dsh-dock cold-card screenshot.
#
# Re-records docs/screenshots/cold-card.png from the REAL prebuilt launcher
# (assets/dsh-dock-launcher.exe) running against an isolated demo config:
#   - a temporary launcher.ini points the URL at the REAL running DSH (read-
#     only probes) but its LOG at a throwaway demo log that holds a STALE
#     token line — the real server answers it with 401, so the launcher
#     exhausts the quick-path retries and settles into the breathing
#     "正在连接" card, exactly the UI the screenshot shows;
#   - demo-only lock/stopping paths keep the real markers untouched, and the
#     real dsh-server.log never receives a demo line.
#
# Usage:
#   pwsh -NoProfile -File scripts/capture-demo-card.ps1
#   pwsh -NoProfile -File scripts/capture-demo-card.ps1 -OutPath C:\tmp\card.png

param(
  [int]$Port = 3080,
  [string]$OutPath = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing

$repo = Join-Path $PSScriptRoot '..'
$launcher = Join-Path $env:USERPROFILE '.dsh\launcher'
$exe = Join-Path $repo 'assets\dsh-dock-launcher.exe'
$ini = Join-Path $launcher 'launcher.ini'
if (-not (Test-Path $exe)) { throw "prebuilt launcher not found: $exe (run scripts/build-launcher.ps1)" }
if ($OutPath -eq '') { $OutPath = Join-Path $repo 'docs\screenshots\cold-card.png' }
$outDir = Split-Path $OutPath -Parent
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# Demo-only file set: never the real log/lock/stopping files.
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
  # UTF-8 WITHOUT BOM (the launcher trims whitespace only; a BOM would
  # corrupt the first key) — use the .NET writer directly.
  [System.IO.File]::WriteAllLines($ini, [string[]]$lines,
    (New-Object System.Text.UTF8Encoding($false)))
}

$origIni = $null
if (Test-Path $ini) { $origIni = Get-Content -Raw -Encoding UTF8 $ini }
$shellApp = $null
$proc = $null
try {
  Write-DemoIni
  Remove-Item -Force $demoLog, $demoLock, $demoStopping -ErrorAction SilentlyContinue
  # A stale token line pointing at the real server: it answers 401, so the
  # quick path exhausts and the launcher settles into the waiting card.
  Set-Content -Path $demoLog -Value "dsh web: http://127.0.0.1:$Port/?token=stale-demo-only" -Encoding UTF8

  try { $shellApp = New-Object -ComObject Shell.Application; $shellApp.MinimizeAll() } catch { $shellApp = $null }

  $proc = Start-Process -FilePath $exe -PassThru
  # Quick path retries ~5s, then the card fades in breathing.
  Start-Sleep -Seconds 8

  $screen = [System.Windows.Forms.Screen]::PrimaryScreen
  $scale = 1.0
  try {
    $dpi = (Get-ItemProperty 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name AppliedDPI -ErrorAction Stop).AppliedDPI
    $scale = $dpi / 96.0
  } catch { }
  $wa = $screen.WorkingArea
  $cw = [int](340 * $scale); $ch = [int](184 * $scale)
  $cx = [int](($wa.Left + $wa.Width / 2) * $scale - $cw / 2)
  $cy = [int](($wa.Top + $wa.Height / 2) * $scale - $ch / 2)
  $inset = [int](8 * $scale)
  $cropW = $cw - (2 * $inset); $cropH = $ch - (2 * $inset)

  # The whale breathes (~1.4s cycle); take 4 shots and keep the brightest
  # whale band among shots that actually show the card's dark backdrop.
  $bestShot = $null; $bestScore = -1.0
  for ($shot = 0; $shot -lt 4; $shot++) {
    if ($shot -gt 0) { Start-Sleep -Milliseconds 450 }
    $bmp = New-Object 'System.Drawing.Bitmap' -ArgumentList @($screen.Bounds.Width, $screen.Bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    try { $g.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size) }
    finally { $g.Dispose() }
    $crop = New-Object 'System.Drawing.Bitmap' -ArgumentList @($cropW, $cropH)
    $g2 = [System.Drawing.Graphics]::FromImage($crop)
    try {
      $dstRect = New-Object 'System.Drawing.Rectangle' -ArgumentList @(0, 0, $cropW, $cropH)
      $srcX = $cx + $inset; $srcY = $cy + $inset
      $srcRect = New-Object 'System.Drawing.Rectangle' -ArgumentList @($srcX, $srcY, $cropW, $cropH)
      $g2.DrawImage($bmp, $dstRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    } finally { $g2.Dispose() }
    $bmp.Dispose()
    $brightN = 0; $darkN = 0
    for ($y = 0; $y -lt $cropH; $y += 2) {
      for ($x = 0; $x -lt $cropW; $x += 2) {
        $p = $crop.GetPixel($x, $y)
        $lum = ($p.R + $p.G + $p.B) / 3.0
        if ($y -ge [int]($cropH * 0.15) -and $y -lt [int]($cropH * 0.55) -and $lum -gt 120) { $brightN++ }
        if ($lum -lt 60) { $darkN++ }
      }
    }
    $totalPx = [int](($cropH / 2) * ($cropW / 2))
    $valid = ($totalPx -gt 0) -and (($darkN / $totalPx) -gt 0.7)
    $score = $brightN
    Write-Host "shot $shot valid=$valid whaleBrightPx=$score"
    if ($valid -and $score -gt $bestScore) {
      $bestScore = $score
      if ($bestShot -ne $null) { $bestShot.Dispose() }
      $bestShot = $crop
    } else { $crop.Dispose() }
  }
  if ($bestShot -eq $null) {
    Write-Warning "no valid shot showed the card backdrop — crop coordinates may be off."
    exit 1
  }
  $bestShot.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bestShot.Dispose()

  $check = New-Object 'System.Drawing.Bitmap' -ArgumentList @($OutPath)
  $dark = 0; $mid = 0; $total = 0
  for ($y = 0; $y -lt $check.Height; $y += 3) {
    for ($x = 0; $x -lt $check.Width; $x += 3) {
      $p = $check.GetPixel($x, $y); $total++
      $lum = ($p.R + $p.G + $p.B) / 3
      if ($lum -lt 60) { $dark++ } elseif ($lum -lt 170) { $mid++ }
    }
  }
  $check.Dispose()
  # The card is a dark gradient surface (bg 20..42) with a mid-tone whale and
  # caption. The breathing lamp swings the whale between ~75 and ~225, so a
  # low-brightness phase must not be mistaken for a missed crop — require the
  # dark backdrop instead.
  $darkRatio = if ($total -gt 0) { $dark / $total } else { 0 }
  if ($darkRatio -lt 0.75) {
    Write-Warning "dark backdrop ratio $([math]::Round($darkRatio,3)) too low — crop may be off. Inspect $OutPath."
  } else {
    Write-Host "OK: dark backdrop $([math]::Round($darkRatio,3)) / mid-tones $([math]::Round($mid / $total,3)) — card captured."
  }
  Write-Host "saved: $OutPath"
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  if ($shellApp -ne $null) { try { $shellApp.UndoMinimizeAll() } catch { } }
  if ($origIni -ne $null) { Set-Content -Path $ini -Value $origIni -Encoding UTF8 }
  else { Remove-Item -Force $ini -ErrorAction SilentlyContinue }
  Remove-Item -Force $demoLog, $demoLock, $demoStopping -ErrorAction SilentlyContinue
  Remove-Item -Force $demoProfile -Recurse -ErrorAction SilentlyContinue
}
