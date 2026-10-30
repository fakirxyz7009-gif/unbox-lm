# Open-source VST / hardware-emulation list: where each item lands

The list has 100 GitHub projects in 10 groups. This maps each one to what the app already
does, what this pass added, and what is out of scope. Device names are the app's own
(no trademarks); the type id is what saved projects store.

**Verdicts**
- **Covered**: an existing device already does the job.
- **Added**: a new device from this pass (type id in backticks).
- **Partial**: an existing device covers part of it; the gap is noted.
- **Not added**: needs something the app does not have (a neural runtime, a file format
  loader, a native plugin host). The reason is in the row.

Browser-native plugins (VST, AU, LV2, CLAP) are not hosted: the app runs proxy DSP for
library units and never executes plugin binaries (see CLAUDE.md).

## 1. Analog and vintage synth emulations

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 1 | Dexed (DX7 FM) | Partial | Op-Nine FM (`algoritm`) has FM algorithms. DX7 SysEx cartridge import is not built. |
| 2 | OB-Xd | Covered | Seer-6 Analog Poly (`prophet6`), Lumen-X Poly (`juno_x`). |
| 3 | amsynth | Covered | Subterra 37 (`moog_sub37`), Lumen-X Poly (`juno_x`). |
| 4 | Munt (MT-32) | Not added | Needs the vendor's control and PCM ROMs, which are copyrighted. |
| 5 | ADLplug (OPL3) | Partial | Op-Nine FM for FM. Chip-exact OPL register behaviour is not modelled. |
| 6 | OPNplug (YM2612) | Partial | As 5, for the OPN2 chip. |
| 7 | Nekobi (TB-303 acid) | Added | `acid_line`: Acid Line AL-1. A voicing (saw/square ladder, slide, filter envelope), not an emulation. |
| 8 | Yoshimi | Covered | Spectra Additive (`parsec2`). PADsynth-style pads are not built. |
| 9 | ZynAddSubFX | Partial | Spectra, Heirloom (`moog_grandmother`), Hammerhouse (`radical_piano`) cover the engines. Microtonal tuning is not built. |
| 10 | Monique | Covered | Heirloom Semi-Modular (`moog_grandmother`), Gridbeast (`matrixbrute`). |

## 2. Wavetable, modular and performance synths

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 11 | Surge XT | Covered | Prism Wavetable (`waldorf_iridium`), Graintide (`malstrom`), Op-Nine FM. MPE is not built. |
| 12 | Vital | Covered | Prism Wavetable, Vista Hybrid (`scenic`), Spectra Additive. |
| 13 | Odin 2 | Covered | Subterra 37 ladder and the poly filter list. Korg35 / SEM-style filters are not separate. |
| 14 | Cardinal | Partial | Patchwork Modular (`complex1`), Westside Modular (`make_noise_shared`). A 1,000-module library is out of scope. |
| 15 | Audible Instruments | Partial | Granule (`grain`) ~ Clouds, Chime (`klang`) ~ Rings. The Braids / Plaits macro oscillators are not added. |
| 16 | Bespoke Synth | Not added | A live-coding environment; the rack is not a code host. |
| 17 | Helm | Covered | Duotone (`polytone`), Apex Poly (`novation_peak`), Redline Lead (`nord_lead4`). |
| 18 | Vitalium | Covered | Same as 12. |
| 19 | Digits (CZ-style) | Added | `phase_synth`: Phase Distortion Synth. A wavetable family whose frames are a sine bent by a power curve. |
| 20 | ChowMatrix | Partial | Orbit Space Delay (`ripley`) multi-tap feedback covers part. The matrix resonator is not built. |

