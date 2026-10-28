# v12 — Quick fixes: variation, crossfades, duck trigger, strum, right-click automation

## New
- **Per-hit variation** on recordings with one sample per note (Tumbi, Dholak, Chamkila, Harmonium …):
  repeated hits no longer sound identical. Each hit gets an alternating up / down-stroke tuning (±8 cents
  at full setting, ±4 at the default 50 %), a little random tuning and level, a 0–4 ms later start into the attack, and soft
  hits are a little darker. Knob **Variation** on the device (0 = off). Packs with round robins are unchanged.
- **Crossfade at clip splits:** cutting a clip (or two takes that touch) no longer clicks: the two sides
  overlap by ~6 ms with a linear crossfade. Live and in exports.
- **Kick duck trigger:** the Kick duck on a channel strip has a trigger dropdown: drum beats (as before) or
  the hits of one part (for example the kick track or a bass-drum pattern). Saved with the project.
- **Strum:** F8 tools → STRUM spreads each chord's notes 0–40 ms apart, lowest first (rolling a finger over
  strings). Stored per chord step, live and in exports.
- **Right-click → Create automation lane** on the device knobs (spec device faceplates, Workstation LCD and
  quick knobs) and the mixer's pan / width / trim / send knobs. The lane appears under the knob's track in
  the song sequencer.

## Fixed
- A knob or fader move made within half a second of a sequencer edit undid in the wrong order: the first
  Ctrl+Z reverted the sequencer capture instead of the knob. The pending capture is now recorded before any
  new undo entry.
- Right-clicking a knob on a device faceplate started a drag; only the left button drags now.

## Checked, no change needed
- Knob and fader undo already worked (device parameters and mixer settings are journal entries; one drag is
  one undo step). Verified in the browser.

# v11 — MIDI controllers drive the Workstation; no freeze on the first note

> Historical change log. The final “NOT fixed” checklist records an older snapshot; use the current [master development plan](docs/UNBOX_STUDIOS_MASTER_DEVELOPMENT_PLAN.md) and [feature truth table](UNBOX_FEATURE_TRUTH_TABLE.md) for present status.

## New
- Every knob of a MIDI controller does something on the Workstation: on a Novation Impulse (MIDI
  mode) knobs 1–6 turn the six big knobs of the selected part, knob 7 its pan, knob 8 the master
  level, and the fader the part's level; the LCD shows what moved. Settings · MIDI lists every
  function with **Learn** (move a knob or press a button on the controller) and Clear, e.g. to put
  Play / Stop / Record / Loop / bar back / forward on buttons. Saved on this computer.
- Keys held on the controller light on the Workstation keyboard; its pitch and mod wheels follow the
  hardware wheels.
- MIDI status in the transport bar: the controller's name with an LED that blinks on incoming notes
  and knobs; "MIDI blocked" (click to ask again), "No MIDI", or amber when another program holds a
  port. Notes still play when no part is selected (the first instrument takes them).

## Faster
- The built-in piano, guitar, sitar, flute, harmonium, tabla and dhol sounds no longer freeze the app
  for over a second on their first note (which also held back MIDI notes): only the played
  instrument's sounds are made, while the app is idle, and the piano's are made ten times faster
  (same sound). First note now: 0–1 ms (75 ms if played the instant the instrument is added).
- Switching to the Rack or the Workstation no longer forces extra layout passes while the tab mounts.

# v10.1 — Shareable build without non-shareable recordings

## Changed
- `npm run dist:win:share` now leaves out every instrument pack whose license is not CC0 / CC-BY
  (today: Tumbi Folk Pluck, Punjabi Dholak, Chamkila Harmonium, Chamkila Vocal Chops — license
  "Custom") and the song stems in `public/stems`: their files are not in the shareable .exe and those
  instruments don't appear in it. Your own build (`npm run dist:win`) keeps everything.

# v10 — Any audio file on any instrument

