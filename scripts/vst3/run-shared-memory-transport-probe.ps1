param(
  [ValidateRange(1, 20)]
  [int]$PacedRuns = 1
)

$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$smokeScript = Join-Path $PSScriptRoot 'smoke.ps1'
$buildRoot = Join-Path $sourceRoot 'third_party\unbox-vst3-host-smoke-build'
$plugin = Join-Path $buildRoot 'VST3\Release\unbox-test-delay.vst3'
$synth = Join-Path $buildRoot 'VST3\Release\unbox-test-synth.vst3'
$hostExe = Join-Path $buildRoot 'unbox-vst3-shared-memory-host.exe'

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smokeScript
if ($LASTEXITCODE -ne 0) {
  throw "Building the project-owned VST3 fixtures and shared-memory host failed with exit code $LASTEXITCODE."
}

foreach ($artifact in @($plugin, $synth, $hostExe)) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    throw "Expected shared-memory transport artifact is missing: '$artifact'."
  }
}

& $hostExe $plugin --burst
if ($LASTEXITCODE -ne 0) {
  throw "The offline shared-memory transport probe failed with exit code $LASTEXITCODE."
}

for ($run = 1; $run -le $PacedRuns; $run++) {
  if ($PacedRuns -gt 1) { Write-Output "Paced delay transport run $run/$PacedRuns" }
  & $hostExe $plugin --paced
  if ($LASTEXITCODE -ne 0) {
    throw "The paced delay shared-memory transport probe failed on run $run/$PacedRuns with exit code $LASTEXITCODE."
  }
}

& $hostExe $synth --midi-burst
if ($LASTEXITCODE -ne 0) {
  throw "The MIDI shared-memory burst probe failed with exit code $LASTEXITCODE."
}

for ($run = 1; $run -le $PacedRuns; $run++) {
  if ($PacedRuns -gt 1) { Write-Output "Paced MIDI transport run $run/$PacedRuns" }
  & $hostExe $synth --midi-paced
  if ($LASTEXITCODE -ne 0) {
    throw "The paced MIDI shared-memory probe failed on run $run/$PacedRuns with exit code $LASTEXITCODE."
  }
}
