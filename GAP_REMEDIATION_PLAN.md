# Unbox Studio — Gap Remediation Plan

**Goal:** Close every gap identified in the Reason 14 comparison.  
**Method:** Tackle Tier 1 (TypeScript-actionable) now; design stubs for Tier 2 (build/native); document Tier 3 (infrastructure/separate projects).

---

## Tier 1 — Fixable in TypeScript, start now

| # | Gap | What needs to change | Files | Est. effort |
|---|-----|---------------------|-------|-------------|
| T1-1 | **MPE per-note voice detune** | Wire `MidiInput.getPerNoteBend/Pressure/Timbre(note)` into instrument engines so each voice detunes independently instead of using the global expression bus. | `src/audio/expression.ts`, `src/audio/spec/engines/*`, `src/audio/devices/*` | Medium |
| T1-2 | **MCU / Mackie Control / HUI** | Implement MCU/HUI protocol over Web MIDI: motorized fader feedback, button LED states, transport sync. Store map in localStorage like existing `midiControls`. | `src/audio/midi/MidiInput.ts`, new `src/audio/midi/MCUController.ts` | Medium |
| T1-3 | **Per-device undo history** | Split the single undo journal into per-device undo stacks so parameter moves on one device don't clobber another's history. | `src/audio/undoJournal.ts`, `src/audio/AudioEngine.ts` | Medium |
| T1-4 | **Sample-rate conversion for imported loops** | Add SRC to `deviceSamples.ts` so imported audio at non-project sample rates resamples cleanly (beyond current root-note resample). | `src/audio/deviceSamples.ts` | Small |

## Tier 2 — Architecture stubs, needs build config / native glue

| # | Gap | What needs to change | Files | Est. effort |
|---|-----|---------------------|-------|-------------|
| T2-1 | **macOS / Linux desktop builds** | Add `mac` (dmg/zip) and `linux` (AppImage/deb) targets to `package.json` electron-builder; CI matrix for all 3 platforms. | `package.json`, `electron-builder-share.cjs`, `.github/workflows/` | Medium |
| T2-2 | **Native VST3/AU/AAX host** | C++ host process that loads plugin binaries and exposes them via Web Audio worklet or IPC. Replace `proxyDsp.ts` with real host when available. | `electron/` native module, `src/vst/VstPluginDevice.ts` | Large (native C++) |
| T2-3 | **Surround / multichannel audio** | Refactor device ports from `out_l`/`out_r` to channel-configurable outputs; redo mixer bus matrix for 5.1/7.1; add surround panner. | `src/audio/BaseDevice.ts`, `src/audio/mixer/MixerController.ts`, `src/audio/spec/engines/*` | Very large |
| T2-4 | **ReWire** | Proprietary ReWire SDK licensing + C++ host/client implementation. | `electron/` native module | Large (legal + code) |

## Tier 3 — Infrastructure / separate projects

| # | Gap | What needs to change | Est. effort |
|---|-----|---------------------|-------------|
| T3-1 | **Cloud sync / collaboration** | Backend (auth, database, sync server), project cloud storage, conflict resolution. | Very large |
| T3-2 | **Mobile app** | React Native or Capacitor, touch-optimized rack/mixer, mobile build pipeline. | Very large |
| T3-3 | **Video track / video export** | Video codecs, timeline video track, preview window, muxing (FFmpeg or similar). | Large |
| T3-4 | **Notation / score editor** | Music engraving library, staff renderer, notation input, printing. | Large |
| T3-5 | **64-bit internal audio** | Not feasible in Web Audio API (32-bit float). Would require custom AudioWorklet processing or WASM audio engine. | Very large |

---

## Execution Order (this session)

1. **T1-1: MPE per-note voice detune** — start now (data layer already done)
2. **T1-2: MCU/HUI stub** — protocol implementation
3. **T1-3: Per-device undo** — journal refactor
4. **T2-1: macOS/Linux build config** — package.json + electron-builder targets

Then the user decides which Tier 2/3 items to fund/scope.
