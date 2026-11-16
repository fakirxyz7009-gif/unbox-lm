# G0/G4 Acceptance Run

**Run dates:** 2026-11-12 (initial software-only checks); 2026-11-14 (ten-minute soak and separated-collector rerun)  
**Artifact under test:** `release/g0/Unbox-Studio-1.0.0-rc.2.exe`  
**Artifact SHA-256:** `50258e5de1e90b7d3bb2a0d22053cb0f5425a94805d47f2e1df31804478c1627`  
**Artifact size:** `263,100,935` bytes  
**Source:** `v1.0.0-rc.2`, commit `deb04d7d36ad08e7876d1b6053771e6414db4cec`

## Result

**Clean-machine G4: BLOCKED — no clean Windows target is available.**  
**G0 artifact identity: recorded; G0 is not a pass.**  
**Current-host isolated portable launch: PASS.**  
**Software-only subset: PARTIAL — see [Software-only subset](#software-only-subset-current-host-exact-artifact). This is not a clean-machine result.**

The current host is not a clean-machine test target. It is the development
machine: Node.js and the project toolchain are installed, and existing Unbox
Studio application data is present. A fresh Chromium profile does not make the
operating system clean.

## Environment audit

- OS: Windows 11 Home, `10.0.26200` (`EditionID=Core`).
- Windows Sandbox: `WindowsSandbox.exe` is absent.
- Hyper-V/VM tooling: no `Get-VM` command, no VM management tooling, and no
  created VM was available. `vmcompute` is running, but that is not a clean
  Windows guest.
- Node.js: `v24.21.0`; npm: `12.2.0`.
- Existing app data found:
  - `%APPDATA%\unbox-studio`
  - `%APPDATA%\the-unbox-app`
  - `%LOCALAPPDATA%\UnboxStudiosStandalone`
  - `%LOCALAPPDATA%\UnboxedStudio`
- Audio devices: Realtek High Definition Audio, NVIDIA High Definition Audio,
  NVIDIA Virtual Audio, Steam Streaming Speakers, Nahimic mirroring. No
  externally connected clean-test USB audio interface was identified.
- MIDI: MIDI 2.0 Virtual Devices and MIDI 2.0 Loop Devices only. No physical
  Novation/class-compliant controller was present.

## Current-host isolated portable smoke

The exact recorded EXE was launched by:

```bash
node scripts/test-electron-desktop-smoke.cjs release/g0/Unbox-Studio-1.0.0-rc.2.exe
```

The harness used a fresh disposable `--user-data-dir`, kept the window hidden,
and used the packaged app's normal production sandbox (no `--no-sandbox`).

**PASS:**

`PASS: portable Electron app loaded http://127.0.0.1:47821/ in a hidden isolated window and served index.html and /api/vst/status from its self-extracted child.`

The fixed loopback listener was closed afterward. Evidence:

- `release/g0/logs/03-current-host-portable-smoke.log`

This proves the portable wrapper extracted, started its bundled API and served
the app. **It is not a clean-machine test and does not satisfy G4.**

## Software-only subset (current host, exact artifact)

The recorded EXE was self-extracted with 7-Zip into
`.tmp/g4-artifact/win-unpacked/`; no application source was rebuilt. 7-Zip
reported 75 files and `901,441,250` uncompressed bytes. The extracted main
executable is `Unbox Studio.exe` (`249,797,632` bytes, SHA-256
`5147e6f4783c25c8ec09ebd6b9df36aea3c5e1ac6d8987c3e28b799aa5f12f96`); its
`resources/app.asar` is `515,652,016` bytes (SHA-256
`7a364ecf8083907144d90aa4098bcba3dd631b2f504f72832924578bb71c8256`).

| Software check | Result | Evidence |
| --- | --- | --- |
| Packaged renderer shell and bundled API | **PASS** — hidden isolated Electron window, normal production sandbox | `05-artifact-renderer-smoke.log` |
| IndexedDB write then read | **PASS** — sentinel written by one launch and read by the next | `06-indexeddb-write.log`, `07-indexeddb-read.log` |
| Create, save, reload, reopen a project | **PASS for the starter fixture** — 7 MIDI tracks, mixer/rack state, 128 BPM, 17,472-byte project JSON; title and `lastProjectId` survived reload | `12-artifact-project-export.log` |
| WAV, FLAC, and compressed export | **PASS** — three non-empty downloads, measurable audio, no console errors | `12-artifact-project-export.log`, `release/g0/software/` |
| Graceful project recovery (write/restore/verify) | **PASS** — recovery banner restored the staged 139 BPM edit; reopened without the banner | `14-project-recovery-write.log` through `16-project-recovery-verify.log` |
| Abrupt crash recovery | **NOT RUN — setup failed** — Tempo input did not reach 139 within 10 s, so the recovery target was not staged | `17-project-crash-write.log` through `19-project-crash-verify.log` |
| Ten-minute loaded session; CPU/memory/latency/UI | **PASS — current-host software, separated-collector rerun** — 600.0 s, 41/41 playing/looping, 0/41 health failures; the first run's two probe timeouts did not reproduce; see [Separated-collector rerun](#separated-collector-rerun) | `release/g0/logs/24-soak2-10min.log`, `release/g0/soak2/soak2.json` |
| No unbounded memory growth | **PASS — current-host software, both soaks** — no monotonic growth; rerun app working set 729.4–784.9 MB and JS heap 22.1–38.6 MB | `release/g0/logs/24-soak2-10min.log`, `release/g0/soak2/soak2.json` |
| Failed save and disk-full/permission-denied paths | **NOT RUN** | — |
| Project migration from a previous public build | **NOT RUN** — no previous public artifact was available for a migration test | — |

The project and export checks used a disposable headless Chrome profile against
the extracted app's loopback server. The graceful-recovery check used the
existing packaged Electron smoke after seeding its disposable profile with a
saved starter project; the copied harness disabled only the initial profile
wipe so `--project-recovery-write` had a project to stage. Application code was
not changed. The stock harness initially failed because it clears that profile
and then expects a saved project, so this is a fixture adjustment rather than
an application change.

The exported files were independently checked with `ffprobe` and
`ffmpeg`'s `volumedetect`:

| Format | Duration | Size | Mean / max volume |
| --- | ---: | ---: | --- |
| WAV (24-bit PCM, 48 kHz stereo) | 9.500 s | 2,736,110 bytes | −25.2 / −10.3 dB |
| FLAC (24-bit, 48 kHz stereo) | 9.500 s | 1,905,322 bytes | −25.2 / −10.3 dB |
| MP3 (320 kb/s, 48 kHz stereo) | 9.528 s | 381,186 bytes | −25.3 / −10.3 dB |

The project was a starter groove, not a recording containing an audio clip,
automation, or a captured instrument take. The export was written by the app's
own export page. The only renderer output warning was the expected
`Sample cache disabled at D:\samples: manifest is not declared as a recorded
source.` message; the export run reported `ERRORS=[]`.

### Ten-minute loaded-session soak

The soak re-extracted the recorded EXE into `.tmp/g4-soak/win-unpacked/`; its
executable and `app.asar` hashes matched the values above. The exact extracted
executable was launched with a fresh profile and the packaged UI was driven in a
disposable headless Chrome client. A starter groove was created, its loop was
enabled, and transport playback ran for 607.2 seconds.
The temporary harness sampled every 15 seconds; the packaged app, not a source
server or a rebuilt bundle, served the UI. The raw result is
`release/g0/soak/soak.json` and the log is `release/g0/logs/22-soak-10min.log`.

**Result:** the session completed 41/41 samples with transport playing and loop
active. The final app HTTP response was 200. There were no page errors, no
console errors, no 4xx/5xx app-origin responses, and no app exit. The packaged
app log contains only its normal sample-cache notice.

**CPU** (summed process-tree CPU seconds; percentage is CPU-time delta divided
by elapsed wall time):

- Packaged Electron tree: `461.6` CPU-seconds, `76.6%` of one core.
- Headless Chrome client: `1,124.9` CPU-seconds, `186.7%` of one core.
- Combined: `263.3%` of one core, or `21.9%` across the host's 12 logical CPUs.

These figures include the headless browser and the sampling overhead; they are
not a claim about physical audio-interface CPU cost.

**Memory:**

- Electron working set: `742.3–804.9 MB`, p95 `780.8 MB`, final `752.3 MB`;
  private bytes `530.2–601.7 MB`, final `537.5 MB`.
- Chrome working set: `1.15–1.40 GB`, p95 `1.33 GB`, final `1.33 GB`;
  private bytes `950.1 MB–1.06 GB`, final `1.04 GB`.
- Renderer JS heap: `21.6–38.4 MB`, final `22.7 MB`.

The Electron tree ended below its startup working-set peak. Chrome rose during
startup and then plateaued; neither tree showed monotonic growth, and the JS
heap returned to its starting range. This supports the current-host
"no unbounded memory growth" observation, not a clean-machine guarantee.

**UI responsiveness:**

- `requestAnimationFrame` wait: p50 `7.7 ms`, p95 `12.3 ms`, max `13.5 ms`.
- `setTimeout(0)` wait: p95 `8.3 ms`, max `9.9 ms`.
- Forced transport-bar layout: p95 `0.5 ms`, max `0.6 ms`.
- Frame-gap average: `16.68 ms` (about 59.9 fps); max `50.1 ms`; two frames
  exceeded 50 ms; one long task measured `56 ms`.
- CDP `page.evaluate` round trip: p50 `20 ms`, p95 `27 ms`, max `2,717 ms`.
  The single 2.7 s outlier did not coincide with a frame-gap or layout spike;
  it is retained in the raw data rather than discarded.

**Stability caveats:** the strict harness status is `stable=false` because its
failed-request counter includes one Chrome-internal
`chrome-untrusted://new-tab-page/one-google-bar` `ERR_ABORTED` at startup, not
an app request. Two of the 41 five-second app `GET /` health probes returned no
response at 49.7 s and 236.2 s; the next sample returned 200 while playback
continued. Two process-tree metric queries timed out at 228.3 s and 287.4 s,
leaving 39/41 app memory/CPU samples. These are recorded as measurement and
probe caveats, not converted into an unqualified pass. No app crash, page error,
console error, or app-origin error response was observed.

### Separated-collector rerun

A second 600.0-second soak used the same exact extracted executable, a fresh
profile, a starter project, looped transport playback, and a disposable
headless Chrome client. Health checks were limited to app-origin `GET /` with a
5-second timeout; process-tree CPU and memory samples came from a separate
PowerShell collector process, so no metric query ran synchronously in the
health/UI loop. Evidence: `release/g0/soak2/soak2.json`,
`release/g0/soak2/collector.jsonl`, and
`release/g0/logs/24-soak2-10min.log`.

**Result:** 41/41 samples played and looped; **0/41** app-health probes failed;
health latency p95 `3 ms`, max `7 ms`; final HTTP 200; strict harness
`stable=true`; no page, console, app-origin request, or app-exit errors. The
collector produced 40/40 valid process-tree samples over its 585-second window.

**CPU:** packaged Electron tree `386.9` CPU-seconds (`66.1%` of one core);
headless Chrome `1,060.0` CPU-seconds (`181.2%` of one core); combined `247.3%`
of one core, or `20.6%` across 12 logical CPUs. The collector window was 585 s,
so these percentages use that interval rather than the full 600 s.

**Memory:** Electron working set `729.4–784.9 MB`, p95 `752.4 MB`, final
`738.7 MB`; private bytes `515.9–578.3 MB`, final `523.8 MB`. Chrome working set
`1.13–1.41 GB`, p95 `1.34 GB`, final `1.34 GB`; private bytes `964 MB–1.05 GB`,
final `1.05 GB`. Renderer JS heap `22.1–38.6 MB`, final `23.6 MB`.

**UI:** `requestAnimationFrame` wait p50 `9.3 ms`, p95 `12.1 ms`, max `13 ms`;
`setTimeout(0)` p95 `6.6 ms`, max `9.5 ms`; forced layout p95 `0.4 ms`, max
`0.5 ms`; frame-gap average `16.66 ms`, max `33.5 ms`; no long tasks; CDP
evaluate round trip p95 `25 ms`, max `29 ms`.

**Comparison:** the first run had app-health probe timeouts at 49.7 s and
236.2 s plus two synchronous process-metric query timeouts. This run had no
health failures and no collector failures, and the two timeouts did not
reproduce after metric collection was moved out of the health loop. This is
consistent with the earlier timeouts being caused by harness contention from
the synchronous PowerShell queries; it does not prove that cause, and it does
not replace clean-machine or physical-hardware testing.

The crash-recovery attempt failed before it reached the crash: the test's
`page.waitForFunction` timed out while setting Tempo to 139, and the restore and
verify phases then reported `Packaged project-recovery target was not staged by
the prior test run.` This is recorded as a test-setup failure, not as evidence
that recovery is broken or working.

## G4 clean-machine matrix

| Check | Result |
| --- | --- |
| Windows 11 clean VM or physical machine | **BLOCKED** — no clean target available |
| No Node.js, development tools, or prior app data | **NOT MET** — this is the development host with existing app data |
| Built-in audio output and a class-compliant USB interface | **NOT RUN** — no clean test environment or identified USB interface |
| 44.1 kHz and 48 kHz, 128/256-sample buffers | **NOT RUN** |
| Physical MIDI: notes, velocity, sustain, pitch bend, reconnect | **NOT RUN** — only virtual MIDI devices present |
| Standard and high-DPI display scaling | **NOT RUN** |
| Create, save, close, relaunch, reopen full project | **PARTIAL — current-host packaged UI** — starter project save/reopen passed; audio, automation, and recorded-instrument coverage were not included, and this is not a clean machine. |
| Export WAV, FLAC, and a compressed format; verify duration/levels | **PARTIAL — current-host packaged UI** — WAV/FLAC/MP3 passed duration and level checks; not a clean machine and not physical output. |
| Ten-minute loaded session; CPU, memory, latency, UI responsiveness | **PASS on current-host software (separated-collector rerun)** — 600.0 s, 41/41 playing/looping, 0/41 health failures, stable=true; the first run's two probe timeouts did not reproduce; not a clean machine. |
| No unbounded memory growth during soak | **PASS on current-host software (both soaks)** — Electron working set peaked at startup and ended lower; JS heap stayed bounded; not a clean machine. |
| Force-stop during recording; recovery does not overwrite previous project | **NOT RUN** — graceful project recovery passed separately, but no recording fixture was available and the abrupt crash-recovery setup failed. |
| Failed save and disk-full/permission-denied paths | **NOT RUN** |
| Install, upgrade, uninstall | **NOT RUN** — portable artifact; no clean install target |
| Project migration from the previous public build | **NOT RUN** |

## G0 status

The artifact identity, source tag/commit, build environment, packaged web hash,
and size are recorded in [G0_ARTIFACT_EVIDENCE.md](G0_ARTIFACT_EVIDENCE.md).
The exact artifact passed the isolated launch smoke above and the software-only
checks recorded here. Those checks do not substitute for the missing
clean-machine evidence.

G0 is still not marked passed because the clean-machine acceptance evidence
required by the release gate has not been produced, and the earlier standard
`npm run dist:win` run hit a transient 7-Zip packaging failure before the
prepackaged repack succeeded. See the artifact evidence file for that caveat.

## Access attempt

A remote clean Windows 11 VM was requested, with SSH/OpenSSH and an authorized
key selected. No VM address, username, or port was supplied; `YOU DECIDE`
cannot establish a network route. A later local audit found no
`%USERPROFILE%\.ssh\config` and no reachable SSH authentication agent, so no
endpoint or authorized key is configured on this host either. No connection was
attempted and no network scan was run. The full G4 matrix therefore remains
blocked.

## Required to complete G4

Run the matrix on a clean Windows 11 VM or physical machine with:

- no Node.js or development tools;
- no previous Unbox Studio app data;
- built-in audio and a class-compliant USB audio interface;
- a physical MIDI controller;
- standard and high-DPI displays;
- a clean install of the exact artifact whose SHA-256 is recorded above.

Use the [G4 clean-machine runbook](G4_CLEAN_MACHINE_RUNBOOK.md) and its
[evidence template](G4_CLEAN_MACHINE_EVIDENCE_TEMPLATE.md) to run and record the
remaining checks. `scripts/g4-clean-evidence.ps1` collects the machine,
clean-state, device, artifact, and optional process evidence without launching
or stopping the app. The current artifact is portable; the runbook treats install,
upgrade, uninstall, and migration as **BLOCKED** unless a separate installer and
a previous public build are supplied and tested.

Until those results exist, G4 remains **BLOCKED**, not passed.
