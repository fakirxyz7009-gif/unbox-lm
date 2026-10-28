param(
    [string]$SdkRoot = (Join-Path $PSScriptRoot '..\..\third_party\vst3sdk'),
    [string]$BuildRoot = (Join-Path $PSScriptRoot '..\..\third_party\unbox-vst3-host-smoke-build')
)

$ErrorActionPreference = 'Stop'
$SdkRoot = [System.IO.Path]::GetFullPath($SdkRoot)
$BuildRoot = [System.IO.Path]::GetFullPath($BuildRoot)
$SourceRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)

if (-not (Test-Path -LiteralPath (Join-Path $SdkRoot 'CMakeLists.txt'))) {
    throw "Steinberg VST3 SDK not found at '$SdkRoot'. Fetch its official source and submodules, or pass -SdkRoot."
}

$vsWhere = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft Visual Studio\Installer\vswhere.exe'
if (-not (Test-Path -LiteralPath $vsWhere)) {
    throw "Visual Studio locator not found at '$vsWhere'. Install the Visual Studio C++ build tools."
}

$installRoot = (& $vsWhere -latest -products '*' -property installationPath | Select-Object -First 1).Trim()
if (-not $installRoot) {
    throw 'No Visual Studio installation was found by vswhere.'
}

$vsDevCmd = Join-Path $installRoot 'Common7\Tools\VsDevCmd.bat'
$cmake = Join-Path $installRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
$ninja = Join-Path $installRoot 'Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe'
foreach ($tool in @($vsDevCmd, $cmake, $ninja)) {
    if (-not (Test-Path -LiteralPath $tool)) {
        throw "Required Visual Studio build tool not found: '$tool'."
    }
}

$compilerCommand = '"' + $vsDevCmd + '" -arch=x64 -host_arch=x64 >nul && where.exe cl.exe'
$compiler = (& cmd.exe /d /s /c $compilerCommand | Select-Object -First 1).Trim()
if (-not $compiler -or -not (Test-Path -LiteralPath $compiler)) {
    throw 'Could not locate the x64 MSVC compiler in the Visual Studio developer environment.'
}

$configureCommand = '"' + $vsDevCmd + '" -arch=x64 -host_arch=x64 >nul && "' + $cmake + '"' +
    ' -S "' + $SourceRoot + '" -B "' + $BuildRoot + '" -G Ninja' +
    ' -DCMAKE_MAKE_PROGRAM="' + $ninja + '"' +
    ' -DCMAKE_C_COMPILER="' + $compiler + '"' +
    ' -DCMAKE_CXX_COMPILER="' + $compiler + '"' +
    ' -DCMAKE_BUILD_TYPE=Release -DCMAKE_TRY_COMPILE_CONFIGURATION=Release' +
    ' -DVST3_SDK_ROOT="' + $SdkRoot + '"'
& cmd.exe /d /s /c $configureCommand
if ($LASTEXITCODE -ne 0) {
    throw "VST3 smoke CMake configuration failed with exit code $LASTEXITCODE."
}

$buildFile = Join-Path $BuildRoot 'build.ninja'
$buildText = Get-Content -LiteralPath $buildFile -Raw
$pdbFlagCount = [regex]::Matches($buildText, '(?i)/Zi').Count
if ($pdbFlagCount -gt 0) {
    # This machine's MSVC PDB manager rejects /Zi; embedded CodeView builds cleanly.
    $buildText = [regex]::Replace($buildText, '(?i)/Zi', '/Z7')
    Set-Content -LiteralPath $buildFile -Value $buildText -NoNewline
    Write-Output "Using /Z7 for $pdbFlagCount generated SDK debug-info flags (local toolchain workaround)."
}

$ninjaCommand = '"' + $vsDevCmd + '" -arch=x64 -host_arch=x64 >nul && "' + $ninja + '"' +
    ' -C "' + $BuildRoot + '" validator unbox-test-delay unbox-test-synth unbox-vst3-host-smoke unbox-vst3-instrument-smoke unbox-vst3-process-stream-host unbox-vst3-midi-process-stream-host unbox-vst3-shared-memory-host -j 8'
& cmd.exe /d /s /c $ninjaCommand
if ($LASTEXITCODE -ne 0) {
    throw "VST3 smoke build failed with exit code $LASTEXITCODE."
}

$plugin = Join-Path $BuildRoot 'VST3\Release\unbox-test-delay.vst3'
$instrument = Join-Path $BuildRoot 'VST3\Release\unbox-test-synth.vst3'
$hostExe = Join-Path $BuildRoot 'unbox-vst3-host-smoke.exe'
$instrumentHostExe = Join-Path $BuildRoot 'unbox-vst3-instrument-smoke.exe'
$processStreamHostExe = Join-Path $BuildRoot 'unbox-vst3-process-stream-host.exe'
$midiProcessStreamHostExe = Join-Path $BuildRoot 'unbox-vst3-midi-process-stream-host.exe'
$sharedMemoryHostExe = Join-Path $BuildRoot 'unbox-vst3-shared-memory-host.exe'
$validator = Join-Path $BuildRoot 'bin\validator.exe'
foreach ($artifact in @($plugin, $instrument, $hostExe, $instrumentHostExe, $processStreamHostExe, $midiProcessStreamHostExe, $sharedMemoryHostExe, $validator)) {
    if (-not (Test-Path -LiteralPath $artifact)) {
        throw "Expected smoke artifact was not built: '$artifact'."
    }
}

& $hostExe $plugin
if ($LASTEXITCODE -ne 0) {
    throw "Native VST3 audio smoke failed with exit code $LASTEXITCODE."
}

& $validator $plugin
if ($LASTEXITCODE -ne 0) {
    throw "Steinberg VST3 validation failed with exit code $LASTEXITCODE."
}

& $instrumentHostExe $instrument
if ($LASTEXITCODE -ne 0) {
    throw "Native VST3 MIDI instrument smoke failed with exit code $LASTEXITCODE."
}

& $validator $instrument
if ($LASTEXITCODE -ne 0) {
    throw "Steinberg VST3 validation failed for the MIDI instrument with exit code $LASTEXITCODE."
}

Write-Output 'VST3 effect and MIDI instrument host smoke passed.'
