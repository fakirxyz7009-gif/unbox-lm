# Free Instrument Batch 007

**Built:** 2026-11-15

**Result:** 20 new playable packs adding **21,193,065 bytes** and
**403 unique recordings**. Every pack is `CC0-1.0`, and every one
is a distinct VCSL folder that was not represented by the 58 VCSL packs already
in the catalog. This batch contains no articulation-only alternates and no
repeated Karoryfer, VSCO or FreePats slot.

The remaining VCSL material is mostly orchestral percussion and keyboard
recordings, so this batch is weighted there while still adding four aerophones
and four string or keyboard instruments. The three snares are three different
drums, not alternate articulations of one drum; the two harpsichords are
different historical instruments.

## Why these 20

| Group | Count | Notes |
| --- | ---: | --- |
| Aerophones | 4 | Ball whistle, baroque alto recorder, small ocarina, chromatic harmonica |
| Strings and keys | 4 | Concert harp, grand piano, Flemish harpsichord, English harpsichord |
| Orchestral and hand percussion | 12 | Cajon, finger cymbals, glockenspiel, hi-hat, small shaker, xylophone, two modern snares, rope-tension snare, timpani, tom, tubular bells |
| **Total** | **20** | Every entry is a different VCSL folder |

The melodic VCSL sources use octave labels one octave below the sounding pitch.
The recipes record the measured correction: every sampled root is raised by 12
semitones, so the grand piano spans A#0–C8, the concert harp E2–A7, the
harpsichords F#1–C6 and A#1–E6, and the alto recorder F4–E6. The drum and
percussion mappings are not transposed. The source labels remain visible in
each manifest's provenance notes.

## Build and verification

```bash
npm run fetch:instrument:vcsl-batch-007
# then run the 20 `npm run instrument -- recipe ...` commands listed in
# scripts/instruments/README.md
npm run test:browser-batch-007
```

- Browser probe: **PASS** — 20/20 packs, all 403 unique recordings decoded;
  **every playable MIDI key at each velocity layer produced audible output**
  (824 key/velocity notes across 492 playable pack keys); minimum RMS 0.0008.
- Focused policy test: **31/31 passed**, including the seventh-batch manifest,
  credits, sample-set and rack-device checks.
- Full regression suite: **404 tests — 402 passed, 2 skipped, 0 failed**. The two
  skips are the Ollama-dependent checks because Ollama is not running here.
- `npm run lint`: **passed** (`tsc --noEmit` plus the UTF-8 check over 1,236 text
  files). `npm run build`: **passed** (Vite production build).

This is browser Web Audio verification. No physical MIDI/audio-interface or G4
clean-machine validation is claimed.

## The batch

| Pack | ID | Source folder | Selection | Samples | Bytes |
| --- | --- | --- | --- | ---: | ---: |
| VCSL Ball Whistle | `vcsl-ball-whistle` | `sgossner/VCSL` — `Aerophones/Edge-blown Aerophones/Ball Whistle` | long and short blasts | 2 | 68,632 |
| VCSL Baroque Alto Recorder | `vcsl-baroque-alto-recorder` | `sgossner/VCSL` — `Aerophones/Edge-blown Aerophones/Baroque Alto Recorder/Sustain` | looped sustains, F4-E6 | 12 | 847,342 |
| VCSL Small Ocarina | `vcsl-ocarina-small` | `sgossner/VCSL` — `Aerophones/Edge-blown Aerophones/Ocarina, Small/Sustain` | looped sustains, A#5-B6 | 10 | 465,771 |
| VCSL Concert Harp | `vcsl-concert-harp` | `sgossner/VCSL` — `Chordophones/Composite Chordophones/Concert Harp` | medium/loud plucks, E2-A7 | 31 | 3,070,103 |
| VCSL Cajon | `vcsl-cajon` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Cajon` | three strikes, three dynamics | 18 | 262,044 |
| VCSL Finger Cymbals | `vcsl-finger-cymbals` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Finger Cymbals` | one strike | 1 | 68,742 |
| VCSL Glockenspiel | `vcsl-glockenspiel` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Glockenspiel` | soft/medium/loud, G5-C8 | 18 | 950,223 |
| VCSL Hi-Hat | `vcsl-hi-hat` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Hi-Hat Cymbal` | pedal, closed, loose and open | 15 | 308,814 |
| VCSL Small Shaker | `vcsl-shaker-small` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Shaker, Small` | eight gestures | 16 | 299,514 |
| VCSL Xylophone | `vcsl-xylophone` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Xylophone` | hard mallets, soft/loud, G4-C8 | 16 | 225,852 |
| VCSL Modern Snare 1 | `vcsl-snare-modern-1` | `sgossner/VCSL` — `Membranophones/Struck Membranophones/Snare Drum, Modern 1` | open/muted, rolls, stick, taps | 29 | 929,092 |
| VCSL Modern Snare 2 | `vcsl-snare-modern-2` | `sgossner/VCSL` — `Membranophones/Struck Membranophones/Snare Drum, Modern 2` | open/muted, cross-stick, rolls, stick, taps | 24 | 663,772 |
| VCSL Rope-Tension Snare | `vcsl-snare-rope-tension` | `sgossner/VCSL` — `Membranophones/Struck Membranophones/Snare Drum, Rope Tension` | high/low, muted, rim and stick | 32 | 747,044 |
| VCSL Timpani | `vcsl-timpani-1` | `sgossner/VCSL` — `Membranophones/Struck Membranophones/Timpani 1` | five drums, hits and rolls | 40 | 2,652,790 |
| VCSL Tom | `vcsl-tom-1` | `sgossner/VCSL` — `Membranophones/Struck Membranophones/Tom 1` | mallet/stick, rolls, rim | 22 | 708,621 |
| VCSL Tubular Bells | `vcsl-tubular-bells-1` | `sgossner/VCSL` — `Idiophones/Struck Idiophones/Tubular Bells 1` | nine pitches, soft/loud, C4-E5 | 18 | 2,628,975 |
| VCSL Flemish Harpsichord | `vcsl-harpsichord-flemish` | `sgossner/VCSL` — `Chordophones/Zithers/Harpsichord, Flemish/Sustains/Low` | lower choir, F#1-C6 | 28 | 1,615,215 |
| VCSL English Harpsichord | `vcsl-harpsichord-english` | `sgossner/VCSL` — `Chordophones/Zithers/Harpsichord, English/Sustains/Normal` | normal register, A#1-E6 | 28 | 1,355,639 |
| VCSL Chromatic Harmonica | `vcsl-harmonica-chromatic` | `sgossner/VCSL` — `Aerophones/Free Aerophones/Harmonica-Hohner-Super64/Sustains/Normal` | normal sustains, C3-C7 | 13 | 618,439 |
| VCSL Grand Piano | `vcsl-grand-piano` | `sgossner/VCSL` — `Chordophones/Zithers/Grand Piano, Kawai/Sustains` | two dynamics, A#0-C8 | 30 | 2,706,441 |

“Samples” counts the unique encoded `.ogg` files in each pack, not source
recordings, zones or velocity layers. All 20 packs keep the source's recorded
dynamics and round robins wherever the selected articulation provides them;
unused source articulations are listed in each manifest's provenance notes.
