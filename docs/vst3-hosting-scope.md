# Hosting real VST3 plugins: scope and first proof

Status: the first step is proven (see *Proof* below). Everything after it is scoped here, in the order
it has to be built. No shipping code launches a third-party plugin yet.

## What already exists

| Piece | Where | State |
| --- | --- | --- |
| Out-of-process stream host | `scripts/vst3/process_stream_host.cpp` → `unbox-vst3-process-stream-host.exe` | Loads one module, stereo 48 kHz, 128-frame blocks, locked to the class name `Unbox Test Delay` |
| Wire protocol | `electron/vst3ClipProcess.cjs` | 8-byte header `{sequence, frames}` per block, planar float32 stereo, bounded queue (4 in flight), 30 s deadline, non-finite samples rejected |
| Hash-verified fixture gate | `electron/vst3ClipFixture.cjs`, `getDelayFixtureBuild()` in `electron/main.cjs` | Refuses anything that is not the source-built fixture; `app.isPackaged` disables the whole path |
| Other transports | `midi_process_stream_host.cpp`, `shared_memory_stream_host.cpp` | Built and probed, not wired into the engine |
| Library scan | `server/vst/scanner.ts` | Reads PE headers and plugin metadata from `D:\vsr`; never loads the binaries |
| Packaged-build transport | `electron/main.cjs` (`unbox:vst3-test-delay`) | IPC handler → child process → stereo clip render, plus a preload bridge with `sandbox: true` |

So the hard part — a stable, sandboxed, out-of-process audio transport with a strict renderer boundary —
is already done for a single fixture plugin. The gap is that the loader refuses every other module and
that nothing is shipped.

## Proof that the transport is generic (done)

- `scripts/vst3/third_party_host.cpp` → `unbox-vst3-third-party-host.exe`: loads **any** module path,
  prints the factory's classes as JSON on stderr, selects an audio-effect class by name or first match,
  reports `getLatencySamples()` / `getTailSamples()`, sends parameters through
  `ProcessData.inputParameterChanges`, and streams blocks with the same protocol as above.
- `scripts/vst3/run-third-party-host-probe.cjs` drives it and measures the result.

Measured against Steinberg's own third-party sample plugin, built from
`third_party/vst3sdk/public.sdk/samples/vst/adelay`:

```
module=adelay.vst3; classes=3; effects=1
plugin="ADelay" vendor="Steinberg Media Technologies" version="3.8.1.0"
declared-latency=0 frames; tail=0 frames
click-in=0.900 at 0.000 ms -> click-out=0.900 at 250.00 ms (sample 12000)   [--param 100=0.25]
click-in=0.900 at 0.000 ms -> click-out=0.900 at 500.00 ms (sample 24000)   [--param 100=0.50]
click-in=0.900 at 0.000 ms -> click-out=0.900 at 750.00 ms (sample 36000)   [--param 100=0.75]
```

The click lands exactly on the parameter's delay, so the host is driving the plugin's real DSP and its
real parameter handling. This plugin is not written by this project; it is third-party code from the
VST3 SDK, and it is not taken from `D:\vsr`.

Reproduce: `npm run test:vst3-third-party` (after building the host with the VST3 SDK, below).

Rebuild the host (Windows x64, Visual Studio 18 with the C++ tools):

```
cmd /c ""C:\Program Files\Microsoft Visual Studio\18\Professional\Common7\Tools\VsDevCmd.bat" -arch=x64 -host_arch=x64 && "<VS>/Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe" -C third_party/unbox-vst3-host-smoke-build unbox-vst3-third-party-host"
```

## What packaging a real host takes

Ordered by dependency, not by size. Effort is for this codebase, not for a generic DAW.

### 1. Ship the host and find it (small, ~1 day)

- Add the host exe to `build.extraResources` (it is native, so `asarUnpack` alone is not enough) or
  `build.files` with an explicit destination outside `app.asar`.
- Resolve it in `electron/main.cjs` as `process.resourcesPath/…`, keep the fixture path for development.
- Link the host with `/MT` (static CRT) or ship the VC++ redistributable; today it is built `/MD` and a
  clean machine without the redist cannot start it.
- Publish a per-release manifest of host hashes; the packaged app verifies its own host before spawning.
- Guard architecture: x64-only today; arm64 Macs/Windows need their own build.

### 2. Decide the plugin policy (a product and repo-rule change)

