# Implementation Plan - Unboxed DAW AI Sound Designer Overhaul

## Goal
Integrate a robust, low-latency AI sound generation pipeline using Gemini.

## Architectural Overhaul

### 1. Unified Backend Routing (`AIAudioEngine.ts` / `server.ts`)
- Implement `AIAudioEngine` class in TypeScript to handle API communications with Gemini API.
- Create secure server-side route `/api/generate-sound` (Node.js/Express) to invoke Gemini Flash with `response_modalities=["AUDIO"]`.
- Ensure system prompt mandates raw audio byte output: *"You are an isolated, high-fidelity sound design synthesizer. Output ONLY raw audio bytes matching the prompt. No text, no intros, no silence."*

### 2. Workflow Integration
- **Text-to-Instrument**: Intercept track header input, generate base anchor note (C4) sample, and load into a `SamplerDevice`.
- **MIDI Synthesis**: Implement a background listener in `AudioEngine` that detects missing asset mappings for MIDI events and triggers on-the-fly synthesis for the required pitch.
- **Morph & Breed (Mutation)**: Add a "Mutate" macro knob to rack devices that triggers sound regeneration with timbre-altering mutation directives.

### 3. Latency Mitigation & Caching Layer
- **Async Processing**: Execute all network requests in background workers; never block the main audio or UI thread.
- **Predictive Pre-fetching**: Play a placeholder transient on trigger, replacing it with the high-fidelity AI-generated sample seamlessly upon download completion.
- **Local Asset Cache**: Persist generated samples to a local indexed database (SQLite) for instant recall in future sessions.

## Verification
- Compile and lint using `compile_applet` and `lint_applet`.
