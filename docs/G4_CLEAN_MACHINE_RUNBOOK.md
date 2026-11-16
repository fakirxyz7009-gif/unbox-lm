# G4 Clean-Machine Acceptance Runbook

**Prepared:** 2026-11-14  
**Applies to:** `release/g0/Unbox-Studio-1.0.0-rc.2.exe`  
**Artifact SHA-256:** `50258e5de1e90b7d3bb2a0d22053cb0f5425a94805d47f2e1df31804478c1627`  
**Artifact size:** `263,100,935` bytes  
**Source:** `v1.0.0-rc.2`, commit `deb04d7d36ad08e7876d1b6053771e6414db4cec`

This runbook is prepared for a clean Windows 11 target. It has **not** been
executed on a clean machine. The current development host is not a valid G4
target because it has Node.js, development tools, and existing Unbox Studio
application data.

**Use the companion evidence template:**
[G4_CLEAN_MACHINE_EVIDENCE_TEMPLATE.md](G4_CLEAN_MACHINE_EVIDENCE_TEMPLATE.md).

## 1. Purpose and scope

The run covers the clean-machine portions of G4:

- clean Windows 11 environment with no development tooling or prior app data;
- built-in audio output and a class-compliant USB audio interface;
- physical MIDI controller input;
- standard and high-DPI display scaling;
- complete project creation, save, close, relaunch, and reopen;
- WAV, FLAC, and compressed export with duration and level verification;
- a ten-minute loaded session with CPU, memory, latency, and UI checks;
- no unbounded memory growth;
- force-stop during recording and recovery;
- failed-save / disk-full behavior;
- install, upgrade, and uninstall;
- migration from the previous public build.

The recorded artifact is a **portable, unsigned EXE**. Portable launch is not
installer coverage. Do not mark install, upgrade, uninstall, or migration as
passed unless the corresponding artifacts and previous public build actually
exist and were exercised.

## 2. Required target

Use one of:

- a clean Windows 11 virtual machine built from official Windows 11 media, with
  a pre-test snapshot; or
- a physically reset Windows 11 machine with no prior Unbox Studio state.

The target must have:

- no Node.js, npm, Git, Python, compiler, package manager, or other development
  tools;
- no prior `Unbox Studio` application data;
- a working display at 100% scaling and at least one high-DPI scaling level;
- built-in audio output;
- a class-compliant USB audio interface, connected directly;
- a physical MIDI controller with keys, velocity, pitch bend, and sustain pedal;
- enough free disk space for the app and a ten-minute session;
- no dependency on the local development machine or `D:\vsr`.

## 3. Before starting

Create an evidence folder outside the application folder, for example:

```text
G4-clean-run/
  artifact/
  logs/
  screenshots/
  exports/
  measurements/
```

Copy the exact artifact into `G4-clean-run/artifact/`, keeping its filename. If
the repository will not be present on the target, also copy
`scripts/g4-clean-evidence.ps1` into the evidence folder.

### 3.1 Read-only evidence collector

The repository includes `scripts/g4-clean-evidence.ps1`. It collects machine
identity, clean-state indicators, device inventory, artifact hashes, and
optional process-tree measurements. It does not install, launch, or stop the
app, and it does not change system settings.

Run it before first launch and write into the evidence folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\g4-clean-evidence.ps1 `
  -ArtifactPath G4-clean-run\artifact\Unbox-Studio-1.0.0-rc.2.exe `
  -OutputDir G4-clean-run\collector
```

If an installer or previous public build was supplied, add these parameters to
the same command:

- `-InstallerPath path\to\installer.exe`
- `-PreviousArtifactPath path\to\previous-build.exe`

Outputs are `identity.json`, `clean-state.json`, `devices.json`,
`artifacts.json`, and `summary.json`. A nonzero `errors` array means part of the
inventory was unavailable; record that limitation rather than elevating or
editing the result. The collector does not replace the manual screenshots,
SmartScreen check, display-scaling checks, or acceptance decisions.

During the soak, collect the running app process tree separately from health
probes:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\g4-clean-evidence.ps1 `
  -OutputDir G4-clean-run\collector-soak `
  -ProcessId <root-pid> `
  -ProcessSampleSeconds 600 `
  -ProcessSampleIntervalSeconds 15
```

That run writes `process-samples.jsonl` and `process-summary.json`. Do not run
this collector synchronously inside the app-health probe loop.

