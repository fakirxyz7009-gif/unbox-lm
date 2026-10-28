$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$smokeScript = Join-Path $PSScriptRoot 'smoke.ps1'
$buildRoot = Join-Path $sourceRoot 'third_party\unbox-vst3-host-smoke-build'
$synth = Join-Path $buildRoot 'VST3\Release\unbox-test-synth.vst3'
$hostExe = Join-Path $buildRoot 'unbox-vst3-midi-process-stream-host.exe'
$runner = Join-Path $PSScriptRoot 'run-midi-process-transport-probe.cjs'
$node = (Get-Command node.exe).Source

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smokeScript
if ($LASTEXITCODE -ne 0) {
  throw "Building the project-owned VST3 fixtures failed with exit code $LASTEXITCODE."
}

foreach ($artifact in @($synth, $hostExe, $runner)) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    throw "Expected MIDI process-stream probe artifact is missing: '$artifact'."
  }
}

& $node $runner $hostExe $synth
if ($LASTEXITCODE -ne 0) {
  throw "The VST3 MIDI process-stream probe failed with exit code $LASTEXITCODE."
}
