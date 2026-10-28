# CLAUDE.md — Unbox Studio (NexaStudio DAW)

Browser + Windows desktop DAW with a Reason-workflow modular rack (3 columns). Everything you hear is rendered
by the **Web Audio API** in one shared `AudioContext`. The app ships its own plugin / sample
library (`public/library/`, built from a read-only scan of `D:\vsr`); playing music never needs an
external folder.

- Frontend: React 19, Vite 7, Tailwind 4 (`@tailwindcss/vite`), lucide-react icons. Fonts ship with
  the app (`@fontsource/*` dev dependencies imported in `src/main.tsx`; no Google Fonts), app icon
  `public/favicon.svg` (rendered to `build/icon.png` for electron-builder).
- Server: Express 4 run with `tsx` (`server.ts`), hosts `/api/*` (Gemini AI + library) and serves
  the app (Vite middleware in dev, `dist/` in production) and the library bundle at `/library`.
- Desktop: Electron 33 (`electron/main.cjs`) → portable `release/Unbox-Studio.exe`; it embeds the
  same API via the esbuild bundle `electron/api-server.cjs` (fixed loopback ports 47821–47825 so
  IndexedDB projects survive restarts).
- AI provider: Google Gemini via `@google/genai` (server-side only, key in `.env`). Every AI
  feature has a local fallback.
- TypeScript 7 (`tsc` is the native compiler; `strict` is on by default).

## Commands

| Task | Command |
| --- | --- |
| Dev server (app + API) on http://localhost:3000 | `npm run dev` (`PORT=3123 npx tsx server.ts` for a spare port) |
| Type check | `npm run lint` (= `tsc --noEmit`) |
| Production web build → `dist/` | `npm run build` |
| Scan `D:\vsr` → `data/vsr-manifest.json` (~2–6 s, 42k files) | `npm run scan:vsr` (`-- --root "E:\x" --out data/x.json`) |
| Build the in-app library → `public/library/` | `npm run bundle:library` (after a scan; Rescan in the app does both) |
| Build a recorded instrument pack → `public/instruments/<id>/` | `npm run instrument -- sfz\|recipe\|chop\|list\|remove …` (scripts/instruments/README.md) |
| Bundle the API for Electron → `electron/api-server.cjs` | `npm run build:api` |
| Run desktop app from source | `npm run electron` or `run-app.bat` |
| Build portable exe (yours, with the in-app library) | `build-exe.bat` (= `npm run dist:win`) → `release/Unbox-Studio.exe` |
| Build the exe to give to other people | `npm run dist:win:share` → `release/Unbox-Studio-Share.exe`: `vite build --mode share` (flag `__UNBOX_SHARE__`: only CC0 / CC-BY packs become devices, `shared/instruments/packs.ts`), then `scripts/prune-share-build.ts` deletes `dist/library` (your D:\vsr previews), `dist/stems` (song stems) and the non-redistributable packs' files; the API bundle gets the same flag. Run `npm run dist:win` (or `build:api`) afterwards to get the full local build back |

**Type-check baseline: 0 errors**, and `npx tsc --noEmit --noUnusedLocals` reports only unused
`React` default imports (harmless with the JSX transform). Keep both clean.

## Verifying changes (no test suite)

- Pure logic (scanner, planner, validator, cable physics, MIDI tools): small `npx tsx` scripts in
  the session scratchpad. Use `.mts` files (the scratchpad has no `package.json`) and import project
  files with `file:///C:/...` URLs. Modules that import the engine need a browser — test those in
  the page instead.
- UI: start the dev server, then drive the real app with **`playwright-core` installed in the
  scratchpad** using the installed Chrome:
  `chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' })`,
  args `--autoplay-policy=no-user-gesture-required --use-fake-ui-for-media-stream
  --use-fake-device-for-media-stream` (recording tests). Look at the screenshots. Check console
  errors (a `favicon.ico` 404 is expected and harmless).
- To reach the engine from a test: `await import(url)` where `url` is the exact
  `/src/audio/AudioEngine.ts?...` entry from `performance.getEntriesByType('resource')`; same trick
  for other modules. After an HMR edit, importing the bare path creates a **second** engine.
- **Any source edit reloads the page** (HMR / dependency optimisation) and kills a running probe:
  don't edit `src/` while a long browser test runs.
- Measure audio, don't guess: analyser peaks on `dev.audioOutputs.get('out_l')`, `engine.masterLevels()`,
  offline renders (`renderSong`) + `measureLoudness`; exports can be checked with `ffprobe`.
