param([switch]$Clean)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$release = Join-Path $root 'release'
$portable = Join-Path $release 'OpenCLI'
$manifest = Join-Path $root 'src-tauri\Cargo.toml'
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

if ($Clean) {
  if (Test-Path -LiteralPath $release) {
    Remove-PathWithRetry -Path $release
  }
  & cargo clean --manifest-path $manifest
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

if (Test-Path -LiteralPath $portable) {
  Remove-PathWithRetry -Path $portable
}
New-Item -ItemType Directory -Path $portable -Force | Out-Null

& pnpm exec tauri build --no-bundle --ci
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$exe = Join-Path $root 'src-tauri\target\release\open-cli.exe'
if (-not (Test-Path -LiteralPath $exe)) {
  throw "Executable tidak ditemukan: $exe"
}
Copy-Item -LiteralPath $exe -Destination (Join-Path $portable 'OpenCLI.exe') -Force

$bootstrapper = Join-Path $root 'scripts\assets\MicrosoftEdgeWebview2Setup.exe'
if (Test-Path -LiteralPath $bootstrapper) {
  Copy-Item -LiteralPath $bootstrapper -Destination (Join-Path $portable 'MicrosoftEdgeWebview2Setup.exe') -Force
}

$info = @"
Open CLI portable

Jalankan OpenCLI.exe dari folder ini. Aplikasi tidak perlu diinstal.

Data aplikasi dan profil browser disimpan di:
%USERPROFILE%\.config\opencli

Build development memakai:
%USERPROFILE%\.config\opencli-dev

WebView2 runtime diperlukan. Windows 11 sudah menyertakannya. Untuk Windows 10,
jalankan MicrosoftEdgeWebview2Setup.exe jika file tersebut disertakan.
"@
Set-Content -LiteralPath (Join-Path $portable 'README.txt') -Value $info -Encoding UTF8

Write-Host "Release portable siap: $portable"
