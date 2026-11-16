# G4 Clean-Machine Acceptance Evidence

**Template version:** 2026-11-14  
**Run ID:** `<run-id>`  
**Tester:** `<name>`  
**Date/time:** `<ISO-8601>`  
**Result:** `<PASS | FAIL | PARTIAL | BLOCKED | NOT RUN>`  
**Runbook:** [G4_CLEAN_MACHINE_RUNBOOK.md](G4_CLEAN_MACHINE_RUNBOOK.md)  
**Collector:** `scripts/g4-clean-evidence.ps1`

Do not fill this template from the development host. A fresh Chromium profile
does not make Windows clean. Record only tests actually run on the named target.

## 0. Artifact under test

| Field | Value |
| --- | --- |
| Artifact path | `release/g0/Unbox-Studio-1.0.0-rc.2.exe` |
| Size | `263,100,935` bytes |
| SHA-256 | `50258e5de1e90b7d3bb2a0d22053cb0f5425a94805d47f2e1df31804478c1627` |
| Source tag/commit | `v1.0.0-rc.2` / `deb04d7d36ad08e7876d1b6053771e6414db4cec` |
| Authenticode | `<NotSigned | status>` |
| Copy location on target | `<path>` |
| Hash command/result | `<command and output>` |
| Installer artifact (if any) | `<path, size, SHA-256>` |

For this portable artifact, install/upgrade/uninstall coverage is **blocked**
unless a separate installer and previous public build are supplied and tested.

## 1. Target identity and clean-state attestation

| Field | Value |
| --- | --- |
| Target type | `<VM | physical>` |
| Hypervisor / machine model | `<name>` |
| Windows edition | `<Windows 11 ...>` |
| Windows build | `<10.0.xxxxx>` |
| CPU / RAM | `<...>` |
| GPU / driver | `<...>` |
| System image / snapshot ID | `<...>` |
| Reset method (physical target) | `<...>` |
| Network state during test | `<offline | online; details>` |

Clean-state checks:

- [ ] Fresh Windows 11 installation from official media, or a documented
      factory reset.
- [ ] No Node.js, npm, Git, Python, compiler, package manager, or other
      development tooling.
- [ ] No prior Unbox Studio installation or Start-menu entry.
- [ ] `%APPDATA%\unbox-studio` absent.
- [ ] `%APPDATA%\the-unbox-app` absent.
- [ ] `%LOCALAPPDATA%\UnboxStudiosStandalone` absent.
- [ ] `%LOCALAPPDATA%\UnboxedStudio` absent.
- [ ] No previous project files in the test user's profile.
- [ ] Snapshot or restore point taken before the run.
- [ ] `where.exe node`, `where.exe npm`, `where.exe git`, and
      `where.exe ffmpeg` returned nothing.

Attach:

- `windows-version.txt`;
- `clean-state.txt`;
- screenshot of empty app-data paths;
- screenshot of Apps list before installation.

If any clean-state check fails, this target is **not** a clean-machine G4
target.

## 2. Hardware inventory

| Role | Device | Connection | Driver/version | Status |
| --- | --- | --- | --- | --- |
| Built-in audio output | `<device>` | internal | `<version>` | `<...>` |
| USB audio interface | `<device>` | USB | `<version>` | `<...>` |
| MIDI controller | `<model>` | USB/DIN | `<driver>` | `<...>` |
| Display 1 | `<resolution / scaling>` | `<...>` | `<...>` | `<...>` |
| Display 2 (if used) | `<resolution / scaling>` | `<...>` | `<...>` | `<...>` |

Physical devices must be visible to Windows and the app. Virtual audio and
virtual MIDI devices do not satisfy the G4 hardware rows.

## 3. Status definitions

| Status | Meaning |
| --- | --- |
| **PASS** | The check ran on this target and met its criteria. |
| **FAIL** | The check ran and did not meet its criteria. |
| **BLOCKED** | A required target, artifact, device, fixture, or previous build is missing. |
| **NOT RUN** | The check was not attempted; the reason is recorded. |

## 4. G4 result matrix

