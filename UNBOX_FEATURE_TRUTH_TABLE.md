# Unbox Studio Feature Truth Table

**Snapshot:** 2026-10-28  
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
| MIDI input and recording | `src/audio/midi/MidiInput.ts` → `AudioEngine.handleMidiMessage()` → `RecordController` | Record requests Web MIDI access when an instrument track is armed. Headed Chrome captured physical Novation Impulse 25 MIDI 81 at velocity 18/127 for 2.917 sixteenths through workstation arm + Record and preserved it through IndexedDB save/reopen. A separate simulated UI pass also preserves its test note. More keys/channels and physical audio output remain to be checked. |
| Sequencing and timing | `src/audio/time/`, `src/audio/sequencer/`, `src/nexa/StepEditor.tsx` | Shared time-map, transport, scheduler, arrangement, and pattern paths exist; full interactive acceptance remains open. |
| Rack and device catalog | `shared/rack/devices/`, `src/audio/spec/registry.ts`, legacy factories, `src/rack/` | Three-column rack, cables, players, devices, and utilities are present. The app’s original devices are not Reason Rack Extensions. |
| Effects and mixing | `src/audio/spec/engines/`, `src/audio/mixer/`, `src/audio/mastering/` | Chrome checks passed for 65/65 audio-effect bypass/power paths, 43/43 measurable processor responses and 25/25 function-specific utilities. The instrument-first full-device smoke also verified RV7000 dry bypass, power-off silence and signal recovery. Broader device quality, automation, tails and export parity remain. |
| Recorded instruments | `public/instruments/`, `shared/instruments/`, `multisample` engine | 45 packs: 38 CC0, 3 CC-BY-3.0, and 4 marked `Custom`; 41 are redistributable. New Ganjo Six-String Banjo pack has 38 CC0 recordings, 38 zones across MIDI 38–72, and two round robins on MIDI 58. Its browser test decodes all samples, checks round-robin alternation, verifies source credit and CC0 metadata, and measures offline RMS 0.0512. The CC-BY Pianet T/Wurlitzer packs and CC0 Clarinet retain their documented attribution and playback coverage. A fresh share-mode web build audit confirms all 41 redistributable packs and 2,605 referenced samples/credits are present while excluding four `Custom` packs, local plugin library, and stems. Both workstation LOAD and Devices pages have a Recorded audio only filter, with regressions verifying it excludes modeled instruments. |
| Local plugin library | `server/vst/`, `/api/vst/*`, `src/vst/VstPluginDevice.ts` | Scanning and metadata are present. Mounted items use labeled proxy DSP; native VST3 execution is not implemented. |
| Project-owned VST3 fixture smoke | `scripts/vst3/host_smoke.cpp`, `scripts/vst3/test_plugin/test_delay_processor.cpp` | Source-built delay and MIDI synth pass standalone offline host checks and Steinberg validation (47 checks each). Delay component state round-trips through `IComponent`; wrong-version, non-finite, out-of-range and truncated states are rejected without mutation, and restored gain is verified in rendered audio. This does not save plugin state in an Unbox project. |
| VST3 shared-memory transport prototype | `scripts/vst3/shared_memory_stream_host.cpp`, `npm run test:vst3-shared-memory` | A four-slot Windows native-process ring passes sample-exact paced `kRealtime` blocks for the project-owned delay and MIDI synth. The synth receives 300 note-on/off pairs at phrase-varying sample offsets. Both 2,400-block paced runs had zero one-block deadline misses; this is not Electron, an audio-device callback, or DAW integration. |
| AI assistance | `server/routes/aiRoutes.ts`, `shared/rack/localPlanner.ts`, `shared/rack/presetCraft.ts` | AI can propose rack plans, device parameters, and mix notes. The audio graph renders app-owned DSP or recordings; there is no AI waveform-generation route. |
| Music separation | `src/audio/ai/MusicSeparator.ts` | Experimental four-band DSP split with bleed; not a trained separation model. |
| Project storage and export | `src/project/`, `src/audio/render/`, `src/audio/export/` | IndexedDB project save/reopen has browser evidence for six devices, parameter state, stereo cables, metadata and a piano-roll chord. `npm run test:browser-project-recovery` verifies existing-project and interrupted-new-project crash recovery without overwriting unrelated projects, including reload from IndexedDB. Broader media, migration, export parity and packaged-app recovery checks remain. |
| C++ reference files | `docs/reference-cpp-dsp/` | Documentation headers only; they are not compiled into the application. |

