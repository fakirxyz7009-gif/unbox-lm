[CmdletBinding()]
param(
  [string]$ArtifactPath = 'release\g0\Unbox-Studio-1.0.0-rc.2.exe',
  [string]$InstallerPath = '',
  [string]$PreviousArtifactPath = '',
  [string]$OutputDir = '',
  [int]$ProcessId = 0,
  [int]$ProcessSampleSeconds = 0,
  [int]$ProcessSampleIntervalSeconds = 15
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$startedAt = Get-Date
if ([string]::IsNullOrWhiteSpace($OutputDir)) {
  $OutputDir = Join-Path $repoRoot ('G4-evidence-' + $startedAt.ToString('yyyyMMdd-HHmmss'))
} elseif (-not [System.IO.Path]::IsPathRooted($OutputDir)) {
  $OutputDir = Join-Path $repoRoot $OutputDir
}
$OutputDir = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding($false)
$errors = New-Object System.Collections.Generic.List[string]

function Resolve-InputPath([string]$Path, [string]$Role) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
  $resolved = $Path
  if (-not [System.IO.Path]::IsPathRooted($resolved)) {
    $resolved = Join-Path $repoRoot $resolved
  }
  try {
    return [System.IO.Path]::GetFullPath($resolved)
  } catch {
    $errors.Add("${Role}: invalid path '$Path': $($_.Exception.Message)")
    return $null
  }
}

function Write-JsonFile([string]$Name, $Value) {
  $path = Join-Path $OutputDir $Name
  [System.IO.File]::WriteAllText($path, (($Value | ConvertTo-Json -Depth 8) + "`n"), $utf8)
  return $path
}

function Get-ArtifactRecord([string]$Path, [string]$Role) {
  $resolved = Resolve-InputPath $Path $Role
  if (-not $resolved) { return [pscustomobject]@{ role = $Role; requestedPath = $Path; found = $false; error = 'empty path' } }
  if (-not (Test-Path -LiteralPath $resolved -PathType Leaf)) {
    return [pscustomobject]@{ role = $Role; requestedPath = $Path; resolvedPath = $resolved; found = $false; error = 'file not found' }
  }
  $record = [ordered]@{
    role = $Role
    requestedPath = $Path
    resolvedPath = $resolved
    found = $true
    lengthBytes = (Get-Item -LiteralPath $resolved).Length
    sha256 = (Get-FileHash -LiteralPath $resolved -Algorithm SHA256).Hash
  }
  try {
    $signature = Get-AuthenticodeSignature -LiteralPath $resolved
    $record.signatureStatus = $signature.Status.ToString()
    $record.signer = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  } catch { $errors.Add("${Role}: signature check failed: $($_.Exception.Message)") }
  try {
    $version = (Get-Item -LiteralPath $resolved).VersionInfo
    $record.fileVersion = $version.FileVersion
    $record.productVersion = $version.ProductVersion
    $record.fileDescription = $version.FileDescription
    $record.productName = $version.ProductName
  } catch { $errors.Add("${Role}: version check failed: $($_.Exception.Message)") }
  return [pscustomobject]$record
}

function Get-CommandPresence([string]$Name) {
  try {
    $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($command) { return [pscustomobject]@{ name = $Name; found = $true; source = $command.Source; commandType = $command.CommandType.ToString() } }
  } catch { $errors.Add("clean-state: Get-Command $Name failed: $($_.Exception.Message)") }
  return [pscustomobject]@{ name = $Name; found = $false; source = $null; commandType = $null }
}

function Get-InstalledUnboxEntries {
  $paths = @(
    'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $entries = New-Object System.Collections.Generic.List[object]
  foreach ($path in $paths) {
    try {
      $items = @(Get-ItemProperty -Path $path -ErrorAction SilentlyContinue)
      foreach ($item in $items) {
        if ($item.DisplayName -and $item.DisplayName -match 'Unbox') {
          $entries.Add([pscustomobject]@{
            displayName = $item.DisplayName
            displayVersion = $item.DisplayVersion
            installLocation = $item.InstallLocation
            uninstallString = $item.UninstallString
            registryPath = $path
          })
        }
      }
    } catch { $errors.Add("clean-state: installed-app scan '$path' failed: $($_.Exception.Message)") }
  }
  return $entries.ToArray()
}

function Get-TreeIds([int]$RootId) {
  $all = @(Get-CimInstance Win32_Process -ErrorAction Stop | Select-Object ProcessId, ParentProcessId, Name)
  $ids = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$ids.Add($RootId)
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($entry in $all) {
      $id = [int]$entry.ProcessId
      if ($ids.Contains([int]$entry.ParentProcessId) -and -not $ids.Contains($id)) {
        [void]$ids.Add($id)
        $changed = $true
      }
    }
  }
  return @($ids)
}

