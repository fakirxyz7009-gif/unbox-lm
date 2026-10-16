# Implementation Plan - Unboxed DAW Advanced Architectural Overhaul

## Goal
Incorporate all advanced Reason-grade architectural requirements into Unboxed: Rear Panel CV Routing Matrix, Plugin Engine Interoperability, Combinator Macro Engine, Zero-Latency Inline MIDI Players, and 64-Channel Auxiliary Summing Bridges.

## Proposed Architectural Modules & Changes

### 1. Rear Panel CV Routing Matrix (`CVEngine.ts` / `BaseDevice.ts`)
- Implement dual-state component models with front UI controls and rear patch bays (Audio In/Out, CV In/Out).
- Support 32-bit floating-point audio-rate CV modulation loops between CV outputs and parameter knobs.
- Add auto-routing algorithms with manual override (`Shift + Drag`).

### 2. Rack Plugin Interoperability & Host Sync (`AudioEngine.ts`)
- Decouple core DSP synthesis from the UI shell.
- Implement robust state serialization (XML/binary blobs) and host clock/PPQN synchronization down to the sample level.

### 3. Combinator Macro Container Engine (`CombinatorDevice.ts`)
- Build nested hierarchy management for multi-plugin grouping inside master sub-containers.
- Implement internal macro modulation target grids mapping single knob movements to multi-destination parameter curves with custom scaling.

### 4. Zero-Latency Inline Instrument Players (`PlayerEngine.ts`)
- Build real-time MIDI intercept blocks (Arpeggiators, Note Echoes, Scale/Chords) sitting above virtual synths with 0 samples added latency.

### 5. Multi-Channel Summing Bridges (`MixerConsoleView.tsx`)
- Support up to 64 independent auxiliary output channel allocations from any parent plugin container directly into master mixer tracks.

## Verification
- Compile and lint using `compile_applet` and `lint_applet`.
