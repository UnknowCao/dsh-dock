# build-launcher.ps1 — compile the prebuilt dsh-dock launcher executable.
#
# One-time at development time: the compiled assets/dsh-dock-launcher.exe is
# committed to the repository, so end-user installs never need a compiler.
# Re-run after editing src/DshDockLauncher.cs.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-launcher.ps1

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $projectRoot 'src\DshDockLauncher.cs'
$icon = Join-Path $projectRoot 'assets\dsh-dock.ico'
$output = Join-Path $projectRoot 'assets\dsh-dock-launcher.exe'

if (-not (Test-Path -LiteralPath $source)) { throw "source not found: $source" }
if (-not (Test-Path -LiteralPath $icon)) { throw "icon not found: $icon" }

$compilerCandidates = @(
  'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe',
  'C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe'
)
$compiler = $compilerCandidates | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
  Select-Object -First 1
if (-not $compiler) { throw 'The .NET Framework C# compiler (csc.exe) was not found.' }

$compilerArgs = @(
  '/nologo',
  '/target:winexe',
  '/optimize+',
  "/win32icon:$icon",
  "/out:$output",
  '/reference:System.dll',
  '/reference:System.Core.dll',
  '/reference:System.Windows.Forms.dll',
  '/reference:System.Drawing.dll',
  $source
)

& $compiler @compilerArgs
if ($LASTEXITCODE -ne 0) { throw "C# compiler failed with exit code $LASTEXITCODE" }

$exe = Get-Item -LiteralPath $output
Write-Output "Built $output ($($exe.Length) bytes, $($exe.LastWriteTime))"

# Sanity: the launcher marker must be visible in the binary (the installer
# uses it to recognize and refresh an older desktop copy).
$bytes = [System.IO.File]::ReadAllBytes($output)
$text = [System.Text.Encoding]::ASCII.GetString($bytes)
if (-not $text.Contains('dsh-dock-launcher')) {
  throw 'marker sanity check failed: dsh-dock-launcher not found in binary'
}
Write-Output 'marker sanity: OK'
