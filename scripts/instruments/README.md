# Instrument packs (`npm run instrument`)

Turns real recordings into rack instruments. Each pack lands in `public/instruments/<id>/`
(`instrument.json` + `samples/*.ogg`), is listed in `public/instruments/index.json` and
`shared/instruments/catalog.ts`, and shows up in the app as its own device (`rec_<id>`) under
**Recorded Drums & Percussion** or **Recorded Instruments**. Credits go to
`public/instruments/CREDITS.md`.

Needs `ffmpeg` and `ffprobe` on PATH. The FreePats Recorder fetcher needs 7-Zip (`7z.exe`) or `7z` on
PATH; set `UNBOX_7ZIP_PATH` if it is installed elsewhere. The FreePats fingerstyle-bass fetcher uses
`tar`/libarchive with 7z support.

## Only use recordings you may redistribute

Packs ship inside the app. Use your own recordings, CC0 / CC-BY libraries (credit the author), or
libraries whose license allows redistribution inside software. Most "royalty-free" sample packs
allow music made with them but **not** bundling the raw files in another product. Never sample
commercial songs.

Share builds automatically clear only exact CC0-1.0 and CC-BY 1.0/2.0/2.5/3.0/4.0 identifiers. Other
variants, including NC, ND and SA, need a separate policy and are excluded by the allowlist.