function Get-ProcessSample([int]$ElapsedSeconds, [int]$index) {
  $targets = @()
  $treeError = $null
  if ($ProcessId -gt 0) {
    try {
      $ids = @(Get-TreeIds $ProcessId)
      $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $ids -contains [int]$_.Id })
    } catch {
      $treeError = $_.Exception.Message
      $targets = @(Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)
    }
  } else {
    $targets = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Unbox*' })
  }
  $targets = @($targets)
  $cpu = ($targets | Measure-Object CPU -Sum).Sum
  $working = ($targets | Measure-Object WorkingSet64 -Sum).Sum
  $private = ($targets | Measure-Object PrivateMemorySize64 -Sum).Sum
  return [pscustomobject]@{
    sampleIndex = $index
    timestamp = (Get-Date).ToString('o')
    elapsedSeconds = $ElapsedSeconds
    requestedProcessId = $ProcessId
    found = ($targets.Count -gt 0)
    processCount = $targets.Count
    processIds = @($targets | ForEach-Object { [int]$_.Id })
    processNames = @($targets | ForEach-Object { $_.ProcessName })
    cpuSeconds = if ($cpu) { [double]$cpu } else { 0 }
    workingSetBytes = if ($working) { [double]$working } else { 0 }
    privateBytes = if ($private) { [double]$private } else { 0 }
    treeError = $treeError
  }
}

$startedAtIso = $startedAt.ToString('o')
$identity = [ordered]@{
  collectedAt = $startedAtIso
  computerName = $env:COMPUTERNAME
  userName = $env:USERNAME
  userProfile = $env:USERPROFILE
  powershellVersion = $PSVersionTable.PSVersion.ToString()
  outputDirectory = $OutputDir
}
try {
  $identity.operatingSystem = @(Get-CimInstance Win32_OperatingSystem | Select-Object Caption, Version, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime)
} catch { $errors.Add("identity: operating system query failed: $($_.Exception.Message)") }
try {
  $identity.computerSystem = @(Get-CimInstance Win32_ComputerSystem | Select-Object Manufacturer, Model, SystemType, TotalPhysicalMemory, NumberOfLogicalProcessors)
} catch { $errors.Add("identity: computer system query failed: $($_.Exception.Message)") }
try {
  $identity.processors = @(Get-CimInstance Win32_Processor | Select-Object Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed)
} catch { $errors.Add("identity: processor query failed: $($_.Exception.Message)") }
try {
  $identity.bios = @(Get-CimInstance Win32_BIOS | Select-Object Manufacturer, SMBIOSBIOSVersion, SerialNumber)
} catch { $errors.Add("identity: BIOS query failed: $($_.Exception.Message)") }
try {
  $identity.videoControllers = @(Get-CimInstance Win32_VideoController | Select-Object Name, DriverVersion, CurrentHorizontalResolution, CurrentVerticalResolution, Status)
} catch { $errors.Add("identity: video controller query failed: $($_.Exception.Message)") }
Write-JsonFile 'identity.json' $identity | Out-Null

$cleanState = [ordered]@{ collectedAt = $startedAtIso; commandPresence = @(); appDataPaths = @(); installedUnboxEntries = @(); runningUnboxProcesses = @() }
foreach ($name in @('node', 'npm', 'git', 'ffmpeg', 'python', 'py')) {
  $cleanState.commandPresence += Get-CommandPresence $name
}
$appDataPaths = @(
  (Join-Path $env:APPDATA 'unbox-studio'),
  (Join-Path $env:APPDATA 'the-unbox-app'),
  (Join-Path $env:LOCALAPPDATA 'UnboxStudiosStandalone'),
  (Join-Path $env:LOCALAPPDATA 'UnboxedStudio')
)
foreach ($path in $appDataPaths) {
  $exists = $false
  try { $exists = Test-Path -LiteralPath $path } catch { $errors.Add("clean-state: path check failed '$path': $($_.Exception.Message)") }
  $cleanState.appDataPaths += [pscustomobject]@{ path = $path; exists = $exists }
}
$cleanState.installedUnboxEntries = @(Get-InstalledUnboxEntries)
try {
  $cleanState.runningUnboxProcesses = @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -like 'Unbox*' } | Select-Object Id, ProcessName, StartTime, CPU, WorkingSet64)
} catch { $errors.Add("clean-state: running process query failed: $($_.Exception.Message)") }
Write-JsonFile 'clean-state.json' $cleanState | Out-Null

