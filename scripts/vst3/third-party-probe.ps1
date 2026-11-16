param(
    [string]$BuildRoot = (Join-Path $PSScriptRoot '..\..\third_party\unbox-vst3-host-smoke-build')
)

# Runs the third-party hosting probe against whichever ADelay build exists: the one smoke.ps1 compiles
# into the fixture build directory (CI), or a prebuilt SDK sample from an earlier SDK build (this machine).
$ErrorActionPreference = 'Stop'
$BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)

$hostExe = Join-Path $BuildRoot 'unbox-vst3-third-party-host.exe'
if (-not (Test-Path -LiteralPath $hostExe)) {
    throw "The generic host is missing: '$hostExe'. Build it with scripts\vst3\smoke.ps1."
}

$candidates = @(
    (Join-Path $BuildRoot 'VST3\Release\third-party-adelay.vst3'),
    (Join-Path $BuildRoot 'VST3\Release\adelay.vst3'),
    (Join-Path $PSScriptRoot '..\..\third_party\vst3sdk-ninja-release\VST3\Release\adelay.vst3')
)
$plugin = $candidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $plugin) {
    throw "No third-party ADelay module was found. Build it with scripts\vst3\smoke.ps1 (target third-party-adelay)."
}

# 0.25 normalized delay = 250 ms at 48 kHz; the probe asserts the click lands there.
$probe = Join-Path $PSScriptRoot 'run-third-party-host-probe.cjs'
& node $probe $hostExe $plugin --param 100=0.25
exit $LASTEXITCODE