- Playwright `locator.click()` on a patched jack times out (the cable's hit path covers it); use
  `page.mouse`.
- Stop the dev server by the port's listener (PowerShell:
  `Get-NetTCPConnection -LocalPort 3123 -State Listen | % { Stop-Process -Id $_.OwningProcess }`).

## Directory map

```
server.ts                 Web entry: dotenv + createApp() + Vite middleware (dev) / dist static (prod)
server/
  createApp.ts            Express app: JSON body, static /library, /api/vst, AI router, /api 404
  electronEntry.ts        startDesktopServer(): same app + dist/, fixed loopback port (→ api-server.cjs)
  routes/aiRoutes.ts      POST /api/ai/combinator (prompt → validated RackPatchPlan),
                          /api/gemini/generate-preset (device params in, validated values out),
                          /api/gemini/mix-master-assistant (text notes on MEASURED numbers). AI rate limit.
  routes/vstRoutes.ts     /api/vst/manifest | status | search | rescan | file/:id | host/status
  vst/scanner.ts …        Read-only D:\vsr scan (PE headers, NI metadata, media headers) → manifest
  vst/appLibrary.ts       Manifest → in-app bundle (library.json without local paths + audio copies)
  vst/manifestStore.ts    Bundle first (auto-built from the raw scan); rescan = scan + bundle
shared/                   Pure TS (no DOM, no Node APIs) — imported by server AND browser
  vst/*                   Manifest schema, categories, search
  rack/devices/*          DeviceSpec catalog: 56 classic-rack + 44 hardware emulations (params, ports, pads);
                          names are original (no trademarks) — type ids keep their old names
  rack/builtinCatalog.ts  Devices the AI may use (real port ids, param ranges) + library unit ports
  rack/patchPlan.ts       RackPatchPlan schema + validatePlan(); localPlanner.ts = offline planner
  rack/presetCraft.ts     Preset crafting: validatePreset() (known keys, clamped) + keyword-rule fallback
public/library/           GENERATED in-app library (library.json + audio/<id>.<ext>), git-ignored
public/instruments/       Recorded instrument packs (instrument.json + samples/*.ogg), index.json, CREDITS.md —
                          built by scripts/instruments; shipped with the app (CC0 / CC-BY only in share builds)
shared/instruments/       Pack schema + parsePack() (types.ts); catalog.ts = GENERATED pack list (one device each)
scripts/instruments/      Pack tool: SFZ reader (sfz.ts), GitHub/disk sources, recipes, chop, mixer/encoder (pack.ts)
data/vsr-manifest.json    GENERATED raw scan (absolute paths), git-ignored. Never hand-edit.
src/
  App.tsx                 State hub: the 3 workspace tabs, pages, rack face, selected part, global shortcuts, overlays
  shell/                  AppShell (title bar: logo + main menu + tabs; pages as overlays), TransportBar
                          (docked at the bottom), uiStore (KEYS piano/commands, sequencer tool, split)
  workstation/            Tab 1: WorkstationPanel (PartList, LcdEditor, QuickControls, side buttons,
                          WorkstationKeyboard), PatchBrowser (LOAD), EditWindow, swapPatch, partState,
                          midiControls (hardware knobs / fader / buttons → workstation, MIDI Learn)
  ui/skin/                Skin components: RingKnob, LevelBar, MetalPanel / Lcd / LedButton / PanelButton
  nexa/StepEditor.tsx     Step grid (melodic rows or drum lanes from drumLanes.ts)
  nexa/useEngine.ts       useEngineVersion (structural re-render) + useFrame (rAF, no React state)
  studio/sections.ts      PageId list (pages open over the tabs from the main menu); StudioPages renders pages/*
  studio/pages/           Projects, Devices (instruments/drums/synths/samplers/effects/patchbay),
                          Meters, Mastering, Export, Settings (audio output, monitor section, MIDI)
  audio/AudioEngine.ts    Singleton engine: devices, cables, tracks, transport, scheduler, live notes
  audio/BaseDevice.ts     Device base (ports, audio/CV maps, params, power/bypass, cloneForOfflineContext?)
  audio/spec/             SpecDevice (DeviceSpec + DSP engine), registry (EngineId → factory), engines/*
  audio/devices/*.ts      Legacy built-ins (Subtractor, Thor, Europa, Redrum, Mimic, world instruments…)
  audio/sequencer/        model.ts (patterns, clips, ticks, resolveSource/hitsInWindow), editor.ts
                          (SequencerEditor = engine.sequencer, every edit), midiTools.ts (quantize…)
  audio/mixer/            MixerController (channels, strips, sends, buses, VCA, groups, solo), channelStrip,
                          routing, MixBusDevice, MonitorController (A/B, dim, mono, cal EQ, output device)
  audio/clips/            audioStore (decoded audio, IndexedDB), AudioTrackDevice, ClipVoices, clipMath
  audio/recording/        InputManager (devices, input chain), RecordController (audio/MIDI takes,
                          cycle, count-in, latency compensation), recorderWorklet ('unbox-recorder')
  audio/automation/       Lanes (normalized points) for strip / send / device / tempo targets
  audio/render/renderSong.ts Offline mirror of the live graph for exports and analysis
  audio/export/           exporter (mix / stems / MIDI), wav, flac, compressed (MP3 lamejs, Opus/AAC
                          WebCodecs), midi
  audio/analysis/         loudness.ts (BS.1770, true peak, LRA), MeterHub + meter worklet
  audio/mastering/        MasteringChain (EQ M/S, multiband, saturation, exciter, imager, clipper,
                          limiter), assistant.ts (measured analysis + auto-master), ReferencePlayer
  audio/expression.ts     Pitch bend / mod wheel for every instrument (see below)
  audio/midi/MidiInput.ts Hardware MIDI inputs: ports, status (blocked / busy), live held keys + wheels
  audio/levelTrim.ts      Per-type output calibration of instruments
  project/                ProjectManager (IndexedDB projects, autosave, versions, .unbox zip), templates
  components/             Faceplates, mixer/ (StudioMixer console, ConsoleStrip, ChannelInspector, EqCurve),
                          sequencer views (piano roll, arrangement, clip launcher), AI Co-Pilot drawer,
                          CV matrix, F8 MIDI tools, palette, shortcut help
  clipEditor/             Tab 3: MixerTab (console + divider + editor), ClipEditorArea (Clip tab + the
                          SequencerView editors as tabs), ClipFocusEditor, AudioClipEditor (handles on the wave)
  rack/                   ModularRack (3 columns), rackColumns/rackLayout (column + order + fold per unit,
                          project section `rackLayout`), RackChannelList, RackNavigator, cables, rear panel,
                          Combiner frame (CombinatorFrame), library browser, faceplates
  vst/                    libraryClient (bundle-first manifest, audition), VstPluginDevice, proxyDsp
  ai/rackCombinator.ts    requestRackPlan() (server → in-app fallback) + applyRackPlan()
electron/main.cjs         Starts api-server.cjs; falls back to a static-only server if it's missing
docs/reference-cpp-dsp/   C++ reference headers — NOT compiled, documentation only
```

