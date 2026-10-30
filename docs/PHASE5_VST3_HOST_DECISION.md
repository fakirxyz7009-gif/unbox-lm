# Phase 5 decision: native VST3 host boundary

**Status:** Project-owned Windows x64 effect and MIDI-instrument offline host smokes pass, including a versioned effect-component state round-trip and malformed-state rejection. Real-time transport and DAW integration remain open. Native hosting is not implemented in Unbox.
**Date:** 2026-10-26
**Last updated:** 2026-10-29

## Context

Unbox Studio currently runs its audio graph in one Web Audio `AudioContext`. The VST library scanner reads plugin metadata, while `VstPluginDevice` renders category-matched Web Audio proxy DSP. The Electron renderer has `nodeIntegration: false` and `contextIsolation: true`. Loading plugin DLLs in the renderer or Electron main process would violate the app's process boundaries and make a plugin crash capable of taking down the DAW.

Steinberg's current VST3 SDK provides the hosting API and hosting examples under the MIT license. VST3 processing is block-based; the host configures a maximum block size, supplies bus buffers and event/parameter queues, and receives the plugin's reported latency and state interfaces. Electron provides `utilityProcess` for CPU-intensive or crash-prone services, with message ports between the utility process and renderer.

## Decision

1. **Desktop only:** Native VST3 execution will be an Electron capability. Web builds keep their current explicitly labeled proxy DSP and report native hosting unavailable.
2. **Isolated instance process:** Electron main supervises one `utilityProcess` per loaded plugin instance. A Node-API native module in that utility process uses Steinberg's VST3 hosting interfaces. Plugin code never loads in the renderer, audio worklet, or Electron main process. A plugin crash must only terminate its own process.
3. **Keep the process boundary, prove the audio boundary:** The intent is to keep the existing Web Audio graph as owner, but the bridge is not selected yet. Prototype shared memory, bounded message transport, and a native audio-backend boundary against real block sizes before choosing. A candidate must handle audio and MIDI with deterministic frame ordering and bounded underflow/overflow, without synchronous IPC, allocation, file access, plugin discovery, or UI work in an audio render callback. Main-process messages carry lifecycle and control only.
4. **Measure total latency:** Include bridge queueing and each plugin's reported processing latency in mixer PDC. If no candidate meets measured live-buffer and dropout targets at supported block sizes, revisit the graph/audio boundary before expanding the feature.
5. **Preserve native state:** Store plugin UID, format, architecture, version/fingerprint, parameter state and component/controller state with the project. A missing or incompatible binary opens as an explicit missing-plugin unit. Never silently substitute proxy audio for a missing native plugin.
6. **Scope the first host:** Windows x64 VST3 only. VST2, AAX, CLAP, macOS/Linux, sidechain buses, editor windows, offline render parity and crash recovery remain separate acceptance gates. Do not claim support for them from scanner metadata.
7. **Use a project-owned test plugin:** Build a small VST3 test effect/instrument from source to validate the host. Do not instantiate anything from `D:\vsr` during development, and do not redistribute third-party plugin binaries.

## Implementation gates

1. **Complete:** Add the official SDK and its MIT notice; build project-owned effect and instrument VST3s, process the effect at varied sample rates/block sizes, pass ordered MIDI note-on/off events to the instrument and check sample-level output, then validate both bundles with Steinberg's validator.
2. **Open:** Prototype and measure the live audio boundary options using the project-owned fixtures; record the chosen transport and its supported block sizes before implementation. A Windows native-process shared-memory ring now has paced measurements for the project-owned delay and MIDI synth, but it does not exercise Electron, an audio device, or Unbox's callback and therefore does not select the production transport.
3. Implement the utility-process supervisor, path validation, lifecycle, protocol versioning, chosen transport and bounded underflow/overflow behavior.
4. Integrate the audio adapter and verify deterministic block/frame ordering, MIDI events, parameters, suspend/resume and project save/restore.
5. Add plugin-reported plus bridge latency to live and offline PDC; implement buses/sidechain, editor-window ownership, missing-plugin recovery and process restart.
6. Run latency, CPU, dropout, stability and offline/live parity measurements before enabling the feature for user plugins.

## Current prerequisites and limits

