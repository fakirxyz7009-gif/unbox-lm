# Unbox Studio Phase 0 Audit and Baseline

**Date:** 2026-10-29  
**Status:** **Not complete.** Static inventory, build/test baselines, controlled UI screenshots, simulated MIDI workflows, and a physical Impulse note recorded through the normal workstation UI and saved/reopened from IndexedDB are recorded. A browser export matrix now covers the supported PCM, lossless, and compressed formats, mix/stem parity, and normalization. Physical speaker output, broader runtime performance measurements, and packaged-app recovery remain open; Export-page interaction is now verified in Chrome.

## Executive assessment

Unbox Studio is already an operating browser/Electron DAW, not a blank audio-engine project. The repository contains a shared Web Audio engine, MIDI and transport scheduling, a typed device catalog, a three-column rack, sequencing and recording, mixer processing, project persistence, offline rendering, and recorded instrument packs. Several items in the supplied roadmap therefore describe existing foundations; their completeness still needs end-to-end validation.

The largest explicit capability gap is **native VST3 hosting**. The app can scan a plugin library and mount entries as Web Audio proxy devices, but it does not load plugin binaries in a native host. The supplied Reason ecosystem list is a capability reference, not a verified compatibility or implementation list. The app uses original device names and its own DSP.

The Reason ecosystem reference now labels the directory's 24 `Reason Studios` publisher rows separately from 940 third-party rows and distinguishes those Rack Extension listings from internal Reason devices. This split follows the directory's publisher field; it is not a current availability or Reason-version compatibility audit. Reason Studios' [device catalog](https://www.reasonstudios.com/devices) and [Reason 14 Rack Extension documentation](https://docs.reasonstudios.com/reason14/working-with-rack-extensions) are linked alongside the dated directory snapshot.

Phase 0 remains open because audible hardware output, target-device CPU/latency/dropouts, and packaged-app recovery still need acceptance. The normal workstation arm + Record flow has captured a physical Impulse note and preserved it through project save/reopen. Chrome now verifies the Export-page controls and MIDI download. A separate two-instrument performance with sends to a shared reverb return produces wet stems that sum to the raw mix at 0.000% relative RMS, and the master EQ changes the offline render.

## Scope and method

- Read the supplied rack/instrument/effect/player/utility reference and current repository instructions.
- Traced feature registrations and execution paths in the client, engine, server, and persistence layers.
- Ran the project test suite, TypeScript check, frontend production build, and Electron API bundle build.
- Started the app with HMR disabled and used isolated headless Chrome through DevTools to render and switch among all three workspaces at a controlled viewport; saved screenshots under `.tmp/`.
- Audited bundled instrument metadata and decoded every bundled Ogg sample with `ffprobe`.
- Reviewed saved screenshots under `shots/`, then captured a new controlled browser smoke for all workspaces; the physical Impulse MIDI path was later checked in the follow-up below.
- Did not execute, load, or modify anything under `D:\vsr`. The vendor list in the attachment is not used as evidence of local compatibility.

## Codebase inventory

| Area | Actual entry and execution path | What the code establishes |
| --- | --- | --- |
| Web UI | `src/main.tsx` → `src/App.tsx` → `src/shell/AppShell.tsx` → workstation, rack, mixer/editor, and studio pages | React UI over one shared engine; three main workspaces and overlay pages. |
| Audio graph | `src/audio/AudioEngine.ts` → `BaseDevice`, `SpecDevice`, registered device engines, mixer and monitor | Live sound is produced by Web Audio nodes and worklets. `DeviceSpec` data and legacy device classes share the engine. |
| Rack catalog | `shared/rack/devices/` → `src/audio/spec/registry.ts` and device factories | Catalog entries map to app-owned implementations. A familiar device category or name does not establish compatibility with the corresponding Reason product. |
| Transport and sequencing | `AudioEngine.ts`, `src/audio/time/`, `src/audio/sequencer/`, `src/nexa/StepEditor.tsx` | Shared project timing, worker/look-ahead scheduling, pattern and arrangement playback, note editing, and quantized launches. |
| MIDI and recording | `src/audio/midi/MidiInput.ts` → `AudioEngine.handleMidiMessage()` → live note routing and `RecordController` | Hardware notes reach the selected instrument; recording requires the input to be connected, the intended track to be armed, and transport recording to be active (or the separate step-record mode). |
| Audio recording | `src/audio/recording/RecordController.ts`, `InputManager.ts`, `recorderWorklet.ts` | Audio input capture uses an AudioWorklet; MIDI and audio tracks share the record controller but have different capture paths. |
| Mixing and export | `src/audio/mixer/`, `src/audio/render/renderSong.ts`, `src/audio/export/` | Live mixer graph, strip processing, offline song rendering, mix/stem/MIDI export. |
| Project storage | `src/project/ProjectManager.ts`, `src/project/db.ts`, project sections registered by engine/controllers | IndexedDB projects, versions, autosave, and `.unbox` import/export. |
| Local plugin library | `server/routes/vstRoutes.ts` → scanner/manifest → `src/vst/VstPluginDevice.ts` and `proxyDsp.ts` | File discovery and metadata are real; plugin execution is **proxy DSP**, not native VST/VST3 hosting. The host status endpoint says no native host process is installed. |
| AI features | `server/routes/aiRoutes.ts`, `shared/rack/localPlanner.ts`, `shared/rack/presetCraft.ts` | Gemini can return rack plans, parameter values, and mix notes. The app's audio path remains its local DSP/sample engine; no AI route produces audio waveforms. |
| Music separation | `src/audio/ai/MusicSeparator.ts` → `SampleBrowser.tsx` | Four-band DSP split with expected bleed; source labels the feature experimental and explicitly says it is not a trained separation model. |
| Recorded instruments | `public/instruments/index.json`, `shared/instruments/`, `src/audio/spec/engines/multisample.ts` | 45 playable recorded packs. 38 are CC0, 3 are CC-BY-3.0, and 4 are private `Custom`; a fresh share-mode web build audit includes all 41 redistributable packs and excludes the `Custom` packs. |

## Roadmap coverage from source inspection

These are implementation-presence assessments, not release-completion approvals.

| User roadmap phase | Current code evidence | Audit assessment |
| --- | --- | --- |
| 0 — Audit and baseline | Existing truth table, screenshots, 129 unit tests, browser audio/MIDI/project/soak probes, live/offline recorded-organ and drum-roll parity checks, and this report | **Partial.** Static and simulated baselines exist; prior runs through the normal workstation arm + Record flow captured and reopened physical Impulse takes. A later headed retry reached live recording but received no key events; the newest retry remained at Chrome's MIDI permission prompt and did not enumerate the controller. Audible output, target-device performance, and packaged-app recovery remain. |
| 1 — Audio engine foundation | Shared Web Audio context, AudioWorklets, transport/time map, MIDI scheduling, device graph, project serialization, 129 automated tests, save/reopen, 10-minute transport, and recorded-organ/drum-roll live/offline parity probes | **Foundation present; broad export parity and hardware-output checks remain.** |
| 2 — Core rack and workstation | Three-column rack, catalog/factories, auto-patching, Combiner, subtractive/FM/wavetable/sampler families, sequencer; two fresh diagnostic-enabled instrument-first browser sweeps passed across 107 playable instruments and 65 audio effects; one earlier full run reported RV7000 silence after the sample-heavy pass, though isolated and warmed checks passed | **Core present; signal-presence coverage does not certify sound quality or feature parity with Reason devices. Keep the intermittent RV7000 report open.** |
| 3 — Effects and utilities | EQ, dynamics, delay/reverb, modulation, CV, meters, and routing engines; all 65 audio effects pass bypass/power checks, 43 processors pass an active-response probe, 25 utility devices pass function-specific behavior checks, and one rack-effect chain passes live/offline comparison | **Partial.** Mixer channel routing/mutes, DI pad/polarity, gain/stereo width, isolated patchbay routing, and selected EQ/compressor response curves have focused coverage. Across two runs, the recorded-organ → Gain Tool chain measured a 1.94–2.09% RMS difference over 640 ms with matching peaks. Broader effect/automation parity, full response coverage and performance remain open. |
| 4 — Players and editing | Player engines, piano roll, arrangement, automation, MIDI learn, recording and step tools are present; Record now requests MIDI access for armed instrument tracks; hardware MIDI recordings retain independent same-pitch notes by channel, stop-at-position behavior, channel-aware key-release/disconnect handling across ports, and the Song/Pattern destination selected at Record start | **Core present; a physical Impulse note has been captured through the normal workstation UI and saved/reopened. More controller cases, accessibility, and broader editing workflows remain.** |
| 5 — VST3 hosting | Scanner/manifest and proxy DSP exist; project-owned VST3 effect and MIDI-instrument fixtures pass standalone host smokes and 47 Steinberg validator checks. A native Windows shared-memory process probe now checks sample-exact realtime audio and MIDI across 2,400 blocks with zero one-block deadline misses; Electron app-mode startup still fails before its JavaScript entry and its utility-process probe produces no output. | **Native VST3 hosting is not implemented in the DAW.** The native probe does not exercise Electron, an audio device, a browser callback, or the DAW graph. Project-state persistence, real-time device transport, Electron integration, live hardware MIDI, editor hosting, crash isolation, and compatibility remain open. |
| 6 — Advanced synthesis | FM, wavetable/additive, granular, modal, and West Coast families exist in the engine catalog; a Chrome probe now measures a live synth LFO waveform switch | **Partial.** Presence of an engine does not prove parity, sound quality, or stress behavior for every synthesis family. |
| 7 — Instrument library | 45 recorded packs, including the CC0 FreePats Concert Harp and Ganjo Six-String Banjo; SFZ imports preserve attack/release, sticky, momentary and previous-note selectors, velocity crossfades and live CC1 layers; targeted browser probes cover the recorded packs listed in the recent follow-ups | **Partial.** The harp has 36 K. Smith performance recordings mapped across MIDI 28–102 with two velocity layers on part of the range. The Ganjo pack has 38 CC0 recorded samples covering MIDI 38–72 with two round robins on MIDI 58; its browser probe decodes and renders the pack. Broader coverage, orchestral articulation depth and sound-quality review remain open. |
| 8 — Advanced processing | Pitch shifter/harmonizer, vocoder, convolution-related processing, mastering, offline stem export, a tested unity-reconstructing heuristic four-band split, and a monophonic scale pitch-correction effect exist | **Partial.** The pitch corrector passes live/offline synthetic-tone measurements and now has a live recorded-instrument check; voice quality, vibrato/noisy inputs, broader latency and resource behavior, split-band bleed, vocoder quality and convolution/cabinet acceptance remain open. |
| 9 — Production hardening | Installer/manual, project migration code, regression suite, build scripts, IndexedDB project round-trip, a targeted crash-recovery regression, and 10-minute browser audio soak exist | **Partial.** The recovery test protects existing projects from unrelated recovery snapshots and recovers a project interrupted during Save As; packaged launch/recovery, the broader media/migration matrix, physical plugin matrix, and release-candidate verification remain open. |

The full app catalog and the supplied Reason ecosystem seed list are documented in [UNBOX_STUDIO_DEVICE_REFERENCE.md](UNBOX_STUDIO_DEVICE_REFERENCE.md). A separate [full Reason Remoter snapshot](REASON_REMOTER_FULL_LIST.md) records all 964 directory rows from 131 developers, captured 2026-10-26. The page reports 253 instruments, 438 effects, and 205 utilities; 68 players are counted from captured rows because the page does not report that category in its top-line tally. The curated external reference links 48 first-party and third-party product rows to official Reason Studios sources: 2 first-party Shop listings, 15 first-party operation-manual references (including documented Players), 23 third-party individual Shop pages, and 8 products named in official bundles. Other seed-list candidates remain unverified, and no external listing establishes compatibility with Unbox.

## Baselines captured

### Automated and build checks

| Check | Result |
| --- | --- |
| `npm test` | Latest check: **129 passed, 0 failed**. Coverage includes time maps, mixer PDC/cycle detection, shrutis/tala, voice-pool limits and finite held-voice expiry, SoundFont RIFF/hydra zone parsing and sample-assignment persistence, audio editing, armed-instrument MIDI permission and recording behavior, MIDI input-open permission/error reporting, destination stability, per-channel sustain/key-release behavior, cross-port note release/disconnect, SFZ articulations, velocity and mod-wheel fades, recipe key-range clipping, share-build file pruning, signal-reconstructing DSP split/chunk continuity, and recorded-pack licensing, attribution, mappings, sample coverage, and pinned musician-recorded sources including the new Ganjo banjo. |
| `npm run lint` | **Passed** (`tsc --noEmit`). |
| `npm run build` | Latest full production build **passed**, Vite transformed 2,343 modules and completed in 43.12 s after the Ganjo pack update. |
| `npm run reference:devices` | **Passed**; regenerated reference contains 350 browser entries, 162 registered specs, 40 insert-effect entries, 45 recorded packs, and the 964-row captured Reason Remoter directory snapshot. |
| `npm run build:api` | **Passed** (Electron API bundle). |
| Recorded pack audit | 45 pack entries (38 CC0, 3 CC-BY-3.0, 4 private); 2,609 Ogg files; sample files total 138,656,398 bytes (about 138.7 MB / 132.2 MiB), counted from the local `public/instruments/` tree. |

Frontend bundle output from the same build: audio engine **783.16 kB** (231.41 kB gzip), app entry **650.43 kB** (197.24 kB gzip), UI vendor **345.64 kB** (109.79 kB gzip), and main CSS **247.68 kB** (39.17 kB gzip). These are transfer-size indicators, not runtime CPU or memory measurements.

### UI and audio artifacts

A fresh isolated headless Chrome run switched through workstation, rack, and mixer at controlled **1600×1000** and **1280×800 CSS viewports**; all six expected workspace roots appeared, with **0 page JavaScript exceptions or console errors**. Screenshots are in `.tmp/`. A separate UI-path smoke injected note-on/off events through a simulated `Novation Impulse 25` Web MIDI input; after selecting and arming Bass, Record created a note clip (MIDI 60, velocity 100/127, held for about two sixteenths) and stopped cleanly. The status bar showed **“MIDI blocked”** before simulated permission was granted. This initial simulated workflow is code-path evidence; the physical MIDI engine path and one saved/reopened hardware take are verified in the later follow-up. The browser’s displayed sample rate and output latency are not measured loopback audio.

The screenshot status line reports **48 kHz**, **10 ms buffer**, and **40 ms output**. Those values are displayed by the app and were not independently measured during this audit. Chrome was **155.0.8059.86**. No speaker loopback, audible export audition, or device CPU/latency baseline was obtained in that UI run; the later 10-minute browser soak and physical MIDI engine round-trip are recorded separately below.

### Verification limitations

- An initial smoke attempt collided with an existing port-3000 server and HMR WebSocket port `24678`; the isolated port-3123 run succeeded with `DISABLE_HMR=true`. A temporary Chrome profile inside the project also triggered a Windows file-watch lock; it was moved outside the repository before the successful run.
- This session captured a physical Novation Impulse key event through the DAW engine after the user granted Chrome MIDI permission; the note survived project save/reset/reopen. The probe does not exercise the normal workstation UI, pitch bend/sustain hardware controls, controller firmware behavior across more keys, or another DAW holding the port.
- `npm run build` and `npm run build:api` passed; the Windows share portable package and packaged-content audit are recorded in the 2026-10-27 follow-up below.

## Documentation state

- `UNBOX_FEATURE_TRUTH_TABLE.md` is the evidence ledger for sound generation, AI-assisted features, sample provenance, plugin proxying, music separation and simulated MIDI recording.
- `UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md` follows the user’s 10-phase roadmap and records current partial/open acceptance gates. The audit does not rely on the absent `UNBOX_STUDIOS_FORENSIC_AUDIT_REPORT.md` or repeat the unverified “23 defects” claim.
- The plan describes `MusicSeparator.ts` as heuristic DSP and separates it from AI-generated audio.
- External Reason products remain separate from Unbox’s supported-device list. The full directory capture and its third-party-source limitations are documented separately; official Reason sources are linked for 48 curated product rows, and no external listing establishes Unbox compatibility.

## Architecture decisions for subsequent phases

1. Keep `AudioEngine` as the single source of truth for devices, timing, routing, transport, recording, and controllers.
2. Keep new built-in devices as `DeviceSpec` + a registered engine where practical; use focused legacy classes only when required by existing state or DSP.
3. Keep sample-accurate work in Web Audio / AudioWorklets and schedule musical events against the project time map and AudioContext time.
4. Persist controller-owned project state through `registerProjectSection`; keep machine-specific local libraries out of portable project metadata.
5. Maintain an explicit native-plugin boundary. A discovered library item remains proxy DSP until a real, isolated VST3 host exists and is tested.
6. Label recorded samples, synthesized DSP, AI assistance, proxy DSP, and heuristic analysis accurately. Do not describe a DSP approximation as a trained AI model or a native plugin.
7. Keep recordings redistributable: own recordings, CC0, or CC-BY with required credit. Do not extract samples from commercial songs.

## Phase 0 exit plan

Phase 0 can move to complete after these evidence items are captured and reviewed:

1. **Live UI:** all three workspace roots and screenshots were checked at both 1600×1000 and 1280×800 with no page errors; the MIDI page and simulated record-to-note-clip path were exercised. The physical Impulse also recorded through the normal workstation Arm + Record flow and survived project save/reopen. The Export page is now exercised in Chrome through its keyboard shortcut, codec controls, stem controls, and MIDI download; accessibility remains to be checked.
2. **MIDI workflow:** one physical key press/release, velocity, armed track, saved note clip, and IndexedDB reopen are verified through the workstation UI. Still check pitch bend, sustain, additional keys/channels, and controller reconnect behavior.
3. **Audio workflow:** browser probes cover recorded instruments, synths, drums, and effect chains. The actual export pipeline now checks WAV (16/24/32-bit float), AIFF (16/24-bit), FLAC (16/24-bit), MP3, Ogg Opus, AAC at browser-supported sample rates, a zipped dry stem, and peak/LUFS normalization. A deterministic single-organ dry stem matched its solo mix at 0.000% relative RMS error. Physical speaker output, more complex send/bus/insert topologies, and broader render parity remain open. The Export-page UI path, supported AAC choices, dry-stem selection, and MIDI download are verified in Chrome.
4. **Performance:** under a documented machine/audio-device configuration, run a repeatable 10-minute song with a fixed track/device/voice load. Capture CPU, memory, active voice count, output latency, underruns/dropouts, and UI frame responsiveness at both target resolutions.
5. **Recovery:** save, close, relaunch, and reopen a project containing MIDI, audio, a recorded pack, mixer state, automation, and rack layout; verify persistence and export parity.
6. **Packaging:** build and launch the portable local executable; separately verify that the share build omits `Custom` packs, local library previews, and private stems.

After those runs, update the results here with machine/device/browser versions, exact steps, measurements, and reproducible failures. Keep implementation status separate from measured acceptance.

## Update — 2026-10-26

- Added a source-generated device reference. Current snapshot: 330 named device-browser entries across 24 groups, 142 registered spec devices, 39 insert effects, and 26 recorded packs. It records implementation family/engine, type IDs, and recorded-pack contributor/license metadata. The generator checks catalog legacy IDs against both live creation and project-restore factory switches.
- Captured all 964 entries in the Reason Remoter directory and reconciled them with its reported total and developer count. Its page reports 253 instruments, 438 effects, and 205 utilities; the captured rows contain 68 players. The snapshot is a dated third-party discovery index; it does not certify current availability or compatibility.
- Linked 48 curated external reference product rows to official Reason Studios sources: 2 first-party Shop pages, 15 first-party operation-manual references (including documented Players), 23 third-party individual Shop pages, and 8 bundle-listed products. The bundle pages identify their included RE products. Remaining seed-list rows are explicitly marked unverified; these sources do not establish compatibility with Unbox.
- Live browser smoke: launched on isolated port 3123 with HMR disabled; captured all three workspace views at exact 1600×1000 and 1280×800 CSS viewport sizes; expected workspace roots were present and the page error log was empty. Headless Chrome showed MIDI denied before permission was simulated.
- MIDI workflow smoke: a simulated Impulse Web MIDI port was bound through `MidiInput`, a Bass track was selected and armed from the Workstation MIDI page, and recorded note-on/off events produced a note clip with the expected pitch and velocity. This simulated workflow is code-path evidence; the later physical engine and persistence check is recorded below.
- Added a **Recorded audio only** filter to the Instruments, Drums, and Samplers device pages, so recorded packs can be browsed without mixing them with synthesized or modeled DSP instruments.
- Preserved the user-provided Reason and third-party lists as research references with a per-item verification warning. The dynamic third-party directory is linked as a discovery source, not treated as an authoritative compatibility test.
- Removed the misleading `Automation Clip Modulator` from the device catalog. Actual automation is in the sequencer automation lanes. The legacy `automation_clip` type still restores through the old Subtractor compatibility mapping and is not a functional automation device.
- Post-change verification: `npm run lint` passed; `npm test` passed 25/25 (including the simulated armed-instrument MIDI record-to-piano-roll regression); the latest `npm run build` (including the Recorded audio only filter) passed in 36.14 seconds; `npm run reference:devices` generated the catalog and reported no unresolved browser entries. The catalog generator and its Shop-link checks were updated again on 2026-10-26; `npm run lint`, `npm test`, and `npm run reference:devices` passed after that update.
- The first isolated page capture was blank while Vite's HMR socket was unavailable; restarting with the documented `DISABLE_HMR=true` setting produced a successful UI render. A separate temporary Chrome profile placed inside the repo caused a Windows file-watch lock, so the successful captures use profiles under `.codex\tmp`.
- This update does not close Phase 0: live UI/audio/hardware and runtime performance baselines remain outstanding.

## Follow-up — 2026-10-26

- Fixed the Samplers page so studio-family recorded packs are included by the sampler filter. The **Recorded audio only** control now filters to recorded studio instruments, including packs whose engine id is `multisample`.
- Added focused tests for recorded-pack visibility, recorded-only exclusion of synthesized instruments, and legacy sampler inclusion.
- Fixed directory summary matching to compare whole name tokens. This removes false matches such as `Tres` inside `Spectre Spectral Delay` and `PEQ-2` inside `PEQ-213 Parametric Equalizer`; both now have no seed-derived summary.
- Regenerated the 964-row directory reference and verified its reported category/developer totals still reconcile. `npm run lint`, `npm test` (28/28 at that checkpoint), `npm run build`, and `npm run reference:devices` passed.
- Clarified the AI Combiner UI: it configures existing rack/library devices and does not create or render audio; playback sources are local Web Audio DSP, recorded packs, or visibly labeled library proxy DSP. The unused `/api/generate-sound` route was a local-recording lookup, not an AI waveform renderer.
- Traced the Impulse MIDI route in source: Web MIDI input → selected playable device → live note → armed instrument RecordController → note clip committed at stop. The controller event simulation passes; this audit did not connect a physical Impulse, so no USB/permission/driver result is claimed.
- Runtime recheck was attempted after these changes. The dev server started on port 3124, but PowerShell loopback requests were blocked by the sandbox; the Electron command exited with code 1 and left no app process/window; Chrome headless produced no screenshot. The last valid UI screenshots cover the earlier implementation. No physical Impulse 25 or audio device was available to verify.
- Fixed MIDI hot-unplug handling: the input layer now emits note-offs for notes left held by a disconnected port, releases its sustain pedal, and preserves a pitch still held by another connected input. The new simulated disconnect regression passes; the suite is now 29 tests.
- Share-build check: the share-mode Vite build and prune script passed; output contained 22 CC0 packs with 22 credit sections, no `Custom` pack directories, no local library, and no stems. The share API bundle compiled, passed `node --check`, and contains the share-only 404 for local acoustic samples. Normal local frontend and API bundles were rebuilt afterward. The portable EXE was not rebuilt or launched.
- Reconciled pack metadata against all 26 `instrument.json` files: id, name, kind, category, SPDX license, author, and source all match the index; no missing sample folders or metadata mismatches were found across 1,456 sample files. The four `Custom` Chamkila-derived packs remain flagged and private because their reuse rights are not established by this metadata.
- Tightened full-directory function matching to require both a matching developer and a whole-token product-name match. The directory still contains 964 reconciled entries; rows such as `Valley Amalgam`, `SU-27`, and `Q-FX` no longer inherit descriptions from unrelated products. Added regressions for cross-developer and numeric-name collisions.
- Made share filtering use one shared licensing predicate and added tests for all pack metadata and the exact four private pack IDs. Final checks passed: `npm run lint`, `npm test` (34/34), `npm run reference:devices`, share-mode Vite build + pruning, and local `npm run build` restoration. Share output again contained 22 CC0 packs and 22 credit sections with no `Custom` packs, local library, or stems.
- Fixed MIDI count-in capture: instrument notes played before the scheduled recording start are ignored, and the first note at/after the AudioContext start time transitions the recorder into capture. Added a regression proving count-in notes stay out of the piano-roll clip; the suite stood at 35 tests then and has since grown to 40.