| Check | Result | Evidence / note |
| --- | --- | --- |
| Clean Windows 11 VM or physical machine | `<PASS/FAIL/BLOCKED>` | `<...>` |
| No development tools or prior app data | `<...>` | `<...>` |
| Built-in audio output | `<...>` | `<...>` |
| Class-compliant USB audio interface | `<...>` | `<...>` |
| 44.1 kHz, 128/256-sample buffer | `<...>` | `<...>` |
| 48 kHz, 128/256-sample buffer | `<...>` | `<...>` |
| Physical MIDI: notes, velocity | `<...>` | `<...>` |
| Physical MIDI: sustain and pitch bend | `<...>` | `<...>` |
| Physical MIDI: reconnect | `<...>` | `<...>` |
| Standard display scaling | `<...>` | `<...>` |
| High-DPI display scaling | `<...>` | `<...>` |
| Create, save, close, relaunch, reopen full project | `<...>` | `<...>` |
| Export WAV; verify duration/levels | `<...>` | `<...>` |
| Export FLAC; verify duration/levels | `<...>` | `<...>` |
| Export compressed; verify duration/levels | `<...>` | `<...>` |
| Ten-minute loaded session; CPU/memory/latency/UI | `<...>` | `<...>` |
| No unbounded memory growth | `<...>` | `<...>` |
| Force-stop during recording; recovery preserves project | `<...>` | `<...>` |
| Failed save / disk-full / permission-denied | `<...>` | `<...>` |
| Install | `<...>` | `<...>` |
| Upgrade | `<...>` | `<...>` |
| Uninstall | `<...>` | `<...>` |
| Project migration from previous public build | `<...>` | `<...>` |

## 5. Install / launch evidence

### 5.1 Portable launch

| Field | Value |
| --- | --- |
| Launch path | `<...>` |
| Security prompt | `<none / SmartScreen / other>` |
| App version shown | `<...>` |
| App-data paths created | `<...>` |
| Start-menu / uninstall entries | `<...>` |
| First-load result | `<PASS/FAIL>` |

Portable launch result:

`<notes and evidence path>`

### 5.2 Installer package (only if supplied)

| Field | Value |
| --- | --- |
| Installer path / hash | `<...>` |
| Install scope | `<user/system>` |
| Install path | `<...>` |
| Start-menu entry | `<...>` |
| Uninstall entry | `<...>` |
| Installed launch result | `<...>` |

If no installer was supplied, write **BLOCKED — no installer artifact** here.

## 6. Audio evidence

### 6.1 Audio output

| Device | Sample rate | Engine latency | Output latency | Audible result | Notes |
| --- | ---: | ---: | ---: | --- | --- |
| Built-in | `<Hz>` | `<ms>` | `<ms>` | `<pass/fail>` | `<...>` |
| USB interface | `<Hz>` | `<ms>` | `<ms>` | `<pass/fail>` | `<...>` |

Buffer-size check:

- [ ] Build exposes a buffer-size control.
- [ ] 128-sample buffer tested.
- [ ] 256-sample buffer tested.
- [ ] No buffer-size control exists; the fixed latency is recorded and the
      buffer rows are **NOT RUN**.

If there is no buffer control, do not infer 128 or 256 samples from the
reported latency.

### 6.2 44.1 / 48 kHz

| Rate | Windows device format | App sample rate | Audio present | Dropouts | Evidence |
| ---: | --- | ---: | --- | --- | --- |
| 44.1 kHz | `<...>` | `<Hz>` | `<yes/no>` | `<none/count>` | `<...>` |
| 48 kHz | `<...>` | `<Hz>` | `<yes/no>` | `<none/count>` | `<...>` |

### 6.3 Audio interface reconnect

| Step | Result | Evidence |
| --- | --- | --- |
| Disconnect interface | `<...>` | `<...>` |
| Reconnect interface | `<...>` | `<...>` |
| Output recovers without restart | `<yes/no>` | `<...>` |

## 7. MIDI evidence

