# Free Instrument Source and Licensing Audit

**Audit date:** 2026-11-15

**Scope:** real recorded instruments that can be bundled inside Unbox Studio and redistributed in a commercial build.

**Decision:** **1000 distinct free instruments are not available from these sources.** The eligible pool is approximately a few hundred distinct instruments, before quality culling. This audit itself did not add packs; the approved first through seventh batches were implemented afterwards.

This is a product/licensing audit, not legal advice. Confirm the final bundle
with counsel and keep the source evidence with the release.

## Current state

| Metric | Value |
| --- | ---: |
| Recorded packs after batch 007 | 192 |
| Pack data | 291,493,691 bytes (about 278 MiB) |
| CC0-1.0 packs | 184 |
| CC-BY-3.0 packs | 3 |
| CC-BY-4.0 packs | 1 |
| Private `Custom` packs | 4 |
| Redistributable packs | 188 |

The current share policy in `shared/instruments/catalogTypes.ts` permits only:

- `CC0-1.0`
- `CC-BY-1.0`
- `CC-BY-2.0`
- `CC-BY-2.5`
- `CC-BY-3.0`
- `CC-BY-4.0`

Everything else is removed by `scripts/prune-share-build-core.ts`. A free
download is not enough: the licence must allow **bundling the raw recordings
inside software**, not merely making music with them.

## Eligibility rules

A source is **approved** only when all of these hold:

1. The recordings may be redistributed inside a commercial application.
2. The licence is CC0 or a supported CC-BY version, or the project explicitly
   adopts a reviewed equivalent policy.
3. The source, author and licence are recorded in `instrument.json` and
   `CREDITS.md`.
4. The samples are real recordings of the named instrument, not synthesized
   placeholders or renamed presets.
5. The SFZ/recipe can be imported without unsupported opcodes silently changing
   the instrument.
6. The pack fits the app's memory model. The converter README recommends
   keeping a pack under roughly 150 MB of decoded audio.

A **distinct instrument** means a separately playable instrument with its own
recorded sample set. Articulations (sustain, pizzicato, tremolo), microphone
positions, velocity layers and GM presets do not count as separate instruments.

## Approved sources for the implemented batches

