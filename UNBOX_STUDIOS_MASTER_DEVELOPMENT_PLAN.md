# Unbox Studio Master Development Roadmap

**Snapshot:** 2026-10-28  
**Status:** In progress. No phase is considered complete based on feature presence alone. Acceptance requires the evidence listed for that phase.  
**Scope source:** The user’s 10-phase Unbox Studio roadmap and the current checkout. The source-backed audit is [docs/PHASE_0_AUDIT.md](docs/PHASE_0_AUDIT.md); the feature ledger is [UNBOX_FEATURE_TRUTH_TABLE.md](UNBOX_FEATURE_TRUTH_TABLE.md).

## Product and engineering constraints

- The Web Audio `AudioEngine` is the source of truth for devices, routing, transport, recording, and project state.
- Audio is rendered through Web Audio and AudioWorklets. Musical events use AudioContext time; running AudioParams are scheduled.
- Keep DSP, UI animation, and heavyweight I/O in their specified threads and existing boundaries.
- Prefer `DeviceSpec` plus a registered engine for new rack devices. Keep TypeScript strict and dependencies minimal.
- Label original DSP, recorded samples, AI assistance, plugin proxy DSP, and measured analysis truthfully.
- No AI waveform generation is part of the user’s desired audio workflow. AI assistance may control parameters or produce text; sounds must come from local DSP or appropriately licensed recordings.
- New sample content must be owned or redistributable as CC0 / CC-BY with credit. Do not sample commercial songs. Custom packs remain private and must not be treated as cleared for redistribution.
- `D:\vsr` remains read-only user content. Never execute, load, or modify plugin binaries there; only the approved scanner may read metadata/audio bytes.
- Actual Reason Rack Extensions require the Reason Rack Extension SDK and Reason host. Unbox’s original devices and VST proxy units are not Reason REs.

## Phase tracker