When the collector is run from the repository root, relative paths are resolved
against the repository. If the repository is not on the target, use absolute
`-ArtifactPath` and `-OutputDir` paths and run the copied script.

Verify the copied artifact before launch:

```powershell
Get-FileHash .\G4-clean-run\artifact\Unbox-Studio-1.0.0-rc.2.exe -Algorithm SHA256
(Get-Item .\G4-clean-run\artifact\Unbox-Studio-1.0.0-rc.2.exe).Length
Get-AuthenticodeSignature .\G4-clean-run\artifact\Unbox-Studio-1.0.0-rc.2.exe
```

Record:

- hash and size;
- signature status (`NotSigned` is expected for this artifact);
- the source path used to copy it;
- the target path;
- whether Windows SmartScreen or another security prompt appeared.

If the hash or size does not match, **stop**. Do not run the test.

## 4. Clean-state attestation

Run these checks before launching the app. Save the transcript and a screenshot
of the empty paths.

```powershell
Get-ComputerInfo |
  Select-Object WindowsProductName,WindowsVersion,OsBuildNumber,
                CsManufacturer,CsModel,CsTotalPhysicalMemory
where.exe node
where.exe npm
where.exe git
where.exe ffmpeg
```

Expected for a clean target: `where.exe` returns nothing for Node.js, npm, Git,
and ffmpeg. PowerShell itself is part of Windows and may be used for evidence.

Check the known application-data locations:

```powershell
Test-Path "$env:APPDATA\unbox-studio"
Test-Path "$env:APPDATA\the-unbox-app"
Test-Path "$env:LOCALAPPDATA\UnboxStudiosStandalone"
Test-Path "$env:LOCALAPPDATA\UnboxedStudio"
```

All four should be `False` before first launch. Also check that there is no
existing Unbox Studio entry in **Settings → Apps** and no previous project
files in the target user profile.

If the machine is a physical machine, record how it was reset and whether a
system restore point or image was taken. If it is a VM, record the image name
and snapshot identifier.

## 5. Install / portable launch

### 5.1 Current portable artifact

1. Launch the copied EXE from the evidence folder.
2. Record any SmartScreen prompt and how it was handled.
3. Wait for the app shell to load.
4. Confirm the title bar and the three workspace tabs are present.
5. Record the application version and the app-data paths created.
6. Do **not** describe this as an installation.

For this portable artifact, record the install, upgrade, and uninstall rows as
**BLOCKED / NOT APPLICABLE** unless a real installer package is separately
supplied and tested. Deleting a portable folder is not an uninstall test.

### 5.2 Installer package (only if one is supplied)

Do this only with an installer artifact whose path, size, and SHA-256 are
recorded separately from the portable EXE.

1. Verify the installer hash and signature status.
2. Install using the supported user/system scope.
3. Record the install path, Start-menu entry, uninstall entry, and app-data
   path.
4. Launch from the installed shortcut, not from the build folder.
5. Close the app, relaunch it, and confirm it starts from the installed copy.
6. Do not continue to upgrade until a project created with the installed copy
   has been saved and reopened successfully.

## 6. Audio output and buffer checks

### 6.1 Built-in output

1. Open **Settings** from the main menu.
2. In **Audio output**, select the system default or the built-in output.
3. Confirm **State** is running and record **Sample rate**,
   **Engine latency**, and **Output latency**.
4. Play a project and listen through the built-in output.
5. Record whether audio is present, silent, distorted, or intermittent.

### 6.2 USB interface

1. Connect the class-compliant USB interface directly.
2. Select it under **Output device**.
3. Record the device name and driver version from Windows Device Manager.
4. Repeat the sample-rate, latency, and listening checks.
5. Disconnect and reconnect the interface; record whether the app recovers
   output without a restart.

### 6.3 44.1 kHz and 48 kHz

For each rate supported by the interface:

1. Set the Windows device format to 44.1 kHz and then 48 kHz.
2. Relaunch the app after each change.
3. Record the app's reported **Sample rate** and latency values.
4. Verify audible output at each rate.

The current Settings page exposes sample rate and latency but does not expose a
buffer-size selector in the inspected source. If the build has no buffer-size
control, record the fixed engine/output latency and mark the 128/256-sample
buffer rows **NOT RUN**. Do not infer a buffer size from latency.

## 7. Physical MIDI