- Visual Studio 2026 Professional is installed. `vswhere` locates MSVC x64 14.51.36231, MSBuild, CMake 4.3.1, and Ninja 1.13.2. The native fixtures build with `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\vst3\smoke.ps1`.
- The official Steinberg VST3 SDK 3.8.1 is checked out at `third_party/vst3sdk` (revision `3cdf9ca5d1f5b1b21e0a86832aa4abe55607bd96`). Its root `LICENSE.txt` is MIT and requires retaining the copyright and permission notice. The SDK source and listed submodule directories are present locally; nothing from `D:\vsr` was loaded or executed.
- The project-owned `Unbox Test Delay` VST3 and standalone host probe build from source. The host measures the one-second stereo impulse at 44.1 kHz / 127 frames, 48 kHz / 256 frames, 96 kHz / 511 frames and 192 kHz / 1024 frames; both channel peaks land at the expected frame with left amplitude 1.0 and right amplitude 0.5. It also saves a versioned 0.5 output-gain component state, resets to defaults, restores the saved stream, verifies 0.5 / 0.25 stereo output at frame 48000, and confirms a truncated stream is rejected without changing state. The project-owned `Unbox Test MIDI Synth` fixture adds one stereo output and one event input. The standalone host supplies pitch 69 / velocity 0.8 note-on at sample 5 and matching note-off at sample 20, then checks every output frame, including expected 440 Hz phase progression, stereo equality and silence after note-off. These are deterministic offline, same-process fixture checks; they do not exercise Electron, the browser audio graph, live hardware MIDI, automation, PDC, DAW project serialization, sidechains, editor windows, or crash recovery.
- Steinberg's validator passed all 47 checks for each project-owned bundle. The fixtures support 32-bit float processing; the validator reports double-precision processing as unsupported. The SDK validator self-test passed all 51 tests, and Steinberg's `ADelay` example passed all 57 plugin checks.
- This MSVC installation reports `C1902` when the SDK's generated Release flags request `/Zi`. The smoke script changes only the generated Ninja build file to `/Z7` (embedded debug information); no SDK source is patched. Release compiler probing and the native build then pass.
- A local Electron utility-process probe intended to validate `SharedArrayBuffer` transfer could not reach its test code: Electron exited during startup with Windows status `0x80000003` (`STATUS_BREAKPOINT`). Electron utility-process shared-memory transfer remains unverified; the separate native Windows shared-memory fixture probe is documented below and does not change this result.
- Added a repeatable `npm run test:vst3-boundary` diagnostic using Electron `utilityProcess`, a shared stereo-block ring, and checksum/overflow assertions. Follow-up exposed that the outer 15-second cap was shorter than the probe's own 8-second startup plus 20-second worker bounds; the cap is now 35 seconds and the runner inherits stdio to avoid waiting on Electron child-process output pipes. On 2026-10-27, the rerun timed out at 35 seconds without probe output both normally and with `ELECTRON_ENABLE_LOGGING=1`. This provides no successful cross-process measurement and does not change the open transport decision. `node --check scripts/vst3/run-electron-boundary-probe.cjs` passes.
- Added `npm run test:electron-startup` to distinguish Chromium/Electron app startup from the utility-process test. Its runner captures stdout and stderr to `.tmp/electron-startup-probe/` and allows 30 seconds. The latest app-mode launch exited with status 1 before writing its `main-loaded` marker; captured stdout contains only a blank line and stderr is empty. Electron 45's `ELECTRON_RUN_AS_NODE=1` mode reports version `45.0.0`, but app-mode startup remains unverified and this failure occurs before the probe's JavaScript entry. `node --check scripts/vst3/run-electron-startup-probe.cjs` passes. The utility-process transport probe also remains unverified; neither result supports enabling native hosting.
- The two C++ `Vst3HostContainer.h` sketches are uncompiled and not VST3 hosts. Both now fail initialization and perform no audio pass-through, plugin loading, automation, or state recall.
- The scanner's `hostable` field describes binary architecture/format suitability only; it does not mean a plugin is loaded or executed.

## Follow-up — 2026-10-27 bounded Node IPC transport baseline

- Added `npm run test:vst3-ipc-transport`, which sends 2,400 stereo Float32 blocks (128 frames at 48 kHz) through a separate project-owned Node child process. The worker applies a 0.5 gain; the runner checks every returned sample and sequence, caps outstanding messages at four, and requires queue backpressure to occur.
- Result: 2,400/2,400 ordered blocks passed sample-level validation; maximum outstanding blocks were 4/4, with 2,396 backpressure events. Round-trip message latency was p50 0.223 ms, p95 0.415 ms, p99 0.592 ms, maximum 2.304 ms; offline throughput was 15,294 blocks/s (40.78× the 375-block/s nominal rate).
- This is an asynchronous Node IPC baseline under an offline producer. It does not pace against audio deadlines, measure dropouts, execute a VST3, use Electron `utilityProcess`, or prove that any candidate is safe for live audio. The shared-memory/Electron boundary decision remains open.
- Verification: both probe files pass `node --check`; `npm run test:vst3-ipc-transport` passes.