## Core architecture

### AudioEngine is the single source of truth
- `audioEngine` owns `devices` (Map, insertion order = rack order), `audioConnections`,
  `cvConnections`, `tracks`, `rackGroups`, transport and the sub-controllers `mixer`, `monitor`,
  `sequencer`, `recorder`, `automation`, `mastering`, `meters`, `reference`, `clipVoices`.
- React never mutates engine arrays directly; use the engine / controller APIs. Components
  re-render through `audioEngine.subscribe()` (App.tsx) or `useEngineVersion()`. `notify()` /
  `changed()` / `commitEdit()` are structural only — never per frame.
- `createDevice`/`createVstDevice` auto-create a sequencer track and auto-patch **playable
  instruments** to the master (`isPlayableInstrument` per DeviceType). `registerDevice` also adds
  the bypass shim (legacy effects), the level trim and the expression hook (instruments) and the
  automation-recording `setParam` wrapper.
- Projects: `ProjectManager` keeps projects in IndexedDB (`unbox-studio`), autosaves, versions,
  `.unbox` zip import/export. Extra state joins the project file through
  `engine.registerProjectSection(key, { save, load(data, idMap) })` (mixer, automation, mastering,
  project).

### Devices and ports
- Every device extends `BaseDevice` and declares `ports`. Stereo audio ids: `in_l`, `in_r`, `out_l`,
  `out_r`. CV inputs `cv_*`; CV outputs are named (`lfo1_out`, `note_cv`, `gate_cv`, `env_out`…).