## Follow-up — 2026-10-26 audio-source and verification audit

- Audited the audio and AI call paths against the no-AI-generated-audio requirement. The inspected Gemini routes produce rack plans, device parameter values, and text mix notes; no client callsite for `/api/generate-sound` existed. That legacy endpoint mapped keywords to hard-coded local files, including a Chamkila vocal chop; it has now been removed so song-derived patches go only through the private stems workflow. `MusicSeparator.ts` is a four-band DSP split, not a trained source-separation model. Synth oscillator/DSP output is algorithmic synthesis, not a generated audio model output.
- Checked the official Meta Open Sound repository for the three Meta packs. Its project README describes piano and guitar multisample collections as CC0. The nylon and steel guitar specifications describe string-by-string captures; the piano specification documents sample/key/velocity mapping but does not identify the performer or explicitly document the recording session. These sources do not say the audio is AI-generated, but performer identity remains unverified, so the catalog must not claim named musician provenance for those packs.
- Refreshed the generated reference: 964 Reason Remoter directory entries, 330 app device-browser entries, 142 registered spec devices, and 39 insert effects.
- Current local checks passed: `npm test` (35/35), `npm run lint`, `npm run build`, and `npm run build:api`.
- Tried the current app from an isolated in-app browser against a local dev server; the browser could not reach workspace loopback (`ERR_CONNECTION_TIMED_OUT`). The server was stopped afterward. This environment still provides no physical Impulse 25 MIDI result, audible loopback measurement, or current UI screenshot, so those Phase 0 acceptance gates remain open.

## Follow-up — 2026-10-26 recorded electric piano expansion

