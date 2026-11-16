# Free Instrument Batch 001

**Built:** 2026-11-14

**Result:** 20 new recorded instrument packs, all `CC0-1.0`, adding **25,470,525 bytes**
and **693 unique recordings** to the catalog. The catalog then contained 72 packs
(68 redistributable, 4 private `Custom`).

Every pack records its source revision, author/credit, licence and provenance in
`public/instruments/<id>/instrument.json`, `public/instruments/CREDITS.md` and
`shared/instruments/catalog.ts`. No private `Custom` packs or `D:\vsr` content was
used.

## The batch

| Pack | Source | Pinned revision | Attribution | Samples |
| --- | --- | --- | --- | ---: |
| VCSL Claves | `sgossner/VCSL` | `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` | Versilian Studios LLC (VCSL; performer not identified) | 6 |
| VCSL Darbuka | `sgossner/VCSL` | `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` | Versilian Studios LLC (VCSL; performer not identified) | 20 |
| VCSL Agogo Bells | `sgossner/VCSL` | `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` | Versilian Studios LLC (VCSL; performer not identified) | 5 |
| VCSL Kenyan Kalimba | `sgossner/VCSL` | `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` | Versilian Studios LLC (VCSL; performer not identified) | 15 |
| VCSL Woodblock | `sgossner/VCSL` | `c1ea7bcc3c7309650ab0da9d15c9cd1fbc4a4c7e` | Versilian Studios LLC (VCSL; performer not identified) | 10 |
| VSCO Marimba | `sgossner/VSCO-2-CE` | `6dd651d55dde97fd4028699be9d4481f26917891` | Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote | 10 |
| VSCO Upright Piano | `sgossner/VSCO-2-CE` | `6dd651d55dde97fd4028699be9d4481f26917891` | Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote | 24 |
| VSCO Loud Organ | `sgossner/VSCO-2-CE` | `6dd651d55dde97fd4028699be9d4481f26917891` | Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote | 21 |
| VSCO Muted French Horn | `sgossner/VSCO-2-CE` | `6dd651d55dde97fd4028699be9d4481f26917891` | Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote | 16 |
| VSCO Harmon-Muted Trumpet | `sgossner/VSCO-2-CE` | `6dd651d55dde97fd4028699be9d4481f26917891` | Sam Gossner and Simon Dalzell; Elan Hickler / Soundemote | 16 |
| FreePats Ukulele | `freepats/ukulele1` | `86d345f6f7b79a106ace98eca0da19b087786dba` | Mateusz Dąbrowski (recorded); FreePats | 15 |
| FreePats Spanish Classical Guitar | `freepats/spanish-classical-guitar` | `6f4eb1b092acc88f5448cea1a0001bd07b971af8` | Roberto (recorded and processed); FreePats | 25 |
| FreePats Hang in D Minor | `freepats/hang-D-minor` | `fdeca2ec981ab374607f250bccb1452b531ac13a` | Mar (performer); Gonzalo and Roberto (recording); FreePats | 18 |
| FreePats Francis Bacon Piano | `freepats/old-piano-FB` | `9707673c65d8a52d7b374af807384005564a89f2` | Piotr Barcz (recorded); Roberto (sound bank); FreePats | 40 |
| FreePats Glasses of Water | `freepats/glass` | `8b2fd2c0dfc334b6c16eaac418c8e73020be1105` | Roberto (recorded); FreePats | 22 |
| Karoryfer War Tuba | `sfzinstruments/karoryfer.war-tuba` | `5b62dd6ef6b00281bb734769e44a63f5e013018a` | Jakub Lewicki (tuba); Drogomir Smolken (recording and mapping); Karoryfer Samples | 108 |
| Karoryfer Weresax | `sfzinstruments/karoryfer.weresax` | `a4d756b21d2a573aca0d840cce7e71ba5effd4c6` | Karoryfer Samples | 128 |
| Karoryfer x bigcat Cello | `sfzinstruments/karoryfer-bigcat.cello` | `6fd75fbfc1dbb3109bf26220ba1adea46188a18b` | Kamila Borowiak (cello); Karoryfer x bigcat (library) | 52 |
| Karoryfer Body Percussion | `sfzinstruments/body_percussion` | `4ac9d8966679c648b62fa10a188179e186b97f24` | Karoryfer Samples | 88 |
| Karoryfer Cajon | `sfzinstruments/karoryfer.gogodze-phu-vol-i` | `7452f62060cd3a468c78bc361d96a4dfb30879c9` | Karoryfer Samples | 54 |

The VCSL pack IDs are `vcsl-claves`, `vcsl-darbuka`, `vcsl-agogo-bells`,
`vcsl-kalimba-kenya` and `vcsl-woodblock`. The VSCO, FreePats and Karoryfer
IDs follow the same lower-case naming (`vsco-marimba`, `freepats-ukulele`,
`karoryfer-war-tuba`, etc.).

## Build and verification

The five VCSL packs start with the official WAV recordings:

```bash
npm run fetch:instrument:vcsl-batch-001
npm run instrument -- recipe scripts/instruments/recipes/vcsl-claves.json
npm run instrument -- recipe scripts/instruments/recipes/vcsl-darbuka.json
npm run instrument -- recipe scripts/instruments/recipes/vcsl-agogo-bells.json
npm run instrument -- recipe scripts/instruments/recipes/vcsl-kalimba-kenya.json
npm run instrument -- recipe scripts/instruments/recipes/vcsl-woodblock.json
```

The VSCO, FreePats and Karoryfer packs are imported directly from their pinned
SFZ revisions with `npm run instrument -- sfz ...`; the exact source URLs,
attribution, provenance notes and limits are stored in each pack manifest.

Checks run:

- `npm test` — 380 passed, 2 skipped (Ollama not running), 0 failed.
- `npm run lint` — passed.
- `npm run test:browser-batch-001` — passed: 20/20 packs, 693/693 unique
  recordings decoded, all 20 played a mapped note with audible output
  (minimum RMS 0.0013). The probe checks the pinned CC0 metadata, generated
  credits, rack-device registration, complete sample sets and rendered audio.

G4 clean-machine/hardware validation remains separate and is not claimed by
this batch.