1. Connect the controller directly.
2. Open **Settings → MIDI**.
3. Press **Connect MIDI**; if already connected, use **Rescan MIDI**.
4. Confirm the controller appears as a port and the Activity log receives
   messages.
5. On the Workstation keyboard, verify note on/off, velocity, pitch bend, mod
   wheel, and sustain (CC64).
6. Arm an instrument track, press Record, play a short phrase, stop, and verify
   the notes appear in the editor.
7. Disconnect the controller, reconnect it, and confirm notes work again
   without an app restart.
8. Record the controller model, connection type, port name, and any messages in
   the app Activity log.

A virtual MIDI port, loopback port, or simulated controller does not satisfy
this row.

## 8. Display scaling

Test at minimum:

- 1920×1080 at 100%;
- one high-DPI mode, such as 2560×1440 at 150% or 3840×2160 at 200%.

For each mode, inspect:

- Workstation and transport;
- Rack, including the rear panel and cable labels;
- Mixer and Clip Editor;
- Projects, Settings, and Export pages.

Record the display resolution, scaling percentage, and any clipped, overlapping,
or unreadable text. Capture full-window screenshots for each mode. Do not infer
high-DPI success from a screenshot at 100%.

## 9. Full project lifecycle

Use the bundled app library. Do not require `D:\vsr` or a developer sample tree.

1. Open **Projects**.
2. Create a project named `G4 Clean Project` from **Starter groove** or
   **Empty**.
3. Add at least two instrument tracks, including one bundled recorded
   instrument from **Devices → Recorded audio only**.
4. Add an audio track and record at least two bars through the USB interface.
   If recording hardware is unavailable, this row is **BLOCKED**, not passed.
5. On the Mixer, change at least one fader, pan, send, and insert effect.
6. Add at least one rack cable/effect or Combiner routing.
7. Create or record at least one automation lane.
8. Save with **Save** or `Ctrl+S`; wait for the saved state.
9. Record the project name, track count, audio clip count, BPM, and a summary
   of the mixer/rack/automation state.
10. Close the app completely.
11. Relaunch and open the project from **Projects**.
12. Verify every category above survived. Record any missing audio, device,
    cable, parameter, note, or automation data.

A starter groove alone is not a complete project-lifecycle check. The result
must state exactly what the fixture contained.

## 10. Export checks

1. Open **Export** (`Ctrl+Shift+E`).
2. Select **Master mix** and **Whole song** (or a documented loop range).
3. Export WAV, FLAC, and MP3 through **Export WAV (PCM / float)**,
   **Export FLAC (lossless)**, and **Export MP3**.
4. Save the downloads in the evidence folder.
5. Record file names, sizes, durations, and the app's reported loudness/peak
   values.
6. Verify duration and levels independently. Prefer `ffprobe` and
   `volumedetect` on a separate analysis workstation. If that is unavailable,
   use a trusted audio editor or player and record the method; do not claim
   sample-accurate level verification without a measurement.
7. Confirm the files are non-empty and audibly non-silent.

## 11. Ten-minute loaded-session soak

Use a saved project with the full fixture from section 9.

1. Enable loop and start transport playback.
2. Keep the app loaded and playing for at least ten minutes.
3. Record CPU, working set, private bytes, and JS/process memory at the start,
   middle, and end. Use Task Manager or a separate PowerShell collector.
4. Do not run a synchronous process-tree query inside the same loop that probes
   app health; keep health probes and metric collection separate.
5. Every 15 seconds, exercise a lightweight UI action: switch a tab, page, or
   selection, then return. Record any stall, freeze, or missed input.
6. Capture a screen recording if possible.
7. Confirm playback remains active for the whole run and the app does not
   crash.
8. Record whether memory grows monotonically or reaches a stable plateau.
9. Check the application log and Windows Event Viewer for crashes or errors.

Use the evidence template's soak table. A single 10-minute run is evidence for
that host and build only; it is not a clean-machine guarantee by itself.

## 12. Force-stop during recording and recovery

Perform this only after saving the full fixture and taking a VM snapshot.

1. Arm an audio track and start recording through the USB interface.
2. Record long enough to produce a visible take or recovery state.
3. Force-stop the exact app process tree with Task Manager or the VM's process
   controls. Do not shut down the whole machine unless that is the documented
   crash method.