- Spec devices (most of the lineup) are data: `shared/rack/devices` → `SpecDevice` + an engine from
  `src/audio/spec/engines` (poly, wavetable, fm, westcoast, modal, sampler, groove, drums, dynamics,
  eq, distortion, modulation, time FX, players…). Faceplates are generated (`SpecFaceplate`).
  Player devices (arps, generators) sit on an instrument and transform its notes (`NoteRouting`).
- The master bus is the pseudo device `'master'` (`master_l`/`master_r`, many cables; each source
  cable carries the `stripId` of its mixer channel). The rack draws it as the Hardware Interface.
- Library units (`VstPluginDevice`) run **proxy DSP** (always labelled) — no native plugin code.

### Sequencer
- Each track has an unlimited `patternList` (≤ 1024 steps each, step division per pattern) and
  `arrangementClips` (`pattern` | `notes` | `audio`, up to bar 100 000). Ticks: 12 per 16th.
- Modes: `song_arrangement` (clips) and `pattern_loop` (active patterns). Edits go through
  `engine.sequencer` (SequencerEditor) and `commitEdit()` (sequencer undo history).
- Scheduler: worker timer + look-ahead; `scheduleStep(pos, time)` fires queued clip launches
  (`launchQuantized(key, grid, trackIds, run)` — 1 bar / 1 beat / now; launched patterns restart
  from step 1 via per-track launch origins), automation, metronome, CV, then each track's hits
  (`resolveSource` → `hitsInWindow` → `playHit`: chance, micro-timing, ratchets, chords).
- Graph & CC lanes (`track.graphData`) are **sparse**: `null`/missing = no value, so the device's
  own knob rules. Lanes: velocity multiplier (legacy; the editor draws note velocity), pitch
  (semitones), cutoff, resonance — applied live and in exports.

### Mixer, recording, automation, export, mastering
- `MixerController`: channels (tracks, rack channels, buses, returns), strips with inserts / sends
  (pre/post) / pan / width, VCA, groups, solo-in-place; routing avoids loops. The monitor section
  after the master never reaches exports.
- Channel EQ (HP, low shelf, 2 bells, high shelf, LP) and dynamics (compressor + gate) live in
  `channelStrip.ts` after trim / polarity: `settings.eq` / `settings.dyn` (clamped by `eqOf` /
  `dynOf`), switched with dry / wet gains; an off HP / LP is an all-pass. The `unbox-dynamics`
  worklet is attached on first use (`strip.dyn.ready`; `renderSong` awaits it), so the same strip
  graph makes exports match. `setEq` / `setDyn` don't save — the UI calls `changed()` on commit.
- Audio tracks play clips through `ClipVoices` (per 16th). Recording uses the `unbox-recorder`
  worklet (frame-accurate) with latency compensation; MIDI takes write notes or note clips.
- Automation lanes ramp AudioParams per 16th; device params update 4× per 16th; a tempo lane drives
  the BPM. Live knob moves are recorded in touch/latch modes.
- Exports (`exporter.ts`) render offline with `renderSong` (devices cloned with level trims, strips,
  sends, buses, automation, CV, players, master chain incl. mastering) → WAV/AIFF/FLAC/MP3/Ogg/AAC,
  stems, MIDI; optional LUFS / peak normalisation.
- Mastering chain on the master; `renderOverride` lets analysis render with other settings.
  `assistant.ts`: `analyzeMix` (offline render → LUFS, true peak, LRA, octave spectrum + slope,
  correlation) and `autoMaster` (rule-of-thumb settings, re-render until ±0.5 LU of the goal).
- Freeze / bounce in place: `freezeTrack()` renders one channel offline (`renderSong` with
  `onlyChannels`), places it on a new audio track (`frozenFrom`) and disables the instrument
  (`frozenBy`); `unfreezeTrack()` reverses it. One undo step each.
- Delay compensation slot: `track.offsetMs` (Channel inspector · Timing) shifts that track's notes
  and audio clips live and in every offline render. Positive plays later, negative earlier.
- Kick duck (`audio/mixer/duck.ts`): `track.duck` = { amount, releaseMs, source }. `source` is a part's
  device id (its hits trigger the dip, also when that part is muted); without a source the dip follows the
  drum parts' beats. Live (`scheduleStep`) and exports (`renderSong`) both call `applyDucks`.
- Clip edges (`clips/clipVoices.ts`): a cut edge inside a recording gets a ~6 ms fade; two audio clips
  that touch (a split, or butted takes) crossfade over the same 6 ms, so the seam never pops.