## 3. Drum machines, percussion and grooveboxes

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 21 | Geonkick | Covered | Boomtown 8 (`tr08`), Boomtown Analog (`rd8`), Drumforge DF-1 (`drm1`). |
| 22 | DrumGizmo | Partial | Recorded kits (`rec_big_rusty_drums`, `rec_virtuosity_drums`). The multi-mic bleed model is not built. |
| 23 | Hydrogen | Covered | Beat Painter (`beat_map`), Groovemaster+ (`maschine_plus`). Humanize is the sequencer's. |
| 24 | drumkv1 | Partial | Atlas Drum Designer (`kong`). Per-pad filter and drive are not built (pads have level, tune and length). |
| 25 | Fabla | Covered | Beatcenter One (`mpc_one`); multisample choke groups in the engine. |
| 26 | BOOM | Covered | Boomtown 8 / 8S (`tr08`, `tr8s`), Boomtown Analog (`rd8`). |
| 27 | DPF Kars (Karplus-Strong) | Added | `plucked_string`: Plucked String. An AudioWorklet delay loop, so it tunes at any pitch. |
| 28 | OpenAV Luppp | Covered | The clip launcher and loop player (`dr_octo_rex`, Loopcrate). |
| 29 | x42-whirl (rotary) | Added | `rotary_cabinet`: Rotary Cabinet RC-1. Horn and drum rotors, Doppler and level sweeps, two mics. |
| 30 | BratVibe (Uni-Vibe) | Partial | Rotary Cabinet at a low Depth gives the vibrato. The photocell phase network is not modelled. |

## 4. Analog EQs and channel strips

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 31 | PTEq-X (Pultec) | Covered | Tubeshelf Program EQ (`pultec_eqp1a`). MEQ-5 and HLF-3C are not separate. |
| 32 | ChowEQ | Partial | Parametric EQ (`peq2`), Channel EQ (`channel_eq`). Per-band saturation is not built. |
| 33 | Luftikus | Added | `graphic_eq`: Graphic EQ 10-Band, fixed sliders. Octave-spaced, not half-octave. The Air shelf is Tubeshelf's high boost. |
| 34 | x42-eq | Covered | Channel EQ (`channel_eq`), Masterline Equalizer (`mclass_eq`). |
| 35 | Airwindows Console | Covered | Summing mixers (`neve5059`, `api8200`, `ssl_sigma`, and others), bus compressor (`ssl_gbus`). |
| 36 | EQ10Q | Partial | Graphic EQ 10-Band (fixed bands with sliders, not parametric). The Meters page has the analyser. |
| 37 | Calf Equalizer | Added | `graphic_eq`: Graphic EQ 10-Band. The 12-band variant is not built. |
| 38 | Zita-EQ | Covered | Masterline Equalizer (`mclass_eq`), the mastering chain EQ. |
| 39 | AnalogTapeModel | Covered | Retrofier (`audiomatic`) tape presets. Tape Echo (`tape_echo`) adds tape saturation in its loop. |
| 40 | ChowCentaur (Klon) | Added | `drive_pedal`: Drive Pedal OD-9, Overdrive voicing. A voicing, not a circuit model. |

## 5. Vintage dynamics, compressors and limiters

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 41 | Squeezer | Covered | Punisher (`distressor`), FET Fury (`ua1176`), Silkopto (`la2a`), Glasstube (`avalon747`). |
| 42 | Calf Vintage Compressor (LA-2A) | Covered | Silkopto Leveling Amp (`la2a`), Warmopto (`wa2a`). |
| 43 | DPF Compressor (VCA) | Covered | Console Bus Compressor (`ssl_gbus`), Punisher (`distressor`). |
| 44 | x42-dpl (lookahead limiter) | Covered | Masterline Maximizer (`mclass_maximizer`), the mastering limiter. |
| 45 | SafeLimiter | Covered | Mastering limiter (true-peak ceiling), Masterline Maximizer. |
| 46 | Calf Multiband Limiter | Covered | The multiband stage of the mastering chain (not a rack device). |
| 47 | Stereo Tool | Covered | Stereo Tool (`stereo_tool`), Masterbuss MB-2 (`portico2_mbp`). |
| 48 | x42-meter | Covered | Meters page: loudness (BS.1770), true peak and LRA in `audio/analysis/loudness.ts`. |
| 49 | Klangfalter (IR loader) | Not added | Needs an impulse-response store, a file picker and an offline path. Next candidate. |
| 50 | Matchering | Covered | Mastering assistant (`audio/mastering/assistant.ts` autoMaster) and the reference player. |