| Check | Controller/port | Observed | Result |
| --- | --- | --- | --- |
| Port appears after Connect MIDI | `<...>` | `<...>` | `<...>` |
| Note on/off | `<...>` | `<...>` | `<...>` |
| Velocity | `<...>` | `<...>` | `<...>` |
| Pitch bend | `<...>` | `<...>` | `<...>` |
| Mod wheel | `<...>` | `<...>` | `<...>` |
| Sustain CC64 | `<...>` | `<...>` | `<...>` |
| MIDI recording into an armed track | `<...>` | `<...>` | `<...>` |
| Disconnect / reconnect | `<...>` | `<...>` | `<...>` |

Attach the app MIDI Activity log excerpt and a screenshot of the connected port.

## 8. Display evidence

| Mode | Resolution | Scaling | Areas inspected | Clipped/overlapping text | Evidence |
| --- | --- | ---: | --- | --- | --- |
| Standard | `<...>` | 100% | Workstation, rack, mixer, pages | `<none/list>` | `<...>` |
| High-DPI | `<...>` | `<...>` | Workstation, rack, mixer, pages | `<none/list>` | `<...>` |

Capture full-window screenshots at each mode. Do not claim high-DPI success
without a high-DPI screenshot or recording.

## 9. Project lifecycle evidence

### 9.1 Fixture composition

| Item | Value |
| --- | --- |
| Project name | `<...>` |
| Template | `<Starter groove / Empty / ...>` |
| BPM / key | `<...>` |
| Instrument tracks | `<count and names>` |
| Recorded instrument | `<pack/name>` |
| Audio tracks / recorded takes | `<count, bars, source>` |
| Mixer changes | `<fader/pan/send/insert details>` |
| Rack / cable changes | `<...>` |
| Automation lanes | `<target and points>` |
| Project JSON / archive size | `<...>` |

A starter-groove-only fixture does not satisfy the “full project” row.

### 9.2 Save, close, relaunch, reopen

| Step | Observed | Result |
| --- | --- | --- |
| Save | `<saved state / error>` | `<...>` |
| Close app | `<...>` | `<...>` |
| Relaunch | `<...>` | `<...>` |
| Reopen project | `<...>` | `<...>` |
| Instruments preserved | `<...>` | `<...>` |
| Audio clips / takes preserved | `<...>` | `<...>` |
| Mixer state preserved | `<...>` | `<...>` |
| Rack / cables preserved | `<...>` | `<...>` |
| Automation preserved | `<...>` | `<...>` |
| Notes / metadata preserved | `<...>` | `<...>` |
| Missing-media warning | `<none/list>` | `<...>` |

Attach before/after screenshots or a screen recording and the project summary.

## 10. Export evidence

| Format | File | Size | Duration | Peak/LUFS | Non-silent | Tool |
| --- | --- | ---: | ---: | --- | --- | --- |
| WAV | `<name>` | `<bytes>` | `<s>` | `<...>` | `<yes/no>` | `<ffprobe/volumedetect/player>` |
| FLAC | `<name>` | `<bytes>` | `<s>` | `<...>` | `<yes/no>` | `<...>` |
| MP3/other | `<name>` | `<bytes>` | `<s>` | `<...>` | `<yes/no>` | `<...>` |

Record the app's own result and the independent verification method. If no
independent measurement was available, mark the duration/level portion
**NOT RUN** and explain why.

## 11. Ten-minute soak evidence