## New
- **Load audio** on every instrument (rack units and the EDIT window): pick or drop a WAV, MP3, OGG,
  Opus, FLAC or M4A/AAC file and it becomes the instrument's sound, played across the keyboard from its
  own pitch (detected when you load it; Root and Tune correct it), with Level, Attack, Release and Loop.
  Pitch bend and vibrato work on it; "Own sound" brings the instrument back.
- Drum machines load a file per pad (PAD AUDIO): that pad plays the file, the other pads keep theirs.
- LOAD browser: "Audio file" turns a file into the part's sound (or a new part); library samples get a
  "keys" button that does the same.
- Saved with the project and in `.unbox` archives, and exports / stems render the files.

# v9 — Unbox Studios 1.0 (finish and release)

## New
- Pages (Projects, Devices, Meters, Mastering, Export, Settings) in the Unbox skin: metal name plates
  with screws, lit buttons, LCD number fields and readouts, cyan sliders with orange handles.
- App icon (window, taskbar, browser tab) and version 1.0.0 by Unbox Studios.
- `npm run dist:win:share` builds `release/Unbox-Studio-Share.exe` for other people: the same app
  without the in-app library made from your own plugin folder (its previews belong to third parties).
- Fonts ship inside the app, so the desktop app looks the same offline (no Google Fonts calls).

## Faster
- While playing, the app no longer re-renders everything on every second 16th: only the step lights,
  step readouts and automated faders update per step; the rest once per bar.
- All meters run in one animation loop and touch the screen only when a value changes; silent device
  scopes redraw a few times a second instead of 60; the song timeline no longer forces a layout every
  frame. Measured (dev build, share of one CPU core): Workstation idle 15 % → 2 %, playing 36 % → 22 %;
  Mixer idle 27 % → 11 %; Rack idle 21 % → 13 %, script time while playing halved on every tab.

## Changed
- The last trademarked instrument names were replaced (e.g. Line 6 Variax → Modeling Guitar,
  Stylophone → Stylus Pocket Synth, Hang → Tuned Steel Handpan); each keeps exactly the same sound.
- The decorative "chase" lights on the classic drum / sampler pads were removed (they lit pads by step
  number, not by what played); the step ribbon still shows the real playing step.

# v8 — Unbox Studios redesign, part 3 (Mixer & Clip Editor)

## New
- **Channel EQ and dynamics** on every mixer channel: high-pass, low shelf, two bells with Q, high
  shelf, low-pass, then a compressor (threshold, ratio, attack, release, makeup) and a gate
  (threshold, range, release) with a gain-reduction meter. Saved with the project and rendered into
  exports and stems by the same strip graph, so they sound the same.
- **Channel inspector** beside the console: the selected channel's EQ as a curve with draggable band
  handles (wheel = Q, double-click = reset) and knobs, plus the dynamics.
- **Console reskin**: metal name plates, ring knobs, LED buttons; every strip keeps pan, mute / solo
  and the fader on screen while input, EQ thumbnail, dynamics, inserts, sends and routing scroll.
- **Clip Editor** below the console (drag the divider; its height is remembered). "Clip" edits the
  clip selected in the song: note clips in a full-height piano roll with velocity lane, audio clips
  on a large waveform — drag the edges to trim, the corner squares for fades and the orange line for
  clip gain. Pattern clips open their pattern in the pattern editors. Step grid, piano roll,
  arrangement, Graph & CC, drum editor and clips & scenes are tabs next to it.

## Fixed
- An audio clip's waveform did not redraw after changing its gain or fades.

# v7 — Unbox Studios redesign, part 2 (original device names + 3-Column Rack)

## New
- **3-Column Rack**: three rack columns between wood rails with punched mounting rails in the empty
  space. Left: effect returns with their effects, free effects, modulators, effect-only Combiners.
  Middle: the Hardware Interface and every instrument with its players and insert effects. Right: a
  mixer **channel list** (colour, name, mute, solo, level with meter) and group buses.
