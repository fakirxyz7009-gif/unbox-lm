param(
  [ValidateSet('multisample-engine', 'midi-recording', 'midi-bootstrap', 'midi-ui-recording', 'physical-midi-ui-recording', 'physical-midi-recording', 'recorded-pack', 'ocarina-pack', 'button-accordion-pack', 'electric-pianos-pack', 'freepats-clarinet-pack', 'freepats-harp-pack', 'freepats-bass-pack', 'freepats-recorder-pack', 'freepats-bagpipe-pack', 'shinyguitar-pack', 'ganjo-pack', 'vcsl-pipe-organ-pack', 'vcsl-marimba-pack', 'batch-001', 'batch-002', 'batch-003', 'batch-004', 'batch-005', 'batch-006', 'batch-007', 'note-audio-editing', 'sample-browser-accessibility', 'patch-browser-accessibility', 'shortcut-help-accessibility', 'lcd-editor-adsr', 'subvoice-state', 'granular-live-offline', 'shared-realtime-scheduler', 'cv-shared-realtime-scheduler', 'cv-matrix-ui', 'transport-cold-start', 'realtime-bounce-clock', 'recorder-frame-stop', 'audio-take-name', 'recording-journal-recovery', 'vst-faceplate-preview-ui', 'vst-macro-replay', 'instrument-selection-event', 'instrument-selection-app', 'player-realtime-scheduler', 'third-wave-wave-envelope-cleanup', 'pulsar-audio-clock', 'advanced-synthesis-live-offline', 'undo-chain', 'vsco-cello-articulations-pack', 'live-offline-audio-parity', 'mod-wheel-layer', 'lfo-wave-switch', 'stereo-tremolo-response', 'vocoder-attack', 'pitch-correction', 'sf2-import', 'device-audio-smoke', 'level-spread', 'hiphop-kits', 'effect-bypass', 'effect-response', 'dynamics-sidechain', 'device-soak', 'project-roundtrip', 'project-recovery', 'export-roundtrip', 'export-page-ui', 'rack-ui-workflow', 'rv7000-impulse-controls', 'link-import-provenance', 'dense-synth-labels', 'mixer-readout-layout', 'performance-regression')]
  [string]$Probe = 'multisample-engine',
  [switch]$Headed,
  [ValidateRange(5, 3600)]
  [int]$SoakSeconds = 600,
  [string]$EffectType = '',
  [string]$DeviceType = '',
  [switch]$WarmBeforeDevice,
  [switch]$EffectsFirst,
  [switch]$RequirePhysicalMidi
)

$ErrorActionPreference = 'Stop'
# On a machine that is supposed to have the Impulse, missing hardware/permission must fail instead of skipping.
if ($RequirePhysicalMidi) { $env:UNBOX_REQUIRE_PHYSICAL_MIDI = '1' }
if ($WarmBeforeDevice -and -not $DeviceType) { throw '-WarmBeforeDevice requires -DeviceType.' }
$node = (Get-Command node.exe).Source
$runner = Join-Path $PSScriptRoot 'browser-probe-runner.cjs'
$runtimeModules = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'

if (-not $env:NODE_PATH -and (Test-Path -LiteralPath (Join-Path $runtimeModules 'playwright-core'))) {
  $env:NODE_PATH = $runtimeModules
}

if ($Probe -eq 'device-soak') {
  & $node $runner $Probe $SoakSeconds
} elseif ($Probe -eq 'effect-bypass' -and $EffectType) {
  & $node $runner $Probe $EffectType
} elseif ($Probe -eq 'device-audio-smoke' -and ($DeviceType -or $WarmBeforeDevice -or $EffectsFirst)) {
  $runnerArgs = @($Probe)
  if ($DeviceType) { $runnerArgs += $DeviceType }
  if ($WarmBeforeDevice) {
    $runnerArgs += '--warm-before-device'
  }
  if ($EffectsFirst) { $runnerArgs += '--effects-first' }
  & $node $runner @runnerArgs
} elseif ($Headed) {
  & $node $runner $Probe '--headed'
} else {
  & $node $runner $Probe
}
if ($LASTEXITCODE -ne 0) { throw "The browser '$Probe' probe failed." }