| Source | Licence evidence | Distinct pool | Approx. size | Status | Notes |
| --- | --- | ---: | ---: | --- | --- |
| [VCSL](https://versilian-studios.com/vcsl) | Official page: CC0; “do whatever you want … even make commercial software” | ~100 | 4.0+ GB | **Approved** | Official material says dozens of instruments and 4,000+ samples; an independent mirror indexes 104 instrument folders. Not every folder is a conventional playable instrument. |
| [VSCO 2 Community Edition](https://versilian-studios.com/vsco-community/) | Official page and source README: CC0 | ~70 packs | ~3 GB | **Approved** | Already the largest source in the app. Remaining instruments and articulations need deduplication. |
| [FreePats individual banks](https://freepats.zenvoid.org/) | [Licence page](https://freepats.zenvoid.org/licenses.html): CC0 preferred; CC-BY 3.0/4.0 also used | Dozens | Varies | **Approved per bank** | Approve each bank separately. Do not assume the whole FreePats collection has one licence. |
| [Karoryfer free instruments](https://sfzlab.github.io/sfz-website/instruments/karoryfer-samples) | Per-release metadata; CC0 / CC-BY subset | Maybe 20–30 eligible of 45 listed | Varies | **Approved per release** | Many Karoryfer releases are commercial, NC, SA or custom; only the exact CC0/CC-BY releases qualify. |
| [Meta Open Sound](https://github.com/facebookincubator/Meta-open-sound) | CC0 instrument sets | 3 | ~37 MB | **Already integrated** | Piano, nylon guitar and steel guitar; all three are already packs. |
| [Freesound](https://freesound.org/) | Per-sample licence, filter CC0/CC-BY | Large, uncurated | Varies | **Approved with curation** | Useful for one-shots and percussion, not a ready-made multisample instrument. Mapping and provenance work is substantial. |

## Sources needing review

| Source | Finding | Disposition |
| --- | --- | --- |
| [University of Iowa MIS](https://theremin.music.uiowa.edu/mis.html) | The site says recordings are freely available “without restrictions” and may be used for any projects; it does not provide an SPDX identifier or a formal licence file. | **Legal review before use.** Do not record it as CC0 automatically. 23 orchestral instruments. |
| [FreePats General MIDI set](https://freepats.zenvoid.org/SoundSets/general-midi.html) | The combined GM set is GPLv3-or-later with a special exception, not the CC0 identifier used by individual banks. | **Separate licence review.** Not eligible under the current share allowlist. |
| [Sonatina Symphonic Orchestra](https://github.com/peastman/sso) | CC Sampling Plus 1.0, which is not in the current allowlist. | **Review or exclude.** Do not import until the policy is deliberately widened. |
| [Virtual Playing Orchestra](https://virtualplaying.com/virtual-playing-orchestra) | The author explicitly does not want the library repackaged and sold; redistribution terms are complicated. | **Exclude.** |
| [Philharmonia Orchestra samples](https://philharmonia.co.uk/resources/sound-samples/) | Free for commercial music, but must not be sold or made available “as is” as samples or a sampler instrument. Bundling them as playable packs is the prohibited use. | **Exclude.** |
| [GeneralUser GS](https://www.schristiancollins.com/generaluser) | 261 presets plus 13 drum kits; custom licence permits use in software projects. | **Preset route only.** Not 261 distinct instruments; app SF2 playback is approximate. |
| [FluidR3 GM](https://musescore.org/en/handbook/3/soundfonts-and-sfz-files) | MIT-licensed GM bank, about 189 presets. | **Preset route only.** Overlapping GM programs, not new original instruments. |
| [MuseScore General](https://musescore.org/en/handbook/3/soundfonts-and-sfz-files) | MIT-licensed GM bank, 128+ presets. | **Preset route only.** Overlapping programs; not distinct real instruments. |
| `D:\vsr` / private `Custom` packs | No verified redistribution right. | **Excluded.** Never ship. |

## Count result

A realistic union of the approved sources is:

- VCSL: about 100 candidates, minus duplicates and non-instrument folders; 38
  are now represented after batches 001–005.
- VSCO 2 CE: about 70 packs, minus the 41 now represented as devices; many of
  those are alternate articulation/timbre programs, not distinct instruments.
- FreePats: dozens of individual banks, minus the 30 now represented.
- Karoryfer: perhaps 20–30 eligible releases, minus the 26 now represented
  (plus co-credited packs).
- Freesound: useful one-shots, but not a 1000-instrument library without a
  separate curation project.

After deduplication and quality culling, the practical pool is roughly
**200–300 distinct instruments**, not 1000. The exact number is deliberately not
claimed: source directories include articulations, microphone variants,
experimental recordings and non-instrument folders, and some licences need
review.

The obvious way to reach a four-digit count is to count **GM presets**:
GeneralUser GS alone has 261 presets, FluidR3 about 189 and MuseScore General
128+. Those are overlapping programs built from shared sample material. They
are playable presets, not 1000 new original instruments. They also require a
new preset browser and a separate licence/engineering review; the current app
imports a user-selected SF2 preset rather than bundling a 1000-preset catalog.

## Why not bulk-import 1000 packs now

1. **No eligible source set.** The free libraries do not contain 1000 distinct
   commercially redistributable instruments.
2. **Size.** At the current average of 2.8 MB per compact pack, 1000 packs would
   be about 2.8 GB before duplicates and larger source libraries. Full VCSL and
   VSCO material is already 7+ GB, before processing.
3. **Memory.** Decoded samples live in RAM at roughly 0.19 MB per stereo second.
   A large bank of packs is not the same as a streaming sample library.
4. **Architecture.** Every pack becomes one rack device (`rec_<id>`). A 1000-device
   catalog would make browsing, startup and project state unwieldy. A separate
   lazy-loaded preset browser would be the right product shape.
5. **Licence verification.** Every pack needs a source URL, licence, author,
   performer/provenance note and build recipe. Bulk downloading shifts the risk
   to the release, not away from it.
6. **Testing.** The existing browser probes verify sample decoding, key
   coverage, velocity layers, loops and rendered output. Testing 1000 packs is a
   content-ops project, not a one-session import.

## Batch 001 result

The approved first 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_001.md`](FREE_INSTRUMENT_BATCH_001.md). It adds five
VCSL, five VSCO 2 CE, five FreePats and five Karoryfer packs (25,470,525 bytes,
693 unique recordings), all CC0-1.0, with pinned sources, credits, generated
catalog entries and a browser probe.

## Batch 002 result

The second 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_002.md`](FREE_INSTRUMENT_BATCH_002.md). It adds five
VCSL, five VSCO 2 CE, five FreePats and five Karoryfer playable packs
(22,345,744 bytes, 607 unique recordings). Nineteen are CC0-1.0; the FreePats
MuldjordKit is CC-BY-4.0 and carries the required DrumGizmo.org credit. The
five VSCO entries are alternate articulations/timbres of the trumpet, flute,
organ, viola and timpani already represented in the catalog, so they add
playable devices but not five new distinct instruments.

The catalog after batch 002 had 92 packs: 84 CC0-1.0, three CC-BY-3.0, one
CC-BY-4.0 and four private `Custom`. Eighty-eight packs were redistributable,
and the policy test plus the second batch browser probe covered all 20 new
packs.

## Batch 003 result

The third 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_003.md`](FREE_INSTRUMENT_BATCH_003.md). It adds five
VCSL, five VSCO 2 CE, five FreePats and five Karoryfer playable packs
(26,393,638 bytes, 639 unique recordings), all CC0-1.0. The five VSCO entries
are one new GM-style percussion kit and four alternate articulation/timbre
programs for instruments already represented in the catalog, so they add
playable devices but only one new distinct instrument.

The catalog after batch 003 had 112 packs: 104 CC0-1.0, three CC-BY-3.0, one
CC-BY-4.0 and four private `Custom`. One hundred and eight packs were
redistributable, and the policy test plus the third batch browser probe covered
all 20 new packs.

## Batch 004 result

The fourth 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_004.md`](FREE_INSTRUMENT_BATCH_004.md). It adds five
VCSL, five VSCO 2 CE, five FreePats and five Karoryfer playable packs
(13,709,728 bytes, 419 unique recordings), all CC0-1.0. The five VSCO entries
are alternate staccato/spiccato articulations, and the two FreePats electric
guitars are alternate timbres, so the batch adds 13 new distinct playable
voices rather than 20 distinct instruments.

## Batch 005 result

The fifth 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_005.md`](FREE_INSTRUMENT_BATCH_005.md). It adds 16
VCSL packs and four FreePats packs (22,286,681 bytes, 344 unique recordings),
all CC0-1.0. Every entry is a distinct instrument or distinct synthesized voice:
17 recorded instruments plus a drawbar organ emulation, square lead and sweep
pad. No VSCO or Karoryfer alternates were used.

The catalog now has 152 packs: 144 CC0-1.0, three CC-BY-3.0, one CC-BY-4.0 and
four private `Custom`. One hundred and forty-eight packs are redistributable,
and the policy test plus the fifth batch browser probe cover all 20 new packs.

## Batch 006 result

The sixth 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_006.md`](FREE_INSTRUMENT_BATCH_006.md). It adds 20
VCSL packs (15,087,160 bytes, 208 unique recordings), all CC0-1.0 and
all distinct VCSL folders not represented by the earlier 38 VCSL packs. No
VSCO, FreePats or Karoryfer alternates were used.

The catalog now has 172 packs: 164 CC0-1.0, three CC-BY-3.0, one CC-BY-4.0 and
four private `Custom`. One hundred and sixty-eight packs are redistributable,
and the policy test plus the sixth batch browser probe cover all 20 new packs.

## Batch 007 result

The seventh 20-pack batch is implemented and documented in
[`FREE_INSTRUMENT_BATCH_007.md`](FREE_INSTRUMENT_BATCH_007.md). It adds 20
VCSL packs (21,193,065 bytes, 403 unique recordings), all CC0-1.0 and
all distinct VCSL folders not represented by the earlier 58 VCSL packs. No
VSCO, FreePats or Karoryfer alternates were used.

The catalog now has 192 packs: 184 CC0-1.0, three CC-BY-3.0, one CC-BY-4.0 and
four private `Custom`. One hundred and eighty-eight packs are redistributable,
and the policy test plus the seventh batch browser probe cover all 20 new packs.

## Recommended next batch

Do not attempt 1000. The next content pass should follow the same **10–20
instrument** process:

1. Pick only approved CC0/CC-BY sources.
2. Prefer instruments that fill real gaps: world percussion, brass/woodwind
   articulations, bowed strings, unusual plucked strings, and drum kits.
3. Run the converter with `--dry-run` first and record region/sample counts.
4. Keep each pack compact with `--max-layers`, `--max-rr`, `--key-step`,
   `--max-seconds` and `--keys`.
5. Add licence/credits, a reproducible recipe or pinned source, and a browser
   probe for at least one representative note or lane.
6. Run `npm run audit:share-package` after a share build.

Good candidates for the next pass from approved sources:

- VCSL instruments not already represented by the 58 implemented packs.
- VSCO 2 CE instruments and articulations not already represented by the
  current 41 devices; prefer new instruments over further alternates.
- FreePats CC0 banks that are not already in the catalog.
- Karoryfer CC0/CC-BY releases that are not already present.
- Freesound CC0 percussion only when a complete kit mapping can be justified.

## Decision for a 1000-instrument product

If 1000 **distinct instruments** is a real product requirement, it needs one of:

- commercial sample-library licences with explicit bundling rights;
- commissioned recordings;
- a content partnership with sample-library creators; or
- a deliberate decision to sell 1000 **presets/articulations**, not 1000 distinct
  instruments, with a preset browser and clear labelling.

The free sources can support a strong few-hundred-instrument library. They
cannot honestly support a claim of 1000 new original instruments.

## Evidence and follow-up

- Current pack policy: `shared/instruments/catalogTypes.ts`
- Share pruning: `scripts/prune-share-build-core.ts`
- Converter and licence rules: `scripts/instruments/README.md`
- Current credits: `public/instruments/CREDITS.md`
- Current index: `public/instruments/index.json`
- Existing G0/G4 status: `docs/G0_G4_ACCEPTANCE.md`

Next decision: approve a further 10–20 instrument batch from the approved
sources, or commission/licence a larger library for the four-digit target.
