$ErrorActionPreference = 'Stop'
$sourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$smokeScript = Join-Path $PSScriptRoot 'smoke.ps1'
$buildRoot = Join-Path $sourceRoot 'third_party\unbox-vst3-host-smoke-build'
$plugin = Join-Path $buildRoot 'VST3\Release\unbox-test-delay.vst3'
$streamHostExe = Join-Path $buildRoot 'unbox-vst3-process-stream-host.exe'
$midiStreamHostExe = Join-Path $buildRoot 'unbox-vst3-midi-process-stream-host.exe'
$runner = Join-Path $PSScriptRoot 'run-process-transport-probe.cjs'
$midiRunner = Join-Path $PSScriptRoot 'run-midi-process-transport-probe.cjs'
$node = (Get-Command node.exe).Source

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $smokeScript
if ($LASTEXITCODE -ne 0) {
  throw "Building the project-owned VST3 fixtures failed with exit code $LASTEXITCODE."
}

foreach ($artifact in @($plugin, $streamHostExe, $midiStreamHostExe, $runner, $midiRunner)) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    throw "Expected process-transport probe artifact is missing: '$artifact'."
  }
}

& $node $runner $streamHostExe $plugin
if ($LASTEXITCODE -ne 0) {
  throw "The project-owned VST3 process-transport probe failed with exit code $LASTEXITCODE."
}

& $node $runner $streamHostExe $plugin --paced
if ($LASTEXITCODE -ne 0) {
  throw "The wall-clock-paced VST3 process-transport probe failed with exit code $LASTEXITCODE."
}

$synth = Join-Path $buildRoot 'VST3\Release\unbox-test-synth.vst3'
& $node $midiRunner $midiStreamHostExe $synth
if ($LASTEXITCODE -ne 0) {
  throw "The VST3 MIDI process-stream probe failed with exit code $LASTEXITCODE."
}
