$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$target = Join-Path $root 'src-tauri\target'

function Stop-OpenCliProcesses {
  Get-Process -Name 'OpenCLI', 'open-cli' -ErrorAction SilentlyContinue |
    Where-Object {
      $path = $_.Path
      if ([string]::IsNullOrWhiteSpace($path)) {
        return $true
      }
      $path.StartsWith($release, [StringComparison]::OrdinalIgnoreCase) -or
        $path.StartsWith($target, [StringComparison]::OrdinalIgnoreCase)
    } |
    Stop-Process -Force -ErrorAction SilentlyContinue
}

function Remove-PathWithRetry {
  param([string]$Path)

  for ($attempt = 0; $attempt -lt 12; $attempt++) {
    try {
      if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
      }
      return
    } catch {
      if ($attempt -eq 11) {
        throw
      }
      Start-Sleep -Milliseconds 500
    }
  }
}

Stop-OpenCliProcesses

$paths = @(
  (Join-Path $root 'dist'),
  (Join-Path $root 'release'),
  (Join-Path $root '.vite'),
  $target
)

foreach ($path in $paths) {
  if (Test-Path -LiteralPath $path) {
    Remove-PathWithRetry -Path $path
  }
}

Write-Host 'Build artifacts dibersihkan.'