- Strum (`SequencerNote.strum`, ms 0–40): a chord's notes start that far apart, lowest first (live and in
  exports, via `playHit`). F8 · STRUM sets it on the chords of the selected pattern.
- Right-click a knob → "Create automation lane" (`components/AutomateMenu.tsx`, `AutomationController.createLane`):
  the lane goes under the knob's track. Knobs with it: spec device faceplates, the Workstation LCD and quick
  knobs, mixer channel pan / width / trim / sends. A device outside every track's chain (returns, buses) has
  no track to show the lane under, so the menu says so.

### Load audio (any instrument)
`audio/deviceSamples.ts` lets an audio file be any instrument's sound: keys mode (one file across the
keyboard, resampled from its root note — `detectPitch` finds it — with tune / level / attack / release /
loop) or, on kits (`drumLanesFor`), one file per pad note (one-shot; other pads keep their sound).
`installSampleVoice` wraps noteOn / noteOff in `registerDevice` between the level trim and
`installExpression` (so bend / vibrato apply and the voice feeds the trimmed outputs); `renderSong`
installs it on offline copies, so exports play the files. Assignments: project section `deviceSamples`
(audio in the audio store; `projectAudioIds` bundles it in `.unbox` archives). UI: `rack/DeviceSampleBar`
above every instrument panel (via `DeviceFront`; drop a file anywhere on a keys instrument) and the LOAD
browser's "Audio file" source (+ "keys" on library samples).

### Expression (pitch bend / mod wheel)
`installExpression(dev)` wraps an instrument's `noteOn`: oscillators and buffer sources it creates
during that call get the device's expression bus on their `detune` (summed with the engine's own
detune; disconnected on `ended`). `setPitchBend(dev, −1..1)` = ±2 semitones on held and new notes;
`setModWheel` drives `cv_mod` when the device has one, else vibrato. Hardware MIDI: pitch bend,
CC1, CC64 sustain are handled in `handleMidiMessage`.