- Drag a unit's grip to another place or column; fold units to a strip (Alt: whole column, Fold all);
  "Add device" slots put the next library unit into that column; Auto layout restores the defaults.
  The layout is saved with the project.
- **Rear view**: cables cross the columns and each instrument's cable ends in its own channel row (a
  row only accepts cables from its own chain). Cable colours by type (red into the mixer, green between
  units, orange sidechain, yellow CV, blue inside a Combiner) or per cable. K (KEYS off) cycles all
  cables / the selected unit's cables / hidden.
- **Navigator** minimap at the right edge: click or drag to scroll the rack.

## Changed
- Every device, kit, preset and group name that used a trademarked product or brand name now has an
  original name (e.g. Malström → Graintide, Thor → Thunderhead, Redrum → Beatbox 8, 3x OSC → Tri-Osc,
  Combinator → Combiner). Saved projects keep working (type ids are unchanged) and their default
  device names are updated when they load.
- A knob move now re-renders only its own rack unit instead of the whole rack.

## Fixed
- Jack highlights (green targets, the cable's other end) disappeared when a carried cable was
  unplugged; they are re-applied.

# v6 — Unbox Studios redesign, part 1 (shell + Workstation & Sequencer)

## New
- **Unbox Studios shell**: title bar with the three workspace tabs (Workstation & Sequencer, 3-Column
  Rack, Mixer & Clip Editor), a main menu with everything from the old File / Edit / View / Insert /
  Tools / Help menus, pages (Projects, Settings …) over the tabs, and a transport docked at the bottom
  (loop with L/R, click + level, count-in, bar/beat and time readouts, tempo with TAP, KEYS switch).
- **Workstation panel**: part list (mute, LINK layering, patch, level bar with meter), teal LCD editor
  (Easy page, one page per parameter section, MIX / FX / MIDI / COMBI pages), six quick-control knobs
  (right-click to assign, saved with the project), LOAD browser (replace a part's instrument and keep
  its notes / mixer / effects, or add a part; library presets, effects and samples tabs), EDIT window,
  full-width keyboard with pitch / mod wheels, velocity by click height, hold, octave.
- **Light song sequencer** below it: tool bar (Select, Pencil, Eraser, Razor, Mute, Zoom, Hand), Edit
  Mode, Snap on/off with Bar … 1/32, Block / Song, + track, automation mode; collapsible lanes, track
  headers with live meters and delete. Zoom / Hand tools and finer snap also in the dark editor.
- Reason-style keys: F7 / F6 / F5 for the three tabs; with KEYS off, Q W E R T Y U pick tools, B
  Block/Song, L loop, C click.

## Fixed
- `R` and the shortcut help said "back to bar 1" but moved one beat back; it now goes to bar 1, and
  the transport's bar-back button moves a whole bar.

## Changed / removed
- The old top bar, left section rail and Studio home were replaced (their browser lives on in LOAD).
- The mixer and the song editors (step grid, piano roll, graph & CC, drum editor, clips & scenes) share
  the Mixer & Clip Editor tab until it is redesigned (part 3). The rack keeps its current look (part 2).

# v5 — recorded instruments

## New
- **Recorded instrument packs** (`public/instruments/`, all CC0, credits in `CREDITS.md`), each its own
  rack device under *Recorded Drums & Percussion* / *Recorded Instruments*:
  Big Rusty Drums (13-lane acoustic kit, 5 velocity layers, 3 round robins, hi-hat choke),
  Osiris Piano, Growlybass (electric bass), Emilyguitar (electric guitar), Tabla & Dholak, Harmonium
  (chromatic C2–D5, looped).
- **`multisample` engine**: velocity layers, sequential + random round robin, choke groups, sustain
  loops, piano re-strike damping, per-pad level / tune / length, Punch (per-voice transient boost),
  Drive, Tone. Works live, in exports (offline clones) and in saved projects.
- **`npm run instrument`** — converts SFZ libraries (local or straight from GitHub) and folders of your
  own recordings (recipes) into packs; `chop` cuts a long take into hits with pitch detection.

## Not done
- Bansuri / sitar packs: no clean CC0 single-note recordings were found (the CC0 bansuri takes are
  phrases with tremolo). Build one from your own or licensed recordings with a recipe.
- Packs load fully into memory (no disk streaming); keep each under ~150 MB decoded.

# v4 — producer test round (errors found by making music in the app)

## Fixed
- **Graph & CC lanes**: drawing a velocity applied it twice (50 % played as 25 %); creating or
  selecting a pattern filled every empty lane with defaults, so cutoff 0.8 / resonance 0.3 / velocity
  ×0.85 were forced on every note and the synth's own knobs stopped working. Lanes are now sparse
  (empty = the knob rules), old projects are cleaned on load, cutoff/resonance lanes are rendered in
  exports, and the lanes that playback never read (pan, CC1, CC74, CC91) were replaced by a real
  **Chance** lane.
- **Clips & scenes**: launch quantize (1 bar / 1 beat / immediate) did nothing — launches now queue
  in the scheduler and fire on the grid line, and the launched pattern restarts from its first
  step. Scenes are unlimited (no made-up names); empty slots no longer generate random notes when
  clicked (separate Generate button). Tracker MPE columns (never played) → Chance + semitone ±.
- **Piano roll**: the MPE lane stored values playback ignored → removed. Letter tool keys
  (V/B/C/G/E) played notes on the live keyboard at the same time → tools are on 1–9 only.
- **Pitch / mod wheels** on the live keyboard and MIDI pitch bend / CC1 / sustain pedal did nothing →
  `expression.ts` bends every instrument (held and new notes) and drives mod wheel / vibrato; the
  sustain pedal holds notes.
- **Stuck notes**: HOLD off left held notes ringing; changing octave while a key was down stranded it.
- **F4 split view** only showed a toast → real sequencer-over-rack split (Tab flips the rack in place).
- **Command palette / pie menu**: sequencer commands stayed on the Studio view; pie wedges opened
  tabs that no longer exist.
- **Shortcut help** listed keys that don't exist (S stop, I inspector, Shift+6 "audio drivers"…)
  → lists only the real keys; Alt+I/T/V bound to the removed inspector.
- **AI Co-Pilot**: Preset Crafter applied fixed made-up values without a key and unvalidated model
  parameters with one → device-aware presets (real parameter list, validated, clamped, undo) with
  labelled keyword rules offline. Mix & Master showed fabricated analysis and applied presets to an
  MClass rack unit → measured analysis (LUFS, true peak, LRA, spectrum slope, correlation) and
  auto-master into the mastering chain; Gemini only writes notes about the measured numbers.
- **Mastering chain, reference player and monitor section had no UI** → Mastering page (all
  sections, GR meters, auto-master to −14/−16/−9/−7 LUFS with undo, reference A/B with level match)
  and Settings page (output device, latency, dim / mono / swap / mute, speaker calibration, MIDI
  inputs + activity monitor, metronome level).
- **Library samples could only be previewed** → "+ song" puts them on an audio track at the playhead.
- Studio home listed mix buses as rack effects; Co-Pilot still named `D:\VSR`; dead legacy modules,
  a never-updating piano-grid readout and selection-only branches were removed.

# v3 additions — modular rack, D:\vsr library, AI Combinator

## New
- **D:\vsr library index** (`npm run scan:vsr`, or Rack → Library → Rescan): read-only scan → `data/vsr-manifest.json`. Reads PE headers (VST2/VST3/AAX entry points, 32/64-bit, vendor/version), NI `.nicnt`, changelogs, WAV/OGG headers, zip directories. Never runs plugins or installers, never extracts archives. Marks duplicates (e.g. TDR Nova copy inside the Ample folder, the partial `temp_extracted` Majestica) and format variants.
- **Library API** `/api/vst/*` (manifest, search, rescan, preview audio by id, host status) — loopback-only by default.
- **Library browser** in the Rack view (search, kind filters, details, preview audition, Mount / Load preset) and in the Studio view's Samples / Presets / Effects tabs.
- **Modular rack rebuilt** (`src/rack/`): vertical rack with a Hardware Interface (master bus) unit; **Tab** flips the whole rack (and jumps to the rack from other views); rear patch bay with drag-and-drop cables — verlet gravity sag drawn as Bezier curves, moving plugs, Shift fan-out, click-click and keyboard patching, Alt+click / double-click unplug, auto-scroll while dragging, one cable per input, feedback-loop prevention.
- **Library units** (`VstPluginDevice`): real audio/CV ports, 4 macros with CV inputs, mix, output fader, envelope CV out, presets, `.ogg` previews played through the unit's own output (so they pass through downstream effects), offline export support. Sound is a category-matched Web Audio proxy and is labelled **PROXY DSP**.
- **AI Combinator** (`/api/ai/combinator`; rack toolbar and Co-Pilot → Rack Builder): Gemini structured output, or a local planner without a key, picks library plugins/instruments plus built-ins; the plan is validated on the server and again against live ports; units are mounted, audio + CV patched, and grouped in a Combinator frame with macro knobs. Effect-only prompts insert the chain after the selected unit.
- Desktop build now serves the API (AI + library): `npm run build:api` → `electron/api-server.cjs` (built automatically by `npm run electron` / `dist:win`).

## Fixed
- The old AI rack builder used port names that don't exist (`audio_out_l`), so its cables never connected — replaced by the validated Combinator pipeline.
- Opening a project re-added a dry instrument→master cable for every instrument, doubling anything routed through effects.
- Projects now also save CV cables, library units and Combinator groups.
- Studio browser keyed catalog items by type (duplicate React keys could drop entries).
- AI rate limiting now applies to AI routes only, so library browsing and previews don't use it up.

## Still NOT done
- Native plugin hosting: mounted units don't run the real VST/VST3 code (needs an out-of-process host; see CLAUDE.md). Kontakt / Superior Drummer / Ample content is only heard through proxies and the `.ogg` previews.
- The Graillon proxy does pitch shift + bitcrush, not pitch correction.

# v2 additions

## Fixed in v2
- **Undo/Redo rebuilt**: also captures edits made while stopped, plus BPM / swing / pattern length (device knob moves are still NOT undoable).
- **New instruments no longer get a random pattern**; effects you add are **auto-inserted in series on the selected instrument** (chain after existing inserts). Removing an inline effect re-bridges the signal so the track doesn't go silent. Rack has a remove (✕) button.
- **Real drum lanes**: Redrum shows 8 lanes (Kick, Snare, Closed/Open Hat, Clap, Low/High Tom, Crash); several drums can hit on the same step. Melodic tracks get a 12-row note grid with octave buttons. Click-drag painting, Shift = accent, Alt = soft.
- Step editor: all tracks (tab per track), 16/32/64 steps, pattern bank 1–8, swing slider (50–75%), Clear, live playhead column.
- **Transport**: real Pause/Resume (Play continues from where you paused), ⏮ = go to start, ⏭ = next bar, Stop = back to start, click a lane to seek, bar ruler, clock shows song time.
- **BPM box** can now be typed normally (commit on Enter / blur).
- **Computer-keyboard piano** (A W S E D F T G Y H U J K O L P; Z/X = octave), velocity by click height, stuck-note fixes, **REC** button writes played notes (on-screen, QWERTY or MIDI keyboard) into the track while the transport runs.
- **MIDI keyboard** now plays the instrument selected in the Nexa shell.
- **Project files**: File → Save project (.json) / Open project… (devices, params, tracks, cables, tempo, swing).
- **Bounce to WAV (real-time)**: records exactly what you hear – includes inserts, sends, master EQ – 24-bit WAV.
- Mixer: Pan knob per track, master knob relabelled "Master", stereo master meter, spectrum shows full range.
- Metronome + Undo/Redo buttons, Edit menu, Esc closes menus, aria-labels on transport buttons, track rename (double-click), wider knob range guesses, scope no longer allocates every frame, hidden Studio panel no longer keeps animating.
- **Desktop app wrapper** (Electron): `build-exe.bat` builds `release\Unbox-Studio.exe`; `run-app.bat` runs it without building.

## Corrections to my earlier reports
- Redrum already maps notes with a positive modulo, so low drum notes are NOT silent.
- The "Mix" knob is actually master volume (now labelled Master).
- My previous "no new type errors" claim was invalid (the command never ran). In v2 a real check found no new errors in the changed files; the project already had ~25 type errors before my changes.

## Still NOT done
Real recorded instruments, sample chop/slice editor, triplet / 1/32 grid and note lengths in the new step editor, per-note glide / true 808, per-track sends & true sidechain, automation lanes, tempo map & time signatures, the AI Co-Pilot inside the .exe, device-parameter undo.

# Unbox Studio – fixes in this build

## Fixed
- **Play no longer auto-generates patterns** – an empty project stays silent.
- **Scheduler runs in a Web Worker** – no throttling in background tabs, immune to React render stalls (falls back to setInterval if blocked). Lookahead 100 → 120 ms.
- **Swing** now reaches 75% (was ~67%) and is applied in export too.
- **Step probability is deterministic** (hash of track/bar/step) so playback and bounce match.
- **Sidechain ducking** cancels overlapping automation before scheduling.
- **Hardcoded section names removed** (INTRO / INDUSTRIAL DROP / ...); label is just `BAR n`.
- **Redrum**: one shared noise buffer (was a new 1.5 s buffer per hit); **open/closed hi-hat choke**; kick tail follows pitch down to 20 Hz.
- **Piano roll range** C2–E5 → **C1–E6** (808 / sub-bass range).
- **Undo / Redo** for all sequencer edits: Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y (100 steps).
- **Hardware MIDI keyboard input** (Web MIDI) routed to the selected playable instrument.
- **Export**: 30 s cap → 10 min; renders the whole arrangement (up to 64 bars) in Song mode; includes swing; always a real `.wav` (no fake .flac/.aif names); download URL released.
- **False UI claim** ("192 kHz 64-bit float") replaced with the real graph/sample-rate info.
- **AI server**: per-IP rate limit, prompt length cap, 256 kB body cap, 30 s timeouts, configurable model (`GEMINI_TEXT_MODEL`, default gemini-2.5-flash), and validated symbolic outputs. The legacy `/api/generate-sound` recording lookup was removed on 2026-10-27 because it exposed hard-coded local song-derived patches and had no client callsite.
- **Knobs** are keyboard/screen-reader accessible (role=slider, arrow keys).
- **Repo**: `start` script works in production (tsx moved to dependencies), package renamed `unbox-studio`, `@` alias points to `src`, unused C++ headers moved to `docs/reference-cpp-dsp/`, duplicate screenshot removed from `.aistudio`.

## NOT fixed (needs real assets or large redesigns)
- Real recorded/multisampled instruments and SF2 playback (sounds are still synthesized).
- Sample chop/slice editor, time-stretch, audio tracks, user sample library.
- Triplet / 1/32 grid, overlapping notes per track, per-note glide, true 808 instrument.
- Per-track insert effects, per-track sends, true sidechain compressor, brickwall limiter, AudioWorklet DSP, true-peak/LUFS metering.
- Full project save/load file; tempo map; time signatures; panic/all-notes-off.
- Test suite, splitting the giant files, trademark clean-up of Reason Studios device names.
