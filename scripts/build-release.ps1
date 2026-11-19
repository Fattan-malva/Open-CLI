param([switch]$Clean)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$manifest = Join-Path $root 'src-tauri\Cargo.toml'
$target = Join-Path $root 'src-tauri\target'
$packageJson = Join-Path $root 'package.json'
$installerDir = Join-Path $root 'src-tauri\target\release\bundle\nsis'

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

if ($Clean) {
  if (Test-Path -LiteralPath $release) {
    Remove-PathWithRetry -Path $release
  }
  & cargo clean --manifest-path $manifest
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (-not (Test-Path -LiteralPath $release)) {
  New-Item -ItemType Directory -Path $release -Force | Out-Null
}

Get-ChildItem -LiteralPath $release -Filter 'opencli-*.exe' -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

& pnpm run version:sync
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

& pnpm exec tauri build --ci
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$installers = @(Get-ChildItem -LiteralPath $installerDir -Filter '*.exe' -ErrorAction SilentlyContinue)
if ($installers.Count -eq 0) {
  throw "Installer NSIS tidak ditemukan di: $installerDir"
}

$installer = $installers | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$version = (Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version
$destination = Join-Path $release "opencli-$version.exe"

Copy-Item -LiteralPath $installer.FullName -Destination $destination -Force

Write-Host "Release installer siap: $destination"