- Added the CP80 Electric Grand to the playable recorded library from [Greg Sullivan's E-Pianos collection](https://github.com/sfzinstruments/GregSullivan.E-Pianos). The collection identifies Greg Sullivan as the instrument creator, kinwie as the SFZ mapper, and CC BY 3.0 as the license; both contributors and the attribution requirement are preserved in the pack metadata and generated credits.
- The importer parsed 81 sounding SFZ regions across four velocity layers and MIDI notes 21–108, fetched only the mapped source recordings, decoded them, and wrote an 81-sample mono Ogg pack (2,811,324 bytes, 385.57 seconds; about 70.6 MiB decoded at 48 kHz float). The source cache was removed after generation.
- The source README identifies Greg Sullivan as the instrument creator and kinwie as the mapper, but does not name the recording performer. The pack is recorded sample content; the app's credits now use the neutral `Attribution` label so the project does not imply a verified performer identity.
- Fixed the SFZ importer to read ARIA `set_hdccN` / `set_realccN` defaults and interpolate fractional controller curves. The CP80's default CC 72 now produces its mapped ~101 ms release; note-off applies each zone's release while the rack Release control scales the pack. Added parser and pack regressions.
- Updated the source-generated reference to 331 app device entries and 143 registered specs. The library now contains 27 packs and 1,537 Ogg files (94,048,784 bytes): 22 CC0, 1 CC-BY-3.0, and 4 private `Custom` packs.
- Current checks passed: `npm test` (40/40), `npm run lint`, `npm run reference:devices`, `npm run build`, and `npm run build:api`.
- Share-mode frontend build and pruning passed. The result retained 23 redistributable packs, included CP80 and both credits, and removed the 4 `Custom` packs, local library, and stems; the normal local frontend build was restored afterward. This does not replace the still-missing audible hardware audition or portable EXE launch test.
- A new Chrome smoke attempt against the dev server again returned `ERR_CONNECTION_TIMED_OUT`; the server was stopped afterward. This environment still cannot provide a live UI/audio interaction or physical Impulse 25 result, so those acceptance gates remain open.

## Follow-up — 2026-10-26 VST3 host architecture

- Selected a Windows x64 process boundary in [docs/PHASE5_VST3_HOST_DECISION.md](PHASE5_VST3_HOST_DECISION.md): an isolated Electron utility process per plugin and a Node-API bridge using Steinberg's VST3 SDK. The official SDK is checked out at `third_party/vst3sdk`; a project-owned VST3 test effect and offline host smoke now build, and Steinberg's validator passes all 47 fixture tests. The smoke measures a 48 kHz stereo block render only. A local Electron probe still exits at startup with `STATUS_BREAKPOINT`, so cross-process audio, real-time transport, MIDI, PDC, state, sidechains, editor hosting and recovery remain open. Phase 5 is **not implemented** in the DAW.
- Rechecked the machine toolchain: the earlier PATH-only check missed the installed Visual Studio instance. `vswhere` found MSVC x64, MSBuild, and CMake, and a minimal C++ compile passed. No plugin binary was loaded and `D:\vsr` was not touched.
- Corrected both C++ host sketches so they explicitly fail initialization and perform no audio pass-through, plugin loading, automation, or native state recall.

## Follow-up — 2026-10-26 MIDI recording stop behavior

- Fixed transport Stop ordering: `AudioEngine.stopTransport()` now asks the recorder to finalize before it resets the playhead. `RecordController.stop()` retains the fractional sixteenth position when closing held MIDI notes, instead of flooring the stop position.
- Added a regression for a held note starting at step 1.5 and ending at step 3.75; its piano-roll duration remains 2.25 sixteenths.
- Verified `npm test` (40/40), `npm run lint`, and `npm run build`. The open Chrome window remained on `127.0.0.1:3124` with `ERR_CONNECTION_REFUSED`, so this does not verify the physical Impulse 25 or the live DAW UI.

## Follow-up — 2026-10-26 recorded-pack attribution

- The Devices page previously rendered every pack's license/source authors as “Recorded by,” which overstated performer provenance for entries such as the CP80 creator and SFZ mapper. It now labels these names as attribution, and `CREDITS.md` explains that attribution does not necessarily identify a performer.
- Added a regression guard against reintroducing the performer claim. `npm test` remains 40/40 and `npm run lint` passes; the production build passed after the UI text change.

## Follow-up — 2026-10-26 sample description provenance

- The pack catalog and its rebuild examples described the Big Rusty Drums, Osiris Piano, Growlybass, and Emilyguitar source credits as the recording performers. Their metadata identifies attribution sources but does not establish that performer role. Reworded these descriptions as sample-pack / direct-sample-pack descriptions and aligned the index, pack manifests, and source rebuild instructions.
- Updated `writeIndex()` so regenerated credits keep the attribution caveat instead of silently dropping it. The generated device reference now describes recorded audio without claiming musician identity and labels the pack column “Attribution (not necessarily performer).” The Reason Remoter page reports 964 products, 131 developers, 253 instruments, 438 effects, and 205 utilities; counting the captured rows gives 68 players, a subtotal absent from the page's top-line tally.
- Verification passed after regeneration: `npm run reference:devices`, `npm test` (40/40), `npm run lint`, and `npm run build`. These checks validate source consistency and compilation; they do not identify the musicians who performed recordings or replace the open hardware, audio, and runtime acceptance tests.

## Follow-up — 2026-10-26 MIDI recording visibility

- The MIDI recording path already created arrangement note clips, but the timeline kept selection only in local UI state, so stopping a take did not select the new clip for the piano-roll/Clip Editor view. `RecordController` now emits a framework-neutral recorded-clip reference, and mounted arrangement timelines select that clip; the recorder remains independent of React.
- Extended the MIDI recording regression to assert the completed take reports its track and clip IDs. `npm test` passes 40/40, `npm run lint` passes, and the production web build passes. This verifies the recorder event and UI compilation, not a live hardware controller session.
- A follow-up local-browser attempt on port 3126 also failed: Chrome stayed on a connection-refused page, and a direct loopback probe was denied by this environment's socket policy. The server started by this session was stopped. No live UI, audible recording, or physical Impulse 25 result is claimed.

## Follow-up — 2026-10-26 modulation DSP audit

- The CH-2 chorus/flanger started its right-channel LFO a quarter-period after the left using the oscillator's initial 440 Hz default, then changed both LFO rates to the selected setting. At typical modulation rates that produces almost no phase separation. The engine now uses synchronized sine and cosine `PeriodicWave`s, keeping the stereo modulation 90° apart as the shared rate changes; this follows the [W3C Web Audio `PeriodicWave` coefficient definition](https://www.w3.org/TR/webaudio/#PeriodicWave).
- Removed-device cleanup now stops persistent LFO/noise sources in chorus/flanger, phaser, sweeper, unison, Pulveriser, Audiomatic, Ripley, and RV-7. The shared `stopAll()` helper tolerates sources that already stopped during teardown.
- Verification for this follow-up: `npm test` passes 43/43, `npm run lint` passes, and `npm run build` succeeds. Focused tests cover quadrature setup, synchronized start, and persistent-source teardown; these source-level fixtures do not substitute for an audible stereo measurement in the running DAW.

## Follow-up — 2026-10-26 RV-7 stereo echo routing

- The RV-7 ping-pong path fed only splitter output 0 into its two-delay network. In Stereo Echoes mode this discarded right-channel input. The right splitter output now feeds the right delay while cross-feedback continues alternating echoes between channels.
- Added a routing regression that inspects both splitter-to-delay connections and the delay-to-merger channel assignments. Verification passes: `npm test` (44/44), `npm run lint`, and `npm run build`. The test verifies graph wiring, not a measured rendered impulse response.

## Follow-up — 2026-10-26 VST3 offline host fixture and baseline

- Built a project-owned `Unbox Test Delay` VST3 and standalone native host probe. One-second stereo impulses peak at the expected frames in both channels for 44.1 kHz / 127, 48 kHz / 256, 96 kHz / 511 and 192 kHz / 1024 configurations; left amplitude is 1.0 and right amplitude 0.5 in each case. The fixture allocates its sample-rate-specific delay buffer during setup, before processing. Steinberg's validator passed all 47 fixture checks. The reproducible command is `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\vst3\smoke.ps1`.
- This is offline host-fixture evidence only. The test does not connect the plugin to the Unbox audio graph or prove real-time transport, Electron process isolation, MIDI, parameters, project state, latency compensation, sidechains, editor ownership or recovery. Phase 5 remains unimplemented in the DAW.
- Adding the vendor SDK made `tsc --noEmit` traverse old JavaScript in SDK documentation and report syntax errors. Excluded `third_party/vst3sdk/**` from the TypeScript app project; app source remains type-checked.
- Current app checks pass: `npm test` (44/44), `npm run lint`, and `npm run build`. No physical Impulse 25, audible loopback measurement, or current live browser session was available for this check.

## Follow-up — 2026-10-26 desktop smoke attempt

- Started the dev server at `http://127.0.0.1:3131`; it reported that it was listening. The existing Chrome window could not reach it and ended at `ERR_CONNECTION_TIMED_OUT`. The previous local-browser attempts also failed to reach loopback, so this is still an environment-level UI access limitation rather than a successful live DAW smoke.
- Tried the installed Electron launcher and its `--version` command. Both exited with code 1 and no stdout/stderr, and the Windows app inventory showed no Unbox/Electron window. Reading the Windows Application event log was denied by the environment, so the underlying startup failure is not diagnosed.
- The VST3 native fixture smoke remains independently verifiable. No DAW UI, audible output, physical controller, or Electron utility-process behavior is claimed from this attempt.

## Follow-up — 2026-10-26 Osiris piano attribution wording

- The device-browser description said the piano recordings were “by” Versilian Studios and Karoryfer Samples, but the [source repository](https://github.com/sfzinstruments/Osiris_Piano) identifies the project and CC0 license without naming recording performers. Reworded the browser entry to describe the recorded sample pack and its mic/velocity coverage; contributor names remain in the attribution field.
- Added a regression for the browser catalog description and regenerated the device reference. Verification passes: `npm run reference:devices`, `npm test` (44/44), `npm run lint`, and `npm run build`. Performer identity remains unverified.

## Follow-up — 2026-10-26 SFZ orchestral articulation support

- The pack pipeline previously discarded all non-default SFZ `sw_last` zones, and the sampler selected zones only by key and velocity. Added an opt-in `--all-articulations` import that preserves `sw_label` metadata, carries articulation IDs into the pack manifest, and selects the active articulation from MIDI keyswitch notes in live and offline sampler playback. Default-only imports and older packs remain compatible; `sw_down`, `sw_up`, release, and legato triggers remain unsupported.
- Imported the official CC0 VSCO 2 Community Edition solo violin keyswitch program as a separate pack to preserve the existing pack ID. It contains 127 zones/samples and four articulations: sustain vibrato (C2), tremolo (C#2), spiccato (D2), and pizzicato (D#2). The source identified Sam Gossner and Simon Dalzell for recording and Elan Hickler for sample cutting; the pack preserves all three as attribution.
- The device browser lists articulation labels and MIDI keyswitch notes. Added pack-policy checks for CC0 status, all four labels, manifest/sample counts, and generated credits. Final post-pack verification passes: `npm test` (47/47), `npm run lint`, `npm run build`, and `npm run reference:devices`. Phase 7 remains partial pending broader instrument coverage and articulation review.

## Follow-up — 2026-10-26 MIDI key release and sustain

- Hardware MIDI note-offs now record at physical key release even while CC64 sustain keeps the voice audible; pedal release ends the sound afterward. Note-off uses the instrument targets captured at note-on, so changing the selected part while holding a key does not strand the original voice or redirect its recorded note.
- Added focused regressions for sustain timing and selected-target changes. Latest checks pass: `npm test` (49/49), `npm run lint`, and `npm run build` (2,335 modules, about 34 s). This remains simulated MIDI evidence; the current desktop session cannot reach its local dev server and has no verified physical Impulse 25 session.

## Follow-up — 2026-10-26 SFZ release-trigger samples

- The SFZ converter previously discarded `trigger=release` zones. It now carries release zones through draft grouping, layer/key/round-robin thinning, pack validation and serialization; the multisample engine matches release zones against the held note's velocity, articulation and round-robin selection, then starts them on note-off. Existing attack-only manifests remain valid. `trigger=first`, legato and held-keyswitch semantics continue to be reported as unsupported rather than silently treated as note-down samples.
- Added parser and pure zone-selection regressions. Verification: `npm test` (51/51), `npm run lint`, and `npm run build` passed; Vite transformed 2,336 modules and completed in 24.65 s. A manifest scan found no bundled pack currently uses a release-trigger zone, and this session could not open the local DAW in a browser, so real AudioContext behavior remains an acceptance gate.

## Follow-up — 2026-10-26 Chemnitzer concertina recording pack

- Added the CC0 Chemnitzer concertina SFZ by Josh Tomiak, with three recorded attack velocity layers and recorded release-trigger samples. The source author is credited as an attribution; the source does not establish a performer credit. [Source and license](https://tomiakchemnitzer.com/digital-instrument/).
- Imported 100 samples for MIDI notes 40–90: 75 attack zones across three velocity layers plus 25 release zones. The key-thinned map retains coverage across the full documented range; encoded sample files total 4,848,882 bytes. The pack now exercises the release-trigger data path in a real bundled instrument manifest. A live AudioContext audition and offline render comparison remain open.
- Added pack-policy regression coverage for CC0 metadata, attack/release zone counts, layer coverage, key coverage, and sample references. At that point the catalog contained 29 packs (24 CC0, 1 CC-BY-3.0, 4 `Custom`), including 25 redistributable packs.
- The 100 converted Ogg files total 267.74 seconds and about 90.08 MiB decoded at 48 kHz float, below the pack pipeline's approximate 150 MiB target. `npm run reference:devices`, `npm test` (52/52), `npm run lint`, and `npm run build` passed; the production output contains all 100 sample files.
- Live UI/audio verification remains blocked here: the browser could not reach loopback port 3124, and a direct PowerShell request failed with the sandbox's socket-access restriction. No audible playback or release-trigger timing is claimed from this check.

## Follow-up — 2026-10-26 multi-channel MIDI recording

- MIDI note lifecycle tracking preserved channel identity, but `RecordController` keyed held notes only by instrument and pitch. Same-pitch notes on separate MIDI channels could overwrite the earlier start time. The recorder now keys pending notes by instrument, channel and pitch, and MIDI note-on/off routing carries the channel through. Sustain state is also channel-specific, so one channel's pedal cannot release or hold another channel's notes.
- Added regressions for two overlapping same-pitch notes with independent durations and independent sustain release. Verification: `npm test` (54/54), `npm run lint`, and `npm run build` passed; Vite transformed 2,336 modules. The current Windows device inventory did not show a Novation/Impulse-named device, and the live app remains unreachable through this sandbox, so this is code-path evidence rather than a physical Impulse test.

## Follow-up — 2026-10-26 cross-port MIDI note release

- `MidiInput` previously suppressed a note-off whenever another connected input still held the same pitch, even if that other input used a different MIDI channel. Disconnect cleanup had the same pitch-only check and could leave the first channel's instrument voice sounding. Both checks now match channel and pitch, while the keyboard UI still keeps its pitch-only held-key view.
- Added a two-input regression for normal note-off and hot-unplug with the same pitch held on separate channels. Verification passes: `npm test` (55/55), `npm run lint`, `npm run reference:devices` (333 browser entries, 145 specs, 39 effects, 964 directory rows), and `npm run build` (2,336 modules). Physical Impulse 25, live DAW monitoring and hardware permission remain unverified in this environment.

## Follow-up — 2026-10-26 SFZ momentary articulations

- The SFZ converter previously discarded all `sw_down` and `sw_up` regions. It now retains these selectors through import, zone grouping, layer/round-robin thinning and pack metadata; the multisample engine keeps switch-note state and filters attack and release zones against the state captured for each held note. The generated pack index and Devices browser expose the switch note and whether it selects while held or released. `sw_previous` and unsupported trigger types remain explicitly skipped.
- Added regressions for parser-to-zone preservation, held/released sample selection, switch-note metadata, invalid MIDI values, and key-up clearing while sustain holds the sound. Verification at that point passed: `npm test` (58/58), `npm run lint`, `npm run reference:devices`, and `npm run build` (2,336 modules). This verifies the pure selection path and the compiled AudioEngine route, not an AudioContext render; none of the then-bundled packs exercised momentary selectors. Live/offline articulation audition remains an acceptance gate. The documented behavior follows the [SFZ `sw_down` / `sw_up` definition](https://sfzformat.com/opcodes/sw_down/).

## Follow-up — 2026-10-26 momentary switch release routing

- Direct `SpecDevice.noteOff()` calls now pass through the physical key-release hook before sound release. This covers sequencer, editor audition, and other direct note paths as well as hardware MIDI; the immediate MIDI key-up hook still clears articulation while sustain delays the sounding voice's release.
- Fresh verification: `npm test` passes 58/58, `npm run lint` passes, `npm run reference:devices` regenerates 333 app entries (145 specs, 39 effects) alongside 964 Reason Remoter rows, and `npm run build` succeeds with 2,336 modules in 23.03 seconds. The AudioContext rendering and bundled-pack acceptance limitations above still apply.

## Follow-up — 2026-10-26 SFZ previous-note selectors

- The SFZ pack path now preserves `sw_previous` from parser through zone grouping and pack metadata. Matching compares the selector with the immediately preceding note-on; each voice retains that context so a release-trigger recording is selected consistently with its attack. `sw_previous=-1` is accepted as unset, following the converter's momentary-switch sentinel convention.
- Added regressions for parser-to-pack-zone mapping, selector match/mismatch, release-trigger matching and malformed values. Verification passes: `npm test` (61/61), `npm run lint`, `npm run build` (2,336 modules; 24.39 seconds), and `npm run test:browser-audio`. The browser probe loads the actual multisample engine in Chrome's `OfflineAudioContext`, selects the expected attack and release sample buffers, verifies mismatch/reset silence, and measures non-silent output (RMS 0.0850). Its synthetic test samples validate routing and rendering only; no bundled pack currently exercises `sw_previous`, so recorded-pack articulation quality and live hardware remain open. Semantics follow the [SFZ opcode reference](https://sfzformat.com/legacy/).

## Follow-up — 2026-10-26 same-channel MIDI retrigger recording

- When a keyboard sent another note-on for a pitch/channel that was still pending, the recorder replaced the earlier start and lost that note. It now commits the previous note at the retrigger position and starts a fresh note, preserving both velocities and durations in the piano-roll take.
- Added a regression for two overlapping note-ons at the same pitch and channel. Current verification: `npm test` (61/61), `npm run lint`, and `npm run build` (2,336 modules; 24.39 seconds). The hardware device itself was not connected for this run.

## Follow-up — 2026-10-26 Virtuosity Drums performer recording pack

- Added the compact Virtuosity Drums SFZ program as a CC0 recorded kit. The upstream source identifies drummer Austin McMahon as the performer, separately from Versilian Studios and Karoryfer Samples as the library makers. The pack keeps 11 correctly mapped pads (including the SFZ's low tom center at MIDI 41 and high tom center at 48), 90 zones and 88 encoded samples (3.49 MB); conversion used 264 source recordings (~87 MB) and retained the compact mix from the selected kit microphones. [Upstream recording and performer credit](https://github.com/sfzinstruments/virtuosity_drums), [CC0 license](https://github.com/sfzinstruments/virtuosity_drums/blob/master/LICENSE).
- Updated the generated instrument index/catalog and credits, and added a regression for licensing, the performer attribution, pad mapping, zones and sample coverage. No commercial track or song stem was sampled. Current checks pass: `npm test` (59/59), `npm run lint`, `npm run reference:devices` (334 browser entries, 146 specs, 30 packs) and `npm run build` (2,336 modules, 23.28 s). The build output contains the new pack's 90 zones and 88 samples. The desktop test inventory had no Unbox window; live DAW and MIDI audition remain open.

## Follow-up — 2026-10-26 project-owned VST3 MIDI instrument smoke

- Added a source-built VST3 MIDI-synth fixture and a standalone native host probe. The probe sends a note-on at sample 5 and a matching note-off at sample 20, then verifies every rendered sample for timing, 440 Hz pitch, velocity, stereo equality and release silence. This fixture is a simple sine used only to test host event delivery; it is not added to Unbox's instrument catalog and is not an AI audio model.
- The combined VST3 smoke passes the existing project-owned stereo delay at four sample-rate/block-size pairs, the new MIDI event render, and Steinberg's validator (47 checks per bundle). `npm test` (61/61), `npm run lint`, and `npm run build` (2,336 modules) also pass. Native plugins still are not hosted in Unbox; Electron transport, live hardware MIDI, state, PDC, sidechains, editors and crash recovery remain open.

## Follow-up — 2026-10-26 workstation MIDI recording guidance

- The workstation MIDI page now reflects Web MIDI connection and permission changes, lists connected controller names, and surfaces blocked/unsupported states. Its recording instructions distinguish Song-mode piano-roll capture (arm the part and use transport Record) from Pattern-mode writing (which updates the active pattern).
- Verification after the UI change: `npm test` passes 61/61, `npm run lint` passes, `npm run build` succeeds with 2,336 modules, and `npm run reference:devices` regenerates 334 app entries (146 specs, 39 effects) plus the 964-row Reason Remoter snapshot. `npm run test:browser-midi` started its isolated Vite server, but headless Chrome exited during Crashpad startup before producing a page result. The browser MIDI probe is therefore unverified in this environment; the physical Impulse 25 is also still untested. These Phase 0/4 acceptance gates remain open.

## Follow-up — 2026-10-26 SFZ velocity-crossfade fidelity

- The SFZ importer and recorded-pack engine now preserve `xfin_lovel` / `xfin_hivel`, `xfout_lovel` / `xfout_hivel`, and gain/power fade curves. The pack-zone selector skips a layer at an exact zero-gain edge, avoiding a silent voice allocation during overlap fades.
- Verified the current Meta Piano pack as 352 CC0 mono recordings covering MIDI 21–108 in four overlapping velocity layers. The generated device reference describes the pack and its crossfades; attribution identifies the collection creator and does not invent an individual performer.
- Added regression coverage for SFZ parse → pack conversion, equal-power overlapping layers, zero-gain edges, invalid metadata, and the pack's full note/layer coverage. Current checks pass: `npm test` (65/65), `npm run lint`, `npm run build` (2,336 modules, 23.95 s), and `npm run reference:devices` (334 browser entries, 146 specs, 39 effects, 30 recorded packs, 964 directory rows).
- Inspected the available desktop windows after the build: Chrome was showing a stale MIDI-probe URL that refused the connection, and no Unbox Studio window was running. The current physical Impulse 25, audible input/output, and browser MIDI permission remain unverified here.

## Follow-up — 2026-10-26 MIDI recording destination stability

- MIDI recording now snapshots Song vs Pattern mode when Record starts. Pattern-mode takes also keep the armed track's selected pattern id; stopping after changing the play mode or selected pattern no longer silently redirects notes. Pattern writes update the captured pattern's `steps` array even if another pattern is active at Stop.
- Added regressions for switching Song to Pattern during a take and changing the selected pattern during Pattern recording. `npm test` passes 67/67, `npm run lint` passes, and `npm run build` passes with 2,336 modules (24.30 s).
- Re-ran `npm run test:browser-midi`; Chrome exited before producing DOM output with a Crashpad helper launch failure. A minimal headless `about:blank` launch exits with `-2147483645` and no output, and this machine has no installed Edge or Firefox fallback. The physical Impulse 25 is not attached to an open Unbox window in this session, so real-hardware acceptance remains open.

## Follow-up — 2026-10-26 signal-reconstructing heuristic split

- The four-way DSP split previously boosted and overlapped estimates without a defined residual, so unity-gain recombination could change the input. Its `Other` bus is now the exact sample-wise residual after the bass, transient and center-mid estimates; summing all four buses at unity reconstructs the original stereo input.
- Extracted the deterministic processor into a pure module and added regressions for sample-wise reconstruction and chunk-boundary state continuity. The UI continues to label the result experimental, explicitly says it is not a trained separation model, and warns that the four outputs have source bleed.
- Current checks pass: `npm test` (69/69), `npm run lint`, and `npm run build` (2,337 modules, 24.45 s). The browser AudioContext path and audible blend were not tested because the local headless Chrome launch still fails at Crashpad startup.

## Follow-up — 2026-10-26 MIDI recording while instrument is silent

- Found that hardware MIDI note-on was rejected before reaching the recorder when the selected instrument was bypassed or powered off. MIDI capture now continues to armed tracks while the device remains silent; bend and modulation still do not affect a silent instrument.
- Extended the simulated Impulse browser probe to record once normally and once with the instrument bypassed. `npm test` passes 69/69, `npm run lint` passes, and `npm run build` passes (2,337 modules, 24.45 s). The browser probe could not run here because the stale Chrome tab cannot reach localhost and the dev server is blocked by the sandbox's local socket restriction. Physical Impulse 25 acceptance is still open.

## Follow-up — 2026-10-26 Fashionbass recorded instrument pack

- Added the CC0 Fashionbass pack from [Karoryfer's public source](https://github.com/sfzinstruments/karoryfer.fashionbass). Its README identifies D. Smolken as the player and mapper, describes a direct-recorded Killer KB-Simmony bass, and documents five source velocity layers and three round robins. The bundled clean mapping is thinned to three velocity layers and two round robins over MIDI 28–72; its 90 selected recordings are mono Ogg files totaling 1,736,501 bytes. The source license permits commercial and non-commercial use.
- Added a policy regression for the license, performer attribution, 90 sample files and zones, contiguous key coverage, velocity layers, round robins, and rack-device registration. Regenerated the device reference (335 browser entries, 147 specs, 39 effects; 964 Reason Remoter rows). `npm test` passes 70/70, `npm run lint` passes, and `npm run build` passes (2,337 modules, 24.71 s); the built web output contains the manifest and all 90 Ogg files.
- The real AudioContext audition and live/offline comparison remain open because this session cannot reach the local DAW in a browser. No audible quality claim is made from the pack conversion alone.

## Follow-up — 2026-10-26 browser sampler and MIDI integration probes

- The headless Chrome runner now bypasses the machine proxy for its localhost Vite server and keeps GPU audio processing enabled. Disabling GPU caused Chrome's offline sampler probe to stall when its WaveShaper used 2× oversampling; with the app DSP unchanged, the corrected runner renders the attack and release samples and measures RMS 0.0850.
- The browser probe server now prebundles React. Its prior `noDiscovery`/empty-include setup delivered React's CommonJS entry to the browser, so `AudioEngine` failed to import `useSyncExternalStore`. The MIDI browser probe now runs against the real AudioEngine, records note-ons/offs into the piano-roll clip, and passes with both normal and bypassed instrument audio. Its overdub assertion checks the note across clips because the recorder correctly merges it into the existing note clip.
- These are simulated Web MIDI and headless OfflineAudioContext results. The physical Novation Impulse 25, live output latency, and audible monitoring remain unverified.
- Verification: `tests/browser/multisample-engine.ts` passes with the expected selected attack/release buffers and RMS; `tests/browser/midi-recording.ts` passes both recording takes. Chrome must be launched with the local permissions available to the direct PowerShell runner in this environment; plain `npm run test:browser-audio` can fail at Chrome Crashpad startup before page execution.

## Follow-up — 2026-10-27 legacy sound endpoint and provenance

- Removed the unused `/api/generate-sound` endpoint after the Phase 0 audio audit found that its keyword lookup could serve a hard-coded Chamkila vocal chop from the local song-stem folder. The route did not call Gemini and had no client callsite, but it bypassed the instrument-pack provenance rules. Local stems remain private user content; share builds remove them.
- Added a route-registration regression proving the audio lookup is not exposed, updated the reference/truth table and `AGENTS.md`, and rebuilt the Electron API bundle. Verification: `npm test` (71/71), `npm run lint`, `npm run build`, and `npm run build:api` pass. This does not certify rights for any private local stem or custom pack.

## Follow-up — 2026-10-27 share-build pruning regression

- Extracted the share-build pruning operation so the real CLI and a temporary-directory test call the same function. The test verifies that local previews, song stems, `Custom` pack samples and their credit section are removed, while CC0 files and credits stay in place; it does not touch the actual `dist/` build.
- Verification: `npm test` (72/72), `npm run lint`, and `npm run reference:devices` pass. Current instrument bundle audit: 31 packs, 1,942 Ogg files, 112,762,970 bytes.

## Follow-up — 2026-10-27 share portable packaging

- Built the Windows portable share package into the isolated `release/share-validation/` directory so existing release artifacts were preserved. The updated `Unbox-Studio-Share.exe` is 187,280,661 bytes.
- Audited its packaged `app.asar`: 8,201 entries; the current UI bundle and all 27 redistributable instrument packs are present; `dist/library`, `dist/stems`, and the four non-redistributable pack IDs (`tumbi-folk`, `dholak-folk`, `chamkila-harmonium`, `chamkila-vocal`) are absent.
- Fixed `scripts/electron-builder-share.cjs` to emit the documented `Unbox-Studio-Share.exe` name. The first share packaging attempt exposed that mismatch by emitting `THE-UNBOX-APP-Share.exe`.
- Restored the normal production `dist/` and non-share Electron API bundle with `npm run build` and `npm run build:api`. Packaging completed without a code-signing identity; this verifies buildability and packaged contents, not Windows reputation or signed-installer behavior.
- A separate isolated launch attempt of the unpacked Electron app exited with Windows status `0x80000003` before exposing a renderer. Reading the Windows Application log was denied, so the packaged app's runtime startup remains unverified despite successful assembly.

## Follow-up — 2026-10-27 MIDI permission bootstrap

- Removed the automatic `requestMIDIAccess()` call from app startup. The user now chooses **Connect MIDI** from the transport, Settings or Workstation MIDI page before the browser asks for controller access; the idle state says **Connect MIDI** instead of implying it is already scanning.
- Added `npm run test:browser-midi-bootstrap`. The real app UI probe confirms zero MIDI permission requests at startup, then one request after clicking Connect MIDI. The existing `npm run test:browser-midi` recording probe still passes with normal and bypassed instruments.
- Windows currently enumerates Novation Impulse endpoints through `pnputil`. This confirms OS device presence only; no physical key press has been observed arriving in the app, so the hardware-to-piano-roll acceptance gate remains open.
- Verification: `npm test` (72/72), `npm run lint`, `npm run test:browser-midi-bootstrap`, and `npm run test:browser-midi` pass. The browser probes use a fake MIDI access object for bootstrap and simulated note messages for recording; neither substitutes for a physical performance test.
- Rebuilt and re-audited the isolated share portable package after the MIDI permission change; restored the full local `dist/` and non-share API bundle afterward.

## Follow-up — 2026-10-27 Electron fixed-port retry lifecycle

- Found that each `EADDRINUSE` attempt left its error listener attached to the shared HTTP server. If multiple preferred ports were occupied, one later error could trigger multiple concurrent retries and destabilize Electron startup.
- Moved the retry helper into a focused module, detach each attempt's listeners on success or failure, and resolve the actual bound port. Added a regression that occupies two candidate ports and checks the ephemeral fallback binds once without stale listeners.
- Hardened the static-only desktop fallback's file resolution: malformed percent escapes and NUL paths return 400, while `..` traversal (including encoded backslashes) and sibling-prefix paths return 403. Both security checks use the real helper called by Electron.
- Verification: `npm test` (76/76), `npm run lint`, `npm run build` (2,337 modules), and `npm run build:api` pass. These tests exercise path resolution and loopback port selection; they do not establish that the Electron executable starts in this environment.

## Follow-up — 2026-10-27 offline share-package refresh

- The share build and pruning completed. Pointing Electron Builder at the installed Electron runtime avoided its missing Electron download; the `dir` target produced an updated unpacked app under `release/share-validation-offline/win-unpacked`. Its `app.asar` has 8,203 entries, includes the port-retry and safe-path helpers plus their Electron call sites, and excludes `dist/library`, `dist/stems`, and the four private packs. This validation build disables executable resource editing and signing.
- The portable wrapper could not finish because Electron Builder also needs its `winCodeSign` and NSIS tools from GitHub; DNS/network access to GitHub is unavailable here. The pre-existing share portable executable was preserved and is not refreshed with this change. Full local `dist/` and the non-share API bundle were rebuilt afterward.
- The archive/content check passes, but desktop launch approval timed out before a GUI window opened. This does not establish successful desktop startup or a refreshed portable executable.

## Follow-up — 2026-10-27 SFZ CC crossfades and Bear Sax

- At this stage, the SFZ importer baked controller-driven `xfin` / `xfout` fades at the file's default controller state (or the importer's explicit `--cc` override), and the sampler did not follow live CC1 changes during a held sax note. The later live-CC1 follow-up below adds an opt-in dynamic path for future SFZ imports while leaving existing bundled packs unchanged.
- Added Bear Sax from the [upstream CC0 repository](https://github.com/sfzinstruments/karoryfer.bear-sax), whose README describes recordings of a 1926 Conn baritone saxophone. The repository does not name the performer, so attribution is to Karoryfer Lecolds without a performer claim. The pack has five named keyswitch articulations, 187 zones, 141 Ogg samples, MIDI range 40–68 and 3,967,460 encoded bytes.
- Added `npm run test:browser-recorded-pack`. Chrome decoded all 141 files through the actual multisample engine, selected sustain and staccato samples via keyswitches, and rendered non-silent OfflineAudioContext output. RMS ranged from 0.0351 to 0.0396 across runs as the staccato round robin changed. This confirms the bundled sample and selector path; it does not verify live monitoring, expressive CC1 dynamics or physical MIDI hardware.
- Replaced the detached `--dump-dom` Chrome harness with an in-process Vite + Playwright runner after the previous runner failed before the page result was available. All four browser probes pass with loopback access: multisample engine (RMS 0.0850), simulated MIDI recording, MIDI permission bootstrap and Bear Sax recording playback. `npm test` passes 81/81, `npm run lint`, `npm run reference:devices` (336 app entries, 148 specs, 39 effects, 964 directory rows), `npm run build` (2,337 modules) and `npm run build:api` pass. The physical Impulse 25 and live hardware playback gates remain open.
- Built and pruned a share-mode web build, then verified it retained all 28 redistributable packs including Bear Sax's 141 samples while excluding the four private packs, in-app library and stems. Restored the full local web build afterward; the portable Windows wrapper was not refreshed in this follow-up.

## Follow-up — 2026-10-27 instrument/effect AudioContext sweep

- Added `npm run test:browser-devices`, which sequentially instantiates all 95 cataloged playable instruments and 64 cataloged audio effects in the app's real shared Web Audio context. It triggers each instrument's default note (or first pad) and feeds each effect a 440 Hz tone, checking the audio outputs with Web Audio analysers. All 159 device cases passed with measurable signal.
- The sweep found that the legacy Tumbi, Dholak, Harmonium, and vocal sample loaders requested `/stems/Playable_Patches/...`, while the local recordings are served from `/stems/daw_instruments/Playable_Patches/...`. Corrected the paths in `TumbiDevice.ts` and `SoundFontEngine.ts`; the rerun passed with no browser HTTP errors. These are existing private local recordings and remain excluded from the share build.
- The longer probe also uncovered a Playwright runner bug: the 300-second timeout was passed as the optional function argument, leaving the default 30-second timeout in force. Corrected `waitForFunction` to pass the timeout in its third parameter.
- Verification: `npm test` (81/81), `npm run lint`, `npm run build` (2,337 modules), `npm run build:api`, `npm run test:browser-devices`, `npm run test:browser-audio` (RMS 0.0850), `npm run test:browser-midi`, `npm run test:browser-midi-bootstrap`, and `npm run test:browser-recorded-pack` (187 zones, 141 decoded samples, non-silent offline output) pass. The sweep verifies construction and basic signal presence only; it does not assess musical sound quality, every control, CPU/dropouts, physical MIDI, exports, or sustained playback.
- Phase 0 remains open. The physical Impulse 25, audible system output, project save/reopen, export parity, runtime latency/load and packaged-app startup/recovery still require separate acceptance runs.

## Follow-up — 2026-10-27 ten-minute sequencer/audio soak

- Added `npm run test:browser-soak` to exercise the actual AudioEngine scheduler for 600 seconds with Meta Piano, Bear Sax, Subtractor and Redrum patterns; Bear Sax runs through the app's delay → reverb → master cable graph. The probe samples master levels once per second, transport position, a zero-output AudioWorklet frame counter, Chrome long-task entries and available JS heap measurements.
- The first version compared song position with `performance.now()` and reported 2.85% drift. The revised probe compares song position with `AudioContext.currentTime` and reports wall-clock skew separately. The repeated full run passed at 600 seconds: song/context drift 0.000%, song/wall drift 4.24%, non-silent master signal in 600/600 one-second samples, maximum AudioWorklet frame interval 176.0 ms, zero intervals over 500 ms, one 173 ms main-thread long task, and +3.7 MB observed JavaScript heap. A 60-second diagnostic also passed with 0.000% song/context drift and 0.29% audio-vs-wall clock delta.
- This measures the shared browser Web Audio graph and scheduler on this Windows machine. It does not measure the physical output device, audible speaker path, real-time CPU utilization, hardware MIDI, export parity or the packaged Electron runtime. Initial pack loading and graph assembly occur before the 600-second measurement; the test watchdog allows up to 12 minutes for setup and playback.
- The apparent 2.85% transport drift was wall-clock skew in the headless run, not song-position drift against the audio engine clock. This probe does not measure the physical output device, audible speaker path, real-time CPU utilization, hardware MIDI, export parity, plugin compatibility or the packaged Electron runtime. Initial pack loading and graph assembly occur before the 600-second measurement; the test watchdog allows up to 12 minutes for setup and playback.
- Phase 0/1/9 remain partial: a headless audio soak does not replace physical Impulse 25 recording, export checks, latency/CPU measurement, plugin compatibility or packaged-app recovery.

## Follow-up — 2026-10-27 IndexedDB project round-trip

- Added `npm run test:browser-project`, which uses the actual `ProjectManager` and IndexedDB implementation in a fresh Chrome profile. It saves a project containing six rack devices, a recorded multisample instrument, parameter state, stereo instrument → effect → master cables, project metadata and a chord piano-roll clip; resets the engine; reopens the saved record; and starts transport to measure master output.
- The browser run passed. All saved state survived the reset/reopen; the arrangement produced a live master peak of 0.109, and the offline mirror rendered the reopened project with a peak of 0.130. This confirms both render paths are active but does not claim sample-exact parity, especially with a random-round-robin instrument. It does not check `.unbox` file portability, audio-file attachments, version migration, crash recovery or desktop Electron storage.
- Phase 0/1 remain partial pending physical Impulse 25 capture, audio output through the user's selected device, export parity, device latency/CPU and packaged-app acceptance.

## Follow-up — 2026-10-27 effect bypass and response matrix

- Added `npm run test:browser-effects`. It instantiates all 64 catalogued audio effects in the shared Web Audio context, checks that bypassed stereo RMS follows the dry input, and verifies that powering a device off silences its output. The full run passed with a worst bypass RMS error of 1.386%.
- For the 42 processors, a separate stereo broadband stimulus is used after bypass measurement. The probe enables the wet path, changes a relevant parameter, and compares output with the original input. The 37 general-purpose processors use an active control; the five specialized processors receive clock ticks (`alligator`, `synchronous`), gate CV (`ecf42`), non-zero transposition (`neptune`), or carrier plus sidechain signals (`bvx_vocoder`). All 42 produced a measurable response. The 22 utility-category entries are checked for bypass/power routing, not coloration. This verifies signal activity, not response curves, musical quality, or full parameter behavior.
- The 22 utility-category entries passed bypass/power behavior but were not required to color the signal; that category includes mixers, DI units, patchbays and routing devices. The probe does not certify response curves, musical quality, automation, CPU behavior or offline/live parity.
- Verification: `npm run test:browser-effects` and `npm run lint` pass. The full probe may be narrowed to one device using `-EffectType <type>` in `scripts/test-browser-audio.ps1`.

## Follow-up — 2026-10-27 specialized effect response coverage

- Extended the active-response matrix with stimulus appropriate to its five clock/gate/vocal processors: pattern ticks for Alligator and Synchronous, gate CV for ECF-42, +12 semitones for Neptune, and a broadband carrier plus sidechain for the vocoder. All five isolated runs passed.
- The complete Chrome matrix passed: 64/64 audio effects preserved stereo dry bypass and silenced their outputs when powered off (worst measured bypass RMS error 1.496%); 42/42 processors produced a measurable wet response. The other 22 utility-category entries were checked for bypass/power behavior, not coloration.
- Verification: `npm run test:browser-effects`, `npm run lint`, and `npm test` pass. The response threshold establishes that the path is active; it does not certify sound quality, response curves, automation, CPU use, or offline/live parity.

## Follow-up — 2026-10-27 Shinyguitar archtop and portable build

- Added the CC0 [Shinyguitar](https://github.com/sfzinstruments/karoryfer.shinyguitar) recording pack, crediting D. Smolken as performer and mapper. The compact pack has 64 Ogg samples in 64 zones across MIDI 40–84. CC 100 is baked at 100/127 for the pickup/microphone blend; the source README says 0 selects magnetic pickup and 127 selects microphone signal.
- Extended the SFZ importer with `--sample-root` for libraries whose sample folders sit beside the program folder. The pack build also exposed a Windows `EPERM` on renaming completed pack directories; the builder now copies the staged pack as a fallback and updates the index only after that copy succeeds.
- Added pack-policy coverage and `npm run test:browser-shinyguitar`. Chrome's `OfflineAudioContext` probe selected `0031.ogg` for MIDI 60 and rendered RMS 0.0324. The full AudioContext sweep passed for 96 playable instruments and 64 audio effects. The IndexedDB project probe now saves/reopens Shinyguitar through a stereo delay graph; the reopened arrangement rendered live peak 0.145 and offline peak 0.367.
- Built `release/phase7-validation/Unbox-Studio.exe` in an isolated output directory. Its `app.asar` has 8,658 entries and contains the Shinyguitar manifest, catalog, credits, and all 64 Ogg files. The executable is 204,193,053 bytes; its packaged launch has not been revalidated, so the Phase 9 startup/recovery gate remains open.
- Current pack audit: 33 pack entries, 2,147 Ogg files and 118,526,234 sample bytes. Verification passes: `npm test` (84/84), `npm run lint`, `npm run reference:devices` (337 app entries, 149 specs, 39 effects, 33 packs, 964 Reason Remoter rows), `npm run build` (2,337 modules), `npm run build:api`, `npm run test:browser-shinyguitar`, `npm run test:browser-devices` (96 instruments, 64 effects), and `npm run test:browser-project`.
- Phase 7 remains partial: the recorded library is broader, but the orchestral articulation system and full instrument coverage are not complete. The portable package audit confirms files are present, not that the packaged app launches successfully.

## Follow-up — 2026-10-27 Electron 45 packaging and startup

- Upgraded the desktop runtime from Electron 33 to Electron 45, within Electron's currently supported release window ([release and support schedule](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)). Upgraded electron-builder to 26.18.1 ([official release notes](https://github.com/electron-userland/electron-builder/releases/tag/electron-builder%4026.18.1)). The registry audit found vulnerable `body-parser` 1.20.8 and affected packaging-tool dependencies; updated to body-parser 1.20.9 and electron-builder 26.18.1. `npm audit --json` now reports **zero vulnerabilities**.
- `npm run lint`, `npm test` (84/84), `npm run build` (2,337 modules), `npm run build:api`, and `npm run reference:devices` pass after the dependency updates. The catalog regeneration reports 964 directory rows, 337 app entries, 149 specs and 39 insert effects.
- The current electron-builder 26.18.1 unpacked validation build is `release/phase9-electron45-check/win-unpacked`. Its `app.asar` contains 8,587 entries, the API bundle, and 2,169 Oggs (the 2,147 instrument-pack samples plus library previews). The build used `signAndEditExecutable=false`, so executable signing and icon/resource editing were skipped. The updated portable target did not finish: electron-builder could not resolve GitHub to fetch its NSIS tool (`getaddrinfo ENOTFOUND github.com`). No current portable release candidate was produced.
- Startup diagnosis is constrained by this Windows workspace's AppContainer policy. A minimal Electron 45 app with the normal Chromium sandbox exits with `0x80000003` before its JavaScript entry point. With `--no-sandbox` for diagnosis only, the minimal app reaches `app.whenReady()`. The packaged app then starts its main process and local API, but its renderer fails to load `http://127.0.0.1:47821/` with `ERR_NETWORK_ACCESS_DENIED`. No sandbox bypass is included in the product. Temporary read/execute ACL grants used to isolate this host condition were removed after testing.
- Phase 9 remains open: the standard sandboxed desktop launch, renderer loopback access, audio/MIDI startup, portable recovery, and share-package launch still need verification on a normal Windows desktop environment. This host result does not establish a product-code regression or a successful release launch.

## Follow-up — 2026-10-27 piano-roll MIDI permission on Record

- Fixed a usability gap in the Impulse 25 piano-roll recording path: starting Record with an armed instrument now calls the existing Web MIDI permission/connect flow. If permission is unavailable, recording still starts and the controller shows a message explaining that the on-screen keyboard can record instead.
- Updated the piano-roll recording instructions to describe the MIDI access prompt. Added a regression ensuring Record requests MIDI access once and preserves on-screen note recording when access is denied.
- Verification: `npm test` passes **85/85**, `npm run lint` passes, and `npm run build` passes. `npm run test:browser-midi` could not reach its local test page in this Windows sandbox (`ERR_NETWORK_ACCESS_DENIED`); no physical Impulse 25 event was observed, so hardware acceptance remains open.

## Follow-up — 2026-10-27 recorded-only instrument loading

- Added a **Recorded audio only** filter to workstation LOAD, matching the existing Devices page filter. Turning it on shows only bundled recorded-pack instrument types, removes empty categories, and keeps instrument search scoped to the filtered results; turning it off restores the full built-in catalog.
- Added regressions for recorded-pack inclusion, modeled-instrument exclusion, and full-catalog restoration.
- Verification: `npm test` passes **87/87**, `npm run lint` passes, and `npm run build` succeeds with 2,337 modules. Browser UI acceptance remains to be verified on a session that can open the local DAW page.

## Follow-up — 2026-10-27 interactive Chrome loopback retry

- Started the dev server on port 3181 and navigated a separate tab in the user's installed Chrome to both `127.0.0.1:3181` and `localhost:3181`. Both timed out while the server reported that it was listening; this confirms the current Windows session cannot use its browser for local DAW acceptance. The test server was stopped and the temporary tab closed. No app or user project state was changed.
- Earlier headless browser probes still provide offline engine and simulated MIDI evidence, but they cannot establish a real physical Impulse 25 capture while this loopback restriction persists.

## Follow-up — 2026-10-27 VST3 utility-process transport probe

- Added `npm run test:vst3-boundary`, a diagnostic-only Electron app that writes 2,400 timed 128-frame stereo blocks at 48 kHz to a shared-memory ring; an Electron utility process applies a gain and returns a checksum. The probe asserts all blocks were processed and the ring did not overflow.
- The bounded launcher returned `ETIMEDOUT` after 15 seconds with no Electron app or utility-process output. JavaScript syntax checks pass, but this host run provides no evidence that `utilityProcess` or shared memory works here. The command uses `--no-sandbox` only for this diagnostic; no product launch setting changed. Phase 5 remains unimplemented in the DAW.

## Follow-up — 2026-10-27 VCSL Pipe Organ recorded instrument

- Added a real recorded pipe-organ instrument from the [official VCSL sample set](https://github.com/sgossner/VCSL/tree/master/Aerophones/Edge-blown%20Aerophones/Pipe%20Organ). The source metadata names Simon Dalzell of Ivy Audio as the recordist (Winter 2015–16) and grants redistribution permission; VCSL is CC0. See the [VCSL license and format page](https://versilian-studios.com/vcsl/).
- Built a compact pack from 21 Man 3 Open recordings across C1–C6, with detected sustain loops. The Ogg samples occupy 2,121,901 bytes. The pack appears as `rec_vcsl_pipe_organ` in Recorded Instruments; no AI waveform generation is involved.
- Added `npm run fetch:instrument:vcsl-pipe-organ` to recreate the ignored source cache. It pins SHA-256 for all 21 WAV files and `Info.txt`, verifies WAV headers and the attribution/redistribution statements, then downloads only those source assets.
- Added recipe `keyRange` support so zones stop at the recording's actual playable range instead of transposing indefinitely past its sample anchors. Added clipping and invalid-range regressions.
- Verification: the source downloader re-fetched and hash-verified 21 WAV files and `Info.txt`; the instrument recipe rebuilt all 21 Ogg samples. `npm test` (90/90), `npm run lint`, `npm run build` (2,337 modules), `npm run build:api`, and `npm run reference:devices` (338 browser entries, 150 specs, 39 effects, 34 packs, 964 Reason Remoter rows) pass. The targeted browser probe loaded all 21 organ zones, selected `0012.ogg` for MIDI 60 and rendered offline RMS 0.0649. The full browser smoke passed for all 97 playable instruments and 64 audio effects.
- Phase 7 remains partial: this is one registration, and organ-stop controls, broader recorded orchestral coverage, physical Impulse 25 capture, and packaged-app runtime verification remain unaccepted.

## Follow-up — 2026-10-27 VSCO cello articulations

- Added a second CC0 VSCO orchestral keyswitch instrument from a pinned upstream commit: cello ensemble sustain, tremolo, spiccato, and pizzicato across MIDI 36–76. The source README credits recordings to Sam Gossner and Simon Dalzell and sample cutting to Elan Hickler / Soundemote; the importer retains the source keyswitch labels and two-way round robins. The compact pack contains 155 samples, 6.7 MB encoded and 141 MiB decoded at 48 kHz stereo.
- Added pack-policy assertions for license, source commit, all four articulation mappings, coverage of every key in range, sample-file counts and byte parity. Added a browser OfflineAudioContext probe that checks default sustain, switches to spiccato with MIDI note 86, verifies the selected recording, and requires non-silent output.
- The complete AudioContext device sweep now covers 98 playable instruments and 64 audio effects; the regenerated reference contains 339 browser entries, 151 specs, 39 effects, 35 recorded packs and 964 Reason Remoter rows. Broader articulations, live hardware capture, physical output, exports, device latency/CPU and packaged-app launch remain open.
- Verification: `npm test` passes 91/91, `npm run lint`, `npm run build` (2,337 modules), `npm run build:api`, `npm run test:browser-cello-articulations` (155 samples, default sustain and keyswitch-selected spiccato, offline RMS 0.0170), and `npm run test:browser-devices` (98 instruments / 64 effects) pass.
- An isolated share-mode production build also passed its prune audit: the cello pack and all 155 samples remain, while the four private packs, local library and stems are absent. The regular full build still contains the cello manifest and samples. This validates static package contents only; desktop launch/recovery remains open.

## Follow-up — 2026-10-27 live CC1 sample layers and audio parity

- SFZ imports can now preserve CC1 `xfin` / `xfout` layer fades as pack metadata. Unless the importer receives an explicit `--cc 1=...` override, the multisample engine uses that metadata for new and held voices through the existing MIDI mod-wheel / CV input. The source program's `set_cc1` value is the initial controller value until live CC1 arrives. This does not synthesize or generate audio; voices still play the recorded samples. Existing bundled packs without CC1 fade metadata are unchanged.
- Added pure regressions for default CC1 retention, equal-power controller fades, pack validation, and SFZ-region-to-pack-zone propagation. A browser probe injects two CC1 layers into a test response using the real pipe-organ recording, then dispatches CC1 through the DAW's MIDI message handler while MIDI 60 is held. The two voices receive opposite 0/1 gain targets and the final output RMS changed from 0.0269 to 0.0193 (-2.9 dB). The fixture does not alter the shipped organ pack or claim a real dynamic orchestral source; its analyzer level varies with the sample loop phase.
- Added a fixed-note live/offline comparison for the shipped recorded pipe organ. MIDI 60 at velocity 0.8 measured 0.1075 live post-fader peak and 0.1075 offline dry-stem peak (0.00% relative difference). This is one instrument/note/peak check, not full mix, effects, automation, or sample-exact export parity.
- Verification passes: `npm test` (93/93), `npm run lint`, `npm run build` (2,337 modules), `npm run test:browser-mod-wheel`, `npm run test:browser-audio-parity`, and `npm run test:browser-devices` (98 playable instruments and 64 effects emitted audio). Physical Impulse 25, broader live/offline parity, CC1-capable source packs, plugin hosting, and packaged-app launch remain open.

## Follow-up — 2026-10-27 Virtuosity Drums live CC1 source pack

- Rebuilt the bundled Virtuosity Drums pack from the CC0 `02-full-kit.sfz` at pinned source revision [`9f04cf9a734527edfbb0a4eee1f674e45bbf71bc`](https://github.com/sfzinstruments/virtuosity_drums/tree/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc). The source identifies drummer Austin McMahon as the performer and documents CC1 as roll dynamics. The pack now has 92 zones and 91 encoded files (5.57 MB); MIDI 96 is a separate Snare Roll pad with five recorded CC1 layers across three mic groups. Its default controller value remains the SFZ program's `set_cc1=31`. [Upstream performance and mapping](https://github.com/sfzinstruments/virtuosity_drums/blob/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc/README.md), [CC0 license](https://github.com/sfzinstruments/virtuosity_drums/blob/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc/LICENSE).
- Explicitly looped pack zones now sustain even inside a drum kit; ordinary kit zones remain one-shots. Key-up releases those sustained voices through the normal sample-envelope path.
- Replaced the previous browser test-only synthetic CC1 fixture with the shipped pack. Chrome loaded the 15 looped layer/mic voices, measured output RMS change from 0.0032 to 0.0253 (+17.9 dB) after CC1, and confirmed every voice was gone after key-up and its release tail. A same-device live/offline render comparison measured matching peaks (0.0108) and 3.06% RMS difference over the first 640 ms; the VCSL organ comparison measured 0.36% RMS difference.
- The Snare Roll Length control now truncates sustained loop playback. Browser testing exposed a voice-pool cleanup issue where a finite scheduled end was ignored while the key remained held; `VoicePool.gc()` now drops every voice at its scheduled end and retains only voices with a future (or infinite) end time. A regression covers that distinction.
- Latest verification for the CC1 pack follow-up: `npm test` (94/94), `npm run lint`, `npm run build` (2,337 modules), `npm run reference:devices` (964 directory rows, 339 app entries), `npm run test:browser-mod-wheel` (17.9 dB CC1 change, key-up release, Length truncation), `npm run test:browser-audio-parity` (0.36% pipe-organ RMS delta, 3.06% snare-roll RMS delta over 640 ms with equal roll peaks), `npm run test:browser-devices` (98 instruments and 64 effects emitted audio), `npm run test:browser-midi` (simulated MIDI recorded notes with normal and bypassed instruments), and `npm run test:browser-midi-bootstrap` (permission requested only after Connect MIDI) pass. This closes the earlier gap for one CC1 source pack; broader recorded instrument coverage, physical Impulse 25 key capture, audio-output acceptance, and live/offline checks for other packs remain open.

## Follow-up — 2026-10-27 physical MIDI probe diagnostics

- Fixed a race in the hardware browser probe: the test page now signals when its DAW module has loaded, and the runner waits for that signal before clicking Connect. It also records setup stages, failed requests, browser permission state, and the Web MIDI rejection cause.
- In headless Chrome, `navigator.permissions.query({ name: 'midi' })` reported `granted`, but `navigator.requestMIDIAccess()` rejected with `NotAllowedError: Permission to use Web MIDI API was not granted.` The probe did not reach port enumeration or capture a key. This is evidence about this headless browser run only; it does not establish that the Impulse 25 or the app's headed MIDI path is broken.
- Verification: `npm test` passes 96/96, `npm run lint` passes, and `npm run reference:devices` regenerates 964 Reason Remoter rows, 339 app entries, 151 specs, and 39 effects. The physical controller still needs a headed browser or desktop acceptance run with an actual key press/release.

- Added `npm run test:browser-midi-hardware-headed` for a visible, isolated Chrome run. Both headless and headed isolated runs report the MIDI permission state as `granted`, but `requestMIDIAccess()` rejects with `NotAllowedError` before port enumeration. No real key event was captured, so this remains an automation-context limitation until verified in the user's normal browser or desktop session.
- Re-ran the headed probe after the user connected the controller. This run reported MIDI permission state `prompt`, loaded the real recorded piano and armed its sequencer track, then waited 60 seconds for the visible Chrome permission prompt. The request remained unresolved and timed out before port enumeration or a key press; this run does not establish a hardware or recording defect. A follow-up acceptance run still needs the user to allow MIDI in Chrome and press/release one Impulse key.

## Follow-up — 2026-10-27 SoundFont provenance and importer truth

- Auditing the legacy `SoundFontEngine` found that a static “FluidR3 GM + Royal Indian Classical Bank.sf2” record was shown as loaded even though no such SF2 file was imported. Its built-in piano, tabla, bansuri, sitar, guitar, dhol and harmonium AudioBuffers are generated by app-owned DSP models. Some private local `Custom` stems replace those banks in the personal build, and the share-prune script removes them.
- Removed the fabricated preloaded SF2 metadata, renamed the built-in bank labels as physical/waveguide/string/soundboard/reed models, and corrected the Dhol/Tabla source comments. Invalid SF2 files now fail instead of being added to the loaded-bank list. Imported SF2 metadata calls extracted sample headers “samples”, not “presets”; the parser's current limits are documented.
- Added regressions for the empty initial imported-bank list and rejection of data without an SF2 RIFF header. At the time of this follow-up the parser did not reconstruct SF2 instrument/preset zones; a later follow-up added that parser. The catalog's other legacy Web Audio devices still need an implementation-by-implementation sound-source audit.
- Verification: `npm test` (96/96), `npm run lint`, `npm run build` (2,337 modules), `npm run reference:devices` (964 directory rows, 339 app entries, 151 specs and 39 effects), and `npm run test:browser-devices` (98 instruments and 64 effects emitted audio) pass.

## Follow-up — 2026-10-28 SoundFont preset import

- Replaced approximate sample-header key ranges with an SF2 hydra parser for real preset/instrument references, key and velocity ranges, sample zones, tuning, attenuation, attack/release, sample loops, and linked stereo sample pairs in the LOAD browser. A selected preset becomes a playable part; its zone audio is stored through the project audio-asset path and is included in offline renders and project archives.
- The compatibility SoundFontEngine parser now uses the same hydra interpretation. This remains sample-bank playback, not a claim that every SoundFont generator/modulator or articulation is reproduced. Volume-envelope stages and loop-release tails are mapped; the main LOAD route still omits SF2 modulators and uses an approximate envelope contour.
- Added SF2 fixture coverage for preset identity, key/velocity zones, tuning, loop markers, invalid structure, compatibility parsing, and project sample-asset references. Verification: `npm test` passed 120/120 and `npm run lint` passed. Production build/browser interaction is the next acceptance check for the new LOAD surface.
- Phase 7 remains partial: this supports user-imported SF2 content but does not verify its license or performer provenance, expand the bundled human-recorded library, or replace all modeled DSP. Keep the Recorded audio only filter for bundled recordings with documented source/license metadata.

## Follow-up — 2026-10-27 FreePats Ocarina recorded instrument

- Added a compact CC0 ocarina pack based on the [FreePats source repository](https://github.com/freepats/ocarina1/tree/241bdfde388624d9ea598ac183c3e50071c89924). Its README credits Xavimart (Javier), Gonzalo, and Roberto for the performances and recordings; the SFZ maps 12 recordings with sustain loops across MIDI 60–92. The pack preserves those credits and pins the upstream source revision.
- The generated app device is `rec_freepats_ocarina`. Its 12 Ogg recordings total 374,448 bytes. The voice uses the existing multisample engine and its loop/release behavior; this adds recorded performances, not AI-generated audio.
- Added pack-policy assertions for CC0/share eligibility, pinned source revision, contributor credits, every playable note, loop and release data, the complete sample-file set, byte totals, and the registered instrument/device config. Added a Chrome `OfflineAudioContext` probe for sample selection, exact loop markers, audible sustain, and key-up release.
- Verification: `npm test` passed 97/97, `npm run lint`, `npm run build` (2,337 modules), and `npm run reference:devices` (964 directory rows, 340 browser entries, 152 specs, 39 effects) passed. The sandbox denied the first loopback browser attempt; the reviewed local-only rerun passed, loading 12 zones and selecting `0001.ogg` for MIDI 72. Rendered sustain RMS was 0.5726 and post-release RMS was 0.0008. The broader DAW Web Audio sweep passed across all 99 playable instruments and 64 audio effects.
- Phase 7 remains partial: the pack expands recorded wind coverage, but orchestral articulations, broader instrument ranges, physical Impulse 25 capture, and packaged-app validation remain open.

## Follow-up — 2026-10-27 Electron app-mode startup diagnostic

- Added `npm run test:electron-startup`, a small Electron-only probe that records whether its main JavaScript entry loads and whether `app.whenReady()` resolves. The runner now captures stdout/stderr to `.tmp/electron-startup-probe/` and allows 30 seconds; this distinguishes Chromium startup from a utility-process failure without waiting indefinitely on inherited pipes.
- On this host, Electron 45's Node mode returned version `45.0.0`. The initial app-mode probe exceeded 15 seconds with no `main-loaded` marker. The updated probe exits with status 1 before the marker; captured stdout contains only a blank line and stderr is empty. The utility/shared-memory test previously timed out at 35 seconds with no output, including when invoked outside the sandbox. The current evidence places the startup failure before the probe's application JavaScript and does not establish that the utility process or audio transport works or fails.
- `npm run test:electron-startup` therefore remains a failing diagnostic, not a passing host test. Native hosting remains unimplemented and needs a Windows environment where Electron can reach its main entry before transport work can be measured. `node --check scripts/vst3/run-electron-startup-probe.cjs` passes.

## Follow-up — 2026-10-27 physical Impulse 25 availability check

- The current Windows app inventory contained no open Unbox Studio window, and a read-only `Get-PnpDevice -PresentOnly` query returned no device whose name or instance ID matched Novation or Impulse. No physical key press was attempted. This is a point-in-time machine observation; it does not show whether the controller, cable, driver, or DAW works when the device is connected.
- Physical MIDI capture remains unaccepted. The simulated MIDI-to-piano-roll probe is separate evidence and does not substitute for a real Impulse 25 recording.

## Follow-up — 2026-10-27 MIDI input-open error reporting

- Fixed `MidiInput.bind()` to preserve the actual input-open error. A `NotAllowedError` now reports that MIDI permission was denied while opening that input; other failures show the browser/driver message or a neutral reconnect/busy hint instead of asserting another program owns the port.
- Added a regression with a simulated permission failure. `npm test` passes 98/98, `npm run lint` passes, and the existing MIDI recording and disconnect tests remain green.

## Follow-up — 2026-10-27 function-specific rack utility coverage

- Expanded `npm run test:browser-effects` so every utility-category device is checked against its function. The final Chrome run covered 64 audio effects for stereo dry bypass and power-off, 42/42 measurable processor responses, and 25/25 function-specific utilities.
- The 12 mixer devices routed and muted every channel input; the four DI boxes demonstrated polarity reversal and the expected approximate −15 dB pad; the three stereo/gain devices demonstrated +6 dB gain or anti-phase cancellation at zero width; and all six patchbays routed In 2 to Out 1 in isolated mode, kept the unpatched output silent, and muted a route set to Off.
- The final bypass sweep reported 0.000% RMS difference with a 3% acceptance limit. The probe now waits through the bypass ramp and a full analyser window, uses coherent frequencies for bypass RMS, and uses broadband input for polarity checks. Device-specific checks avoid treating “utility” as a requirement to color audio.
- Verification: `npm run test:browser-effects` passes across the full list, `npm run lint` passes, and `npm test` passes 98/98. These checks establish routing and control behavior, not response curves, sound quality, automation, resource use, or offline/live parity. Phase 3 remains partial.

## Follow-up — 2026-10-27 rack effect live/offline parity

- Extended `npm run test:browser-audio-parity` to compare recorded VCSL Pipe Organ and Virtuosity Drums output against the offline render, with Gain Tool (+6 dB), EQ (+6 dB high shelf), compressor (-30 dB threshold), delay (250 ms, 25% feedback, 30% mix), and reverb (30% mix) inserted on the live/offline rack path. The probe awaits device readiness before playback so the live compressor worklet is active.
- Across two Chrome runs, the 640 ms RMS deltas were: organ 7.46% / 7.43%; organ → Gain Tool 2.91% / 2.73%; organ → EQ 2.10% / 2.41%; organ → compressor 2.90% / 2.98%; organ → delay 2.23% / 2.52%; organ → reverb 2.24% / 3.73%; Virtuosity snare roll 4.97% / 1.32%. Peaks matched in both runs for the EQ, compressor, delay, and reverb cases; the Gain Tool case matched at 0.2144 in both runs.
- Verification: `npm run test:browser-audio-parity` passed twice, and `npm run lint` passes. This samples selected devices, settings, notes, and the first 640 ms; it is not sample-exact parity and does not establish automation, mix-bus behavior, full effect tails, exports, response curves, or performance. Phase 3 remains partial.

## Follow-up — 2026-10-27 physical Web MIDI permission diagnostic

- Windows currently enumerates no present device whose name or instance ID matches Novation, Impulse, or MIDI. No hardware key event was received.
- In Chrome 155.0.8059.86, the headed probe reported `secureContext=true`, active user activation, document focus, and MIDI Permissions Policy allowed. A Playwright-granted `midi` permission queried as `granted`, but `requestMIDIAccess()` still rejected with `NotAllowedError`. The headed probe now uses Chrome's real permission flow instead of the CDP grant; on the first interactive run its permission state was `prompt`, and the request remained pending until the probe's former 15-second timeout.
- Increased the physical probe's MIDI permission wait to 60 seconds and added diagnostic context to its failure message. Chrome documents the user permission requirement for Web MIDI in its [permission notes](https://developer.chrome.com/blog/web-midi-permission-prompt?hl=en). The headed test must be rerun with the Impulse connected and the browser prompt accepted before physical note capture can be verified. This browser automation result does not establish that the DAW's MIDI implementation is defective.
- Verification: `npm run lint`, `npm test` (98/98), and `node --check` for the modified browser and Electron probe runners pass. `npm run test:browser-midi` also passes: simulated channel 2 MIDI records piano-roll notes with the instrument active and bypassed. Physical Impulse 25 capture remains unaccepted.

## Follow-up — 2026-10-27 measured EQ and dynamics response

- Added `npm run test:browser-effect-response`, which measures device input/output RMS in Chrome's live `AudioContext` rather than inferring response from control values. It covers PQ-2 bell gain and off-band behavior, Masterline low-cut, Channel EQ low shelf and high-pass, Tubeshelf low boost, compressor below/above-threshold behavior, and external sidechain keying.
- The response measurements passed: PQ-2 center +12.00 dB and off-band +0.21/+0.23 dB; Masterline low-cut −7.81 dB at 17.6 Hz and +0.11 dB at 205 Hz; Channel EQ shelf +10.54 dB at 59 Hz and 0.00 dB at 1 kHz; Channel EQ high-pass −11.40 dB at 59 Hz and +0.28 dB at 501 Hz; Tubeshelf +10.61 dB at 20.5 Hz and 0.00 dB at 1 kHz. The compressor measured 0.00 dB below threshold, −16.70 dB above threshold, and −0.21/−16.70 dB with quiet/loud external keys; its gain-reduction meter read −16.71 dB.
- The first response run found a device bug: the dynamics engine enabled its sidechain detector whenever a device declared a sidechain jack, even if no cable was patched. The detector then read silence and the compressor passed audio at unity. Added an explicit External SC toggle to the sidechain-capable compressor specs and defaulted it off; the response probe now covers both internal detection and external keying.
- Verification after the fix: `npm run test:browser-effect-response` passes, and the final `npm run test:browser-effects` sweep passes with 64/64 effects, 42/42 active processors, and 25/25 function-specific utilities; worst bypass RMS error was 0.006%. `npm run lint` passes, `npm test` passes 98/98, and `npm run build` succeeds after transforming 2,337 modules. This is measured coverage of selected EQ/dynamics models, not a full response or sound-quality certification. Phase 3 remains partial.

## Follow-up — 2026-10-27 Impulse 25 headed retest

- After the user said the controller could be connected, Windows' present-device query returned zero PnP entries of any class, so it did not confirm device enumeration in this session.
- The visible Chrome probe reached “confirm MIDI access” and reported `permission=prompt`, then timed out after 60 seconds while `requestMIDIAccess()` remained pending. It enumerated no ports and recorded no key event. This does not establish a DAW MIDI defect; the desktop interaction policy requires the user to accept the browser's privacy prompt themselves.
- Physical capture remains unverified until the user accepts MIDI access and presses/releases a key during the headed probe. The simulated MIDI-to-piano-roll probe continues to pass.

## Follow-up — 2026-10-27 sidechain rack-cable and offline parity

- Extended the response probe so a Gain Tool produces the external key and `audioEngine.connectAudio()` patches its output into the Masterline Compressor's `sc_l` input. The quiet/loud key measurements still pass at −0.20/−16.70 dB.
- Extended live/offline parity with a second Subtractor instrument patched to the compressor's left/right sidechain inputs. The live gain-reduction meter reached −19.29 dB; rendered live/offline peaks matched at 0.0287, and the 640 ms RMS difference was 2.28%.
- Added a catalog regression requiring every dynamics device with sidechain jacks to expose an External SC switch defaulting off. `npm test` passes 99/99 and `npm run lint` passes; the effect-response and live/offline browser probes pass. That parity case covers one keyed compressor model; automation and broader export parity remain open.

## Follow-up — 2026-10-27 dynamics sidechain family sweep

- Added `npm run test:browser-dynamics-sidechain`. For each sidechain-capable dynamics device, it feeds a quiet then loud key through a Gain Tool and actual stereo rack cables, and measures the resulting output change.
- All 11 models responded: Channel Dynamics 28.44 dB, Masterline Compressor 28.07 dB, Console Bus Compressor 12.24 dB, Distressor 2.93 dB, LA-2A 21.35 dB, 1176 11.40 dB, Portico 22.38 dB, API 2500 13.66 dB, Avalon 747 22.18 dB, Vari-Mu 19.24 dB, and WA-2A 21.28 dB.
- Verification: `npm run test:browser-dynamics-sidechain` passed 11/11 and `npm run lint` passes. This checks selected settings and one stereo key route per model; it does not certify each compressor's full transfer curve, automation, latency or sound quality. Phase 3 remains partial.

## Follow-up — 2026-10-27 synth LFO waveform control

- Code inspection found that `SynthCore.onParam('lfoWave')` returned “handled” without changing its running oscillator. Synthesizers using the shared core therefore showed a waveform control that stopped affecting audio after the device was created.
- The shared core now builds sine, triangle, saw, square and stepped-random sources once, then crossfades their gains when the waveform changes. The source graph remains stable during playback, and all sources share the same scheduled start and rate controls.
- Added `npm run test:browser-lfo-wave`, which captures the active synth's LFO signal in Chrome. Sine → Square changed the measured third-harmonic ratio from 0.004 to 0.140 and crest factor from 1.413 to 1.128.
- A 30-second post-change mixed-load soak used four instruments plus delay/reverb. It reported 0.000% song/context drift, audible signal in 100% of one-second windows, a 178.7 ms maximum render gap (none over 500 ms), two main-thread long tasks with a 200 ms maximum, and +5.7 MB observed heap. This short run is not a replacement for the 10-minute and target-resolution performance gates.
- Verification after the change: `npm test` (99/99), `npm run lint`, `npm run build` (2,337 modules), the targeted LFO probe, the full AudioContext sweep (99 playable instruments and 64 effects), and `npm run test:browser-audio-parity` pass. The parity run measured 1.33–4.13% RMS deltas over 640 ms across its eight recorded-instrument/rack cases. Broader modulation depth, rate, CV, automation and CPU/voice-scale measurements remain open; Phase 6 remains partial.

## Follow-up — 2026-10-27 vocoder envelope controls

- A source-to-catalog audit found that the vocoder advertised Attack and Decay parameters, but the DSP only read Decay; Attack had no audible effect. Replaced the single follower with separate attack and release low-pass followers whose maximum drives each band, so rising levels follow Attack and falling levels follow Decay. The frequency mapping now reaches below 2 Hz so the advertised 1-second release range is represented instead of being clamped to a short envelope.
- Added `npm run test:browser-vocoder-attack`. In the live DAW `AudioContext`, a 440 Hz carrier and sidechain key measured a 73.08× onset RMS ratio for 1 ms vs 300 ms Attack at 60 ms. After key-off, 1 s vs 10 ms Decay measured 13.43× output RMS at 100 ms. These are response checks on one vocoder model and stimulus, not a full sound-quality or parity certification.
- Verification: `npm test` passes 99/99, `npm run lint` passes, and `npm run build` succeeds with 2,337 modules. Chrome's full device sweep passed for 99 playable instruments and 64 audio effects; the effect response probe also passed for EQ, compressor and sidechain cases. Phase 8 remains partial: pitch quality, vocoder quality across settings, cabinet/convolution, latency, render parity and sustained resource limits remain open.

## Follow-up — 2026-10-27 monophonic scale pitch correction

- Added `pitch_correct` / Scale Tune Pitch Corrector as a conventional Web Audio DSP effect. A YIN-style detector tracks one pitched source; key, scale, correction amount and retune speed control a pitch-synchronous delay shifter. It does not synthesize audio with AI and is not polyphonic source separation.
- Added `npm run test:browser-pitch-correction`. The live Chrome probe measures the output spectrum and period estimate in C major, changes the target to A major, checks correction-off behavior and verifies an `OfflineAudioContext` clone. The measured 205 Hz test tone corrected to 195.98 Hz in C major and 207.62 Hz in A major; the offline clone measured 195.99 Hz. This synthetic sine test does not certify vocal timbre, vibrato tracking, noisy/polyphonic sources, or broad latency/performance behavior.
- The generated reference lists 342 browser entries, 154 spec devices and 40 insert-effect entries. The final Chrome sweep passed for all 100 playable instruments and 65 effects; all 65 effects preserved stereo dry bypass and powered-off silence, 43/43 processors responded to their stimulus, and 25/25 utilities passed function-specific checks. The clean pitch probe measured 195.98 Hz in C major, 207.62 Hz in A major, 205.00 Hz dry and 195.99 Hz offline.
- Verification: `npm test` 102/102, `npm run lint`, and `npm run build` (2,339 modules; 40.14 s) pass. The effect matrix is functional coverage, not a sound-quality certification; real vocal tone, vibrato/noise, polyphonic sources, longer sessions and latency still need acceptance.

## Follow-up — 2026-10-27 pitch correction on a recorded instrument

- Expanded `npm run test:browser-pitch-correction` to route the bundled CC0 Bear Sax recording through the live `pitch_correct` AudioWorklet, alongside its sine-wave key/scale, exact-dry and offline-clone checks. The test tunes recorded MIDI 61 down 25 cents so C4 is the unambiguous nearest C-major target.
- In the latest Chrome run, the −25-cent take measured 273.35 Hz raw and 261.77 Hz corrected; the +25-cent take measured 281.49 Hz raw and 293.59 Hz corrected. The last pitch-tracker report was MIDI 61, +73.3 cents and 1.00 confidence. This verifies both correction directions on one recorded, harmonic instrument source; it does not establish vocal timbre quality, vibrato/noisy/polyphonic tracking, latency, or performance limits.
- Verification: `npm run test:browser-pitch-correction` passes with the synthetic-tone, exact-dry, offline-clone and recorded-sax assertions. The first sax run exposed an invalid test assumption: in-tune C# is exactly midway between C and D in equal temperament, so the probe detunes the source by ±25 cents to give each direction an unambiguous nearest target.

## Follow-up — 2026-10-27 physical Impulse piano-roll recording

- With the Novation Impulse 25 connected, the headed Chrome probe requested Web MIDI permission; after the user allowed access, Chrome enumerated `Novation Impulse` and `MIDIIN2 (Novation Impulse)`. The DAW started the armed recorded piano and captured a physical note-on/note-off as a piano-roll note.
- Result: MIDI note 79, velocity 76/127, channel 1, duration 2.667 sixteenths. The browser probe verified the event reached the MIDI input, the recorder committed the corresponding note to the armed track, and the recorded note had a positive duration.
- This closes the single-note hardware-capture check. Project save/reopen with this hardware take, additional keys/channels, visible workstation workflow, other MIDI devices, and physical audio-output acceptance remain unverified. Earlier isolated runs that timed out before permission acceptance are not evidence of a controller failure.
- Verification: `npm run test:browser-midi-hardware-headed` passes with the real connected Impulse; `npm test` remains 99/99, and `npm run lint` passes.

## Follow-up — 2026-10-27 MIDI take persistence

- Extended the headed physical-controller probe so its captured note is saved to IndexedDB, the project is reset and reopened, and the same pitch/velocity/duration must still exist in the piano-roll clip.
- Extended the repeatable simulated MIDI probe to record one note with the instrument active and another while bypassed, then save/reopen the project and verify both note events' pitch, velocity and duration.
- Verification: `npm run test:browser-midi` passes with both simulated notes surviving IndexedDB save/reopen; `npm run test:browser-project` passes with six devices, parameters, stereo cables, metadata and a piano-roll chord preserved, with live peak 0.175 and offline peak 0.367. `npm test` passes 99/99 and `npm run lint` passes.
- The initial headed run captured a note but did not complete its save/reopen assertion. A later user-approved run completed the full physical take round-trip; see the latest follow-up below.

## Follow-up — 2026-10-27 physical Impulse persistence and accordion playback

- With the Novation Impulse connected, Chrome requested MIDI access for the local headed probe. After the user allowed access, the probe found `Novation Impulse` and `MIDIIN2 (Novation Impulse)`. A real key press/release recorded MIDI 74 at velocity 53/127 on channel 1, with a 1.583-sixteenth duration. The probe saved the project to IndexedDB, reset the engine, reopened the project, and found the same note intact.
- This confirms the physical controller reaches the armed instrument and the recorder persists its piano-roll note through the engine path. The test creates and arms a recorded-piano device through engine APIs; it does not verify the normal workstation UI flow. The separate UI probe confirms startup does not request MIDI and the explicit Connect MIDI button requests permission once. The simulated record integration probe also passes with notes captured in active and bypassed instrument states and both surviving save/reopen.
- Added `npm run test:browser-button-accordion-pack`. Chrome loaded the actual 34-zone CC0 Button Accordion HN pack, selected `0000.ogg` for MIDI 47 with its sustain loop, triggered `0017.ogg` on key-up, and rendered offline RMS 0.0733. This checks recorded sample mapping and release behavior, not live monitoring or the musician's performance nuances.
- Verification on 2026-10-27: `npm run test:browser-midi-hardware-headed`, `npm run test:browser-midi`, `npm run test:browser-midi-bootstrap`, and `npm run test:browser-button-accordion-pack` pass; `npm test` passes 102/102, `npm run lint` passes, and `npm run build` succeeds with 2,337 modules in 39.41 seconds. Phase 0 remains partial because normal workstation UI usage, audible output/export, measured latency and CPU, and packaged-app recovery remain open.

## Follow-up — 2026-10-27 workstation Record UI verification

- Added a browser regression that starts the workstation, creates and selects a recorded piano part, arms it from the MIDI page, clicks the bottom transport Record control, injects a simulated Impulse note through Web MIDI, then saves and reopens the project. It passes with MIDI 60 at velocity 100/127 and a 1.000-sixteenth note preserved in the piano-roll clip.
- The physical UI variant uses the same workstation arm and Record controls. A headed Chrome run exposed that the recorder waited for the MIDI permission promise before starting transport; Record now starts while permission is pending, preserving on-screen keyboard capture while Chrome waits. The physical retry then captured Impulse MIDI 77 at velocity 21/127 for 2.167 sixteenths and verified IndexedDB save/reopen. The probe now matches the actual captured pitch/velocity instead of assuming MIDI 60.
- Verification after the fix: `npm run lint` passes; `npm run test:browser-midi-ui` passes with permission held pending until the transport starts; `npm run test:browser-midi-hardware-ui-headed` passes with the real Impulse through the workstation UI. The physical engine-level round-trip remains separate evidence and the broader physical key/channel matrix remains open.
- Final regression after the recorder change: `npm test` passes 102/102 and `npm run build` succeeds with 2,337 modules (40.50 seconds). No generated or third-party audio content was added by this MIDI fix.

## Follow-up — 2026-10-27 bounded process-message transport baseline

- Added `npm run test:vst3-ipc-transport`, a diagnostic that streams 2,400 stereo 128-frame Float32 blocks at a nominal 48 kHz rate through a separate Node child process. The worker applies a 0.5 gain, and the runner validates every returned sample and ordered sequence with a four-message in-flight cap.
- All blocks passed. Maximum in-flight depth was 4/4, with 2,396 backpressure events. Message round-trip measured p50 0.223 ms, p95 0.415 ms, p99 0.592 ms, and maximum 2.304 ms. Offline throughput was 15,294 blocks/s, or 40.78× nominal real-time block rate.
- This does not pace against an audio callback, measure live dropouts, run VST3 DSP, or exercise Electron `utilityProcess`; it is a baseline for asynchronous process IPC only. Phase 5 remains unimplemented in the DAW.
- Verification: both new probe scripts pass `node --check` and `npm run test:vst3-ipc-transport` passes.

## Follow-up — 2026-10-27 VST3 DSP across a native process boundary

- Added `npm run test:vst3-process-transport`. It builds a focused Windows x64 host for the project-owned `Unbox Test Delay` VST3, launches it as a separate native child process, and streams 48 kHz stereo 128-frame blocks through bounded binary pipes.
- In the offline-burst run, the runner checked all 2,400 responses in sequence against the plugin's one-second sample delay, sample by sample. The four-message cap was exercised (2,396 backpressure events); p50/p95/p99/max round-trip were 0.143/0.337/0.653/2.238 ms. Offline throughput was 22,179 blocks/s (59.14× nominal block rate).
- A second Node-timer-paced run targeted 375 blocks/s. It reported 1,215 two-block response-deadline misses, producer lateness over 1 ms on 2,247/2,400 ticks, and 16.042 ms maximum schedule lateness. This measures the Windows Node timer wake-up cadence as well as the child path; it does not isolate native-process latency or represent an AudioWorklet/audio-device callback.
- The probe covers native VST3 DSP and process isolation with asynchronous stdio. It is not Electron integration and does not measure DAW callback dropouts. Phase 5 remains unimplemented in the DAW.
- Verification: `npm run test:vst3-process-transport` rebuilt and passed the existing VST3 host smokes, both Steinberg validators (47 checks each), and this process-stream test.

## Follow-up — 2026-10-27 VST3 MIDI across a native process boundary

- Added `npm run test:vst3-midi-process-transport`. It streams 2,400 blocks to a separate native process hosting only the project-owned MIDI synth fixture; each request includes a note-on and note-off with sample offsets, pitch, velocity, and note identity.
- The runner checked all 4,800 MIDI events and every stereo output sample against the synth's expected oscillator output. It received all 2,400 blocks in order, exercised the four-block cap with 2,396 backpressure events, and measured round-trip p50/p95/p99/max of 0.145/0.306/0.495/2.037 ms in the offline run (23,623 blocks/s).
- This is fixture and protocol evidence only: it does not establish Electron hosting, live hardware MIDI, callback timing, or DAW integration. Phase 5 remains unimplemented in the DAW.
- Verification: the focused command rebuilt the fixtures/host, both Steinberg validators passed 47 checks, and the full sample-level MIDI process probe passed.

## Follow-up — 2026-10-27 recorded instrument WAV and stem export

- Expanded `npm run test:browser-export-roundtrip` to create a deterministic one-bar performance with the shipped CC0 VCSL Pipe Organ recordings and exercise the actual `runExport` path. It checks WAV at 16/24/32-bit float, AIFF at 16/24-bit, FLAC at 16/24-bit, MP3 at 320 kbps, Ogg Opus at 320 kbps, AAC at 44.1/48 kHz using each rate's reported supported bitrate (192 kbps in Chrome 155), plus a zipped one-channel stem.
- The 24-bit mix passed RIFF/WAVE size, PCM format, INFO title/artist metadata, sample rate, and exact 99,225-frame duration checks. Chrome decoded the mix and all tested compressed/lossless formats except AIFF, which Chrome's decoder does not accept; FFmpeg successfully probed and fully decoded every exported format and the stem. The deterministic dry stem matched the solo mix at 0.000% relative RMS error.
- Peak normalization reached -6.00 dBTP for a -6 dBTP target. LUFS normalization to -14 LUFS remained at -5.90 dBTP, below its -1 dBTP ceiling. Both normalized WAVs retained the expected duration, decoded non-silently, and passed FFmpeg decoding.
- The AAC matrix exposed a product bug: `canEncode` only checked 192 kbps while the Export page offered and defaulted to 320 kbps; Chrome accepted the codec but closed its encoder when given an unsupported 256 kbps request. The page now queries supported bitrates per AAC sample rate, filters its choices, and switches to a supported rate when selecting AAC. The matrix passes at both 44.1 and 48 kHz.
- The format matrix remains one controlled recorded-instrument export. A separate two-instrument performance with sends to a shared convolution reverb return produced wet stems whose sum matched the raw mix at 0.000% relative RMS; the Export-page interaction also passed. Physical speaker output, more complex routing, and large-session export performance remain open. The test found that RV7000 regenerated its random convolution impulse in each offline clone; RV7000 now reuses the live impulse buffer so the mix and stems share the same reverb response.
- Verification: `npm run test:browser-export-roundtrip` passed the format/normalization and routing matrix; `npm run test:browser-export-page` passed its live UI checks; `npm test` passed all 102 tests; `npm run lint` passed; `npm run build` transformed 2,337 modules and completed in 35.67 seconds; and `node --check scripts/browser-probe-runner.cjs` passed.

## Follow-up — 2026-10-27 varied-instrument export determinism and Impulse retest

- With recorded-instrument variation enabled, repeated mix renders now match at 0.000% relative RMS, and the two-instrument shared-reverb wet stems sum to their unmastered mix at 0.000% relative RMS. The run measured a 177.59% relative RMS change with master EQ enabled. Event-keyed random values now keep round-robin selection, variation, and sample-start offsets consistent between repeated/offline renders while preserving the instrument's configured variation.
- The actual export matrix passed again: FFmpeg probed and decoded 13 mix, normalized, encoded, and stem outputs; Chrome decoded every supported format except AIFF. Peak normalization reached -6.00 dBTP, LUFS normalization remained at -5.90 dBTP, and the Export page verified AAC support at 44.1/48 kHz, WAV bit depths, dry-stem controls and MIDI download.
- A fresh user-approved headed Chrome run with the connected Novation Impulse captured MIDI 83 at velocity 14/127 on channel 1 for 5.750 sixteenths. The probe saved the project, reset the engine, reopened IndexedDB and verified that piano-roll note. This was the engine-level physical recording probe; the normal workstation arm + Record UI path was separately verified in the preceding follow-up.
- The post-change Chrome AudioContext sweep instantiated and rendered every currently playable device: 100 playable instruments and 65 audio effects. This updates the earlier 99-instrument baseline; it verifies signal presence, not sound quality or device-feature parity.
- Verification: `npm test` passed 102/102, `npm run lint` passed, `npm run build` transformed 2,337 modules in 39.32 seconds, `node --check scripts/browser-probe-runner.cjs` passed, and both `npm run test:browser-export-roundtrip`, `npm run test:browser-export-page`, and `npm run test:browser-midi-hardware-headed` passed. This does not close the broader audio-output, latency, device matrix, or packaged-app acceptance gates.

## Follow-up — 2026-10-27 VST3 component state recall fixture

- The project-owned `Unbox Test Delay` fixture now stores its output gain in a 12-byte versioned little-endian component state. Restore validates the magic, version, finite gain and range before committing the value; the processing path reads gain atomically.
- The native host smoke saves gain 0.5, resets to the default state, restores the saved stream, rejects wrong-version, non-finite, out-of-range and truncated streams without changing state, and confirms rendered left/right peaks of 0.5/0.25 at frame 48000 (48 kHz, 256-frame blocks). The original unity-gain impulse checks at 44.1/48/96/192 kHz remain intact.
- Verification: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\vst3\smoke.ps1` passed, including both fixture offline host smokes and both 47-check Steinberg validations.
- This proves only fixture-level VST `IComponent` state handling. It does not exercise parameter/controller state, Electron, or project save/reopen in Unbox; Phase 5 remains unimplemented in the DAW.

## Follow-up — 2026-10-27 project crash-recovery identity and overwrite protection

- Added `npm run test:browser-project-recovery`. Its first isolated browser run reproduced a data-loss risk: restoring a recovery snapshot for one project while another project was open wrote the snapshot into the last-open project because recovery ignored its stored project ID and name.
- `restoreRecovery()` now targets the project ID recorded with the snapshot. If a save was interrupted before that project record existed, it creates a new project instead of overwriting the last-open project. A failed save keeps the recovery copy available; successful recovery updates `lastProjectId`. Opening, creating, importing or restoring a version now stops when the required safety save fails, and the Ctrl+S toast reports failed saves accurately.
- The browser regression verifies both an existing recovery target and a missing target from an interrupted Save As. It reloads both recovered records from IndexedDB, checks tempo and notes, confirms the unrelated project records are unchanged, and verifies recovery and `lastProjectId` cleanup/update. Both `npm run test:browser-project-recovery` and the existing `npm run test:browser-project` pass.
- Verification: `npm test` passed 102/102, `npm run lint` passed, and `npm run build` transformed 2,339 modules. This is targeted browser evidence; the full media, crash, migration, and packaged-app recovery matrix remains open.

## Follow-up — 2026-10-27 repeated Impulse workstation recording

- A fresh user-approved headed Chrome run through the normal workstation arm + Record controls captured Novation Impulse MIDI 88 at velocity 22/127 for 2.083 sixteenths. The test saved the project, reset the engine, reopened IndexedDB, and confirmed the piano-roll note remained intact.
- This independently repeats the physical MIDI workstation path after the earlier MIDI 77 capture. It confirms note capture and project persistence for another key press; broader channel, velocity, reconnect and audio-output coverage remains open.
- Verification: `npm run test:browser-midi-hardware-ui-headed` passed.

## Follow-up — 2026-10-28 Impulse workstation recording retest

- A user-approved headed Chrome run captured Novation Impulse MIDI 88 at velocity 37/127 for 2.083 sixteenths through the workstation arm + Record controls. The test saved the project, reset the engine, reopened IndexedDB, and confirmed the piano-roll note remained intact.
- Verification: `npm run test:browser-midi-hardware-ui-headed` passed. The browser probe first hit the sandbox's loopback restriction; the same test passed when rerun with localhost access. Broader channel, reconnect, velocity-range and physical audio-output checks remain open.

## Follow-up — 2026-10-28 native VST3 shared-memory audio and MIDI candidate

- `npm run test:vst3-shared-memory` builds only project-owned fixtures and uses a versioned four-slot Windows shared-memory ring with named worker/response events. The delay effect and MIDI synth run in separate native worker processes.
- The 48 kHz / 128-frame paced delay run used the confirmed high-resolution timer, checked 2,400 blocks sample by sample, sustained 374.830 blocks/s, and missed zero one-block deadlines. Worker completion latency measured p50 0.0089 ms / p95 0.0183 ms / p99 0.0249 ms / max 0.0438 ms; maximum timer lateness was 0.891 ms.
- The paced MIDI synth run delivered 300 note-ons and 300 note-offs at phrase-varying sample offsets, verified every stereo output sample across 2,400 blocks, sustained 374.820 blocks/s, and also missed zero one-block deadlines. Worker completion latency measured p50 0.0092 ms / p95 0.0184 ms / p99 0.0259 ms / max 0.1011 ms; maximum timer lateness was 0.846 ms. Both offline bursts filled the ring and applied backpressure.
- This extends the isolated native-process baseline; it does not prove Electron utility-process transport or dropout safety in Unbox's live AudioContext callback. Phase 5 stays unimplemented in the DAW.

## Follow-up — 2026-10-28 recorded electric pianos and device sweep

- Added CC BY 3.0 sample packs for Hohner Pianet T and Wurlitzer EP200 from the Greg Sullivan E-Pianos source. The upstream credits Greg Sullivan for the instrument and kinwie for SFZ mapping but does not separately name the sample performer, so the app metadata records those exact credits and the attribution condition without claiming performer identity. The 49-key Pianet T and 48-key Wurlitzer zones render in the full browser sweep.
- The recorded library now has 39 packs: 32 CC0, three CC BY 3.0, and four private `Custom` packs. The share policy retains the 35 redistributable packs. The pack regression checks each new pack's license, source, credits, audio files, zone count and MIDI coverage.
- While building the packs, the GitHub SFZ source cleanup was found to remove the entire instrument-cache root after a successful build, which deleted an unrelated local cache. Cleanup now removes only the cache directory for the current repository; a regression keeps a sentinel file in another source cache. The Button Accordion cache was restored from its pinned source with `--keep-cache`; its 34-zone browser probe passed again.
- Chrome AudioContext sweeps have now passed with all 65 effects before the 102 instruments and with all 102 instruments before the 65 effects. Two earlier instrument-first runs reported no RV7000 output after the sample-heavy instrument batch; an exact reproduction of the preceding 102 instruments plus Scream4 and Echo passed twice, and a later full instrument-first sweep passed. The intermittent report was not reproduced; this does not certify long-session stability.
- Verification: `npm test` passed 104/104, `npm run lint` passed, `npm run build` transformed 2,339 modules in 36.90 seconds, full instrument-first and effects-first browser device sweeps passed, and `npm run test:browser-button-accordion-pack` passed with 34 zones, a sustain loop, a release-trigger sample, and offline RMS 0.0733. The regenerated reference lists 344 browser entries, 156 specs, 40 insert effects, 39 recorded packs and 964 Reason Remoter rows. Phase 7 remains partial; sample provenance is not performer credit, and share-package playback remains unverified.

## Follow-up — 2026-10-28 share archive content audit

- Added `npm run audit:share-package -- <path-to-app.asar>` as a repeatable archive check. It compares the packaged instrument index with the current license policy, validates each redistributable pack's metadata against its index entry, verifies every sample referenced by its zones, and checks that private packs, local-library files, and stem files are absent.
- Built the share-mode web app, pruned non-redistributable content, built the share API bundle, and assembled an unpacked Windows app in `release/share-validation-20261028/`, preserving existing release outputs. The app archive audit passed: all 35 redistributable packs and their samples/credits are present; all four private packs, the local library and stems are absent.
- Restored the full local `dist/` build and `electron/api-server.cjs` after the share build. The production build transformed 2,339 modules in 34.84 seconds.
- Verification: `npm test` passed 104/104, `npm run lint` passed, and `npm run audit:share-package -- release/share-validation-20261028/win-unpacked/resources/app.asar` passed with 35 redistributable packs and 2,462 referenced samples present. This audits archive contents only; packaged-app launch and playback remain unverified, and the portable share executable was not refreshed.

## Follow-up — 2026-10-28 recorded electric-piano browser playback

- Added `npm run test:browser-electric-pianos-pack`. The Chrome probe loads the shipped Pianet T and Wurlitzer EP200 through the same `multisampleEngine` used by rack instruments, decodes their bundled Ogg samples in an `OfflineAudioContext`, triggers low / center / high notes, and checks which mapped sample actually starts for each velocity.
- Pianet: all 49 referenced samples decoded, low MIDI 29 and high MIDI 88 rendered, and MIDI 60 selected distinct lower and upper velocity samples; combined render RMS was 0.3281. Wurlitzer: all 45 referenced samples decoded, low MIDI 33 and high MIDI 96 rendered, and MIDI 60 selected all four velocity layers; combined render RMS was 0.2787.
- Verification: `npm run test:browser-electric-pianos-pack` passed, `npm run lint` passed, and `npm test` passed 104/104. This confirms offline sample decoding, note-range mapping, and velocity-layer selection; live speaker output, sound-quality review, and packaged-app playback remain open.

## Follow-up — 2026-10-28 CC0 clarinet, full device sweep, and share refresh

- Added the FreePats Clarinet recordings as `freepats-clarinet`. The official [FreePats source page](https://freepats.zenvoid.org/Reed/clarinet.html) identifies Kaili Dence as performer, Tyler Dence as recording engineer, and licenses the bank under CC0 1.0. The included source readme also credits Roberto for the loops and sample modifications. The instrument has nine recorded, looped zones spanning MIDI 45–91.
- Added `npm run fetch:instrument:freepats-clarinet`. It downloads a pinned 2019-08-18 archive, verifies SHA-256 `481FD688F003FC4930E49123199FD88E7430376CB80F3ECFA685D7F610D20A98`, checks archive members, CC0 and contributor metadata, validates nine WAV headers, then rebuilds the Ogg pack. The generated instrument is recorded audio; its oscillator sources are not AI-generated.
- Added `npm run test:browser-freepats-clarinet-pack`. Chrome decoded all nine bundled samples, verified every MIDI key from 45–91 maps to a zone, confirmed low/mid/high notes start the expected recording and MIDI 69 uses its mapped loop, then measured sustain RMS 0.4927 and post-release RMS 0.0000.
- The full DAW AudioContext sweep passed with 103 playable instruments and 65 effects. The regenerated reference now contains 345 browser entries, 157 registered specs, 40 insert-effect entries and 40 recorded packs. The library has 33 CC0, three CC-BY-3.0 and four private `Custom` packs; 2,475 Ogg samples total 133,701,351 bytes.
- Rebuilt the share app in `release/share-validation-clarinet-20261028/`. Its `app.asar` audit passed with 36 redistributable packs and 2,471 referenced samples present, while excluding the four private packs, local library and stems. Restored the normal local `dist/` and `electron/api-server.cjs` afterward.
- Verification: `npm test` passed 105/105, `npm run lint` passed, `npm run test:browser-freepats-clarinet-pack` passed, `npm run test:browser-devices` passed, `npm run reference:devices` passed, the share archive audit passed, and the restored `npm run build` transformed 2,339 modules in 53.76 seconds. Desktop launch and playback are still unverified.

## Follow-up — 2026-10-28 CC0 wooden recorder and instrument reference

- Added the official FreePats wooden-recorder recordings as `freepats-recorder`. The [FreePats source page](https://freepats.zenvoid.org/Wind/recorder.html) identifies Eugene Vlaskin as performer and recording artist; its archive includes the CC0 1.0 dedication and credits Roberto for sample processing.
- Added `npm run fetch:instrument:freepats-recorder`. It verifies the pinned archive SHA-256, exact archive member list, source credits and all 34 WAV headers before building 34 randomized, looped Ogg zones. The source map is shifted down one octave to MIDI 57–88 (C4–E6); each pack sample remains a real recording.
- Added `npm run test:browser-freepats-recorder-pack`. Chrome decoded all 34 zones and rendered the looped sustain at RMS 0.5261; note release reduced the measured tail RMS to 0.0000. The production build includes the generated manifest and samples.
- Regenerated the device reference: 346 browser entries, 158 specs, 40 effects and 41 recorded packs. The share-mode `dist` audit passed with 37 redistributable packs, 2,505 referenced samples and credits; all four private packs, the local library and stems are absent.
- Verification: `npm run lint`, `npm test` (106/106), the recorder browser probe, the share-mode build and directory audit passed. Electron Builder could not produce a fresh `app.asar`: it attempted to fetch a GitHub-hosted helper while network access was unavailable. The previous headed Impulse probe timed out at Chrome's pending MIDI permission prompt and produced no new hardware capture.

## Follow-up — 2026-10-28 MIDI probe diagnostics

- A fresh headed Chrome retry reported MIDI permission state `prompt`, then timed out without enumerating a Novation Impulse input. That run did not produce a new physical recording result; the earlier successful workstation recording and save/reopen runs remain documented above.
- Improved the physical MIDI UI probe's timeout output to include the current Web MIDI status, visible input names/open errors, and a next step for pending permission, denied permission, or a missing/occupied controller.
- Verification: `npm run lint` passed. `npm run test:browser-midi-ui` passed: the workstation Record UI captured MIDI 60 at velocity 100/127 for 1.167 sixteenths and the note survived IndexedDB save/reopen.

## Follow-up — 2026-10-28 project import preflight

- Project JSON is now structurally checked before the audio graph is cleared. Unknown future format versions and malformed data that the importer iterates are rejected; versionless legacy envelopes remain supported.
- The recovery browser probe verifies that rejected imports do not change the open project's exported JSON, then exercises the existing IndexedDB recovery and save/reopen path.
- Verification: `npm test` passes 110/110, TypeScript checking passes, the browser recovery probe passes, and the production build completes with 2,340 modules.
## Follow-up — 2026-10-28 device import integrity

- Unknown device types are rejected before import, rather than being substituted with the Subtractor. Both factories report unsupported types; known DeviceSpecs and legacy factories are covered by the registry test.
- Saved VST units require a structurally valid snapshot matching the device's instrument/effect role. Browser recovery checks confirm all rejected-file cases leave the current project unchanged.
- Verification: 113/113 unit tests, TypeScript check, browser project-recovery probe, legacy live/offline factory-registry parity, and production build (2,341 modules; 37.78 seconds) pass.

## Follow-up — 2026-10-28 FreePats bagpipe and live device sweep

- Added the CC0 FreePats Bagpipe in G as `freepats-bagpipe`. Its reproducible fetcher verifies the pinned 2026-08-06 archive SHA-256, exact member list, performer/instrument credits, CC0 license, all 14 FLAC headers, and 14 SFZ loop pairs. MIDI 36–59 plays the two G drones; MIDI 64–81 plays the sampled bagpipe notes; 60–63 remains unmapped.
- Added the playable instrument and generated reference row, attribution entry, browser offline-audio probe and pack-policy coverage. The DAW-wide device smoke now chooses a mapped note when a recorded pack does not cover the default C4 probe.
- Verification: `npm test` passes 114/114, `npm run lint` and `npm run test:browser-freepats-bagpipe-pack` pass; the Chrome pack probe loaded 14/14 zones, measured sustain RMS 0.3253 and release RMS 0.0000. The targeted live smoke passed. The full effects-first sweep passed all 105 instruments and 65 effects. The instrument-first full sweep twice reported zero RV7000 output after the instrument batch; isolated and warmed RV7000 probes passed. Treat this as an open load-order/resource finding, not a clean two-order sweep. The production build passed with 2,341 modules in 45.72 seconds.
- Current library inventory: 42 packs (35 CC0, three CC-BY-3.0, four private), 2,523 Ogg samples / 135,742,813 bytes. The regenerated reference contains 347 browser entries and 159 specs. No share archive was rebuilt for this pack yet.
- The headed Impulse probe still displays Chrome's “Control and reprogram your MIDI devices” prompt; the user must accept it and play a key before the physical-MIDI test can proceed. No new hardware capture is recorded.

## Follow-up — 2026-10-28 repeated instrument-first audio sweep

- Two fresh full `npm run test:browser-devices` runs each passed: 105 playable instruments and 65 effects instantiated and emitted audio in the DAW Web Audio context. The runs used separate fresh browser contexts and the default instrument-first order.
- Earlier full instrument-first runs reported no measurable RV7000 output after the instrument batch; isolated and warmed checks passed. The latest two runs do not reproduce that intermittent observation, so keep it open for longer-duration/resource testing rather than treating the two clean runs as stability certification.

## Follow-up — 2026-10-28 FreePats Concert Harp and RV7000 response

- Added `freepats-concert-harp`, a reproducible CC0 FreePats pack. Its pinned archive is validated against the official credits and exact member list; K. Smith is credited as performer, Roberto as sound-bank assembler, and Versilian Studios LLC as the sample source. The pack has 36 FLAC-derived Ogg zones across MIDI 28–102, including two velocity layers over part of the range.
- Added offline and live browser coverage. All 36 zones decode; MIDI 60 selects different velocity layers; low, middle and high notes render. The harp passed its focused rack smoke and emitted signal in the full instrument-first sweep.
- Fixed the RV7000 Size control, which previously rebuilt the impulse without using Size, and added device teardown that releases the convolution buffer and disconnects its internal nodes. The browser response probe measures 1.54 / 3.20 / 3.84 s for small / default / large Size.
- Latest verification: `npm test` 115/115, `npm run lint`, the RV7000/EQ/dynamics response probe, the full effects bypass/power matrix (65 effects, 43 processors, 25 utilities), FreePats harp offline/live probes, focused harp device smoke, production build (2,341 modules; 38.79 s), and a fresh full live sweep of 106 instruments / 65 effects pass. One immediately preceding full sweep still failed only at RV7000 after 50.867 s of AudioContext time; the isolated and warm-before-device RV7000 checks passed. The intermittent result remains open and is not attributed to the Size fix.
- Catalog totals at this follow-up: 348 browser entries, 160 specs, 40 effects, and 43 packs (36 CC0, 3 CC-BY-3.0, 4 private; 2,559 Ogg files / 137,554,571 bytes). The visible Impulse MIDI permission prompt remains pending; the UI showed no enumerated input and no new physical note was captured.
## Follow-up — 2026-10-28 packaged Electron startup retest

- A fresh-profile launch of the existing unpacked Windows build exited with `0x80000003` before the application created its startup diagnostic log. The launch used a profile under the workspace and the normal Chromium sandbox.
- `npm run test:electron-startup` timed out after 30 seconds without the minimal Electron 45 probe's `main-loaded` marker. Because the standalone runtime probe also fails before its entry point, this host run cannot establish an Unbox-specific code failure or a successful packaged launch. Phase 9 startup acceptance remains open.

## Follow-up — 2026-10-28 FreePats fingerstyle electric bass

- Added `freepats-fingerstyle-bass`, a reproducible CC0 recorded instrument from the FreePats Yamaha RBX finger-bass bank. The fetcher pins the official archive SHA-256, validates the exact archive contents and CC0/source credits, checks all 12 FLAC headers, and verifies the SFZ's 12 source roots and MIDI 26–45 key range. FreePats credits Andrea Biasior for creating the recordings and Roberto for small sample and sound-bank edits; the source does not identify a named performer, so the UI and catalog do not claim one.
- The generated device uses 12 mono, FLAC-derived Ogg recordings and loads as a playable bass instrument. Added pack policy checks and a browser probe for license/credit metadata, all mapped notes, sample loading, and audible low/mid/high notes. The pack is CC0 and therefore remains eligible for the share build.
- Updated the multisample cache to reference-count each pack across active devices and offline clones, retain the decoded data while any engine needs it, and release the cache after the final engine is disposed. This prevents unused packs from remaining pinned indefinitely after sequential auditions. The browser probe verifies both sharing and final-release behavior. This change did not resolve the separate late RV7000 full-sweep failure.
- `npm run reference:devices` reports 349 browser entries and 161 specs. The local collection now has 44 packs (37 CC0, 3 CC-BY-3.0, 4 private), 2,571 Ogg files and 137,931,482 sample bytes. `npm test` passes 116/116, `npm run lint` passes, and the final `npm run build` passes (2,341 modules; 35.71 s). The browser pack probe loads 12/12 recordings, confirms MIDI 26–45, renders low/mid/high RMS 0.2873 / 0.2817 / 0.2768, and verifies shared-cache lifetime. Its live rack smoke passes. The isolated RV7000 warm-device smoke passes. A fresh effects-first full Chrome sweep passes 107 instruments and 65 effects. The instrument-first sweep still reports no measurable RV7000 output after 51.461 s of AudioContext time; this remains an open stress/load-order issue. The headed Impulse MIDI prompt is still visible with zero enumerated inputs; a new physical note has not yet been captured in this run.

## Follow-up — 2026-10-28 RV7000 diagnostic reruns

- Added failure-only diagnostics to the full device audio smoke: input signal, bypass output, the raw RV7000 output, dry/wet gain values, and impulse-response duration. They will be attached if the failure returns.
- Two consecutive, fresh instrument-first Chrome sweeps passed with 107 instruments and 65 effects each. The post-cache effects-first sweep also passed. The earlier RV7000 silence at 51.461 seconds is not reproduced in these reruns, but it remains an open long-session/stress observation pending longer stability coverage.
- `npm test` remains 116/116 and `npm run lint` passes. The visible Chrome MIDI permission prompt remains pending, with no enumerated Impulse input or new physical note captured in this session.

## Follow-up — 2026-10-28 repeated 10-minute browser audio soak

- The fresh headless Chrome run completed 601 seconds with four instruments plus delay and reverb. Song position matched the `AudioContext` clock at 0.000% drift; all 601 sampled one-second master windows were non-silent; the AudioWorklet frame gap peaked at 173.3 ms with zero gaps over 500 ms; observed heap growth was +4.3 MB.
- This run also measured 8.43% song-to-wall-clock skew and two main-thread long tasks, with a 1,035 ms maximum. The probe's pass criteria cover AudioContext alignment, signal presence and AudioWorklet gaps, not the headless browser's wall-clock/audio-clock delta or long-task duration. Those are recorded as unresolved performance observations; headless results do not establish physical output timing or UI responsiveness on a user's audio device.
- The first attempt did not load the page because sandboxed Chrome could not connect to its temporary localhost server. The reviewed loopback rerun above loaded the test and completed successfully.

## Follow-up — 2026-10-28 SF2 preset import and archive acceptance

- Workstation LOAD now imports SoundFont 2 presets by their actual preset/instrument zones, preserving key and velocity ranges, root tuning, attenuation, attack/release, sample loops, and linked stereo samples. Imported PCM is stored in the project audio asset store.
- The project media manifest initially omitted multisample IDs; this caused SF2 WAVs to be omitted from `.unbox` exports. It now collects each zone asset. A browser archive test exports the SF2 project, remaps IDs to emulate missing local assets, imports the archive, and confirms the restored zone renders offline (RMS 0.0346).
- The Chrome browser probe imported a linked-stereo preset through the real LOAD UI, verified the distinct left/right sample channels, and measured live playback/release (RMS 0.0219 → 0.0000), OfflineAudioContext playback/release (RMS 0.0221 → 0.0000), decaying envelope output (RMS 0.0271 → 0.0162), key-tracked decay (MIDI 48/72 RMS 0.0235/0.0285), and the `.unbox` restore render (RMS 0.0252). `npm test` passes 122/122 and `npm run lint` passes.
- The `.unbox` probe confirms the archive contains every sample WAV, restores the instrument and zone under fresh asset IDs, and renders the restored instrument offline.
- `npm run build` completes with 2,343 modules (37.90 s) after the envelope changes.
- A fresh headed Novation Impulse workstation-recording attempt still showed Chrome MIDI permission as `prompt` and enumerated no inputs; it timed out before a physical note was captured. Hardware acceptance remains open until Chrome grants access and a key press reaches the recording probe.
- SF2 envelope delay/attack/hold/decay/sustain/release, key-to-hold/decay, and loop-release behavior are mapped; the app's contour is an approximation. SF2 modulators and exclusive-class choking were not covered at the time of this test. Imported file licensing and performer provenance are not verified. Phase 7 remains partial.

## Follow-up — 2026-10-28 isolated current share-build audit

- The share-prune CLI now accepts an optional target directory while preserving `dist/` as its default. This allows share validation to run in an isolated output tree without replacing the full local build.
- Built the current app with `vite build --mode share` into `release/share-validation-current-20261028/dist`, pruned that tree and ran the archive-content audit. It passed with all 40 redistributable packs, 2,567 referenced sample files and their credits present; all four private packs, the local plugin library and song stems were absent. The normal `dist/` was not modified.
- Verification: `npm test` passes 116/116, `npm run lint` passes, the isolated share build completes (2,341 modules), and `npm run prune:share-build -- <staging-dist>` followed by `npm run audit:share-package -- <staging-dist>` passes. This validates web-build content and licensing; it does not produce or launch a portable executable.

## Follow-up — 2026-10-28 physical MIDI probe status visibility

- The Incognito hardware retry granted Chrome MIDI access and enumerated `Novation Impulse` plus `MIDIIN2 (Novation Impulse)`. It did not produce a note take: the physical probe timed out with `recorder=idle` because the workstation Record button had not been pressed. My instruction to play a key before confirming the transport was recording was premature; this run is not a physical-recording acceptance result and does not contradict the earlier saved/reopened Impulse takes.
- The probe's READY/FAIL text was present in the DOM but hidden behind the workstation in the captured screen. The test page now puts it in a fixed, high-layer status panel with pointer events disabled, so it remains visible while Record and the workstation remain clickable. Its instruction now separates pressing Record, allowing a browser prompt, and playing only after the live-recording message.
- The browser probe asserts that the status panel is visible, in the viewport, and non-blocking, then exercises the actual workstation arm + Record UI with simulated MIDI. `npm run test:browser-midi-ui` passed: MIDI 60 at velocity 100/127 was recorded and survived IndexedDB save/reopen. This remains simulated-controller evidence, not a new physical-key capture.
- Current verification: `npm test` 122/122 passed; `npm run lint` passed; `npm run build` passed (2,343 modules; 37.81 s). The first browser-probe attempt was blocked from its temporary loopback server by the default sandbox; the localhost-only reviewed rerun passed.

## Follow-up — 2026-10-28 SoundFont loop-release playback

- SF2 `sampleModes` mode 3 is now kept distinct from the continuous-loop mode. At note-off, the sampler schedules the source handoff and continues from the current loop phase through the sample tail, while applying the zone release envelope. This works for live playback, offline render, and project archive restore.
- The browser integration probe caught two playback defects during implementation: scheduled AudioParam `.value` did not represent the current envelope level, and source cleanup disconnected the gain path before the tail finished. Both are fixed; the probe confirms nonzero offline tail RMS (0.0048) and clean post-release silence.
- The expression wrapper now restores any existing AudioContext source-factory hooks after note capture. This keeps browser instrumentation and host wrappers intact, including when the release callback creates a second source.
- At the time of this loop-release follow-up, SF2 mode 3 was covered while exclusive-class choking remained open; that gap is closed in the later follow-up below. SF2 modulators and exact SoundFont envelope behavior remain open. The importer does not verify a file's license or identify its performer.
- Verification after the sampler fix: `npm run test:browser-sf2-import` passed with offline tail RMS 0.0048; `npm test` passed 123/123; `npm run lint` passed; `npm run build` passed with 2,343 modules (39.47 s).

## Follow-up — 2026-10-28 headed Impulse permission and recording retry

- The fresh headed browser run accepted Chrome's MIDI prompt, enumerated both `Novation Impulse` and `MIDIIN2 (Novation Impulse)`, and reached live transport recording after the Record control was pressed.
- The probe then timed out after 90 seconds without receiving a physical note-on/note-off. Permission and transport startup are verified on this run; key capture is not. Earlier successful physical Impulse captures and save/reopen checks remain valid; this retry does not establish a new device-note result.
- The headed probe now gives each run a unique Chrome window title so stale probes cannot make the permission and recording UI ambiguous.

## Follow-up — 2026-10-28 SF2 exclusive-class voice choking

- Workstation LOAD now preserves the SF2 `exclusiveClass` generator in imported zone assignments and `.unbox` project state. When a new voice starts, the same device/preset fades active held voices and release tails with the matching nonzero class over 30 ms; class zero has no choke behavior. Released loop tails remain registered until they finish, so later class hits can stop them too. This implements the spec's preset-wide class behavior for the one-preset-per-device import path.
- The SoundFont 2.04 specification defines class 0 as no action and says a nonzero class rapidly terminates other sounding notes with the same class across the preset: [SoundFont 2.04, generator 57](https://musescore.org/sites/musescore.org/files/2023-01/sfspec24.pdf).
- Browser acceptance uses a mode-3 looped SF2 fixture: it checks imported class metadata, observes 40 ms scheduled stops (30 ms gain fade plus a 10 ms stop margin) when choking both a held loop and an already-created release tail, confirms no extra tail source is created by choking, and checks class persistence through `.unbox` restore.
- This covers exclusive-class voice termination only; SF2 modulators and the exact exponential release-envelope contour remain open. The importer still does not validate user-file licenses or performer provenance.
- Verification: `npm test` passes 125/125; `npm run lint` passes; `npm run test:browser-sf2-import` confirms class 4 schedules 40 ms stops for held loops and released tails in live Chrome and `OfflineAudioContext`, preserves the class through `.unbox`, and still renders the mode-3 release tail (RMS 0.0048); `npm run build` passes with 2,343 modules (39.45 s).

## Follow-up — 2026-10-28 SF2 keyboard scale tuning

- The parser and LOAD sample engine now preserve instrument generator 56 (`scaleTuning`) in cents per MIDI key, with the 100-cent default and 0–1200 range. Playback scales key distance from the sample root before adding the sample's fine tuning; the compatibility SoundFontEngine follows the same rule.
- Chrome imported a 50-cent-per-key SF2 through LOAD and verified the actual MIDI 60 buffer-source playback rate of 1.000578 against the expected 1.000578. The `.unbox` round trip restored the setting, and the existing live/offline loop-release, exclusive-class choke, envelope, and render checks still passed.
- Verification: `npm test` passes 126/126, `npm run lint` passes, and `npm run test:browser-sf2-import` passes. Generator 56 behavior is covered; SF2 modulators, exact envelope contours, file licensing, and performer provenance remain open.

## Follow-up — 2026-10-28 SF2 initial filter and default velocity response

- Workstation LOAD now reads instrument and preset `initialFilterFc` generator values, defaults to 13,500 cents, combines the hierarchy, clamps to the SoundFont range, and carries the result through sample-zone materialization and `.unbox` project state.
- Imported SF2 voices use a Web Audio low-pass filter whose cutoff follows the SoundFont default MIDI-velocity modulator: quieter notes lower the cutoff by up to 2,400 cents relative to MIDI velocity 127. The compatibility SoundFontEngine uses the same rule for parsed SF2 zones; its app-generated model banks retain their existing sound path.
- The [SoundFont 2.04 specification](https://www.synthfont.com/sfspec24.pdf) defines the default velocity-to-initial-filter-cutoff modulator and the generator's cents-based units. The browser probe imports a test preset through LOAD and measures 5,487.83 Hz at velocity 89/127 in both live Chrome and `OfflineAudioContext`; it also retains the existing SF2 project archive and render checks.
- Verification: `npm test` passes 127/127, `npm run lint` passes, `npm run test:browser-sf2-import` passes, `node --check scripts/browser-probe-runner.cjs` passes, and `npm run build` passes with 2,343 modules. Custom SF2 modulator tables, full generator behavior, exact envelope contours, imported-file rights, and performer provenance remain open.

## Follow-up — 2026-10-28 SF2 default velocity attenuation

- Imported SF2 voices now apply the default velocity-to-initial-attenuation response. The standard concave 960-centibel response produces squared normalized MIDI velocity amplitude; at velocity 89/127, the fixture's zone level yields peak gain 0.246135. Generic imported sample assignments keep their pre-existing velocity response.
- The SoundFont 2.04 specification describes the default 960 cB velocity attenuation modulator; [FluidSynth's implementation](https://github.com/FluidSynth/fluidsynth/blob/master/src/synth/fluid_mod.c) uses the concave unipolar negative source mapping and maps centibel attenuation to linear amplitude. The Web Audio sampler applies this at note-on.
- The compatibility SoundFontEngine carries SF2 attenuation and uses the same velocity response while app-generated DSP model banks retain their existing behavior. The browser probe captures the actual scheduled gain for live and offline playback and confirms the behavior marker survives `.unbox` restore.
- Verification: `npm test` passes 128/128, `npm run lint` passes, `npm run test:browser-sf2-import` passes, and `node --check scripts/browser-probe-runner.cjs` passes. `npm run build` passes with 2,343 modules (39.32 s). Custom SF2 modulators, exact envelope contours, imported-file licensing, and performer provenance remain open.

## Follow-up — 2026-10-28 Impulse workstation recording retest

- The simulated workstation arm + Record UI probe passes, capturing MIDI 60 at velocity 100/127 and preserving its piano-roll note through IndexedDB save/reopen. The automated regression suite passes 128/128 and `npm run lint` passes.
- Physical retest reached live transport recording. Chrome displayed its `127.0.0.1:47771` MIDI permission prompt, but access remained pending for 90 seconds, so the probe enumerated no Impulse inputs and captured no physical key. This is a blocked hardware acceptance run, not a failed note-recording assertion; earlier successful physical Impulse captures remain valid.
- Updated headed physical probe runs to reuse port 47771 (override with `UNBOX_MIDI_PROBE_PORT`) and retain an isolated Chrome profile under the OS temp directory. This preserves the browser grant between runs without sharing the user's normal Chrome profile or placing the profile in Vite's watched project tree. Input discovery now waits 90 seconds. Each UI run creates a fresh named probe project and removes only stale projects with that exact test name. After the user accepts this origin once, later runs should reuse the grant; a fresh physical note still needs to be recorded and saved.

## Follow-up — 2026-10-28 Ganjo pack, share audit, and MIDI probe timing fix

- Added the Ganjo Six-String Banjo pack from pinned `sfzinstruments/ganjo` revision `ccff5cd5cd3b513873a48994c07724d9d3c39e1c`. The source is CC0 and credits `itsclipping` with recording, editing, and mapping. Its browser probe decoded 38 samples, checked MIDI 38–72 coverage and MIDI 58 round-robin alternation, verified the credit/license metadata, and rendered offline at RMS 0.0512.
- `npm run reference:devices` regenerated the scoped app/Reason reference: 350 app entries, 162 specs, 40 effects, 45 recorded packs, and 964 dated Reason Remoter rows. The source index has 45 packs (38 CC0, 3 CC-BY-3.0, 4 private `Custom`), 2,609 Ogg samples and 138,656,398 sample bytes.
- A fresh isolated `vite build --mode share` in `release/share-validation-ganjo-20261028/dist`, followed by share pruning and the package audit, passed with 41 redistributable packs, 2,605 referenced samples and credits, and no `Custom` packs, local library, or stems. This verifies web share content; it does not verify a packaged executable.
- The workstation MIDI UI probe now expands the Performance Resource Timing buffer before loading the app, so it retains the live engine module URL used by the probe. `npm run test:browser-midi-ui` passes: simulated MIDI 60 at velocity 100/127 is recorded and preserved through IndexedDB save/reopen. `npm test` passes 129/129 and `npm run lint` passes; the production build passes with 2,343 modules.
- The newest headed Impulse run reached Chrome's MIDI permission prompt but timed out with permission still pending and no input enumerated; no physical key was captured in that run. Earlier saved/reopened physical Impulse takes remain the confirmed hardware evidence. This retry does not close the hardware retest or Phase 0 exit criteria.

## Follow-up — 2026-10-28 RV7000 full-sweep bypass and power checks

- Extended `tests/browser/device-audio-smoke.ts` to retain the six legacy bypass-shim gains during RV7000 construction and, under the normal instrument-first sweep, verify dry signal in bypass, silence when powered off, and signal recovery after power-on.
- A fresh Chrome run passed with 108 instruments and 65 effects. RV7000 measured a 0.150 bypass peak and 0.0921 repowered peak; after recovery its shim gains were wet L/R 1.000/1.000, dry L/R 0.000/0.000, and output L/R 1.000/1.000. The previous no-output report was not reproduced and no production DSP change was made; keep the intermittent full-sweep report open for longer stress testing.
- Verification: `npm test` passed 129/129, `npm run lint` passed, and `npm run build` passed with 2,343 modules (38.46 s). The warmed RV7000 check and two fresh full instrument-first sweeps passed; one of those sweeps included the new bypass/power transitions.
- `npm run test:browser-midi-ui` also passed after the hardware attempts: the workstation Record control captured simulated MIDI 60 at velocity 100/127 for 0.917 sixteenths and preserved the piano-roll note through IndexedDB save/reopen. This verifies the DAW UI/recording route, not the physical controller input.
- Two headed Impulse retries in this session remained at Chrome's `127.0.0.1:47771` MIDI permission prompt and timed out with status `connecting` and no inputs. No new physical note was captured; hardware recording still needs an accepted permission prompt and a key press while the probe is recording.

## Follow-up — 2026-10-28 VST3 Electron boundary retest

- `npm run test:vst3-boundary` timed out after 35 seconds both in the default sandbox and with the local process sandbox removed. Neither run printed the Electron probe's main-process entry message. The utility-process test therefore still does not reach its code on this host; no DAW or third-party plugin binary was launched.
- The control `npm run test:vst3-ipc-transport` passed all 2,400 stereo blocks with a bounded 4-block queue and 2,396 backpressure waits. Round-trip latency was 0.223 ms p50, 0.467 ms p95, 0.641 ms p99, and 3.085 ms maximum; offline throughput was 39.91× real time. This validates asynchronous Node IPC only, not Electron utilityProcess or a real-time callback.
- Phase 5 remains **not implemented** in the DAW. The current retest narrows the observed failure to the Electron startup boundary on this host; native VST3 processing, project persistence, editor hosting, crash recovery and DAW integration remain unverified.

## Follow-up — 2026-10-28 physical Impulse capture and rack undo transaction

- After the user granted Chrome MIDI permission, a fresh headed workstation arm + Record run captured physical Novation Impulse 25 MIDI 81 at velocity 18/127 for 2.917 sixteenths. The piano-roll note survived IndexedDB save/reopen. Earlier attempts that stayed at `prompt` or `connecting` remain failed attempts; this new take is the latest successful hardware result.
- Added `npm run test:browser-rack-ui`, which uses the real Rack tab and Built-in Devices browser to add the recorded CC0 acoustic-guitar pack and a stereo delay, verify the guitar → delay → master stereo route, play MIDI 60 and measure 0.0247 peak at the master, undo and redo the Add action from the app menu, save through File → Save, and reload the app to verify the devices and cables persist.
- That probe exposed that one rack Add action previously entered the undo journal as a device creation plus separate cable edits. `AudioEngine.runStructuralEdit()` now groups the UI add, player target, and automatic effect insertion/patching into one undo entry. Built-in and library plugin rack adds use this transaction. The browser acceptance probe now passes the single-step undo/redo expectation.
- Verification after the source change: `npm test` passed 129/129, `npm run lint` passed, `npm run build` passed with 2,343 modules (44.00 s), and `npm run test:browser-rack-ui` passed through UI save and reload. The isolated Vite probe treats its expected `/api/vst/status` 404 as an offline-library fallback; built-in devices are loaded from the app catalog.
- The AI route regression test confirms the server exposes only symbolic rack plans, preset-parameter suggestions, and text mix notes; there is no AI audio-generation endpoint. Sound in the rack test was rendered from the installed CC0 acoustic-guitar recording through the local Web Audio effect graph.
- Phase 2 now has end-to-end acceptance evidence for rack add/patch/undo/save/reopen. Device quality at target sizes, broader performance, and the remaining roadmap phases still need acceptance; no phase or full roadmap is complete based on this work.

## Follow-up — 2026-10-28 recorded marimba and natural strike playback

- Added VCSL Marimba from the [official VCSL collection](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Marimba), pinned at `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`. The fetch script validates the sizes and SHA-256 of 30 WAV files plus the source README and CC0 license, checks RIFF headers and probes every source WAV. Attribution identifies Versilian Studios LLC as library creator; the individual marimba performer is not named upstream.
- The source filenames' octave labels are one below measured MIDI pitch. The recipe corrects roots by 12 semitones and maps MIDI 41–96 (F2–C7), retaining soft/medium/loud recordings as separate velocity layers. It builds 30 Ogg samples totaling 432,312 bytes, with one gain across the pack and no sustain loops. The general Marimba browser entry now selects this recording pack.
- Melodic recipes can now preserve `oneShot`. Their generated faceplates expose Length, and the multisample engine applies it to natural decaying strikes. Chrome decoded all 30 samples (25.1 MiB), measured MIDI 72 at 524.59 Hz, and measured soft/medium/loud RMS 0.0088/0.0394/0.1299. Natural key-up tails remained audible (0.00393 RMS); Length at 12% reached silence in the later window.
- `npm run test:browser-marimba` and the targeted `rec_vcsl_marimba` device smoke passed. This adds one targeted instrument result; the earlier full sweep remains 108 instruments/65 effects and has not been rerun for a claimed 109-instrument full sweep.
- The catalog now has 46 packs: 39 CC0, three CC-BY-3.0 and four private Custom. The generated reference records 351 browser entries, 163 specs and 40 insert effects. Broad orchestral/world coverage and all phase exit criteria remain open.

## Follow-up — 2026-10-28 truthful note capture and actual audio slicing

- Opening/selecting the LCD note-audio editor no longer captures or replaces a sound. Capture explicitly renders the selected device, including recorded packs and existing project sample assignments. Removed the MIDI-number-to-drum shortcut and unrelated fallback recordings that could replace a melodic note with a drum or private stem. Capture failures produce an inline error.
- Audition now owns a real buffer source, uses AudioContext scheduling, applies trim/pitch/reverse/loop/envelope settings through the monitor path, and stops its source on Stop or selection change. Normalize measures the selected audio peak and reports its achieved level, bounded by the persisted 4× gain range. Pattern note writing remains available before capture and is labeled separately from transport recording.
- Sample project loading now preserves pad trim, duration, transpose, fine tuning, reverse, loop and envelope fields. Trimmed sample duration is converted from source seconds to playback seconds using its pitch rate; a trimmed loop continues until key-up rather than stopping after one pass.
- Split/chop actions now render the actual track through the offline graph and keep the returned audio-track ID. They no longer invent phrases or substitute unrelated files. To Keys creates a separate sampler with 16 actual audio slices on MIDI 60–75; the source MIDI remains intact. Empty/silent tracks fail without creating substitute audio. Capture and track-to-audio actions use the structural undo transaction.
- `npm run test:browser-note-audio` passed in Chrome: MIDI 53 marimba capture measured 175.18 Hz; opening the editor kept all sample assignments unchanged; audition started/stopped; all edited pad fields survived IndexedDB save/reopen; +12-semitone duration and trimmed-loop release were measured; empty-track rejection, actual split-track targeting, 16 playable slices and single-action undo/redo passed. The probe also renders the actual LCD skin for screenshot inspection. These are selected workflow checks, not complete editing acceptance.

## Follow-up — 2026-10-28 share metadata isolation and path preflight

- The share license gate now accepts only exact supported CC0 and CC-BY identifiers; restricted variants cannot pass by sharing a prefix. Share compilation substitutes a cleared catalog before bundling, removes private acoustic loaders from the frontend and excludes the private stems router's implementation from the API bundle. Personal builds retain their existing private-content path.
- The first expanded audit caught private stem names left in compiled API code after their files were pruned. After the build-time route exclusion, `npm run audit:share-package -- release/share-validation-marimba-20261028/dist release/share-validation-marimba-20261028/api-server.cjs` passed: 42 redistributable packs, 2,635 referenced samples and credits; no private pack files, local library or stems; all eight JavaScript/API bundles checked without private pack references. This validates staged web/API content, not a newly launched executable.
- Share pruning now requires a built entry page, validates all IDs and mutation paths before removing files, and rejects junction destinations outside the build. The regression suite exercised a real Windows junction with an unrestricted local token: 135/135 passed, zero skipped. Type checking, the normal production build, isolated share build and both API build modes passed. The full local `dist/` and API bundle are restored separately from staged share validation.
- A fresh Electron startup probe still timed out at 30 seconds before `main-loaded`/`app-ready`, with empty stderr and a blank stdout line. No app-JavaScript marker was reached; this does not establish a successful packaged launch or native VST3 integration. Phase 5 and packaged-runtime acceptance remain open.
- The compiled share web/API runtime also passed in fresh Chrome via `npm run test:browser-share -- release/share-validation-marimba-20261028/dist release/share-validation-marimba-20261028/api-server.cjs`: the app booted, served all 42 cleared packs, omitted private search rows, mounted VCSL Marimba, awaited its recordings and measured MIDI 60 at 0.05591 master peak. It requested no private audio and returned 404 for `/api/stems/list`. A screenshot of the actual compiled Rack UI was inspected. This is browser/API runtime evidence; Electron app mode remains unverified.

## Follow-up — 2026-10-28 mixed undo and note-audio editing integrity

- A mixed-history regression showed that undoing a structural edit rebuilt the graph and cleared older parameter history. Project restores now retain the journal, retain saved device IDs only while restoring history, and parameter undo resolves the current device by ID rather than a disposed device object. This keeps parameter → structural → parameter undo/redo correct without changing normal project-load behavior.
- LCD note-audio edits now use the shared journal. A button change is reversible, an eight-key slice spread is one reversible operation, and a trim drag writes one entry only on release; Escape/cancellation restores the pre-drag trim. A stale drag is guarded by device-object identity, so it cannot modify a rebuilt graph that happens to reuse the same ID.
- An explicit per-note captured/edited sample now takes precedence over an imported SoundFont multisample zone at that exact MIDI note. Loading a different whole-key sample clears incompatible bank and per-note assignments; changing metadata on the same whole-key asset preserves deliberately edited pads.
- Verification: `npm run lint` passes; `npm test` reports 141 passing, 0 failing, with one Windows-junction scenario skipped by the restricted test token. The focused Chrome mixed-undo and note-audio editor probes completed successfully; the latter now clicks the visible LCD offset control twice and verifies one-step undo/redo. Chrome project save/reopen and project-recovery probes also complete after the restoration change. A production web bundle was regenerated after the checks (79 emitted assets). This improves editor/history reliability; it does not close broader Phase 0 baselines, packaged Electron acceptance, or any remaining roadmap phase.

## Follow-up — 2026-10-28 provenance and state-path hardening

- The rack library previously exposed generic mic, articulation and voice rows as “Real Recorded Audio” even though this build ships no matching `public/samples/sample-manifest.json`. Selecting one only stored an arbitrary identifier before the generic device fell back to its non-pack voice. Those unverified rows and the claim have been removed. The browser now exposes the separately licensed recorded packs, whose source, attribution and license are shown in the device and workstation browsers.
- The engine still supports a selected sub-voice for a future verified manifest, but now carries that state through generic instrument creation, track copy, IndexedDB project reload, and the offline-render clone. The previous rack call supplied a third argument to a two-argument device factory, so voice selection was not compiled or executable. The generic percussion fallback also redeclared its velocity variable, preventing a clean TypeScript build; that has been corrected.
- LCD ADSR editing now refuses to fabricate a silent pad assignment for an uncaptured note. It tells the musician to capture a note first; a real captured pad is edited through the undo journal and restores correctly with undo/redo.
- Verification on this host: `npm test` passes 185/185 with zero failures or skips; `npm run lint` passes; the Chrome LCD ADSR, selected-sub-voice state, rack UI workflow and full 108-instrument/65-effect audio sweep probes pass; and a fresh production web build completed with 79 emitted assets. The full suite initially hit sandbox-only loopback `EACCES` errors in local import/AI/stem routes; the reviewed localhost rerun passed those same routes.
- This removes a misleading UI workflow and closes these state/undo defects. It does not make generic modeled devices performer-recorded, does not establish a sample manifest for those devices, and does not close any roadmap phase.

## Follow-up — 2026-10-28 advanced-synthesis live/offline acceptance slice

- Added two repeatable Chrome probes: one checks granular synthesis (`grain`) live and through the actual `renderSong` OfflineAudioContext path; the other checks additive/spectral (`parsec2`), west-coast modular (`complex1`), bowed physical (`friktion`), resonator physical (`objekt`) and wavetable/vector (`third_wave`) devices the same way. Every checked device rendered a measurable track signal both live and offline.
- This exercises real Web Audio and export-graph paths, not a static catalog or a mocked oscillator. It does not claim sample-exact parity (the granular engine intentionally uses stochastic grain placement), feature equivalence to commercial instruments, or completion of the advanced-synthesis phase.
- Verification: `npm run test:browser-granular` and `npm run test:browser-advanced-synthesis` passed in Chrome; the complete Node suite passed 185/185 with local loopback enabled, TypeScript passed, and the regenerated production web build contains 79 assets.

## Follow-up — 2026-10-28 shared real-time scheduling hardening

- Replaced the remaining device-owned `window.setInterval` loops in the spec-engine layer with one AudioEngine-owned, worker-backed look-ahead service. The shared service is used by granular held notes, stopped-transport clocked effects, groovebox note repeat, formant motion, and wavetable motion. Transport playback continues to service the same jobs from its normal AudioContext-time scheduler; only stopped transport uses the shared worker timer.
- The granular engine now also fills from deterministic transport ticks, so its `renderSong` path does not depend on browser timers. This fixes the architectural mismatch in which a sustained live granular key needed an individual browser timer even though the application already owns an audio-time scheduler.
- Chrome acceptance confirms granular audio while stopped, during transport, and in `OfflineAudioContext` (peaks 0.2165 / 0.2276 / 0.2193) with no granular `window` interval. A second stopped-live probe confirms clock, held-pad repeat, formant, and wavetable engines remain audible without device-owned intervals (peaks 0.3773 / 0.1392 / 0.1269). `npm run lint` passed.
- The strengthened shared-service probe also observed the stopped Alligator pattern reach step 6 and a held-pad retrigger at 1.261 s; this proves the shared callbacks advance the tempo clock and schedule more than the initial drum hit.
- Scheduler registration is deferred to the next worker/transport tick rather than invoked re-entrantly during voice construction. This fixes formant and wavetable factories that request motion before adding their voice to the pool. The acceptance probe now asserts and observed phase movement of 1.067 and 1.830 radians respectively, while granular remained audible in stopped, playing, paused, and offline paths after the fix (0.2185 / 0.2182 / 0.2228 / 0.2299 peaks).
- The same granular probe now pauses transport while a separate live key is held, waits past the former 150 ms look-ahead, and measures continued output (paused-live peak 0.2122). `pauseTransport()` now hands active shared tasks to the stopped-transport service rather than leaving them unscheduled.
- Regression verification after the change: `npm test` passed 200/200 with zero failures or skips; `node --check scripts/browser-probe-runner.cjs` and TypeScript passed; the production web build completed with 79 emitted assets.
- This is scheduling and audible-output evidence, not a claim of sample-exact offline parity for stochastic grains or exhaustive sound-design equivalence. Phase 6 and the broader production-hardening roadmap remain partial.

## Follow-up — 2026-10-28 3rd Wave wave-envelope lifecycle cleanup

- The legacy 3rd Wave wavetable voice scheduled two wave-envelope transitions but kept only its first timer handle. A note release, 24-voice steal, or device disposal could therefore leave the second callback pending. Each voice now retains and clears every outstanding wave-envelope handle, and callbacks verify that their exact voice is still the active note before changing its waveform.
- A dedicated Chrome regression creates all 24 voices, forces a 25th-note steal, releases the replacement note, then disposes the device. It records two callbacks per voice and passed only after all 50 callback handles were cleared exactly once across those lifecycle paths. `npm run lint` and the probe runner syntax check pass.
- This is a resource/lifecycle repair, not a timing-model claim. `OscillatorNode.setPeriodicWave()` has no future-time scheduling API, so the legacy wave-envelope changes still use browser callbacks and are not certified for sample-exact OfflineAudioContext parity. A future audio-clock/worklet or scheduled crossfade redesign is required before that claim can be made.

## Follow-up — 2026-10-28 Pulsar and player audio-clock routing

- Pulsar's CV LFOs no longer use `performance.now()` and a private animation-frame loop. Each value is now a pure function of an AudioContext time supplied by the CV engine; sine, triangle, saw and square waveforms retain their shapes, while sample-and-hold is deterministic per audio-clock cycle. Offline control scheduling passes its exact render time to CV sources as well.
- Chrome verified a 1.800 Pulsar sweep, exact scheduled-CV delivery of -0.9000 to a target, zero animation-frame requests for audio CV, deterministic OfflineAudioContext values, and zero CV when powered off.
- Live player generators/held arpeggiators now share AudioEngine's worker-backed realtime service instead of starting a separate 25 ms browser interval. Target assignment no longer starts an idle service while stopped, avoiding a race where a just-assigned player could retire before the first live note was registered.
- Chrome held a live MA-8 arpeggiator key and observed three generated synth notes at a 1.4502 source peak (0.2034 mixer peak) with zero player-owned `window` intervals. These checks strengthen timing ownership; full control-voltage fidelity for every legacy utility and exhaustive modulation/automation parity remain open.

## Follow-up — 2026-10-29 captured-note override and editing regression

- Per-note recorded audio is now a deliberate override layer above an imported multisample bank: it replaces only the chosen MIDI note, while neighbouring notes continue to use their bank zones. This supports replacing a particular synthetic/imported sound with a real recording without destroying the rest of the instrument.
- The LCD editor's trim gesture updates the subscribed sample state while dragging, then emits one engine-level structural update and one undo step on commit. Escape/cancel returns to the original trim. This avoids a workstation-wide structural re-render for every pointer movement.
- Verification: TypeScript passes; `npm test` reports 199 passing, 0 failing, and 2 expected Ollama-offline skips; Chrome note-audio, SoundFont-import, mixed-undo, CC0 VCSL Marimba, full built-in device/effect sweeps, project round-trip, and simulated MIDI recording probes pass. The marimba check decoded 30 recordings and measured MIDI 72 at 524.59 Hz with distinct low/mid/high velocity RMS values (0.0088 / 0.0394 / 0.1299). The production web build completed with 2,363 transformed modules in 44.16 seconds, and the Electron API bundle rebuilt successfully.
- This is focused evidence for capture/edit/import behavior, not proof that every editing control, third-party bank, external audio interface, or unfinished roadmap phase is production-complete.

## Follow-up — 2026-10-29 recorded stem-note defaults

- The optional stem-note extraction path no longer creates a `Polytone` synth track for detected bass or vocals. Drums now use the recorded Big Rusty kit's real kick/snare/hat MIDI layout, bass uses recorded Growlybass, and vocal estimates use an explicitly named recorded-piano pitch guide rather than pretending to recreate vocals.
- The samples-and-stems UI now states that Demucs separates the source audio supplied by the musician; it does not generate replacement audio. It also names the recorded target instrument and leaves the source stem unchanged.
- Verification: a new regression confirms every default is a redistributable bundled multisample pack and that a real two-note bass transcription mounts `rec_growlybass` with MIDI 45/48, not a synthetic fallback. TypeScript passes; the full suite reports 201 passing, 0 failing, with two expected Ollama-offline skips; the normal production web build completed with 2,364 transformed modules in 42.36 seconds.
- This changes only the default audition instrument for editable estimates. It does not assert source-separation accuracy, voice replacement, licensed-song import rights, or completion of Phase 7/8.

## Follow-up — 2026-10-29 Samples & Stems keyboard-modal acceptance

- The Samples & Stems dialog now has a programmatic heading, takes focus at its search field, constrains Tab and Shift+Tab to visible dialog controls, closes with Escape, stops any active audition on close, and restores focus to the control that opened it. This prevents keyboard focus from leaking into the live DAW behind a modal audio workflow.
- The workstation LOAD browser now provides the same modal behavior for real recorded-instrument, audio-file, and SoundFont loading. Its instrument-search field still suppresses global DAW shortcuts while the user types, while leaving Tab and Escape available to the modal.
- `npm run test:browser-sample-browser-a11y` and `npm run test:browser-patch-browser-a11y` mount the actual React dialogs in Chrome and verify their accessible names, initial focus, forward/reverse Tab wrapping, Escape close, and opener-focus restoration. Their local status-route stubs only isolate unavailable Express tool-capability checks; no audio or model behavior is mocked. The existing Chrome SoundFont acceptance also passed: Test Piano imported, rendered live and offline, retained velocity/filter/envelope/loop/choke behavior, and survived a `.unbox` archive round trip.
- Verification: TypeScript and both new Chrome probes pass; the complete Node suite reports 201 passing, 0 failing, and 2 expected Ollama-offline skips. This closes two targeted Phase 9 accessibility gaps; broader screen-reader, keyboard, desktop-runtime, long-duration, and packaged-app acceptance remain open.

## Follow-up — 2026-10-29 CV Matrix UI scheduling hardening

- Removed the CV Matrix panel's 40 ms browser interval and per-tick React render. The matrix now publishes only structural device/mapping revisions; the live bipolar meter reads the existing CV value through the shared `useFrame()` loop and writes only changed DOM width/ARIA values.
- The change preserves actual CV processing: `CVEngine.tickCV()` is still called by AudioEngine's shared real-time task while stopped and the transport scheduler while playing. It does not emit UI notifications from that real-time path.
- New Node coverage verifies structural revision notifications do not fire from a live CV tick. The new Chrome UI probe mounts the actual matrix, adds/removes a route, measures a +0.40 V value as a 70.0% meter, and asserts zero `window.setInterval` calls. The existing shared-CV Chrome probe passes three AudioContext-time LFO updates over a 0.2080 range and verifies the task retires with its cable; its acceptance window now allows a cold worker up to 600 ms while retaining the three-update requirement.
- Verification: TypeScript passes; the complete Node suite reports 202 passing, 0 failing, and 2 expected Ollama-offline skips; the production web bundle completed with 2,364 transformed modules in 20.39 seconds. This advances Phase 1/9 timing and UI hardening, not complete CV/modulation or production acceptance.

## Follow-up — 2026-10-29 deterministic convolution rendering

- The real Stack Guitar Amp and Low End Bass Amp cabinet paths already use Web Audio `ConvolverNode`s, but their procedural cabinet impulse added `Math.random()` noise for every audio context. An offline export could therefore have a subtly different cabinet colour than live playback. Cabinet IR generation is now seeded by cabinet selection and stereo channel, so it is stable across live and OfflineAudioContext renders while each cabinet remains distinct.
- The same non-determinism existed in the flagship RV7000 reverb impulse and the outboard convolution-send fallback. Those generators now use the same local deterministic PRNG. Existing RV7000 cloning still retains the exact live response; deterministic construction additionally makes reopen/rebuild and independent offline graphs reproducible.
- Chrome's real effects-response probe measured the normal EQ, reverb and dynamics checks and verified an independent RV7000 live/offline graph has an identical 153,600-frame impulse. It also verified a 4×12 cabinet is byte-stable across contexts and differs from a 1×12 at 3,838 samples. The measured compressor remains near unity below threshold and -16.70 dB above threshold / under an external key.
- Verification: `npm run lint`, `npm run test:browser-effect-response`, and a production `npm run build` passed (2,364 transformed modules, 35.68 s). This makes the implemented convolution processors reproducible; it is not a claim of captured commercial cabinet IRs, exhaustive IR loading, or completion of Phase 8/9.

## Follow-up — 2026-10-29 proxy-preview scheduling

- The browser-side VST library is correctly labelled as proxy DSP, but its faceplate polled every 250 ms with a component-owned interval solely to notice that a recorded preview ended. It now uses the app's shared frame loop and only updates React state when `VstPluginDevice.isPreviewing` changes.
- A Chrome regression mounts the actual faceplate with a controlled preview lifecycle, verifies both start and completion labels, and asserts zero `window.setInterval` calls. This preserves the explicit proxy label; it does not suggest native third-party VST execution.
- Verification: `npm run lint`, `npm run test:browser-vst-faceplate-preview-ui`, and `npm run build` passed (2,364 transformed modules, 47.38 s). This is a narrow Phase 9 UI scheduling repair; recorder punch timing, native VST hosting and the broader production-hardening gates remain open.

## Follow-up — 2026-10-29 RV7000 power-path repair

- The complete Chrome audio-device sweep uncovered a real lifecycle defect: 109 instruments and 64 effects emitted sound, but RV7000's raw reverb output was audible while its generic bypass-wrapper output could remain measurable after power-off. An isolated check confirmed the wrapper's residual tail.
- RV7000 now owns its existing dry/wet branches' power and bypass state, rather than being wrapped as a generic legacy effect. Power-off explicitly mutes both branches; bypass supplies the direct input; its offline clone carries the same power/bypass state and the exact live IR. This fixes the published output path instead of weakening the measurement threshold.
- The isolated Chrome check now passes bypass, silence-on-power-off, and repower. The original long-order sweep also passes: all 109 playable instruments and 65 effects instantiate and emit in the shared Web Audio context. The focused response probe continues to measure RV7000's 1.54 / 3.20 / 3.84 s size responses and a deterministic 153,600-frame live/offline impulse.
- Verification: TypeScript passes; the full local suite reports 241 passing, 0 failing, and 2 expected Ollama-offline skips; `npm run test:browser-devices`, `npm run test:browser-effect-response`, and production `npm run build` passed (2,370 transformed modules, 46.27 s). This closes one concrete effect lifecycle defect, not Phase 3/8/9 completion.

## Follow-up — 2026-10-29 cold transport-start scheduling

- A first live/offline parity run revealed that an organ arrangement could be silent on a cold start. The cause was not the recorded organ: if a worker callback arrived after the initial 40 ms look-ahead, the scheduler could place the first note and its already-ended note-off entirely in the past.
- The transport scheduler now rebases an overdue `nextNoteTime` to the current AudioContext time before scheduling a step. It therefore starts the queued arrangement at the first available audio instant instead of silently consuming an expired event. This also protects an occasional main-thread stall at transport startup.
- A dedicated Chrome regression starts the real transport, deliberately blocks the test page's main thread for 700 ms while AudioContext time continues, then observes the first arranged Subtractor note at a 0.2172 peak. The full live/offline parity matrix subsequently passes: recorded organ paths through gain, EQ, compression (including -19.29 dB sidechain reduction), delay and reverb, plus recorded drums, remain within its 20% RMS tolerance.
- Verification: TypeScript passes; `npm run test:browser-transport-cold-start` and `npm run test:browser-audio-parity` pass. This is a concrete Phase 1 transport reliability repair, not an assertion of sample-accurate timing after arbitrary long browser suspension or completion of the roadmap.

- Final regression for this repair: production `npm run build` completed with 2,370 transformed modules in 20.50 seconds. The full local suite reports 246 passing, 0 failing, and 2 expected skips because Ollama is not running. These checks include the local stems, recording, import/export, project, reference-catalog and timing suites; they do not substitute for the separate 10-minute browser soak or packaged-Electron acceptance.

## Follow-up — 2026-10-29 source-separation disclosure

- The optional splitter processes only the audio the musician selected: local DSP derives stems and local Spleeter/Demucs can analyse the same supplied source. Neither path creates a new song, performer, instrument, replacement sound, or generated waveform. UI labels, progress states, actions, and completion messages now call this “source separation” and say that plainly.
- This is not merely a wording claim: precision regressions require the 4-, 6-, and 8-stem outputs to reconstruct the source at unity gain, and the chunked/single-pass result to be invariant. The user-facing Samples & Stems modal still passes its real Chrome focus/keyboard acceptance after the disclosure change.
- Verification: TypeScript and `npm run test:browser-sample-browser-a11y` pass. The recorded-instrument workflow remains separately licensed/provenanced; source separation does not grant rights to use or distribute commercial songs.

- Final regression: `npm test` reports 246 passing, 0 failing, and 2 expected Ollama-offline skips; production `npm run build` completed with 2,370 transformed modules in 45.72 seconds.

## Follow-up — 2026-10-29 recorder punch-boundary scheduling

- Replaced the recorder controller's 40 ms auto-punch poll and wall-clock post-roll timer. Audio takes now send the punch-out AudioContext frame to `unbox-recorder`; the worklet trims its final render quantum at that exact frame before reporting completion. MIDI-only takes, count-in state, and post-roll transport stopping use zero-gain scheduled native audio sources, so the controller transition follows the same audio clock without making sound.
- A focused Chrome worklet probe captured a live constant signal and verified the requested punch edge at frame 15,488 exactly (within its one-frame assertion). Node coverage makes `window.setInterval` and `window.setTimeout` throw, then verifies MIDI-only punch-out schedules one silent native alarm at the exact grid time. The existing simulated MIDI controller recording and IndexedDB reopen acceptance still pass.
- Verification: TypeScript passes; `npm run test:browser-recorder-frame-stop`, `npm run test:browser-midi`, and the full local suite pass (247 passing, 0 failing, 2 expected Ollama-offline skips); the production build completed with 2,370 modules in 44.81 seconds. This strengthens Phase 1/9 recording timing; real input-driver latency, complete hardware acceptance, long-duration desktop stability and all roadmap phase gates remain open.

## Follow-up — 2026-10-29 10-minute browser audio endurance

- The full `npm run test:browser-soak` acceptance ran the real Chrome Web Audio graph for 600 seconds with four instruments, delay, and reverb. Song position and AudioContext time had 0.000% drift; the wall/audio delta was 0.22%; every one-second signal window contained audio; and no render gap exceeded the 500 ms threshold (maximum 170.7 ms).
- The probe observed one long main-thread task (756.0 ms maximum) and a 4.6 MB heap increase. Those values are recorded as the current Windows/Chrome baseline, not generalized as a guarantee for every device, project, driver, or packaged desktop environment.
- This completes this particular browser-duration evidence run for Phase 9. Packaged Electron launch/recovery, broader physical-hardware matrices, accessibility-assistive-technology checks, plugin-host crash isolation, and the remaining roadmap acceptance criteria remain open.

- The independent Chrome project-recovery regression also passes: malformed, future-version, unsupported-device and incomplete VST imports leave the open session intact; recovery and interrupted Save As restore the intended IndexedDB project without overwriting another project.

## Follow-up — 2026-10-29 Electron readiness probe repair

- The isolated Electron readiness test previously passed a fixture directory and a separated `--user-data-dir` argument. On this Electron 45/Windows host that invocation could silently exit without loading the fixture main process, producing a misleading 30-second timeout. The harness now passes `main.cjs` explicitly and uses `--user-data-dir=<path>`; `npm run test:electron-startup` proves both `main-loaded` and `app-ready`.
- The next utility-process boundary now reaches its intended failure: Electron rejects the prototype’s `SharedArrayBuffer` message as non-cloneable. That is not hidden or reclassified as VST success. A compatible Electron transport must use an explicitly supported mechanism and still requires real-time DAW/audio-device integration, plugin state/editor support, crash isolation and compatibility acceptance.

## Follow-up — 2026-10-29 real rack UI workflow

- The actual React rack workflow passes in Chrome: it added a CC0 recorded acoustic guitar and a stereo delay from the library, verified the stereo auto-patch path, measured a 0.0255 routed guitar peak, performed undo/redo through the File menu, saved, reloaded, and retained both devices plus their cables.
- This is end-to-end UI/project evidence for a recorded instrument and an insert effect; it does not assert native VST3 execution, broad accessibility coverage, or completion of Phase 2/9.

- Final local baseline after the Electron probe regression: `npm run lint` passes; `npm test` reports 250 tests, 248 passes, 0 failures, and two expected skips because the optional local Ollama service is not running.

## Follow-up — 2026-10-29 real Electron desktop smoke

- Added `npm run test:electron-desktop-smoke`. It launches the actual `electron/main.cjs` entry with an isolated user-data directory, keeps its BrowserWindow hidden, waits until the main process has loaded the real app URL, fetches the served `index.html`, confirms the React-rendered Unbox title bar after two animation frames, and terminates only the process tree it created.
- The source desktop smoke passed at `http://127.0.0.1:47821/`; the fixed-port listener was absent after teardown. The normal app is unaffected because its smoke URL handshake is enabled only when the test environment variable is present.
- This advances the source-desktop launch/recovery baseline. It is not packaged-EXE, installer, physical-audio-device, or release-candidate acceptance; those Phase 9 gates remain open.

## Follow-up — 2026-10-29 faceplate audition timing

- The timing audit found that interactive device-faceplate audition buttons called `noteOff` from `setTimeout`. Those releases can be late whenever the renderer is busy, contrary to the AudioContext-time scheduling rule.
- Added `src/audio/audition.ts`; it schedules paired note-on/off calls on a device's audio clock with one shared start time for chords. The raga/taal selector, classic synths, world instruments, physical-model faceplates, and Reason-style faceplates now use it. `tests/auditionTiming.test.ts` checks precise clock scheduling and invalid-duration bounds. No faceplate `setTimeout` now drives `noteOff`; Third Wave retains a timer only for its cosmetic button state.
- Verification: `npm run lint` and the complete Node suite pass (253 passing checks, two expected local-Ollama skips).

## Follow-up — 2026-10-29 Matrix CV audio-time scheduling

- Matrix's old short gate used a wall-clock `setTimeout`, and the single mutable CV fields could let a future scheduler look-ahead step overwrite the currently audible note/curve value. That also made live gate behavior disagree with offline rendering, where the wall timer never ran.
- Matrix now stores timestamped CV steps and its port getters evaluate them at the supplied audio time. The gate ends exactly 70 ms after its scheduled step, future steps remain inactive before their time, and note/curve values from two queued steps stay distinct. `tests/matrixAudioTiming.test.ts` covers both cases; no Matrix audio/CV path uses a JavaScript timer.

## Follow-up — 2026-10-29 real-time bounce audio-clock boundary

- The real-time bounce path had the same category of timing defect as the earlier recorder: it used wall-clock `setTimeout` calls for both song duration and the reverb/delay tail. That could stop a tempo-mapped arrangement before its final scheduled step when the UI timer drifted.
- `bounceRealtimeWav()` now derives the duration from `ProjectTimeMap`, anchors it at `nextNoteTime` (the first scheduled transport instant), calls `WorkletCapture.stopAt()` with its exact tail-frame boundary, and uses a zero-gain native audio-clock alarm solely for the subsequent JavaScript transport state change. No bounce body or tail timing uses a renderer timer.
- `tests/audioClockAlarm.test.ts` verifies the alarm's requested frame, stale/invalid target normalization, cleanup, and the absence of a bounce timeout. The new real Chrome bounce probe uses a tempo change that would have made the former root-BPM wall timer cut 375 ms early; it captures a 2.865 s WAV for the 625 ms body plus 2 s tail and observes 2.680 audio-clock seconds. The exact-frame recorder probe still cuts at its requested frame, and the real IndexedDB save/reopen probe preserves Matrix/CV state with 0.187 live / 0.393 offline peak. TypeScript and the full local suite pass (290 checks, two expected local-Ollama skips). This is timing hardening, not proof that every device tail, native plugin, or packaged app has production acceptance.

## Follow-up — 2026-10-29 production vendor dependency repair

- Production's two manually assigned general-purpose vendor chunks formed a Rollup cycle (`vendor-core → vendor-ui → vendor-core`). That was a genuine load-order warning, not a warning-threshold issue. The split now keeps React, Motion, and their shared helpers in one `vendor-runtime` chunk; the production rebuild emits no circular-chunk warning.
- A 1.00 MB local transcription-model chunk remains intentionally dynamic. It is not preloaded by `index.html`; the built audio-engine chunk is its only dynamic importer. This records the remaining performance work honestly instead of shifting the warning limit.
- The production bundle builds successfully and the source Electron smoke serves/mounts it. This does not test a portable executable or establish packaged desktop performance.

## Follow-up — 2026-10-29 measured advanced devices and effect-behaviour sweep

- The advanced-synthesis browser acceptance now covers Granule as well as additive/spectral, west-coast, bowed physical, resonator physical and wavetable/vector devices. Each was non-silent in live Chrome and an OfflineAudioContext; Granule measured 0.2231 / 0.2298 peak, live/offline.
- The pitch-correction acceptance continued to pass: 205 Hz corrected to 195.98 Hz in C major and 207.62 Hz in A major, with a 195.99 Hz offline clone result. A CC0 Bear Sax MIDI-61 source shifted both down and up in its selected keys.
- The full Web Audio sweep passes 109 playable instruments and 65 effects. The complete effect-behaviour pass measured no more than 0.044% dry-bypass RMS error, all 43 response-tested processors changed their stimulus, and all 25 utilities passed their routing/control checks.
- During the audit, a stale RV7000 test monkey-patched `AudioContext.createGain` despite the device’s own dry/wet power/bypass graph. Separate failures read analyser history while a pad, polarity, or patchbay gain was still smoothing. The test now waits through the relevant AudioParam transition plus a fresh analyser window; targeted isolation confirms RV7000, the −15 dB DI pad, polarity inversion, and isolated patchbay Off routing without relaxing behavior thresholds.
- This is browser-engine evidence only. It does not certify every tail/automation sequence, acoustic sound quality, native VST hosting, physical audio I/O, or packaged desktop execution.
- Verification: TypeScript passes; the Node suite reports 290 passes, 0 failures and 2 expected local-Ollama skips. The advanced-synthesis, pitch-correction, full device-audio, and full effect-behaviour Chrome probes pass.