### Hardware MIDI
`audioEngine.midi` (`audio/midi/MidiInput.ts`) opens every input port explicitly (a port held by
another program shows "in use", a refused permission shows "MIDI blocked" + Ask again) and re-binds
on hot-plug. Notes on any channel go to `engine.midiTarget()` (the selected part, else the first
instrument) through `handleMidiMessage`; other CCs go to `midi.onControl` listeners —
`workstation/midiControls.ts` maps them (defaults: CC 21–26 big knobs 1–6, 27 part pan, 28 master,
49 part level = a Novation Impulse in MIDI mode; transport buttons only via MIDI Learn, since the
Impulse's buttons send nothing fixed) and keeps the map in localStorage (`unbox.midiControls`).
The UI never gets an event per message: it polls `midi.version` / `midiControlChanges.version` /
`midi.lastActivity` in `useFrame` (Workstation keys + wheels, quick knobs, part level, LCD, the
transport MIDI LED). Settings · MIDI shows ports, the map with Learn / Clear, and an activity log.

### Workspace and skin (Unbox Studios look)
- Three tabs (`shell/AppShell.tsx`): **Workstation & Sequencer** (workstation panel + light song
  sequencer), **3-Column Rack**, **Mixer & Clip Editor** (console with the channel inspector, a
  divider (uiStore `mixSplit`), and the Clip Editor: "Clip" edits the clip selected in a timeline —
  `shell/clipFocus.ts`, set when exactly one clip is selected — plus the SequencerView editors as
  tabs (`hideViewTabs`)). Pages (Projects, Devices, Meters, Mastering, Export, Settings) open over the
  tabs from the main menu.
- Workstation parts = instrument tracks. The selected part (App `selectedPart`) is the MIDI target;
  LINK (`audio/liveLink.ts`, project section `liveLink`) layers parts through `audioEngine.liveFanout`.
  Quick-control assignments: `workstation/partState.ts` (project section `workstation`). LOAD swaps a
  part's instrument with `swapPartInstrument` (track, cables, players, link kept).
- Type system: Inter is the only family (tabular numerals for readouts); there is no second mono face.
  Only four sizes render: 11 label, 13 body, 18 title, 22 readout (@theme text tokens); the
  .unbox-cabinet rule raises any legacy sub-11px utility class to 11px. Measured on the
  workstation, rack and mixer at 1600 and 1280: min 11px, no clipped text, no per-device scrollers.
- Contrast: audit the three tabs at 1600�1000 with a canvas-resolved colour walker before changing
  chrome colours; the current pass reports 0 text pairs below 4.5:1 on solid surfaces.
- Skin tokens: `@theme` in `src/index.css` (`bg-metal-1`, `text-lcd-ink`, `font-label`, `font-lcd` …) and
  the `.us-*` classes inside `@layer components` (so Tailwind utilities on the same element still win).
  Controls: `src/ui/skin`. Use `capturePointer` (never a bare `setPointerCapture`).
- Pages render inside `.us-page` (raw text fields / checkboxes take the skin there) and build on
  `src/studio/ui/controls.tsx`: `Panel` (dark chassis, metal name plate, screws), `Btn` (lit when on),
  `Sel`, `NumField` (LCD), `Slide` (skinned range + LCD readout).
- The arrangement timeline takes `theme="light"` (Workstation) or dark; colours in `timelineTheme.ts`.

### Rack UI (Reason workflow)
- Three columns with wood rails in ONE scroll container (`.rack-content`): jacks and the cable SVG
  share its coordinates, so never give a column its own scroller. Defaults (`rackColumns.ts`): left =
  send returns + their effects, free effects, modulators, effect-only Combiners; middle = Hardware
  Interface + each instrument with its players and inserts; right = channel list + group buses. A
  saved placement (`rackLayout.ts`: col, order, folded; keys = device id or `group:<id>`) wins; the
  engine's device order never changes. Drag a unit's grip to move it; Auto layout clears placements.
- Folded units are a 30 px strip on the front only (the rear always shows every jack).
- Rear: master cables are drawn into their channel row (`chan:<stripId>:master_l|r` jack keys alias
  the master inputs; a row only accepts cables whose `mixer.ownerOf(source)` is that channel).
- Cable colours "by type" (uiStore `cableColors`): red → mixer channel, green between units, orange
  sidechain, yellow CV, blue inside a Combiner; "per cable" uses each connection's stored colour.
- `RackUnitFrame` is memoised: a knob move re-renders one unit; structural engine events re-render all.
- The Combinator is called "Combiner" in the UI (type id `combinator` unchanged).
- **Tab** flips front ↔ rear (in the rack or the F4 split view; from elsewhere it opens the rack rear).
- Cables: drag from a free jack = new cable; from a patched jack = move that plug; Shift = extra
  cable; click-click and Enter patching; Alt+click / double-click unplug; Esc cancels.
- `canConnect` rules (UI and AI): audio↔audio, CV↔CV, output→input, no self-patching, no duplicate,
  no audio feedback loop, one cable per input (master takes many).

### Recorded instrument packs
- `npm run instrument` converts SFZ libraries (local or `github:owner/repo/path.sfz`, downloading only
  the samples used) or recipes (folders of recordings) into packs: mic layers of a hit are mixed into
  one sample, velocity layers / round robins / keys thinned to fit memory, ONE gain per pack (soft
  layers stay soft), tails trimmed, mono kept mono, sustain loops found and crossfaded.
- Every pack in `shared/instruments/catalog.ts` becomes a spec device `rec_<id>`
  (`shared/rack/devices/sampled.ts`, engine `multisample`): kits get pads from the pack's lanes
  (+ per-pad Level / Tune / Length), melodic packs get Transpose / Fine / Attack / Release. Saved
  projects reference the type, so never rename a pack id.
- `multisample` engine: zones by key + velocity, sequential round robin per key, random round robin,
  choke groups (`groups` / `offBy`), sustain loops, `notePolyphony` (piano re-strike), Punch
  (per-voice transient boost), Drive, Tone, Variation (`vary`, default 50 %: keys with one recording and no
  round robins get a little per-hit tuning, level, attack and tone change, so repeated hits don't sound
  identical). Decoded pack buffers are shared by active units and offline clones; the cache releases them after the final engine using that pack is disposed; ready() resolves after loading.
- Only redistributable recordings (own, CC0, CC-BY with credit). Never sample commercial songs.
  Packs with another license (e.g. "Custom", made from your own stems) work in your own build only:
  use `SHIPPED_PACKS` (not `INSTRUMENT_PACKS`) for anything that lists packs, so the share build drops
  them; anything else you add under `public/` that must not be shared needs a line in
  `scripts/prune-share-build.ts`.

### Library pipeline
1. `scanner.ts` walks `D:\vsr` (read-only) → raw manifest. 2. `appLibrary.ts` bundles it into
`public/library/` (paths removed, playable audio copied). 3. The app loads `/library/library.json`
first; `/api/vst/*` is only needed for Rescan. Mounted units run proxy DSP; `.ogg` previews play
through the unit's own output. Samples can be put in the song (Studio → Samples → "+ song").

### AI features
- AI Combinator: `/api/ai/combinator` → Gemini with `responseSchema` → `validatePlan()`; no key →
  `planLocally()`; server unreachable → the browser plans (`local-offline`). `applyRackPlan` mounts,
  patches (stereo pairs via `canConnect`), groups and macro-maps.
- Preset crafter: the client sends the device's real parameters (ranges, values); model output is
  validated server- and client-side; keyword rules otherwise. Undo restores previous values.
- Mix & master: numbers always come from `assistant.ts`; Gemini only writes notes about them.
- Never trust model output; prompts ≤ 2000 chars; AI routes rate limited per IP.

## DSP / UI thread separation — hard rules

1. **Audio is produced only by the Web Audio graph.** Per-sample DSP goes in an AudioWorklet
   (worklets load from Blob URLs: `unbox-dynamics`, `unbox-recorder`, `unbox-meter`). Offline
   analysis of a rendered buffer (loudness, spectrum) is fine on the main thread.
2. **Musical timing uses AudioContext time.** No `setTimeout` for notes or launches.
3. **Running params are scheduled, not assigned:** `setTargetAtTime` or ramps. Direct `.value =`
   only while building a graph.
4. **Animation never goes through React state.** Meters, scopes, playheads, cables and GR meters
   update in `requestAnimationFrame` through `useFrame()` (ONE shared loop for all of them). Write
   to the DOM only on change (`ui/skin/dom.ts` `setWidth` / `setText`; canvases skip unchanged
   frames) — an idle meter must cost nothing. The engine's global `notify()` fires once per bar
   while playing; UI that shows the playing step uses `useStepTick()` (`engine.onStep`, per 16th)
   and automated faders `useChannelAutomation()` — never re-render the whole app per step.
5. **Measure layout only when it changes** (`JackRegistry.invalidate()` coalesces); in rAF loops
   read geometry before writing styles (or use ResizeObserver values).
6. **Heavy I/O and parsing stay on the server** (file walking, PE parsing, manifest, AI calls).
7. Build a device's node graph once; toggle with gains (bypass/power), don't rebuild during playback.

## D:\vsr rules (user content — treat as untrusted, read-only)

- **Never execute, load or `require` anything from `D:\vsr`** — no plugin instantiation, no
  installers/activators, no `.cmd`/`.exe`, no DLL loading. The scanner only reads bytes.
- Never write, rename, move, delete or extract anything in `D:\vsr` (includes a ~179 GB `vsr.zip`).
- `data/vsr-manifest*.json` and `public/library/` are git-ignored (machine-specific content).
- `/api/vst/*` answers loopback clients only unless `VST_LIBRARY_ALLOW_REMOTE=1`.
  `/api/vst/file/:id` serves only indexed playable audio, by id. Never accept a path from a request.

## Coding standards

- TypeScript everywhere, strict-clean: no implicit `any`, no `@ts-ignore`; narrow JSON/AI data.
- Inside `src/` and `server/`, import with explicit extensions (`./AudioEngine.ts`). `shared/` stays
  pure (no `window`, `document`, `fs`, `path`, `crypto`).
- React: function components + hooks; Tailwind utilities plus the rack classes in `index.css`;
  shared studio controls in `src/studio/ui` (Btn, Sel, Panel, NumField, Slide, Fader, meters).
- Ref callbacks must not return values (React 19 treats a returned function as cleanup).
- Don't grow the giant files (`AudioEngine.ts`, `DeviceFaceplate.tsx`, `SequencerView.tsx`); add
  focused modules and keep engine edits minimal.
- New built-in device: prefer a `DeviceSpec` (+ engine). Legacy class devices: subclass
  `BaseDevice`, register in `createDevice` and `instantiateDeviceOnContext`, add to
  `builtinCatalog.ts` (real ports and ranges) and to the non-instrument lists if not playable.
- UI text must be truthful: no control without an effect, proxy DSP labelled, AI vs rules labelled.
- Comments explain *why*, briefly. No dead code, no unused exports, no new deps without need.

## Keyboard map

Global (App.tsx): `Space` play/stop · `R` back to bar 1 · `M` metronome · `[` `]` tempo ·
`F7`/`F1`/`Alt+1` Workstation & Sequencer · `F6`/`F3`/`Alt+3` Rack · `F5`/`F2`/`Alt+2` Mixer & Clip
Editor · `F4`/`Alt+4` song editors above the rack · `Tab`/`Alt+F` rack front/rear · `F8` MIDI tools ·
`Ctrl+K` command search · `Ctrl+S` save · `Ctrl+E` export WAV · `Ctrl+Shift+E` Export page ·
`Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y` undo/redo (sequencer edits) · `Alt+C` AI Co-Pilot · `Alt+M` CV matrix ·
`Alt+K` keyboard dock (Rack / Mixer tabs) · `Alt+Q` / `` ` `` pie menu · `F11`/`Alt+G` stage mode ·
`?`/`Alt+H` shortcut help.
KEYS (transport button, `uiStore.qwertyPiano`): on = letters play the selected part (`A W S E D F T G
Y H U J K O L P ;`, `Z`/`X` octave); off = letters are commands: `Q W E R T Y U` sequencer tools
(select, pencil, eraser, razor, mute, zoom, hand), `B` Block/Song, `L` loop, `C` click, `K` rack
cables (all / selected unit / hidden).
Sequencer: `Enter` opens the selected clip (Edit Mode) · `Shift+1..6` editor tabs · `1..9` piano-roll
tools · `Q` snap to scale (piano roll) · `-`/`=` pattern length · `Alt+arrows` length / transpose ·
`Shift+L` legato · `Ctrl+D` generate.
`ShortcutHelpModal` lists only real keys — update it with any change here.

## Environment variables (`.env`, never committed)

`GEMINI_API_KEY` (without it the local planner / rules run; `MY_GEMINI_API_KEY` counts as unset) ·
`GEMINI_TEXT_MODEL` (default `gemini-2.5-flash`) · `AI_RATE_LIMIT_PER_MIN` (20) · `PORT` (3000) ·
`VST_LIBRARY_ROOTS` (`D:\vsr`) · `VST_MANIFEST_PATH` (`data/vsr-manifest.json`) ·
`VST_LIBRARY_ALLOW_REMOTE` (off). Electron reads `.env` from the project folder, next to the exe,
then the user-data folder.

## Known pitfalls

- AI plans must use real port ids (`out_l`, not `audio_out_l`); audio edges are stereo pairs.
- Removing an inline effect re-bridges upstream → downstream; deleting a Combinator removes members
  one by one so chains re-bridge naturally.
- Offline renders clone each device (`cloneForOfflineContext` for devices with extra state) and copy
  its level trim; anything a device does only on its live context (e.g. expression) is live-only.
- `'master'` is not a DeviceType.
- Electron without `electron/api-server.cjs` serves static files only (no AI, no rescan) — the
  bundled library still works. Run `npm run build:api` after server changes.
- Undo is one journal (`src/audio/undoJournal.ts`): sequencer edits, device parameters, mixer
  settings, mastering, device add / delete, audio and CV cables, Combiner groups and automation
  lanes are undoable, plus freeze / unfreeze. Structural edits restore a project snapshot (device
  ids change); parameter edits restore a single value without rebuilding the graph.
  A pending sequencer capture (500 ms after an edit) is recorded before any new journal entry
  (`undoJournal.beforePush`), so a knob move after an edit undoes in the right order.
- MP3 export uses `@breezystack/lamejs` (LGPL, loaded on demand).
- Device names are original: never put a trademarked product / brand name in visible text (names,
  tags, option labels, faceplates, AI prompts). Sounds are synthesized, never sampled from the
  originals. Real recordings live only in the `rec_*` pack devices (licensed, credited in CREDITS.md).
  Old default names in saved projects are mapped on load by `src/audio/legacyNames.ts` (generated
  once; names the user typed are kept). Select options are stored by index — rename labels freely.
- `SoundFontEngine` renders its code-built banks (piano, guitar, sitar, bansuri, harmonium, tabla,
  dhol) one at a time on first use (`ensureInitialized(ctx, presetId)`), and the devices that use it
  call `warmUp()` so the bank renders while the page is idle. Building them all at once froze the page
  for ~1.2 s on the first note (MIDI and UI stalled). Keep new banks separate (`if (only === …)`).
- `catalog.ts` is generated: after building / removing a pack, restart the dev server if the new
  device doesn't appear (it is imported by shared code that the server also loads).