$devices = [ordered]@{ collectedAt = $startedAtIso; soundDevices = @(); audioEndpoints = @(); midiMediaDevices = @(); monitors = @() }
try {
  $devices.soundDevices = @(Get-CimInstance Win32_SoundDevice | Select-Object Name, Manufacturer, Status, DeviceID)
} catch { $errors.Add("devices: sound device query failed: $($_.Exception.Message)") }
try {
  $devices.audioEndpoints = @(Get-PnpDevice -Class AudioEndpoint -ErrorAction SilentlyContinue | Select-Object FriendlyName, Status, Class, InstanceId)
} catch { $errors.Add("devices: audio endpoint query failed: $($_.Exception.Message)") }
try {
  $devices.midiMediaDevices = @(Get-PnpDevice -ErrorAction SilentlyContinue | Where-Object { $_.Class -match 'MIDI|MEDIA' -or $_.FriendlyName -match 'MIDI' } | Select-Object FriendlyName, Status, Class, InstanceId)
} catch { $errors.Add("devices: MIDI/Media query failed: $($_.Exception.Message)") }
try {
  $devices.monitors = @(Get-CimInstance Win32_DesktopMonitor | Select-Object Name, ScreenWidth, ScreenHeight, MonitorManufacturer, MonitorType, Status)
} catch { $errors.Add("devices: monitor query failed: $($_.Exception.Message)") }
Write-JsonFile 'devices.json' $devices | Out-Null

$artifactRecords = @()
$artifactRecords += Get-ArtifactRecord $ArtifactPath 'current-artifact'
if (-not [string]::IsNullOrWhiteSpace($InstallerPath)) { $artifactRecords += Get-ArtifactRecord $InstallerPath 'installer' }
if (-not [string]::IsNullOrWhiteSpace($PreviousArtifactPath)) { $artifactRecords += Get-ArtifactRecord $PreviousArtifactPath 'previous-public-build' }
Write-JsonFile 'artifacts.json' @($artifactRecords) | Out-Null

$processSummary = $null
if ($ProcessSampleSeconds -gt 0) {
  $processPath = Join-Path $OutputDir 'process-samples.jsonl'
  [System.IO.File]::WriteAllText($processPath, '', $utf8)
  if ($ProcessSampleIntervalSeconds -lt 1) { $ProcessSampleIntervalSeconds = 1 }
  $start = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $index = 0
  $samples = New-Object System.Collections.Generic.List[object]
  while ($true) {
    $elapsed = [int]((([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) - $start) / 1000)
    if ($elapsed -gt $ProcessSampleSeconds) { break }
    $sample = Get-ProcessSample $elapsed $index
    $samples.Add($sample)
    [System.IO.File]::AppendAllText($processPath, (($sample | ConvertTo-Json -Compress -Depth 6) + "`n"), $utf8)
    $index += 1
    $next = $start + ($index * $ProcessSampleIntervalSeconds * 1000)
    $wait = $next - [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    if ($wait -gt 0) { Start-Sleep -Milliseconds $wait }
  }
  $valid = @($samples | Where-Object { $_.found })
  $processSummary = [ordered]@{
    sampleCount = $samples.Count
    foundSampleCount = $valid.Count
    first = if ($samples.Count) { $samples[0] } else { $null }
    last = if ($samples.Count) { $samples[$samples.Count - 1] } else { $null }
    peakWorkingSetBytes = if ($valid.Count) { ($valid | Measure-Object workingSetBytes -Maximum).Maximum } else { $null }
    peakPrivateBytes = if ($valid.Count) { ($valid | Measure-Object privateBytes -Maximum).Maximum } else { $null }
    samplesFile = 'process-samples.jsonl'
  }
  Write-JsonFile 'process-summary.json' $processSummary | Out-Null
}

$summary = [ordered]@{
  collectedAt = $startedAtIso
  completedAt = (Get-Date).ToString('o')
  outputDirectory = $OutputDir
  artifactCount = $artifactRecords.Count
  commandPresence = $cleanState.commandPresence
  appDataPaths = $cleanState.appDataPaths
  installedUnboxCount = $cleanState.installedUnboxEntries.Count
  runningUnboxCount = $cleanState.runningUnboxProcesses.Count
  processSampleSeconds = $ProcessSampleSeconds
  processSampleCount = if ($processSummary) { $processSummary.sampleCount } else { 0 }
  errors = $errors.ToArray()
}
Write-JsonFile 'summary.json' $summary | Out-Null

Write-Host "G4 evidence written to $OutputDir"
Write-Host "Artifacts: $($artifactRecords.Count); installed Unbox entries: $($cleanState.installedUnboxEntries.Count); running Unbox processes: $($cleanState.runningUnboxProcesses.Count)"
if ($errors.Count -gt 0) { Write-Host "Warnings/errors: $($errors.Count) (see summary.json)" }
if ($processSummary) { Write-Host "Process samples: $($processSummary.sampleCount) (found: $($processSummary.foundSampleCount))" }
