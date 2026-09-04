# capture-multidsh.ps1 - render the multi-DSH cold-card picker (demo, isolated).
# ASCII-only. Uses GetWindowRect so the crop matches the card exactly on any DPI.
param([string]$OutPath = (Join-Path $env:TEMP 'dsh-dock-lab\multidsh-card.png'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public struct RECT { public int Left, Top, Right, Bottom; }
public static class Win32Rect {
  public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT r);
  // First visible top-level window of the pid (the launcher's only window).
  public static bool TryGetRect(uint targetPid, out RECT r) {
    r = new RECT();
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == targetPid && IsWindowVisible(h)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    if (found == IntPtr.Zero) return false;
    return GetWindowRect(found, out r);
  }
}
"@

$repo   = Join-Path $PSScriptRoot '..'
$launcher = Join-Path $env:USERPROFILE '.dsh\launcher'
$exe    = Join-Path $repo 'assets\dsh-dock-launcher.exe'
$ini    = Join-Path $launcher 'launcher.ini'
$demoCand = Join-Path $launcher 'dsh-demo-candidates.json'
$demoLog  = Join-Path $launcher 'dsh-mds-demo.log'
$demoLock = Join-Path $launcher '.starting-mds-demo'
$demoStop = Join-Path $launcher '.stopping-mds-demo'
$demoState= Join-Path $launcher 'dsh-mds-demo-state.json'
$demoBatch= Join-Path $env:TEMP 'dsh-dock-demo-never.cmd'

if (-not (Test-Path $exe)) { throw "launcher not found: $exe" }
$outDir = Split-Path $OutPath -Parent; New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$cand = @{ format = 1; updatedAt = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); port = 3098; npxFallback = $null;
  candidates = @(
    @{ id='aa1111aaaa'; version='0.1.2-alpha.4'; kind='global'; path='C:\Users\MAC\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.19.0-win-x64\node_modules\@deepseek-ai\dsh'; label='0.1.2-alpha.4 (global)'; batch='start-server.cmd' },
    @{ id='bb2222bbbb'; version='0.1.2-alpha.4'; kind='npx';   path='C:\Users\MAC\AppData\Local\npm-cache\_npx\h4sh9f2abc\node_modules\@deepseek-ai\dsh'; label='0.1.2-alpha.4 (npx cache)'; batch='start-server.bb2222bbbb.cmd' },
    @{ id='cc3333cccc'; version='0.1.2-alpha.1'; kind='source'; path='C:\Users\MAC\Documents\dsh'; label='0.1.2-alpha.1 (source)'; batch='start-server.cc3333cccc.cmd' },
    @{ id='dd4444dddd'; version='0.1.2-alpha.3'; kind='npx';   path='C:\Users\MAC\AppData\Local\npm-cache\_npx\9ab3cdef12\node_modules\@deepseek-ai\dsh'; label='0.1.2-alpha.3 (npx cache)'; batch='start-server.dd4444dddd.cmd' },
    @{ id='ee5555eeee'; version='0.1.2-alpha.2'; kind='npx';   path='C:\Users\MAC\AppData\Local\npm-cache\_npx\7f6a5b4c3d\node_modules\@deepseek-ai\dsh'; label='0.1.2-alpha.2 (npx cache)'; batch='start-server.ee5555eeee.cmd' },
    @{ id='ff6666ffff'; version='0.1.2-alpha.0'; kind='npx';   path='C:\Users\MAC\AppData\Local\npm-cache\_npx\1a2b3c4d5e\node_modules\@deepseek-ai\dsh'; label='0.1.2-alpha.0 (npx cache)'; batch='start-server.ff6666ffff.cmd' }
  ) }
[System.IO.File]::WriteAllText($demoCand, ($cand | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText($demoBatch, "@echo off`r`nexit /b 0", (New-Object System.Text.ASCIIEncoding))

function To-B64([string]$s) { [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($s)) }
function Write-DemoIni {
  $lines = [System.Collections.Generic.List[string]]::new()
  $lines.Add('URL='    + (To-B64 'http://127.0.0.1:3098/'))
  $lines.Add('LOG='    + (To-B64 $demoLog))
  $lines.Add('BATCH='  + (To-B64 $demoBatch))
  $lines.Add('PROFILE='+ (To-B64 (Join-Path $env:TEMP 'dsh-mds-demo-profile')))
  $lines.Add('STOPPING='+(To-B64 $demoStop))
  $lines.Add('LOCK='   + (To-B64 $demoLock))
  $lines.Add('WHALE='  + (To-B64 (Join-Path $launcher 'whale.png')))
  $lines.Add('NODE='   + (To-B64 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'))
  $lines.Add('CANDIDATES='+(To-B64 $demoCand))
  $lines.Add('STATE='  + (To-B64 $demoState))
  $lines.Add('REFRESH='+ (To-B64 ''))
  [System.IO.File]::WriteAllLines($ini, [string[]]$lines, (New-Object System.Text.UTF8Encoding($false)))
}

$origIni = $null; if (Test-Path $ini) { $origIni = Get-Content -Raw -Encoding UTF8 $ini }
$proc = $null; $shellApp = $null
try {
  Write-DemoIni
  Remove-Item -Force $demoLog, $demoLock, $demoStop, $demoState -ErrorAction SilentlyContinue
  try { $shellApp = New-Object -ComObject Shell.Application; $shellApp.MinimizeAll() } catch { $shellApp = $null }
  $proc = Start-Process -FilePath $exe -PassThru
  Start-Sleep -Seconds 4   # fade-in + mid-countdown

  # exact card rect from the launcher's visible window (DPI-proof)
  $rect = New-Object RECT
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    $ok = [Win32Rect]::TryGetRect([uint32]$proc.Id, [ref]$rect)
    if ($ok) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $ok) { throw 'no launcher window rect' }
  $cw = $rect.Right - $rect.Left; $ch = $rect.Bottom - $rect.Top
  Write-Host "window rect: $cw x $ch at ($($rect.Left),$($rect.Top))"

  $bmp = New-Object 'System.Drawing.Bitmap' @($cw, $ch)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($rect.Left, $rect.Top, 0, 0, (New-Object System.Drawing.Size @($cw, $ch)))
  $g.Dispose()
  $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "saved: $OutPath"
} finally {
  if ($proc -and -not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  if ($shellApp -ne $null) { try { $shellApp.UndoMinimizeAll() } catch {} }
  if ($origIni -ne $null) { Set-Content -Path $ini -Value $origIni -Encoding UTF8 } else { Remove-Item -Force $ini -ErrorAction SilentlyContinue }
  Remove-Item -Force $demoCand, $demoLog, $demoLock, $demoStop, $demoState, $demoBatch -ErrorAction SilentlyContinue
  Remove-Item -Force (Join-Path $env:TEMP 'dsh-mds-demo-profile') -Recurse -ErrorAction SilentlyContinue
}