## Primary references

- [Steinberg VST3 SDK](https://github.com/steinbergmedia/vst3sdk) — SDK contents, platform requirements, host samples and current MIT license.
- [VST3 `IAudioProcessor` and processing model](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/API%2BDocumentation/Index.html) — setup, buses, block processing, events and state.
- [Electron `utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process) and [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model) — isolated crash-prone/CPU-intensive services and message ports.

## Follow-up — 2026-10-27 project-owned VST3 in a native child process

- Added a small Windows x64 stream host that loads only the project-owned `Unbox Test Delay` fixture, processes 48 kHz stereo blocks of 128 frames, and exchanges fixed binary block messages through child-process stdin/stdout pipes. The host is built by the existing SDK smoke script; the runner caps outstanding messages at four.
- The offline-burst run sent 2,400 blocks and verified every sample against the fixture's one-second delay. It received all blocks in order, used the full 4/4 queue, and recorded 2,396 backpressure events. Process round-trip latency was p50 0.143 ms, p95 0.337 ms, p99 0.653 ms, maximum 2.238 ms; throughput was 22,179 blocks/s (59.14× the nominal 375-block/s rate).
- The same command also runs a Node-timer-paced mode at 375 blocks/s. That run reported p99 response time 16.143 ms, 1,215 two-block deadline misses, and producer lateness over 1 ms on 2,247/2,400 ticks, with 16.042 ms maximum scheduler lateness. This is dominated by the Node timer's Windows wake-up cadence; it is evidence that this harness cannot pace a 2.667 ms audio quantum reliably, not evidence that the native process alone takes 16 ms.
- These runs exercise real project-owned VST3 DSP behind a separate native process boundary, but not Electron `utilityProcess`, a paced AudioWorklet, an audio device, or the DAW callback. They do not establish dropout safety, production queue latency, or native hosting in Unbox; the live bridge decision remains open.
- Verification: `npm run test:vst3-process-transport` rebuilt the fixtures/host, passed the effect and instrument offline smokes and both 47-check Steinberg validations, then passed sample-exact offline and Node-timer-paced process-stream probes.

## Follow-up — 2026-10-27 MIDI events across the native process boundary

- Added `npm run test:vst3-midi-process-transport`, a focused stream host for only the project-owned `Unbox Test MIDI Synth`. Each 128-frame request carries two timestamped MIDI events; the native child returns the resulting stereo block over binary stdio.
- The offline run processed 2,400 blocks and checked all 4,800 note-on/note-off events, ordered replies, event offsets, changing pitches and velocities, note releases, and every stereo sample against the deterministic fixture. The four-message queue filled (2,396 backpressure events); process round-trip latency was p50 0.145 ms, p95 0.306 ms, p99 0.495 ms, maximum 2.037 ms; throughput was 23,623 blocks/s.
- This confirms the test protocol can carry MIDI into a project-owned VST3 in a separate native process and return its audio deterministically under an offline producer. It does not test an audio device, callback deadlines, Electron `utilityProcess`, live MIDI hardware, parameters/state, or integration with Unbox's graph. Phase 5 remains unimplemented in the DAW.
- Verification: `npm run test:vst3-midi-process-transport` rebuilt both fixtures and hosts, passed each fixture's 47-check Steinberg validation, and passed the MIDI process-stream sample assertions.

## Follow-up — 2026-10-27 Electron startup retest

- `npm run test:electron-startup` again timed out at its 30-second bound before the app's `main-loaded` marker, both in the sandbox and in an unsandboxed run. A separately created minimal Electron app with `--no-sandbox` also timed out before its first main-JavaScript statement. Electron Node mode still reports version 45.0.0; the app-mode probes produced no application-level output.
- This narrows the observation to Electron/Chromium app-mode bootstrap on this host. It is not evidence that Unbox's Electron entry or VST3 host code caused the timeout, and it does not establish a successful or failed plugin-host integration. Keep the app-specific startup and native-host gates open until an environment reaches the Electron main entry. `node --check scripts/vst3/run-electron-startup-probe.cjs` passes.

## Follow-up — 2026-10-27 VST3 component state recall fixture

- The project-owned `Unbox Test Delay` now stores its output gain in a 12-byte, versioned little-endian component state. Restore rejects truncated, wrong-version, non-finite and out-of-range data before changing the active gain; the process reads the gain atomically.
- The standalone host saves a 0.5 gain state, resets to its default, restores the saved snapshot, rejects wrong-version, non-finite, out-of-range and truncated streams without state mutation, then renders the restored setting at 48 kHz / 256-frame blocks. The output peaks at frame 48000 with left/right amplitudes 0.5 / 0.25; the existing unity-gain checks at four sample-rate/block-size pairs still pass.
- Verification: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\vst3\smoke.ps1` rebuilt the delay fixture and host, passed both fixture host smokes and both Steinberg validators (47 checks each), and emitted the expected component-state audio result. This is fixture-level `IComponent` state evidence, not plugin state saved in an Unbox project; native DAW hosting remains unimplemented.

## Follow-up — 2026-10-28 Windows shared-memory audio and MIDI transport prototype

- Added `npm run test:vst3-shared-memory`. It builds the project-owned test effect and MIDI synth, then launches each in a separate native worker process. A versioned, four-slot Windows shared-memory ring carries stereo Float32 blocks and timestamped MIDI events; named events wake the worker and return completed blocks. No third-party plugin is loaded.
- The delay fixture processes 2,400 blocks at 48 kHz / 128 frames and verifies its one-second output sample by sample. Its offline burst reached 4/4 slots and applied producer backpressure. The latest paced `kRealtime` run sustained 374.825 blocks/s against 375 nominal, with 0/2,400 one-block deadline misses, 0 producer starts over 1 ms late, 0.5766 ms maximum schedule lateness, and worker-completion latency p99 0.0256 ms / max 0.088 ms.
- The MIDI synth test delivers 300 note-ons and 300 matching note-offs at sample offsets that vary by phrase across 2,400 blocks; every stereo output sample is checked against the expected oscillator phase, velocity and note release. The latest paced run sustained 374.819 blocks/s against 375 nominal, with 0/2,400 one-block deadline misses, 0 producer starts over 1 ms late, 0.7826 ms maximum schedule lateness, and worker-completion latency p99 0.0236 ms / max 0.0398 ms. Its offline burst filled the ring and applied backpressure.
- These are native-process fixture measurements with no audio device, Electron `utilityProcess`, browser AudioWorklet, live callback, or DAW graph integration. The results support continuing the shared-memory candidate evaluation; they are not evidence to enable third-party plugins or claim Phase 5 complete.
- Verification: `npm run test:vst3-shared-memory` passed the effect and instrument host smokes, both 47-check Steinberg validations, sample-exact offline bursts for both fixture types, and the paced realtime-mode audio/MIDI deadline checks.

## Follow-up — 2026-10-29 current fixture revalidation

- Rebuilt/revalidated only the project-owned fixtures. The standalone effect and MIDI-instrument host smokes passed, and Steinberg's validator again reported 47 passed / 0 failed checks for each bundle. The delay state-recall check still rendered the restored 0.5/0.25 stereo gain at frame 48,000.
- The isolated native stdio host processed the project-owned delay in an offline 2,400-block, 48 kHz / 128-frame stream with a bounded four-block queue and sample-exact output. It measured process round-trip p50/p95/p99/max of 0.165/0.439/0.875/3.527 ms and exercised backpressure 2,396 times. This is throughput evidence, not a live-callback result.
- The shared-memory candidate then completed two 2,400-block paced runs at the same format with zero one-block response deadline misses: effect worker completion p99 0.0521 ms (max 0.5322 ms), MIDI-synth p99 0.0410 ms (max 1.1024 ms). The synth run delivered 300 timestamped note-ons plus 300 note-offs with phrase-varying offsets and checked every stereo output sample.
- These measurements leave the transport decision **open**. They do not exercise Electron's utility process, an AudioWorklet/audio-device callback, DAW project state, editor hosting, PDC, sidechains, plugin crash recovery, or any third-party binary. Native VST3 hosting remains unimplemented in Unbox.

## Follow-up — 2026-10-29 Electron utility-process capability boundary

- The repaired Electron fixture launch now reaches `app.whenReady()` and starts a real `utilityProcess`. The worker reports a present `process.parentPort`, but on this host it exits cleanly before receiving even a versioned control message, including when held open with an explicit timer. Thus the control-plane handshake is **unverified**, not successful.
- Before that early exit, Electron rejects a small `SharedArrayBuffer` payload with `An object could not be cloned.` `npm run test:vst3-boundary` records this as an explicit `SKIP` capability result when both limitations occur. Any different failure remains a test failure; a future Electron capability change requires a new bounded real-time measurement rather than auto-enabling a transport.
- Therefore Electron `utilityProcess` is not a selectable lifecycle/control or shared-memory audio bridge on this host. It is not an audio transport result and does not advance native VST3 hosting beyond its open implementation gates.