Good free sources: [sfzinstruments.github.io](https://sfzinstruments.github.io) (many CC0),
VSCO 2 Community Edition (CC0), University of Iowa MIS, Freesound (filter by CC0).

The FreePats Clarinet pack is reproducible with `npm run fetch:instrument:freepats-clarinet`. The
fetcher pins and hashes the official FreePats archive, checks the CC0 readme credits for performer
Kaili Dence, recording engineer Tyler Dence, and bank processor Roberto, validates all nine WAV
headers, then rebuilds `public/instruments/freepats-clarinet/`. Its browser probe checks recorded
note selection, loop playback, release, and full MIDI 45–91 mapping.

The FreePats Wooden Recorder pack is reproducible with `npm run fetch:instrument:freepats-recorder`.
Its fetcher pins and hashes the official CC0 archive, validates Eugene Vlaskin's performance and
recording credit, verifies all 34 WAV files, and builds two round-robin takes for each mapped pitch.
The key map shifts the source down one octave to cover MIDI 57–88 (C4–E6). Its browser probe checks
sample decoding, audible sustain, loop playback, release, and full key coverage.

The FreePats Bagpipe in G pack is reproducible with `npm run fetch:instrument:freepats-bagpipe`.
Its fetcher pins the official 2026-08-06 release and source revision, verifies the CC0 license,
Gilles Sadowski's performance and recording credit, all 14 FLAC files, and the SFZ loop points.
The compact instrument includes separate G2 and G3 drones (MIDI 36–59) and looped notes (MIDI
64–81); MIDI 60–63 remains unmapped as in the source. Its browser probe checks sample decoding,
sustained output, note-off release, and key coverage.

The FreePats Concert Harp pack is reproducible with `npm run fetch:instrument:freepats-harp`.
The fetcher pins the official archive SHA-256, validates the exact archive members, K. Smith's
performer credit, the CC0 notice, 36 FLAC headers, and the SFZ's velocity-layer and key ranges. The
pack maps MIDI 28–102 and preserves the two velocity layers in its source. Its browser probe checks
all samples decode, low/mid/high notes render, and MIDI 60 switches between its recorded velocity
layers.

The FreePats Fingerstyle Electric Bass pack is reproducible with `npm run fetch:instrument:freepats-bass`.
It pins the official CC0 archive hash, verifies the exact 7z members and license/credits, validates
all 12 FLAC headers and the SFZ's MIDI 26–45 mapping, then builds the recorded samples into a playable
bass device. Andrea Biasior is credited for creating the recordings; Roberto is credited for source
sample and sound-bank edits. The browser probe checks sample decoding, mapping coverage, and audible
low, mid, and high notes.

The Ganjo Six-String Banjo pack is reproducible from the pinned CC0 SFZ source revision below. The
source README credits itsclipping with recording, editing and mapping the SX-brand guitar-banjo
samples. The compact pack maps MIDI 38–72 and keeps up to two round robins per pitch. Its browser
probe verifies license/credit metadata, complete key coverage, both MIDI 58 round robins, sample
decoding and audible offline output.

The VCSL Marimba pack uses 30 acoustic recordings from the official
[VCSL source](https://github.com/sgossner/VCSL/tree/c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e/Idiophones/Struck%20Idiophones/Marimba).
Its fetcher pins revision `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e`, verifies every source SHA-256
and WAV header, and retains the CC0 license and library creator credit. The source does not name the
individual marimba performer. The source's octave labels are one below measured MIDI pitch, so the
recipe maps them up 12 semitones to F2–C7. Three recorded dynamics remain separate, and `oneShot`
lets strikes ring after key-up. The browser probe checks all sample decodes, layer selection, pitch,
natural tails and the working Length control.

```bash
npm run fetch:instrument:vcsl-marimba
npm run instrument -- recipe scripts/instruments/recipes/vcsl-marimba.json
npm run test:browser-marimba
```

```bash
npm run instrument -- sfz "github:sfzinstruments/ganjo@ccff5cd5cd3b513873a48994c07724d9d3c39e1c/ganjo.sfz" --id ganjo --name "Ganjo Six-String Banjo" --kind melodic --category guitar --spdx CC0-1.0 --author "itsclipping (recorded, edited and mapped)" --source "https://github.com/sfzinstruments/ganjo/tree/ccff5cd5cd3b513873a48994c07724d9d3c39e1c" --description "Recorded SX-brand six-string guitar banjo with round-robin performances; CC0." --notes "The source README credits itsclipping with recording, editing and mapping the samples. CC0-1.0. Source SFZ covers MIDI 38–72; this compact pack keeps up to two round robins and MIDI 38–72." --keys 38-72 --max-rr 2 --max-seconds 3
```

## Commands

```bash
# SFZ library (local file, or straight from GitHub — only the samples used are downloaded)
npm run instrument -- sfz github:owner/repo/path/program.sfz --id my-kit --name "My Kit" \
  --kind drums --category drums --spdx CC0-1.0 --author "Attribution source; performer only if verified" \
  --lanes "Kick=36:kick,Snare=38:snare,Closed Hat=42:hatC,Open Hat=46:hatO" \
  --max-layers 5 --max-rr 3 --max-seconds 3

# If the SFZ's sample paths live in a sibling folder, resolve them relative to that folder
npm run instrument -- sfz github:owner/repo/Programs/program.sfz --sample-root ../Samples \\
  --id my-instrument --name "My Instrument" --kind melodic --category keys \\
  --spdx CC0-1.0 --author "Verified recording credit"

# A folder of recordings, described by a recipe (see recipe.ts for the format)
npm run instrument -- recipe path/to/recipe.json

# Cut one long take of separate hits / notes into files (then write a recipe for them)
npm run instrument -- chop take.wav --out hits/ --pitch

npm run instrument -- list
npm run instrument -- remove <id>
```

Add `--dry-run` to see zone / sample counts and the download size first. Size knobs:
`--max-layers` (velocity layers), `--max-rr` (round robins), `--key-step` (keep every Nth sampled
note), `--max-seconds` / `--max-seconds-key 49=4.5`, `--keys 21-108`. Recordings that are the same
in both channels are stored as mono (half the memory).

SFZ release-trigger regions (`trigger=release`) are stored separately and play on MIDI key-up,
using the held note's velocity, articulation, and round-robin selection.
SFZ sticky keyswitches (`sw_last`) import the default articulation by default, preserving the
previous behavior. Add `--all-articulations` to retain every sticky articulation and its
`sw_label`; the resulting pack responds to the listed MIDI keyswitch notes. Keyswitch notes select
an articulation without sounding as pitched notes. Momentary `sw_down` and `sw_up` selectors are
preserved in pack zones and respond while their switch note is held or released; their state follows
physical key-up even when the sustain pedal keeps the played note sounding. The device browser lists
their MIDI notes. The switch note itself is silent. `sw_previous` is preserved and matches the
immediately preceding note-on; release-trigger regions retain the selector context from their
attack. `trigger=first`, legato, and other unimplemented triggers are reported as skipped regions.
See the [SFZ `sw_down` / `sw_up` reference](https://sfzformat.com/opcodes/sw_down/) and
[`sw_previous` reference](https://sfzformat.com/legacy/) for the source semantics.

Memory: decoded samples live in RAM (48 kHz float), roughly 0.19 MB per stereo second. Keep a
pack under ~150 MB of decoded audio.

For melodic mallets and other natural decaying strikes, recipes can set `"oneShot": true`. Key-up
then leaves the strike ringing, and the rack panel offers Length instead of Release. Length scales
the retained sample duration; sustained melodic recipes keep their ordinary Release control.

## How the bundled packs were built

```bash
npm run instrument -- sfz github:sfzinstruments/karoryfer.shinyguitar/Programs/acoustic.sfz --sample-root ../Samples --id shinyguitar-acoustic --name "Shinyguitar Archtop" --kind melodic --category guitar --spdx CC0-1.0 --author "D. Smolken (performer and mapper); Karoryfer Samples" --source "https://github.com/sfzinstruments/karoryfer.shinyguitar" --description "Recorded archtop guitar performed and mapped by D. Smolken; four-way round robin and velocity layers reduced for a compact, playable pack." --notes "CC 100 pickup/microphone blend baked at 100/127 for audible output; 0 is magnetic pickup, 127 is microphone signal in the source instrument." --cc 100=100 --max-layers 2 --max-rr 2 --max-seconds 3 --keys 40-84

npm run instrument -- sfz github:sfzinstruments/karoryfer.big-rusty-drums/Programs/02-basic.sfz --id big-rusty-drums --name "Big Rusty Drums" --kind drums --category drums --spdx CC0-1.0 --author "Karoryfer Samples" --description "Vintage acoustic rock drum sample pack: close and overhead mics mixed, 5 velocity layers, 3 round robins, hi-hat choke." --lanes "Kick=36:kick,Snare=38:snare,Side Stick=37:rim,Rimshot=40:snare,Closed Hat=42:hatC,Pedal Hat=44:hatP,Open Hat=46:hatO,High Tom=47:tom,Mid Tom=45:tom,Low Tom=43:tom,Crash=49:cymbal,Ride=51:ride,Ride Bell=53:ride" --max-layers 5 --max-rr 3 --max-seconds 3 --max-seconds-key 49=4.5,51=4.5,53=4

npm run instrument -- sfz github:sfzinstruments/Osiris_Piano/Programs/01-natural.sfz --id osiris-piano --name "Osiris Piano" --kind melodic --category piano --spdx CC0-1.0 --author "Versilian Studios & Karoryfer Samples" --description "Acoustic piano sample pack: three mics mixed, 2 velocity layers, re-struck notes damp the previous one." --key-step 2 --max-seconds 8

npm run instrument -- sfz github:sfzinstruments/karoryfer.growlybass/growlybass_clean.sfz --id growlybass --name "Growlybass" --kind melodic --category bass --spdx CC0-1.0 --author "Karoryfer Samples" --description "Squier Jazz Bass direct-sample pack (both pickups, roundwounds): 3 velocity layers, 2 round robins." --notes "The source's key centers sit one octave above the recorded pitch (measured); --key-shift -12 maps each sample to its sounding pitch." --keys 21-68 --key-shift -12 --max-layers 3 --max-rr 2 --max-seconds 4 --release 0.12

npm run instrument -- sfz github:sfzinstruments/karoryfer.emilyguitar/emily_clean.sfz --id emilyguitar --name "Emilyguitar" --kind melodic --category guitar --spdx CC0-1.0 --author "Karoryfer Samples" --description "Epiphone electric guitar direct-sample pack (both pickups, flatwounds): 3 velocity layers, 2 round robins. Add an amp or drive for rock tones." --keys 25-89 --max-layers 3 --max-rr 2 --max-seconds 5 --release 0.15

# Virtuosity Drums — CC0 recordings performed by Austin McMahon; MIDI 96 is the CC1 snare roll.
npm run instrument -- sfz github:sfzinstruments/virtuosity_drums@9f04cf9a734527edfbb0a4eee1f674e45bbf71bc/Programs/02-full-kit.sfz --id virtuosity-drums --name "Virtuosity Drums" --kind drums --category drums --spdx CC0-1.0 --author "Austin McMahon (drummer); Versilian Studios & Karoryfer Samples (library)" --source "https://github.com/sfzinstruments/virtuosity_drums/tree/9f04cf9a734527edfbb0a4eee1f674e45bbf71bc" --description "Recorded contemporary jazz drum kit performed by drummer Austin McMahon; compact kick, snare and overhead mic mix, with a dedicated CC1-controlled continuous snare-roll pad." --notes "MIDI 96 triggers the continuous snare roll; CC1 crossfades its five recorded dynamics layers. Source default set_cc1=31. CC0 recordings; ref 9f04cf9a734527edfbb0a4eee1f674e45bbf71bc." --lanes "Kick=36:kick,Snare=38:snare,Side Stick=37:rim,Open Hat=42:hatO,Pedal Hat=44:hatP,Low Tom=41:tom,High Tom=48:tom,Crash=49:cymbal,Ride=51:ride,Ride Bell=53:ride,Snare Roll=96:snare" --max-layers 4 --max-rr 3 --max-seconds 4

npm run instrument -- sfz github:sgossner/VSCO-2-CE@SFZ/SViolin-KS.sfz --id vsco-solo-violin-articulations --name "VSCO Solo Violin Articulations" --kind melodic --category violin --spdx CC0-1.0 --author "Sam Gossner, Simon Dalzell, Elan Hickler / Versilian Studios" --source "https://github.com/sgossner/VSCO-2-CE/tree/SFZ" --description "Recorded solo violin with sustain vibrato, tremolo, spiccato, and pizzicato articulations from the CC0 VSCO 2 Community Edition. MIDI keyswitch notes are listed in the device browser." --all-articulations --keys 48-84 --max-seconds 8 --release 0.8

# Greg Sullivan E-Pianos — CC BY 3.0 Pianet and Wurlitzer recordings; SFZ maps by kinwie.
# The upstream README does not separately name the sample performer.
npm run instrument -- sfz "github:sfzinstruments/GregSullivan.E-Pianos/Pianet T/Pianet T.sfz" --id pianet-t --name "Hohner Pianet T" --kind melodic --category piano --spdx CC-BY-3.0 --author "Greg Sullivan (instrument); kinwie (SFZ mapping)" --source "https://github.com/sfzinstruments/GregSullivan.E-Pianos/tree/master/Pianet%20T" --description "Recorded Hohner Pianet T electric piano from Greg Sullivan's CC BY 3.0 SFZ library; mapped by kinwie." --notes "The upstream README credits Greg Sullivan for the instrument and kinwie for SFZ mapping; it does not separately identify the sample performer. CC BY 3.0 attribution is required." --max-seconds 4 --max-layers 4

npm run instrument -- sfz "github:sfzinstruments/GregSullivan.E-Pianos/Wurlitzer EP200/Wurlitzer EP200.sfz" --id wurlitzer-ep200 --name "Wurlitzer EP200" --kind melodic --category piano --spdx CC-BY-3.0 --author "Greg Sullivan (instrument); kinwie (SFZ mapping)" --source "https://github.com/sfzinstruments/GregSullivan.E-Pianos/tree/master/Wurlitzer%20EP200" --description "Recorded Wurlitzer EP200 electric piano from Greg Sullivan's CC BY 3.0 SFZ library; mapped by kinwie." --notes "The upstream README credits Greg Sullivan for the instrument and kinwie for SFZ mapping; it does not separately identify the sample performer. CC BY 3.0 attribution is required." --max-seconds 4 --max-layers 4

# VCSL Pipe Organ — Simon Dalzell's CC0 real-organ recordings (sample and attribution hashes are pinned)
npm run fetch:instrument:vcsl-pipe-organ
npm run instrument -- recipe scripts/instruments/recipes/vcsl-pipe-organ.json

# VSCO Cello Ensemble — CC0 sustain, tremolo, spiccato, and pizzicato with MIDI keyswitches.
# Source ref is pinned; selected samples are trimmed to 4.5 s (~141 MiB decoded).
npm run instrument -- sfz github:sgossner/VSCO-2-CE@6dd651d55dde97fd4028699be9d4481f26917891/CelloEns-KS.sfz --id vsco-cello-ensemble-articulations --name "VSCO Cello Ensemble Articulations" --kind melodic --category strings --spdx CC0-1.0 --author "Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote" --source "https://github.com/sgossner/VSCO-2-CE/tree/6dd651d55dde97fd4028699be9d4481f26917891" --description "Recorded cello ensemble with sustain, pizzicato, spiccato and tremolo articulations from the CC0 VSCO 2 Community Edition. MIDI keyswitches select articulations." --notes "VSCO 2 CE is CC0; source README credits recordings to Sam Gossner and Simon Dalzell, and sample cutting to Elan Hickler / Soundemote. Four keyswitch-selected articulations, MIDI 36–76, 155 recordings, 4.5-second maximum sample cuts." --all-articulations --keys 36-76 --max-layers 2 --max-rr 2 --max-seconds 4.5 --release 0.8

# FreePats Button Accordion HN — Jeff Stauffer recordings, pinned CC0 source, sustain loops + release samples.
npm run instrument -- sfz 'github:freepats/button-accordion-HN@d70d16456fd99305d1c24c612b205ab38846eb0f/PRESET Button Accordion HN tuned.sfz' --id button-accordion-hn --name "Button Accordion HN" --kind melodic --category keys --spdx CC0-1.0 --author "Jeff Stauffer (recordings); Piotr Barz (contributor); michael02022 (SFZ processing and sound bank)" --source "https://github.com/freepats/button-accordion-HN/tree/d70d16456fd99305d1c24c612b205ab38846eb0f" --description "Recorded Hohner button accordion by Jeff Stauffer, with sustain loops and release-trigger samples from the FreePats SFZ bank." --notes "The source README credits Jeff Stauffer for the November 2023 recordings, Piotr Barz for connecting them to FreePats, and michael02022 for sample processing and sound-bank creation. CC0-1.0. The SFZ maps sampled notes from MIDI 47 to 79 and extends its upper zone; this pack is trimmed to MIDI 47-91." --keys 47-91 --max-seconds 5 --release 0.13

# FreePats Bagpipe in G — Gilles Sadowski's real performance, CC0, two drones, and SFZ sustain loops.
npm run fetch:instrument:freepats-bagpipe

# Chemnitzer Concertina — download the CC0 release from the creator's page, unpack it, then:
npm run instrument -- sfz data/instrument-cache/tomiak-chemnitzer/Chemnitzer/chemnitzer.SFZ --id tomiak-chemnitzer-chemnitzer --name "Chemnitzer Concertina" --kind melodic --category keys --spdx CC0-1.0 --author "Josh Tomiak" --source "https://tomiakchemnitzer.com/digital-instrument/" --description "Recorded Chemnitzer concertina with three attack velocity layers and release samples; CC0." --key-step 2 --max-layers 3 --max-seconds 6 --release 0.18
```

The creator's [Digital Instrument page](https://tomiakchemnitzer.com/digital-instrument/) links the source archive and identifies it as CC0. The downloaded archive's included license is also CC0 1.0 Universal. Josh Tomiak is credited as the library creator; the archive does not claim he is the recording performer.

Tabla & Dholak and Harmonium come from CC0 Freesound sounds (their high-quality Ogg previews, as
originals need a Freesound login): recipes in `recipes/`. Put the files in
`data/instrument-cache/freesound/` first:

- `tabla/`: sounds 130404–130430 by mmiron (file names = sound titles, e.g. `ghe_2.ogg`)
- `dholak/`: sounds 536871–536872 by curesforbrokenhearts (`DHOLAK_BASS_SKIN.ogg`, `DHOLAK_TREBLE_SKIN.ogg`)
- `harmonium/`: sounds 523851–523889 by cabled_mess (`Harmonium-C2.ogg` … `Harmonium-D5.ogg`)

```bash
npm run instrument -- recipe scripts/instruments/recipes/tabla-dholak.json
npm run instrument -- recipe scripts/instruments/recipes/harmonium.json
```