`AGENTS.md` currently forbids executing anything from `D:\vsr`, which is the only plugin library the app
knows. Hosting means deliberately breaking that rule for a user-chosen folder, so it must be a separate,
explicit, user-scanned directory with its own consent flow — not `D:\vsr` itself — or the rule stays and
hosting is limited to a folder the user adds. This decision comes before any further code.

### 3. Isolation and failure containment (small-medium, ~2-3 days)

- One child process per plugin instance, or a small pool; never inside the renderer.
- Job object with a memory cap, a watchdog for hangs (`process` call has no timeout today except the
  render deadline), restart-on-crash with the plugin marked unstable after N restarts.
- Keep the renderer boundary as it is: absolute paths supplied by main, audio (not paths) from the
  renderer, `senderFrame.url` checked, `sandbox: true` preload.

### 4. Real-time audio, not just clips (large, the main lift, ~2-3 weeks)

Today the only consumer is an offline clip render. Live playing needs:

- The host process kept alive and fed from the engine's schedule, not a per-render spawn.
- A transport that survives real-time: the shared-memory host already exists
  (`unbox-vst3-shared-memory-host.exe`) because stdio round-trips are too slow for 128-frame blocks at
  ~2.7 ms intervals.
- The AudioWorklet ↔ main ↔ host hop; the worklet cannot open IPC, so a shared-memory ring buffer plus
  Atomics is the realistic design.
- Buffer strategy for plugin latency: `getLatencySamples()` must feed PDC automatically
  (`track.offsetMs` exists but is manual), and `getTailSamples()` must drive offline tail renders so
  exports match.
- Offline parity: `renderSong` must include hosted plugins, otherwise exports do not match playback.

### 5. Parameters, automation, state (medium, ~1 week)

- Enumerate `IEditController` parameters (id, title, units, step count, default, flags) and present them
  as a device faceplate; today a hosted plugin has no faceplate.
- Route them through the existing automation lanes and the undo journal.
- Save/restore plugin state with `IComponent::getState`/`setState` into the project (per device), and
  preset recall; a project that references a missing plugin must keep its sound-neutral placeholder.
- Parameter feedback (plugin → host → UI) for VST3 `IComponentHandler::performEdit` when the plugin's own
  UI moves a knob.

### 6. Plugin editor window (medium, ~1 week)

- `IPlugView` needs an `HWND` child window: `attach()` in a `BrowserWindow`/`BassWindow` or a native
  child of the main window; DPI, resize, focus, and modal dialogs all need handling.
- Cross-platform (`NSView` on macOS) if the app ever leaves Windows.
- Fallback: a generated parameter UI (like `SpecFaceplate`) covers plugins without an editor.

### 7. Instruments and MIDI (medium, ~1 week)

- `midi_process_stream_host.cpp` already streams note events; it needs sample-accurate scheduling from
  the sequencer, note-off/panic, and MPE (per-note bend/pressure/timbre) which the app collects but does
  not yet consume anywhere.
- Instrument plugins also need multi-output buses (drum plugins) — the current host hardcodes one stereo
  bus each way.

### 8. Scanning and cache (small-medium, ~2-3 days)

- `scanner.ts` reads headers only; enumerating real classes means loading each module (slow, can crash),
  so it must run in the same isolated child, with a per-plugin timeout, and results cached in the
  manifest with a hash + mtime key.
- Reject 32-bit modules explicitly; surface "failed to load" reasons the way the MIDI panel does.

### 9. Licensing (do not defer, ~1 day + legal review)

The VST3 SDK is dual-licensed (GPLv3 or a Steinberg proprietary agreement). Distributing a host binary
that links the SDK obliges you to one of them; GPLv3 has consequences for how the app is distributed.
This is a business decision, not an engineering one, and it gates any public release.

### 10. Testing (small, ongoing)

- Keep the fixture tests as they are (they protect the renderer boundary).
- Add one third-party plugin binary built in CI (`adelay` is already in the tree and is the cheapest
  option) plus failure cases: crash on load, hang in process, missing class, wrong bus layout.
- Keep `npm test` free of this — native plugin tests belong in their own job, like the browser probe.

## Rough total

Small pieces (1, 3, 8, 10): about a week. Parameters/state/UI/MIDI (5, 6, 7): two to three weeks.
Real-time transport and offline parity (4): two to three weeks on its own, and it is the part that
decides whether hosted plugins feel native. Licensing and the plugin-folder policy must be settled
before any of it ships.

## Not in scope for a first shippable version

Plugin side-chaining, VST2/VST3 preset interchange beyond state blobs, ARA, sample-accurate automation
for plugins that do not support it, sandboxing plugins with per-plugin OS users, and hosting on macOS.
