# Unbox Studio Feature Truth Table

**Snapshot:** 2026-10-28 probe results. Source audit added on 2026-10-29 (see [Checklist and critique audit](#checklist-and-critique-audit-2026-10-29)); no probe was re-run that day  
**Status:** Working evidence ledger. This is not a release certification. The 10-phase status and verification limits are maintained in [docs/PHASE_0_AUDIT.md](docs/PHASE_0_AUDIT.md) and [UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md](UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md).

## Evidence rules

- **Implemented** means a code path exists in this checkout; it does not imply host, performance, or musical-quality acceptance.
- **Partial** means core code exists and named features, integrations, or acceptance checks remain.
- **Not implemented** means there is no working production path in the app.
- Runtime and hardware claims require a live run. A type check or unit test cannot establish those claims.

## System map

| Area | Current code path | Evidence-backed status |
| --- | --- | --- |
| Frontend and workspaces | React 19/Vite 7; `src/App.tsx`, `src/shell/AppShell.tsx`, workstation, rack, and mixer/editor pages | Present; controlled Chrome screenshots and simulated MIDI UI recording are verified. Broader accessibility and user workflow acceptance remain open. |
| Audio graph | Shared Web Audio `AudioContext`; `src/audio/AudioEngine.ts`, `BaseDevice`, `SpecDevice`, AudioWorklets | Present; runtime latency, dropout, CPU, and long-run acceptance remain open. |
| MIDI input and recording | `src/audio/midi/MidiInput.ts` → `AudioEngine.handleMidiMessage()` → `RecordController` | Record requests Web MIDI access when an instrument track is armed. Headed Chrome captured physical Novation Impulse 25 MIDI 81 at velocity 18/127 for 2.917 sixteenths through workstation arm + Record and preserved it through IndexedDB save/reopen. A separate simulated UI pass also preserves its test note. More keys/channels and physical audio output remain to be checked. Pitch bend, mod wheel (CC1) and sustain (CC64) are handled; channel pressure and polyphonic aftertouch are not. |
| Sequencing and timing | `src/audio/time/`, `src/audio/sequencer/`, `src/nexa/StepEditor.tsx` | Shared time-map, transport, scheduler, arrangement, and pattern paths exist; full interactive acceptance remains open. |
| Rack and device catalog | `shared/rack/devices/`, `src/audio/spec/registry.ts`, legacy factories, `src/rack/` | Three-column rack, cables, players, devices, and utilities are present. The app’s original devices are not Reason Rack Extensions. |
| Effects and mixing | `src/audio/spec/engines/`, `src/audio/mixer/`, `src/audio/mastering/` | Chrome checks passed for 65/65 audio-effect bypass/power paths, 43/43 measurable processor responses and 25/25 function-specific utilities. The instrument-first full-device smoke also verified RV7000 dry bypass, power-off silence and signal recovery. Broader device quality, automation, tails and export parity remain. |
| Recorded instruments | `public/instruments/`, `shared/instruments/`, `multisample` engine | 45 packs: 38 CC0, 3 CC-BY-3.0, and 4 marked `Custom`; 41 are redistributable. New Ganjo Six-String Banjo pack has 38 CC0 recordings, 38 zones across MIDI 38–72, and two round robins on MIDI 58. Its browser test decodes all samples, checks round-robin alternation, verifies source credit and CC0 metadata, and measures offline RMS 0.0512. The CC-BY Pianet T/Wurlitzer packs and CC0 Clarinet retain their documented attribution and playback coverage. A fresh share-mode web build audit confirms all 41 redistributable packs and 2,605 referenced samples/credits are present while excluding four `Custom` packs, local plugin library, and stems. Both workstation LOAD and Devices pages have a Recorded audio only filter, with regressions verifying it excludes modeled instruments. |
| Local plugin library | `server/vst/`, `/api/vst/*`, `src/vst/VstPluginDevice.ts`, `src/project/projectFormat.ts` | Scanning and metadata are present; the `hostable` flag describes binary architecture only. Mounted items use labeled proxy DSP, receive MIDI, and save a validated state snapshot. Native VST3 execution is not implemented. No load-time validation, blacklist, plugin GUI, or plugin delay compensation exists. |
| Project-owned VST3 fixture smoke | `scripts/vst3/host_smoke.cpp`, `scripts/vst3/test_plugin/test_delay_processor.cpp` | Source-built delay and MIDI synth pass standalone offline host checks and Steinberg validation (47 checks each). Delay component state round-trips through `IComponent`; wrong-version, non-finite, out-of-range and truncated states are rejected without mutation, and restored gain is verified in rendered audio. This does not save plugin state in an Unbox project. |
| VST3 shared-memory transport prototype | `scripts/vst3/shared_memory_stream_host.cpp`, `npm run test:vst3-shared-memory` | A four-slot Windows native-process ring passes sample-exact paced `kRealtime` blocks for the project-owned delay and MIDI synth. The synth receives 300 note-on/off pairs at phrase-varying sample offsets. Both 2,400-block paced runs had zero one-block deadline misses; this is not Electron, an audio-device callback, or DAW integration. |
| AI assistance | `server/routes/aiRoutes.ts`, `server/routes/localAiRoutes.ts` (`/api/local-ai`), `shared/localAi/assistant.ts`, `shared/rack/localPlanner.ts`, `shared/rack/presetCraft.ts` | With a Gemini key set, Gemini writes rack plans, presets, and mix notes; without one, local rules cover rack plans and presets. A local assistant on Ollama, reached only on this computer, can also write and transform notes in a pattern or clip; its actions are validated, and output quality is unmeasured. The audio graph renders app-owned DSP or recordings; there is no AI waveform-generation route. |
| Music separation | `server/routes/separationRoutes.ts` (`/api/separate`, Demucs `htdemucs`), `src/audio/ai/demucsSeparation.ts`, `src/audio/ai/MusicSeparator.ts`, `src/audio/ai/stemNotes.ts` and `shared/transcription/` (uncommitted) | Two splits exist. The Demucs panel runs the trained htdemucs model once `pip install demucs` has been done; it takes one file per request, uses one model with no quality choice, and has no queue. Not run in this audit. The in-browser four-band split is a DSP estimate with bleed, not a trained separation model. Stem-to-MIDI (drums by onset, monophonic bass and vocals by pitch track; the other stem is not transcribed) is uncommitted. |
| Project storage and export | `src/project/`, `src/audio/render/`, `src/audio/export/` | IndexedDB project save/reopen has browser evidence for six devices, parameter state, stereo cables, metadata and a piano-roll chord. `npm run test:browser-project-recovery` verifies existing-project and interrupted-new-project crash recovery without overwriting unrelated projects, including reload from IndexedDB. Automatic versions (every 10 minutes, last 20 kept, in IndexedDB) and missing-audio reporting exist; `.unbox` archives carry project audio. Broader media, migration tests, export parity and packaged-app recovery checks remain. |
| C++ reference files | `docs/reference-cpp-dsp/` | Documentation headers only; they are not compiled into the application. |

## Roadmap status summary

| Phase | Evidence-backed status |
| --- | --- |
| 0 — Audit and baseline | Static inventory, build/test snapshot, reference catalog, and share-package contents are recorded. One physical MIDI recording/save/reopen path is verified; audible output, performance, and packaged-app launch/recovery baselines remain. |
| 1 — Audio engine foundation | Core Web Audio, transport, MIDI scheduling, project serialization, and test harness exist; integration and long-run verification remain. |
| 2 — Core rack and workstation | Core rack, device registry, routing, Combiner, workstation, and sequencer exist; Chrome rendered all 108 playable instruments and 65 effects. The rack UI pass verified recorded-guitar/effect insertion, stereo routing, 0.0247 master peak from a played note, single-step undo/redo, File-menu save, and reload persistence. Device-quality and target-size coverage remain. |
| 3 — Effects and utilities | Chrome verified all 65 effects preserve stereo dry bypass and power-off, all 43 processors respond to their stimulus, and all 25 utilities pass function-specific checks. The latest instrument-first sweep also verified RV7000 bypass and power recovery. Wider DSP acceptance remains. |
| 4 — Players and editing | Player, piano-roll, automation, MIDI learn, and recording paths exist. Audio take comping (a range within one clip) and transient slicing exist. MIDI takes stay separate clips with no comping, and elastic audio is not implemented. Hardware and accessibility acceptance remain. |
| 5 — VST3 hosting | **Not implemented.** The current plugin library uses proxy DSP. |
| 6 — Advanced synthesis | FM, wavetable/additive, granular, modal, bowed, and West Coast engine families exist; coverage and quality are partial. |
| 7 — Instrument library expansion | 45 packs exist (38 CC0, 3 CC-BY-3.0, 4 private `Custom`), including the Ganjo banjo and FreePats Clarinet with mapped recorded performances and browser playback checks; articulation depth and breadth remain. |
| 8 — Advanced processing | A monophonic scale pitch-correction effect passes live/offline synthetic-tone tests and live tests through the bundled CC0 Bear Sax recording. MIDI 61 tuned −25 cents measured 273.35→261.77 Hz; tuned +25 cents measured 281.49→293.59 Hz. Vocal quality, vibrato/noisy/polyphonic inputs, latency, broad parity and performance acceptance remain. |
| 9 — Production hardening | Recovery regression and 10-minute browser soak exist. A fresh isolated share-mode web build passed a content audit for all 41 redistributable packs and 2,605 referenced samples/credits, excluding four private packs, the local library, and stems. The earlier share `app.asar` audit predates the latest packs; packaged launch/playback, broader recovery, accessibility, and release-candidate checks remain. No CI runs the probes, and the only package target is a portable exe. |

## Checklist and critique audit (2026-10-29)

Source-reading audit of the "Missing Features & Development Gaps" critique and its checklist. No probe was re-run. Statuses follow the evidence rules above:

- **Implemented · tested:** a probe exists and a passing run is recorded in this ledger or in `docs/PHASE_0_AUDIT.md`.
- **Implemented · unverified:** a code path exists and no probe was found.
- **Partial:** core code exists and a named part is missing.
- **Not implemented:** no working production path. A declared-only field counts here.
- **Unverified:** only a live run or hardware can settle it.

Uncommitted as of 2026-10-29: `shared/transcription/`, `src/audio/ai/stemNotes.ts`, `tests/transcribe.test.ts`, both accessibility probe pairs under `tests/browser/`, and a modified `src/components/browser/SampleBrowser.tsx`. Rows that depend on them say so.

### Critique section 1: confirmed-missing items

| Item | Status | Evidence |
| --- | --- | --- |
| VST3 hosting | Not implemented | Phase 5 row. Decision doc `docs/PHASE5_VST3_HOST_DECISION.md`. Native fixtures and transport probes in `scripts/vst3/` are not connected to the app. |
| Time-stretching | Not implemented | Clip warp is `'off' \| 'repitch'` only (`src/audio/types.ts:440-441`). Playback rate is `bpm / sourceBpm` (`src/audio/clips/clipMath.ts:14`). |
| Native plugin processing | Not implemented | Proxy DSP only (`src/vst/proxyDsp.ts:2`). |
| AI audio generation | Not implemented | No generation route (see AI assistance row). |
| Reliable hardware audio | Partial | One physical Impulse 25 note captured and saved (MIDI row). No audio-output measurement. Recording tests use Chrome's fake capture device. |
| Low-latency performance under load | Unverified | Headless 10-minute soaks on 2026-10-27 and 2026-10-28 passed. AudioWorklet gaps peaked at 173 to 176 ms; the gap check fails only above 500 ms. One run logged a 1,035 ms main-thread task, which is reported but not asserted (`tests/browser/device-soak.ts:175-180`). |
| Long-session stability | Partial | 10-minute soak passed twice. Nothing longer is recorded. Heap change is reported, not asserted. |
| Installer reliability | Unverified | `package.json` `build.win.target` is `portable` only, so there is no installer. Packaged launch and playback remain open (Phase 9 row). |
| Accessibility | Partial | Two focus probes: `tests/browser/sample-browser-accessibility.tsx` (Tab and Shift+Tab wrap, Escape close) and a patch-browser probe. No screen-reader test and no whole-app scan. The contrast audit described in CLAUDE.md has no script in the repo. |

### Critique section 5: plugin infrastructure

| Item | Status | Evidence |
| --- | --- | --- |
| VST3 instrument and effect scanning | Implemented · unverified | Metadata scan only; nothing is loaded (`server/vst/scanner.ts:61-62`). |
| Plugin GUI embedding | Not implemented | No editor window. Decision doc gate 5 lists editor-window ownership as open. |
| Plugin state persistence | Partial | Proxy units save a validated snapshot (`src/project/projectFormat.ts:19-21, 56-58`). Native plugin state is not implemented. |
| Plugin crash isolation or sandboxing | Not implemented | No plugin code runs in Unbox. The Electron `utilityProcess` probe did not start on this machine (decision doc). |
| Plugin delay compensation across complex routing | Not implemented | `pdcEnabled` is never read (`src/audio/types.ts:582`). Only a manual per-track offset exists (`src/audio/types.ts:519`). |
| Plugin parameter automation discovery | Not implemented | No native parameter enumeration. |
| Plugin preset and program management | Not implemented | No plugin presets. LOAD lists built-in device presets. |
| Plugin multi-output support | Not implemented | Buses and sidechains are open in decision doc gate 5. |
| Plugin MIDI input/output routing | Partial | MIDI reaches proxy instruments (`src/vst/VstPluginDevice.ts:277-279`). No MIDI output from plugins and no native routing. |
| Plugin validation and blacklisting | Partial | Format and architecture flag only. No load-time validation (decision doc). No blacklist. |

### Critique section 6: AI and sample workflows

| Item | Status | Evidence |
| --- | --- | --- |
| Local text-to-audio synthesis | Not implemented | No route. |
| Text-to-MIDI composition with validation | Implemented · unverified | Local assistant writes and transforms notes in a pattern or clip (`shared/localAi/assistant.ts:38`). Actions are validated (`:107-120`). Needs a local Ollama model; not run. |
| Automatic sample tagging by instrument and timbre | Not implemented | Library categories come from curated product metadata (`server/vst/knownPlugins.ts`), not audio analysis. |
| Similarity-based sample search | Not implemented | No feature index or similarity search. |
| Stem separation quality selection | Not implemented | One model, hard-coded `htdemucs` (`server/routes/separationRoutes.ts:57`). |
| Batch stem separation queue | Not implemented | One file per request (`server/routes/separationRoutes.ts:93-105`). |
| Automatic loop and one-shot classification | Not implemented | Tempo and transient detection only (`src/audio/clips/audioStore.ts:128, 173`). |
| AI-assisted vocal cleanup | Partial | Monophonic DSP pitch correction (Phase 8 row). The AI part proposes a vocal chain; it does not analyze audio. |
| AI drum replacement from transient analysis | Partial · uncommitted | Drum onsets become kick, snare and hat notes on a kit track (`shared/transcription/transcribe.ts`, `src/audio/ai/stemNotes.ts`, called from `src/components/browser/SampleBrowser.tsx`). |
| Automatic sample mapping into multisamplers | Partial | The pack tool maps SFZ and recipes by key and velocity (`scripts/instruments/`). Keys mode maps one file with root detection; kits take one file per pad. No in-app folder-to-zone mapping. |

### Critique section 7: project management and collaboration

| Item | Status | Evidence |
| --- | --- | --- |
| Project dependency and missing-media report | Partial | Missing audio is counted on open and can be replaced (`src/project/ProjectManager.ts:218, 346, 354, 501-507`). No pack or plugin report. |
| Collect-all-and-save project packaging | Implemented · tested | `.unbox` archive test restores an SF2 project (2026-10-28 entry in `docs/PHASE_0_AUDIT.md`). Library packs are referenced by type, not bundled. |
| Automatic project backup rotation | Implemented · unverified | Automatic versions every 10 minutes, last 20 kept (`src/project/ProjectManager.ts:63, 74, 420-424`). Stored in IndexedDB, not on disk. |
| Project snapshots and branch comparison | Partial | Named versions exist. No branches or comparison. |
| Cross-platform project portability | Partial | `.unbox` is a portable file. The desktop build is a Windows-only portable exe. |
| Collaborative project exchange | Not implemented | Manual `.unbox` file exchange only. |
| Session notes attached to timeline markers | Not implemented | `src/audio/time/MarkerRegionManager.ts` has no note field. |
| Project-wide search for tracks and devices | Not implemented | Ctrl+K searches commands and sections (`src/App.tsx:527-533`). The `tracks` and `devices` props are never used (`src/components/CommandAndStageOverlays.tsx:20-21, 43-44`). |
| Crash recovery with transaction-safe saves | Implemented · tested | `npm run test:browser-project-recovery` covers existing-project and interrupted-new-project recovery. No power-loss or mid-write test. |
| Project version migration tests | Partial | Migration logic is referenced in `src/audio/AudioEngine.ts`, `src/audio/types.ts` and `src/audio/sequencer/model.ts`. No migration test in `tests/` or `scripts/`. |

### Critique section 8: performance and platform

| Item | Status | Evidence |
| --- | --- | --- |
| Multicore DSP scheduling | Not implemented | One shared Web Audio graph. No worker-based DSP. |
| CPU overload and dropout diagnostics | Not implemented | No in-app meter. `bufferUnderruns` is declared and never incremented (`src/audio/AudioEngine.ts:345`). Gap and load numbers exist only in the soak probe. |
| Audio engine profiling | Not implemented | No profiler or performance marks in `src/`. |
| Hot-plug audio device recovery | Partial | MIDI rebinds on state change (`src/audio/midi/MidiInput.ts:100`). No audio-device change listener. |
| Sample-rate changes without project corruption | Unverified | No probe. Project files record no sample rate. |
| High-DPI and multiple-monitor testing | Not implemented | No probe in `tests/` or `scripts/`. |
| Automated UI accessibility testing | Partial | Two probes (see Accessibility row). Not in CI. |
| Offline rendering determinism | Partial | Live-versus-offline parity probes for selected devices (`tests/browser/live-offline-audio-parity.ts`). No test renders one project twice and compares the bits. |
| Memory leak detection under extended sessions | Partial | Heap recorded at start and end and reported, not asserted (`tests/browser/device-soak.ts`). Chromium only. |
| Automated audio regression tests | Implemented · tested, run by hand | 43 unit-test files; `npm test` recorded at 129/129 (2026-10-28). About 50 `test:browser-*` probes. No CI. |

### Development order (critique section 3)

| Item | Status | Evidence |
| --- | --- | --- |
| P1 · VST3 hosting | Not implemented | See critique section 1 above. |
| P1 · Time-stretching | Not implemented | See critique section 1 above. |
| P1 · Hardware I/O verification | Partial | See critique section 1 above. |
| P1 · Latency compensation testing | Partial | Manual per-track offset (`src/audio/types.ts:519`). Recording latency uses `baseLatency` and `outputLatency` (`src/audio/recording/RecordController.ts:118-119`). No plugin delay compensation and no latency test. |
| P1 · Crash recovery | Partial | Project-level recovery is tested. No audio-engine or plugin crash recovery. |
| P1 · Audio regression tests | Implemented · tested, run by hand | See the automated audio regression tests row above. |
| P2 · Elastic audio | Not implemented | Repitch only. |
| P2 · Take comping | Partial | Audio takes: range comp within one clip (`src/components/sequencer/arrangement/AudioClipPanel.tsx:185-198`; `src/audio/sequencer/editor.ts:494-515`). MIDI takes are separate clips with no comping (`src/audio/recording/RecordController.ts:492-512`). |
| P2 · Transient editing | Partial | Slice at detected transients, snapped to 16ths (`src/components/sequencer/arrangement/AudioClipPanel.tsx:181`; `src/audio/sequencer/editor.ts:519`). No transient shaping or per-hit gain. |
| P2 · Advanced pitch correction | Partial | Monophonic scale correction only (Phase 8 row). |
| P2 · MIDI expression | Partial | Pitch bend, CC1 and CC64 handled (`src/audio/AudioEngine.ts:1445, 1467, 1470`). Channel pressure, polyphonic aftertouch and MPE are not. |
| P2 · Reliable multitrack editing | Unverified | No acceptance probe; interactive acceptance is open. |
| P3 · Synthesis, CV, modulation, presets, multi-output plugins, Combinator | Partial | Device quality and coverage open (Phases 2, 3 and 6). Multi-output plugins not implemented. |
| P4 · Real audio generation | Not implemented | See critique section 1 above. |
| P4 · Intelligent sample search | Not implemented | No similarity search; tagging is metadata only. |
| P4 · Stem workflows | Partial | One-file Demucs split; stem-to-MIDI uncommitted. |
| P4 · Automatic instrument mapping | Partial | Pack tool and keys-mode root detection; no folder-to-zone mapping. |
| P4 · AI-assisted production | Partial | Rack plans, presets, mix notes, and local note writing exist. |

### Declared but not implemented

| Field or behaviour | Where | Status |
| --- | --- | --- |
| `stretchRatio` ("0.5x to 2.0x") | `src/audio/types.ts:422` | Never read. |
| `activeTake` ("comping multi-take index") | `src/audio/types.ts:544` | Never read. |
| `pdcEnabled` ("Plugin Delay Compensation") | `src/audio/types.ts:582` | Never read. |
| `aftertouch`, `mpePitch`, `mpePressure`, `mpeSlide` | `src/audio/types.ts:333-336` | Never written or read. MPE is not implemented. |
| `bufferUnderruns` | `src/audio/AudioEngine.ts:345` | Declared at 0; never incremented. |
| `modulationContainers` (four default slots, one labelled "MPE Slide / Timbre") | `src/audio/AudioEngine.ts:361-366` | Never read in `src/`. |
| Channel pressure (0xD0) and polyphonic aftertouch (0xA0) | `src/audio/midi/MidiInput.ts`, `AudioEngine.handleMidiMessage()` | Not handled. |

### Still unverified (needs a live run or hardware)

- Physical audio output and speaker-path latency.
- Latency and dropouts on a user's machine under real load.
- Packaged exe launch and playback on a clean machine.
- Local assistant note quality (needs an Ollama model).
- Demucs separation (needs `pip install demucs`).
- High-DPI and multi-monitor layouts.

## Current checks

Latest recorded checks (2026-10-28; not re-run in the 2026-10-29 audit): `npm test` passes 129/129, `npm run lint` passes, the production build transforms 2,343 modules, and `npm run test:browser-rack-ui` passes add/patch/undo/redo/save/reload through the actual UI. The current generated reference lists 350 browser entries, 162 specs, 40 insert effects, 45 recorded packs, and 964 captured Reason Remoter rows. The Ganjo browser probe decodes and renders all 38 recorded samples across MIDI 38–72, verifies MIDI 58 round-robin alternation, and measures offline RMS 0.0512. The rack UI browser probe played MIDI 60 on the recorded CC0 guitar through the inserted stereo delay and measured a 0.0247 master peak. The simulated workstation arm + Record UI probe writes MIDI 60 at velocity 100/127 and preserves the note through IndexedDB save/reopen; a headed physical Impulse pass captured MIDI 81 at velocity 18/127 for 2.917 sixteenths and also preserved it through save/reopen. A fresh isolated share-mode web build audit passes with all 41 redistributable packs and 2,605 referenced samples/credits present, excluding four private packs, local plugin library, and stems. Chrome rendered all 108 playable instruments and 65 effects in the latest full device sweep. The targeted clarinet, Pianet/Wurlitzer, effect matrix, Scale Tune, export probes and project-owned VST3 native-process ring retain their documented limits. Physical audio-output, broader performance, musical-quality, packaged-app launch/playback, and additional hardware coverage remain open.

## References

- [Phase 0 audit and open acceptance plan](docs/PHASE_0_AUDIT.md)
- [10-phase roadmap and current status](UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md)
- [Generated app device and Reason ecosystem reference](docs/UNBOX_STUDIO_DEVICE_REFERENCE.md)