## 6. Guitar amps, preamps and stompboxes

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 51 | Neural Amp Modeler | Not added | Needs a neural inference runtime and `.nam` model files. |
| 52 | Guitarix | Covered | Stack Guitar Amp (`softube_amp`), Low End Bass Amp (`softube_bass_amp`). |
| 53 | SmartPedal | Not added | Deep-learning pedal models (as 51). |
| 54 | SmartAmp | Not added | Neural amp (as 51). |
| 55 | ToneTwist | Added | `drive_pedal`: Drive Pedal OD-9, Overdrive and Fuzz voicings. A booster is the Level gain. |
| 56 | ChowMultiTool | Covered | Wrecker (`pulveriser`), Foldback FD-2 (`d11`), Stack Guitar Amp. |
| 57 | Wolf Shaper | Not added | A spline-curve editor is UI work. Fixed shapers exist (FD-2, Drive Pedal). Next candidate. |
| 58 | TS-999 Sub-Screamer | Added | `drive_pedal`: Drive Pedal OD-9, Mid Push voicing (a mid hump before a soft clip). |
| 59 | BadRatz (ProCo Rat) | Added | `drive_pedal`: Drive Pedal OD-9, Hard Clip voicing (a diode-style knee). |
| 60 | Ignite Emissary | Covered | Stack Guitar Amp (`softube_amp`), high-gain setting. |

## 7. Reverbs, delays and space

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 61 | Dragonfly Reverb | Covered | RB-2 Reverb (`rv7`), ten algorithms including hall, room and plate. |
| 62 | MVerb | Covered | RB-2 Reverb (`rv7`). The Dattorro topology is not confirmed to match. |
| 63 | CloudReverb | Covered | RB-2 Reverb (`rv7`) ambient algorithms, Orbit Space Delay (`ripley`). |
| 64 | BBD Delay | Added | Tape Echo TE-1 (`tape_echo`), Bucket Brigade mode: bandwidth-limited repeats, no wow. |
| 65 | Freeverb3 | Covered | RB-2 Reverb (`rv7`). |
| 66 | Zita-Rev1 | Covered | RB-2 Reverb (`rv7`), Orbit Space Delay (`ripley`) tails. |
| 67 | TAL-Dub (tape delay) | Added | Tape Echo TE-1, Tape mode: wow and flutter, tone and saturation in the feedback loop. |
| 68 | TapeDelay (RE-201) | Partial | Tape Echo TE-1 has one head. Multi-head taps and the preamp are not built. |
| 69 | EarlyReflections | Partial | RB-2 Reverb early and room algorithms. A separate room-geometry device is not built. |
| 70 | ChowPhaser (Bi-Phase) | Covered | PS-2 Phaser (`ph90`) with feedback, Swirl (`sweeper`) phaser mode. |