## Roadmap status summary

| Phase | Evidence-backed status |
| --- | --- |
| 0 — Audit and baseline | Static inventory, build/test snapshot, reference catalog, and share-package contents are recorded. One physical MIDI recording/save/reopen path is verified; audible output, performance, and packaged-app launch/recovery baselines remain. |
| 1 — Audio engine foundation | Core Web Audio, transport, MIDI scheduling, project serialization, and test harness exist; integration and long-run verification remain. |
| 2 — Core rack and workstation | Core rack, device registry, routing, Combiner, workstation, and sequencer exist; Chrome rendered all 108 playable instruments and 65 effects. The rack UI pass verified recorded-guitar/effect insertion, stereo routing, 0.0247 master peak from a played note, single-step undo/redo, File-menu save, and reload persistence. Device-quality and target-size coverage remain. |
| 3 — Effects and utilities | Chrome verified all 65 effects preserve stereo dry bypass and power-off, all 43 processors respond to their stimulus, and all 25 utilities pass function-specific checks. The latest instrument-first sweep also verified RV7000 bypass and power recovery. Wider DSP acceptance remains. |
| 4 — Players and editing | Player, piano-roll, automation, MIDI learn, and recording paths exist; hardware and accessibility acceptance remain. |
| 5 — VST3 hosting | **Not implemented.** The current plugin library uses proxy DSP. |
| 6 — Advanced synthesis | FM, wavetable/additive, granular, modal, bowed, and West Coast engine families exist; coverage and quality are partial. |
| 7 — Instrument library expansion | 45 packs exist (38 CC0, 3 CC-BY-3.0, 4 private `Custom`), including the Ganjo banjo and FreePats Clarinet with mapped recorded performances and browser playback checks; articulation depth and breadth remain. |
| 8 — Advanced processing | A monophonic scale pitch-correction effect passes live/offline synthetic-tone tests and live tests through the bundled CC0 Bear Sax recording. MIDI 61 tuned −25 cents measured 273.35→261.77 Hz; tuned +25 cents measured 281.49→293.59 Hz. Vocal quality, vibrato/noisy/polyphonic inputs, latency, broad parity and performance acceptance remain. |
| 9 — Production hardening | Recovery regression and 10-minute browser soak exist. A fresh isolated share-mode web build passed a content audit for all 41 redistributable packs and 2,605 referenced samples/credits, excluding four private packs, the local library, and stems. The earlier share `app.asar` audit predates the latest packs; packaged launch/playback, broader recovery, accessibility, and release-candidate checks remain. |

## Current checks

Latest checks: `npm test` passes 129/129, `npm run lint` passes, the production build transforms 2,343 modules, and `npm run test:browser-rack-ui` passes add/patch/undo/redo/save/reload through the actual UI. The current generated reference lists 350 browser entries, 162 specs, 40 insert effects, 45 recorded packs, and 964 captured Reason Remoter rows. The Ganjo browser probe decodes and renders all 38 recorded samples across MIDI 38–72, verifies MIDI 58 round-robin alternation, and measures offline RMS 0.0512. The rack UI browser probe played MIDI 60 on the recorded CC0 guitar through the inserted stereo delay and measured a 0.0247 master peak. The simulated workstation arm + Record UI probe writes MIDI 60 at velocity 100/127 and preserves the note through IndexedDB save/reopen; a headed physical Impulse pass captured MIDI 81 at velocity 18/127 for 2.917 sixteenths and also preserved it through save/reopen. A fresh isolated share-mode web build audit passes with all 41 redistributable packs and 2,605 referenced samples/credits present, excluding four private packs, local plugin library, and stems. Chrome rendered all 108 playable instruments and 65 effects in the latest full device sweep. The targeted clarinet, Pianet/Wurlitzer, effect matrix, Scale Tune, export probes and project-owned VST3 native-process ring retain their documented limits. Physical audio-output, broader performance, musical-quality, packaged-app launch/playback, and additional hardware coverage remain open.

## References

- [Phase 0 audit and open acceptance plan](docs/PHASE_0_AUDIT.md)
- [10-phase roadmap and current status](UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md)
- [Generated app device and Reason ecosystem reference](docs/UNBOX_STUDIO_DEVICE_REFERENCE.md)