| Phase | Target scope | Current evidence | Status | Exit evidence still required |
| --- | --- | --- | --- | --- |
| 0 — Audit and baseline | Read-only inventory, execution-path map, audio/UI/performance baseline, broken/mock workflow audit, architecture decisions and test plan | Static execution map, generated 350-entry app reference (162 specs, 40 effects, 45 recorded packs), 964-row third-party Reason Remoter snapshot plus 93-row official Reason Studios snapshot, 129 regression tests, screenshots, a 10-minute audio soak, and a physical Impulse workstation Record/save/reopen capture (latest: MIDI 81, velocity 18/127, 2.917 sixteenths), plus package-content audits. | **Partial** | Physical audio-output checks; measured CPU/RAM/device latency; complete recovery matrix; packaged-app launch and recovery |
| 1 — Audio engine foundation | Real-time engine, MIDI scheduling and transport, typed graph, parameter/modulation model, serialization, test harness | Shared Web Audio engine, time maps, worker/look-ahead scheduler, typed device graph, project sections, 129 automated tests, IndexedDB round-trip, physical Impulse MIDI note capture and persistence, and a 10-minute browser scheduler/audio soak | **Core present; acceptance open** | Broader physical MIDI/audio integration, live/offline parity, suspend/resume, project migration/recovery, and long-run device stability |
| 2 — Core rack and workstation | Three-column rack, device registry and controls, rear patchbay/autopatch, Combiner, subtractive synth/sampler, sequencer | Rack/workstation, device registry, cables, Combiner, synth/sampler and sequencing paths; generated reference lists 350 browser entries, 162 specs, 40 insert effects and 45 recorded packs; Chrome rendered all 108 playable instruments and 65 effects; a real rack UI workflow verified recorded-guitar/effect insertion, stereo routing, 0.0247 master peak from a played note, single-step undo/redo, File-menu save, and reload | **Core present; acceptance open** | Rack behavior at target sizes; measured device audio quality and performance |
| 3 — Effects and utilities | EQ/dynamics, delay/reverb, modulation, LFO/envelopes, CV/audio routing, metering | Chrome checked all 65 audio effects for stereo dry bypass/power-off, all 43 processors for measurable response, and all 25 utility devices for their function-specific behavior. The full instrument-first sweep also checked RV7000 bypass, power-off and recovery | **Partial** | Broader frequency/dynamics response, automation, routing edge cases, offline/live parity, sound-quality and CPU review |
| 4 — Players and editing | Arpeggiator/chords, scales/step sequencing, probability, automation, MIDI learn, presets | Player engines, sequencer editors, automation lanes, MIDI learn and record controller; headed Chrome checks captured physical Impulse notes through workstation arm + Record, with the latest note (MIDI 81, velocity 18/127, 2.917 sixteenths) surviving IndexedDB save/reopen | **Core present; acceptance open** | More keys/channels, pedals/bend, accessibility and keyboard-only workflows; additional project recall cases |
| 5 — VST3 hosting | Discovery/validation, native processing/editor, state recall, sidechains, PDC, isolation/recovery | Scanner and manifest plus clearly labeled proxy DSP; project-owned VST3 effect and MIDI-instrument fixtures pass standalone audio/event probes and 47 Steinberg validator checks each. The delay fixture round-trips versioned component state. A Windows shared-memory native-process prototype checked 2,400 realtime-mode delay blocks and 300 MIDI note-on/off pairs sample by sample at 48 kHz / 128 frames, with zero one-block deadline misses; it is not Electron, device-callback or DAW integration. The latest Electron 45 utility-process retest timed out before main-process entry both inside and outside the process sandbox; the separate Node IPC control passed 2,400 blocks. Native hosting is absent from the DAW. | **Not implemented** | Measure the candidate behind Electron utilityProcess and a real audio callback, then integrate and verify real-time audio/MIDI, DAW project/controller state, editor, sidechains, PDC, crash recovery, latency, and compatibility. Fixture state and native-process transport checks do not complete this phase. |
| 6 — Advanced synthesis | FM, wavetable, granular, additive, spectral, vector, physical modeling, modular voice architecture | FM, wavetable/additive, granular, modal, bowed, formant, West Coast, and modular families are present; instrument sweep verifies basic signal presence only | **Partial** | Measured family coverage, aliasing/CPU/polyphony, modulation behavior, offline/live parity, and any missing families |
| 7 — Instrument library expansion | Piano/EP, organ/drums, guitar/bass, orchestral articulations, world mapping, licensed samples | 45 local recorded packs have source/license metadata: 38 CC0, three CC-BY-3.0, and four private `Custom` packs. The Pianet T and Wurlitzer EP200 use CC BY 3.0 recordings; upstream identifies Greg Sullivan as instrument creator and kinwie as SFZ mapper but not the sample performer. Chrome decoded all 49 Pianet and 45 Wurlitzer samples, rendered low/center/high notes and both/four velocity layers, and measured RMS 0.3281 / 0.2787. A pinned FreePats Clarinet adds nine CC0 looped recordings credited to performer Kaili Dence and recording engineer Tyler Dence. The new CC0 Ganjo Six-String Banjo adds 38 recorded samples across MIDI 38–72; the browser probe verifies every sample, round-robin alternation on MIDI 58, and offline playback. Coverage also includes concertina, acoustic/electric guitars, bass, orchestral, percussion and world material. Recorded-only filters are available in Workstation LOAD and Devices; the fresh share build keeps 41 redistributable packs and excludes the four private packs, local library, and stems. | **Partial** | Broaden instrument/articulation depth; verify provenance per source; audition velocity/round-robin/sustain layers and memory use; test packaged playback. Do not use AI-generated waveforms or uncleared song stems. |
| 8 — Advanced processing | Pitch correction, vocoder, convolution cabinet, mastering, offline stem render, optimization | `pitch_correct` passes live/offline sine tests and live tests using the bundled CC0 Bear Sax recording. On MIDI 61, the −25-cent take measured 273.35→261.77 Hz and the +25-cent take 281.49→293.59 Hz; the sine probe measured 195.98 Hz (C major), 207.62 Hz (A major), 205 Hz correction-off, and 195.99 Hz offline. | **Partial** | Validate voice/vibrato/noisy and polyphonic inputs, latency/resource limits, convolution/cabinet, stem parity and broader mastering quality |
| 9 — Production hardening | Stability, plugin matrix, migrations/recovery, accessibility, documentation, installer, release candidate | Recovery regression verifies preservation of unrelated projects through autosave, interrupted Save As recovery, and IndexedDB reload. The 10-minute browser audio soak, Electron 45 and electron-builder 26.18.1, zero-vulnerability registry audit, and earlier isolated unpacked app archive remain evidence. A fresh isolated share-mode web build audit verifies all 41 redistributable packs and 2,605 referenced samples/credits, with four private packs, the local library, and stems excluded. The earlier share `app.asar` audit predates the newest packs. Sandboxed app launch/playback remains unverified; the portable target still cannot fetch its NSIS tool from GitHub here. | **Partial** | Broader project/media recovery matrix, standard Windows launch and loopback access, portable/share package runtime checks, real plugin matrix after Phase 5, accessibility pass, release-candidate checklist |