## 8. Modulation, filters and saturation

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 71 | TAL-Chorus-LX | Covered | Quadrant Chorus Ensemble (`quartet`), CH-2 Chorus/Flanger (`cf101`). |
| 72 | Moog Ladder Filter (DPF) | Added | `ladder_filter`: Ladder Filter LF-4. A four-pole AudioWorklet ladder that self-oscillates at full resonance. |
| 73 | Wally Flanger | Partial | CH-2 Chorus/Flanger (`cf101`) flanges. Through-zero is not built. |
| 74 | TAL-Vocoder | Covered | Voxbox Digital Vocoder (`bvx_vocoder`). |
| 75 | Calf Rotary Speaker | Added | Same device as 29: Rotary Cabinet RC-1 (`rotary_cabinet`). |
| 76 | Calf Phaser & Flanger | Covered | PS-2 Phaser (`ph90`), Swirl (`sweeper`) six-stage all-pass. |
| 77 | Auto-Wah | Covered | EF-2 Envelope Filter (`ecf42`), Auto Trigger. |
| 78 | Stereo Tremolo | Added | `stereo_tremolo`: Stereo Tremolo ST-2. Mono, Quad or Opposite phase between the sides. |
| 79 | Calf Saturator | Covered | Retrofier (`audiomatic`), Wrecker (`pulveriser`), Drive Pedal OD-9. |
| 80 | Calf Sidechain Gate | Covered | Gatekeeper (`alligator`), the gate in Channel Dynamics (`channel_dynamics`). |

## 9. Samplers, SoundFont and multi-sample players

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 81 | SFZero | Covered | The SFZ pipeline (`npm run instrument -- sfz`) makes recorded packs (`rec_*`). No runtime SFZ loader. |
| 82 | sfizz | Partial | The SFZ pipeline (round robins, velocity layers). Keyswitches are not built. |
| 83 | TinySoundFont | Partial | SoundFontEngine plays its code-built banks. Loading `.sf2` files is not built. |
| 84 | samplv1 | Covered | Zone XS (`nnxt`), Zone One (`nn19`), Songbox (`layers_id8`), the multisample engine. |
| 85 | FluidSynth | Partial | As 83. |
| 86 | LinuxSampler | Partial | As 83 for `.sf2`. No GIG or DLS loader. |
| 87 | Soundpipe Sampler | Covered | Granule (`grain`), the granular engine. |
| 88 | DPF Soundfont | Partial | As 83. ADSR is on the sampler devices. |
| 89 | Squeezer Sampler Utility | Partial | Onset detection in `shared/transcription` (drum hits). Not a device. |
| 90 | LPC Vocoder | Partial | Chorale Vocal Ensemble (`humana`), Voxbox (`bvx_vocoder`). LPC resynthesis is not built. |

## 10. Plugin hosts, modular bridges and frameworks

| # | Project | Verdict | Where / note |
|---|---|---|---|
| 91 | Carla (host) | Not applicable | Hosts native VST, AU and LV2 binaries. The app does not run plugin binaries (CLAUDE.md). |
| 92 | DISTRHO Plugin Framework | Not applicable | C++ framework for native plugins. |
| 93 | CLAP | Not applicable | A native plugin standard. |
| 94 | iPlug2 | Not applicable | C++ framework for native plugins. |
| 95 | NIH-plug | Not applicable | Rust framework for native plugins. |
| 96 | JUCE | Not applicable | C++ application framework. |
| 97 | Faust | Not added | Compiles DSP to WebAudio worklets. The compiler's licence needs a review before it is a build dependency. |
| 98 | Pedalboard | Not applicable | Python host for VST3 on a server. |
| 99 | VST3 SDK | Not applicable | Native plugin SDK. |
| 100 | YSFX (JSFX) | Not added | A JSFX interpreter is a separate runtime. JSFX scripts are user content. |

## Summary

- **Covered:** 46 rows (existing devices already do the job).
- **Added:** 15 rows, from 9 new devices: `graphic_eq`, `ladder_filter`, `drive_pedal`,
  `tape_echo`, `rotary_cabinet`, `stereo_tremolo`, `plucked_string`, `phase_synth`, `acid_line`.
- **Partial:** 22 rows. **Not added:** 9 (ROMs, neural models, a live-coding environment, a
  convolution loader, a spline editor, Faust, JSFX).
- **Not applicable:** 8 (native plugin hosts, frameworks and SDKs).

Next candidates, from the Not added rows: a convolution IR loader (49), a spline waveshaper
(57), a neural amp runtime (51, 53, 54), and SF2 loading (83, 85, 86, 88).