| Time | Playing/looping | CPU | Working set | Private bytes | JS/process memory | UI action | Stall/freeze |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| 0:00 | `<yes/no>` | `<% or s>` | `<MB>` | `<MB>` | `<MB>` | `<...>` | `<none/ms>` |
| 5:00 | `<yes/no>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |
| 10:00 | `<yes/no>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` | `<...>` |

Collector method:

`<Task Manager / Performance Monitor / separate PowerShell collector / other>`

- [ ] Health probes and process metric collection were kept separate.
- [ ] Playback stayed active for the full run.
- [ ] No app crash occurred.
- [ ] Memory plateaued; no monotonic growth.
- [ ] UI actions were exercised every 15 seconds.
- [ ] App log and Windows Event Viewer were checked.

Attach the raw measurements and screen recording. Do not call a run stable if
playback stopped or the app needed a restart.

## 12. Force-stop / recording recovery evidence

| Step | Observed | Evidence |
| --- | --- | --- |
| Armed audio track and recording started | `<...>` | `<...>` |
| Take or recovery state existed | `<...>` | `<...>` |
| Exact process tree force-stopped | `<...>` | `<...>` |
| Relaunch result | `<...>` | `<...>` |
| Recovery banner appeared | `<yes/no>` | `<...>` |
| Restore result | `<...>` | `<...>` |
| Previous project preserved | `<yes/no>` | `<...>` |
| Take preserved | `<yes/no>` | `<...>` |

No recording interface means **BLOCKED**, not a project-only pass.

## 13. Failed-save / disk-full evidence

| Field | Value |
| --- | --- |
| Fault method | `<disk fill | quota | permission | not attempted>` |
| Snapshot/restore point | `<...>` |
| Save attempt | `<...>` |
| Error shown | `<...>` |
| Existing saved project intact | `<yes/no>` |
| Recovery action | `<...>` |
| Final state | `<...>` |

Only perform this on a disposable VM snapshot. If no safe fault-injection
method exists, record **NOT RUN**.

## 14. Install / upgrade / uninstall evidence

### 14.1 Install

| Field | Value |
| --- | --- |
| Installer path / hash | `<...>` |
| Install type | `<portable | installer>` |
| Install result | `<...>` |
| Installed launch result | `<...>` |
| Install log | `<path>` |

For the current portable artifact, mark **BLOCKED — no installer artifact**
unless a separate installer is supplied.

### 14.2 Upgrade

| Field | Value |
| --- | --- |
| Previous public build / hash | `<...>` |
| Previous project | `<...>` |
| Upgrade path | `<...>` |
| Reopened project result | `<...>` |
| Migration errors | `<...>` |

No previous public build means **BLOCKED**.

### 14.3 Uninstall

| Field | Value |
| --- | --- |
| Uninstall method | `<...>` |
| App files removed | `<yes/no>` |
| Start-menu entry removed | `<yes/no>` |
| Uninstall entry removed | `<yes/no>` |
| User projects preserved | `<yes/no/unknown>` |
| Uninstall result | `<...>` |

Manual deletion of a portable folder is **NOT APPLICABLE** as an uninstall test.

## 15. Migration evidence

| Field | Value |
| --- | --- |
| Previous build / hash | `<...>` |
| Previous project / archive | `<...>` |
| Devices preserved | `<...>` |
| Parameters preserved | `<...>` |
| Cables / rack preserved | `<...>` |
| Mixer / automation preserved | `<...>` |
| Audio / notes preserved | `<...>` |
| Differences found | `<...>` |
| Result | `<...>` |

No previous public build or project means **BLOCKED**.

## 16. Attachments and hashes

| Attachment | Path | SHA-256 / size |
| --- | --- | --- |
| Artifact | `<...>` | `<...>` |
| Collector identity | `<collector/identity.json>` | `<...>` |
| Collector clean state | `<collector/clean-state.json>` | `<...>` |
| Collector devices | `<collector/devices.json>` | `<...>` |
| Collector artifacts | `<collector/artifacts.json>` | `<...>` |
| Collector summary | `<collector/summary.json>` | `<...>` |
| Soak process samples | `<collector-soak/process-samples.jsonl>` | `<...>` |
| Soak process summary | `<collector-soak/process-summary.json>` | `<...>` |
| WAV export | `<...>` | `<...>` |
| FLAC export | `<...>` | `<...>` |
| Compressed export | `<...>` | `<...>` |
| Soak measurements | `<...>` | `<...>` |
| Screen recording | `<...>` | `<...>` |
| Screenshots | `<...>` | `<...>` |
| Application log | `<...>` | `<...>` |
| Windows Event Viewer excerpt | `<...>` | `<...>` |

## 17. Limitations and sign-off

**Limitations / rows not run:**

`<...>`

**Tester attestation:** I confirm that the statuses above reflect tests actually
performed on the named target and artifact. I did not mark blocked or unrun
checks as passed.

**Signature / name:** `<...>`  
**Date/time:** `<ISO-8601>`

G4 may be marked **PASS** only when every applicable row has a real **PASS**.
Otherwise record **PARTIAL** or **BLOCKED** and list the missing evidence.