4. Relaunch the app.
5. Record whether a **Restore** recovery banner appears.
6. Restore the recovery and verify the project and take.
7. Verify the previous saved project was not overwritten.
8. If no recording input is available, mark this row **BLOCKED**; do not
   substitute a project-only crash test for the recording requirement.

## 13. Failed save and disk-full / permission-denied paths

Use only a disposable VM snapshot. Never perform this on a production machine
or an unsaved user project.

1. Reduce free space on the volume that holds the app data until a save can
   fail, or use a test account with a storage quota.
2. Attempt to save a project and, if supported, export a file.
3. Record the exact error shown and whether the existing saved project remains
   intact.
4. Reboot or restore the snapshot immediately after the observation.
5. If no safe fault-injection method is available, mark the row **NOT RUN**.
   Do not claim a pass from a successful save.

## 14. Upgrade

This requires a previous public build and a real installer or documented
upgrade path. The current recorded artifact is portable.

1. Record the previous build's version, path, size, and SHA-256.
2. Install or launch the previous build on the clean target.
3. Create and save a project with representative devices, audio, mixer, rack,
   and automation state.
4. Install the new build or replace the portable build according to its
   documented upgrade path.
5. Reopen the project and verify all content and settings.
6. Record any migration errors, missing media, or changed parameters.
7. If no previous public build is supplied, mark this row **BLOCKED**. Do not
   use the development host's current working tree as the previous public
   build.

## 15. Uninstall

Only meaningful when a real installer was used.

1. Uninstall through Windows **Settings → Apps** or the documented uninstaller.
2. Record whether the app files, Start-menu entry, uninstall entry, and
   application data were removed.
3. Record whether user projects were preserved or deleted.
4. Reinstall or restore the snapshot if the test must continue.

For the portable artifact, record **NOT APPLICABLE / BLOCKED**. Do not call
manual folder deletion an uninstall test.

## 16. Migration from the previous public build

This requires both the previous public build and a project created with it.

1. Record the previous build's identity and the project archive/path.
2. Open the project in the previous build and capture its device, parameter,
   cable, mixer, automation, and audio state.
3. Open the same project in the recorded new build.
4. Verify each category and record any differences or missing media.
5. If the previous public build is unavailable, mark **BLOCKED**. Do not
   substitute a project made by the new build.

## 17. Stop conditions and truth rules

Stop and correct the setup if:

- the artifact hash or size is wrong;
- the target has Node.js, development tooling, or prior Unbox Studio data;
- the target uses virtual audio or virtual MIDI as the only interfaces;
- the requested hardware is not physically connected;
- the previous build or installer needed for a row is absent.

Use these statuses exactly:

- **PASS** — the stated check ran and met its criteria.
- **FAIL** — the check ran and did not meet its criteria.
- **BLOCKED** — a required target, device, artifact, or fixture is missing.
- **NOT RUN** — the check was not attempted for a documented reason.

Do not convert a blocked hardware test, a portable launch, or a starter-groove
smoke into a clean-machine pass. Record the exact artifact, host, fixture, and
evidence for every result.

## 18. Evidence checklist

- artifact hash and size transcript;
- signature status;
- Windows version/build and VM/physical identity;
- collector `identity.json`, `clean-state.json`, `devices.json`,
  `artifacts.json`, and `summary.json`;
- clean-state command output and empty app-data screenshots;
- device inventory with driver versions;
- display screenshots at each scaling level;
- project save/reopen screenshots or recording;
- mixer/rack/automation state before and after reopen;
- exported WAV/FLAC/MP3 files, sizes, durations, and level measurements;
- ten-minute soak measurements and recording;
- collector `process-samples.jsonl` and `process-summary.json` for the soak;
- crash/restore timeline and screenshots;
- failed-save error capture and recovery snapshot result;
- install/upgrade/uninstall logs (only if a real installer exists);
- migration comparison (only if a previous public build exists);
- completed evidence template with limitations and sign-off.

## 19. Completion criteria

G4 clean-machine acceptance may be marked **PASS** only when every required row
that applies to the supplied artifacts has a real **PASS** and the evidence
template is complete. Otherwise use **PARTIAL** or **BLOCKED** and state which
rows remain unverified.

The current release cannot claim clean-machine G4 from this runbook alone. It
requires a clean Windows 11 target, physical audio/MIDI hardware, and any
installer/previous-build artifacts needed for the install, upgrade, uninstall,
and migration rows.