## Device ecosystem reference policy

The generated [Unbox Studio Device & Reason Rack Extension Reference](docs/UNBOX_STUDIO_DEVICE_REFERENCE.md) separates:

1. **Devices implemented in this checkout**, derived from the device browser, `DeviceSpec` registry, legacy factories, effect catalog, and recorded-pack catalog.
2. **First-party Reason product names** preserved from the user-provided reference, with edition/availability cautions.
3. **The complete dated directory snapshot** in [docs/REASON_REMOTER_FULL_LIST.md](docs/REASON_REMOTER_FULL_LIST.md) and its machine-readable source. It includes 964 rows from 131 developers. Reason Remoter reports 253 instruments, 438 effects, and 205 utilities; counting the captured rows gives 68 players. It records directory metadata, not exhaustive product descriptions or proof of current availability.
4. **Curated third-party candidate names and functions** from the supplied seed. Official Shop or Reason manual links appear only for rows checked against those sources; other entries stay unverified. A developer’s VST3/AU product line does not prove that a specific product is a Reason Rack Extension.
5. **DSP technology categories** such as waveguide and modal synthesis, which are concepts rather than verified product names.

Regenerate both references with `npm run reference:devices`. Verify third-party format and current availability against an individual Reason Studios Shop listing before labeling that product as individually confirmed. Reason Remoter is a third-party discovery index, not a compatibility certificate.

## Verification commands

| Check | Command | What it proves |
| --- | --- | --- |
| TypeScript | `npm run lint` | Strict type check only |
| Unit/regression suite | `npm test` | The covered pure logic and simulated workflows only |
| Project crash recovery | `npm run test:browser-project-recovery` | The two named IndexedDB recovery scenarios, including preservation of unrelated projects |
| App device reference | `npm run reference:devices` | Regenerates catalog and checks catalog IDs against spec or live/restore factory paths |
| Web build | `npm run build` | Production frontend bundle compiles |
| Electron API bundle | `npm run build:api` | Desktop API server bundle compiles |
| Share build | `npm run dist:win:share` | Share-target build/pruning/package pipeline; still requires output inspection and launch test |
| Local installer | `npm run dist:win` | Windows portable package build; still requires launch, persistence, and audio checks |

A passing command proves only its stated scope. Do not mark a phase complete without its phase-specific exit evidence.

## Immediate sequence

1. Keep Phase 0’s report synchronized with implementation findings; live UI and simulated MIDI recording now have evidence. Run the physical Impulse 25 workflow and measured audio/performance checks when the controller and audio device are available.
2. Continue Phase 2/3/4 device and DSP audits with reproducible behavioral checks, fixing concrete defects instead of relying on faceplate/catalog presence.
3. Audit sample-pack provenance and per-pack licensing; keep `Custom` content out of share builds and distinguish recorded audio from synthesized DSP in the UI.
4. Continue Phase 5 from the project-owned fixture: its component-state round-trip is verified, while Electron transport, DAW project state, live latency, PDC and crash-recovery gates remain open. Keep proxy DSP labels and host status truthful until DAW integration passes those gates.
5. Only then run long-duration performance, recovery, package, and release-candidate verification for Phase 9.
