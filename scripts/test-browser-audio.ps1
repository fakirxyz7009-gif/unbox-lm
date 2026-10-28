param(
  [ValidateSet('multisample-engine', 'midi-recording', 'midi-bootstrap', 'midi-ui-recording', 'physical-midi-ui-recording', 'physical-midi-recording', 'recorded-pack', 'ocarina-pack', 'button-accordion-pack', 'electric-pianos-pack', 'freepats-clarinet-pack', 'freepats-harp-pack', 'freepats-bass-pack', 'freepats-recorder-pack', 'freepats-bagpipe-pack', 'shinyguitar-pack', 'ganjo-pack', 'vcsl-pipe-organ-pack', 'vcsl-marimba-pack', 'note-audio-editing', 'lcd-editor-adsr', 'subvoice-state', 'granular-live-offline', 'advanced-synthesis-live-offline', 'undo-chain', 'vsco-cello-articulations-pack', 'live-offline-audio-parity', 'mod-wheel-layer', 'lfo-wave-switch', 'vocoder-attack', 'pitch-correction', 'sf2-import', 'device-audio-smoke', 'effect-bypass', 'effect-response', 'dynamics-sidechain', 'device-soak', 'project-roundtrip', 'project-recovery', 'export-roundtrip', 'export-page-ui', 'rack-ui-workflow')]
  [string]$Probe = 'multisample-engine',
  [switch]$Headed,
  [ValidateRange(5, 3600)]
  [int]$SoakSeconds = 600,
  [string]$EffectType = '',
  [string]$DeviceType = '',
  [switch]$WarmBeforeDevice,
  [switch]$EffectsFirst
)

$ErrorActionPreference = 'Stop'
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
